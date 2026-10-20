import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../config/firebase';

export const authService = {
  // Sign in with email and password
  async loginWithEmail(email, password) {
    if (!isFirebaseConfigured) {
      // Demo authentication simulation
      const demoUser = {
        uid: 'demo-user-123',
        email: email || 'farmaceutico@erpcontrol.com',
        displayName: 'Administrador Farmacia',
        isDemo: true
      };
      localStorage.setItem('erp_demo_user', JSON.stringify(demoUser));
      return demoUser;
    }
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  // Register with email and password
  async registerWithEmail(email, password) {
    if (!isFirebaseConfigured) {
      const demoUser = {
        uid: 'demo-user-' + Date.now(),
        email,
        displayName: 'Usuario Farmacia',
        isDemo: true
      };
      localStorage.setItem('erp_demo_user', JSON.stringify(demoUser));
      return demoUser;
    }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  // Sign in with Google Popup
  async loginWithGoogle() {
    if (!isFirebaseConfigured) {
      const demoUser = {
        uid: 'demo-google-user',
        email: 'google.farmacia@erpcontrol.com',
        displayName: 'Usuario Google Demo',
        isDemo: true
      };
      localStorage.setItem('erp_demo_user', JSON.stringify(demoUser));
      return demoUser;
    }
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  },

  // Sign out
  async logoutUser() {
    if (!isFirebaseConfigured) {
      localStorage.removeItem('erp_demo_user');
      return true;
    }
    await signOut(auth);
    return true;
  },

  // Auth state listener
  onAuthChange(callback) {
    if (!isFirebaseConfigured) {
      const saved = localStorage.getItem('erp_demo_user');
      if (saved) {
        callback(JSON.parse(saved));
      } else {
        callback(null);
      }
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  }
};
