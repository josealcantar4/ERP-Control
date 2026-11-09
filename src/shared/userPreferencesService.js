/**
 * Servicio de persistencia en Firestore y localStorage de preferencias individuales del usuario (sonidos y tema).
 */

import { db } from '../config/firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { themeService } from './themeService';
import { soundSettingsService } from './soundSettingsService';

const DEFAULT_PREFERENCES = {
  theme: 'sistema',
  sounds: {
    enabled: true,
    exito: true,
    seleccionado: true
  }
};

let activeUnsubscribe = null;

export const userPreferencesService = {
  getLocalPreferences(username) {
    if (!username) {
      return {
        theme: themeService.getStoredTheme(),
        sounds: soundSettingsService.getSettings()
      };
    }

    try {
      const raw = localStorage.getItem(`erp_user_prefs_${String(username).toLowerCase()}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          theme: parsed.theme || themeService.getStoredTheme(),
          sounds: {
            ...DEFAULT_PREFERENCES.sounds,
            ...(parsed.sounds || {})
          }
        };
      }
    } catch {}

    return {
      theme: themeService.getStoredTheme(),
      sounds: soundSettingsService.getSettings()
    };
  },

  applyPreferences(prefs) {
    if (!prefs) return;
    if (prefs.theme) {
      themeService.setStoredTheme(prefs.theme);
    }
    if (prefs.sounds) {
      soundSettingsService.setSettings(prefs.sounds);
    }
  },

  async savePreferences(user, newPreferences) {
    if (!user) return newPreferences;
    const username = (user.username || user.id || '').toLowerCase();
    const current = this.getLocalPreferences(username);
    const merged = {
      theme: newPreferences.theme || current.theme,
      sounds: {
        ...current.sounds,
        ...(newPreferences.sounds || {})
      }
    };

    try {
      localStorage.setItem(`erp_user_prefs_${username}`, JSON.stringify(merged));
    } catch (e) {
      console.warn('Error al guardar preferencias en localStorage:', e);
    }
    this.applyPreferences(merged);

    try {
      let targetDocId = user.id;

      if (!targetDocId) {
        const snapAll = await getDocs(collection(db, 'usuarios'));
        const matched = snapAll.docs.find(d => (d.data()?.username || '').toLowerCase() === username);
        if (matched) {
          targetDocId = matched.id;
        }
      }

      if (targetDocId) {
        const userRef = doc(db, 'usuarios', targetDocId);
        await setDoc(userRef, { preferencias: merged, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (err) {
      console.warn('Error al sincronizar preferencias con Firebase (se mantendrán localmente):', err);
    }

    return merged;
  },

  subscribeUserPreferences(user, onUpdate) {
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }

    if (!user) return () => {};

    const username = (user.username || user.id || '').toLowerCase();
    const local = this.getLocalPreferences(username);
    this.applyPreferences(local);
    if (onUpdate) onUpdate(local);

    try {
      const targetDocId = user.id;
      if (!targetDocId) return () => {};

      const userRef = doc(db, 'usuarios', targetDocId);
      activeUnsubscribe = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.preferencias) {
              const remote = {
                theme: data.preferencias.theme || local.theme,
                sounds: {
                  ...DEFAULT_PREFERENCES.sounds,
                  ...(data.preferencias.sounds || {})
                }
              };
              localStorage.setItem(`erp_user_prefs_${username}`, JSON.stringify(remote));
              this.applyPreferences(remote);
              if (onUpdate) onUpdate(remote);
            }
          }
        },
        (err) => {
          console.warn('Error en listener de preferencias de usuario:', err);
        }
      );

      return () => {
        if (activeUnsubscribe) {
          activeUnsubscribe();
          activeUnsubscribe = null;
        }
      };
    } catch (e) {
      console.warn('No se pudo inicializar listener de preferencias:', e);
      return () => {};
    }
  }
};
