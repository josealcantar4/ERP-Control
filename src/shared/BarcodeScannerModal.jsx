/**
 * Modal de escaneo continuo de códigos de barra utilizando la cámara del dispositivo y retroalimentación auditiva.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  AlertCircle,
  ScanBarcode,
  Search,
  Loader2,
  Zap,
  ZapOff,
  Focus,
  ZoomIn,
  SwitchCamera,
  Camera,
  Play
} from 'lucide-react';
import { catalogService } from '../modules/catalogo';
import { useModalAnimation } from '../hooks';
import { MarqueeText } from './MarqueeText';
import { MarqueeSearchInput } from './MarqueeSearchInput';

const STORAGE_KEY = 'erp_scanner_camera_settings';

let cachedCameraDevices = null;

const BARCODE_ONLY_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF
];

function isExcludedOrQrCode(decodedResult) {
  const formatName = decodedResult?.result?.format?.formatName;
  const formatId = decodedResult?.result?.format?.format;
  return (
    formatName === 'QR_CODE' ||
    formatId === Html5QrcodeSupportedFormats.QR_CODE ||
    formatName === 'DATA_MATRIX' ||
    formatId === Html5QrcodeSupportedFormats.DATA_MATRIX ||
    formatName === 'AZTEC' ||
    formatId === Html5QrcodeSupportedFormats.AZTEC ||
    formatName === 'MAXICODE' ||
    formatId === Html5QrcodeSupportedFormats.MAXICODE ||
    formatName === 'PDF_417' ||
    formatId === Html5QrcodeSupportedFormats.PDF_417
  );
}

function getStoredCameraSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        torch: Boolean(data.torch),
        zoom: typeof data.zoom === 'number' ? data.zoom : 1.5,
        focusMode: data.focusMode || 'continuous',
        cameraId: data.cameraId || null
      };
    }
  } catch (e) {
    console.warn('Error leyendo configuraciones de cámara:', e);
  }
  return { torch: false, zoom: 1.5, focusMode: 'continuous', cameraId: null };
}

function saveCameraSettings(settings) {
  try {
    const current = getStoredCameraSettings();
    const toSave = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('Error guardando configuraciones de cámara:', e);
  }
}

function classifyCamera(deviceOrLabel, index = 0, totalCount = 1) {
  const rawLabel = typeof deviceOrLabel === 'string'
    ? deviceOrLabel
    : (deviceOrLabel?.label || '');
  const l = rawLabel.toLowerCase();

  if (
    l.includes('front') ||
    l.includes('frontal') ||
    l.includes('delantera') ||
    l.includes('selfie') ||
    l.includes('user') ||
    l.includes('facing front') ||
    l.includes('camera2 1') ||
    (l.includes('camera 1') && !l.includes('camera 10'))
  ) {
    return { type: 'front', label: 'Frontal', sortOrder: 90 };
  }

  if (
    l.includes('0.5') ||
    l.includes('0,5') ||
    l.includes('0.6') ||
    l.includes('0,6') ||
    l.includes('ultra') ||
    l.includes('ultrawide') ||
    l.includes('gran angular') ||
    l.includes('wide-angle') ||
    l.includes('camera2 2') ||
    (l.includes('camera 2') && !l.includes('camera 20'))
  ) {
    return { type: 'wide', label: '0.5x Ultra', sortOrder: 20 };
  }

  if (
    l.includes('tele') ||
    l.includes('periscope') ||
    l.includes('periscopio') ||
    l.includes('camera2 3') ||
    (l.includes('camera 3') && !l.includes('camera 30'))
  ) {
    if (l.includes('3x')) return { type: 'tele', label: '3x Tele', sortOrder: 30 };
    if (l.includes('2x')) return { type: 'tele', label: '2x Tele', sortOrder: 30 };
    if (l.includes('5x')) return { type: 'tele', label: '5x Tele', sortOrder: 30 };
    return { type: 'tele', label: 'Telefoto', sortOrder: 30 };
  }

  if (l.includes('macro') || l.includes('cercano')) {
    return { type: 'macro', label: 'Macro', sortOrder: 40 };
  }

  if (
    l.includes('main') ||
    l.includes('principal') ||
    l.includes('primary') ||
    l.includes('1x') ||
    l.includes('1.0') ||
    l.includes('camera2 0') ||
    (l.includes('camera 0') && !l.includes('camera 00')) ||
    l.includes('back 0') ||
    l.includes('rear 0') ||
    l.includes('facing back') ||
    l === 'back camera' ||
    l === 'cámara trasera'
  ) {
    return { type: 'main', label: '1x Principal', sortOrder: 10 };
  }

  if (index === 0) {
    return { type: 'main', label: '1x Principal', sortOrder: 10 };
  }
  if (index === 1 && totalCount === 2) {
    return { type: 'front', label: 'Frontal', sortOrder: 90 };
  }
  if (index === 1) {
    return { type: 'wide', label: '0.5x Ultra', sortOrder: 20 };
  }
  return { type: 'aux', label: `Lente ${index + 1}`, sortOrder: 50 + index };
}

function determineCameraLabel(deviceOrLabel, index = 0, allCameras = []) {
  if (deviceOrLabel && typeof deviceOrLabel === 'object' && deviceOrLabel.displayName) {
    return deviceOrLabel.displayName;
  }
  const info = classifyCamera(deviceOrLabel, index, allCameras?.length || 1);
  return info.label;
}

function prepareCameraList(devices = []) {
  if (!devices || devices.length === 0) return [];
  const classified = devices.map((dev, idx) => {
    const info = classifyCamera(dev, idx, devices.length);
    return {
      ...dev,
      cameraType: info.type,
      displayName: info.label,
      sortOrder: info.sortOrder
    };
  });
  classified.sort((a, b) => a.sortOrder - b.sortOrder);
  return classified;
}

export function BarcodeScannerModal({ isOpen, onClose, onDetected, isPaused = false }) {
  const {
    shouldRender,
    isClosing,
    cardRef,
    handleClose: animateClose,
    handleBackdropClick,
    backdropClass,
    cardClass,
    cardStyle
  } = useModalAnimation({
    isOpen,
    onClose
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeMode, setActiveMode] = useState('camera');
  const activeModeRef = useRef('camera');
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const lastScanTimeRef = useRef(0);
  const searchInputRef = useRef(null);
  const isPausedRef = useRef(isPaused);
  const isInternalPausedRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  const isClosingRef = useRef(isClosing);
  const [scannerError, setScannerError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [isCameraSuspended, setIsCameraSuspended] = useState(false);
  const isCameraSuspendedRef = useRef(isCameraSuspended);
  const [scannerSessionKey, setScannerSessionKey] = useState(0);
  const [zoomFeedback, setZoomFeedback] = useState({ visible: false, level: 1.5 });
  const zoomFeedbackTimeoutRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const resumeScanTimerRef = useRef(null);
  const resumeTorchTimerRef = useRef(null);
  const detectionRecoveryTimerRef = useRef(null);
  const focusTimerRef = useRef(null);
  const torchQueueRef = useRef(Promise.resolve());
  const autoSuspendedForTorchRef = useRef(false);
  const scannerRef = useRef(null);
  const isSwitchingCameraRef = useRef(false);
  const isStartingRef = useRef(false);
  const activeSessionRef = useRef(0);
  const stopPromiseRef = useRef(null);
  const mountedRef = useRef(true);
  const trackedStreamsRef = useRef(new Set());
  const activeStreamRef = useRef(null);
  const activeTrackRef = useRef(null);
  const prevPausedRef = useRef(isPaused);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [cameraLabel, setCameraLabel] = useState('1x Principal');
  const [isTorchOn, setIsTorchOn] = useState(() => getStoredCameraSettings().torch);
  const isTorchOnRef = useRef(isTorchOn);
  const [torchNotice, setTorchNotice] = useState('');

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
    isPausedRef.current = isPaused;
    isOpenRef.current = isOpen;
    isClosingRef.current = isClosing;
    isCameraSuspendedRef.current = isCameraSuspended;
    isTorchOnRef.current = isTorchOn;
  }, [onDetected, onClose, isPaused, isOpen, isClosing, isCameraSuspended, isTorchOn]);
  const torchNoticeTimerRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(() => getStoredCameraSettings().zoom);
  const [isFocusing, setIsFocusing] = useState(false);
  const [focusIndicator, setFocusIndicator] = useState({ x: '50%', y: '50%', visible: false });
  const [cameraCapabilities, setCameraCapabilities] = useState({
    hasTorch: false,
    hasZoom: false,
    hasContinuousFocus: false,
    minZoom: 1,
    maxZoom: 4
  });

  const detachVideoSurface = useCallback((videoElem) => {
    if (!videoElem) return;
    try {
      videoElem.onabort = null;
      videoElem.onerror = null;
    } catch {}
    try {
      if (!videoElem.paused) {
        videoElem.pause();
      }
    } catch {}
    try {
      videoElem.srcObject = null;
      videoElem.removeAttribute('src');
    } catch {}
  }, []);

  const stopMediaStreamTracks = useCallback((stream) => {
    if (!stream || typeof stream.getTracks !== 'function') return;
    try {
      stream.getTracks().forEach((t) => {
        try { t.onended = null; } catch {}
        try {
          if (t.readyState !== 'ended') {
            t.stop();
          }
        } catch {}
      });
    } catch {}
    trackedStreamsRef.current.delete(stream);
  }, []);

  const enumerateVideoCameras = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return cachedCameraDevices || [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = (devices || [])
        .filter((d) => d.kind === 'videoinput' && d.deviceId)
        .map((d, idx) => ({
          id: d.deviceId,
          label: d.label || `Cámara ${idx + 1}`
        }));

      if (videoDevices.length > 0 && devices.some((d) => d.kind === 'videoinput' && Boolean(d.label))) {
        cachedCameraDevices = videoDevices;
      }
      return videoDevices;
    } catch (err) {
      console.warn('Error enumerando cámaras sin abrir stream:', err);
      return cachedCameraDevices || [];
    }
  }, []);

  const getVideoTrack = useCallback(() => {
    if (activeTrackRef.current && activeTrackRef.current.readyState === 'live') {
      return activeTrackRef.current;
    }
    const videoElem = document.querySelector('#barcode-camera-view video');
    if (videoElem && videoElem.srcObject && typeof videoElem.srcObject.getVideoTracks === 'function') {
      const tracks = videoElem.srcObject.getVideoTracks();
      if (tracks && tracks.length > 0) {
        activeTrackRef.current = tracks[0];
        activeStreamRef.current = videoElem.srcObject;
        trackedStreamsRef.current.add(videoElem.srcObject);
        return tracks[0];
      }
    }
    return null;
  }, []);

  const forceStopHardware = useCallback(async (overrideScanner = null, overrideStream = null, options = {}) => {
    const preserveTorchPreference = Boolean(options?.preserveTorchPreference);
    const runStop = async () => {
      if (mountedRef.current && !preserveTorchPreference) {
        setIsTorchOn(false);
      }

      const scannerToStop = overrideScanner || scannerRef.current;
      if (!overrideScanner) {
        scannerRef.current = null;
      }

      const streamsToStop = new Set(trackedStreamsRef.current);
      if (overrideStream) streamsToStop.add(overrideStream);
      if (activeStreamRef.current) streamsToStop.add(activeStreamRef.current);
      if (scannerToStop?.renderedCamera?.mediaStream) {
        streamsToStop.add(scannerToStop.renderedCamera.mediaStream);
      }

      const domVideos = Array.from(document.querySelectorAll('#barcode-camera-view video'));
      domVideos.forEach((v) => {
        if (v?.srcObject) {
          streamsToStop.add(v.srcObject);
        }
        try {
          v.onabort = null;
          v.onerror = null;
        } catch {}
      });

      const track = activeTrackRef.current;
      if (track && track.readyState === 'live' && track.applyConstraints) {
        try {
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          if (caps?.torch) {
            await track.applyConstraints({ advanced: [{ torch: false }] });
          }
        } catch {}
      }
      activeTrackRef.current = null;
      activeStreamRef.current = null;

      if (scannerToStop) {
        try {
          scannerToStop.shouldScan = false;
          if (scannerToStop.foreverScanTimeout) {
            clearTimeout(scannerToStop.foreverScanTimeout);
            scannerToStop.foreverScanTimeout = null;
          }
        } catch {}
        try {
          if (scannerToStop.renderedCamera?.surface) {
            scannerToStop.renderedCamera.surface.onabort = null;
            scannerToStop.renderedCamera.surface.onerror = null;
          }
        } catch {}
        try {
          const scannerState = typeof scannerToStop.getState === 'function' ? scannerToStop.getState() : 0;
          const isRunning = Boolean(scannerToStop.isScanning) || scannerState >= 2;
          if (isRunning && scannerToStop.renderedCamera) {
            await Promise.race([
              scannerToStop.stop().catch(() => {}),
              new Promise((resolve) => setTimeout(resolve, 1000))
            ]);
          }
        } catch {}
        try {
          scannerToStop.clear();
        } catch {}
      }

      streamsToStop.forEach((stream) => stopMediaStreamTracks(stream));
      trackedStreamsRef.current.clear();

      document.querySelectorAll('#barcode-camera-view video').forEach((v) => {
        detachVideoSurface(v);
      });
      const container = document.getElementById('barcode-camera-view');
      if (container) {
        try {
          container.innerHTML = '';
        } catch {}
      }
    };

    const previousStop = stopPromiseRef.current || Promise.resolve();
    const currentStop = previousStop.catch(() => {}).then(runStop);
    stopPromiseRef.current = currentStop;
    try {
      await currentStop;
    } finally {
      if (stopPromiseRef.current === currentStop) {
        stopPromiseRef.current = null;
      }
    }
  }, [detachVideoSurface, stopMediaStreamTracks]);

  const suspendCameraDueInactivity = useCallback(async () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (resumeTorchTimerRef.current) {
      clearTimeout(resumeTorchTimerRef.current);
      resumeTorchTimerRef.current = null;
    }
    if (resumeScanTimerRef.current) {
      clearTimeout(resumeScanTimerRef.current);
      resumeScanTimerRef.current = null;
    }
    activeSessionRef.current += 1;
    isStartingRef.current = false;
    isCameraSuspendedRef.current = true;
    setIsCameraSuspended(true);
    await forceStopHardware(null, null, { preserveTorchPreference: true });
  }, [forceStopHardware]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    const canSchedule =
      isOpenRef.current &&
      !isCameraSuspendedRef.current &&
      !isClosingRef.current &&
      (isPausedRef.current || activeModeRef.current === 'camera');

    if (canSchedule) {
      inactivityTimerRef.current = setTimeout(() => {
        suspendCameraDueInactivity();
      }, 60000);
    }
  }, [suspendCameraDueInactivity]);

  const resetInactivityTimerRef = useRef(resetInactivityTimer);
  useEffect(() => {
    resetInactivityTimerRef.current = resetInactivityTimer;
  }, [resetInactivityTimer]);

  const applyZoom = useCallback(async (track, val) => {
    const videoElem = document.querySelector('#barcode-camera-view video');
    let hwApplied = false;

    if (track && track.readyState === 'live' && track.applyConstraints) {
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps && caps.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min) {
          const minZ = caps.zoom.min || 1;
          const maxZ = caps.zoom.max || 5;
          const clamped = Math.min(maxZ, Math.max(minZ, val));
          await track.applyConstraints({ advanced: [{ zoom: clamped }] });
          hwApplied = true;
        }
      } catch (e) {
        console.warn('Hardware zoom no disponible:', e);
      }
    }

    if (videoElem) {
      videoElem.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
      if (hwApplied) {
        videoElem.style.transform = 'none';
      } else {
        videoElem.style.transform = val > 1 ? `scale(${val})` : 'none';
        videoElem.style.transformOrigin = 'center center';
      }
    }
  }, []);

  const applyTorch = useCallback((track, enabled) => {
    const runTorch = async () => {
      const targetTrack = track && track.readyState === 'live' ? track : getVideoTrack();
      if (!targetTrack || targetTrack.readyState !== 'live' || !targetTrack.applyConstraints) {
        return false;
      }

      const desired = Boolean(enabled);
      if (desired && (isPausedRef.current || isCameraSuspendedRef.current || isClosingRef.current || !isOpenRef.current || activeModeRef.current !== 'camera')) {
        return false;
      }

      try {
        const caps = targetTrack.getCapabilities ? targetTrack.getCapabilities() : null;
        if (!caps || !caps.torch) return false;
      } catch {
        return false;
      }

      let ok = false;
      try {
        await targetTrack.applyConstraints({ advanced: [{ torch: desired }] });
        ok = true;
      } catch {
        try {
          await targetTrack.applyConstraints({ torch: desired });
          ok = true;
        } catch {}
      }

      if (!desired) {
        try {
          const settings = targetTrack.getSettings ? targetTrack.getSettings() : null;
          if (settings && settings.torch === true) {
            try {
              await targetTrack.applyConstraints({ torch: false });
            } catch {}
            try {
              await targetTrack.applyConstraints({ advanced: [{ torch: false }] });
            } catch {}
          }
        } catch {}
      }

      return ok;
    };

    const next = torchQueueRef.current.catch(() => {}).then(runTorch);
    torchQueueRef.current = next;
    return next;
  }, [getVideoTrack]);

  const triggerFocus = useCallback(async (track, xRatio = 0.5, yRatio = 0.5) => {
    if (!track || track.readyState !== 'live' || !track.applyConstraints) return;
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      const supportedFocus = Array.isArray(caps?.focusMode) ? caps.focusMode : [];
      if (supportedFocus.includes('single-shot')) {
        await track.applyConstraints({
          advanced: [
            {
              focusMode: 'single-shot',
              pointsOfInterest: [{ x: xRatio, y: yRatio }]
            }
          ]
        });
        setTimeout(async () => {
          if (track.readyState !== 'live') return;
          try {
            if (supportedFocus.includes('continuous')) {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
            }
          } catch {}
        }, 300);
      } else if (supportedFocus.includes('continuous')) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }]
        });
      }
    } catch {}
  }, []);

  const attachSafeVideoSurface = useCallback((scannerInstance, mySessionId) => {
    const videoElem = scannerInstance?.renderedCamera?.surface || document.querySelector('#barcode-camera-view video');
    if (videoElem) {
      try {
        videoElem.onabort = null;
        videoElem.onerror = () => {
          if (!mountedRef.current || activeSessionRef.current !== mySessionId) return;
          console.warn('[Scanner] Error recuperable en superficie de video');
        };
        videoElem.muted = true;
        videoElem.playsInline = true;
        videoElem.autoplay = true;
        if (videoElem.paused) {
          videoElem.play().catch(() => {});
        }
      } catch {}
    }
    return videoElem;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeSessionRef.current += 1;
      if (torchNoticeTimerRef.current) clearTimeout(torchNoticeTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (resumeScanTimerRef.current) clearTimeout(resumeScanTimerRef.current);
      if (resumeTorchTimerRef.current) clearTimeout(resumeTorchTimerRef.current);
      if (detectionRecoveryTimerRef.current) clearTimeout(detectionRecoveryTimerRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (zoomFeedbackTimeoutRef.current) clearTimeout(zoomFeedbackTimeoutRef.current);
      forceStopHardware();
    };
  }, [forceStopHardware]);

  useEffect(() => {
    isPausedRef.current = isPaused;
    const wasPaused = prevPausedRef.current;
    prevPausedRef.current = isPaused;
    if (isPaused === wasPaused) return;

    if (resumeScanTimerRef.current) {
      clearTimeout(resumeScanTimerRef.current);
      resumeScanTimerRef.current = null;
    }
    if (resumeTorchTimerRef.current) {
      clearTimeout(resumeTorchTimerRef.current);
      resumeTorchTimerRef.current = null;
    }
    if (detectionRecoveryTimerRef.current) {
      clearTimeout(detectionRecoveryTimerRef.current);
      detectionRecoveryTimerRef.current = null;
    }

    const track = activeTrackRef.current || getVideoTrack();

    if (isPaused) {
      isInternalPausedRef.current = true;
      resetInactivityTimerRef.current();

      const pauseTrackSafely = async () => {
        if (track && track.readyState === 'live') {
          await applyTorch(track, false);
          if (!mountedRef.current || !isPausedRef.current) return;

          try {
            const settings = track.getSettings ? track.getSettings() : null;
            if (settings && settings.torch === true) {
              autoSuspendedForTorchRef.current = true;
              activeSessionRef.current += 1;
              isCameraSuspendedRef.current = true;
              setIsCameraSuspended(true);
              if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
              inactivityTimerRef.current = setTimeout(() => {
                autoSuspendedForTorchRef.current = false;
                inactivityTimerRef.current = null;
              }, 60000);
              await forceStopHardware(null, null, { preserveTorchPreference: true });
              return;
            }
          } catch {}

          try {
            track.enabled = false;
          } catch {}
          const video = document.querySelector('#barcode-camera-view video');
          if (video && !video.paused) {
            try {
              video.pause();
            } catch {}
          }
        }
      };

      pauseTrackSafely();
      return;
    }

    if (isCameraSuspendedRef.current) {
      if (autoSuspendedForTorchRef.current && isOpenRef.current && !isClosingRef.current) {
        autoSuspendedForTorchRef.current = false;
        isCameraSuspendedRef.current = false;
        setIsCameraSuspended(false);
        setScannerSessionKey(k => k + 1);
      }
      return;
    }

    if (isStartingRef.current) return;

    if (!track || track.readyState === 'ended') {
      if (isOpenRef.current && !isCameraSuspendedRef.current && !isClosingRef.current) {
        setScannerSessionKey(k => k + 1);
      }
      return;
    }

    track.enabled = true;
    const video = document.querySelector('#barcode-camera-view video');
    if (video && video.paused) {
      video.play().catch(() => {});
    }

    resetInactivityTimerRef.current();

    if (isTorchOnRef.current && !isCameraSuspendedRef.current && !isClosingRef.current && isOpenRef.current && activeModeRef.current === 'camera') {
      resumeTorchTimerRef.current = setTimeout(() => {
        resumeTorchTimerRef.current = null;
        if (
          mountedRef.current &&
          !isPausedRef.current &&
          !isCameraSuspendedRef.current &&
          !isClosingRef.current &&
          isOpenRef.current &&
          activeModeRef.current === 'camera' &&
          isTorchOnRef.current
        ) {
          const liveTrack = activeTrackRef.current || getVideoTrack();
          if (liveTrack && liveTrack.readyState === 'live') {
            applyTorch(liveTrack, true);
          }
        }
      }, 120);
    }

    resumeScanTimerRef.current = setTimeout(() => {
      resumeScanTimerRef.current = null;
      if (mountedRef.current && !isPausedRef.current) {
        isInternalPausedRef.current = false;
      }
    }, 450);
  }, [isPaused, getVideoTrack, applyTorch, forceStopHardware]);

  const handleSwitchMode = (mode) => {
    setActiveMode(mode);
    activeModeRef.current = mode;
    resetInactivityTimer();

    if (resumeTorchTimerRef.current) {
      clearTimeout(resumeTorchTimerRef.current);
      resumeTorchTimerRef.current = null;
    }
    if (resumeScanTimerRef.current) {
      clearTimeout(resumeScanTimerRef.current);
      resumeScanTimerRef.current = null;
    }

    const track = activeTrackRef.current || getVideoTrack();
    if (mode === 'search') {
      isInternalPausedRef.current = true;
      if (track) {
        applyTorch(track, false);
      }
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      if (track && !isPausedRef.current && !isCameraSuspendedRef.current) {
        track.enabled = true;
        const video = document.querySelector('#barcode-camera-view video');
        if (video && video.paused) {
          video.play().catch(() => {});
        }
        if (isTorchOnRef.current) {
          applyTorch(track, true);
        }
      }
      resumeScanTimerRef.current = setTimeout(() => {
        resumeScanTimerRef.current = null;
        if (mountedRef.current && !isPausedRef.current && activeModeRef.current === 'camera') {
          isInternalPausedRef.current = false;
        }
      }, 450);
    }
  };

  useEffect(() => {
    if (activeMode !== 'search') return;
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      if (!query) {
        setSearchResults([]);
        setHasSearched(false);
      }
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await catalogService.searchMedicines(query);
        setSearchResults(results || []);
        setHasSearched(true);
      } catch (err) {
        console.error('Error en búsqueda automática:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, activeMode]);

  const handleResumeCamera = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    autoSuspendedForTorchRef.current = false;
    isCameraSuspendedRef.current = false;
    setIsCameraSuspended(false);
    setScannerSessionKey(k => k + 1);
  };

  const resetAll = useCallback((preserveTorchPreference = false) => {
    setActiveMode('camera');
    activeModeRef.current = 'camera';
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setScannerError('');
    setIsFocusing(false);
    if (!preserveTorchPreference) {
      setIsTorchOn(false);
    }
    setTorchNotice('');
    setFocusIndicator({ x: '50%', y: '50%', visible: false });
  }, []);

  useEffect(() => {
    if (!isOpen || !shouldRender || isClosing || isCameraSuspended) {
      activeSessionRef.current += 1;
      isStartingRef.current = false;
      if (!isCameraSuspended) {
        forceStopHardware();
        resetAll(false);
      }
      return;
    }

    const mySessionId = ++activeSessionRef.current;
    let isCancelled = false;
    let html5QrCode = null;
    isStartingRef.current = true;
    autoSuspendedForTorchRef.current = false;
    isInternalPausedRef.current = Boolean(isPausedRef.current);
    resetAll(true);
    setIsStarting(true);

    const configureRunningTrack = async (runningInstance, storedSettings, targetCameraId) => {
      if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) return;

      const videoElem = attachSafeVideoSurface(runningInstance, mySessionId);
      const streamFromInstance = runningInstance?.renderedCamera?.mediaStream || videoElem?.srcObject || null;
      if (streamFromInstance) {
        trackedStreamsRef.current.add(streamFromInstance);
        activeStreamRef.current = streamFromInstance;
      }

      const track = streamFromInstance?.getVideoTracks?.()?.[0] || getVideoTrack();
      if (track) {
        activeTrackRef.current = track;
        track.onended = () => {
          if (mountedRef.current && activeSessionRef.current === mySessionId && !isSwitchingCameraRef.current) {
            isCameraSuspendedRef.current = true;
            setIsCameraSuspended(true);
          }
        };

        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const supportedFocus = Array.isArray(caps.focusMode) ? caps.focusMode : [];
        const hasContinuousFocus = supportedFocus.includes('continuous');

        setCameraCapabilities({
          hasTorch: Boolean(caps.torch),
          hasZoom: Boolean(caps.zoom && caps.zoom.max > caps.zoom.min),
          hasContinuousFocus,
          minZoom: caps.zoom?.min || 1,
          maxZoom: caps.zoom?.max || 4
        });

        if (hasContinuousFocus) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' }]
            });
          } catch {}
        }

        if (isCancelled || activeSessionRef.current !== mySessionId) return;

        setZoomLevel(storedSettings.zoom);
        await applyZoom(track, storedSettings.zoom);

        const wantsTorch = Boolean(storedSettings.torch && caps.torch);
        setIsTorchOn(wantsTorch);
        isTorchOnRef.current = wantsTorch;

        if (wantsTorch && !isPausedRef.current && activeModeRef.current === 'camera') {
          const ok = await applyTorch(track, true);
          if (mountedRef.current && activeSessionRef.current === mySessionId && !isPausedRef.current) {
            setIsTorchOn(ok);
          }
        } else {
          await applyTorch(track, false);
          if (isPausedRef.current) {
            try {
              track.enabled = false;
            } catch {}
            if (videoElem && !videoElem.paused) {
              try {
                videoElem.pause();
              } catch {}
            }
          }
        }
      }

      const freshDevs = await enumerateVideoCameras();
      if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) return;
      if (freshDevs.length > 0) {
        const refreshed = prepareCameraList(freshDevs);
        setAvailableCameras(refreshed);
        const matched = (track?.label && refreshed.find(d => d.label === track.label)) || refreshed.find(d => d.id === targetCameraId) || refreshed[0];
        if (matched) {
          setActiveCameraId(matched.id);
          setCameraLabel(matched.displayName);
        }
      } else if (track?.label && !targetCameraId) {
        setCameraLabel(determineCameraLabel(track.label, 0, []));
      }
    };

    async function startScanner() {
      if (stopPromiseRef.current) {
        await stopPromiseRef.current.catch(() => {});
      } else if (scannerRef.current) {
        await forceStopHardware();
      }

      if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) return;

      let container = document.getElementById('barcode-camera-view');
      if (!container) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        container = document.getElementById('barcode-camera-view');
      }

      if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) return;

      if (!container) {
        console.warn('Contenedor barcode-camera-view no encontrado en el DOM');
        setScannerError('No se pudo inicializar la cámara.');
        setIsStarting(false);
        isStartingRef.current = false;
        return;
      }

      try {
        container.innerHTML = '';
      } catch {}

      const devices = await enumerateVideoCameras();
      if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) return;

      const preparedList = prepareCameraList(devices);
      setAvailableCameras(preparedList);

      const mainCamera = preparedList.find(d => d.cameraType === 'main') || preparedList[0];
      const stored = getStoredCameraSettings();
      const validStoredCamera = stored.cameraId && preparedList.some(d => d.id === stored.cameraId);
      const targetDevice = validStoredCamera
        ? (preparedList.find(d => d.id === stored.cameraId) || mainCamera)
        : mainCamera;

      const targetCameraId = targetDevice?.id;
      setActiveCameraId(targetCameraId || null);
      setCameraLabel(targetDevice?.displayName || '1x Principal');

      const qrConfig = {
        fps: 10
      };

      const onDecodedSuccess = async (decodedText, decodedResult) => {
        if (isCancelled || activeSessionRef.current !== mySessionId) return;
        if (isPausedRef.current || isInternalPausedRef.current) return;
        if (activeModeRef.current !== 'camera') return;
        if (isExcludedOrQrCode(decodedResult)) return;

        const now = Date.now();
        if (now - lastScanTimeRef.current < 1200) return;
        lastScanTimeRef.current = now;

        isInternalPausedRef.current = true;
        if (navigator.vibrate) navigator.vibrate(50);
        const track = getVideoTrack();
        if (track) {
          applyTorch(track, false);
        }
        resetInactivityTimerRef.current();

        if (detectionRecoveryTimerRef.current) {
          clearTimeout(detectionRecoveryTimerRef.current);
        }
        detectionRecoveryTimerRef.current = setTimeout(() => {
          detectionRecoveryTimerRef.current = null;
          if (
            mountedRef.current &&
            activeSessionRef.current === mySessionId &&
            !isPausedRef.current &&
            !isCameraSuspendedRef.current &&
            !isClosingRef.current &&
            isOpenRef.current &&
            activeModeRef.current === 'camera'
          ) {
            isInternalPausedRef.current = false;
            const liveTrack = activeTrackRef.current || getVideoTrack();
            if (liveTrack && liveTrack.readyState === 'live') {
              liveTrack.enabled = true;
              if (isTorchOnRef.current) {
                applyTorch(liveTrack, true);
              }
            }
          }
        }, 900);

        if (onDetectedRef.current) {
          onDetectedRef.current(decodedText);
        }
      };

      const tryStartWithInput = async (input) => {
        const instance = new Html5Qrcode('barcode-camera-view', {
          formatsToSupport: BARCODE_ONLY_FORMATS,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
        html5QrCode = instance;
        scannerRef.current = instance;

        await instance.start(
          input,
          qrConfig,
          onDecodedSuccess,
          () => {}
        );
        return instance;
      };

      try {
        const primaryInput = targetCameraId ? targetCameraId : { facingMode: 'environment' };
        let runningInstance = null;
        try {
          runningInstance = await tryStartWithInput(primaryInput);
        } catch (primaryErr) {
          if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) {
            await forceStopHardware(html5QrCode, html5QrCode?.renderedCamera?.mediaStream);
            return;
          }
          if (targetCameraId) {
            await forceStopHardware(html5QrCode, html5QrCode?.renderedCamera?.mediaStream);
            if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) return;
            runningInstance = await tryStartWithInput({ facingMode: 'environment' });
          } else {
            throw primaryErr;
          }
        }

        const startedStream = runningInstance?.renderedCamera?.mediaStream || document.querySelector('#barcode-camera-view video')?.srcObject || null;
        if (startedStream) {
          trackedStreamsRef.current.add(startedStream);
        }

        if (isCancelled || activeSessionRef.current !== mySessionId || !mountedRef.current) {
          await forceStopHardware(runningInstance, startedStream);
          return;
        }

        isStartingRef.current = false;
        setIsStarting(false);
        resetInactivityTimerRef.current();

        await configureRunningTrack(runningInstance, stored, targetCameraId);
      } catch (err) {
        await forceStopHardware(html5QrCode, html5QrCode?.renderedCamera?.mediaStream);
        if (!isCancelled && activeSessionRef.current === mySessionId && mountedRef.current) {
          isStartingRef.current = false;
          console.error('Error al iniciar la cámara principal:', err);
          setScannerError('No se pudo iniciar la cámara principal. Puedes escribir el código o nombre abajo.');
          setIsStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      isCancelled = true;
      activeSessionRef.current += 1;
      isStartingRef.current = false;
      if (inactivityTimerRef.current && !autoSuspendedForTorchRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (resumeScanTimerRef.current) {
        clearTimeout(resumeScanTimerRef.current);
        resumeScanTimerRef.current = null;
      }
      if (resumeTorchTimerRef.current) {
        clearTimeout(resumeTorchTimerRef.current);
        resumeTorchTimerRef.current = null;
      }
      if (detectionRecoveryTimerRef.current) {
        clearTimeout(detectionRecoveryTimerRef.current);
        detectionRecoveryTimerRef.current = null;
      }
      forceStopHardware();
    };
  }, [isOpen, shouldRender, isClosing, scannerSessionKey, isCameraSuspended, forceStopHardware, resetAll, enumerateVideoCameras, attachSafeVideoSurface, getVideoTrack, applyZoom, applyTorch]);

  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        activeSessionRef.current += 1;
        forceStopHardware();
        if (onCloseRef.current) onCloseRef.current();
      }
    };

    const handlePageHide = () => {
      activeSessionRef.current += 1;
      forceStopHardware();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [isOpen, forceStopHardware]);

  const handleSwitchCamera = async () => {
    if (isSwitchingCameraRef.current || isStarting || availableCameras.length <= 1) return;
    isSwitchingCameraRef.current = true;
    const mySessionId = ++activeSessionRef.current;

    try {
      resetInactivityTimer();
      setIsStarting(true);
      isStartingRef.current = true;

      const currentIndex = availableCameras.findIndex(d => d.id === activeCameraId);
      const nextIndex = (currentIndex >= 0 ? currentIndex + 1 : 0) % availableCameras.length;
      const nextDevice = availableCameras[nextIndex];
      if (!nextDevice) {
        setIsStarting(false);
        isStartingRef.current = false;
        isSwitchingCameraRef.current = false;
        return;
      }

      await forceStopHardware();
      if (!mountedRef.current || activeSessionRef.current !== mySessionId || isClosing) {
        return;
      }

      setActiveCameraId(nextDevice.id);
      setCameraLabel(nextDevice.displayName || nextDevice.label);

      const current = getStoredCameraSettings();
      saveCameraSettings({ ...current, cameraId: nextDevice.id });

      const instance = new Html5Qrcode('barcode-camera-view', {
        formatsToSupport: BARCODE_ONLY_FORMATS,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      scannerRef.current = instance;

      await instance.start(
        nextDevice.id,
        {
          fps: 10
        },
        async (decodedText, decodedResult) => {
          if (activeSessionRef.current !== mySessionId) return;
          if (isPausedRef.current || isInternalPausedRef.current) return;
          if (activeModeRef.current !== 'camera') return;
          if (isExcludedOrQrCode(decodedResult)) return;

          const now = Date.now();
          if (now - lastScanTimeRef.current < 1200) return;
          lastScanTimeRef.current = now;

          isInternalPausedRef.current = true;
          if (navigator.vibrate) navigator.vibrate(50);
          const currentTrack = getVideoTrack();
          if (currentTrack) {
            applyTorch(currentTrack, false);
          }
          resetInactivityTimerRef.current();

          if (detectionRecoveryTimerRef.current) {
            clearTimeout(detectionRecoveryTimerRef.current);
          }
          detectionRecoveryTimerRef.current = setTimeout(() => {
            detectionRecoveryTimerRef.current = null;
            if (
              mountedRef.current &&
              activeSessionRef.current === mySessionId &&
              !isPausedRef.current &&
              !isCameraSuspendedRef.current &&
              !isClosingRef.current &&
              isOpenRef.current &&
              activeModeRef.current === 'camera'
            ) {
              isInternalPausedRef.current = false;
              const liveTrack = activeTrackRef.current || getVideoTrack();
              if (liveTrack && liveTrack.readyState === 'live') {
                liveTrack.enabled = true;
                if (isTorchOnRef.current) {
                  applyTorch(liveTrack, true);
                }
              }
            }
          }, 900);

          if (onDetectedRef.current) {
            onDetectedRef.current(decodedText);
          }
        },
        () => {}
      );

      const switchedStream = instance?.renderedCamera?.mediaStream || document.querySelector('#barcode-camera-view video')?.srcObject || null;
      if (switchedStream) trackedStreamsRef.current.add(switchedStream);

      if (!mountedRef.current || activeSessionRef.current !== mySessionId || isClosing) {
        await forceStopHardware(instance, switchedStream);
        return;
      }

      isStartingRef.current = false;
      setIsStarting(false);
      resetInactivityTimer();

      const videoElem = attachSafeVideoSurface(instance, mySessionId);
      const activeStream = switchedStream || videoElem?.srcObject || null;
      if (activeStream) {
        activeStreamRef.current = activeStream;
      }
      const newTrack = activeStream?.getVideoTracks?.()?.[0] || getVideoTrack();
      if (newTrack) {
        activeTrackRef.current = newTrack;
        newTrack.onended = () => {
          if (mountedRef.current && activeSessionRef.current === mySessionId && !isSwitchingCameraRef.current) {
            setIsCameraSuspended(true);
          }
        };
        const caps = newTrack.getCapabilities ? newTrack.getCapabilities() : {};
        const supportedFocus = Array.isArray(caps.focusMode) ? caps.focusMode : [];
        const hasContinuousFocus = supportedFocus.includes('continuous');

        setCameraCapabilities({
          hasTorch: Boolean(caps.torch),
          hasZoom: Boolean(caps.zoom && caps.zoom.max > caps.zoom.min),
          hasContinuousFocus,
          minZoom: caps.zoom?.min || 1,
          maxZoom: caps.zoom?.max || 4
        });
        if (hasContinuousFocus) {
          newTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        applyZoom(newTrack, zoomLevel);

        const currentSettings = getStoredCameraSettings();
        const wantsTorch = Boolean(currentSettings.torch && caps.torch);
        setIsTorchOn(wantsTorch);
        isTorchOnRef.current = wantsTorch;
        if (wantsTorch && !isPausedRef.current && activeModeRef.current === 'camera') {
          const ok = await applyTorch(newTrack, true);
          if (mountedRef.current && activeSessionRef.current === mySessionId && !isPausedRef.current) {
            setIsTorchOn(ok);
          }
        } else {
          await applyTorch(newTrack, false);
          if (isPausedRef.current) {
            try {
              newTrack.enabled = false;
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('Error alternando cámara:', e);
      isStartingRef.current = false;
      setIsStarting(false);
      if (mountedRef.current && activeSessionRef.current === mySessionId && !isClosing) {
        setScannerSessionKey(k => k + 1);
      }
    } finally {
      isSwitchingCameraRef.current = false;
      isStartingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  };

  const handleSelectZoom = (level) => {
    resetInactivityTimer();
    setZoomLevel(level);
    const track = getVideoTrack();
    applyZoom(track, level);

    const current = getStoredCameraSettings();
    saveCameraSettings({ ...current, zoom: level });

    if (zoomFeedbackTimeoutRef.current) {
      clearTimeout(zoomFeedbackTimeoutRef.current);
    }
    setZoomFeedback({ visible: true, level });
    zoomFeedbackTimeoutRef.current = setTimeout(() => {
      setZoomFeedback(prev => ({ ...prev, visible: false }));
    }, 900);
  };

  const handleToggleTorch = async () => {
    resetInactivityTimer();
    if (isPausedRef.current || isCameraSuspendedRef.current || activeModeRef.current !== 'camera') return;
    const track = activeTrackRef.current || getVideoTrack();
    let supportsTorch = Boolean(cameraCapabilities.hasTorch);
    if (track?.getCapabilities) {
      try {
        supportsTorch = Boolean(track.getCapabilities()?.torch);
      } catch {}
    }

    if (!track || !supportsTorch) {
      setIsTorchOn(false);
      setTorchNotice('Flash no disponible en esta cámara');
      if (torchNoticeTimerRef.current) clearTimeout(torchNoticeTimerRef.current);
      torchNoticeTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setTorchNotice('');
      }, 2200);
      return;
    }

    const nextState = !isTorchOn;
    const applied = await applyTorch(track, nextState);
    if (applied || !nextState) {
      setIsTorchOn(nextState);
      saveCameraSettings({ torch: nextState });
    }
  };

  const handleTriggerFocus = () => {
    resetInactivityTimer();
    setIsFocusing(true);
    setFocusIndicator({ x: '50%', y: '50%', visible: true });

    const track = getVideoTrack();
    triggerFocus(track, 0.5, 0.5);

    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      if (mountedRef.current) {
        setIsFocusing(false);
        setFocusIndicator(prev => ({ ...prev, visible: false }));
      }
    }, 700);
  };

  const handleCameraTap = (e) => {
    if (isCameraSuspended) {
      handleResumeCamera(e);
      return;
    }
    resetInactivityTimer();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xRatio = Math.max(0, Math.min(1, x / rect.width));
    const yRatio = Math.max(0, Math.min(1, y / rect.height));

    setIsFocusing(true);
    setFocusIndicator({ x, y, visible: true });

    const track = getVideoTrack();
    triggerFocus(track, xRatio, yRatio);

    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      if (mountedRef.current) {
        setIsFocusing(false);
        setFocusIndicator(prev => ({ ...prev, visible: false }));
      }
    }, 700);
  };

  const handleClose = () => {
    activeSessionRef.current += 1;
    isStartingRef.current = false;
    autoSuspendedForTorchRef.current = false;
    isCameraSuspendedRef.current = false;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (resumeScanTimerRef.current) {
      clearTimeout(resumeScanTimerRef.current);
      resumeScanTimerRef.current = null;
    }
    if (resumeTorchTimerRef.current) {
      clearTimeout(resumeTorchTimerRef.current);
      resumeTorchTimerRef.current = null;
    }
    if (detectionRecoveryTimerRef.current) {
      clearTimeout(detectionRecoveryTimerRef.current);
      detectionRecoveryTimerRef.current = null;
    }
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (zoomFeedbackTimeoutRef.current) {
      clearTimeout(zoomFeedbackTimeoutRef.current);
      zoomFeedbackTimeoutRef.current = null;
    }
    if (torchNoticeTimerRef.current) {
      clearTimeout(torchNoticeTimerRef.current);
      torchNoticeTimerRef.current = null;
    }
    setIsCameraSuspended(false);
    forceStopHardware();
    animateClose();
  };

  const handleSelectItem = (item) => {
    resetInactivityTimer();
    isInternalPausedRef.current = true;
    const track = activeTrackRef.current || getVideoTrack();
    if (track) {
      applyTorch(track, false);
    }
    setActiveMode('camera');
    activeModeRef.current = 'camera';
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    if (detectionRecoveryTimerRef.current) {
      clearTimeout(detectionRecoveryTimerRef.current);
    }
    detectionRecoveryTimerRef.current = setTimeout(() => {
      detectionRecoveryTimerRef.current = null;
      if (
        mountedRef.current &&
        !isPausedRef.current &&
        !isCameraSuspendedRef.current &&
        !isClosingRef.current &&
        isOpenRef.current &&
        activeModeRef.current === 'camera'
      ) {
        isInternalPausedRef.current = false;
        const liveTrack = activeTrackRef.current || getVideoTrack();
        if (liveTrack && liveTrack.readyState === 'live') {
          liveTrack.enabled = true;
          if (isTorchOnRef.current) {
            applyTorch(liveTrack, true);
          }
        }
      }
    }, 900);
    if (onDetectedRef.current) {
      onDetectedRef.current(item.codigo, item);
    }
  };

  const handleExecuteSearch = async (e) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const exactItem = await catalogService.findByBarcode(query);
      if (exactItem) {
        handleSelectItem(exactItem);
        return;
      }

      const results = await catalogService.searchMedicines(query);
      setSearchResults(results || []);
    } catch (err) {
      console.error('Error buscando producto en scanner modal:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  if (!shouldRender) return null;

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, handleClose)}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        onPointerDown={resetInactivityTimer}
        className={`bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100/80 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] my-auto overscroll-contain ${cardClass}`}
      >
        
        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between border-b border-slate-100 bg-white shrink-0 relative min-h-[58px]">
          <div className="relative flex-1 flex items-center min-w-0 mr-3">
            <div
              className={`flex items-center gap-2.5 transition-all duration-300 ease-out ${
                activeMode === 'camera'
                  ? 'opacity-100 translate-x-0 pointer-events-auto'
                  : 'opacity-0 -translate-x-3 pointer-events-none absolute inset-y-0 left-0'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ScanBarcode className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 leading-tight">Escanear Código</h3>
                <p className="text-[11px] text-slate-500 leading-tight">Apunta el código de barras con la cámara</p>
              </div>
            </div>

            <div
              className={`flex items-center gap-2 transition-all duration-300 ease-out ${
                activeMode === 'search'
                  ? 'opacity-100 translate-x-0 pointer-events-auto'
                  : 'opacity-0 translate-x-3 pointer-events-none absolute inset-y-0 left-0'
              }`}
            >
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSwitchMode('camera')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 text-xs font-bold transition-all cursor-pointer border border-blue-200/60 shadow-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Regresar a cámara</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex-1 min-h-[350px] sm:min-h-[380px] max-h-[75vh] overflow-hidden bg-slate-50/50 flex flex-col">
          <div
            className={`absolute inset-0 w-full h-full flex flex-col transition-all duration-300 ease-out ${
              activeMode === 'camera'
                ? 'opacity-100 scale-100 pointer-events-auto z-10'
                : 'opacity-0 scale-[0.98] pointer-events-none z-0'
            }`}
          >
            <div
              onClick={activeMode === 'camera' ? handleCameraTap : undefined}
              className="relative bg-black flex-1 min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden cursor-crosshair"
              title={activeMode === 'camera' ? 'Toca en la cámara para re-enfocar' : undefined}
            >
              <div id="barcode-camera-view" className="w-full flex-1 self-stretch min-h-[260px] sm:min-h-[300px] object-cover"></div>

              {!isStarting && !scannerError && !isCameraSuspended && activeMode === 'camera' && (
                <div className="absolute inset-x-12 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-center">
                  <div className="w-full h-[2px] bg-red-500/85 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse rounded-full" />
                </div>
              )}

              {focusIndicator.visible && activeMode === 'camera' && (
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-30 transition-all duration-300 animate-in zoom-in-75"
                  style={{ left: focusIndicator.x, top: focusIndicator.y }}
                >
                  <div className="w-14 h-14 border-2 border-amber-400 rounded-xl shadow-lg flex items-center justify-center">
                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping"></div>
                  </div>
                </div>
              )}

              {!isStarting && !scannerError && !isCameraSuspended && activeMode === 'camera' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-auto transition-all"
                >
                  <button
                    type="button"
                    onClick={handleTriggerFocus}
                    className="px-3 py-1.5 text-xs bg-black/75 hover:bg-black/90 active:scale-95 text-white rounded-full font-semibold flex items-center gap-1.5 shadow-md transition-all cursor-pointer border border-white/20"
                    title="Re-enfocar la cámara"
                  >
                    <Focus className={`w-3.5 h-3.5 ${isFocusing ? 'text-amber-400 animate-spin' : 'text-white'}`} />
                    <span>{isFocusing ? 'Enfocando...' : 'Enfocar'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {availableCameras.length > 1 && (
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        className="px-2.5 py-1.5 text-xs bg-black/75 hover:bg-black/90 active:scale-95 text-white rounded-full font-semibold flex items-center gap-1 shadow-md transition-all cursor-pointer border border-white/20"
                        title={`Cambiar lente (actual: ${cameraLabel})`}
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-bold text-white/90">
                          {cameraLabel}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleTorch}
                      className={`px-3 py-1.5 text-xs active:scale-95 rounded-full font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer border ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-400/30'
                          : 'bg-black/75 hover:bg-black/90 text-white border-white/20'
                      }`}
                      title={isTorchOn ? 'Apagar flash' : 'Encender flash'}
                    >
                      {isTorchOn ? (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>Flash ON</span>
                        </>
                      ) : (
                        <>
                          <ZapOff className="w-3.5 h-3.5 text-white/70" />
                          <span>Flash</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {torchNotice && !isStarting && !scannerError && !isCameraSuspended && activeMode === 'camera' && (
                <div className="absolute top-14 inset-x-0 z-30 flex justify-center pointer-events-none animate-fade-in">
                  <div className="px-3 py-1.5 rounded-full bg-slate-950/90 border border-white/20 text-white text-[11px] font-semibold shadow-lg">
                    {torchNotice}
                  </div>
                </div>
              )}

              {zoomFeedback.visible && !isCameraSuspended && activeMode === 'camera' && (
                <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center transition-all duration-300">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-24 h-24 rounded-full border-2 border-blue-400/80 animate-ping pointer-events-none" />
                    <div className="absolute w-32 h-32 rounded-full border border-blue-400/30 animate-pulse pointer-events-none" />
                    <div className="relative px-3.5 py-1.5 rounded-2xl bg-slate-950/90 border border-white/25 text-white font-mono text-sm font-bold flex items-center gap-1.5 shadow-2xl scale-110 animate-in zoom-in-75 duration-200">
                      <ZoomIn className="w-4 h-4 text-blue-400" />
                      <span>Zoom {zoomFeedback.level}x</span>
                    </div>
                  </div>
                </div>
              )}

              {!isStarting && !scannerError && !isCameraSuspended && activeMode === 'camera' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-2.5 inset-x-2.5 z-20 flex items-center justify-center pointer-events-auto"
                >
                  <div className="bg-black/80 border border-white/20 p-1 rounded-2xl flex items-center gap-1 shadow-lg">
                    <div className="pl-2 pr-1 text-[10px] font-bold text-white/70 uppercase tracking-wider flex items-center gap-1">
                      <ZoomIn className="w-3 h-3 text-white/80" />
                      <span>Zoom:</span>
                    </div>
                    {[1, 1.5, 2, 2.5, 3].map((level) => {
                      const isActive = Math.abs(zoomLevel - level) < 0.05;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => handleSelectZoom(level)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-sm scale-105 ring-2 ring-blue-400/40'
                              : 'text-white/80 hover:bg-white/20 active:scale-95'
                          }`}
                          title={`Zoom ${level}x`}
                        >
                          {level}x
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isCameraSuspended && activeMode === 'camera' && (
                <div
                  onClick={handleResumeCamera}
                  className="absolute inset-0 z-30 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all animate-in fade-in duration-200"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mb-2.5 shadow-lg hover:scale-105 active:scale-95 transition-transform">
                    <Camera className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">Cámara en pausa</p>
                  <p className="text-xs text-slate-300 max-w-[240px] mb-3 leading-relaxed">
                    Cámara y flash apagados tras 1 min sin uso para ahorrar batería.
                  </p>
                  <button
                    type="button"
                    onClick={handleResumeCamera}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Tocar para reactivar</span>
                  </button>
                </div>
              )}

              {isStarting && !scannerError && !isCameraSuspended && activeMode === 'camera' && (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Iniciando cámara...</span>
                </div>
              )}

              {scannerError && activeMode === 'camera' && (
                <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center text-white gap-2">
                  <AlertCircle className="w-8 h-8 text-amber-400" />
                  <p className="text-xs text-slate-300 max-w-xs">{scannerError}</p>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleSwitchMode('search')}
                className="w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] border border-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-between shadow-xs transition-all cursor-pointer group"
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Search className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="text-slate-700 font-medium truncate">Buscar por código o nombre de producto...</span>
                </span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200/60 shrink-0">
                  Escribir
                </span>
              </button>
            </div>
          </div>

          <div
            className={`absolute inset-0 w-full h-full flex flex-col p-3.5 sm:p-4 bg-slate-50/70 overflow-hidden transition-all duration-300 ease-out ${
              activeMode === 'search'
                ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto z-10'
                : 'opacity-0 translate-y-3 scale-[0.98] pointer-events-none z-0'
            }`}
          >
            <form onSubmit={handleExecuteSearch} className="flex gap-2 items-center shrink-0 mb-3">
              <div className="flex-1">
                <MarqueeSearchInput
                  inputRef={searchInputRef}
                  label="Buscar por código o nombre del producto"
                  placeholder="Escribe código o descripción..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (hasSearched) setHasSearched(false);
                    resetInactivityTimer();
                  }}
                  onFocus={resetInactivityTimer}
                  icon={Search}
                  onClear={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setHasSearched(false);
                    resetInactivityTimer();
                  }}
                  loading={isSearching}
                />
              </div>
              <button
                type="submit"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                disabled={isSearching}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:bg-slate-300 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Buscar</span>
                )}
              </button>
            </form>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y pr-0.5">
              {searchResults.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200/80 bg-white rounded-2xl shadow-xs overflow-hidden">
                  {searchResults.map((med) => (
                    <div
                      key={med.codigo}
                      onPointerDown={(e) => e.preventDefault()}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectItem(med)}
                      className="p-3 text-xs hover:bg-blue-50 active:bg-blue-100 cursor-pointer text-slate-800 flex justify-between items-center transition-colors gap-2"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <MarqueeText
                          text={med.descripcion}
                          className="font-semibold text-slate-900 text-xs"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                        {med.codigo}
                      </span>
                    </div>
                  ))}
                </div>
              ) : hasSearched && !isSearching ? (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-center text-xs text-amber-900 space-y-2 animate-in fade-in duration-200">
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <p className="font-semibold">
                    No se encontraron productos con &quot;{searchQuery.trim()}&quot;
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed max-w-xs mx-auto">
                    Comunícate al departamento de Sistemas para recibir una actualización de catálogo.
                  </p>
                </div>
              ) : (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mb-3">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-700 mb-1">
                    Búsqueda de medicamentos y material
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                    Escribe el nombre comercial, sustancia activa o código numérico y pulsa "Buscar".
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
