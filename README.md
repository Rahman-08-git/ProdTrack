# ⚡ ProdTrack — Productivity Tracker

ProdTrack is a premium, minimalist productivity companion designed to help you organize tasks, manage your time, and gain deep visual insights into your work patterns. It features a modern, responsive user interface with rich aesthetics, sleek styling, and fluid interactions.

---

## 🚀 Features

### 📅 Home Dashboard
- **Dual-Mode Timer**: Switch seamlessly between a structured **Pomodoro** timer (with customizable durations) and a free-running **Stopwatch** to fit your tracking style.
- **Task-Linked Tracking**: Associate your active timer directly with a specific task so that every minute logged is attributed correctly.
- **Today's Tasks**: Quick checklist to create, complete, and track tasks for the day.
- **Manual Logging**: Log hours and minutes manually if you forgot to run the timer, optionally linking it to tasks and choosing the date.
- **Activity Heatmap**: A GitHub-style calendar contribution grid that visualizes your work density and productivity over time.
- **Quick Statistics**: See your total hours worked Today, This Month, and Lifetime at a glance.

### 📊 Analytics
- **Time per Task**: A breakdown visualizer showing how much time you've dedicated to each of your different tasks.
- **Daily Progress Chart**: An interactive line chart displaying hours worked per day using Chart.js.
- **Task History**: Table tracking task completion counts and hours worked day by day.
- **Session Log**: A granular log of all your logged work sessions, including durations, types, and links to tasks, with the ability to edit or delete individual sessions.

### 🔄 Data & Sync
- **Google Authentication & Cloud Sync**: Sign in with Google to synchronize your tasks, sessions, and settings automatically with Firebase Firestore.
- **Offline-First Resilience**: Full offline support using Firestore's IndexedDB persistence. Your data is stored locally first and automatically synchronized when you get back online.
- **Manual Import & Export**: Export your entire application state as a JSON file or import it back to transfer data between devices without signing in.

---

## 🛠️ Tech Stack

- **Frontend Build Tool**: [Vite](https://vitejs.dev/)
- **Logic**: Vanilla JavaScript (ES Modules)
- **Styling**: Vanilla CSS (CSS Variables, Glassmorphism, Responsive Grid)
- **Backend & Authentication**: [Firebase](https://firebase.google.com/) (Auth & Firestore)
- **Data Visualization**: [Chart.js](https://www.chartjs.org/)
- **Icons & Fonts**: Google Fonts (Inter) and inline custom SVGs

---

## 🏁 Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Rahman-08-git/ProdTrack.git
   cd ProdTrack
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. **Build for Production:**
   ```bash
   npm run build
   ```
   This will output optimized, static assets into the `dist/` directory.

5. **Preview the Production Build:**
   ```bash
   npm run preview
   ```

---

## 📁 File Structure

```text
├── .github/              # GitHub configurations (e.g., CI/CD or Pages deployment)
├── dist/                 # Production build output (generated after build)
├── node_modules/         # Node packages
├── index.html            # Main application entry point & UI structure
├── main.js               # Application coordinator (routing, tabs, page setup)
├── style.css             # Main styling stylesheet (design system, variables, layouts)
├── timer.js              # Timer state, dual-mode (Pomodoro/Stopwatch) handling, background workers
├── timer-worker.js       # Web Worker for background timer calculations
├── tasks.js              # Task list controller & modal management
├── analytics.js          # Analytics page data calculations and Chart.js integration
├── firebase.js           # Firebase app initializing, auth, cloud sync, and offline persistence
├── storage.js            # Storage abstraction layer (LocalStorage fallback)
├── utils.js              # Time formatting, elements selectors, and helper functions
├── firebase.json         # Firebase project configuration
├── firestore.rules       # Firebase Firestore security rules
├── package.json          # Dependency and script definitions
└── README.md             # This readme documentation
```

---

## 🛡️ Security Rules

The application uses standard Firestore Security Rules to ensure that authenticated users can only read and write their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
