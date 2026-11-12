/**
 * Configuración e inicialización del SDK de Firebase (Auth, Firestore con soporte offline y caché persistente, Storage y Analytics).
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  GoogleAuthProvider
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export const isFirebaseConfigured = true;

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const secondaryApp = getApps().find((a) => a.name === "AdminProvisioner")
  || initializeApp(firebaseConfig, "AdminProvisioner");

let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch((err) => console.warn("Firebase Analytics no soportado en este entorno:", err));
}

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

const auth = getAuth(app);

let secondaryAuth;
try {
  secondaryAuth = initializeAuth(secondaryApp, {
    persistence: inMemoryPersistence
  });
} catch {
  secondaryAuth = getAuth(secondaryApp);
}

const googleProvider = new GoogleAuthProvider();

const storage = getStorage(app);

export { app, analytics, auth, secondaryAuth, db, storage, googleProvider, firebaseConfig };
export default app;
