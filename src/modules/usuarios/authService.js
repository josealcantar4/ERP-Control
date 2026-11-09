/**
 * Servicio para autenticación con Firebase, verificación de credenciales y gestión de la sesión del usuario activo.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '../../config/firebase';

export const authService = {
  async loginWithEmail(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  async registerWithEmail(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  async loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  },

  async logoutUser() {
    await signOut(auth);
    return true;
  },

  onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
  }
};
