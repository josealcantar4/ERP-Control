import { db, isFirebaseConfigured } from '../../config/firebase';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs
} from 'firebase/firestore';

const LOCAL_STORAGE_KEY = 'erp_control_solicitudes';

function getLocalSolicitudes() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        // Excluir automáticamente cualquier borrador sin productos ("borrador basura")
        return list.filter(s => !(s.estado === 'borrador' && (!s.items || s.items.length === 0)));
      }
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

function saveLocalSolicitudes(list) {
  // Asegurar que nunca se persistan en el almacenamiento local borradores vacíos
  const cleanList = (list || []).filter(s => !(s.estado === 'borrador' && (!s.items || s.items.length === 0)));
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanList));
  window.dispatchEvent(new Event('erp_solicitudes_changed'));
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

let isInitialLoad = true;

export const transferService = {
  getLocalSolicitudes() {
    return getLocalSolicitudes();
  },

  // Elimina de forma silenciosa un borrador vacío de Firebase y almacenamiento local
  async deleteEmptyDraft(solicitudId) {
    if (!solicitudId) return;
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'solicitudes', solicitudId));
      } catch (err) {
        console.warn('Error eliminando borrador vacío en Firebase:', err);
      }
    }
    const current = getLocalSolicitudes();
    saveLocalSolicitudes(current.filter(s => s.id !== solicitudId));
  },

  // Purgar múltiples borradores vacíos detectados
  async purgeEmptyDrafts(ids) {
    if (!ids || ids.length === 0) return;
    for (const id of ids) {
      if (isFirebaseConfigured) {
        try {
          await deleteDoc(doc(db, 'solicitudes', id));
        } catch (e) {
          console.warn('Error purgando borrador basura de Firebase:', id, e);
        }
      }
    }
  },

  // Forzar verificación y obtención de solicitudes actualizadas desde Firebase
  async refreshSolicitudes() {
    if (isFirebaseConfigured) {
      try {
        const q = query(collection(db, 'solicitudes'), orderBy('fecha', 'desc'));
        const snap = await getDocs(q);
        const rawItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const validItems = [];
        const emptyDraftIds = [];
        for (const item of rawItems) {
          if (item.estado === 'borrador' && (!item.items || item.items.length === 0)) {
            emptyDraftIds.push(item.id);
          } else {
            validItems.push(item);
          }
        }

        if (emptyDraftIds.length > 0) {
          this.purgeEmptyDrafts(emptyDraftIds);
        }

        saveLocalSolicitudes(validItems);
        return validItems;
      } catch (err) {
        console.warn('Error al verificar nuevas solicitudes en Firebase:', err);
      }
    }
    return getLocalSolicitudes();
  },

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
                  // Si Matriz re-despacha los faltantes, alertar a la Sucursal origen
                  if (data.estado === 'faltantes_despachados' && data.usuarioSolicitante === currentUser.username) {
                    showNotification('Faltantes Despachados', `Matriz envió los productos faltantes del pedido ${folioTxt}. Revisa la caja entrante.`);
                  }
                  // Si Sucursal confirma recepción final con faltantes resueltos, alertar a Matriz
                  if (data.estado === 'recibida' && data.reporteFaltantes?.length > 0 && data.usuarioDestino === currentUser.username) {
                    showNotification('Faltantes Entregados', `La sucursal ${data.sucursalOrigen} confirmó la recepción de faltantes del pedido ${folioTxt}.`);
                  }
                }
              });
            } else {
              isInitialLoad = false;
            }

            const rawItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const validItems = [];
            const emptyDraftIds = [];
            for (const item of rawItems) {
              if (item.estado === 'borrador' && (!item.items || item.items.length === 0)) {
                emptyDraftIds.push(item.id);
              } else {
                validItems.push(item);
              }
            }

            if (emptyDraftIds.length > 0) {
              this.purgeEmptyDrafts(emptyDraftIds);
            }

            saveLocalSolicitudes(validItems);
            onUpdate(validItems);
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
    return list.find(s => s.usuarioSolicitante === username && s.estado === 'borrador' && s.items && s.items.length > 0) || null;
  },

  async saveDraft(solicitud) {
    // REGLA CRÍTICA: No guardar si no tiene al menos un producto agregado
    // Si está vacío, se elimina de inmediato para no generar borradores basura
    if (!solicitud || !solicitud.items || solicitud.items.length === 0) {
      if (solicitud && solicitud.id) {
        await this.deleteEmptyDraft(solicitud.id);
      }
      return null;
    }

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

  async completeSolicitud(solicitudId, folio = null) {
    const updateData = { estado: 'completada' };
    if (folio) {
      updateData.folio = folio;
    }

    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), updateData);
      } catch (err) {
        console.warn('Error completando solicitud en Firebase:', err);
      }
    }
    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s));
    return true;
  },

  async updateFolio(solicitudId, folio) {
    if (!solicitudId) return;
    const updateData = { folio: folio || '' };
    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), updateData);
      } catch (err) {
        console.warn('Error actualizando folio en Firebase:', err);
      }
    }
    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s));
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

  // Atender y despachar reporte de faltantes desde Bodega/Matriz
  async resolveReporteFaltantes(solicitudId, resolutionData) {
    if (!solicitudId) return false;
    const hasDispatchedItems = resolutionData?.itemsResolucion?.some(
      i => i.despachado && Number(i.cantidadDespachada || 0) > 0
    );
    const nuevoEstado = hasDispatchedItems ? 'faltantes_despachados' : 'cerrada_con_faltantes';

    const updatePayload = {
      estado: nuevoEstado,
      resolucionFaltantes: {
        fechaResolucion: new Date().toISOString(),
        usuarioResolucion: resolutionData.usuarioResolucion || '',
        folioEnvio: resolutionData.folioEnvio || '',
        notas: resolutionData.notas || '',
        itemsResolucion: resolutionData.itemsResolucion || []
      },
      fechaDespachoFaltantes: hasDispatchedItems ? new Date().toISOString() : null
    };

    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), updatePayload);
      } catch (err) {
        console.warn('Error guardando resolución de faltantes en Firebase:', err);
      }
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s));
    return true;
  },

  // Finalizar recepción del re-despacho de faltantes en sucursal
  async receiveFaltantes(solicitudId, receptionData = {}) {
    if (!solicitudId) return false;
    const itemsAunFaltantes = receptionData.itemsAunFaltantes || [];
    const nuevoEstado = itemsAunFaltantes.length > 0 ? 'cerrada_con_faltantes' : 'recibida';

    const updatePayload = {
      estado: nuevoEstado,
      recepcionFaltantes: {
        fechaRecepcion: new Date().toISOString(),
        usuarioRecepcion: receptionData.usuarioRecepcion || '',
        itemsRecibidos: receptionData.itemsRecibidos || [],
        itemsAunFaltantes: itemsAunFaltantes,
        notas: receptionData.notas || ''
      }
    };

    if (isFirebaseConfigured) {
      try {
        await updateDoc(doc(db, 'solicitudes', solicitudId), updatePayload);
      } catch (err) {
        console.warn('Error guardando recepción de faltantes en Firebase:', err);
      }
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s));
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

/**
 * Retorna el folio oficial si existe; si no, retorna la referencia basada en fecha y hora.
 */
export function formatTransferFolio(solicitud) {
  if (!solicitud) return '';
  if (solicitud.folio && typeof solicitud.folio === 'string' && solicitud.folio.trim()) {
    return solicitud.folio.trim();
  }
  if (solicitud.fecha) {
    try {
      const d = new Date(solicitud.fecha);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      }
    } catch {}
  }
  return 'Sin folio';
}
