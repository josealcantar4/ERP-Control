import { db, isFirebaseConfigured } from '../../config/firebase';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs
} from 'firebase/firestore';
import { catalogService } from '../catalogo/catalogService';

const LOCAL_STORAGE_KEY = 'erp_control_solicitudes';
const DELETED_SOLICITUDES_STORAGE_KEY = 'erp_deleted_solicitudes_ids';

function getDeletedSolicitudesIds() {
  try {
    const raw = localStorage.getItem(DELETED_SOLICITUDES_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markSolicitudAsDeleted(id) {
  if (!id) return;
  try {
    const set = getDeletedSolicitudesIds();
    set.add(id);
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(DELETED_SOLICITUDES_STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('Error guardando tombstone de solicitud:', e);
  }
}

function unmarkSolicitudAsDeleted(id) {
  if (!id) return;
  try {
    const set = getDeletedSolicitudesIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(DELETED_SOLICITUDES_STORAGE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {}
}

const activeSolicitudesCallbacks = new Set();
let globalSolicitudesUnsub = null;
let isInitialSolicitudesLoad = true;
let cachedSolicitudesList = null;
let cachedActiveUser = null;
const knownDocStates = new Map();

// Jerarquía de avance de estados de una transferencia
const STATUS_WEIGHT = {
  'borrador': 1,
  'enviada': 2,
  'en_despacho': 3,
  'completada': 4,
  'recibida_incompleta': 5,
  'faltantes_despachados': 6,
  'recibida': 7,
  'cerrada_con_faltantes': 8
};

// Sanitizador estricto para Firebase Firestore
// Convierte a JSON plano eliminando valores undefined para evitar errores de SDK
function cleanForFirestore(data) {
  if (data === undefined || data === null) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    return value === undefined ? null : value;
  }));
}

function getLocalSolicitudes() {
  const deletedIds = getDeletedSolicitudesIds();
  if (cachedSolicitudesList && Array.isArray(cachedSolicitudesList)) {
    return cachedSolicitudesList.filter(s => !deletedIds.has(s.id));
  }
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (raw) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        // Excluir automáticamente cualquier borrador sin productos ("borrador basura") y los eliminados
        const clean = list.filter(s => !deletedIds.has(s.id) && !(s.estado === 'borrador' && (!s.items || s.items.length === 0)));
        cachedSolicitudesList = clean;
        return clean;
      }
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

function saveLocalSolicitudes(list) {
  const deletedIds = getDeletedSolicitudesIds();
  // Asegurar que nunca se persistan en el almacenamiento local borradores vacíos ni eliminados
  const cleanList = (list || []).filter(s => !deletedIds.has(s.id) && !(s.estado === 'borrador' && (!s.items || s.items.length === 0)));
  cachedSolicitudesList = cleanList;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanList));
  window.dispatchEvent(new Event('erp_solicitudes_changed'));
  activeSolicitudesCallbacks.forEach(cb => {
    try {
      cb(cleanList);
    } catch (e) {
      console.warn('Error en callback de solicitudes:', e);
    }
  });
}

// ============================================================================
// MOTOR DE AUDIO Y NOTIFICACIONES MULTIPLATAFORMA (DESKTOP + MÓVIL PWA)
// Resuelve las restricciones de Autoplay en iOS WebKit y Android Chrome mediante
// Web Audio API buffer precargado + desbloqueo síncrono por gesto del usuario.
// ============================================================================
let sharedAudioCtx = null;
let notificationAudioBuffer = null;
let html5NotificationAudio = null;
let checkAudioBuffer = null;
let html5CheckAudio = null;
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

function getHtml5CheckAudio() {
  if (!html5CheckAudio && typeof Audio !== 'undefined') {
    html5CheckAudio = new Audio('/check.mp3');
    html5CheckAudio.preload = 'auto';
  }
  return html5CheckAudio;
}

// Cargar y decodificar el MP3 de notificación en memoria de forma asíncrona
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

// Cargar y decodificar el MP3 de marcado/check en memoria RAM
async function preloadCheckBuffer() {
  if (checkAudioBuffer) return checkAudioBuffer;
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return null;
    const response = await fetch('/check.mp3');
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    checkAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return checkAudioBuffer;
  } catch (_err) {
    return null;
  }
}

// Desbloqueo universal de audio para navegadores móviles (iOS Safari / Android Chrome)
export function unlockAudioEngine() {
  if (isAudioEngineUnlocked) return;

  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Micro-reproducción silenciosa de Web Audio para desbloquear el subsistema en iOS y Android
      // 1 muestra vacía a 22050Hz = 0.00004s de silencio absoluto (sin reproducir ningún archivo ni sonido audible)
      const silentBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch (_e) {}

  // Si los buffers no se habían cargado, precargarlos en memoria RAM de forma silenciosa
  if (!notificationAudioBuffer) {
    preloadNotificationBuffer();
  }
  if (!checkAudioBuffer) {
    preloadCheckBuffer();
  }

  isAudioEngineUnlocked = true;
}

// Escuchar el PRIMER gesto habitual en móviles y desktop para autorizar el AudioContext
if (typeof window !== 'undefined') {
  const gestureEvents = ['touchstart', 'pointerdown', 'click', 'keydown'];
  const handleUserGesture = () => {
    unlockAudioEngine();
    // Remover los listeners inmediatamente después del primer gesto para que no se ejecute en cada toque
    gestureEvents.forEach((evt) => {
      window.removeEventListener(evt, handleUserGesture);
    });
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
    preloadCheckBuffer();
  }, 100);
}

function playCheckChime() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch (_e) {}
}

/**
 * Reproduce el sonido de confirmación al marcar/seleccionar un elemento en listas
 * (despacho, surtido, recepción física de caja, etc.).
 * Implementado con Web Audio API buffer decodificado en RAM (0ms de latencia, polifónico).
 */
export function playCheckSound() {
  let playedSuccessfully = false;

  // 1. Web Audio API con buffer en RAM (latencia 0ms, polifónico, sin cortes)
  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (checkAudioBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = checkAudioBuffer;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.95, ctx.currentTime);
        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        src.start(0);
        playedSuccessfully = true;
      } else {
        preloadCheckBuffer().then((buf) => {
          if (buf && sharedAudioCtx) {
            const s = sharedAudioCtx.createBufferSource();
            s.buffer = buf;
            const g = sharedAudioCtx.createGain();
            g.gain.setValueAtTime(0.95, sharedAudioCtx.currentTime);
            s.connect(g);
            g.connect(sharedAudioCtx.destination);
            s.start(0);
          }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Audio] Error al reproducir buffer check:', err);
  }

  // 2. Elemento HTML5 Audio como refuerzo/fallback
  if (!playedSuccessfully) {
    try {
      const audio = getHtml5CheckAudio();
      if (audio) {
        audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) {
          p.catch(() => {
            playCheckChime();
          });
        }
        playedSuccessfully = true;
      }
    } catch (_e) {
      playCheckChime();
    }
  }

  // 3. Fallback sintetizado si ambos fallan
  if (!playedSuccessfully) {
    playCheckChime();
  }
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

export function undismissNotification(notifId) {
  if (!notifId) return;
  try {
    const set = getDismissedNotifications();
    if (set.has(notifId)) {
      set.delete(notifId);
      const arr = Array.from(set);
      localStorage.setItem(DISMISSED_NOTIFS_STORAGE_KEY, JSON.stringify(arr));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp_notifications_updated'));
      }
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

// ============================================================================
// REGLAS UNIFICADAS DE PRIVACIDAD, FILTRADO Y PARTICIPANTES (SEDES Y ÁREAS)
// ============================================================================
export function isAreaExcludedFromTransfers(areaName) {
  if (!areaName) return false;
  try {
    const raw = localStorage.getItem('erp_control_areas');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const found = list.find(a => a.nombre?.toLowerCase() === areaName.toLowerCase());
        return Boolean(found?.excluirTransferencias);
      }
    }
  } catch (_) {}
  return false;
}

export function getTransferParticipants(transfer) {
  if (!transfer) {
    return {
      recipientSede: '',
      recipientArea: '',
      recipientUser: '',
      dispatchSede: '',
      dispatchArea: '',
      dispatchUser: '',
      isDirect: false
    };
  }

  const isDirect = Boolean(transfer.esDespachoDirecto || transfer.sinSolicitud);

  if (isDirect) {
    // En despacho directo: la sede y área receptora representan el destino físico de la entrega.
    const recipientSede = (transfer.sucursalReceptora || transfer.sucursalOrigen || '').trim();
    const recipientArea = (transfer.areaReceptora !== undefined && transfer.areaReceptora !== null
      ? transfer.areaReceptora
      : (transfer.areaOrigen || '')).trim();
    const recipientUser = (transfer.usuarioDestino || '').trim();

    // La sede y área despachadora representan el origen que surtió los productos.
    const dispatchSede = (transfer.sucursalDespachadora || transfer.sucursalDestino || '').trim();
    const dispatchArea = (transfer.areaDespachadora !== undefined && transfer.areaDespachadora !== null
      ? transfer.areaDespachadora
      : (transfer.areaDestino || '')).trim();
    const dispatchUser = (transfer.usuarioDespacho || '').trim();

    return {
      recipientSede,
      recipientArea,
      recipientUser,
      dispatchSede,
      dispatchArea,
      dispatchUser,
      isDirect: true
    };
  } else {
    // En transferencia estándar (por solicitud previa):
    // Origen = quien solicitó y ahora recibirá la caja.
    // Destino = quien despachó el pedido.
    const recipientSede = (transfer.sucursalOrigen || '').trim();
    const recipientArea = (transfer.areaOrigen || '').trim();
    const recipientUser = (transfer.usuarioSolicitante || '').trim();

    const dispatchSede = (transfer.sucursalDestino || '').trim();
    const dispatchArea = (transfer.areaDestino || '').trim();
    const dispatchUser = (transfer.usuarioDestino || transfer.usuarioDespacho || '').trim();

    return {
      recipientSede,
      recipientArea,
      recipientUser,
      dispatchSede,
      dispatchArea,
      dispatchUser,
      isDirect: false
    };
  }
}

export function canUserViewInSolicitar(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';

  // 1. Usuarios excluidos o en áreas administrativas no ven solicitudes operativas
  if (currentUser.excluirDestinatario) return false;
  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) return false;

  // 2. Requiere rol de solicitar
  const uRoles = currentUser.roles || [];
  if (!uRoles.includes('solicitar') && !isRootAdmin) return false;

  // Despachos directos no se listan en el historial de solicitudes enviadas (se reciben en Recibir)
  if (transfer.esDespachoDirecto || transfer.sinSolicitud) return false;

  if (transfer.usuarioSolicitante && transfer.usuarioSolicitante.toLowerCase() === username) {
    return true;
  }

  if (transfer.estado === 'borrador') {
    return transfer.usuarioSolicitante && transfer.usuarioSolicitante.toLowerCase() === username;
  }

  const userSede = (currentUser.sede || '').toLowerCase().trim();
  const userArea = (currentUser.area || '').toLowerCase().trim();

  const { recipientSede, recipientArea } = getTransferParticipants(transfer);
  const solSede = recipientSede.toLowerCase();
  const solArea = recipientArea.toLowerCase();

  if (!userSede || solSede !== userSede) {
    if (isRootAdmin && !userSede) return true;
    return false;
  }

  if (solArea) {
    if (!userArea) return false;
    return solArea === userArea || solArea.includes(userArea) || userArea.includes(solArea);
  }

  return !userArea;
}

export function canUserDispatch(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';

  // 1. Si el área del usuario está excluida de transferencias, jamás despacha
  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) {
    return false;
  }

  // 2. Debe contar con rol operativo de 'despachar' (el rol 'admin' es solo para cuentas/sedes)
  const uRoles = currentUser.roles || [];
  if (!uRoles.includes('despachar') && !isRootAdmin) return false;

  const userSede = (currentUser.sede || '').toLowerCase().trim();
  const userArea = (currentUser.area || '').toLowerCase().trim();
  const isPatente = userArea.includes('patente');
  const isGenerico = userArea.includes('generic') || userArea.includes('genéric');

  const { dispatchSede, dispatchArea, dispatchUser } = getTransferParticipants(transfer);

  if (dispatchUser && dispatchUser.toLowerCase() === username) {
    return true;
  }

  if (transfer.usuarioDestino && transfer.usuarioDestino.toLowerCase() === username) {
    return true;
  }

  const dSede = dispatchSede.toLowerCase();
  const dArea = dispatchArea.toLowerCase();

  const matchesSede = !dSede
    ? (userSede.includes('matriz') || userSede === '' || isRootAdmin)
    : dSede === userSede;

  if (!matchesSede) {
    if (isRootAdmin && !userSede) return true;
    return false;
  }

  if (dArea) {
    if (!userArea) {
      if (isRootAdmin) return true;
      return false;
    }
    if (isPatente) return dArea.includes('patente');
    if (isGenerico) return dArea.includes('generic') || dArea.includes('genéric');
    return dArea === userArea || dArea.includes(userArea) || userArea.includes(dArea);
  }

  return true;
}

export function canUserReceive(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  if (transfer.estado !== 'completada' && transfer.estado !== 'faltantes_despachados') {
    return false;
  }

  // 1. Si el usuario está excluido como destinatario, JAMÁS recibe pedidos ni alertas de recepción
  if (currentUser.excluirDestinatario) {
    return false;
  }

  // 2. Si el área del usuario está marcada como excluida de transferencias (ej. administrativa), tampoco recibe
  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) {
    return false;
  }

  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';
  const uRoles = currentUser.roles || [];

  // 3. Debe contar con rol operativo de 'solicitar' o 'recibir' (el rol 'admin' es solo para cuentas/sedes)
  const hasReceiveRole = uRoles.includes('solicitar') || uRoles.includes('recibir');
  if (!hasReceiveRole && !isRootAdmin) {
    return false;
  }

  const userSede = (currentUser.sede || '').toLowerCase().trim();
  const userArea = (currentUser.area || '').toLowerCase().trim();

  const { recipientSede, recipientArea, recipientUser } = getTransferParticipants(transfer);
  const rSede = recipientSede.toLowerCase();
  const rArea = recipientArea.toLowerCase();

  // 4. Si el pedido fue dirigido a un usuario específico y es el actual
  if (recipientUser && recipientUser.toLowerCase() === username) {
    return true;
  }

  // 5. Coincidencia de Sede Receptora
  if (!userSede || rSede !== userSede) {
    if (isRootAdmin && !userSede) return true;
    return false;
  }

  // 6. Coincidencia de Sub-Área Receptora
  if (rArea) {
    // Si la transferencia va a un área específica (ej. "Farmacia"):
    if (!userArea) {
      if (isRootAdmin) return true;
      return false;
    }
    return rArea === userArea || rArea.includes(userArea) || userArea.includes(rArea);
  }

  // 7. Si la transferencia no tiene sub-área específica (va a toda la sucursal general / punto directo):
  // Cualquier usuario con rol en esa sucursal (no excluido) puede recibirla.
  return true;
}

function getActiveUserForNotifications() {
  try {
    const raw = localStorage.getItem('erp_current_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.username) return u;
    }
  } catch {}
  return cachedActiveUser || {};
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
              const solUser = (data.usuarioSolicitante || '').toLowerCase();
              const { recipientSede, recipientArea, dispatchSede, dispatchArea, isDirect } = getTransferParticipants(data);

              // 1. Si entra una solicitud nueva, alertar a los despachadores de la sede/área destino
              if (data.estado === 'enviada' || data.estado === 'en_despacho') {
                const isForMe = canUserDispatch(data, activeUser) && solUser !== uName;

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const fromTxt = recipientArea
                    ? `${recipientSede} (${recipientArea})`
                    : (recipientSede || 'Sucursal');
                  const destTxt = dispatchArea ? ` para ${dispatchArea}` : '';
                  showNotification('Nueva Solicitud Recibida', `${fromTxt} ha solicitado el pedido ${folioTxt}${destTxt}.`);
                }
              }

              // 2. Si se despacha la caja, alertar al solicitante / área origen
              if (data.estado === 'completada') {
                const isForMe = canUserReceive(data, activeUser) && (data.usuarioDespacho || '').toLowerCase() !== uName;

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const originSender = dispatchSede
                    ? `${dispatchSede}${dispatchArea ? ` (${dispatchArea})` : ''}`
                    : (dispatchArea || 'Bodega');
                  const msg = isDirect
                    ? `${originSender} envió un pedido directo (${folioTxt}) para tu área.`
                    : `Tu pedido ${folioTxt} ha sido enviado por ${originSender}. Listo para recibir.`;
                  showNotification('Pedido Despachado en Camino', msg);
                }
              }

              // 3. Si hay faltantes, alertar al área que despachó
              if (data.estado === 'recibida_incompleta') {
                const isForMe = canUserDispatch(data, activeUser);

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const fromTxt = recipientArea
                    ? `${recipientSede} (${recipientArea})`
                    : (recipientSede || 'Sucursal');
                  showNotification('Reporte de Inconsistencia', `${fromTxt} reportó faltantes en el pedido ${folioTxt}.`);
                }
              }

              // 4. Si se re-despachan los faltantes, alertar al solicitante / área origen
              if (data.estado === 'faltantes_despachados') {
                const isForMe = canUserReceive(data, activeUser);

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  showNotification('Faltantes Despachados', `Se enviaron los productos faltantes del pedido ${folioTxt}. Revisa la caja entrante.`);
                }
              }

              // 5. Si Sucursal confirma recepción final con faltantes resueltos o cerrada con faltantes, alertar a despachador
              if ((data.estado === 'recibida' || data.estado === 'cerrada_con_faltantes') && (data.reporteFaltantes?.length > 0 || data.resolucionFaltantes)) {
                const isForMe = canUserDispatch(data, activeUser);

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  const fromTxt = recipientArea
                    ? `${recipientSede} (${recipientArea})`
                    : (recipientSede || 'Sucursal');
                  const msg = data.estado === 'cerrada_con_faltantes'
                    ? `${fromTxt} finalizó la recepción de faltantes con observaciones. El pedido quedó cerrado.`
                    : `${fromTxt} confirmó la recepción de faltantes del pedido ${folioTxt}.`;
                  showNotification(data.estado === 'cerrada_con_faltantes' ? 'Recepción Finalizada' : 'Faltantes Entregados', msg);
                }
              }
            }
          });
        }

        const deletedIds = getDeletedSolicitudesIds();
        const rawItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const remoteMap = new Map();
        const validItems = [];
        const emptyDraftIds = [];

        for (const item of rawItems) {
          // Si el ID está en la lista de eliminados, ignorarlo y forzar borrado silencioso en Firebase si aún existe
          if (deletedIds.has(item.id)) {
            if (isFirebaseConfigured) {
              deleteDoc(doc(db, 'solicitudes', item.id)).catch(() => {});
            }
            continue;
          }

          if (item.estado === 'borrador' && (!item.items || item.items.length === 0)) {
            emptyDraftIds.push(item.id);
          } else {
            remoteMap.set(item.id, item);
          }
        }

        if (emptyDraftIds.length > 0) {
          transferService.purgeEmptyDrafts(emptyDraftIds);
        }

        // Obtener estado actual en memoria / localStorage para no perder órdenes locales más avanzadas
        const localList = getLocalSolicitudes();
        const localMap = new Map((localList || []).map(s => [s.id, s]));

        // 1. Integrar elementos remotos y resolver conflictos a favor del estado más avanzado
        remoteMap.forEach((remoteItem, id) => {
          if (deletedIds.has(id)) return;
          const localItem = localMap.get(id);
          if (!localItem) {
            validItems.push(remoteItem);
            return;
          }

          const localWeight = STATUS_WEIGHT[localItem.estado] || 0;
          const remoteWeight = STATUS_WEIGHT[remoteItem.estado] || 0;

          // Si el estado local está más avanzado (ej. el despachador acaba de enviar y Firebase aún tenía enviada),
          // prevalece el local y se empuja a Firebase para garantizar la sincronización permanente
          if (localWeight > remoteWeight) {
            const merged = { ...remoteItem, ...localItem };
            validItems.push(merged);
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'solicitudes', id), cleanForFirestore(merged), { merge: true })
                .catch(err => console.warn('[Firebase Auto-Sync] Error sincronizando estado avanzado local a Firestore:', err));
            }
          } else if (localWeight === remoteWeight) {
            // Mismo estado: preservar progreso de recepción o despacho local si es más reciente
            const localRecTime = new Date(localItem?.recepcionProgreso?.updatedAt || 0).getTime();
            const remoteRecTime = new Date(remoteItem?.recepcionProgreso?.updatedAt || 0).getTime();
            const keepLocalRecepcion = Boolean(localItem?.recepcionProgreso) && localRecTime >= remoteRecTime;

            // Mergear items preservando atendido / recibido / cantidadRecibida si el local está marcado
            const mergedItems = (remoteItem.items || localItem.items || []).map((rItem, idx) => {
              const lItem = localItem.items?.[idx];
              if (!lItem) return rItem;
              return {
                ...rItem,
                atendido: lItem.atendido !== undefined ? (lItem.atendido || rItem.atendido) : rItem.atendido,
                recibido: lItem.recibido !== undefined ? (lItem.recibido || rItem.recibido) : rItem.recibido,
                cantidadRecibida: lItem.cantidadRecibida !== undefined ? lItem.cantidadRecibida : rItem.cantidadRecibida,
                cantidadDespachada: lItem.cantidadDespachada !== undefined ? lItem.cantidadDespachada : rItem.cantidadDespachada,
                observacionRecepcion: lItem.observacionRecepcion !== undefined ? lItem.observacionRecepcion : rItem.observacionRecepcion
              };
            });

            const merged = {
              ...remoteItem,
              items: mergedItems,
              recepcionProgreso: keepLocalRecepcion ? localItem.recepcionProgreso : (remoteItem.recepcionProgreso || localItem.recepcionProgreso)
            };
            validItems.push(merged);
          } else {
            validItems.push(remoteItem);
          }
        });

        // 2. Si hay órdenes locales que aún no existen en Firebase (creadas offline o antes del snapshot)
        localMap.forEach((localItem, id) => {
          if (deletedIds.has(id)) return;
          if (!remoteMap.has(id)) {
            // NUNCA resucitar borradores eliminados: solo sincronizar órdenes operativas enviadas offline
            if (localItem.estado !== 'borrador') {
              validItems.push(localItem);
              if (isFirebaseConfigured) {
                setDoc(doc(db, 'solicitudes', id), cleanForFirestore(localItem), { merge: true })
                  .catch(err => console.warn('[Firebase Auto-Sync] Error subiendo orden local faltante a Firestore:', err));
              }
            }
          }
        });

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
    markSolicitudAsDeleted(solicitudId);
    const current = getLocalSolicitudes();
    const filtered = current.filter(s => s.id !== solicitudId);
    cachedSolicitudesList = filtered;
    saveLocalSolicitudes(filtered);

    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'solicitudes', solicitudId));
      } catch (err) {
        console.warn('Error eliminando borrador vacío en Firebase:', err);
      }
    }
  },

  // Purgar múltiples borradores vacíos detectados
  async purgeEmptyDrafts(ids) {
    if (!ids || ids.length === 0) return;
    ids.forEach(id => markSolicitudAsDeleted(id));
    const current = getLocalSolicitudes();
    const idSet = new Set(ids);
    const filtered = current.filter(s => !idSet.has(s.id));
    cachedSolicitudesList = filtered;
    saveLocalSolicitudes(filtered);

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
        const deletedIds = getDeletedSolicitudesIds();
        const q = query(collection(db, 'solicitudes'), orderBy('fecha', 'desc'));
        const snap = await getDocs(q);
        const rawItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const remoteMap = new Map();
        const validItems = [];
        const emptyDraftIds = [];
        for (const item of rawItems) {
          if (deletedIds.has(item.id)) {
            deleteDoc(doc(db, 'solicitudes', item.id)).catch(() => {});
            continue;
          }
          if (item.estado === 'borrador' && (!item.items || item.items.length === 0)) {
            emptyDraftIds.push(item.id);
          } else {
            remoteMap.set(item.id, item);
          }
        }

        if (emptyDraftIds.length > 0) {
          this.purgeEmptyDrafts(emptyDraftIds);
        }

        const localList = getLocalSolicitudes();
        const localMap = new Map((localList || []).map(s => [s.id, s]));

        remoteMap.forEach((remoteItem, id) => {
          if (deletedIds.has(id)) return;
          const localItem = localMap.get(id);
          if (!localItem) {
            validItems.push(remoteItem);
            return;
          }

          const localWeight = STATUS_WEIGHT[localItem.estado] || 0;
          const remoteWeight = STATUS_WEIGHT[remoteItem.estado] || 0;

          if (localWeight > remoteWeight) {
            const merged = { ...remoteItem, ...localItem };
            validItems.push(merged);
            setDoc(doc(db, 'solicitudes', id), cleanForFirestore(merged), { merge: true })
              .catch(() => {});
          } else if (localWeight === remoteWeight) {
            const localRecTime = new Date(localItem?.recepcionProgreso?.updatedAt || 0).getTime();
            const remoteRecTime = new Date(remoteItem?.recepcionProgreso?.updatedAt || 0).getTime();
            const keepLocalRecepcion = Boolean(localItem?.recepcionProgreso) && localRecTime >= remoteRecTime;

            const mergedItems = (remoteItem.items || localItem.items || []).map((rItem, idx) => {
              const lItem = localItem.items?.[idx];
              if (!lItem) return rItem;
              return {
                ...rItem,
                atendido: lItem.atendido !== undefined ? (lItem.atendido || rItem.atendido) : rItem.atendido,
                recibido: lItem.recibido !== undefined ? (lItem.recibido || rItem.recibido) : rItem.recibido,
                cantidadRecibida: lItem.cantidadRecibida !== undefined ? lItem.cantidadRecibida : rItem.cantidadRecibida,
                cantidadDespachada: lItem.cantidadDespachada !== undefined ? lItem.cantidadDespachada : rItem.cantidadDespachada
              };
            });

            const merged = {
              ...remoteItem,
              items: mergedItems,
              recepcionProgreso: keepLocalRecepcion ? localItem.recepcionProgreso : (remoteItem.recepcionProgreso || localItem.recepcionProgreso)
            };
            validItems.push(merged);
          } else {
            validItems.push(remoteItem);
          }
        });

        localMap.forEach((localItem, id) => {
          if (deletedIds.has(id)) return;
          if (!remoteMap.has(id)) {
            // NUNCA resucitar borradores eliminados
            if (localItem.estado !== 'borrador') {
              validItems.push(localItem);
              setDoc(doc(db, 'solicitudes', id), cleanForFirestore(localItem), { merge: true })
                .catch(() => {});
            }
          }
        });

        cachedSolicitudesList = validItems;
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

    if (solicitud.id) {
      unmarkSolicitudAsDeleted(solicitud.id);
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
        await setDoc(doc(db, 'solicitudes', docData.id), cleanForFirestore(docData), { merge: true });
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
    if (!solicitudId) return false;
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    const updateData = { estado: 'enviada', fechaEnvio: new Date().toISOString() };
    const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };

    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.error('[Firebase Sync Error] Error al enviar solicitud en Firestore:', err);
      }
    }
    return true;
  },

  async toggleItemAtendido(solicitudId, itemIndex, explicitValue = undefined, fullItems = null) {
    const list = getLocalSolicitudes();
    let currentItems = fullItems;
    let newEstado = 'en_despacho';

    const updatedList = list.map(s => {
      if (s.id === solicitudId) {
        const items = fullItems ? [...fullItems] : [...(s.items || [])];
        if (!fullItems && items[itemIndex]) {
          const newVal = explicitValue !== undefined ? explicitValue : !items[itemIndex].atendido;
          items[itemIndex] = { ...items[itemIndex], atendido: newVal };
        }
        currentItems = items;
        newEstado = s.estado === 'enviada' ? 'en_despacho' : s.estado;
        return { ...s, items, estado: newEstado };
      }
      return s;
    });

    // 1. Guardar de inmediato en almacenamiento local / caché reactivo
    saveLocalSolicitudes(updatedList);

    // 2. Persistir directamente en Firebase
    if (isFirebaseConfigured && currentItems) {
      try {
        const target = updatedList.find(s => s.id === solicitudId);
        const fullPayload = target || { id: solicitudId, items: currentItems, estado: newEstado };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error actualizando item atendido en Firebase:', err);
      }
    }
    return true;
  },

  async updateItemDespachoQty(solicitudId, itemIndex, cantidadDespachada, motivoAjuste = undefined, fullItems = null) {
    const list = getLocalSolicitudes();
    let currentItems = fullItems;
    let newEstado = 'en_despacho';

    const updatedList = list.map(s => {
      if (s.id === solicitudId) {
        const items = fullItems ? [...fullItems] : [...(s.items || [])];
        if (!fullItems && items[itemIndex]) {
          items[itemIndex] = {
            ...items[itemIndex],
            cantidadDespachada,
            ...(motivoAjuste !== undefined ? { motivoAjusteDespacho: motivoAjuste } : {})
          };
        }
        currentItems = items;
        newEstado = s.estado === 'enviada' ? 'en_despacho' : s.estado;
        return { ...s, items, estado: newEstado };
      }
      return s;
    });

    // 1. Inmediato en caché local
    saveLocalSolicitudes(updatedList);

    // 2. Persistir directamente en Firebase
    if (isFirebaseConfigured && currentItems) {
      try {
        const target = updatedList.find(s => s.id === solicitudId);
        const fullPayload = target || { id: solicitudId, items: currentItems, estado: newEstado };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error actualizando cantidad de despacho en Firebase:', err);
      }
    }
    return true;
  },

  async addExtraItem(solicitudId, extraItem) {
    if (!solicitudId) return false;
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

    const list = getLocalSolicitudes();
    let target = null;
    const updatedList = list.map(s => {
      if (s.id === solicitudId) {
        target = { ...s, items: [...(s.items || []), newItem] };
        return target;
      }
      return s;
    });
    saveLocalSolicitudes(updatedList);

    if (isFirebaseConfigured && target) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(target), { merge: true });
      } catch (err) {
        console.warn('Error agregando producto extra en Firebase:', err);
      }
    }
    return true;
  },
  
  async removeExtraItem(solicitudId, itemIndex) {
    if (!solicitudId) return false;
    const list = getLocalSolicitudes();
    let target = null;
    const updatedList = list.map(s => {
      if (s.id === solicitudId) {
        const items = [...(s.items || [])];
        if (items[itemIndex] && items[itemIndex].esExtra) {
          items.splice(itemIndex, 1);
        }
        target = { ...s, items };
        return target;
      }
      return s;
    });
    saveLocalSolicitudes(updatedList);

    if (isFirebaseConfigured && target) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(target), { merge: true });
      } catch (err) {
        console.warn('Error quitando producto extra en Firebase:', err);
      }
    }
    return true;
  },

  async updateExtraItemQty(solicitudId, itemIndex, newQty) {
    if (!solicitudId) return false;
    const qty = Number(newQty);
    if (qty <= 0) {
      return this.removeExtraItem(solicitudId, itemIndex);
    }

    const list = getLocalSolicitudes();
    let target = null;
    const updatedList = list.map(s => {
      if (s.id === solicitudId) {
        const items = [...(s.items || [])];
        if (items[itemIndex] && items[itemIndex].esExtra) {
          items[itemIndex] = { ...items[itemIndex], cantidadDespachada: qty };
        }
        target = { ...s, items };
        return target;
      }
      return s;
    });
    saveLocalSolicitudes(updatedList);

    if (isFirebaseConfigured && target) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(target), { merge: true });
      } catch (err) {
        console.warn('Error actualizando cantidad extra en Firebase:', err);
      }
    }
    return true;
  },

  async completeSolicitud(solicitudId, folio = null, dispatchDetails = null) {
    if (!solicitudId) return false;

    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);

    const updateData = {
      estado: 'completada',
      fechaDespacho: new Date().toISOString()
    };
    if (folio) {
      updateData.folio = folio;
    }
    if (dispatchDetails) {
      if (dispatchDetails.items) {
        updateData.items = dispatchDetails.items;
      }
      if (dispatchDetails.ajustesDespacho) {
        updateData.ajustesDespacho = dispatchDetails.ajustesDespacho;
      }
      if (dispatchDetails.usuarioDespachador) {
        updateData.usuarioDespachador = dispatchDetails.usuarioDespachador;
        updateData.usuarioDespacho = dispatchDetails.usuarioDespachador;
      }
      if (dispatchDetails.observacionesDespacho) {
        updateData.observaciones = dispatchDetails.observacionesDespacho;
      }
    }

    // 1. Guardar de inmediato en almacenamiento local para respuesta instantánea en UI
    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s);
    saveLocalSolicitudes(updatedList);

    // 2. Persistencia en Firebase Firestore con setDoc y merge: true (crea o actualiza de forma segura)
    if (isFirebaseConfigured) {
      try {
        const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
        console.log(`[Firebase Sync] Solicitud ${solicitudId} completada y sincronizada exitosamente en Firestore.`);
      } catch (err) {
        console.error('[Firebase Sync Error] Error completando solicitud en Firestore:', err);
      }
    }
    return true;
  },

  // Despacho directo de productos sin haber recibido una solicitud previa
  async createDirectDispatch(dispatchData) {
    if (dispatchData.id) {
      unmarkSolicitudAsDeleted(dispatchData.id);
    }
    const docData = {
      id: dispatchData.id || ('disp-' + Date.now()),
      folio: dispatchData.folio || '',
      sucursalOrigen: dispatchData.sucursalOrigen || '',
      areaOrigen: dispatchData.areaOrigen || '',
      sucursalDestino: dispatchData.sucursalDestino || '',
      areaDestino: dispatchData.areaDestino || '',
      sucursalReceptora: dispatchData.sucursalReceptora || dispatchData.sucursalOrigen || '',
      areaReceptora: dispatchData.areaReceptora || dispatchData.areaOrigen || '',
      sucursalDespachadora: dispatchData.sucursalDespachadora || dispatchData.sucursalDestino || '',
      areaDespachadora: dispatchData.areaDespachadora || dispatchData.areaDestino || '',
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
        await setDoc(doc(db, 'solicitudes', docData.id), cleanForFirestore(docData), { merge: true });
        console.log(`[Firebase Sync] Despacho directo ${docData.id} guardado en Firestore.`);
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

    if (draft.id) {
      unmarkSolicitudAsDeleted(draft.id);
    }

    const docData = {
      id: draft.id || ('disp-draft-' + Date.now()),
      folio: draft.folio || '',
      sucursalOrigen: draft.sucursalOrigen || '',
      areaOrigen: draft.areaOrigen || '',
      sucursalDestino: draft.sucursalDestino || '',
      areaDestino: draft.areaDestino || '',
      sucursalReceptora: draft.sucursalReceptora || draft.sucursalOrigen || '',
      areaReceptora: draft.areaReceptora || draft.areaOrigen || '',
      sucursalDespachadora: draft.sucursalDespachadora || draft.sucursalDestino || '',
      areaDespachadora: draft.areaDespachadora || draft.areaDestino || '',
      usuarioSolicitante: draft.usuarioSolicitante || draft.sucursalOrigen || 'Despacho Directo',
      usuarioDestino: draft.usuarioDestino || '',
      usuarioDespacho: draft.usuarioDespacho || '',
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
        await setDoc(doc(db, 'solicitudes', docData.id), cleanForFirestore(docData), { merge: true });
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
    
    // 1. Inmediato en almacenamiento local
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s));

    // 2. Persistir en Firebase
    if (isFirebaseConfigured) {
      try {
        const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error actualizando folio en Firebase:', err);
      }
    }
    return true;
  },

  // Guardar en tiempo real el progreso de revisión/recepción en caja física
  async updateReceivingProgress(solicitudId, progressData = {}) {
    if (!solicitudId) return false;
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    if (!existing) return false;

    const recepcionProgreso = {
      ...(existing.recepcionProgreso || {}),
      checkedItems: progressData.checkedItems !== undefined ? progressData.checkedItems : (existing.recepcionProgreso?.checkedItems || {}),
      receivedQuantities: progressData.receivedQuantities !== undefined ? progressData.receivedQuantities : (existing.recepcionProgreso?.receivedQuantities || {}),
      checkedNewFaltantes: progressData.checkedNewFaltantes !== undefined ? progressData.checkedNewFaltantes : (existing.recepcionProgreso?.checkedNewFaltantes || {}),
      newFaltantesQuantities: progressData.newFaltantesQuantities !== undefined ? progressData.newFaltantesQuantities : (existing.recepcionProgreso?.newFaltantesQuantities || {}),
      updatedAt: new Date().toISOString()
    };

    let updatedItems = existing.items ? [...existing.items] : [];
    if (Array.isArray(progressData.items)) {
      updatedItems = progressData.items;
    } else if (progressData.checkedItems || progressData.receivedQuantities || progressData.itemObservations) {
      const checked = recepcionProgreso.checkedItems;
      const quantities = recepcionProgreso.receivedQuantities;
      updatedItems = updatedItems.map((it, idx) => {
        const expected = Number(it.cantidadDespachada || it.cantidadSolicitada || it.cantidad || 1);
        const qty = quantities[idx] !== undefined ? Number(quantities[idx]) : (it.cantidadRecibida !== undefined && Number(it.cantidadRecibida) >= 0 ? Number(it.cantidadRecibida) : expected);
        const obs = progressData.itemObservations?.[idx] !== undefined ? progressData.itemObservations[idx] : it.observacionRecepcion;
        return {
          ...it,
          recibido: checked[idx] !== undefined ? Boolean(checked[idx]) : Boolean(it.recibido),
          cantidadRecibida: qty,
          ...(obs !== undefined ? { observacionRecepcion: obs } : {})
        };
      });
    }

    const updatedOrder = {
      ...existing,
      items: updatedItems,
      recepcionProgreso
    };

    const updatedList = list.map(s => s.id === solicitudId ? updatedOrder : s);
    cachedSolicitudesList = updatedList;
    saveLocalSolicitudes(updatedList);

    // Persistir directamente en Firebase Firestore
    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(updatedOrder), { merge: true });
      } catch (err) {
        console.warn('Error sincronizando progreso de recepción en Firebase:', err);
      }
    }
    return true;
  },

  // Finalizar recepción en sucursal
  async receiveSolicitud(solicitudId, faltantes = [], itemsActualizados = null) {
    if (!solicitudId) return false;
    const estado = faltantes.length > 0 ? 'recibida_incompleta' : 'recibida';
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    
    let finalItems = itemsActualizados;
    if (!finalItems && existing?.items) {
      finalItems = existing.items.map(it => ({
        ...it,
        recibido: true,
        cantidadRecibida: it.cantidadDespachada ?? it.cantidadSolicitada ?? 1
      }));
    }

    const updateData = {
      estado,
      reporteFaltantes: faltantes,
      fechaRecepcion: new Date().toISOString(),
      ...(finalItems ? { items: finalItems } : {})
    };
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s));

    if (faltantes.length > 0) {
      undismissNotification(`tr-falt-${solicitudId}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp_notifications_updated'));
      }
    }

    if (isFirebaseConfigured) {
      try {
        const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error actualizando recepción en Firebase:', err);
      }
    }
    return true;
  },

  // Finalizar recepción con reporte detallado de discrepancias (faltantes, ausencias y extras)
  async receiveWithDiscrepancies(solicitudId, discrepancyPayload = {}) {
    if (!solicitudId) return false;
    const {
      discrepancias = [],
      observaciones = '',
      usuarioReceptor = '',
      itemsActualizados = null
    } = discrepancyPayload;

    const faltantes = discrepancias
      .filter(d => d.tipo === 'faltante' || d.tipo === 'ausencia_total')
      .map(d => ({
        codigo: d.codigo,
        descripcion: d.descripcion,
        cantidadSolicitada: d.cantidadEsperada,
        cantidadDespachada: d.cantidadEsperada,
        cantidadRecibida: d.cantidadRecibida,
        cantidadFaltante: Math.abs(d.diferencia),
        esAusenciaTotal: d.tipo === 'ausencia_total',
        observacion: d.observacion || '',
        motivoRecepcion: d.observacion || '',
        motivo: d.observacion || ''
      }));

    const extras = discrepancias
      .filter(d => d.tipo === 'extra')
      .map(d => ({
        codigo: d.codigo,
        descripcion: d.descripcion,
        cantidadEsperada: d.cantidadEsperada,
        cantidadRecibida: d.cantidadRecibida,
        cantidadExtra: d.diferencia,
        observacion: d.observacion || '',
        motivoRecepcion: d.observacion || '',
        motivo: d.observacion || ''
      }));

    const estado = faltantes.length > 0 ? 'recibida_incompleta' : 'recibida';

    const updatePayload = {
      estado,
      reporteFaltantes: faltantes,
      reporteDiscrepancias: {
        fecha: new Date().toISOString(),
        usuarioReceptor: usuarioReceptor || '',
        observaciones: observaciones || '',
        discrepancias: discrepancias.map(d => ({
          ...d,
          observacion: d.observacion || '',
          motivoRecepcion: d.observacion || ''
        })),
        totalFaltantes: faltantes.reduce((sum, f) => sum + (f.cantidadFaltante || 0), 0),
        totalExtras: extras.reduce((sum, e) => sum + (e.cantidadExtra || 0), 0),
        resuelto: false
      },
      fechaReporteFaltantes: new Date().toISOString()
    };

    if (Array.isArray(itemsActualizados) && itemsActualizados.length > 0) {
      updatePayload.items = itemsActualizados;
    }

    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s));

    // Des-descartar cualquier notificación previa de faltantes para que reaparezca inmediatamente en despachador
    undismissNotification(`tr-falt-${solicitudId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp_notifications_updated'));
    }

    if (isFirebaseConfigured) {
      try {
        const fullPayload = existing ? { ...existing, ...updatePayload } : { id: solicitudId, ...updatePayload };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error guardando discrepancias de recepción en Firebase:', err);
      }
    }
    return true;
  },

  // Atender y despachar reporte de faltantes desde Bodega/Matriz
  async resolveReporteFaltantes(solicitudId, resolutionData) {
    if (!solicitudId) return false;
    const hasDispatchedItems = resolutionData?.itemsResolucion?.some(
      i => i.despachado && Number(i.cantidadDespachada || 0) > 0
    );
    const nuevoEstado = hasDispatchedItems ? 'faltantes_despachados' : 'cerrada_con_faltantes';

    const currentSol = getLocalSolicitudes().find(s => s.id === solicitudId);

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

    if (currentSol?.reporteDiscrepancias) {
      updatePayload.reporteDiscrepancias = {
        ...currentSol.reporteDiscrepancias,
        resuelto: true,
        fechaResolucion: new Date().toISOString(),
        usuarioResolucion: resolutionData.usuarioResolucion || ''
      };
    }

    const list = getLocalSolicitudes();
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s));

    if (isFirebaseConfigured) {
      try {
        const fullPayload = currentSol ? { ...currentSol, ...updatePayload } : { id: solicitudId, ...updatePayload };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error guardando resolución de faltantes en Firebase:', err);
      }
    }

    // Descartar de inmediato la notificación de faltantes/discrepancias
    dismissNotification(`tr-falt-${solicitudId}`);

    return true;
  },

  // Finalizar recepción del re-despacho de faltantes en sucursal (o re-reportar faltantes a Bodega)
  async receiveFaltantes(solicitudId, receptionData = {}) {
    if (!solicitudId) return false;
    const itemsAunFaltantes = receptionData.itemsAunFaltantes || [];
    const reReportToBodega = Boolean(receptionData.reReportToBodega && itemsAunFaltantes.length > 0);
    const nuevoEstado = itemsAunFaltantes.length === 0
      ? 'recibida'
      : (reReportToBodega ? 'recibida_incompleta' : 'cerrada_con_faltantes');

    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);

    // Actualizar items de la solicitud acumulando las piezas recibidas en este reenvío
    const updatedItems = (existing?.items || []).map(it => {
      const recItem = receptionData.itemsRecibidos?.find(r => r.codigo && it.codigo && String(r.codigo) === String(it.codigo));
      const aunFaltItem = itemsAunFaltantes.find(af => af.codigo && it.codigo && String(af.codigo) === String(it.codigo));

      const prevRec = Number(it.cantidadRecibida ?? 0);
      const newRec = recItem ? Number(recItem.cantidadRecibida || 0) : 0;
      const totalRec = recItem !== undefined ? prevRec + newRec : prevRec;
      const obs = aunFaltItem?.observacion || recItem?.observacion || it.observacionRecepcion || '';

      return {
        ...it,
        recibido: true,
        cantidadRecibida: recItem !== undefined ? totalRec : it.cantidadRecibida,
        observacionRecepcion: obs || it.observacionRecepcion || ''
      };
    });

    const updatePayload = {
      estado: nuevoEstado,
      items: updatedItems
    };

    if (reReportToBodega) {
      // Re-reportar faltantes a Bodega:
      const resolucionesPrevias = Array.isArray(existing?.resolucionesPrevias)
        ? [...existing.resolucionesPrevias]
        : [];
      if (existing?.resolucionFaltantes) {
        resolucionesPrevias.push(existing.resolucionFaltantes);
      }

      const nuevoReporteFaltantes = itemsAunFaltantes.map(af => ({
        codigo: af.codigo,
        descripcion: af.descripcion,
        cantidadSolicitada: af.cantidadSolicitada || af.cantidadEsperadaReenvio || af.cantidadAunFaltante,
        cantidadDespachada: af.cantidadEsperadaReenvio || af.cantidadAunFaltante,
        cantidadRecibida: af.cantidadRecibidaReenvio || 0,
        cantidadFaltante: af.cantidadAunFaltante,
        diferencia: -af.cantidadAunFaltante,
        observacion: af.observacion || af.motivoRecepcion || '',
        motivo: af.observacion || af.motivoRecepcion || ''
      }));

      const notasSucursal = receptionData.notas || itemsAunFaltantes.map(af => af.observacion).filter(Boolean).join('; ') || existing?.observacionesRecepcion || '';

      updatePayload.resolucionesPrevias = resolucionesPrevias;
      updatePayload.resolucionFaltantes = null;
      updatePayload.reporteFaltantes = nuevoReporteFaltantes;
      updatePayload.fechaReporteFaltantes = new Date().toISOString();
      updatePayload.observacionesRecepcion = notasSucursal;
      updatePayload.reporteDiscrepancias = {
        ...(existing?.reporteDiscrepancias || {}),
        fechaReporte: new Date().toISOString(),
        usuarioReceptor: receptionData.usuarioRecepcion || existing?.reporteDiscrepancias?.usuarioReceptor || 'sucursal',
        observaciones: notasSucursal,
        resuelto: false
      };
      updatePayload.reReenvioRequerido = true;

      // Quitar descarte para que la notificación de faltante reaparezca en Bodega
      undismissNotification(`tr-falt-${solicitudId}`);
      dismissNotification(`tr-falt-env-${solicitudId}`);
    } else {
      updatePayload.recepcionFaltantes = {
        fechaRecepcion: new Date().toISOString(),
        usuarioRecepcion: receptionData.usuarioRecepcion || '',
        itemsRecibidos: receptionData.itemsRecibidos || [],
        itemsAunFaltantes: itemsAunFaltantes,
        notas: receptionData.notas || ''
      };

      dismissNotification(`tr-falt-env-${solicitudId}`);
      dismissNotification(`tr-falt-${solicitudId}`);
    }

    dismissNotification(`tr-comp-${solicitudId}`);

    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s));

    if (isFirebaseConfigured) {
      try {
        const fullPayload = existing ? { ...existing, ...updatePayload } : { id: solicitudId, ...updatePayload };
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Error guardando recepción de faltantes en Firebase:', err);
      }
    }

    // Disparar actualización inmediata del centro de notificaciones
    window.dispatchEvent(new Event('erp_notifications_updated'));

    return true;
  },

  // ELIMINAR BORRADOR: Permitido ÚNICAMENTE para su creador original o Administrador.
  // ESTRICTAMENTE PROHIBIDO para solicitudes completadas o en cualquier otro estado.
  async deleteDraft(solicitudId, currentUser) {
    if (!solicitudId) throw new Error('ID de solicitud requerido.');

    let solicitud = null;
    const list = getLocalSolicitudes();
    solicitud = list.find(s => s.id === solicitudId);

    if (!solicitud && isFirebaseConfigured) {
      try {
        const snap = await getDoc(doc(db, 'solicitudes', solicitudId));
        if (snap.exists()) {
          solicitud = snap.data();
        }
      } catch (e) {
        console.warn('Error leyendo solicitud para eliminación:', e);
      }
    }

    if (solicitud) {
      // Regla crítica: Las transferencias completadas o en tránsito no se pueden eliminar jamás
      if (solicitud.estado && solicitud.estado !== 'borrador') {
        throw new Error('Está estrictamente prohibido eliminar transferencias que no sean borradores.');
      }

      const adminRoles = ['admin', 'administrador'];
      const currentRoles = Array.isArray(currentUser?.roles) ? currentUser.roles.map(r => String(r).toLowerCase()) : [];
      const currentUserName = (currentUser?.username || '').toLowerCase().trim();
      const isAdmin =
        currentUserName === 'administrador' ||
        currentRoles.some(r => adminRoles.includes(r));
      const solOwner = (solicitud.usuarioSolicitante || '').toLowerCase().trim();
      const isOwner = solOwner === currentUserName;

      if (!isAdmin && !isOwner) {
        throw new Error('Solo el creador original o el Administrador pueden eliminar este borrador.');
      }
    }

    // 1. Marcar inmediatamente como tombstone para evitar cualquier resurrección
    markSolicitudAsDeleted(solicitudId);

    // 2. Limpieza inmediata local y en caché en memoria
    const currentList = getLocalSolicitudes();
    const updatedList = currentList.filter(s => s.id !== solicitudId);
    cachedSolicitudesList = updatedList;
    saveLocalSolicitudes(updatedList);

    // 3. Eliminación definitiva en Firebase Firestore
    if (isFirebaseConfigured) {
      try {
        await deleteDoc(doc(db, 'solicitudes', solicitudId));
      } catch (err) {
        console.warn('Error eliminando borrador en Firebase:', err);
      }
    }

    return true;
  },

  calculateTransferNotifications(solicitudes = [], currentUser = null) {
    if (!currentUser || !Array.isArray(solicitudes)) return [];

    const username = (currentUser.username || '').toLowerCase().trim();
    const notifs = [];

    solicitudes.forEach(s => {
      if (!s || s.estado === 'borrador') return;

      const solFolio = s.folio || 'Sin Folio';
      const itemsCount = s.items?.length || 0;
      const { recipientSede, recipientArea, dispatchSede, dispatchArea, isDirect } = getTransferParticipants(s);
      const solUser = (s.usuarioSolicitante || '').toLowerCase().trim();

      // 1. NOTIFICACIÓN: Solicitud recibida pendiente de atender (para Despachadores de la sede/área destino)
      if (s.estado === 'enviada' || s.estado === 'en_despacho') {
        const isForMe = canUserDispatch(s, currentUser) && solUser !== username;

        if (isForMe) {
          const fromTxt = recipientArea
            ? `${recipientSede} (${recipientArea})`
            : (recipientSede || 'Sucursal');
          const destTxt = dispatchArea ? ` para ${dispatchArea}` : '';
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

      // 2. NOTIFICACIÓN: Pedido despachado en camino (para Sucursal / Farmacia / Área origen que recibe)
      if (s.estado === 'completada') {
        const isForMyBranch = canUserReceive(s, currentUser) && (s.usuarioDespacho || '').toLowerCase() !== username;

        if (isForMyBranch) {
          const originSender = dispatchSede
            ? `${dispatchSede}${dispatchArea ? ` (${dispatchArea})` : ''}`
            : (dispatchArea || 'Bodega');

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

      // 3. NOTIFICACIÓN: Inconsistencias, faltantes o discrepancias reportadas (para Despachador de la sede que surtió)
      // Se muestra ÚNICAMENTE si está verdaderamente pendiente de atención (no si ya fue atendido o re-despachado)
      const hasUnresolvedDiscrepancy = Boolean(
        s.estado === 'recibida_incompleta' ||
        (s.reporteFaltantes && s.reporteFaltantes.length > 0 && !s.resolucionFaltantes) ||
        (s.reporteDiscrepancias && !s.reporteDiscrepancias.resuelto && !s.resolucionFaltantes)
      );

      const isAlreadyResolved = Boolean(
        s.resolucionFaltantes ||
        s.estado === 'faltantes_despachados' ||
        s.estado === 'cerrada_con_faltantes' ||
        (s.reporteDiscrepancias && s.reporteDiscrepancias.resuelto === true)
      );

      const isPendienteAtencion = hasUnresolvedDiscrepancy && !isAlreadyResolved;

      if (isPendienteAtencion) {
        const isForMe = canUserDispatch(s, currentUser);

        if (isForMe) {
          const fromTxt = recipientArea
            ? `${recipientSede} (${recipientArea})`
            : (recipientSede || 'Sucursal');

          const hasDiscrepancy = Boolean(s.reporteDiscrepancias);
          const totalFalt = s.reporteDiscrepancias?.totalFaltantes ?? s.reporteFaltantes?.length ?? 0;
          const totalExt = s.reporteDiscrepancias?.totalExtras ?? 0;

          let diffDetails = [];
          if (totalFalt > 0) diffDetails.push(`${totalFalt} faltantes`);
          if (totalExt > 0) diffDetails.push(`${totalExt} extras`);
          const diffSummaryText = diffDetails.length > 0 ? ` (${diffDetails.join(', ')})` : '';

          notifs.push({
            id: `tr-falt-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'reporte_faltantes',
            titulo: hasDiscrepancy ? `Discrepancias: ${fromTxt}` : `Faltantes: ${fromTxt}`,
            subtitulo: `Folio: ${solFolio}${diffSummaryText}`,
            mensaje: hasDiscrepancy
              ? `${fromTxt} reportó diferencias en el folio ${solFolio}${diffSummaryText}. Revisa el reporte para aclaración o re-despacho.`
              : `${fromTxt} reportó productos faltantes en el folio ${solFolio}. Requiere re-despacho de faltantes.`,
            fecha: s.reporteDiscrepancias?.fecha || s.fechaReporteFaltantes || s.fecha || new Date().toISOString(),
            solicitud: s,
            actionScreen: 'despachar',
            actionText: hasDiscrepancy ? 'Ver Discrepancias' : 'Revisar Faltantes'
          });
        }
      }

      // 4. NOTIFICACIÓN: Faltantes re-despachados en camino (para Sucursal / Área origen)
      if (s.estado === 'faltantes_despachados') {
        const isForMyBranch = canUserReceive(s, currentUser);

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
      if ((s.estado === 'recibida' || s.estado === 'cerrada_con_faltantes') && (s.reporteFaltantes?.length > 0 || s.resolucionFaltantes)) {
        const isForMe = canUserDispatch(s, currentUser);

        if (isForMe) {
          const fromTxt = recipientArea
            ? `${recipientSede} (${recipientArea})`
            : (recipientSede || 'Sucursal');

          const esCerrada = s.estado === 'cerrada_con_faltantes';

          notifs.push({
            id: `tr-falt-entregados-${s.id}`,
            solicitudId: s.id,
            categoria: 'transferencia',
            tipo: 'faltantes_entregados',
            titulo: esCerrada ? `Recepción Cerrada (${solFolio})` : `Faltantes Entregados (${solFolio})`,
            subtitulo: `Confirmado por: ${fromTxt}`,
            mensaje: esCerrada
              ? `${fromTxt} finalizó la recepción de faltantes con observaciones. El pedido ha concluido y fue cerrado.`
              : `${fromTxt} confirmó la recepción de faltantes del pedido ${solFolio}. El pedido ha concluido y fue cerrado con éxito.`,
            fecha: s.recepcionFaltantes?.fechaRecepcion || s.recepcionFaltantes?.fecha || s.fechaRecepcion || s.fecha || new Date().toISOString(),
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

  canUserViewInSolicitar,
  canUserDispatch,
  canUserReceive,
  getTransferParticipants,

  playNotificationSound,
  playCheckSound,
  unlockAudioEngine,
  dismissNotification,
  undismissNotification,
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
