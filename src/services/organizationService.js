import { db, isFirebaseConfigured } from '../config/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';

const LOCAL_SEDES_KEY = 'erp_control_sedes';
const LOCAL_AREAS_KEY = 'erp_control_areas';

function getLocalSedes() {
  const raw = localStorage.getItem(LOCAL_SEDES_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

function saveLocalSedes(list) {
  localStorage.setItem(LOCAL_SEDES_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('erp_sedes_changed'));
}

function getLocalAreas() {
  const raw = localStorage.getItem(LOCAL_AREAS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

function saveLocalAreas(list) {
  localStorage.setItem(LOCAL_AREAS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('erp_areas_changed'));
}

export const organizationService = {
  // Subscribe to Sedes in real-time
  subscribeSedes(onUpdate) {
    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'sedes'));
        return onSnapshot(
          q,
          (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort alphabetically by nombre
            items.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            onUpdate(items);
            saveLocalSedes(items);
          },
          (err) => {
            console.warn('Error suscribiendo a sedes en Firebase:', err);
            onUpdate(getLocalSedes());
          }
        );
      } catch (err) {
        console.warn('Error inicializando snap de sedes:', err);
      }
    }

    onUpdate(getLocalSedes());
    const handler = () => onUpdate(getLocalSedes());
    window.addEventListener('erp_sedes_changed', handler);
    return () => window.removeEventListener('erp_sedes_changed', handler);
  },

  // Create or update a Sede
  async createSede(nombre, tipo = 'Sucursal') {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error('El nombre de la sede es obligatorio.');

    const id = 'sede-' + cleanNombre.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const docData = {
      id,
      nombre: cleanNombre,
      tipo,
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'sedes', id), docData, { merge: true });
      } catch (err) {
        console.warn('Error guardando sede en Firebase:', err);
      }
    }

    const current = getLocalSedes();
    const filtered = current.filter(s => s.id !== id);
    saveLocalSedes([...filtered, docData]);
    return id; // Retornamos el ID para la actualización optimista
  },

  // Actualizar una Sede existente
  async updateSede(id, nombre, tipo) {
    const cleanNombre = nombre.trim();
    if (!id) throw new Error('El ID de la sede es obligatorio.');
    if (!cleanNombre) throw new Error('El nombre de la sede es obligatorio.');

    const updateData = {
      nombre: cleanNombre,
      tipo,
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'sedes', id), updateData, { merge: true });
      } catch (err) {
        console.warn('Error actualizando sede en Firebase:', err);
      }
    }

    const current = getLocalSedes();
    const updated = current.map(s => s.id === id ? { ...s, ...updateData } : s);
    saveLocalSedes(updated);
    return true;
  },

  // Delete a Sede
  async deleteSede(id) {
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'sedes', id));
      } catch (err) {
        console.warn('Error eliminando sede en Firebase:', err);
      }
    }

    const current = getLocalSedes();
    saveLocalSedes(current.filter(s => s.id !== id));
    return true;
  },

  // Subscribe to Áreas in real-time
  subscribeAreas(onUpdate) {
    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'areas'));
        return onSnapshot(
          q,
          (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            items.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            onUpdate(items);
            saveLocalAreas(items);
          },
          (err) => {
            console.warn('Error suscribiendo a áreas en Firebase:', err);
            onUpdate(getLocalAreas());
          }
        );
      } catch (err) {
        console.warn('Error inicializando snap de áreas:', err);
      }
    }

    onUpdate(getLocalAreas());
    const handler = () => onUpdate(getLocalAreas());
    window.addEventListener('erp_areas_changed', handler);
    return () => window.removeEventListener('erp_areas_changed', handler);
  },

  // Create or update an Área
  async createArea(nombre) {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error('El nombre del área es obligatorio.');

    const id = 'area-' + cleanNombre.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const docData = {
      id,
      nombre: cleanNombre,
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'areas', id), docData, { merge: true });
      } catch (err) {
        console.warn('Error guardando área en Firebase:', err);
      }
    }

    const current = getLocalAreas();
    const filtered = current.filter(a => a.id !== id);
    saveLocalAreas([...filtered, docData]);
    return id; // Retornamos el ID para la actualización optimista
  },

  // Actualizar un Área existente
  async updateArea(id, nombre) {
    const cleanNombre = nombre.trim();
    if (!id) throw new Error('El ID del área es obligatorio.');
    if (!cleanNombre) throw new Error('El nombre del área es obligatorio.');

    const updateData = {
      nombre: cleanNombre,
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'areas', id), updateData, { merge: true });
      } catch (err) {
        console.warn('Error actualizando área en Firebase:', err);
      }
    }

    const current = getLocalAreas();
    const updated = current.map(a => a.id === id ? { ...a, ...updateData } : a);
    saveLocalAreas(updated);
    return true;
  },

  // Delete an Área
  async deleteArea(id) {
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'areas', id));
      } catch (err) {
        console.warn('Error eliminando área en Firebase:', err);
      }
    }

    const current = getLocalAreas();
    saveLocalAreas(current.filter(a => a.id !== id));
    return true;
  }
};