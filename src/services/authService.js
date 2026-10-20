import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';

export const authService = {
  // Iniciar sesión con correo y contraseña
  async loginWithEmail(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  // Registrar con correo y contraseña
  async registerWithEmail(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  // Iniciar sesión con Google
  async loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  },

  // Cerrar sesión
  async logoutUser() {
    await signOut(auth);
    return true;
  },

  // Escuchar cambios en el estado de autenticación
  onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
  }
};