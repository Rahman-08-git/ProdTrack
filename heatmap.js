// ===== Heatmap Module =====
import { getMonthName, getDaysInMonth, getFirstDayOfMonth, getSecondsForDate, getDateStr, formatDuration } from './utils.js';

let currentYear, currentMonth;
let sessions = [];

export function initHeatmap(sessionData) {
    sessions = sessionData;
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();

    document.getElementById('heatmap-prev').addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        render();
    });

    document.getElementById('heatmap-next').addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        render();
    });

    render();
}

export function updateHeatmap(sessionData) {
    sessions = sessionData;
    render();
}

function render() {
    const label = document.getElementById('heatmap-month-label');
    label.textContent = `${getMonthName(currentMonth)} ${currentYear}`;

    const container = document.getElementById('heatmap-container');
    container.innerHTML = '';

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    // Day labels row
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayLabels.forEach(d => {
        const el = document.createElement('div');
        el.className = 'heatmap-day-label';
        el.textContent = d;
        container.appendChild(el);
    });

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'heatmap-cell empty';
        container.appendChild(el);
    }

    // Day cells
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dateStr = getDateStr(date);
        const seconds = getSecondsForDate(sessions, dateStr);
        const minutes = Math.floor(seconds / 60);

        const el = document.createElement('div');
        el.className = 'heatmap-cell';

        // Heat level: 0=none, 1=<30m, 2=<1h, 3=<2h, 4=2h+
        let level = 0;
        if (minutes > 0) level = 1;
        if (minutes >= 30) level = 2;
        if (minutes >= 60) level = 3;
        if (minutes >= 120) level = 4;

        el.style.background = `var(--heat-${level})`;

        // Tooltip
        const isToday = date.toDateString() === today.toDateString();
        const label = isToday ? 'Today' : `${getMonthName(currentMonth).slice(0, 3)} ${day}`;
        el.setAttribute('data-tooltip', `${label}: ${minutes > 0 ? formatDuration(seconds) : 'No activity'}`);

        container.appendChild(el);
    }
}
