/**
 * Servicio central de transferencias que gestiona creación, actualización de estados, discrepancias, alertas y sincronización con Firestore.
 */

import { db, isFirebaseConfigured } from '../../config/firebase';
import {
  collection, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs
} from 'firebase/firestore';
import { catalogService } from '../catalogo/catalogService';
import { soundSettingsService } from '../../shared/soundSettingsService';

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

let cachedUsersMap = new Map();
let usersSubscribed = false;

function ensureUsersSubscription() {
  if (usersSubscribed || !isFirebaseConfigured) return;
  usersSubscribed = true;
  try {
    onSnapshot(collection(db, 'usuarios'), (snap) => {
      const map = new Map();
      snap.docs.forEach(d => {
        const data = d.data() || {};
        const username = (data.username || d.id || '').toLowerCase().trim();
        if (username) {
          map.set(username, {
            nombre: data.nombre || data.username || '',
            sede: data.sede || '',
            area: data.area || ''
          });
        }
      });
      cachedUsersMap = map;
    }, () => {});
  } catch (_) {}
}

export function normalizeStr(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function formatOrderRequestedBy(transfer, externalUsersList = null) {
  if (!transfer) return '';

  ensureUsersSubscription();

  const isDirect = Boolean(transfer.esDespachoDirecto || transfer.sinSolicitud);

  let sede = '';
  if (isDirect) {
    sede = transfer.sucursalDespachadora || transfer.sucursalOrigen || transfer.sucursalDestino || 'Bodega';
  } else {
    sede = transfer.sucursalOrigen || transfer.sucursalReceptora || 'Sucursal';
  }

  const rawUser = (
    transfer.solicitanteNombre ||
    transfer.usuarioSolicitante ||
    (isDirect ? (transfer.usuarioDespacho || transfer.usuarioAtencion) : '') ||
    ''
  ).trim();

  let primerNombre = '';

  if (Array.isArray(externalUsersList) && externalUsersList.length > 0 && rawUser) {
    const found = externalUsersList.find(u =>
      (u.username && u.username.toLowerCase() === rawUser.toLowerCase()) ||
      (u.nombre && u.nombre.toLowerCase() === rawUser.toLowerCase()) ||
      (u.id && u.id.toLowerCase() === rawUser.toLowerCase())
    );
    if (found?.nombre) {
      const parts = found.nombre.trim().split(/\s+/);
      if (parts[0]) primerNombre = parts[0];
    }
  }

  if (!primerNombre && rawUser && cachedUsersMap.size > 0) {
    const found = cachedUsersMap.get(rawUser.toLowerCase());
    if (found?.nombre) {
      const parts = found.nombre.trim().split(/\s+/);
      if (parts[0]) primerNombre = parts[0];
    }
  }

  if (!primerNombre && rawUser) {
    const parts = rawUser.split(/\s+/);
    if (parts.length > 1) {
      primerNombre = parts[0];
    } else {
      primerNombre = rawUser.charAt(0).toUpperCase() + rawUser.slice(1);
    }
  }

  if (!primerNombre) {
    primerNombre = 'Personal';
  }

  return `Pedido por: ${sede} - ${primerNombre}`;
}

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

let sharedAudioCtx = null;
let notificationAudioBuffer = null;
let html5NotificationAudio = null;
let checkAudioBuffer = null;
let html5CheckAudio = null;
let orderSuccessAudioBuffer = null;
let html5OrderSuccessAudio = null;
let isAudioEngineUnlocked = false;
let lastSuccessSoundTime = 0;

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

function getHtml5OrderSuccessAudio() {
  if (!html5OrderSuccessAudio && typeof Audio !== 'undefined') {
    html5OrderSuccessAudio = new Audio('/order-success.mp3');
    html5OrderSuccessAudio.preload = 'auto';
  }
  return html5OrderSuccessAudio;
}

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
    return null;
  }
}

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

async function preloadOrderSuccessBuffer() {
  if (orderSuccessAudioBuffer) return orderSuccessAudioBuffer;
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return null;
    const response = await fetch('/order-success.mp3');
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    orderSuccessAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return orderSuccessAudioBuffer;
  } catch (_err) {
    return null;
  }
}

export function unlockAudioEngine() {
  if (isAudioEngineUnlocked) return;

  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const silentBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch (_e) {}

  if (!notificationAudioBuffer) {
    preloadNotificationBuffer();
  }
  if (!checkAudioBuffer) {
    preloadCheckBuffer();
  }
  if (!orderSuccessAudioBuffer) {
    preloadOrderSuccessBuffer();
  }

  isAudioEngineUnlocked = true;
}

if (typeof window !== 'undefined') {
  const gestureEvents = ['touchstart', 'pointerdown', 'click', 'keydown'];
  const handleUserGesture = () => {
    unlockAudioEngine();
    gestureEvents.forEach((evt) => {
      window.removeEventListener(evt, handleUserGesture);
    });
  };

  gestureEvents.forEach((evt) => {
    window.addEventListener(evt, handleUserGesture, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }
  });

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

export function playCheckSound() {
  if (!soundSettingsService.canPlayCheck()) {
    return;
  }
  let playedSuccessfully = false;

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

  if (!playedSuccessfully) {
    playCheckChime();
  }
}

export function playOrderSuccessSound() {
  if (!soundSettingsService.canPlaySuccess()) {
    return;
  }
  const now = Date.now();
  if (now - lastSuccessSoundTime < 600) {
    return;
  }
  lastSuccessSoundTime = now;

  let playedSuccessfully = false;

  try {
    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (orderSuccessAudioBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = orderSuccessAudioBuffer;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime);
        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        src.start(0);
        playedSuccessfully = true;
      } else {
        preloadOrderSuccessBuffer().then((buf) => {
          if (buf) {
            const currentCtx = getSharedAudioContext();
            if (currentCtx) {
              const s = currentCtx.createBufferSource();
              s.buffer = buf;
              const g = currentCtx.createGain();
              g.gain.setValueAtTime(1.0, currentCtx.currentTime);
              s.connect(g);
              g.connect(currentCtx.destination);
              s.start(0);
            }
          }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Audio] Error al reproducir buffer order-success:', err);
  }

  if (!playedSuccessfully) {
    try {
      const audio = getHtml5OrderSuccessAudio();
      if (audio) {
        audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) {
          p.catch(() => {});
        }
        playedSuccessfully = true;
      }
    } catch (_e) {}
  }
}

export const playSuccessSound = playOrderSuccessSound;

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
    const arr = Array.from(set).slice(-500);
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
    const arr = Array.from(keys).slice(-400);
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(arr));
  } catch (_) {}
}

function hasEventBeenNotified(key) {
  return getNotifiedEventKeys().has(key);
}

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
      recipientAreaId: '',
      recipientUser: '',
      dispatchSede: '',
      dispatchArea: '',
      dispatchAreaId: '',
      dispatchUser: '',
      isDirect: false
    };
  }

  const isDirect = Boolean(transfer.esDespachoDirecto || transfer.sinSolicitud);

  if (isDirect) {
    const recipientSede = (transfer.sucursalReceptora || transfer.sucursalDestino || '').trim();
    const recipientArea = (
      transfer.areaReceptora !== undefined && transfer.areaReceptora !== null && transfer.areaReceptora !== ''
        ? transfer.areaReceptora
        : (transfer.areaDestino || '')
    ).trim();
    const recipientAreaId = (transfer.areaReceptoraId || transfer.areaDestinoId || '').trim();
    const recipientUser = (transfer.usuarioDestino || '').trim();

    const dispatchSede = (transfer.sucursalDespachadora || transfer.sucursalOrigen || '').trim();
    const dispatchArea = (
      transfer.areaDespachadora !== undefined && transfer.areaDespachadora !== null && transfer.areaDespachadora !== ''
        ? transfer.areaDespachadora
        : (transfer.areaOrigen || '')
    ).trim();
    const dispatchAreaId = (transfer.areaDespachadoraId || transfer.areaOrigenId || '').trim();
    const dispatchUser = (transfer.usuarioDespacho || transfer.usuarioAtencion || '').trim();

    return {
      recipientSede,
      recipientArea,
      recipientAreaId,
      recipientUser,
      dispatchSede,
      dispatchArea,
      dispatchAreaId,
      dispatchUser,
      isDirect: true
    };
  } else {
    const recipientSede = (transfer.sucursalOrigen || '').trim();
    const recipientArea = (transfer.areaOrigen || '').trim();
    const recipientAreaId = (transfer.areaOrigenId || '').trim();
    const recipientUser = (transfer.usuarioSolicitante || '').trim();

    const dispatchSede = (transfer.sucursalDestino || '').trim();
    const dispatchArea = (transfer.areaDestino || '').trim();
    const dispatchAreaId = (transfer.areaDestinoId || '').trim();
    const dispatchUser = (transfer.usuarioDestino || transfer.usuarioDespacho || '').trim();

    return {
      recipientSede,
      recipientArea,
      recipientAreaId,
      recipientUser,
      dispatchSede,
      dispatchArea,
      dispatchAreaId,
      dispatchUser,
      isDirect: false
    };
  }
}

export function canUserViewInSolicitar(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';

  if (currentUser.excluirDestinatario) return false;
  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) return false;

  const uRoles = currentUser.roles || [];
  if (!uRoles.includes('solicitar') && !isRootAdmin) return false;

  if (transfer.esDespachoDirecto || transfer.sinSolicitud) return false;

  if (transfer.usuarioSolicitante && transfer.usuarioSolicitante.toLowerCase() === username) {
    return true;
  }

  if (transfer.estado === 'borrador') {
    return transfer.usuarioSolicitante && transfer.usuarioSolicitante.toLowerCase() === username;
  }

  const userSede = normalizeStr(currentUser.sede);
  const userArea = normalizeStr(currentUser.area);

  const { recipientSede, recipientArea } = getTransferParticipants(transfer);
  const solSede = normalizeStr(recipientSede);
  const solArea = normalizeStr(recipientArea);

  if (!userSede || solSede !== userSede) {
    if (isRootAdmin && !userSede) return true;
    return false;
  }

  if (solArea && userArea) {
    return solArea === userArea || solArea.includes(userArea) || userArea.includes(solArea);
  }

  return true;
}

export function canUserDispatch(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';

  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) {
    return false;
  }

  const uRoles = currentUser.roles || [];
  if (!uRoles.includes('despachar') && !isRootAdmin) return false;

  const userSede = normalizeStr(currentUser.sede);
  const userArea = normalizeStr(currentUser.area);
  const isPatente = userArea.includes('patente');
  const isGenerico = userArea.includes('generic') || userArea.includes('generic');

  const { dispatchSede, dispatchArea, dispatchUser } = getTransferParticipants(transfer);

  if (dispatchUser && dispatchUser.toLowerCase() === username) {
    return true;
  }

  if (transfer.usuarioDestino && transfer.usuarioDestino.toLowerCase() === username) {
    return true;
  }

  const dSede = normalizeStr(dispatchSede);
  const dArea = normalizeStr(dispatchArea);

  const matchesSede = !dSede
    ? (userSede.includes('matriz') || userSede === '' || isRootAdmin)
    : dSede === userSede;

  if (!matchesSede) {
    if (isRootAdmin && !userSede) return true;
    return false;
  }

  if (dArea && userArea) {
    if (isPatente) return dArea.includes('patente');
    if (isGenerico) return dArea.includes('generic') || dArea.includes('generic');
    return dArea === userArea || dArea.includes(userArea) || userArea.includes(dArea);
  }

  return true;
}

export function canUserReceive(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  if (transfer.estado !== 'completada' && transfer.estado !== 'faltantes_despachados') {
    return false;
  }

  if (currentUser.excluirDestinatario) {
    return false;
  }

  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) {
    return false;
  }

  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';
  const uRoles = currentUser.roles || [];

  const hasReceiveRole = uRoles.includes('solicitar') || uRoles.includes('recibir');
  if (!hasReceiveRole && !isRootAdmin) {
    return false;
  }

  const userSede = normalizeStr(currentUser.sede);
  const userArea = normalizeStr(currentUser.area);
  const userAreaId = (currentUser.areaId || '').trim();

  const {
    recipientSede,
    recipientArea,
    recipientAreaId,
    recipientUser,
    dispatchSede,
    dispatchArea,
    isDirect
  } = getTransferParticipants(transfer);

  const rSede = normalizeStr(recipientSede);
  const rArea = normalizeStr(recipientArea);

  if (recipientUser && recipientUser.toLowerCase() === username) {
    return true;
  }

  const isSedeMatch = (userSede && rSede === userSede) ||
    (isDirect && userSede && (
      normalizeStr(transfer.sucursalDestino) === userSede ||
      normalizeStr(transfer.sucursalReceptora) === userSede
    ));

  if (!isSedeMatch) {
    if (isRootAdmin && !userSede) return true;
    return false;
  }

  const isErroneousSenderAreaFallback = Boolean(
    isDirect &&
    dispatchArea &&
    (
      rArea === normalizeStr(dispatchArea) ||
      rArea.includes(normalizeStr(dispatchArea)) ||
      normalizeStr(dispatchArea).includes(rArea)
    ) &&
    rSede !== normalizeStr(dispatchSede)
  );

  if (!rArea || !recipientArea || isErroneousSenderAreaFallback) {
    return true;
  }

  if (recipientAreaId && userAreaId && recipientAreaId === userAreaId) {
    return true;
  }

  if (rArea && userArea) {
    if (rArea === userArea || rArea.includes(userArea) || userArea.includes(rArea)) {
      return true;
    }
  }

  if (!userArea) {
    return true;
  }

  if (isDirect && rSede && userSede === rSede && normalizeStr(dispatchSede) !== rSede) {
    return true;
  }

  return false;
}

export function canUserViewInRecibirHistory(transfer, currentUser) {
  if (!currentUser || !transfer) return false;
  const isReceived = transfer.estado === 'recibida' ||
                     transfer.estado === 'recibida_incompleta' ||
                     transfer.estado === 'cerrada_con_faltantes';
  if (!isReceived) return false;

  const username = (currentUser.username || '').toLowerCase().trim();
  const isRootAdmin = username === 'administrador';
  if (isRootAdmin) return true;

  if (currentUser.excluirDestinatario) {
    return false;
  }

  if (currentUser.area && isAreaExcludedFromTransfers(currentUser.area)) {
    return false;
  }

  const uRoles = currentUser.roles || [];
  const hasReceiveRole = uRoles.includes('solicitar') || uRoles.includes('recibir');
  if (!hasReceiveRole) {
    return false;
  }

  const receptor = (transfer.usuarioReceptor || transfer.usuarioRecepcion || transfer.reporteDiscrepancias?.usuarioReceptor || '').toLowerCase().trim();
  if (receptor && receptor === username) {
    return true;
  }

  const { recipientSede, recipientArea, recipientUser } = getTransferParticipants(transfer);
  if (recipientUser && recipientUser.toLowerCase().trim() === username) {
    return true;
  }

  if (receptor && receptor !== 'sucursal' && receptor !== username) {
    return false;
  }

  const userSede = normalizeStr(currentUser.sede);
  const userArea = normalizeStr(currentUser.area);
  const rSede = normalizeStr(recipientSede);
  const rArea = normalizeStr(recipientArea);

  if (!userSede || rSede !== userSede) {
    return false;
  }

  if (rArea && userArea) {
    return rArea === userArea || rArea.includes(userArea) || userArea.includes(rArea);
  }

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
        if (isInitialSolicitudesLoad) {
          snap.docs.forEach(d => {
            const data = d.data();
            if (data && data.estado) {
              knownDocStates.set(d.id, data.estado);
              markEventAsNotified(`solicitud_${d.id}_${data.estado}`);
            }
          });
          isInitialSolicitudesLoad = false;
        } else {
          const activeUser = getActiveUserForNotifications();
          const uName = (activeUser.username || '').toLowerCase();

          snap.docChanges().forEach(change => {
            if (change.type === 'added' || change.type === 'modified') {
              const data = change.doc.data();
              const docId = change.doc.id;
              if (!data || data.estado === 'borrador') return;

              const prevStatus = knownDocStates.get(docId);
              knownDocStates.set(docId, data.estado);

              if (change.type === 'modified' && prevStatus === data.estado) {
                return;
              }

              const notifKey = `solicitud_${docId}_${data.estado}`;
              if (hasEventBeenNotified(notifKey)) {
                return;
              }

              const folioTxt = data.folio || 'Sin Folio';
              const solUser = (data.usuarioSolicitante || '').toLowerCase();
              const { recipientSede, recipientArea, dispatchSede, dispatchArea, isDirect } = getTransferParticipants(data);

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

              if (data.estado === 'faltantes_despachados') {
                const isForMe = canUserReceive(data, activeUser);

                if (isForMe) {
                  markEventAsNotified(notifKey);
                  showNotification('Faltantes Despachados', `Se enviaron los productos faltantes del pedido ${folioTxt}. Revisa la caja entrante.`);
                }
              }

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
            const merged = {
              ...remoteItem,
              ...localItem,
              solicitada: Boolean(localItem.solicitada || remoteItem.solicitada),
              solicitado: Boolean(localItem.solicitado || remoteItem.solicitado),
              atendida: Boolean(localItem.atendida || remoteItem.atendida),
              atendido: Boolean(localItem.atendido || remoteItem.atendido),
              despachada: Boolean(localItem.despachada || remoteItem.despachada),
              despachado: Boolean(localItem.despachado || remoteItem.despachado),
              recibida: Boolean(localItem.recibida || remoteItem.recibida),
              recibido: Boolean(localItem.recibido || remoteItem.recibido)
            };
            validItems.push(merged);
            if (isFirebaseConfigured) {
              setDoc(doc(db, 'solicitudes', id), cleanForFirestore(merged), { merge: true })
                .catch(err => console.warn('[Firebase Auto-Sync] Error sincronizando estado avanzado local a Firestore:', err));
            }
          } else if (localWeight === remoteWeight) {
            const localRecTime = new Date(localItem?.recepcionProgreso?.updatedAt || 0).getTime();
            const remoteRecTime = new Date(remoteItem?.recepcionProgreso?.updatedAt || 0).getTime();
            const keepLocalRecepcion = Boolean(localItem?.recepcionProgreso) && localRecTime >= remoteRecTime;

            const mergedItems = (remoteItem.items || localItem.items || []).map((rItem, idx) => {
              const lItem = localItem.items?.[idx];
              if (!lItem) return rItem;
              return {
                ...rItem,
                solicitado: lItem.solicitado !== undefined ? (lItem.solicitado || rItem.solicitado) : rItem.solicitado,
                atendido: lItem.atendido !== undefined ? (lItem.atendido || rItem.atendido) : rItem.atendido,
                despachado: lItem.despachado !== undefined ? (lItem.despachado || rItem.despachado) : rItem.despachado,
                recibido: lItem.recibido !== undefined ? (lItem.recibido || rItem.recibido) : rItem.recibido,
                cantidadRecibida: lItem.cantidadRecibida !== undefined ? lItem.cantidadRecibida : rItem.cantidadRecibida,
                cantidadDespachada: lItem.cantidadDespachada !== undefined ? lItem.cantidadDespachada : rItem.cantidadDespachada,
                observacionRecepcion: lItem.observacionRecepcion !== undefined ? lItem.observacionRecepcion : rItem.observacionRecepcion
              };
            });

            const merged = {
              ...remoteItem,
              solicitada: localItem.solicitada !== undefined ? (localItem.solicitada || remoteItem.solicitada) : remoteItem.solicitada,
              solicitado: localItem.solicitado !== undefined ? (localItem.solicitado || remoteItem.solicitado) : remoteItem.solicitado,
              atendida: localItem.atendida !== undefined ? (localItem.atendida || remoteItem.atendida) : remoteItem.atendida,
              atendido: localItem.atendido !== undefined ? (localItem.atendido || remoteItem.atendido) : remoteItem.atendido,
              despachada: localItem.despachada !== undefined ? (localItem.despachada || remoteItem.despachada) : remoteItem.despachada,
              despachado: localItem.despachado !== undefined ? (localItem.despachado || remoteItem.despachado) : remoteItem.despachado,
              recibida: localItem.recibida !== undefined ? (localItem.recibida || remoteItem.recibida) : remoteItem.recibida,
              recibido: localItem.recibido !== undefined ? (localItem.recibido || remoteItem.recibido) : remoteItem.recibido,
              enTransito: localItem.enTransito !== undefined ? localItem.enTransito : remoteItem.enTransito,
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

  async deleteEmptyDraft(solicitudId) {
    if (!solicitudId) return;
    markSolicitudAsDeleted(solicitudId);
    const current = getLocalSolicitudes();
    const filtered = current.filter(s => s.id !== solicitudId);
    cachedSolicitudesList = filtered;
    saveLocalSolicitudes(filtered);

    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'solicitudes', solicitudId))
        .catch(err => console.warn('Error eliminando borrador vacío en Firebase (offline):', err));
    }
  },

  async purgeEmptyDrafts(ids) {
    if (!ids || ids.length === 0) return;
    ids.forEach(id => markSolicitudAsDeleted(id));
    const current = getLocalSolicitudes();
    const idSet = new Set(ids);
    const filtered = current.filter(s => !idSet.has(s.id));
    cachedSolicitudesList = filtered;
    saveLocalSolicitudes(filtered);

    if (isFirebaseConfigured) {
      ids.forEach(id => {
        deleteDoc(doc(db, 'solicitudes', id))
          .catch(e => console.warn('Error purgando borrador basura de Firebase (offline):', id, e));
      });
    }
  },

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

    const initial = cachedSolicitudesList || getLocalSolicitudes();
    if (initial && initial.length >= 0) {
      try {
        onUpdate(initial);
      } catch (_) {}
    }

    activeSolicitudesCallbacks.add(onUpdate);

    ensureGlobalSolicitudesSubscription();

    return () => {
      activeSolicitudesCallbacks.delete(onUpdate);
    };
  },

  async getActiveDraft(username) {
    const list = getLocalSolicitudes();
    return list.find(s => s.usuarioSolicitante === username && s.estado === 'borrador' && s.items && s.items.length > 0) || null;
  },

  async saveDraft(solicitud) {
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
      sucursalOrigenId: solicitud.sucursalOrigenId || '',
      areaOrigen: solicitud.areaOrigen || '',
      areaOrigenId: solicitud.areaOrigenId || '',
      sucursalDestino: solicitud.sucursalDestino || '',
      sucursalDestinoId: solicitud.sucursalDestinoId || '',
      areaDestino: solicitud.areaDestino || '',
      areaDestinoId: solicitud.areaDestinoId || '',
      usuarioSolicitante: solicitud.usuarioSolicitante || '',
      usuarioDestino: solicitud.usuarioDestino || '',
      esTransferenciaInterna: Boolean(solicitud.esTransferenciaInterna || (solicitud.sucursalOrigen && solicitud.sucursalOrigen === solicitud.sucursalDestino)),
      estado: 'borrador',
      solicitada: false,
      solicitado: false,
      estadoSolicitud: 'borrador',
      despachada: false,
      despachado: false,
      atendida: false,
      atendido: false,
      estadoDespacho: 'pendiente',
      recibida: false,
      recibido: false,
      enTransito: false,
      estadoRecepcion: 'pendiente',
      fecha: solicitud.fecha || new Date().toISOString(),
      items: solicitud.items || []
    };

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
    cachedSolicitudesList = updated;

    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items).catch(() => {});
    }

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'solicitudes', docData.id), cleanForFirestore(docData), { merge: true })
        .catch(err => console.warn('Borrador guardado localmente (offline):', err));
    }

    return docData;
  },

  async sendSolicitud(solicitud) {
    if (!solicitud || !solicitud.items || solicitud.items.length === 0) return null;

    const solicitudId = solicitud.id || ('sol-' + Date.now());
    const now = new Date().toISOString();

    if (solicitudId) {
      unmarkSolicitudAsDeleted(solicitudId);
    }

    const docData = {
      ...solicitud,
      id: solicitudId,
      folio: solicitud.folio || '',
      sucursalOrigen: solicitud.sucursalOrigen || '',
      sucursalOrigenId: solicitud.sucursalOrigenId || '',
      areaOrigen: solicitud.areaOrigen || '',
      areaOrigenId: solicitud.areaOrigenId || '',
      sucursalDestino: solicitud.sucursalDestino || '',
      sucursalDestinoId: solicitud.sucursalDestinoId || '',
      areaDestino: solicitud.areaDestino || '',
      areaDestinoId: solicitud.areaDestinoId || '',
      usuarioSolicitante: solicitud.usuarioSolicitante || '',
      solicitanteNombre: solicitud.solicitanteNombre || solicitud.usuarioSolicitante || '',
      usuarioDestino: solicitud.usuarioDestino || '',
      esTransferenciaInterna: Boolean(
        solicitud.esTransferenciaInterna ||
        (solicitud.sucursalOrigen && solicitud.sucursalDestino && solicitud.sucursalOrigen.toLowerCase() === solicitud.sucursalDestino.toLowerCase())
      ),
      estado: 'enviada',
      solicitada: true,
      solicitado: true,
      estadoSolicitud: 'solicitada',
      fechaSolicitud: now,
      despachada: false,
      despachado: false,
      estadoDespacho: 'pendiente',
      fechaDespacho: null,
      usuarioDespacho: null,
      atendida: false,
      atendido: false,
      estadoAtencion: 'pendiente',
      fechaAtencion: null,
      usuarioAtencion: null,
      recibida: false,
      recibido: false,
      enTransito: false,
      estadoRecepcion: 'pendiente',
      fechaRecepcion: null,
      usuarioRecepcion: null,
      observaciones: solicitud.observaciones || solicitud.motivo || '',
      motivo: solicitud.motivo || solicitud.observaciones || '',
      notas: solicitud.notas || solicitud.observaciones || '',
      fecha: solicitud.fecha || now,
      fechaEnvio: now,
      items: (solicitud.items || []).map(item => ({
        ...item,
        solicitado: true,
        despachado: false,
        atendido: false,
        recibido: false
      }))
    };

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
    cachedSolicitudesList = updated;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updated); } catch (_) {}
    });

    undismissNotification(`tr-env-${solicitudId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp_notifications_updated'));
    }

    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items).catch(() => {});
    }

    playOrderSuccessSound();

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(docData), { merge: true });
      } catch (err) {
        console.warn('[Offline Mode] Solicitud guardada localmente, se sincronizará con Firebase al reconectar:', err);
      }
    }

    return docData;
  },

  async submitSolicitud(solicitudId) {
    if (!solicitudId) return false;
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    const nowIso = new Date().toISOString();
    const updateData = {
      estado: 'enviada',
      solicitada: true,
      solicitado: true,
      estadoSolicitud: 'solicitada',
      fechaSolicitud: existing?.fechaSolicitud || nowIso,
      despachada: false,
      despachado: false,
      estadoDespacho: 'pendiente',
      atendida: false,
      atendido: false,
      estadoAtencion: 'pendiente',
      recibida: false,
      recibido: false,
      enTransito: false,
      estadoRecepcion: 'pendiente',
      fechaEnvio: nowIso
    };
    const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };

    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s);
    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    playOrderSuccessSound();

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('[Firebase Sync Error] Envío encolado localmente:', err);
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

    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    if (isFirebaseConfigured && currentItems) {
      const target = updatedList.find(s => s.id === solicitudId);
      const fullPayload = target || { id: solicitudId, items: currentItems, estado: newEstado };
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true })
        .catch(err => console.warn('Item atendido guardado localmente (offline):', err));
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
          const shouldAtendido = Number(cantidadDespachada) > 0 ? true : items[itemIndex].atendido;
          items[itemIndex] = {
            ...items[itemIndex],
            cantidadDespachada,
            atendido: shouldAtendido,
            ...(motivoAjuste !== undefined ? { motivoAjusteDespacho: motivoAjuste } : {})
          };
        }
        currentItems = items;
        newEstado = s.estado === 'enviada' ? 'en_despacho' : s.estado;
        return { ...s, items, estado: newEstado };
      }
      return s;
    });

    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    if (isFirebaseConfigured && currentItems) {
      const target = updatedList.find(s => s.id === solicitudId);
      const fullPayload = target || { id: solicitudId, items: currentItems, estado: newEstado };
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true })
        .catch(err => console.warn('Cantidad de despacho guardada localmente (offline):', err));
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

    if (extraItem?.codigo && extraItem?.descripcion) {
      catalogService.saveToCleanCatalog(extraItem.codigo, extraItem.descripcion).catch(() => {});
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
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    if (isFirebaseConfigured && target) {
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(target), { merge: true })
        .catch(err => console.warn('Producto extra guardado localmente (offline):', err));
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
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    if (isFirebaseConfigured && target) {
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(target), { merge: true })
        .catch(err => console.warn('Producto extra eliminado localmente (offline):', err));
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
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    if (isFirebaseConfigured && target) {
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(target), { merge: true })
        .catch(err => console.warn('Cantidad extra guardada localmente (offline):', err));
    }
    return true;
  },

  async completeSolicitud(solicitudId, folio = null, dispatchDetails = null) {
    if (!solicitudId) return false;

    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    const nowIso = new Date().toISOString();

    const updateData = {
      estado: 'completada',
      solicitada: true,
      solicitado: true,
      despachada: true,
      despachado: true,
      estadoDespacho: 'despachada',
      atendida: true,
      atendido: true,
      estadoAtencion: 'atendida',
      fechaAtencion: nowIso,
      fechaDespacho: nowIso,
      enTransito: true,
      recibida: false,
      recibido: false,
      estadoRecepcion: 'pendiente'
    };
    if (folio) {
      updateData.folio = folio;
    }
    if (dispatchDetails) {
      if (dispatchDetails.items) {
        updateData.items = dispatchDetails.items.map(it => ({
          ...it,
          solicitado: true,
          atendido: true,
          despachado: true,
          recibido: false
        }));
      }
      if (dispatchDetails.ajustesDespacho) {
        updateData.ajustesDespacho = dispatchDetails.ajustesDespacho;
      }
      if (dispatchDetails.usuarioDespachador) {
        updateData.usuarioDespachador = dispatchDetails.usuarioDespachador;
        updateData.usuarioDespacho = dispatchDetails.usuarioDespachador;
        updateData.usuarioAtencion = dispatchDetails.usuarioDespachador;
      }
      if (dispatchDetails.observacionesDespacho) {
        updateData.observaciones = dispatchDetails.observacionesDespacho;
        updateData.motivo = dispatchDetails.observacionesDespacho;
      }
    }

    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s);
    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    playOrderSuccessSound();

    if (isFirebaseConfigured) {
      const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
        console.log(`[Firebase Sync] Solicitud ${solicitudId} completada y sincronizada exitosamente en Firestore.`);
      } catch (err) {
        console.warn('[Firebase Sync Offline] Despacho guardado localmente, pendiente de sincronizar en Firestore:', err);
      }
    }
    return true;
  },

  async createDirectDispatch(dispatchData) {
    if (dispatchData.id) {
      unmarkSolicitudAsDeleted(dispatchData.id);
    }
    const nowIso = new Date().toISOString();
    const docData = {
      id: dispatchData.id || ('disp-' + Date.now()),
      folio: dispatchData.folio || '',
      sucursalOrigen: dispatchData.sucursalOrigen || '',
      sucursalOrigenId: dispatchData.sucursalOrigenId || '',
      areaOrigen: dispatchData.areaOrigen || '',
      areaOrigenId: dispatchData.areaOrigenId || '',
      sucursalDestino: dispatchData.sucursalDestino || dispatchData.sucursalReceptora || '',
      sucursalDestinoId: dispatchData.sucursalDestinoId || dispatchData.sucursalReceptoraId || '',
      areaDestino: dispatchData.areaDestino || dispatchData.areaReceptora || '',
      areaDestinoId: dispatchData.areaDestinoId || dispatchData.areaReceptoraId || '',
      sucursalReceptora: dispatchData.sucursalReceptora || dispatchData.sucursalDestino || '',
      sucursalReceptoraId: dispatchData.sucursalReceptoraId || dispatchData.sucursalDestinoId || '',
      areaReceptora: dispatchData.areaReceptora || dispatchData.areaDestino || '',
      areaReceptoraId: dispatchData.areaReceptoraId || dispatchData.areaDestinoId || '',
      sucursalDespachadora: dispatchData.sucursalDespachadora || dispatchData.sucursalOrigen || '',
      sucursalDespachadoraId: dispatchData.sucursalDespachadoraId || dispatchData.sucursalOrigenId || '',
      areaDespachadora: dispatchData.areaDespachadora || dispatchData.areaOrigen || '',
      areaDespachadoraId: dispatchData.areaDespachadoraId || dispatchData.areaOrigenId || '',
      usuarioSolicitante: dispatchData.usuarioSolicitante || dispatchData.usuarioDespacho || 'Despacho Directo',
      solicitanteNombre: dispatchData.solicitanteNombre || dispatchData.usuarioSolicitante || dispatchData.usuarioDespacho || 'Despacho Directo',
      usuarioDestino: dispatchData.usuarioDestino || '',
      usuarioDespacho: dispatchData.usuarioDespacho || '',
      usuarioAtencion: dispatchData.usuarioDespacho || '',
      esTransferenciaInterna: Boolean(
        dispatchData.esTransferenciaInterna ||
        (dispatchData.sucursalOrigen && dispatchData.sucursalDestino && dispatchData.sucursalOrigen === dispatchData.sucursalDestino)
      ),
      estado: 'completada',
      solicitada: true,
      solicitado: true,
      estadoSolicitud: 'solicitada',
      fechaSolicitud: nowIso,
      despachada: true,
      despachado: true,
      estadoDespacho: 'despachada',
      atendida: true,
      atendido: true,
      estadoAtencion: 'atendida',
      fechaAtencion: nowIso,
      enTransito: true,
      recibida: false,
      recibido: false,
      estadoRecepcion: 'pendiente',
      fechaRecepcion: null,
      usuarioRecepcion: null,
      sinSolicitud: true,
      esDespachoDirecto: true,
      observaciones: dispatchData.observaciones || 'Pedido despachado sin haber sido solicitado',
      motivo: dispatchData.motivo || dispatchData.observaciones || '',
      notas: dispatchData.notas || '',
      fecha: nowIso,
      fechaDespacho: nowIso,
      items: (dispatchData.items || []).map(item => ({
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidadSolicitada: 0,
        cantidadDespachada: Number(item.cantidad || item.cantidadDespachada || 1),
        solicitado: true,
        atendido: true,
        despachado: true,
        recibido: false,
        esExtra: false
      }))
    };

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
    cachedSolicitudesList = updated;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updated); } catch (_) {}
    });

    playOrderSuccessSound();

    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items).catch(() => {});
    }

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'solicitudes', docData.id), cleanForFirestore(docData), { merge: true });
        console.log(`[Firebase Sync] Despacho directo ${docData.id} guardado en Firestore.`);
      } catch (err) {
        console.warn('Despacho directo guardado localmente (offline):', err);
      }
    }

    return docData;
  },

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
      sucursalOrigenId: draft.sucursalOrigenId || '',
      areaOrigen: draft.areaOrigen || '',
      areaOrigenId: draft.areaOrigenId || '',
      sucursalDestino: draft.sucursalDestino || draft.sucursalReceptora || '',
      sucursalDestinoId: draft.sucursalDestinoId || draft.sucursalReceptoraId || '',
      areaDestino: draft.areaDestino || draft.areaReceptora || '',
      areaDestinoId: draft.areaDestinoId || draft.areaReceptoraId || '',
      sucursalReceptora: draft.sucursalReceptora || draft.sucursalDestino || '',
      sucursalReceptoraId: draft.sucursalReceptoraId || draft.sucursalDestinoId || '',
      areaReceptora: draft.areaReceptora || draft.areaDestino || '',
      areaReceptoraId: draft.areaReceptoraId || draft.areaDestinoId || '',
      sucursalDespachadora: draft.sucursalDespachadora || draft.sucursalOrigen || '',
      sucursalDespachadoraId: draft.sucursalDespachadoraId || draft.sucursalOrigenId || '',
      areaDespachadora: draft.areaDespachadora || draft.areaOrigen || '',
      areaDespachadoraId: draft.areaDespachadoraId || draft.areaOrigenId || '',
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

    if (Array.isArray(docData.items) && docData.items.length > 0) {
      catalogService.saveBatchToCleanCatalog(docData.items);
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

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'solicitudes', docData.id), cleanForFirestore(docData), { merge: true })
        .catch(err => console.warn('Error guardando borrador de despacho directo en Firebase (offline):', err));
    }

    return docData;
  },

  async updateFolio(solicitudId, folio) {
    if (!solicitudId) return;
    const updateData = { folio: folio || '' };
    
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    saveLocalSolicitudes(list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s));

    if (isFirebaseConfigured) {
      const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true })
        .catch(err => console.warn('Error actualizando folio en Firebase (offline):', err));
    }
    return true;
  },

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

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(updatedOrder), { merge: true })
        .catch(err => console.warn('Error sincronizando progreso de recepción en Firebase (offline):', err));
    }
    return true;
  },

  async receiveSolicitud(solicitudId, faltantes = [], itemsActualizados = null, usuarioReceptor = '') {
    if (!solicitudId) return false;
    const estado = faltantes.length > 0 ? 'recibida_incompleta' : 'recibida';
    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    const nowIso = new Date().toISOString();
    
    let finalItems = itemsActualizados;
    if (!finalItems && existing?.items) {
      finalItems = existing.items.map(it => ({
        ...it,
        recibido: true,
        atendido: true,
        cantidadRecibida: it.cantidadDespachada ?? it.cantidadSolicitada ?? 1
      }));
    }

    const updateData = {
      estado,
      atendida: true,
      atendido: true,
      recibida: true,
      recibido: true,
      enTransito: false,
      estadoRecepcion: estado,
      reporteFaltantes: faltantes,
      fechaRecepcion: nowIso,
      usuarioReceptor: usuarioReceptor || existing?.usuarioReceptor || '',
      usuarioRecepcion: usuarioReceptor || existing?.usuarioReceptor || '',
      ...(finalItems ? { items: finalItems } : {})
    };
    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updateData } : s);
    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    playOrderSuccessSound();

    if (faltantes.length > 0) {
      undismissNotification(`tr-falt-${solicitudId}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp_notifications_updated'));
      }
    }

    if (isFirebaseConfigured) {
      const fullPayload = existing ? { ...existing, ...updateData } : { id: solicitudId, ...updateData };
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Recepción guardada localmente (offline):', err);
      }
    }
    return true;
  },

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
    const nowIso = new Date().toISOString();

    const updatePayload = {
      estado,
      atendida: true,
      atendido: true,
      recibida: true,
      recibido: true,
      enTransito: false,
      estadoRecepcion: estado,
      fechaRecepcion: nowIso,
      usuarioReceptor: usuarioReceptor || '',
      usuarioRecepcion: usuarioReceptor || '',
      observacionesRecepcion: observaciones || '',
      reporteFaltantes: faltantes,
      reporteDiscrepancias: {
        fecha: nowIso,
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
      fechaReporteFaltantes: nowIso
    };

    if (Array.isArray(itemsActualizados) && itemsActualizados.length > 0) {
      updatePayload.items = itemsActualizados.map(it => ({
        ...it,
        recibido: true,
        atendido: true
      }));
    }

    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s);
    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    playOrderSuccessSound();

    undismissNotification(`tr-falt-${solicitudId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp_notifications_updated'));
    }

    if (isFirebaseConfigured) {
      const fullPayload = existing ? { ...existing, ...updatePayload } : { id: solicitudId, ...updatePayload };
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Discrepancias guardadas localmente (offline):', err);
      }
    }
    return true;
  },

  async resolveReporteFaltantes(solicitudId, resolutionData) {
    if (!solicitudId) return false;
    const hasDispatchedItems = resolutionData?.itemsResolucion?.some(
      i => i.despachado && Number(i.cantidadDespachada || 0) > 0
    );
    const nuevoEstado = hasDispatchedItems ? 'faltantes_despachados' : 'cerrada_con_faltantes';

    const currentSol = getLocalSolicitudes().find(s => s.id === solicitudId);

    const updatePayload = {
      estado: nuevoEstado,
      enTransito: Boolean(hasDispatchedItems),
      recibida: !hasDispatchedItems,
      recibido: !hasDispatchedItems,
      estadoRecepcion: hasDispatchedItems ? 'pendiente' : 'cerrada_con_faltantes',
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
    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s);
    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    playOrderSuccessSound();

    if (isFirebaseConfigured) {
      const fullPayload = currentSol ? { ...currentSol, ...updatePayload } : { id: solicitudId, ...updatePayload };
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Resolución de faltantes guardada localmente (offline):', err);
      }
    }

    dismissNotification(`tr-falt-${solicitudId}`);

    return true;
  },

  async receiveFaltantes(solicitudId, receptionData = {}) {
    if (!solicitudId) return false;
    const itemsAunFaltantes = receptionData.itemsAunFaltantes || [];
    const reReportToBodega = Boolean(receptionData.reReportToBodega && itemsAunFaltantes.length > 0);
    const nuevoEstado = itemsAunFaltantes.length === 0
      ? 'recibida'
      : (reReportToBodega ? 'recibida_incompleta' : 'cerrada_con_faltantes');

    const list = getLocalSolicitudes();
    const existing = list.find(s => s.id === solicitudId);
    const nowIso = new Date().toISOString();

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
        atendido: true,
        cantidadRecibida: recItem !== undefined ? totalRec : it.cantidadRecibida,
        observacionRecepcion: obs || it.observacionRecepcion || ''
      };
    });

    const updatePayload = {
      estado: nuevoEstado,
      atendida: true,
      atendido: true,
      recibida: true,
      recibido: true,
      enTransito: false,
      estadoRecepcion: nuevoEstado,
      fechaRecepcion: nowIso,
      items: updatedItems
    };

    if (reReportToBodega) {
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
      updatePayload.fechaReporteFaltantes = nowIso;
      updatePayload.observacionesRecepcion = notasSucursal;
      updatePayload.reporteDiscrepancias = {
        ...(existing?.reporteDiscrepancias || {}),
        fechaReporte: nowIso,
        usuarioReceptor: receptionData.usuarioRecepcion || existing?.reporteDiscrepancias?.usuarioReceptor || 'sucursal',
        observaciones: notasSucursal,
        resuelto: false
      };
      updatePayload.reReenvioRequerido = true;

      undismissNotification(`tr-falt-${solicitudId}`);
      dismissNotification(`tr-falt-env-${solicitudId}`);
    } else {
      updatePayload.recepcionFaltantes = {
        fechaRecepcion: nowIso,
        usuarioRecepcion: receptionData.usuarioRecepcion || '',
        itemsRecibidos: receptionData.itemsRecibidos || [],
        itemsAunFaltantes: itemsAunFaltantes,
        notas: receptionData.notas || ''
      };

      dismissNotification(`tr-falt-env-${solicitudId}`);
      dismissNotification(`tr-falt-${solicitudId}`);
    }

    dismissNotification(`tr-comp-${solicitudId}`);

    const updatedList = list.map(s => s.id === solicitudId ? { ...s, ...updatePayload } : s);
    saveLocalSolicitudes(updatedList);
    cachedSolicitudesList = updatedList;

    activeSolicitudesCallbacks.forEach(cb => {
      try { cb(updatedList); } catch (_) {}
    });

    playOrderSuccessSound();

    if (isFirebaseConfigured) {
      const fullPayload = existing ? { ...existing, ...updatePayload } : { id: solicitudId, ...updatePayload };
      try {
        await setDoc(doc(db, 'solicitudes', solicitudId), cleanForFirestore(fullPayload), { merge: true });
      } catch (err) {
        console.warn('Recepción de faltantes guardada localmente (offline):', err);
      }
    }

    window.dispatchEvent(new Event('erp_notifications_updated'));

    return true;
  },

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

    markSolicitudAsDeleted(solicitudId);

    const currentList = getLocalSolicitudes();
    const updatedList = currentList.filter(s => s.id !== solicitudId);
    cachedSolicitudesList = updatedList;
    saveLocalSolicitudes(updatedList);

    if (isFirebaseConfigured) {
      deleteDoc(doc(db, 'solicitudes', solicitudId))
        .catch(err => console.warn('Error eliminando borrador en Firebase (offline):', err));
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

  async syncOfflineOrders() {
    if (!isFirebaseConfigured) return;
    try {
      const localList = getLocalSolicitudes();
      const deletedIds = getDeletedSolicitudesIds();
      const operationalOrders = localList.filter(s => s && s.id && s.estado !== 'borrador' && !deletedIds.has(s.id));
      for (const order of operationalOrders) {
        setDoc(doc(db, 'solicitudes', order.id), cleanForFirestore(order), { merge: true })
          .catch(err => console.warn('[Sync Offline] Error sincronizando orden pendiente:', order.id, err));
      }
    } catch (err) {
      console.warn('[Sync Offline] Error en syncOfflineOrders:', err);
    }
  },

  canUserViewInSolicitar,
  canUserDispatch,
  canUserReceive,
  canUserViewInRecibirHistory,
  getTransferParticipants,
  formatOrderRequestedBy,

  playNotificationSound,
  playCheckSound,
  playOrderSuccessSound,
  playSuccessSound,
  unlockAudioEngine,
  dismissNotification,
  undismissNotification,
  getDismissedNotifications
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[ERP Control] Conexión recuperada. Sincronizando órdenes locales...');
    transferService.syncOfflineOrders();
  });
}

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
