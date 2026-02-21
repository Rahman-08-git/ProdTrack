// ===== Storage Module =====
// All data persisted in localStorage under 'prodtrack_data'

const STORAGE_KEY = 'prodtrack_data';

function getDefaultData() {
    return {
        tasks: {},      // { "2026-02-21": [{ id, text, done, createdAt }] }
        sessions: [],   // [{ date, duration (seconds), type: "pomodoro"|"stopwatch", timestamp }]
        settings: {
            pomodoroDuration: 25 * 60  // seconds
        }
    };
}

export function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return getDefaultData();
        const data = JSON.parse(raw);
        // Ensure all keys exist
        return {
            tasks: data.tasks || {},
            sessions: data.sessions || [],
            settings: { ...getDefaultData().settings, ...(data.settings || {}) }
        };
    } catch {
        return getDefaultData();
    }
}

export function saveData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save data:', e);
    }
}

export function exportData(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prodtrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                // Merge: combine tasks and sessions, take latest settings
                const current = loadData();

                // Merge tasks by date
                const mergedTasks = { ...current.tasks };
                for (const date of Object.keys(imported.tasks || {})) {
                    if (!mergedTasks[date]) {
                        mergedTasks[date] = imported.tasks[date];
                    } else {
                        const existingIds = new Set(mergedTasks[date].map(t => t.id));
                        for (const task of imported.tasks[date]) {
                            if (!existingIds.has(task.id)) {
                                mergedTasks[date].push(task);
                            }
                        }
                    }
                }

                // Merge sessions (avoid duplicates by timestamp)
                const existingTimestamps = new Set(current.sessions.map(s => s.timestamp));
                const mergedSessions = [...current.sessions];
                for (const session of (imported.sessions || [])) {
                    if (!existingTimestamps.has(session.timestamp)) {
                        mergedSessions.push(session);
                    }
                }

                const mergedData = {
                    tasks: mergedTasks,
                    sessions: mergedSessions,
                    settings: { ...current.settings, ...(imported.settings || {}) }
                };

                saveData(mergedData);
                resolve(mergedData);
            } catch {
                reject(new Error('Invalid file format'));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}
