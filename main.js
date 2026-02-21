// ===== ProdTrack Main Entry =====
import './style.css';
import { loadData, saveData, exportData, importData } from './storage.js';
import { formatHoursMinutes, getSecondsForDate, getSecondsForMonth, getTotalSeconds, getTodayStr, showToast } from './utils.js';
import { initTimer, startWithTask, getTimerState } from './timer.js';
import { initTasks, getTasks, setTasks } from './tasks.js';
import { initHeatmap, updateHeatmap } from './heatmap.js';
import { initAnalytics, updateAnalytics } from './analytics.js';
import { initFirebase, isFirebaseConfigured, onAuthChange, signInWithGoogle, signOutUser, getCurrentUser, saveToCloud, loadFromCloud } from './firebase.js';

// ===== App State =====
let data = loadData();
let cloudSyncTimeout = null;

// ===== Initialize =====
function init() {
    setupRouting();
    setupSync();
    setupTaskSelectModal();
    setupAuth();

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

    // Init analytics
    initAnalytics(data.sessions, data.tasks);

    // Update stats
    updateStats();
}

// ===== Auth =====
function setupAuth() {
    const configured = initFirebase();

    const loginBtn = document.getElementById('auth-login-btn');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const userInfo = document.getElementById('auth-user-info');

    if (!configured) {
        // Firebase not configured — hide auth UI
        loginBtn.style.display = 'none';
        return;
    }

    loginBtn.addEventListener('click', async () => {
        try {
            await signInWithGoogle();
        } catch (e) {
            showToast('Sign-in failed. Try again.', 'error');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await signOutUser();
        showToast('Signed out', 'success');
    });

    // Listen for auth state changes
    onAuthChange(async (user) => {
        if (user) {
            // Signed in
            loginBtn.style.display = 'none';
            userInfo.style.display = 'block';
            document.getElementById('auth-avatar').src = user.photoURL || '';
            document.getElementById('auth-name').textContent = user.displayName || user.email || 'User';

            // Load from cloud and merge with local
            try {
                const cloudData = await loadFromCloud(user.uid);
                if (cloudData) {
                    data = mergeData(data, cloudData);
                    saveData(data);
                    refreshAll();
                    showToast('Synced from cloud ☁️', 'success');
                } else {
                    // First time: push local data to cloud
                    await saveToCloud(user.uid, data);
                    showToast('Data saved to cloud ☁️', 'success');
                }
            } catch (e) {
                console.error('Cloud sync error:', e);
            }
        } else {
            // Signed out
            loginBtn.style.display = 'flex';
            userInfo.style.display = 'none';
        }
    });
}

// Merge local + cloud data (union of tasks and sessions)
function mergeData(local, cloud) {
    const mergedTasks = { ...local.tasks };
    for (const date of Object.keys(cloud.tasks || {})) {
        if (!mergedTasks[date]) {
            mergedTasks[date] = cloud.tasks[date];
        } else {
            const existingIds = new Set(mergedTasks[date].map(t => t.id));
            for (const task of cloud.tasks[date]) {
                if (!existingIds.has(task.id)) {
                    mergedTasks[date].push(task);
                }
            }
        }
    }

    const existingTimestamps = new Set(local.sessions.map(s => s.timestamp));
    const mergedSessions = [...local.sessions];
    for (const session of (cloud.sessions || [])) {
        if (!existingTimestamps.has(session.timestamp)) {
            mergedSessions.push(session);
        }
    }

    return {
        tasks: mergedTasks,
        sessions: mergedSessions,
        settings: { ...local.settings, ...(cloud.settings || {}) }
    };
}

// Schedule a debounced cloud save (avoids hammering Firestore on every keystroke)
function scheduleCloudSync() {
    if (!isFirebaseConfigured()) return;
    const user = getCurrentUser();
    if (!user) return;

    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(async () => {
        try {
            await saveToCloud(user.uid, data);
        } catch (e) {
            console.error('Cloud sync failed:', e);
        }
    }, 2000); // 2s debounce
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

    save();
    updateStats();
    updateHeatmap(data.sessions);
    updateAnalytics(data.sessions, data.tasks);
}

// ===== Timer Tick Handler =====
function handleTimerTick(timerState) {
    updateStatsWithLive(timerState);
}

// ===== Tasks Change Handler =====
function handleTasksChange(updatedTasks) {
    data.tasks = updatedTasks;
    save();
    updateAnalytics(data.sessions, data.tasks);
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
            scheduleCloudSync();
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
