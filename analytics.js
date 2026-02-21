// ===== Analytics Module =====
import { getMonthName, getDaysInMonth, getSecondsForDate, getDateStr, formatHoursMinutes, getTodayStr } from './utils.js';

let chart = null;
let sessions = [];
let tasks = {};
let selectedYear, selectedMonth;
let onSessionChangeCb = null;
let onTaskChangeCb = null;

export function initAnalytics(sessionData, taskData, onSessionChange, onTaskChange) {
    sessions = sessionData;
    tasks = taskData;
    onSessionChangeCb = onSessionChange || null;
    onTaskChangeCb = onTaskChange || null;

    const now = new Date();
    selectedYear = now.getFullYear();
    selectedMonth = now.getMonth();

    const monthInput = document.getElementById('analytics-month');
    monthInput.value = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    monthInput.addEventListener('change', (e) => {
        const [y, m] = e.target.value.split('-').map(Number);
        selectedYear = y;
        selectedMonth = m - 1;
        render();
    });

    render();
}

export function updateAnalytics(sessionData, taskData) {
    sessions = sessionData;
    tasks = taskData;
    render();
}

function render() {
    renderTaskAnalytics();
    renderChart();
    renderTaskTable();
    renderSessionLog();
}

// ===== Per-Task Time Analytics =====
function renderTaskAnalytics() {
    const grid = document.getElementById('task-time-grid');
    const today = getTodayStr();
    const now = new Date();
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // Collect all unique tasks that have sessions
    const taskMap = {}; // taskId -> { text, todaySeconds, monthSeconds, totalSeconds }

    for (const s of sessions) {
        if (!s.taskId) continue;
        if (!taskMap[s.taskId]) {
            taskMap[s.taskId] = {
                text: s.taskText || 'Untitled',
                todaySeconds: 0,
                monthSeconds: 0,
                totalSeconds: 0
            };
        }
        const entry = taskMap[s.taskId];
        entry.totalSeconds += s.duration || 0;
        if (s.date === today) {
            entry.todaySeconds += s.duration || 0;
        }
        if (s.date.startsWith(monthPrefix)) {
            entry.monthSeconds += s.duration || 0;
        }
    }

    const entries = Object.values(taskMap);

    if (entries.length === 0) {
        grid.innerHTML = '<div class="empty-state">No task-linked sessions yet. Start a timer and link it to a task!</div>';
        return;
    }

    // Sort by total time desc
    entries.sort((a, b) => b.totalSeconds - a.totalSeconds);

    grid.innerHTML = entries.map(t => `
    <div class="task-time-card">
      <div class="ttc-name" title="${escapeHtml(t.text)}">${escapeHtml(t.text)}</div>
      <div class="ttc-stats">
        <span>
          <span class="ttc-value">${formatHoursMinutes(t.todaySeconds)}</span>
          Today
        </span>
        <span>
          <span class="ttc-value">${formatHoursMinutes(t.monthSeconds)}</span>
          ${getMonthName(selectedMonth).slice(0, 3)}
        </span>
        <span>
          <span class="ttc-value">${formatHoursMinutes(t.totalSeconds)}</span>
          Total
        </span>
      </div>
    </div>
  `).join('');
}

// ===== Bar Chart =====
let chartBars = []; // stored for hover detection
let chartListenersAttached = false;

function renderChart() {
    const canvas = document.getElementById('hours-chart');
    const ctx = canvas.getContext('2d');

    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const data = [];
    let maxHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth, day);
        const dateStr = getDateStr(date);
        const seconds = getSecondsForDate(sessions, dateStr);
        const hours = seconds / 3600;
        data.push({ day, hours, seconds, dateStr });
        if (hours > maxHours) maxHours = hours;
    }

    const padLeft = 40;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 32;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const yMax = maxHours > 0 ? Math.ceil(maxHours) : 4;
    const barW = Math.max(4, (chartW / daysInMonth) - 2);
    const gap = (chartW - barW * daysInMonth) / (daysInMonth + 1);

    // Y-axis grid
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#666666';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';

    const ySteps = Math.min(yMax, 5);
    for (let i = 0; i <= ySteps; i++) {
        const y = padTop + chartH - (i / ySteps) * chartH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(W - padRight, y);
        ctx.stroke();
        ctx.fillText(`${((i / ySteps) * yMax).toFixed(0)}h`, padLeft - 6, y + 4);
    }

    // Draw bars and store positions
    chartBars = [];
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
        const x = padLeft + gap + i * (barW + gap);
        const barH = yMax > 0 ? (d.hours / yMax) * chartH : 0;
        const y = padTop + chartH - barH;

        // Store bar rect for hover detection
        chartBars.push({ x, y, w: barW, h: barH, day: d.day, seconds: d.seconds, hours: d.hours, dateStr: d.dateStr });

        // B&W gradient bar
        const gradient = ctx.createLinearGradient(x, y, x, padTop + chartH);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#666666');
        ctx.fillStyle = barH > 0 ? gradient : 'transparent';

        // Draw bar with rounded top
        if (barH > 0) {
            const r = Math.min(2, barH / 2);
            ctx.beginPath();
            ctx.moveTo(x, y + r);
            ctx.arcTo(x, y, x + barW, y, r);
            ctx.arcTo(x + barW, y, x + barW, y + barH, r);
            ctx.lineTo(x + barW, padTop + chartH);
            ctx.lineTo(x, padTop + chartH);
            ctx.closePath();
            ctx.fill();
        }

        // X label
        if (daysInMonth <= 15 || d.day % 2 === 1) {
            ctx.fillStyle = '#666666';
            ctx.fillText(d.day.toString(), x + barW / 2, H - padBottom + 16);
        }
    });

    // Attach hover listeners once
    if (!chartListenersAttached) {
        chartListenersAttached = true;

        canvas.addEventListener('mousemove', (e) => {
            const canvasRect = canvas.getBoundingClientRect();
            const mx = e.clientX - canvasRect.left;
            const my = e.clientY - canvasRect.top;

            const hoveredBar = chartBars.find(b =>
                mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h && b.h > 0
            );

            // Expand hit zone to full column height for better UX
            const hitBar = hoveredBar || chartBars.find(b =>
                mx >= b.x && mx <= b.x + b.w && b.seconds > 0
            );

            if (hitBar) {
                canvas.style.cursor = 'pointer';
                drawChartWithTooltip(hitBar, mx, my);
            } else {
                canvas.style.cursor = 'default';
                renderChart();
            }
        });

        canvas.addEventListener('mouseleave', () => {
            canvas.style.cursor = 'default';
            // Don't re-render here to avoid flash loops
        });
    }
}

function drawChartWithTooltip(bar, mx, my) {
    const canvas = document.getElementById('hours-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    // Redraw chart base (without re-attaching listeners)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const daysInMonth = chartBars.length;
    const padLeft = 40;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 32;
    const chartH = H - padTop - padBottom;

    let maxHours = 0;
    chartBars.forEach(b => { if (b.hours > maxHours) maxHours = b.hours; });
    const yMax = maxHours > 0 ? Math.ceil(maxHours) : 4;
    const ySteps = Math.min(yMax, 5);

    // Y-axis grid
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#666666';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
        const y = padTop + chartH - (i / ySteps) * chartH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(W - padRight, y);
        ctx.stroke();
        ctx.fillText(`${((i / ySteps) * yMax).toFixed(0)}h`, padLeft - 6, y + 4);
    }

    // Draw bars
    ctx.textAlign = 'center';
    chartBars.forEach((d) => {
        const isHovered = d === bar;
        const gradient = ctx.createLinearGradient(d.x, d.y, d.x, padTop + chartH);
        if (isHovered) {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#aaaaaa');
        } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#666666');
        }
        ctx.fillStyle = d.h > 0 ? gradient : 'transparent';

        if (d.h > 0) {
            const r = Math.min(2, d.h / 2);
            ctx.beginPath();
            ctx.moveTo(d.x, d.y + r);
            ctx.arcTo(d.x, d.y, d.x + d.w, d.y, r);
            ctx.arcTo(d.x + d.w, d.y, d.x + d.w, d.y + d.h, r);
            ctx.lineTo(d.x + d.w, padTop + chartH);
            ctx.lineTo(d.x, padTop + chartH);
            ctx.closePath();
            ctx.fill();
        }

        if (daysInMonth <= 15 || d.day % 2 === 1) {
            ctx.fillStyle = '#666666';
            ctx.fillText(d.day.toString(), d.x + d.w / 2, H - padBottom + 16);
        }
    });

    // Draw tooltip
    const label = `${getMonthName(selectedMonth).slice(0, 3)} ${bar.day}: ${formatHoursMinutes(bar.seconds)}`;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    const metrics = ctx.measureText(label);
    const tipW = metrics.width + 16;
    const tipH = 26;

    // Position tooltip above the bar, centered on bar
    let tipX = bar.x + bar.w / 2 - tipW / 2;
    let tipY = bar.y - tipH - 8;
    if (tipY < 4) tipY = bar.y + bar.h + 8;
    if (tipX < 4) tipX = 4;
    if (tipX + tipW > W - 4) tipX = W - tipW - 4;

    // Tooltip background
    ctx.fillStyle = '#1c1f2e';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    const tr = 4;
    ctx.beginPath();
    ctx.moveTo(tipX + tr, tipY);
    ctx.lineTo(tipX + tipW - tr, tipY);
    ctx.arcTo(tipX + tipW, tipY, tipX + tipW, tipY + tipH, tr);
    ctx.arcTo(tipX + tipW, tipY + tipH, tipX, tipY + tipH, tr);
    ctx.arcTo(tipX, tipY + tipH, tipX, tipY, tr);
    ctx.arcTo(tipX, tipY, tipX + tipW, tipY, tr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tooltip text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, tipX + tipW / 2, tipY + tipH / 2 + 4);
}

// ===== Task History Table =====
function renderTaskTable() {
    const tbody = document.getElementById('task-history-body');
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const rows = [];

    for (let day = daysInMonth; day >= 1; day--) {
        const date = new Date(selectedYear, selectedMonth, day);
        const dateStr = getDateStr(date);
        const dayTasks = tasks[dateStr] || [];
        const seconds = getSecondsForDate(sessions, dateStr);

        if (dayTasks.length === 0 && seconds === 0) continue;

        const completedTasks = dayTasks.filter(t => t.done);
        const incompleteTasks = dayTasks.filter(t => !t.done);
        const sorted = [...completedTasks, ...incompleteTasks];

        const taskPills = sorted.map(t => {
            const cls = t.done ? 'task-pill editable' : 'task-pill incomplete editable';
            return `<span class="${cls}" data-date="${dateStr}" data-id="${t.id}" title="Click to toggle · Right-click to delete">${escapeHtml(t.text)}</span>`;
        }).join('') || '<span style="color: var(--text-muted)">—</span>';

        const displayDate = `${getMonthName(selectedMonth).slice(0, 3)} ${day}, ${selectedYear}`;

        rows.push(`
      <tr>
        <td>${displayDate}</td>
        <td><div class="task-pills">${taskPills}</div></td>
        <td>${formatHoursMinutes(seconds)}</td>
      </tr>
    `);
    }

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No activity data for ${getMonthName(selectedMonth)} ${selectedYear}</td></tr>`;
    } else {
        tbody.innerHTML = rows.join('');
    }

    // Attach click handlers to editable pills
    tbody.querySelectorAll('.task-pill.editable').forEach(pill => {
        // Left click: toggle done/undone
        pill.addEventListener('click', () => {
            const dateStr = pill.dataset.date;
            const taskId = pill.dataset.id;
            const dayTasks = tasks[dateStr] || [];
            const task = dayTasks.find(t => t.id === taskId);
            if (task) {
                task.done = !task.done;
                if (onTaskChangeCb) onTaskChangeCb();
                render();
            }
        });

        // Right click: delete task
        pill.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const dateStr = pill.dataset.date;
            const taskId = pill.dataset.id;
            if (!tasks[dateStr]) return;
            tasks[dateStr] = tasks[dateStr].filter(t => t.id !== taskId);
            if (onTaskChangeCb) onTaskChangeCb();
            render();
        });
    });
}

// ===== Session Log =====
function renderSessionLog() {
    const tbody = document.getElementById('session-log-body');
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // Filter sessions for the selected month, sorted newest first
    const monthSessions = sessions
        .map((s, i) => ({ ...s, _index: i }))
        .filter(s => s.date && s.date.startsWith(monthPrefix))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (monthSessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No sessions for ${getMonthName(selectedMonth)} ${selectedYear}</td></tr>`;
        return;
    }

    tbody.innerHTML = monthSessions.map(s => {
        const h = Math.floor((s.duration || 0) / 3600);
        const m = Math.floor(((s.duration || 0) % 3600) / 60);
        const type = s.type === 'manual' ? 'Manual' : s.type === 'stopwatch' ? 'Stopwatch' : 'Pomodoro';
        const taskLabel = s.taskText ? escapeHtml(s.taskText) : '<span style="color:var(--text-muted)">—</span>';

        return `
      <tr data-session-idx="${s._index}">
        <td>${s.date}</td>
        <td>${formatHoursMinutes(s.duration || 0)}</td>
        <td>${type}</td>
        <td>${taskLabel}</td>
        <td>
          <div class="session-actions">
            <button class="btn-edit" data-idx="${s._index}" data-h="${h}" data-m="${m}">Edit</button>
            <button class="btn-delete" data-idx="${s._index}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    // Attach edit buttons
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const h = parseInt(btn.dataset.h, 10);
            const m = parseInt(btn.dataset.m, 10);
            const tr = btn.closest('tr');
            const durationTd = tr.children[1];
            const actionsTd = tr.children[4];

            // Replace duration cell with inputs
            durationTd.innerHTML = `
              <div class="session-edit-inputs">
                <input type="number" class="edit-h" value="${h}" min="0" max="23" />
                <span>h</span>
                <input type="number" class="edit-m" value="${m}" min="0" max="59" />
                <span>m</span>
              </div>
            `;

            // Replace actions with Save/Cancel
            actionsTd.innerHTML = `
              <div class="session-actions">
                <button class="btn-save">Save</button>
                <button class="btn-cancel">Cancel</button>
              </div>
            `;

            actionsTd.querySelector('.btn-save').addEventListener('click', () => {
                const newH = parseInt(durationTd.querySelector('.edit-h').value, 10) || 0;
                const newM = parseInt(durationTd.querySelector('.edit-m').value, 10) || 0;
                const newDuration = (newH * 3600) + (newM * 60);
                if (newDuration <= 0) return;
                sessions[idx].duration = newDuration;
                if (onSessionChangeCb) onSessionChangeCb('edit', idx);
                render();
            });

            actionsTd.querySelector('.btn-cancel').addEventListener('click', () => {
                render();
            });
        });
    });

    // Attach delete buttons
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            sessions.splice(idx, 1);
            if (onSessionChangeCb) onSessionChangeCb('delete', idx);
            render();
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
