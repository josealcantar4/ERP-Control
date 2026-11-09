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
import { useBodyScrollLock, useModalAnimation } from '../hooks';
import { AutoScrollInput } from './AutoScrollInput';
import { MarqueeText } from './MarqueeText';
import { MarqueeSearchInput } from './MarqueeSearchInput';

const STORAGE_KEY = 'erp_scanner_camera_settings';

const BARCODE_ONLY_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.RSS_14,
  Html5QrcodeSupportedFormats.RSS_EXPANDED,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION
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

function isUltraWideOrAux(label = '') {
  const l = label.toLowerCase();
  return (
    l.includes('0.5') ||
    l.includes('0,5') ||
    l.includes('0.6') ||
    l.includes('ultra') ||
    l.includes('ultrawide') ||
    l.includes('wide-angle') ||
    l.includes('gran angular') ||
    l.includes('macro') ||
    l.includes('depth') ||
    l.includes('tele') ||
    l.includes('virtual')
  );
}

function isFrontCamera(label = '') {
  const l = label.toLowerCase();
  return (
    l.includes('front') ||
    l.includes('frontal') ||
    l.includes('selfie') ||
    l.includes('delantera') ||
    l.includes('user')
  );
}

function isPrimaryMainCamera(label = '') {
  const l = label.toLowerCase();
  if (isUltraWideOrAux(l) || isFrontCamera(l)) return false;
  return (
    l.includes('main') ||
    l.includes('principal') ||
    l.includes('primary') ||
    l.includes('1x') ||
    l.includes('1.0') ||
    l.includes('camera 0') ||
    l.includes('camera2 0') ||
    l.includes('back 0') ||
    l.includes('back camera 0') ||
    l.includes('rear 0') ||
    l === 'back camera' ||
    l === 'cámara trasera'
  );
}

function findBestMainCamera(devices) {
  if (!devices || devices.length === 0) return { selectedId: null, backCameras: [] };

  const backCameras = devices.filter(d => !isFrontCamera(d.label));
  if (backCameras.length === 0) {
    return { selectedId: devices[0].id, backCameras: devices };
  }
  if (backCameras.length === 1) {
    return { selectedId: backCameras[0].id, backCameras };
  }

  let selectedId = null;
  const explicit = backCameras.find(d => isPrimaryMainCamera(d.label));
  if (explicit) {
    selectedId = explicit.id;
  } else {
    const nonAux = backCameras.filter(d => !isUltraWideOrAux(d.label));
    if (nonAux.length > 0) {
      selectedId = nonAux[0].id;
    } else {
      const nonUltra = backCameras.filter(d => {
        const l = (d.label || '').toLowerCase();
        return !l.includes('0.5') && !l.includes('0,5') && !l.includes('ultra');
      });
      selectedId = nonUltra.length > 0 ? nonUltra[0].id : backCameras[0].id;
    }
  }

  const sortedBackCameras = [...backCameras].sort((a, b) => {
    if (a.id === selectedId) return -1;
    if (b.id === selectedId) return 1;
    return 0;
  });

  return { selectedId, backCameras: sortedBackCameras };
}

function determineCameraLabel(deviceOrLabel, index = 0, allCameras = []) {
  const rawLabel = typeof deviceOrLabel === 'string'
    ? deviceOrLabel
    : (deviceOrLabel?.label || '');
  const l = rawLabel.toLowerCase();

  if (
    l.includes('0.5') ||
    l.includes('0,5') ||
    l.includes('0.6') ||
    l.includes('0,6') ||
    l.includes('ultra') ||
    l.includes('gran angular') ||
    l.includes('wide-angle') ||
    l.includes('ultrawide')
  ) {
    return '0.5x Ultra';
  }

  if (
    l.includes('tele') ||
    l.includes('telephoto') ||
    l.includes('telefoto') ||
    l.includes('periscope') ||
    l.includes('periscopio')
  ) {
    if (l.includes('3x')) return '3x Tele';
    if (l.includes('2x')) return '2x Tele';
    if (l.includes('5x')) return '5x Tele';
    return 'Telefoto';
  }

  if (l.includes('macro') || l.includes('cercano')) {
    return 'Macro';
  }

  if (l.includes('front') || l.includes('frontal') || l.includes('selfie') || l.includes('delantera')) {
    return 'Frontal';
  }

  if (
    l.includes('main') ||
    l.includes('principal') ||
    l.includes('primary') ||
    l.includes('1x') ||
    l.includes('1.0') ||
    l.includes('camera 0') ||
    l.includes('camera2 0') ||
    l.includes('back 0') ||
    l.includes('rear 0') ||
    l === 'back camera' ||
    l === 'cámara trasera'
  ) {
    return '1x Principal';
  }

  if (l.includes('camera2 2') || l.includes('camera 2') || l.includes('back 2') || l.includes('rear 2')) {
    return '0.5x Ultra';
  }

  if (l.includes('camera2 3') || l.includes('camera 3') || l.includes('back 3') || l.includes('rear 3')) {
    return 'Telefoto';
  }

  if (allCameras.length > 1) {
    const pos = typeof index === 'number' && index >= 0
      ? index
      : (deviceOrLabel?.id ? allCameras.findIndex(d => d.id === deviceOrLabel.id) : 0);
    if (pos === 0) return '1x Principal';
    if (pos === 1) return '0.5x Ultra';
    if (pos === 2) return 'Telefoto';
    return `Lente ${pos + 1}`;
  }

  return '1x Principal';
}

export function BarcodeScannerModal({ isOpen, onClose, onDetected }) {
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
  const searchInputRef = useRef(null);
  const [scannerError, setScannerError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [isCameraSuspended, setIsCameraSuspended] = useState(false);
  const [scannerSessionKey, setScannerSessionKey] = useState(0);
  const [zoomFeedback, setZoomFeedback] = useState({ visible: false, level: 1.5 });
  const zoomFeedbackTimeoutRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const scannerRef = useRef(null);
  const activeStreamRef = useRef(null);
  const activeTrackRef = useRef(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [cameraLabel, setCameraLabel] = useState('1x Principal');
  const [isTorchOn, setIsTorchOn] = useState(() => getStoredCameraSettings().torch);
  const [zoomLevel, setZoomLevel] = useState(() => getStoredCameraSettings().zoom);
  const [isFocusing, setIsFocusing] = useState(false);
  const [focusIndicator, setFocusIndicator] = useState({ x: '50%', y: '50%', visible: false });
  const [cameraCapabilities, setCameraCapabilities] = useState({
    hasTorch: false,
    hasZoom: false,
    minZoom: 1,
    maxZoom: 4
  });

  const handleSwitchMode = (mode) => {
    setActiveMode(mode);
    activeModeRef.current = mode;
    resetInactivityTimer();

    const track = activeTrackRef.current || getVideoTrack();
    if (mode === 'search') {
      if (isTorchOn && track) {
        applyTorch(track, false);
      }
      if (track) {
        track.enabled = false;
      }
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      if (track) {
        track.enabled = true;
      }
      if (isTorchOn && track) {
        applyTorch(track, true);
      }
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

  const suspendCameraDueInactivity = useCallback(async () => {
    setIsCameraSuspended(true);
    setIsTorchOn(false);
    const track = activeTrackRef.current;
    if (track) {
      try {
        if (track.applyConstraints) await track.applyConstraints({ advanced: [{ torch: false }] });
      } catch (_) {}
      try { track.stop(); } catch (_) {}
      activeTrackRef.current = null;
    }
    if (activeStreamRef.current) {
      try {
        activeStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      } catch (_) {}
      activeStreamRef.current = null;
    }
    const videoElem = document.querySelector('#barcode-camera-view video');
    if (videoElem) {
      videoElem.srcObject = null;
      videoElem.src = '';
    }
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (_) {}
      scannerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (isOpen && !isCameraSuspended && !isClosing) {
      inactivityTimerRef.current = setTimeout(() => {
        suspendCameraDueInactivity();
      }, 60000);
    }
  }, [isOpen, isCameraSuspended, isClosing, suspendCameraDueInactivity]);

  const handleResumeCamera = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setIsCameraSuspended(false);
    setScannerSessionKey(k => k + 1);
  };

  const resetAll = () => {
    setActiveMode('camera');
    activeModeRef.current = 'camera';
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setScannerError('');
    setIsFocusing(false);
    setIsTorchOn(false);
    setFocusIndicator({ x: '50%', y: '50%', visible: false });
  };
  const getVideoTrack = () => {
    if (activeTrackRef.current && activeTrackRef.current.readyState === 'live') {
      return activeTrackRef.current;
    }
    const videoElem = document.querySelector('#barcode-camera-view video');
    if (videoElem && videoElem.srcObject) {
      const tracks = videoElem.srcObject.getVideoTracks();
      if (tracks && tracks.length > 0) {
        activeTrackRef.current = tracks[0];
        activeStreamRef.current = videoElem.srcObject;
        return tracks[0];
      }
    }
    return null;
  };

  const forceStopHardware = async () => {
    setIsTorchOn(false);

    const track = activeTrackRef.current;
    if (track) {
      try {
        if (track.applyConstraints) {
          await track.applyConstraints({ advanced: [{ torch: false }] });
        }
      } catch (_) {
        try {
          await track.applyConstraints({ torch: false });
        } catch (_) {}
      }
    }
    try {
      const videoElem = document.querySelector('#barcode-camera-view video');
      if (videoElem && videoElem.srcObject) {
        const domTracks = videoElem.srcObject.getVideoTracks();
        for (const t of domTracks) {
          try {
            if (t.applyConstraints) {
              await t.applyConstraints({ advanced: [{ torch: false }] });
            }
          } catch (_) {
            try {
              await t.applyConstraints({ torch: false });
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    if (activeStreamRef.current) {
      try {
        const tracks = activeStreamRef.current.getTracks();
        tracks.forEach(t => {
          try {
            t.stop();
          } catch (_) {}
        });
      } catch (_) {}
      activeStreamRef.current = null;
    }

    if (activeTrackRef.current) {
      try {
        activeTrackRef.current.stop();
      } catch (_) {}
      activeTrackRef.current = null;
    }

    try {
      const videoElem = document.querySelector('#barcode-camera-view video');
      if (videoElem) {
        if (videoElem.srcObject) {
          try {
            const stream = videoElem.srcObject;
            if (stream && stream.getTracks) {
              stream.getTracks().forEach(t => {
                try {
                  t.stop();
                } catch (_) {}
              });
            }
          } catch (_) {}
          videoElem.srcObject = null;
        }
        videoElem.src = '';
      }
    } catch (_) {}

    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (_) {}
      scannerRef.current = null;
    }
  };

  const applyZoom = async (track, val) => {
    const videoElem = document.querySelector('#barcode-camera-view video');
    let hwApplied = false;

    if (track && track.applyConstraints) {
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps && caps.zoom) {
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
  };
  const applyTorch = async (track, enabled) => {
    if (!track) return false;
    let ok = false;
    if (track.applyConstraints) {
      try {
        await track.applyConstraints({ advanced: [{ torch: Boolean(enabled) }] });
        ok = true;
      } catch (_) {
        try {
          await track.applyConstraints({ torch: Boolean(enabled) });
          ok = true;
        } catch (_) {}
      }
    }
    if (scannerRef.current && scannerRef.current.applyVideoConstraints) {
      try {
        await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: Boolean(enabled) }] });
        ok = true;
      } catch (_) {}
    }
    return ok;
  };

  const triggerFocus = async (track, xRatio = 0.5, yRatio = 0.5) => {
    if (!track || !track.applyConstraints) return;
    try {
      await track.applyConstraints({
        advanced: [
          {
            focusMode: 'single-shot',
            pointsOfInterest: [{ x: xRatio, y: yRatio }]
          }
        ]
      });
      setTimeout(async () => {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
        } catch (_) {}
      }, 300);
    } catch (_) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }]
        });
      } catch (_) {}
    }
  };

  useEffect(() => {
    if (!isOpen || !shouldRender || isClosing || isCameraSuspended) {
      if (!isCameraSuspended) {
        forceStopHardware();
        resetAll();
      }
      return;
    }

    resetAll();
    setIsStarting(true);
    let isCancelled = false;
    let html5QrCode = null;
    let pollInterval = null;

    async function startScanner() {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch (_) {}
        scannerRef.current = null;
      }

      let container = document.getElementById('barcode-camera-view');
      if (!container) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        container = document.getElementById('barcode-camera-view');
      }

      if (!container) {
        if (!isCancelled) {
          console.warn('Contenedor barcode-camera-view no encontrado en el DOM');
          setScannerError('No se pudo inicializar la cámara.');
          setIsStarting(false);
        }
        return;
      }
      try {
        container.innerHTML = '';
      } catch (_) {}

      try {
        html5QrCode = new Html5Qrcode('barcode-camera-view', {
          formatsToSupport: BARCODE_ONLY_FORMATS,
          verbose: false
        });
        scannerRef.current = html5QrCode;
      } catch (_e) {
        if (!isCancelled) {
          console.error('Error al instanciar Html5Qrcode:', _e);
          setScannerError('No se pudo inicializar la cámara.');
          setIsStarting(false);
        }
        return;
      }
      let devices = [];
      try {
        devices = await Html5Qrcode.getCameras();
        if (devices.length > 0 && !devices[0].label) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } }
            });
            stream.getTracks().forEach(t => t.stop());
            devices = await Html5Qrcode.getCameras();
          } catch (_) {}
        }
      } catch (err) {
        console.warn('Error al enumerar dispositivos de video:', err);
      }

      if (isCancelled) return;
      const { selectedId, backCameras } = findBestMainCamera(devices);
      setAvailableCameras(backCameras);

      const stored = getStoredCameraSettings();
      const validStoredCamera = stored.cameraId && backCameras.some(d => d.id === stored.cameraId && !isUltraWideOrAux(d.label));
      const targetCameraId = validStoredCamera ? stored.cameraId : selectedId;

      setActiveCameraId(targetCameraId);
      const chosenIndex = backCameras.findIndex(d => d.id === targetCameraId);
      const chosenDev = backCameras[chosenIndex >= 0 ? chosenIndex : 0];
      const initialLabel = determineCameraLabel(chosenDev, chosenIndex, backCameras);
      setCameraLabel(initialLabel);

      const qrConfig = {
        fps: 20,
        qrbox: { width: 280, height: 140 },
        aspectRatio: 1.333333
      };

      const cameraInput = targetCameraId ? targetCameraId : { facingMode: 'environment' };

      try {
        await html5QrCode.start(
          cameraInput,
          qrConfig,
          async (decodedText, decodedResult) => {
            if (isCancelled) return;
            if (activeModeRef.current !== 'camera') return;
            if (isExcludedOrQrCode(decodedResult)) return;
            isCancelled = true;
            if (navigator.vibrate) navigator.vibrate(50);
            await forceStopHardware();
            resetAll();
            onDetected(decodedText);
          },
          () => {}
        );

        if (isCancelled) {
          await forceStopHardware();
          return;
        }

        setIsStarting(false);
        resetInactivityTimer();

        let attempts = 0;
        pollInterval = setInterval(async () => {
          if (isCancelled) {
            clearInterval(pollInterval);
            return;
          }
          const track = getVideoTrack();
          if (track) {
            clearInterval(pollInterval);
            activeTrackRef.current = track;
            const videoElem = document.querySelector('#barcode-camera-view video');
            if (videoElem && videoElem.srcObject) {
              activeStreamRef.current = videoElem.srcObject;
            }

            if (track.label) {
              const detectedLabel = determineCameraLabel(track.label, chosenIndex, backCameras);
              setCameraLabel(detectedLabel);
            }

            const caps = track.getCapabilities ? track.getCapabilities() : {};

            setCameraCapabilities({
              hasTorch: Boolean(caps.torch),
              hasZoom: Boolean(caps.zoom),
              minZoom: caps.zoom?.min || 1,
              maxZoom: caps.zoom?.max || 4
            });

            try {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
            } catch (_) {}

            setZoomLevel(stored.zoom);
            await applyZoom(track, stored.zoom);

            if (stored.torch && caps.torch) {
              setIsTorchOn(true);
              await applyTorch(track, true);
            } else {
              setIsTorchOn(false);
            }

            resetInactivityTimer();
          } else if (++attempts > 30) {
            clearInterval(pollInterval);
          }
        }, 80);

      } catch (err) {
        if (!isCancelled) {
          console.error('Error al iniciar la cámara principal:', err);
          setScannerError('No se pudo iniciar la cámara principal. Puedes escribir el código o nombre abajo.');
          setIsStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      isCancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      forceStopHardware();
      resetAll();
    };
  }, [isOpen, shouldRender, isClosing, scannerSessionKey, isCameraSuspended, onDetected, resetInactivityTimer]);

  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        forceStopHardware();
        onClose();
      }
    };

    const handlePageHide = () => {
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
  }, [isOpen, onClose]);

  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1 || !scannerRef.current) return;
    const currentIndex = availableCameras.findIndex(d => d.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextDevice = availableCameras[nextIndex];
    if (!nextDevice) return;

    try {
      resetInactivityTimer();
      setIsStarting(true);
      if (activeTrackRef.current) {
        await applyTorch(activeTrackRef.current, false);
        try { activeTrackRef.current.stop(); } catch (_) {}
        activeTrackRef.current = null;
      }
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      setActiveCameraId(nextDevice.id);
      const nextLabel = determineCameraLabel(nextDevice, nextIndex, availableCameras);
      setCameraLabel(nextLabel);

      const current = getStoredCameraSettings();
      saveCameraSettings({ ...current, cameraId: nextDevice.id });

      await scannerRef.current.start(
        nextDevice.id,
        { fps: 20, qrbox: { width: 280, height: 140 }, aspectRatio: 1.333333 },
        async (decodedText, decodedResult) => {
          if (activeModeRef.current !== 'camera') return;
          if (isExcludedOrQrCode(decodedResult)) return;
          if (navigator.vibrate) navigator.vibrate(50);
          await forceStopHardware();
          resetAll();
          onDetected(decodedText);
        },
        () => {}
      );

      setIsStarting(false);
      resetInactivityTimer();

      setTimeout(async () => {
        const track = getVideoTrack();
        if (track) {
          activeTrackRef.current = track;
          if (track.label) {
            setCameraLabel(determineCameraLabel(track.label, nextIndex, availableCameras));
          }
          const videoElem = document.querySelector('#barcode-camera-view video');
          if (videoElem && videoElem.srcObject) {
            activeStreamRef.current = videoElem.srcObject;
          }
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          setCameraCapabilities({
            hasTorch: Boolean(caps.torch),
            hasZoom: Boolean(caps.zoom),
            minZoom: caps.zoom?.min || 1,
            maxZoom: caps.zoom?.max || 4
          });
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
          applyZoom(track, zoomLevel);

          const currentSettings = getStoredCameraSettings();
          if (currentSettings.torch && caps.torch) {
            setIsTorchOn(true);
            await applyTorch(track, true);
          } else {
            setIsTorchOn(false);
          }
        }
      }, 150);
    } catch (e) {
      console.warn('Error alternando cámara:', e);
      setIsStarting(false);
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
    const nextState = !isTorchOn;
    setIsTorchOn(nextState);

    const track = activeTrackRef.current || getVideoTrack();
    await applyTorch(track, nextState);

    saveCameraSettings({ torch: nextState });
  };

  const handleTriggerFocus = () => {
    resetInactivityTimer();
    setIsFocusing(true);
    setFocusIndicator({ x: '50%', y: '50%', visible: true });

    const track = getVideoTrack();
    triggerFocus(track, 0.5, 0.5);

    setTimeout(() => {
      setIsFocusing(false);
      setFocusIndicator(prev => ({ ...prev, visible: false }));
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

    setTimeout(() => {
      setIsFocusing(false);
      setFocusIndicator(prev => ({ ...prev, visible: false }));
    }, 700);
  };

  const handleClose = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (zoomFeedbackTimeoutRef.current) {
      clearTimeout(zoomFeedbackTimeoutRef.current);
      zoomFeedbackTimeoutRef.current = null;
    }
    setIsCameraSuspended(false);
    forceStopHardware();
    animateClose();
    setTimeout(() => {
      resetAll();
    }, 200);
  };

  const handleSelectItem = (item) => {
    forceStopHardware();
    animateClose();
    onDetected(item.codigo, item);
    setTimeout(() => {
      resetAll();
    }, 200);
  };

  const handleSelectNewCode = (code) => {
    const clean = String(code || '').trim();
    forceStopHardware();
    animateClose();
    onDetected(clean);
    setTimeout(() => {
      resetAll();
    }, 200);
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
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md select-none overflow-y-auto overscroll-contain ${backdropClass}`}
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
                <p className="text-[11px] text-slate-500 leading-tight truncate">Apunta el código de barras con la cámara</p>
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
              <div id="barcode-camera-view" className="w-full h-full object-cover"></div>

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
                    className="px-3 py-1.5 text-xs bg-black/60 hover:bg-black/80 active:scale-95 backdrop-blur-md text-white rounded-full font-semibold flex items-center gap-1.5 shadow-md transition-all cursor-pointer border border-white/20"
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
                        className="px-2.5 py-1.5 text-xs bg-black/60 hover:bg-black/80 active:scale-95 backdrop-blur-md text-white rounded-full font-semibold flex items-center gap-1 shadow-md transition-all cursor-pointer border border-white/20"
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
                      className={`px-3 py-1.5 text-xs active:scale-95 backdrop-blur-md rounded-full font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer border ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-amber-400/30'
                          : 'bg-black/60 hover:bg-black/80 text-white border-white/20'
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

              {zoomFeedback.visible && !isCameraSuspended && activeMode === 'camera' && (
                <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center transition-all duration-300">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-24 h-24 rounded-full border-2 border-blue-400/80 animate-ping pointer-events-none" />
                    <div className="absolute w-32 h-32 rounded-full border border-blue-400/30 animate-pulse pointer-events-none" />
                    <div className="relative px-3.5 py-1.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/25 text-white font-mono text-sm font-bold flex items-center gap-1.5 shadow-2xl scale-110 animate-in zoom-in-75 duration-200">
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
                  <div className="bg-black/65 backdrop-blur-md border border-white/20 p-1 rounded-2xl flex items-center gap-1 shadow-lg">
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
                  className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all animate-in fade-in duration-200"
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
                  <p className="font-semibold">No se encontraron productos con "{searchQuery}"</p>
                  <p className="text-[11px] text-amber-700">
                    ¿Deseas agregar este código como producto nuevo?
                  </p>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectNewCode(searchQuery)}
                    className="mt-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold cursor-pointer shadow-sm transition-all"
                  >
                    Registrar con este código
                  </button>
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
