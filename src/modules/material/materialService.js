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

const LOCAL_MATERIAL_KEY = 'erp_control_material_brindado';
const LOCAL_TIPOS_KEY = 'erp_control_material_tipos';
const LOCAL_PERSONAL_KEY = 'erp_control_material_personal';

const DEFAULT_TIPOS = [
  { id: 'tipo-papeleria', nombre: 'Papelería', color: 'blue' },
  { id: 'tipo-informatica', nombre: 'Informática y Cómputo', color: 'indigo' },
  { id: 'tipo-herramientas', nombre: 'Herramientas', color: 'amber' },
  { id: 'tipo-limpieza', nombre: 'Limpieza e Higiene', color: 'emerald' },
  { id: 'tipo-seguridad', nombre: 'Seguridad y Protección', color: 'purple' }
];

function getLocalData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalData(key, data, eventName) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (eventName) window.dispatchEvent(new Event(eventName));
  } catch (e) {
    console.warn(`Error guardando ${key} en localStorage:`, e);
  }
}

function generateId(prefix = 'mat') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export const materialService = {
  // ==========================================
  // 1. MATERIAL BRINDADO / ENTREGAS
  // ==========================================
  getLocalMateriales() {
    return getLocalData(LOCAL_MATERIAL_KEY, []);
  },

  subscribeMateriales(onUpdate) {
    const initial = this.getLocalMateriales();
    if (initial.length > 0) onUpdate(initial);

    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'material_brindado'));
        return onSnapshot(
          q,
          (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => new Date(b.createdAt || b.fechaEntrega || 0) - new Date(a.createdAt || a.fechaEntrega || 0));
            saveLocalData(LOCAL_MATERIAL_KEY, list, 'erp_material_changed');
            onUpdate(list);
          },
          (err) => {
            console.error('Error suscribiendo a material_brindado:', err);
            onUpdate(this.getLocalMateriales());
          }
        );
      } catch (err) {
        console.error('Error iniciando snap de material_brindado:', err);
      }
    }

    const handler = () => onUpdate(this.getLocalMateriales());
    window.addEventListener('erp_material_changed', handler);
    return () => window.removeEventListener('erp_material_changed', handler);
  },

  async createMaterial(payload, currentUser) {
    if (!payload.descripcion?.trim()) throw new Error('La descripción del material es obligatoria.');
    if (!payload.tipoControl?.trim()) throw new Error('El tipo de control es obligatorio.');
    if (!payload.personal?.trim()) throw new Error('El nombre de la persona que recibe es obligatorio.');
    if (!payload.area?.trim()) throw new Error('El área del personal es obligatoria.');
    if (!payload.cantidad || Number(payload.cantidad) <= 0) throw new Error('La cantidad debe ser mayor a 0.');
    if (!payload.fechaEntrega) throw new Error('La fecha de entrega es obligatoria.');
    if (payload.requiereReemplazo && !payload.fechaReemplazo) {
      throw new Error('Debes indicar la fecha estimada de reemplazo o revisión.');
    }

    const id = generateId('mat');
    const item = {
      id,
      tipoControl: payload.tipoControl.trim(),
      personal: payload.personal.trim(),
      area: payload.area.trim(),
      descripcion: payload.descripcion.trim(),
      cantidad: parseInt(payload.cantidad, 10),
      fechaEntrega: payload.fechaEntrega,
      requiereReemplazo: Boolean(payload.requiereReemplazo),
      fechaReemplazo: payload.requiereReemplazo ? payload.fechaReemplazo : null,
      estado: payload.estado || 'activo', // 'activo' | 'reemplazado' | 'devuelto'
      notas: payload.notas?.trim() || '',
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.username || 'sistema',
      createdByName: currentUser?.nombre || 'Personal',
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_brindado', id), item, { merge: true });
    }

    const current = this.getLocalMateriales();
    const updated = [item, ...current.filter(m => m.id !== id)];
    saveLocalData(LOCAL_MATERIAL_KEY, updated, 'erp_material_changed');
    return id;
  },

  async updateMaterial(id, payload, currentUser) {
    if (!id) throw new Error('ID no válido.');
    if (!payload.descripcion?.trim()) throw new Error('La descripción del material es obligatoria.');
    if (!payload.tipoControl?.trim()) throw new Error('El tipo de control es obligatorio.');
    if (!payload.personal?.trim()) throw new Error('El nombre de la persona que recibe es obligatorio.');
    if (!payload.area?.trim()) throw new Error('El área del personal es obligatoria.');
    if (!payload.cantidad || Number(payload.cantidad) <= 0) throw new Error('La cantidad debe ser mayor a 0.');
    if (!payload.fechaEntrega) throw new Error('La fecha de entrega es obligatoria.');
    if (payload.requiereReemplazo && !payload.fechaReemplazo) {
      throw new Error('Debes indicar la fecha estimada de reemplazo o revisión.');
    }

    const updateData = {
      tipoControl: payload.tipoControl.trim(),
      personal: payload.personal.trim(),
      area: payload.area.trim(),
      descripcion: payload.descripcion.trim(),
      cantidad: parseInt(payload.cantidad, 10),
      fechaEntrega: payload.fechaEntrega,
      requiereReemplazo: Boolean(payload.requiereReemplazo),
      fechaReemplazo: payload.requiereReemplazo ? payload.fechaReemplazo : null,
      estado: payload.estado || 'activo',
      notas: payload.notas?.trim() || '',
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.username || 'sistema'
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_brindado', id), updateData, { merge: true });
    }

    const current = this.getLocalMateriales();
    const updated = current.map(m => (m.id === id ? { ...m, ...updateData } : m));
    saveLocalData(LOCAL_MATERIAL_KEY, updated, 'erp_material_changed');
    return true;
  },

  async deleteMaterial(id) {
    if (!id) throw new Error('ID no válido.');
    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'material_brindado', id));
    }
    const current = this.getLocalMateriales();
    const updated = current.filter(m => m.id !== id);
    saveLocalData(LOCAL_MATERIAL_KEY, updated, 'erp_material_changed');
    return true;
  },

  async markAsStatus(id, newStatus) {
    if (!id) return;
    const updateData = {
      estado: newStatus,
      updatedAt: new Date().toISOString()
    };
    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_brindado', id), updateData, { merge: true });
    }
    const current = this.getLocalMateriales();
    const updated = current.map(m => (m.id === id ? { ...m, ...updateData } : m));
    saveLocalData(LOCAL_MATERIAL_KEY, updated, 'erp_material_changed');
  },

  // ==========================================
  // 2. TIPOS DE CONTROL (Papelería, Cómputo, etc.)
  // ==========================================
  getLocalTipos() {
    return getLocalData(LOCAL_TIPOS_KEY, DEFAULT_TIPOS);
  },

  subscribeTipos(onUpdate) {
    const initial = this.getLocalTipos();
    onUpdate(initial);

    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'material_tipos'));
        return onSnapshot(
          q,
          (snap) => {
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (list.length === 0) {
              list = DEFAULT_TIPOS;
              // Auto-sembrar en Firestore para sincronización permanente en la nube
              DEFAULT_TIPOS.forEach(t => {
                setDoc(doc(db, 'material_tipos', t.id), {
                  ...t,
                  createdAt: new Date().toISOString()
                }, { merge: true }).catch(e => console.warn('Error auto-sembrando tipo:', e));
              });
            }
            list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            saveLocalData(LOCAL_TIPOS_KEY, list, 'erp_material_tipos_changed');
            onUpdate(list);
          },
          (err) => {
            console.error('Error suscribiendo a material_tipos:', err);
            onUpdate(this.getLocalTipos());
          }
        );
      } catch (err) {
        console.error('Error iniciando snap de material_tipos:', err);
      }
    }

    const handler = () => onUpdate(this.getLocalTipos());
    window.addEventListener('erp_material_tipos_changed', handler);
    return () => window.removeEventListener('erp_material_tipos_changed', handler);
  },

  async createTipo(nombre, color = 'blue') {
    const cleanNombre = (nombre || '').trim();
    if (!cleanNombre) throw new Error('El nombre del tipo de control es obligatorio.');

    const current = this.getLocalTipos();
    if (current.some(t => t.nombre.toLowerCase() === cleanNombre.toLowerCase())) {
      throw new Error(`El tipo de control "${cleanNombre}" ya existe.`);
    }

    const slug = cleanNombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const id = `tipo-${slug || Date.now()}`;

    const newTipo = {
      id,
      nombre: cleanNombre,
      color: color || 'blue',
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_tipos', id), newTipo, { merge: true });
    }

    const updated = [...current, newTipo].sort((a, b) => a.nombre.localeCompare(b.nombre));
    saveLocalData(LOCAL_TIPOS_KEY, updated, 'erp_material_tipos_changed');
    return newTipo;
  },

  async updateTipo(id, nombre, color = 'blue') {
    if (!id) throw new Error('ID no válido.');
    const cleanNombre = (nombre || '').trim();
    if (!cleanNombre) throw new Error('El nombre del tipo de control es obligatorio.');

    const current = this.getLocalTipos();
    const existing = current.find(t => t.id === id);
    if (!existing) throw new Error('El tipo de control no fue encontrado.');

    if (current.some(t => t.id !== id && t.nombre.toLowerCase() === cleanNombre.toLowerCase())) {
      throw new Error(`Ya existe otro tipo de control con el nombre "${cleanNombre}".`);
    }

    const updatedTipo = {
      ...existing,
      nombre: cleanNombre,
      color: color || existing.color || 'blue',
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_tipos', id), updatedTipo, { merge: true });
    }

    const updated = current.map(t => (t.id === id ? updatedTipo : t)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    saveLocalData(LOCAL_TIPOS_KEY, updated, 'erp_material_tipos_changed');

    // Sincronizar registros de material existentes si cambió el nombre
    if (existing.nombre !== cleanNombre) {
      const materiales = this.getLocalMateriales();
      const affected = materiales.filter(m => m.tipoControl === existing.nombre);
      for (const m of affected) {
        this.updateMaterial(m.id, { ...m, tipoControl: cleanNombre }).catch(e => console.warn(e));
      }
    }

    return updatedTipo;
  },

  async deleteTipo(id) {
    if (!id) return;
    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'material_tipos', id));
    }
    const current = this.getLocalTipos();
    const updated = current.filter(t => t.id !== id);
    saveLocalData(LOCAL_TIPOS_KEY, updated.length > 0 ? updated : DEFAULT_TIPOS, 'erp_material_tipos_changed');
  },

  // ==========================================
  // 3. PERSONAL / DESTINATARIOS DE MATERIAL
  // ==========================================
  getLocalPersonal() {
    return getLocalData(LOCAL_PERSONAL_KEY, []);
  },

  subscribePersonal(onUpdate) {
    const initial = this.getLocalPersonal();
    onUpdate(initial);

    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'material_personal'));
        return onSnapshot(
          q,
          (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            saveLocalData(LOCAL_PERSONAL_KEY, list, 'erp_material_personal_changed');
            onUpdate(list);
          },
          (err) => {
            console.error('Error suscribiendo a material_personal:', err);
            onUpdate(this.getLocalPersonal());
          }
        );
      } catch (err) {
        console.error('Error iniciando snap de material_personal:', err);
      }
    }

    const handler = () => onUpdate(this.getLocalPersonal());
    window.addEventListener('erp_material_personal_changed', handler);
    return () => window.removeEventListener('erp_material_personal_changed', handler);
  },

  async createPersonal(nombre, puesto = '', area = '') {
    const cleanNombre = (nombre || '').trim();
    if (!cleanNombre) throw new Error('El nombre de la persona es obligatorio.');

    const id = generateId('per');
    const newPerson = {
      id,
      nombre: cleanNombre,
      puesto: (puesto || '').trim(),
      area: (area || '').trim(),
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_personal', id), newPerson, { merge: true });
    }

    const current = this.getLocalPersonal();
    const updated = [...current, newPerson].sort((a, b) => a.nombre.localeCompare(b.nombre));
    saveLocalData(LOCAL_PERSONAL_KEY, updated, 'erp_material_personal_changed');
    return newPerson;
  },

  async updatePersonal(id, nombre, puesto = '', area = '') {
    if (!id) throw new Error('ID no válido.');
    const cleanNombre = (nombre || '').trim();
    if (!cleanNombre) throw new Error('El nombre de la persona es obligatorio.');

    const current = this.getLocalPersonal();
    const existing = current.find(p => p.id === id);
    if (!existing) throw new Error('La persona no fue encontrada.');

    const updatedPerson = {
      ...existing,
      nombre: cleanNombre,
      puesto: (puesto || '').trim(),
      area: (area || '').trim(),
      updatedAt: new Date().toISOString()
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'material_personal', id), updatedPerson, { merge: true });
    }

    const updated = current.map(p => (p.id === id ? updatedPerson : p)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    saveLocalData(LOCAL_PERSONAL_KEY, updated, 'erp_material_personal_changed');

    // Sincronizar registros de material existentes si cambió el nombre o el área
    if (existing.nombre !== cleanNombre || existing.area !== updatedPerson.area) {
      const materiales = this.getLocalMateriales();
      const affected = materiales.filter(m => m.personal === existing.nombre);
      for (const m of affected) {
        this.updateMaterial(m.id, {
          ...m,
          personal: cleanNombre,
          area: updatedPerson.area || m.area
        }).catch(e => console.warn(e));
      }
    }

    return updatedPerson;
  },

  async deletePersonal(id) {
    if (!id) return;
    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'material_personal', id));
    }
    const current = this.getLocalPersonal();
    saveLocalData(LOCAL_PERSONAL_KEY, current.filter(p => p.id !== id), 'erp_material_personal_changed');
  },

  // ==========================================
  // 4. GENERADOR Y CALCULADOR DE NOTIFICACIONES
  // ==========================================
  calculateNotifications(materiales = null) {
    const list = materiales || this.getLocalMateriales();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const notifications = [];

    list.forEach((item) => {
      if (!item.requiereReemplazo || !item.fechaReemplazo || item.estado !== 'activo') {
        return;
      }

      // Parsear fecha de reemplazo (YYYY-MM-DD)
      const [year, month, day] = item.fechaReemplazo.split('-').map(Number);
      if (!year || !month || !day) return;

      const targetDate = new Date(year, month - 1, day);
      targetDate.setHours(0, 0, 0, 0);

      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        // Vencido
        notifications.push({
          id: `notif-overdue-${item.id}`,
          materialId: item.id,
          tipo: 'vencida',
          urgency: 'high',
          titulo: 'Reemplazo Vencido',
          mensaje: `El material "${item.descripcion}" entregado a ${item.personal} (${item.area}) venció su fecha de reemplazo hace ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}.`,
          item,
          diffDays,
          fechaReemplazo: item.fechaReemplazo
        });
      } else if (diffDays <= 7) {
        // Próximo a vencer en los próximos 7 días
        notifications.push({
          id: `notif-soon-${item.id}`,
          materialId: item.id,
          tipo: 'proxima',
          urgency: diffDays <= 2 ? 'medium' : 'low',
          titulo: diffDays === 0 ? 'Reemplazo vence Hoy' : `Reemplazo en ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`,
          mensaje: `El material "${item.descripcion}" entregado a ${item.personal} (${item.area}) tiene fecha de revisión/reemplazo programada para el ${item.fechaReemplazo}.`,
          item,
          diffDays,
          fechaReemplazo: item.fechaReemplazo
        });
      }
    });

    // Ordenar: primero las más urgentes (vencidas con más días de retraso, luego próximas)
    notifications.sort((a, b) => a.diffDays - b.diffDays);
    return notifications;
  },

  async refreshAll() {
    if (isFirebaseConfigured) {
      try {
        const [snapMat, snapTipos, snapPer] = await Promise.all([
          getDocs(collection(db, 'material_brindado')),
          getDocs(collection(db, 'material_tipos')),
          getDocs(collection(db, 'material_personal'))
        ]);

        const mats = snapMat.docs.map(d => ({ id: d.id, ...d.data() }));
        mats.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        saveLocalData(LOCAL_MATERIAL_KEY, mats, 'erp_material_changed');

        let tipos = snapTipos.docs.map(d => ({ id: d.id, ...d.data() }));
        if (tipos.length === 0) tipos = DEFAULT_TIPOS;
        tipos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        saveLocalData(LOCAL_TIPOS_KEY, tipos, 'erp_material_tipos_changed');

        const per = snapPer.docs.map(d => ({ id: d.id, ...d.data() }));
        per.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        saveLocalData(LOCAL_PERSONAL_KEY, per, 'erp_material_personal_changed');

        return { mats, tipos, per };
      } catch (err) {
        console.warn('Error refrescando datos de material:', err);
      }
    }
    return {
      mats: this.getLocalMateriales(),
      tipos: this.getLocalTipos(),
      per: this.getLocalPersonal()
    };
  }
};
