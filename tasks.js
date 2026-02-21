// ===== Tasks Module =====
import { generateId, getTodayStr } from './utils.js';

let tasks = {};
let onChange = null;

export function initTasks(initialTasks, onChangeCallback) {
    tasks = initialTasks || {};
    onChange = onChangeCallback;
    renderTasks();

    document.getElementById('task-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('task-input');
        const text = input.value.trim();
        if (!text) return;
        addTask(text);
        input.value = '';
    });
}

function addTask(text) {
    const today = getTodayStr();
    if (!tasks[today]) tasks[today] = [];
    tasks[today].push({
        id: generateId(),
        text,
        done: false,
        createdAt: Date.now()
    });
    renderTasks();
    if (onChange) onChange(tasks);
}

function toggleTask(date, id) {
    const dayTasks = tasks[date];
    if (!dayTasks) return;
    const task = dayTasks.find(t => t.id === id);
    if (task) {
        task.done = !task.done;
        renderTasks();
        if (onChange) onChange(tasks);
    }
}

function deleteTask(date, id) {
    if (!tasks[date]) return;
    tasks[date] = tasks[date].filter(t => t.id !== id);
    if (tasks[date].length === 0) delete tasks[date];
    renderTasks();
    if (onChange) onChange(tasks);
}

function renderTasks() {
    const today = getTodayStr();
    const todayTasks = tasks[today] || [];
    const list = document.getElementById('task-list');
    const counter = document.getElementById('task-count');

    const completed = todayTasks.filter(t => t.done).length;
    counter.textContent = `${completed}/${todayTasks.length}`;

    if (todayTasks.length === 0) {
        list.innerHTML = '<li class="empty-state">No tasks yet. Add one above!</li>';
        return;
    }

    list.innerHTML = todayTasks.map(task => `
    <li class="task-item ${task.done ? 'done' : ''}" data-id="${task.id}">
      <input type="checkbox" ${task.done ? 'checked' : ''} />
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="task-delete" title="Delete">✕</button>
    </li>
  `).join('');

    // Bind events
    list.querySelectorAll('.task-item').forEach(item => {
        const id = item.dataset.id;
        item.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleTask(today, id));
        item.querySelector('.task-delete').addEventListener('click', () => deleteTask(today, id));
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function getTasks() {
    return tasks;
}

export function setTasks(newTasks) {
    tasks = newTasks;
    renderTasks();
}
