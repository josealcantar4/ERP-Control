import { db, isFirebaseConfigured } from '../../config/firebase';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy
} from 'firebase/firestore';

const LOCAL_STORAGE_KEY = 'erp_control_solicitudes';

function getLocalSolicitudes() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

function saveLocalSolicitudes(list) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('erp_solicitudes_changed'));
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

let isInitialLoad = true;

export const transferService = {
  subscribeSolicitudes(onUpdate) {
    const currentUser = JSON.parse(localStorage.getItem('erp_current_user') || '{}');

    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'solicitudes'), orderBy('fecha', 'desc'));
        return onSnapshot(
          q,
          (snap) => {
            // Evaluador de Notificaciones (Solo después del primer volcado)
            if (!isInitialLoad) {
              snap.docChanges().forEach(change => {
                if (change.type === 'added' || change.type === 'modified') {
                  const data = change.doc.data();
                  const folioTxt = data.folio || 'Sin Folio';

                  // Si entra una solicitud nueva, alertar a la Matriz destino
                  if (data.estado === 'enviada' && data.usuarioDestino === currentUser.username) {
                    showNotification('Nueva Solicitud Recibida', `La sucursal ${data.sucursalOrigen} ha solicitado el pedido ${folioTxt}.`);
                  }
                  // Si se despacha la caja, alertar a la Sucursal origen
                  if (data.estado === 'completada' && data.usuarioSolicitante === currentUser.username) {
                    showNotification('Pedido Despachado', `Tu pedido ${folioTxt} ha sido enviado por Matriz.`);
                  }
                  // Si hay faltantes, alertar a Matriz
                  if (data.estado === 'recibida_incompleta' && data.usuarioDestino === currentUser.username) {
                    showNotification('Reporte de Inconsistencia', `La sucursal ${data.sucursalOrigen} reportó faltantes en el pedido ${folioTxt}.`);
                  }
                }
              });
            } else {
              isInitialLoad = false;
            }

            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            onUpdate(items);
          },
          (err) => {
            console.warn('Fallback a almacenamiento local de solicitudes:', err);
            onUpdate(getLocalSolicitudes());
          }
        );
      } catch (err) {
        console.warn('Error suscribiendo a solicitudes en Firebase:', err);
      }
    }

    onUpdate(getLocalSolicitudes());
    const handler = () => onUpdate(getLocalSolicitudes());
    window.addEventListener('erp_solicitudes_changed', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('erp_solicitudes_changed', handler);
      window.removeEventListener('storage', handler);
    };
  },

  async getActiveDraft(username) {
    const list = getLocalSolicitudes();
    return list.find(s => s.usuarioSolicitante === username && s.estado === 'borrador') || null;
  },

  async saveDraft(solicitud) {
    const docData = {
      id: solicitud.id,
      folio: solicitud.folio || '',
      sucursalOrigen: solicitud.sucursalOrigen || '',
      usuarioSolicitante: solicitud.usuarioSolicitante || '',
      usuarioDestino: solicitud.usuarioDestino || '',
      areaDestino: solicitud.areaDestino || '',
      estado: 'borrador',
      fecha: solicitud.fecha || new Date().toISOString(),
      items: solicitud.items || []
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', docData.id), docData, { merge: true });
      } catch (err) {
        console.warn('Error guardando borrador en Firebase:', err);
      }
    }

    const list = getLocalSolicitudes();
    const idx = list.findIndex(s => s.id === docData.id);
    let updated;
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = docData;
    } else {
      updated = [docData, ...list];
    }
    saveLocalSolicitudes(updated);
    return docData;
  },

  async submitSolicitud(solicitudId) {
    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), { estado: 'enviada' });
      } catch (err) {}
    }
    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, estado: 'enviada' } : s));
    return true;
  },

  async toggleItemAtendido(solicitudId, itemIndex) {
    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, 'solicitudes', solicitudId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const items = [...(data.items || [])];
          if (items[itemIndex]) {
            items[itemIndex].atendido = !items[itemIndex].atendido;
            const newEstado = data.estado === 'enviada' ? 'en_despacho' : data.estado;
            await updateDoc(docRef, { items, estado: newEstado });
          }
        }
      } catch (err) {}
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => {
      if (s.id === solicitudId) {
        const items = [...(s.items || [])];
        if (items[itemIndex]) { items[itemIndex] = { ...items[itemIndex], atendido: !items[itemIndex].atendido }; }
        return { ...s, items, estado: s.estado === 'enviada' ? 'en_despacho' : s.estado };
      }
      return s;
    }));
    return true;
  },

  async addExtraItem(solicitudId, extraItem) {
    const newItem = {
      codigo: extraItem.codigo,
      descripcion: extraItem.descripcion,
      cantidadSolicitada: 0,
      cantidadDespachada: Number(extraItem.cantidad || 1),
      esExtra: true,
      atendido: true
    };

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, 'solicitudes', solicitudId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const items = [...(snap.data().items || []), newItem];
          await updateDoc(docRef, { items });
        }
      } catch (err) {}
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, items: [...(s.items || []), newItem] } : s));
    return true;
  },
  
  async removeExtraItem(solicitudId, itemIndex) {
    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, 'solicitudes', solicitudId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const items = [...(data.items || [])];
          // Solo permitimos borrar si es extra
          if (items[itemIndex] && items[itemIndex].esExtra) {
            items.splice(itemIndex, 1);
            await updateDoc(docRef, { items });
          }
        }
      } catch (err) {}
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => {
      if (s.id === solicitudId) {
        const items = [...(s.items || [])];
        if (items[itemIndex] && items[itemIndex].esExtra) {
          items.splice(itemIndex, 1);
        }
        return { ...s, items };
      }
      return s;
    }));
    return true;
  },

  async completeSolicitud(solicitudId) {
    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), { estado: 'completada' });
      } catch (err) {}
    }
    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, estado: 'completada' } : s));
    return true;
  },

  // NUEVO: Finalizar recepción en sucursal
  async receiveSolicitud(solicitudId, faltantes = []) {
    const estado = faltantes.length > 0 ? 'recibida_incompleta' : 'recibida';
    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), { estado, reporteFaltantes: faltantes });
      } catch (err) {}
    }
    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, estado, reporteFaltantes: faltantes } : s));
    return true;
  },

  // ELIMINAR BORRADOR: Permitido ÚNICAMENTE para su creador original o Administrador.
  // ESTRICTAMENTE PROHIBIDO para solicitudes completadas o en cualquier otro estado.
  async deleteDraft(solicitudId, currentUser) {
    if (!solicitudId) throw new Error('ID de solicitud requerido.');

    let solicitud = null;
    if (isFirebaseConfigured) {
      try {
        const snap = await getDoc(doc(db, 'solicitudes', solicitudId));
        if (snap.exists()) {
          solicitud = snap.data();
        }
      } catch (e) {
        console.warn('Error leyendo solicitud para eliminación:', e);
      }
    }

    if (!solicitud) {
      const list = getLocalSolicitudes();
      solicitud = list.find(s => s.id === solicitudId);
    }

    if (!solicitud) {
      throw new Error('La solicitud no existe.');
    }

    // Regla crítica: Las transferencias completadas no se pueden eliminar jamás
    if (solicitud.estado !== 'borrador') {
      throw new Error('Está estrictamente prohibido eliminar transferencias que no sean borradores.');
    }

    const isAdmin =
      currentUser?.username?.toLowerCase() === 'administrador' ||
      currentUser?.roles?.includes('admin');
    const isOwner = solicitud.usuarioSolicitante === currentUser?.username;

    if (!isAdmin && !isOwner) {
      throw new Error('Solo el creador original o el Administrador pueden eliminar este borrador.');
    }

    if (isFirebaseConfigured) {
      await deleteDoc(doc(db, 'solicitudes', solicitudId));
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.filter(s => s.id !== solicitudId));
    return true;
  }
};