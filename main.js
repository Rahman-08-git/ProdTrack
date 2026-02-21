// ===== ProdTrack Main Entry =====
import './style.css';
import { loadData, saveData, exportData, importData } from './storage.js';
import { formatHoursMinutes, getSecondsForDate, getSecondsForMonth, getTotalSeconds, getTodayStr, showToast } from './utils.js';
import { initTimer, startWithTask, getTimerState } from './timer.js';
import { initTasks, getTasks, setTasks } from './tasks.js';
import { initHeatmap, updateHeatmap } from './heatmap.js';
import { initAnalytics, updateAnalytics } from './analytics.js';

// ===== App State =====
let data = loadData();

// ===== Initialize =====
function init() {
    setupRouting();
    setupSync();
    setupTaskSelectModal();

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

    // "No task" button — start without linking
    noneBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        selectedTaskForTimer = null;
        startWithTask(null, null);
    });

    // Confirm with selected task
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
        // Show incomplete tasks first, then completed
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
            setTasks(data.tasks);
            updateStats();
            updateHeatmap(data.sessions);
            updateAnalytics(data.sessions, data.tasks);
            showToast('Data imported and merged!', 'success');
            modal.classList.remove('show');
        } catch (err) {
            showToast(err.message, 'error');
        }

        fileInput.value = '';
    });
}

// ===== Save =====
function save() {
    saveData(data);
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
