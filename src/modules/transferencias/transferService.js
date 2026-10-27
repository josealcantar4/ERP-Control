import { db, isFirebaseConfigured } from '../../config/firebase';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs
} from 'firebase/firestore';
import { catalogService } from '../catalogo/catalogService';

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

// ============================================================================
// MOTOR DE AUDIO Y NOTIFICACIONES MULTIPLATAFORMA (DESKTOP + MÓVIL PWA)
// Resuelve las restricciones de Autoplay en iOS WebKit y Android Chrome mediante
// Web Audio API buffer precargado + desbloqueo síncrono por gesto del usuario.
// ============================================================================
let sharedAudioCtx = null;
let notificationAudioBuffer = null;
let html5NotificationAudio = null;
let isAudioEngineUnlocked = false;

function getSharedAudioContext() {
  if (!sharedAudioCtx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  return sharedAudioCtx;
}

function getHtml5Audio() {
  if (!html5NotificationAudio && typeof Audio !== 'undefined') {
    html5NotificationAudio = new Audio('/notification.mp3');
    html5NotificationAudio.preload = 'auto';
  }
  return html5NotificationAudio;
}

// Cargar y decodificar el MP3 en memoria de forma asíncrona
async function preloadNotificationBuffer() {
  if (notificationAudioBuffer) return notificationAudioBuffer;
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return null;
    const response = await fetch('/notification.mp3');
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    notificationAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return notificationAudioBuffer;
  } catch (_err) {
    // Si decodeAudioData falla inicialmente porque ctx está suspendido, se reintentará con el primer gesto
    return null;
  }
}

// Desbloqueo universal de audio para navegadores móviles (iOS Safari / Android Chrome)
export function unlockAudioEngine() {
  try {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Micro-reproducción silenciosa de Web Audio para desbloquear el subsistema en iOS y Android
    if (ctx) {
      const silentBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch (_e) {}

  // Desbloqueo dual de HTML5 Audio para compatibilidad total
  try {
    const audio = getHtml5Audio();
    if (audio) {
      const playPromise = audio.play();
      if (playPromise && playPromise.then) {
        playPromise.then(() => {
          audio.pause();
          audio.currentTime = 0;
          isAudioEngineUnlocked = true;
        }).catch(() => {});
      }
    }
  } catch (_e) {}

  // Si el buffer no se había cargado, precargarlo ahora que el usuario interactuó
  if (!notificationAudioBuffer) {
    preloadNotificationBuffer();
  }

  isAudioEngineUnlocked = true;
}

// Escuchar los gestos habituales en móviles y desktop
if (typeof window !== 'undefined') {
  const gestureEvents = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
  const handleUserGesture = () => {
    unlockAudioEngine();
  };

  gestureEvents.forEach((evt) => {
    window.addEventListener(evt, handleUserGesture, { passive: true });
  });

  // Cuando la app vuelve a primer plano tras estar minimizada o con pantalla bloqueada
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }
  });

  // Iniciar precarga de red al montar el script
  setTimeout(() => {
    preloadNotificationBuffer();
  }, 100);
}

function playNotificationChime() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.25, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);
  } catch (_e) {}
}

export function playNotificationSound() {
  let playedSuccessfully = false;

  // 1. Web Audio API con buffer decodificado en RAM (0 latencia, desbloqueado en móvil)
  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (notificationAudioBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = notificationAudioBuffer;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime);
        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        src.start(0);
        playedSuccessfully = true;
      } else {
        preloadNotificationBuffer().then((buf) => {
          if (buf && sharedAudioCtx) {
            const s = sharedAudioCtx.createBufferSource();
            s.buffer = buf;
            s.connect(sharedAudioCtx.destination);
            s.start(0);
          }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Audio] Error al reproducir buffer Web Audio:', err);
  }

  // 2. Elemento HTML5 Audio (refuerzo o fallback si Web Audio buffer aún no estaba cargado)
  if (!playedSuccessfully) {
    try {
      const audio = getHtml5Audio();
      if (audio) {
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(() => {
            playNotificationChime();
          });
        }
        playedSuccessfully = true;
      }
    } catch (_e) {
      playNotificationChime();
    }
  }

  // 3. Fallback sintetizador de chimes en caso extremo
  if (!playedSuccessfully) {
    playNotificationChime();
  }
}

function showNotification(title, body) {
  playNotificationSound();
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([150, 75, 150, 75, 200]);
    } catch (_e) {}
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    // En navegadores móviles (Android Chrome), 'new Notification()' lanza Illegal Constructor.
    // Se debe invocar a través del ServiceWorkerRegistration activo.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => {
          reg.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/notification-badge-96x96.png',
            sound: '/notification.mp3',
            vibrate: [150, 75, 150, 75, 200],
            tag: 'erp-transfer-' + Date.now(),
            renotify: true,
            data: { url: '/' }
          });
        })
        .catch(() => {
          try {
            new Notification(title, { body, icon: '/pwa-192x192.png' });
          } catch (_) {}
        });
    } else {
      try {
        new Notification(title, { body, icon: '/pwa-192x192.png' });
      } catch (_) {}
    }
  }
}

// ============================================================================
// GESTOR SINGLETON DE NOTIFICACIONES Y SUSCRIPCIÓN EN TIEMPO REAL
// Previene repetición de notificaciones al cambiar de módulo o recargar.
// ============================================================================
const NOTIFIED_STORAGE_KEY = 'erp_notified_event_keys';
const DISMISSED_NOTIFS_STORAGE_KEY = 'erp_dismissed_notifications';

export function getDismissedNotifications() {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIFS_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (_) {}
  return new Set();
}

export function dismissNotification(notifId) {
  if (!notifId) return;
  try {
    const set = getDismissedNotifications();
    set.add(notifId);
    const arr = Array.from(set).slice(-500); // Mantener un máximo de 500 llaves recientes
    localStorage.setItem(DISMISSED_NOTIFS_STORAGE_KEY, JSON.stringify(arr));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp_notifications_dismissed', { detail: { notifId } }));
    }
  } catch (_) {}
}

function getNotifiedEventKeys() {
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (_) {}
  return new Set();
}

function markEventAsNotified(key) {
  try {
    const keys = getNotifiedEventKeys();
    keys.add(key);
    const arr = Array.from(keys).slice(-400); // Mantener un máximo de 400 llaves recientes
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(arr));
  } catch (_) {}
}

function hasEventBeenNotified(key) {
  return getNotifiedEventKeys().has(key);
}

const activeSolicitudesCallbacks = new Set();
let globalSolicitudesUnsub = null;
let isInitialSolicitudesLoad = true;
let cachedSolicitudesList = null;
let cachedActiveUser = null;
const knownDocStates = new Map();

function getActiveUserForNotifications() {
  if (cachedActiveUser && cachedActiveUser.username) return cachedActiveUser;
  try {
    return JSON.parse(localStorage.getItem('erp_current_user') || '{}');
  } catch {
    return {};
  }
}

function ensureGlobalSolicitudesSubscription() {
  if (globalSolicitudesUnsub || !isFirebaseConfigured) return;

  try {
    const q = query(collection(db, 'solicitudes'), orderBy('fecha', 'desc'));
    globalSolicitudesUnsub = onSnapshot(
      q,
      (snap) => {
        // 1. Carga inicial: pre-sembrar todos los estados de órdenes existentes como ya conocidos
        if (isInitialSolicitudesLoad) {
          snap.docs.forEach(d => {
            const data = d.data();
            if (data && data.estado) {
              knownDocStates.set(d.id, data.estado);
              // Pre-sembrar para que NUNCA suene o notifique pedidos que ya existían previamente
              markEventAsNotified(`solicitud_${d.id}_${data.estado}`);
            }
          });
          isInitialSolicitudesLoad = false;
        } else {
          // 2. Evaluador de eventos en vivo posteriores a la carga inicial
          const activeUser = getActiveUserForNotifications();
          const uName = (activeUser.username || '').toLowerCase();
          const uSede = (activeUser.sede || '').toLowerCase();
          const uArea = (activeUser.area || '').toLowerCase();
          const isAdmin = uName === 'administrador' || activeUser.roles?.includes('admin');
          const isPatente = uArea.includes('patente');
          const isGenerico = uArea.includes('generic') || uArea.includes('genéric');

          snap.docChanges().forEach(change => {
            if (change.type === 'added' || change.type === 'modified') {
              const data = change.doc.data();
              const docId = change.doc.id;
              if (!data || data.estado === 'borrador') return;

              const prevStatus = knownDocStates.get(docId);
              knownDocStates.set(docId, data.estado);

              // Si es modificación pero el estado no cambió, ignorar para evitar duplicados
              if (change.type === 'modified' && prevStatus === data.estado) {
                return;
              }

              const notifKey = `solicitud_${docId}_${data.estado}`;
              if (hasEventBeenNotified(notifKey)) {
                return; // Ya se alertó este evento previamente en este dispositivo
              }

              const folioTxt = data.folio || 'Sin Folio';
              const destUser = (data.usuarioDestino || '').toLowerCase();
              const destSede = (data.sucursalDestino || '').toLowerCase();
              const destArea = (data.areaDestino || '').toLowerCase();
              const solUser = (data.usuarioSolicitante || '').toLowerCase();
              const solSede = (data.sucursalOrigen || '').toLowerCase();
              const solArea = (data.areaOrigen || '').toLowerCase();
              const uRoles = cachedActiveUser?.roles || [];
              const canDispatch = uRoles.includes('despachar') || isAdmin;

              // Helper de coincidencia de área de destino
              const matchesDestArea = !destArea || !uArea || destArea === uArea ||
                (isPatente && destArea.includes('patente')) ||
                (isGenerico && (destArea.includes('generic') || destArea.includes('genéric')));

              // 1. Si entra una solicitud nueva, alertar a los despachadores de la sede/área destino
              if (data.estado === 'enviada') {
                const isForMe =
                  isAdmin ||
                  (canDispatch && solUser !== uName && (
                    destUser === uName ||
                    ((!destSede || destSede === uSede) && matchesDestArea)
                  ));

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const fromTxt = data.areaOrigen
                    ? `${data.sucursalOrigen} (${data.areaOrigen})`
                    : (data.sucursalOrigen || 'Sucursal');
                  const destTxt = data.areaDestino ? ` para ${data.areaDestino}` : '';
                  showNotification('Nueva Solicitud Recibida', `${fromTxt} ha solicitado el pedido ${folioTxt}${destTxt}.`);
                }
              }

              // 2. Si se despacha la caja, alertar al solicitante / área origen
              if (data.estado === 'completada') {
                const matchesSolArea = !solArea || !uArea || solArea === uArea;
                const isForMyBranch =
                  isAdmin ||
                  solUser === uName ||
                  ((uSede && solSede === uSede) && matchesSolArea && (data.usuarioDespacho || '').toLowerCase() !== uName);

                if (isForMyBranch) {
                  markEventAsNotified(notifKey);
                  const originSender = data.sucursalDestino
                    ? `${data.sucursalDestino}${data.areaDestino ? ` (${data.areaDestino})` : ''}`
                    : (data.areaDestino || 'Bodega');
                  const msg = data.esDespachoDirecto || data.sinSolicitud
                    ? `${originSender} envió un pedido directo (${folioTxt}) para tu área.`
                    : `Tu pedido ${folioTxt} ha sido enviado por ${originSender}. Listo para recibir.`;
                  showNotification('Pedido Despachado en Camino', msg);
                }
              }

              // 3. Si hay faltantes, alertar al área que despachó
              if (data.estado === 'recibida_incompleta') {
                const isForMe =
                  isAdmin ||
                  destUser === uName ||
                  (canDispatch && (!destSede || destSede === uSede) && matchesDestArea);

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const fromTxt = data.areaOrigen
                    ? `${data.sucursalOrigen} (${data.areaOrigen})`
                    : (data.sucursalOrigen || 'Sucursal');
                  showNotification('Reporte de Inconsistencia', `${fromTxt} reportó faltantes en el pedido ${folioTxt}.`);
                }
              }

              // 4. Si se re-despachan los faltantes, alertar al solicitante / área origen
              if (data.estado === 'faltantes_despachados') {
                const matchesSolArea = !solArea || !uArea || solArea === uArea;
                const isForMyBranch =
                  isAdmin ||
                  solUser === uName ||
                  ((uSede && solSede === uSede) && matchesSolArea);

                if (isForMyBranch) {
                  markEventAsNotified(notifKey);
                  showNotification('Faltantes Despachados', `Se enviaron los productos faltantes del pedido ${folioTxt}. Revisa la caja entrante.`);
                }
              }

              // 5. Si Sucursal confirma recepción final con faltantes resueltos, alertar a despachador
              if (data.estado === 'recibida' && data.reporteFaltantes?.length > 0) {
                const isForMe =
                  isAdmin ||
                  destUser === uName ||
                  (canDispatch && (!destSede || destSede === uSede) && matchesDestArea);

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const fromTxt = data.areaOrigen
                    ? `${data.sucursalOrigen} (${data.areaOrigen})`
                    : (data.sucursalOrigen || 'Sucursal');
                  showNotification('Faltantes Entregados', `${fromTxt} confirmó la recepción de faltantes del pedido ${folioTxt}.`);
                }
              }
            }
          });
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
          transferService.purgeEmptyDrafts(emptyDraftIds);
        }

        cachedSolicitudesList = validItems;
        saveLocalSolicitudes(validItems);

        // Distribuir datos a todos los escuchadores activos
        activeSolicitudesCallbacks.forEach(cb => {
          try {
            cb(validItems);
          } catch (e) {
            console.warn('Error en callback de solicitudes:', e);
          }
        });
      },
      (err) => {
        console.warn('Fallback a almacenamiento local de solicitudes en Firebase:', err);
        const fallback = getLocalSolicitudes();
        activeSolicitudesCallbacks.forEach(cb => {
          try {
            cb(fallback);
          } catch (_) {}
        });
      }
    );
  } catch (err) {
    console.warn('Error iniciando suscripción global de solicitudes en Firebase:', err);
  }
}

export const transferService = {
  getLocalSolicitudes() {
    return cachedSolicitudesList || getLocalSolicitudes();
  },

  // Resetear suscripción (usado en logout para reiniciar de forma limpia)
  resetSolicitudesSubscription() {
    if (globalSolicitudesUnsub) {
      try {
        globalSolicitudesUnsub();
      } catch (_) {}
      globalSolicitudesUnsub = null;
    }
    activeSolicitudesCallbacks.clear();
    isInitialSolicitudesLoad = true;
    cachedSolicitudesList = null;
    cachedActiveUser = null;
    knownDocStates.clear();
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

  subscribeSolicitudes(onUpdate, userParam = null) {
    if (userParam && userParam.username) {
      cachedActiveUser = userParam;
    }

    // 1. Entregar inmediatamente los datos actuales en caché o memoria local
    const initial = cachedSolicitudesList || getLocalSolicitudes();
    if (initial && initial.length >= 0) {
      try {
        onUpdate(initial);
      } catch (_) {}
    }

    // 2. Registrar este callback en el conjunto de escuchadores activos del singleton
    activeSolicitudesCallbacks.add(onUpdate);

    // 3. Asegurar que la única suscripción central a Firebase esté activa
    ensureGlobalSolicitudesSubscription();

    // 4. Retornar función de desuscripción limpia
    return () => {
      activeSolicitudesCallbacks.delete(onUpdate);
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
      areaOrigen: solicitud.areaOrigen || '',
      sucursalDestino: solicitud.sucursalDestino || '',
      areaDestino: solicitud.areaDestino || '',
      usuarioSolicitante: solicitud.usuarioSolicitante || '',
      usuarioDestino: solicitud.usuarioDestino || '',
      esTransferenciaInterna: Boolean(solicitud.esTransferenciaInterna || (solicitud.sucursalOrigen && solicitud.sucursalOrigen === solicitud.sucursalDestino)),
      estado: 'borrador',
      fecha: solicitud.fecha || new Date().toISOString(),
      items: solicitud.items || []
    };

    // Auto-registrar productos en el Catálogo Limpio de Firestore
    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items);
    }

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

    // Auto-registrar producto extra en el Catálogo Limpio
    if (extraItem?.codigo && extraItem?.descripcion) {
      catalogService.saveToCleanCatalog(extraItem.codigo, extraItem.descripcion);
    }

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

  async updateExtraItemQty(solicitudId, itemIndex, newQty) {
    const qty = Number(newQty);
    if (qty <= 0) {
      return this.removeExtraItem(solicitudId, itemIndex);
    }

    if (isFirebaseConfigured) {
      try {
        const docRef = doc(db, 'solicitudes', solicitudId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const items = [...(snap.data().items || [])];
          if (items[itemIndex] && items[itemIndex].esExtra) {
            items[itemIndex].cantidadDespachada = qty;
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
          items[itemIndex] = { ...items[itemIndex], cantidadDespachada: qty };
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

  // Despacho directo de productos sin haber recibido una solicitud previa
  async createDirectDispatch(dispatchData) {
    const docData = {
      id: dispatchData.id || ('disp-' + Date.now()),
      folio: dispatchData.folio || '',
      sucursalOrigen: dispatchData.sucursalOrigen || '',
      areaOrigen: dispatchData.areaOrigen || '',
      sucursalDestino: dispatchData.sucursalDestino || '',
      areaDestino: dispatchData.areaDestino || '',
      usuarioSolicitante: dispatchData.usuarioSolicitante || dispatchData.sucursalOrigen || 'Despacho Directo',
      usuarioDestino: dispatchData.usuarioDestino || '',
      usuarioDespacho: dispatchData.usuarioDespacho || '',
      esTransferenciaInterna: Boolean(
        dispatchData.esTransferenciaInterna ||
        (dispatchData.sucursalOrigen && dispatchData.sucursalDestino && dispatchData.sucursalOrigen === dispatchData.sucursalDestino)
      ),
      estado: 'completada',
      sinSolicitud: true,
      esDespachoDirecto: true,
      observaciones: dispatchData.observaciones || 'Pedido despachado sin haber sido solicitado',
      fecha: new Date().toISOString(),
      fechaDespacho: new Date().toISOString(),
      items: (dispatchData.items || []).map(item => ({
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidadSolicitada: 0,
        cantidadDespachada: Number(item.cantidad || item.cantidadDespachada || 1),
        atendido: true,
        esExtra: false
      }))
    };

    // Auto-registrar productos de despacho directo en el Catálogo Limpio
    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items);
    }

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', docData.id), docData, { merge: true });
      } catch (err) {
        console.warn('Error guardando despacho directo en Firebase:', err);
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

  // Guardar borrador en captura de un despacho directo
  async saveDirectDispatchDraft(draft) {
    if (!draft || !draft.items || draft.items.length === 0) {
      if (draft && draft.id) {
        await this.deleteEmptyDraft(draft.id);
      }
      return null;
    }

    const docData = {
      id: draft.id || ('disp-draft-' + Date.now()),
      folio: draft.folio || '',
      sucursalOrigen: draft.sucursalOrigen || '',
      usuarioSolicitante: draft.sucursalOrigen || 'Despacho Directo',
      usuarioDestino: draft.usuarioDestino || '',
      usuarioDespacho: draft.usuarioDespacho || '',
      areaOrigen: draft.areaOrigen || '',
      sucursalDestino: draft.sucursalDestino || '',
      areaDestino: draft.areaDestino || '',
      esTransferenciaInterna: Boolean(
        draft.esTransferenciaInterna ||
        (draft.sucursalOrigen && draft.sucursalDestino && draft.sucursalOrigen === draft.sucursalDestino)
      ),
      estado: 'borrador',
      sinSolicitud: true,
      esDespachoDirecto: true,
      observaciones: draft.observaciones || 'Pedido despachado sin haber sido solicitado',
      fecha: draft.fecha || new Date().toISOString(),
      items: (draft.items || []).map(item => ({
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidadSolicitada: 0,
        cantidadDespachada: Number(item.cantidad || item.cantidadDespachada || 1),
        atendido: true,
        esExtra: false
      }))
    };

    // Auto-registrar productos del borrador en el Catálogo Limpio
    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items);
    }

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', docData.id), docData, { merge: true });
      } catch (err) {
        console.warn('Error guardando borrador de despacho directo en Firebase:', err);
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
  },

  calculateTransferNotifications(solicitudes = [], currentUser = null) {
    if (!currentUser || !Array.isArray(solicitudes)) return [];

    const username = (currentUser.username || '').toLowerCase().trim();
    const userSede = (currentUser.sede || '').toLowerCase().trim();
    const userArea = (currentUser.area || '').toLowerCase().trim();
    const uRoles = currentUser?.roles || [];
    const isAdmin = username === 'administrador' || uRoles.includes('admin');
    const canDispatch = uRoles.includes('despachar') || isAdmin;
    const canReceive = uRoles.includes('recibir') || uRoles.includes('solicitar') || isAdmin;
    const isPatente = userArea.includes('patente');
    const isGenerico = userArea.includes('generic') || userArea.includes('genéric');

    const notifs = [];

    solicitudes.forEach(s => {
      if (!s || s.estado === 'borrador') return;

      const solFolio = s.folio || 'Sin Folio';
      const itemsCount = s.items?.length || 0;
      const destUser = (s.usuarioDestino || '').toLowerCase().trim();
      const destSede = (s.sucursalDestino || '').toLowerCase().trim();
      const destArea = (s.areaDestino || '').toLowerCase().trim();
      const solUser = (s.usuarioSolicitante || '').toLowerCase().trim();
      const solSede = (s.sucursalOrigen || '').toLowerCase().trim();
      const solArea = (s.areaOrigen || '').toLowerCase().trim();

      // Coincidencia con área de destino (quien atiende/despacha):
      const matchesDestArea = !destArea || !userArea || destArea === userArea ||
        (isPatente && destArea.includes('patente')) ||
        (isGenerico && (destArea.includes('generic') || destArea.includes('genéric')));

      // Coincidencia con área de origen (quien solicitó/recibe):
      const matchesSolArea = !solArea || !userArea || solArea === userArea;

      // 1. NOTIFICACIÓN: Solicitud recibida pendiente de atender (para Despachadores de la sede/área destino)
      if (s.estado === 'enviada' || s.estado === 'en_despacho') {
        const isForMe =
          isAdmin ||
          (canDispatch && solUser !== username && (
            destUser === username ||
            ((!destSede || destSede === userSede) && matchesDestArea)
          ));

        if (isForMe) {
          const fromTxt = s.areaOrigen
            ? `${s.sucursalOrigen} (${s.areaOrigen})`
            : (s.sucursalOrigen || 'Sucursal');
          const destTxt = s.areaDestino ? ` para ${s.areaDestino}` : '';
          const isSurtido = s.estado === 'en_despacho';

          notifs.push({
            id: `tr-env-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'nueva_solicitud',
            titulo: isSurtido ? `En Surtido: ${fromTxt}` : `Solicitud de ${fromTxt}`,
            subtitulo: `Folio: ${solFolio}`,
            mensaje: isSurtido
              ? `${fromTxt} tiene un pedido en proceso de surtido (${itemsCount} productos)${destTxt}.`
              : `${fromTxt} solicita ${itemsCount} producto(s) para surtido${destTxt}.`,
            fecha: s.fecha || new Date().toISOString(),
            solicitud: s,
            actionScreen: 'despachar',
            actionText: isSurtido ? 'Continuar Despacho' : 'Atender en Despacho'
          });
        }
      }

      // 2. NOTIFICACIÓN: Pedido despachado en camino (para Sucursal / Farmacia / Área origen)
      if (s.estado === 'completada') {
        const isForMyBranch =
          isAdmin ||
          solUser === username ||
          (canReceive && (!userSede || solSede === userSede) && matchesSolArea && (s.usuarioDespacho || '').toLowerCase() !== username);

        if (isForMyBranch) {
          const isDirect = s.esDespachoDirecto || s.sinSolicitud;
          const originSender = s.sucursalDestino
            ? `${s.sucursalDestino}${s.areaDestino ? ` (${s.areaDestino})` : ''}`
            : (s.areaDestino || 'Bodega');

          notifs.push({
            id: `tr-comp-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'caja_despachada',
            titulo: isDirect ? `Despacho Directo (${solFolio})` : `Pedido Despachado (${solFolio})`,
            subtitulo: isDirect ? 'Envío sin solicitud previa' : `De: ${originSender}`,
            mensaje: isDirect
              ? `${originSender} envió un pedido directo con ${itemsCount} producto(s) (${solFolio}). Listo para recibir.`
              : `Tu pedido con folio ${solFolio} (${itemsCount} productos) está en camino desde ${originSender}. Listo para recibir.`,
            fecha: s.fechaDespacho || s.fecha || new Date().toISOString(),
            solicitud: s,
            actionScreen: 'recibir',
            actionText: 'Recibir Caja'
          });
        }
      }

      // 3. NOTIFICACIÓN: Inconsistencias o faltantes reportados (para Despachador de la sede que surtió)
      if (s.estado === 'recibida_incompleta') {
        const isForMe =
          isAdmin ||
          destUser === username ||
          (canDispatch && (!destSede || destSede === userSede) && matchesDestArea);

        if (isForMe) {
          const fromTxt = s.areaOrigen
            ? `${s.sucursalOrigen} (${s.areaOrigen})`
            : (s.sucursalOrigen || 'Sucursal');

          notifs.push({
            id: `tr-falt-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'reporte_faltantes',
            titulo: `Faltantes: ${fromTxt}`,
            subtitulo: `Folio: ${solFolio}`,
            mensaje: `${fromTxt} reportó productos faltantes en el folio ${solFolio}. Requiere re-despacho de faltantes.`,
            fecha: s.fechaReporteFaltantes || s.fecha || new Date().toISOString(),
            solicitud: s,
            actionScreen: 'despachar',
            actionText: 'Revisar Faltantes'
          });
        }
      }

      // 4. NOTIFICACIÓN: Faltantes re-despachados en camino (para Sucursal / Área origen)
      if (s.estado === 'faltantes_despachados') {
        const isForMyBranch =
          isAdmin ||
          solUser === username ||
          (canReceive && (!userSede || solSede === userSede) && matchesSolArea);

        if (isForMyBranch) {
          notifs.push({
            id: `tr-falt-env-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'faltantes_despachados',
            titulo: `Faltantes en Camino (${solFolio})`,
            subtitulo: `Pedido: ${solFolio}`,
            mensaje: `Se enviaron los productos pendientes del folio ${solFolio}. Revisa la caja entrante.`,
            fecha: s.resolucionFaltantes?.fechaDespacho || s.fechaDespacho || s.fecha || new Date().toISOString(),
            solicitud: s,
            actionScreen: 'recibir',
            actionText: 'Verificar Faltantes'
          });
        }
      }

      // 5. NOTIFICACIÓN: Confirmación de recepción de faltantes entregados (para Despachador)
      if (s.estado === 'recibida' && s.reporteFaltantes?.length > 0) {
        const isForMe =
          isAdmin ||
          destUser === username ||
          (canDispatch && (!destSede || destSede === userSede) && matchesDestArea);

        if (isForMe) {
          const fromTxt = s.areaOrigen
            ? `${s.sucursalOrigen} (${s.areaOrigen})`
            : (s.sucursalOrigen || 'Sucursal');

          notifs.push({
            id: `tr-falt-entregados-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'faltantes_entregados',
            titulo: `Faltantes Entregados (${solFolio})`,
            subtitulo: `Confirmado por: ${fromTxt}`,
            mensaje: `${fromTxt} confirmó la recepción de faltantes del pedido ${solFolio}. El pedido ha concluido y fue cerrado con éxito.`,
            fecha: s.recepcionFaltantes?.fecha || s.fechaRecepcion || s.fecha || new Date().toISOString(),
            solicitud: s,
            actionScreen: 'despachar',
            actionText: 'Ver Detalle'
          });
        }
      }
    });

    const dismissedSet = getDismissedNotifications();
    return notifs
      .filter(n => !dismissedSet.has(n.id))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  },

  playNotificationSound,
  unlockAudioEngine,
  dismissNotification,
  getDismissedNotifications
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
