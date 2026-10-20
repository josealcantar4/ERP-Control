// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAttC-uThcBdOSoMhpUlqhiY5SvIJgmWrY",
  authDomain: "erp-control-f45a8.firebaseapp.com",
  projectId: "erp-control-f45a8",
  storageBucket: "erp-control-f45a8.firebasestorage.app",
  messagingSenderId: "281925818113",
  appId: "1:281925818113:web:874275a8a5422fa1e2ed00",
  measurementId: "G-NVY4M96CQ3"
};

export const isFirebaseConfigured = true;

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Analytics (safe for SSR/PWA environments)
let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch((err) => console.warn("Firebase Analytics no soportado en este entorno:", err));
}

// Initialize Firestore with offline persistence for PWA support
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn("Firestore offline cache initialization fallback:", error);
  db = getFirestore(app);
}

// Initialize Auth
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Storage
const storage = getStorage(app);

export { app, analytics, auth, db, storage, googleProvider, firebaseConfig };
export default app;
