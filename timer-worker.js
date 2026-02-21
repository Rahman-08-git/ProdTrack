// ===== Timer Web Worker =====
// Runs in background thread — not throttled when tab loses focus

let intervalId = null;
let seconds = 0;
let targetSeconds = 0;
let mode = 'pomodoro'; // 'pomodoro' | 'stopwatch'
let running = false;

self.onmessage = function (e) {
    const { action, data } = e.data;

    switch (action) {
        case 'start':
            mode = data.mode;
            if (mode === 'pomodoro') {
                seconds = data.remaining;
                targetSeconds = data.target;
            } else {
                seconds = data.elapsed || 0;
            }
            running = true;
            clearInterval(intervalId);
            intervalId = setInterval(() => {
                if (!running) return;
                if (mode === 'pomodoro') {
                    seconds--;
                    self.postMessage({ type: 'tick', remaining: seconds, elapsed: targetSeconds - seconds });
                    if (seconds <= 0) {
                        running = false;
                        clearInterval(intervalId);
                        self.postMessage({ type: 'complete', elapsed: targetSeconds });
                    }
                } else {
                    seconds++;
                    self.postMessage({ type: 'tick', elapsed: seconds });
                }
            }, 1000);
            break;

        case 'pause':
            running = false;
            clearInterval(intervalId);
            break;

        case 'reset':
            running = false;
            clearInterval(intervalId);
            seconds = 0;
            break;

        case 'status':
            self.postMessage({
                type: 'status',
                running,
                seconds,
                mode
            });
            break;
    }
};
