// ===== Firebase Configuration =====
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDWNQKGBbD0SLbEfsNEqdJV5hfGW4dkSdI",
    authDomain: "prodtrack-57e6f.firebaseapp.com",
    projectId: "prodtrack-57e6f",
    storageBucket: "prodtrack-57e6f.firebasestorage.app",
    messagingSenderId: "495598159834",
    appId: "1:495598159834:web:cda80ff294e9724f90a2e3"
};

let app = null;
let auth = null;
let db = null;
let isConfigured = false;

function checkConfig() {
    return firebaseConfig.apiKey && firebaseConfig.apiKey.length > 0;
}

export function initFirebase() {
    if (!checkConfig()) {
        console.warn('Firebase not configured. Cloud sync disabled.');
        isConfigured = false;
        return false;
    }

    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        isConfigured = true;

        // Set auth persistence to LOCAL — survives browser restarts
        setPersistence(auth, browserLocalPersistence).catch(e => {
            console.warn('Auth persistence setup failed:', e);
        });

        // Enable Firestore offline persistence via IndexedDB.
        // This means writes go to a local IndexedDB cache first, then sync to
        // the server when online. Data survives browser restarts.
        enableIndexedDbPersistence(db).catch((err) => {
            if (err.code === 'failed-precondition') {
                // Multiple tabs open — offline persistence can only be enabled in one tab
                console.warn('Firestore offline persistence unavailable: multiple tabs open.');
            } else if (err.code === 'unimplemented') {
                // Browser doesn't support IndexedDB persistence
                console.warn('Firestore offline persistence not supported by this browser.');
            }
        });

        return true;
    } catch (e) {
        console.error('Firebase init failed:', e);
        isConfigured = false;
        return false;
    }
}

export function isFirebaseConfigured() {
    return isConfigured;
}

// ===== Auth =====

/**
 * Wait for Firebase Auth to resolve the initial auth state.
 * Returns the current user (or null) once determined.
 * This prevents the app from booting with empty data before
 * knowing if a user is signed in.
 */
export function waitForAuth() {
    if (!isConfigured) return Promise.resolve(null);
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); // Only need the first emission
            resolve(user);
        });
    });
}

export function onAuthChange(callback) {
    if (!isConfigured) return;
    onAuthStateChanged(auth, callback);
}

/**
 * Sign in with Google using Firebase's built-in signInWithPopup.
 * This is the most reliable method and handles token exchange internally.
 * Firebase persists the auth session in IndexedDB automatically.
 */
export async function signInWithGoogle() {
    if (!isConfigured) return null;

    try {
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (e) {
        // If popup is blocked, the error code will be 'auth/popup-blocked'
        console.error('Google sign-in failed:', e);
        throw e;
    }
}

export async function signOutUser() {
    if (!isConfigured) return;
    try {
        await signOut(auth);
    } catch (e) {
        console.error('Sign-out failed:', e);
    }
}

export function getCurrentUser() {
    if (!isConfigured) return null;
    return auth?.currentUser || null;
}

// ===== Firestore =====

/**
 * Save data to Firestore. Returns true on success, false on failure.
 * Throws on error so the caller can show feedback to the user.
 */
export async function saveToCloud(userId, data) {
    if (!isConfigured || !userId) return false;
    try {
        await setDoc(doc(db, 'users', userId), {
            tasks: JSON.stringify(data.tasks || {}),
            sessions: JSON.stringify(data.sessions || []),
            settings: JSON.stringify(data.settings || {}),
            updatedAt: Date.now()
        });
        return true;
    } catch (e) {
        console.error('Cloud save failed:', e);
        throw e; // Let caller handle and show error to user
    }
}

/**
 * Load data from Firestore. Returns the data object or null.
 * Throws on error so the caller can show feedback to the user.
 */
export async function loadFromCloud(userId) {
    if (!isConfigured || !userId) return null;
    try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (!snap.exists()) return null;
        const raw = snap.data();
        return {
            tasks: JSON.parse(raw.tasks || '{}'),
            sessions: JSON.parse(raw.sessions || '[]'),
            settings: JSON.parse(raw.settings || '{}')
        };
    } catch (e) {
        console.error('Cloud load failed:', e);
        throw e; // Let caller handle and show error to user
    }
}
