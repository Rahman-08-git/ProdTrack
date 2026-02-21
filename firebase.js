// ===== Firebase Configuration =====
// INSTRUCTIONS: Replace the values below with your Firebase project config.
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (name it "ProdTrack" or anything)
// 3. Go to Project Settings > General > Your apps > Add web app
// 4. Copy the firebaseConfig object and paste the values below

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let app = null;
let auth = null;
let db = null;
let isConfigured = false;

// Check if Firebase is configured
function checkConfig() {
    return firebaseConfig.apiKey && firebaseConfig.apiKey.length > 0;
}

export function initFirebase() {
    if (!checkConfig()) {
        console.warn('Firebase not configured. Cloud sync disabled. See firebase.js for setup instructions.');
        isConfigured = false;
        return false;
    }

    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        isConfigured = true;
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
export function onAuthChange(callback) {
    if (!isConfigured) return;
    onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
    if (!isConfigured) return null;
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (e) {
        console.error('Sign-in failed:', e);
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
export async function saveToCloud(userId, data) {
    if (!isConfigured || !userId) return;
    try {
        await setDoc(doc(db, 'users', userId), {
            tasks: JSON.stringify(data.tasks || {}),
            sessions: JSON.stringify(data.sessions || []),
            settings: JSON.stringify(data.settings || {}),
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('Cloud save failed:', e);
        throw e;
    }
}

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
        return null;
    }
}
