import { db, isFirebaseConfigured } from '../../config/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  getDocs
} from 'firebase/firestore';

const LOCAL_SEDES_KEY = 'erp_control_sedes';
const LOCAL_AREAS_KEY = 'erp_control_areas';

function getLocalSedes() {
  const raw = localStorage.getItem(LOCAL_SEDES_KEY);
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.map(s => ({
          ...s,
          areas: Array.isArray(s.areas) ? s.areas : [],
          esDestino: s.esDestino !== false
        }));
      }
      return [];
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
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.map(a => ({
          ...a,
          excluirTransferencias: Boolean(a.excluirTransferencias)
        }));
      }
      return [];
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

function generateCleanId(prefix, text) {
  const slug = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-${slug || Date.now()}`;
}

export const organizationService = {
  // Suscripción en tiempo real a Sedes
  subscribeSedes(onUpdate) {
    const initialLocal = getLocalSedes();
    if (initialLocal.length > 0) {
      onUpdate(initialLocal);
    }

    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'sedes'));
        return onSnapshot(
          q,
          (snap) => {
            const items = snap.docs.map(d => {
              const data = d.data() || {};
              return {
                id: d.id,
                ...data,
                areas: Array.isArray(data.areas) ? data.areas : [],
                esDestino: data.esDestino !== false
              };
            });
            items.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            onUpdate(items);
            saveLocalSedes(items);
          },
          (err) => {
            console.error('Error suscribiendo a sedes en Firebase:', err);
            onUpdate(getLocalSedes());
          }
        );
      } catch (err) {
        console.error('Error inicializando snap de sedes:', err);
      }
    }

    const handler = () => onUpdate(getLocalSedes());
    window.addEventListener('erp_sedes_changed', handler);
    return () => window.removeEventListener('erp_sedes_changed', handler);
  },

  // Forzar verificación y obtención de sedes y áreas actualizadas
  async refreshSedesAndAreas() {
    const result = { sedes: [], areas: [] };
    if (isFirebaseConfigured) {
      try {
        const [snapSedes, snapAreas] = await Promise.all([
          getDocs(collection(db, 'sedes')),
          getDocs(collection(db, 'areas'))
        ]);
        const sedes = snapSedes.docs.map(d => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
            areas: Array.isArray(data.areas) ? data.areas : [],
            esDestino: data.esDestino !== false
          };
        });
        sedes.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        saveLocalSedes(sedes);
        result.sedes = sedes;

        const areas = snapAreas.docs.map(d => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
            excluirTransferencias: Boolean(data.excluirTransferencias)
          };
        });
        areas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        saveLocalAreas(areas);
        result.areas = areas;
      } catch (err) {
        console.warn('Error refrescando sedes y áreas desde Firebase:', err);
      }
    }
    return result;
  },

  // Crear una nueva Sede (con lista opcional de sub-áreas)
  async createSede(nombre, tipo = 'Sucursal', areas = [], esDestino = true) {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error('El nombre de la sede es obligatorio.');

    const cleanAreas = Array.isArray(areas)
      ? areas.map(a => String(a || '').trim()).filter(Boolean)
      : [];

    const id = generateCleanId('sede', cleanNombre);
    const docData = {
      id,
      nombre: cleanNombre,
      tipo: tipo || 'Sucursal',
      areas: cleanAreas,
      esDestino: esDestino !== false,
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'sedes', id), docData, { merge: true });
    }

    const current = getLocalSedes();
    const filtered = current.filter(s => s.id !== id);
    const updated = [...filtered, docData].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    saveLocalSedes(updated);
    return id;
  },

  // Actualizar una Sede existente
  async updateSede(id, nombre, tipo, areas = null, esDestino = undefined) {
    if (!id) throw new Error('El ID de la sede es obligatorio.');
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error('El nombre de la sede es obligatorio.');

    const updateData = {
      id,
      nombre: cleanNombre,
      tipo: tipo || 'Sucursal',
      updatedAt: new Date().toISOString()
    };

    if (areas !== null && Array.isArray(areas)) {
      updateData.areas = areas.map(a => String(a || '').trim()).filter(Boolean);
    }

    if (esDestino !== undefined) {
      updateData.esDestino = Boolean(esDestino);
    }

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'sedes', id), updateData, { merge: true });
    }

    const current = getLocalSedes();
    const updated = current.map(s => (s.id === id ? { ...s, ...updateData } : s));
    saveLocalSedes(updated);
    return true;
  },

  // Agregar una sub-área a una Sede
  async addAreaToSede(sedeId, areaNombre) {
    if (!sedeId) throw new Error('ID de sede requerido.');
    const cleanArea = String(areaNombre || '').trim();
    if (!cleanArea) throw new Error('El nombre del área es requerido.');

    const sedes = getLocalSedes();
    const target = sedes.find(s => s.id === sedeId);
    if (!target) throw new Error('Sede no encontrada.');

    const currentAreas = Array.isArray(target.areas) ? target.areas : [];
    if (!currentAreas.includes(cleanArea)) {
      const newAreas = [...currentAreas, cleanArea];
      await this.updateSede(sedeId, target.nombre, target.tipo, newAreas);
    }
    return true;
  },

  // Remover una sub-área de una Sede
  async removeAreaFromSede(sedeId, areaNombre) {
    if (!sedeId) throw new Error('ID de sede requerido.');
    const cleanArea = String(areaNombre || '').trim();

    const sedes = getLocalSedes();
    const target = sedes.find(s => s.id === sedeId);
    if (!target) return false;

    const currentAreas = Array.isArray(target.areas) ? target.areas : [];
    const newAreas = currentAreas.filter(a => a !== cleanArea);
    await this.updateSede(sedeId, target.nombre, target.tipo, newAreas);
    return true;
  },

  // Obtener las sub-áreas configuradas para una Sede por ID o Nombre
  getSedeAreas(sedeNombreOrId) {
    if (!sedeNombreOrId) return [];
    const sedes = getLocalSedes();
    const found = sedes.find(
      s => s.id === sedeNombreOrId || (s.nombre || '').toLowerCase() === String(sedeNombreOrId).toLowerCase()
    );
    return Array.isArray(found?.areas) ? found.areas : [];
  },

  // Eliminar una Sede
  async deleteSede(id) {
    if (!id) throw new Error('El ID de la sede es obligatorio.');

    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'sedes', id));
    }

    const current = getLocalSedes();
    saveLocalSedes(current.filter(s => s.id !== id));
    return true;
  },

  // Suscripción en tiempo real a Áreas
  subscribeAreas(onUpdate) {
    const initialLocal = getLocalAreas();
    if (initialLocal.length > 0) {
      onUpdate(initialLocal);
    }

    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'areas'));
        return onSnapshot(
          q,
          (snap) => {
            const items = snap.docs.map(d => {
              const data = d.data() || {};
              return {
                id: d.id,
                ...data,
                excluirTransferencias: Boolean(data.excluirTransferencias)
              };
            });
            items.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            onUpdate(items);
            saveLocalAreas(items);
          },
          (err) => {
            console.error('Error suscribiendo a áreas en Firebase:', err);
            onUpdate(getLocalAreas());
          }
        );
      } catch (err) {
        console.error('Error inicializando snap de áreas:', err);
      }
    }

    const handler = () => onUpdate(getLocalAreas());
    window.addEventListener('erp_areas_changed', handler);
    return () => window.removeEventListener('erp_areas_changed', handler);
  },

  // Crear una nueva Área
  async createArea(nombre, excluirTransferencias = false) {
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error('El nombre del área es obligatorio.');

    const id = generateCleanId('area', cleanNombre);
    const docData = {
      id,
      nombre: cleanNombre,
      excluirTransferencias: Boolean(excluirTransferencias),
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'areas', id), docData, { merge: true });
    }

    const current = getLocalAreas();
    const filtered = current.filter(a => a.id !== id);
    const updated = [...filtered, docData].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    saveLocalAreas(updated);
    return id;
  },

  // Actualizar un Área existente
  async updateArea(id, nombre, excluirTransferencias = false) {
    if (!id) throw new Error('El ID del área es obligatorio.');
    const cleanNombre = nombre.trim();
    if (!cleanNombre) throw new Error('El nombre del área es obligatorio.');

    const updateData = {
      id,
      nombre: cleanNombre,
      excluirTransferencias: Boolean(excluirTransferencias),
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'areas', id), updateData, { merge: true });
    }

    const current = getLocalAreas();
    const updated = current.map(a => (a.id === id ? { ...a, ...updateData } : a));
    saveLocalAreas(updated);
    return true;
  },

  // Obtener áreas operativas para transferencias y pedidos
  getOperativeAreas() {
    return getLocalAreas().filter(a => !a.excluirTransferencias);
  },

  // Eliminar un Área
  async deleteArea(id) {
    if (!id) throw new Error('El ID del área es obligatorio.');

    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'areas', id));
    }

    const current = getLocalAreas();
    saveLocalAreas(current.filter(a => a.id !== id));
    return true;
  }
};
