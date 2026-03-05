// ===== Firebase Configuration =====
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDWNQKGBbD0SLbEfsNEqdJV5hfGW4dkSdI",
    authDomain: "prodtrack-57e6f.firebaseapp.com",
    projectId: "prodtrack-57e6f",
    storageBucket: "prodtrack-57e6f.firebasestorage.app",
    messagingSenderId: "495598159834",
    appId: "1:495598159834:web:cda80ff294e9724f90a2e3"
};

// Google OAuth Client ID — from Firebase Console > Authentication > Sign-in method > Google > Web SDK configuration
// This is the "Web client ID" shown there.
const GOOGLE_CLIENT_ID = "495598159834-9tjobdj5lk4reuo22f2imgibcjneveql.apps.googleusercontent.com";

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

        // Load Google Identity Services script
        loadGoogleScript();

        return true;
    } catch (e) {
        console.error('Firebase init failed:', e);
        isConfigured = false;
        return false;
    }
}

// Dynamically load the Google Identity Services script
function loadGoogleScript() {
    if (document.getElementById('google-gis-script')) return;
    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
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

    return new Promise((resolve, reject) => {
        if (typeof google === 'undefined' || !google.accounts) {
            reject(new Error('Google Identity Services not loaded yet. Please try again.'));
            return;
        }

        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'openid profile email',
            callback: async (tokenResponse) => {
                if (tokenResponse.error) {
                    reject(new Error(tokenResponse.error));
                    return;
                }

                try {
                    // Exchange the access token for user info to get the id_token
                    // Use the access_token to create a Firebase credential
                    const credential = GoogleAuthProvider.credential(null, tokenResponse.access_token);
                    const result = await signInWithCredential(auth, credential);
                    resolve(result.user);
                } catch (e) {
                    console.error('Firebase credential sign-in failed:', e);
                    reject(e);
                }
            },
        });

        client.requestAccessToken();
    });
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
