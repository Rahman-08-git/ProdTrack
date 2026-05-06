// ===== ProdTrack Main Entry =====
import './style.css';
import { loadData, saveData, exportData, importData, getEmptyData } from './storage.js';
import { formatHoursMinutes, getSecondsForDate, getSecondsForMonth, getTotalSeconds, getTodayStr, showToast } from './utils.js';
import { initTimer, startWithTask, getTimerState } from './timer.js';
import { initTasks, getTasks, setTasks } from './tasks.js';
import { initHeatmap, updateHeatmap } from './heatmap.js';
import { initAnalytics, updateAnalytics } from './analytics.js';
import { initFirebase, isFirebaseConfigured, onAuthChange, signInWithGoogle, signOutUser, getCurrentUser, saveToCloud, loadFromCloud, waitForAuth } from './firebase.js';

// ===== App State =====
let data = getEmptyData();
let cloudSyncTimeout = null;
let currentUserId = null;
let isSyncing = false;

// ===== Initialize =====
async function init() {
    // 1. Initialize Firebase first
    const firebaseReady = initFirebase();

    // 2. Wait for auth state before loading data
    let initialUser = null;
    if (firebaseReady) {
        showLoadingOverlay(true);
        try {
            initialUser = await waitForAuth();
        } catch (e) {
            console.error('Auth check failed:', e);
        }
    }

    // 3. Load data based on auth state
    if (initialUser) {
        currentUserId = initialUser.uid;
        // Try loading from Firestore first (source of truth)
        try {
            const cloudData = await loadFromCloud(initialUser.uid);
            if (cloudData) {
                // Merge cloud data with any local data (in case user added data while offline)
                const localData = loadData();
                data = mergeData(cloudData, localData);
                // Cache the merged result locally
                saveData(data);
                // Push merged data back to cloud (in case local had new items)
                await saveToCloud(initialUser.uid, data).catch(() => {});
            } else {
                // No cloud data yet — use local data and push it to cloud
                data = loadData();
                try {
                    await saveToCloud(initialUser.uid, data);
                } catch (e) {
                    console.error('Initial cloud save failed:', e);
                    showToast('⚠️ Could not save to cloud. Check your connection.', 'error');
                }
            }
        } catch (e) {
            console.error('Cloud load failed, falling back to local:', e);
            data = loadData();
            showToast('⚠️ Could not load cloud data. Using local data.', 'error');
        }
    } else {
        // Not signed in — use local data (guest mode)
        data = loadData();
    }

    // 4. Now initialize all UI modules
    setupRouting();
    setupSync();
    setupTaskSelectModal();
    setupManualEntry();
    setupAuth(initialUser);

    // Init timer with task-selection callback
    initTimer({
        pomodoroDuration: data.settings.pomodoroDuration,
        onSessionComplete: handleSessionComplete,
        onTick: handleTimerTick,
        onRequestTaskSelect: showTaskSelectModal
    });

    document.getElementById('pomodoro-duration').value = Math.round(data.settings.pomodoroDuration / 60);

    // Init tasks
    initTasks(data.tasks, handleTasksChange);

    // Init heatmap
    initHeatmap(data.sessions);

    // Init analytics with session and task change callbacks
    initAnalytics(data.sessions, data.tasks, handleSessionChange, handleAnalyticsTaskChange);

    // Update stats
    updateStats();

    // Populate manual entry task dropdown
    refreshManualTaskDropdown();

    // Update sync status indicator
    updateSyncStatus(initialUser ? 'synced' : 'offline');

    // Hide loading overlay
    showLoadingOverlay(false);

    // 5. Flush pending syncs when user closes the tab
    window.addEventListener('beforeunload', () => {
        if (currentUserId && cloudSyncTimeout) {
            clearTimeout(cloudSyncTimeout);
            // Use sendBeacon or synchronous save as last resort
            const payload = JSON.stringify({
                tasks: JSON.stringify(data.tasks || {}),
                sessions: JSON.stringify(data.sessions || []),
                settings: JSON.stringify(data.settings || {}),
                updatedAt: Date.now()
            });
            // Save to localStorage as a safety net
            saveData(data);
        }
    });
}

// ===== Loading Overlay =====
function showLoadingOverlay(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.toggle('show', show);
    }
}

// ===== Sync Status Indicator =====
function updateSyncStatus(status) {
    // status: 'syncing' | 'synced' | 'error' | 'offline'
    const indicator = document.getElementById('sync-status');
    if (!indicator) return;

    indicator.className = 'sync-status';
    switch (status) {
        case 'syncing':
            indicator.innerHTML = '<span class="sync-dot syncing"></span> Syncing...';
            indicator.classList.add('syncing');
            break;
        case 'synced':
            indicator.innerHTML = '<span class="sync-dot synced"></span> Synced';
            indicator.classList.add('synced');
            break;
        case 'error':
            indicator.innerHTML = '<span class="sync-dot error"></span> Sync failed';
            indicator.classList.add('error');
            break;
        case 'offline':
            indicator.innerHTML = '<span class="sync-dot offline"></span> Local only';
            indicator.classList.add('offline');
            break;
    }
}

// ===== Auth =====
function setupAuth(initialUser) {
    const loginBtn = document.getElementById('auth-login-btn');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const userInfo = document.getElementById('auth-user-info');

    if (!isFirebaseConfigured()) {
        // Firebase not configured — hide auth UI
        loginBtn.style.display = 'none';
        return;
    }

    // If user was already signed in, update UI immediately
    if (initialUser) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'block';
        document.getElementById('auth-avatar').src = initialUser.photoURL || '';
        document.getElementById('auth-name').textContent = initialUser.displayName || initialUser.email || 'User';
    }

    loginBtn.addEventListener('click', async () => {
        try {
            await signInWithGoogle();
        } catch (e) {
            if (e.code === 'auth/popup-blocked') {
                showToast('Popup blocked. Please allow popups for this site.', 'error');
            } else if (e.code === 'auth/popup-closed-by-user') {
                // User closed popup, no error needed
            } else {
                showToast('Sign-in failed: ' + (e.message || 'Unknown error'), 'error');
            }
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await signOutUser();
        updateSyncStatus('offline');
        showToast('Signed out', 'success');
    });

    // Listen for auth state changes (handles sign-in/sign-out after initial load)
    onAuthChange(async (user) => {
        if (user) {
            currentUserId = user.uid;

            // Signed in
            loginBtn.style.display = 'none';
            userInfo.style.display = 'block';
            document.getElementById('auth-avatar').src = user.photoURL || '';
            document.getElementById('auth-name').textContent = user.displayName || user.email || 'User';

            // Load cloud data and use it as source of truth
            updateSyncStatus('syncing');
            try {
                const cloudData = await loadFromCloud(user.uid);
                if (cloudData) {
                    // Merge: cloud is primary, local fills gaps
                    data = mergeData(cloudData, data);
                    saveData(data);
                    refreshAll();
                    updateSyncStatus('synced');
                    showToast('Synced from cloud ☁️', 'success');
                } else {
                    // First time sign-in: push current local data to cloud
                    try {
                        await saveToCloud(user.uid, data);
                        updateSyncStatus('synced');
                        showToast('Data saved to cloud ☁️', 'success');
                    } catch (saveErr) {
                        updateSyncStatus('error');
                        showToast('⚠️ Failed to save data to cloud: ' + (saveErr.message || 'Permission denied'), 'error');
                    }
                }
            } catch (e) {
                console.error('Cloud sync error:', e);
                updateSyncStatus('error');
                showToast('⚠️ Cloud sync failed: ' + (e.message || 'Check Firestore rules'), 'error');
            }
        } else {
            // Signed out — keep data in memory for current session
            currentUserId = null;
            loginBtn.style.display = 'flex';
            userInfo.style.display = 'none';
            updateSyncStatus('offline');
        }
    });
}

// Merge two datasets (primary + secondary). Primary wins on conflicts.
function mergeData(primary, secondary) {
    const mergedTasks = { ...primary.tasks };
    for (const date of Object.keys(secondary.tasks || {})) {
        if (!mergedTasks[date]) {
            mergedTasks[date] = secondary.tasks[date];
        } else {
            const existingIds = new Set(mergedTasks[date].map(t => t.id));
            for (const task of secondary.tasks[date]) {
                if (!existingIds.has(task.id)) {
                    mergedTasks[date].push(task);
                }
            }
        }
    }

    const existingTimestamps = new Set(primary.sessions.map(s => s.timestamp));
    const mergedSessions = [...primary.sessions];
    for (const session of (secondary.sessions || [])) {
        if (!existingTimestamps.has(session.timestamp)) {
            mergedSessions.push(session);
        }
    }

    return {
        tasks: mergedTasks,
        sessions: mergedSessions,
        settings: { ...getEmptyData().settings, ...(primary.settings || {}), ...(secondary.settings || {}) }
    };
}

// ===== Cloud Sync =====

/**
 * Immediately save to Firestore (for critical operations like session completion).
 */
async function immediateCloudSync() {
    if (!isFirebaseConfigured() || !currentUserId) return;
    clearTimeout(cloudSyncTimeout); // Cancel any pending debounced sync
    updateSyncStatus('syncing');
    try {
        await saveToCloud(currentUserId, data);
        updateSyncStatus('synced');
    } catch (e) {
        console.error('Cloud sync failed:', e);
        updateSyncStatus('error');
        showToast('⚠️ Sync failed. Your data is saved locally.', 'error');
    }
}

/**
 * Schedule a debounced cloud save (for non-critical operations like task edits).
 * Falls back to immediate sync if the debounce period passes.
 */
function scheduleCloudSync() {
    if (!isFirebaseConfigured()) return;
    if (!currentUserId) return;

    clearTimeout(cloudSyncTimeout);
    updateSyncStatus('syncing');
    cloudSyncTimeout = setTimeout(async () => {
        try {
            await saveToCloud(currentUserId, data);
            updateSyncStatus('synced');
        } catch (e) {
            console.error('Cloud sync failed:', e);
            updateSyncStatus('error');
        }
    }, 1500); // 1.5s debounce
}

// ===== Routing =====
function setupRouting() {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(`tab-${tab}`).classList.add('active');

            if (tab === 'analytics') {
                updateAnalytics(data.sessions, data.tasks);
            }
        });
    });
}

// ===== Task Selection Modal =====
let selectedTaskForTimer = null;

function setupTaskSelectModal() {
    const modal = document.getElementById('task-select-modal');
    const closeBtn = document.getElementById('task-select-close');
    const confirmBtn = document.getElementById('task-select-confirm');
    const noneBtn = document.getElementById('task-select-none-btn');

    closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });

    noneBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        selectedTaskForTimer = null;
        startWithTask(null, null);
    });

    confirmBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        if (selectedTaskForTimer) {
            startWithTask(selectedTaskForTimer.id, selectedTaskForTimer.text);
        } else {
            startWithTask(null, null);
        }
    });
}

function showTaskSelectModal() {
    const modal = document.getElementById('task-select-modal');
    const list = document.getElementById('task-select-list');
    const today = getTodayStr();
    const todayTasks = data.tasks[today] || [];

    selectedTaskForTimer = null;

    if (todayTasks.length === 0) {
        list.innerHTML = '<li class="task-select-none">No tasks added today. You can start without a task.</li>';
    } else {
        const incomplete = todayTasks.filter(t => !t.done);
        const complete = todayTasks.filter(t => t.done);
        const sorted = [...incomplete, ...complete];

        list.innerHTML = sorted.map(t => `
      <li class="task-select-item" data-id="${t.id}" data-text="${escapeAttr(t.text)}">
        ${t.done ? '✓ ' : ''}${escapeHtml(t.text)}
      </li>
    `).join('');

        list.querySelectorAll('.task-select-item').forEach(item => {
            item.addEventListener('click', () => {
                list.querySelectorAll('.task-select-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedTaskForTimer = {
                    id: item.dataset.id,
                    text: item.dataset.text
                };
            });
        });
    }

    modal.classList.add('show');
}

// ===== Session Complete Handler =====
function handleSessionComplete(session) {
    data.sessions.push(session);

    const timerState = getTimerState();
    data.settings.pomodoroDuration = timerState.pomodoroDuration;

    // Session completion is critical — save immediately, not debounced
    saveData(data);
    immediateCloudSync();
    updateStats();
    updateHeatmap(data.sessions);
    updateAnalytics(data.sessions, data.tasks);
}

// ===== Timer Tick Handler =====
function handleTimerTick(timerState) {
    updateStatsWithLive(timerState);
}

// ===== Session Change Handler (edit/delete from analytics) =====
function handleSessionChange(action, idx) {
    // sessions array is already mutated by analytics.js
    save();
    updateStats();
    updateHeatmap(data.sessions);
}

// ===== Task Change Handler (toggle/delete from analytics) =====
function handleAnalyticsTaskChange() {
    // tasks object is already mutated by analytics.js
    save();
    setTasks(data.tasks); // refresh home tab task list
}

// ===== Tasks Change Handler =====
function handleTasksChange(updatedTasks) {
    data.tasks = updatedTasks;
    save();
    updateAnalytics(data.sessions, data.tasks);
    refreshManualTaskDropdown();
}

// ===== Manual Time Entry =====
function setupManualEntry() {
    const logBtn = document.getElementById('manual-log-btn');
    const dateInput = document.getElementById('manual-date');

    // Default to today
    dateInput.value = getTodayStr();

    logBtn.addEventListener('click', () => {
        const hours = parseInt(document.getElementById('manual-hours').value, 10) || 0;
        const minutes = parseInt(document.getElementById('manual-minutes').value, 10) || 0;
        const totalSeconds = (hours * 3600) + (minutes * 60);

        if (totalSeconds <= 0) {
            showToast('Enter at least 1 minute.', 'error');
            return;
        }

        const selectedDate = dateInput.value || getTodayStr();

        const select = document.getElementById('manual-task-select');
        const selectedOption = select.options[select.selectedIndex];
        const taskId = select.value || null;
        const taskText = taskId ? selectedOption.textContent : null;

        const session = {
            date: selectedDate,
            duration: totalSeconds,
            type: 'manual',
            timestamp: Date.now(),
            taskId: taskId,
            taskText: taskText
        };

        data.sessions.push(session);

        // Manual time logging is critical — save immediately
        saveData(data);
        immediateCloudSync();
        updateStats();
        updateHeatmap(data.sessions);
        updateAnalytics(data.sessions, data.tasks);

        // Reset inputs
        document.getElementById('manual-hours').value = 0;
        document.getElementById('manual-minutes').value = 0;
        dateInput.value = getTodayStr();
        select.selectedIndex = 0;

        const isToday = selectedDate === getTodayStr();
        const dateNote = isToday ? '' : ` for ${selectedDate}`;
        const taskNote = taskText ? ` on "${taskText}"` : '';
        showToast(`Logged ${hours}h ${minutes}m${taskNote}${dateNote}`, 'success');
    });
}

function refreshManualTaskDropdown() {
    const select = document.getElementById('manual-task-select');
    const today = getTodayStr();
    const todayTasks = data.tasks[today] || [];

    // Keep the "No task" option, rebuild the rest
    select.innerHTML = '<option value="">No task</option>';
    todayTasks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.text;
        select.appendChild(opt);
    });
}

// ===== Stats =====
function updateStats() {
    const today = getTodayStr();
    const now = new Date();

    const todaySeconds = getSecondsForDate(data.sessions, today);
    const monthSeconds = getSecondsForMonth(data.sessions, now.getFullYear(), now.getMonth());
    const totalSeconds = getTotalSeconds(data.sessions);

    document.getElementById('stat-today').textContent = formatHoursMinutes(todaySeconds);
    document.getElementById('stat-month').textContent = formatHoursMinutes(monthSeconds);
    document.getElementById('stat-lifetime').textContent = formatHoursMinutes(totalSeconds);
}

function updateStatsWithLive(timerState) {
    const today = getTodayStr();
    const now = new Date();

    const elapsed = timerState.elapsed || 0;

    const todaySeconds = getSecondsForDate(data.sessions, today) + elapsed;
    const monthSeconds = getSecondsForMonth(data.sessions, now.getFullYear(), now.getMonth()) + elapsed;
    const totalSeconds = getTotalSeconds(data.sessions) + elapsed;

    document.getElementById('stat-today').textContent = formatHoursMinutes(todaySeconds);
    document.getElementById('stat-month').textContent = formatHoursMinutes(monthSeconds);
    document.getElementById('stat-lifetime').textContent = formatHoursMinutes(totalSeconds);
}

// Refresh all UI components with current data
function refreshAll() {
    setTasks(data.tasks);
    updateStats();
    updateHeatmap(data.sessions);
    updateAnalytics(data.sessions, data.tasks);
}

// ===== Sync =====
function setupSync() {
    const modal = document.getElementById('sync-modal');
    const syncBtn = document.getElementById('sync-btn');
    const closeBtn = document.getElementById('sync-modal-close');
    const exportBtn = document.getElementById('sync-export');
    const importBtn = document.getElementById('sync-import');
    const fileInput = document.getElementById('sync-file-input');

    syncBtn.addEventListener('click', () => modal.classList.add('show'));
    closeBtn.addEventListener('click', () => modal.classList.remove('show'));

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });

    exportBtn.addEventListener('click', () => {
        exportData(data);
        showToast('Data exported successfully!', 'success');
    });

    importBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            data = await importData(file);
            refreshAll();
            // Import is critical — sync immediately
            immediateCloudSync();
            showToast('Data imported and merged!', 'success');
            modal.classList.remove('show');
        } catch (err) {
            showToast(err.message, 'error');
        }

        fileInput.value = '';
    });
}

// ===== Save (local + cloud) =====
function save() {
    saveData(data);
    scheduleCloudSync();
}

// ===== Pomodoro duration =====
document.getElementById('pomodoro-duration').addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val > 0 && val <= 180) {
        data.settings.pomodoroDuration = val * 60;
        save();
    }
});

// ===== Helpers =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
