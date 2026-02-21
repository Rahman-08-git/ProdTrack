// ===== Timer Module =====
import { formatTime, getTodayStr, showToast } from './utils.js';

let worker = null;
let state = {
    mode: 'pomodoro',
    running: false,
    pomodoroDuration: 25 * 60,
    remaining: 25 * 60,
    elapsed: 0,
    sessionStart: null,
    linkedTaskId: null,
    linkedTaskText: null
};

let onSessionComplete = null;
let onTick = null;
let onRequestTaskSelect = null;  // callback to show task selection modal

export function initTimer(opts) {
    state.pomodoroDuration = opts.pomodoroDuration || 25 * 60;
    state.remaining = state.pomodoroDuration;
    onSessionComplete = opts.onSessionComplete;
    onTick = opts.onTick;
    onRequestTaskSelect = opts.onRequestTaskSelect;

    worker = new Worker(new URL('./timer-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = handleWorkerMessage;

    document.getElementById('mode-pomodoro').addEventListener('click', () => setMode('pomodoro'));
    document.getElementById('mode-stopwatch').addEventListener('click', () => setMode('stopwatch'));
    document.getElementById('timer-start').addEventListener('click', handleStartClick);
    document.getElementById('timer-reset').addEventListener('click', resetTimer);
    document.getElementById('pomodoro-duration').addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val > 0 && val <= 180 && !state.running) {
            state.pomodoroDuration = val * 60;
            state.remaining = state.pomodoroDuration;
            updateDisplay();
        }
    });

    updateDisplay();
    updateTaskLabel();
}

export function setPomodoroDuration(seconds) {
    state.pomodoroDuration = seconds;
    if (!state.running && state.mode === 'pomodoro') {
        state.remaining = seconds;
        updateDisplay();
    }
}

function setMode(mode) {
    if (state.running) return;
    state.mode = mode;
    state.elapsed = 0;

    document.getElementById('mode-pomodoro').classList.toggle('active', mode === 'pomodoro');
    document.getElementById('mode-stopwatch').classList.toggle('active', mode === 'stopwatch');

    const settings = document.getElementById('pomodoro-settings');
    settings.style.display = mode === 'pomodoro' ? 'flex' : 'none';

    if (mode === 'pomodoro') {
        state.remaining = state.pomodoroDuration;
    }

    updateDisplay();
}

function handleStartClick() {
    if (state.running) {
        pauseTimer();
    } else {
        // If not yet started (no sessionStart), ask which task
        if (!state.sessionStart && onRequestTaskSelect) {
            onRequestTaskSelect();
        } else {
            // Resuming from pause — just start without asking again
            startTimer();
        }
    }
}

// Called externally from main.js after user picks a task
export function startWithTask(taskId, taskText) {
    state.linkedTaskId = taskId;
    state.linkedTaskText = taskText;
    updateTaskLabel();
    startTimer();
}

function startTimer() {
    state.running = true;
    state.sessionStart = state.sessionStart || Date.now();

    const btn = document.getElementById('timer-start');
    btn.textContent = 'Pause';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');

    worker.postMessage({
        action: 'start',
        data: {
            mode: state.mode,
            remaining: state.remaining,
            target: state.pomodoroDuration,
            elapsed: state.elapsed
        }
    });
}

function pauseTimer() {
    state.running = false;

    const btn = document.getElementById('timer-start');
    btn.textContent = 'Resume';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');

    worker.postMessage({ action: 'pause' });

    if (state.mode === 'stopwatch' && state.elapsed > 0) {
        logSession();
    }
}

function resetTimer() {
    state.running = false;

    if (state.mode === 'stopwatch' && state.elapsed > 0) {
        logSession();
    }

    state.elapsed = 0;
    state.sessionStart = null;
    state.linkedTaskId = null;
    state.linkedTaskText = null;

    worker.postMessage({ action: 'reset' });

    const btn = document.getElementById('timer-start');
    btn.textContent = 'Start';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');

    if (state.mode === 'pomodoro') {
        state.remaining = state.pomodoroDuration;
    }

    updateDisplay();
    updateTaskLabel();
}

function logSession() {
    if (state.elapsed < 1) return;

    if (onSessionComplete) {
        onSessionComplete({
            date: getTodayStr(),
            duration: state.elapsed,
            type: state.mode,
            timestamp: Date.now(),
            taskId: state.linkedTaskId || null,
            taskText: state.linkedTaskText || null
        });
    }
}

function handleWorkerMessage(e) {
    const msg = e.data;

    switch (msg.type) {
        case 'tick':
            if (state.mode === 'pomodoro') {
                state.remaining = msg.remaining;
                state.elapsed = msg.elapsed;
            } else {
                state.elapsed = msg.elapsed;
            }
            updateDisplay();
            if (onTick) onTick(state);
            break;

        case 'complete':
            state.running = false;
            state.elapsed = msg.elapsed;
            state.remaining = 0;

            logSession();

            const btn = document.getElementById('timer-start');
            btn.textContent = 'Start';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');

            const taskNote = state.linkedTaskText ? ` on "${state.linkedTaskText}"` : '';
            showToast(`🎉 Pomodoro complete! ${Math.round(msg.elapsed / 60)} min logged${taskNote}.`, 'success');

            state.elapsed = 0;
            state.remaining = state.pomodoroDuration;
            state.sessionStart = null;
            state.linkedTaskId = null;
            state.linkedTaskText = null;
            updateDisplay();
            updateTaskLabel();
            break;
    }
}

function updateDisplay() {
    const display = document.getElementById('timer-display');
    const ring = document.getElementById('timer-ring-progress');
    const circumference = 2 * Math.PI * 90;

    if (state.mode === 'pomodoro') {
        display.textContent = formatTime(Math.max(0, state.remaining));
        const progress = 1 - (state.remaining / state.pomodoroDuration);
        ring.style.strokeDashoffset = circumference * (1 - progress);
    } else {
        display.textContent = formatTime(state.elapsed);
        const progress = Math.min(state.elapsed / 3600, 1);
        ring.style.strokeDashoffset = circumference * (1 - progress);
    }
}

function updateTaskLabel() {
    const label = document.getElementById('timer-task-label');
    if (state.linkedTaskText) {
        label.innerHTML = `Working on: <strong>${escapeHtml(state.linkedTaskText)}</strong>`;
    } else {
        label.textContent = '';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function getTimerState() {
    return { ...state };
}
