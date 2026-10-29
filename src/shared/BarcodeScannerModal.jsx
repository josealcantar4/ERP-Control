import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
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
  SwitchCamera
} from 'lucide-react';
import { catalogService } from '../modules/catalogo';
import { useBodyScrollLock, useModalAnimation } from '../hooks';
import { AutoScrollInput } from './AutoScrollInput';
import { MarqueeText } from './MarqueeText';

const STORAGE_KEY = 'erp_scanner_camera_settings';

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

// Helper: Detecta si una cámara es ultra gran angular (0.5x), macro o auxiliar
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

// Helper: Detecta si una cámara es frontal / selfie
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

// Helper: Detecta si una cámara es explícitamente el sensor principal (1x)
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

// Analiza los dispositivos disponibles y selecciona el lente principal (1x) descartando 0.5x
function findBestMainCamera(devices) {
  if (!devices || devices.length === 0) return { selectedId: null, backCameras: [] };

  const backCameras = devices.filter(d => !isFrontCamera(d.label));
  if (backCameras.length === 0) {
    return { selectedId: devices[0].id, backCameras: devices };
  }
  if (backCameras.length === 1) {
    return { selectedId: backCameras[0].id, backCameras };
  }

  // 1. Buscar coincidencia explícita de lente principal
  const explicit = backCameras.find(d => isPrimaryMainCamera(d.label));
  if (explicit) {
    return { selectedId: explicit.id, backCameras };
  }

  // 2. Descartar cualquier lente 0.5x / ultra wide / macro
  const nonAux = backCameras.filter(d => !isUltraWideOrAux(d.label));
  if (nonAux.length > 0) {
    return { selectedId: nonAux[0].id, backCameras };
  }

  // 3. Fallback: descartar estrictamente ultra y 0.5
  const nonUltra = backCameras.filter(d => {
    const l = (d.label || '').toLowerCase();
    return !l.includes('0.5') && !l.includes('0,5') && !l.includes('ultra');
  });
  if (nonUltra.length > 0) {
    return { selectedId: nonUltra[0].id, backCameras };
  }

  return { selectedId: backCameras[0].id, backCameras };
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
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleViewportChange = () => {
      if (window.visualViewport) {
        // En móviles, si la altura del visualViewport es menor que window.innerHeight - 150px
        const diff = window.innerHeight - window.visualViewport.height;
        setIsKeyboardOpen(diff > 150);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      }
    };
  }, []);

  const isKeyboardActive = isKeyboardOpen || isInputFocused;
  const [scannerError, setScannerError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef(null);
  const activeStreamRef = useRef(null);
  const activeTrackRef = useRef(null);

  // Estados de control de cámara (Lente, Flash, Zoom y Enfoque)
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

  const resetAll = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setScannerError('');
    setIsFocusing(false);
    setIsTorchOn(false);
    setFocusIndicator({ x: '50%', y: '50%', visible: false });
  };

  // Obtener el track de video activo desde referencia en memoria o DOM
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

  // Blindaje absoluto: Forzar apagado físico de flash y liberación inmediata de hardware
  const forceStopHardware = async () => {
    setIsTorchOn(false);

    // 1. Apagar linterna físicamente en el track activo en memoria
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

    // 2. Apagar linterna en cualquier elemento <video> en el DOM
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

    // 3. Detener físicamente (stop) TODOS los tracks del stream activo
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

    // 4. Detener físicamente el track de video
    if (activeTrackRef.current) {
      try {
        activeTrackRef.current.stop();
      } catch (_) {}
      activeTrackRef.current = null;
    }

    // 5. Desvincular y detener streams de elementos video en el DOM
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

    // 6. Detener el motor Html5Qrcode si sigue activo
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

  // Aplicar Zoom (Hardware o Fallback CSS Digital)
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
      if (hwApplied) {
        videoElem.style.transform = 'none';
      } else {
        videoElem.style.transform = val > 1 ? `scale(${val})` : 'none';
        videoElem.style.transformOrigin = 'center center';
        videoElem.style.transition = 'transform 0.2s ease-out';
      }
    }
  };

  // Aplicar Linterna / Flash
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

  // Re-enfocar la cámara (Intenta medición focal por hardware y regresa a continuous)
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

  // Efecto principal para inicializar el escáner y restaurar ajustes guardados
  useEffect(() => {
    if (!isOpen || !shouldRender || isClosing) {
      forceStopHardware();
      resetAll();
      return;
    }

    resetAll();
    setIsStarting(true);
    let isCancelled = false;
    let html5QrCode = null;
    let pollInterval = null;

    async function startScanner() {
      // 1. Limpiar cualquier instancia previa o residuo antes de inicializar
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch (_) {}
        scannerRef.current = null;
      }

      // 2. Asegurar que el contenedor del visor exista en el DOM
      let container = document.getElementById('barcode-camera-view');
      if (!container) {
        // Breve espera de un frame para garantizar que React haya pintado el DOM
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

      // Limpiar nodos hijos huérfanos del contenedor
      try {
        container.innerHTML = '';
      } catch (_) {}

      try {
        html5QrCode = new Html5Qrcode('barcode-camera-view');
        scannerRef.current = html5QrCode;
      } catch (_e) {
        if (!isCancelled) {
          console.error('Error al instanciar Html5Qrcode:', _e);
          setScannerError('No se pudo inicializar la cámara.');
          setIsStarting(false);
        }
        return;
      }

      // Obtener cámaras con permisos otorgados para leer etiquetas reales de hardware
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

      // Seleccionar SIEMPRE el lente principal (1x), descartando explícitamente el 0.5x
      const { selectedId, backCameras } = findBestMainCamera(devices);
      setAvailableCameras(backCameras);

      const stored = getStoredCameraSettings();
      // Validar que la cámara guardada no sea 0.5x ni auxiliar
      const validStoredCamera = stored.cameraId && backCameras.some(d => d.id === stored.cameraId && !isUltraWideOrAux(d.label));
      const targetCameraId = validStoredCamera ? stored.cameraId : selectedId;

      setActiveCameraId(targetCameraId);
      const chosenDev = backCameras.find(d => d.id === targetCameraId);
      const labelText = chosenDev?.label || '1x Principal';
      setCameraLabel(labelText.includes('0.5') ? '0.5x' : '1x Principal');

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
          async (decodedText) => {
            if (isCancelled) return;
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

        // Polling para detectar el track de video en cuanto el elemento DOM enlace el stream
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

            const caps = track.getCapabilities ? track.getCapabilities() : {};

            setCameraCapabilities({
              hasTorch: Boolean(caps.torch),
              hasZoom: Boolean(caps.zoom),
              minZoom: caps.zoom?.min || 1,
              maxZoom: caps.zoom?.max || 4
            });

            // 1. Activar enfoque continuo por hardware
            try {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
            } catch (_) {}

            // 2. Restaurar zoom
            setZoomLevel(stored.zoom);
            await applyZoom(track, stored.zoom);

            // 3. Restaurar linterna si el usuario la dejó encendida
            if (stored.torch && caps.torch) {
              setIsTorchOn(true);
              await applyTorch(track, true);
            } else {
              setIsTorchOn(false);
            }
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
      forceStopHardware();
      resetAll();
    };
  }, [isOpen, shouldRender, isClosing, onDetected]);

  // Blindaje ante cambio de pestaña, bloqueo de teléfono o salida de la aplicación
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

  // Manejar cambio manual de cámara / lente
  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1 || !scannerRef.current) return;
    const currentIndex = availableCameras.findIndex(d => d.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextDevice = availableCameras[nextIndex];
    if (!nextDevice) return;

    try {
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
      const labelText = nextDevice.label || `Lente ${nextIndex + 1}`;
      setCameraLabel(labelText.includes('0.5') ? '0.5x' : '1x Principal');

      const current = getStoredCameraSettings();
      saveCameraSettings({ ...current, cameraId: nextDevice.id });

      await scannerRef.current.start(
        nextDevice.id,
        { fps: 20, qrbox: { width: 280, height: 140 }, aspectRatio: 1.333333 },
        async (decodedText) => {
          if (navigator.vibrate) navigator.vibrate(50);
          await forceStopHardware();
          resetAll();
          onDetected(decodedText);
        },
        () => {}
      );

      setIsStarting(false);

      setTimeout(async () => {
        const track = getVideoTrack();
        if (track) {
          activeTrackRef.current = track;
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

  // Manejar cambio de zoom y persistir
  const handleSelectZoom = (level) => {
    setZoomLevel(level);
    const track = getVideoTrack();
    applyZoom(track, level);

    const current = getStoredCameraSettings();
    saveCameraSettings({ ...current, zoom: level });
  };

  // Manejar alternancia de flash y persistir preferencia del usuario
  const handleToggleTorch = async () => {
    const nextState = !isTorchOn;
    setIsTorchOn(nextState);

    const track = activeTrackRef.current || getVideoTrack();
    await applyTorch(track, nextState);

    saveCameraSettings({ torch: nextState });
  };

  // Manejar botón de enfoque
  const handleTriggerFocus = () => {
    setIsFocusing(true);
    setFocusIndicator({ x: '50%', y: '50%', visible: true });

    const track = getVideoTrack();
    triggerFocus(track, 0.5, 0.5);

    setTimeout(() => {
      setIsFocusing(false);
      setFocusIndicator(prev => ({ ...prev, visible: false }));
    }, 700);
  };

  // Manejar toque en la pantalla de la cámara para enfocar en un punto específico
  const handleCameraTap = (e) => {
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
        className={`bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100/80 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] my-auto overscroll-contain ${cardClass}`}
      >
        
        {/* ENCABEZADO */}
        <div className={`px-4 sm:px-5 ${isKeyboardActive ? 'py-2.5' : 'py-3.5'} flex items-center justify-between border-b border-slate-100 bg-white shrink-0 transition-all`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">Escanear o Buscar</h3>
              {!isKeyboardActive && (
                <p className="text-[11px] text-slate-500 leading-tight">Apunta el código o escribe nombre/código</p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CUERPO DEL MODAL (CÁMARA + BÚSQUEDA) */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          
          {/* VISTA DE CÁMARA CON CONTROLES INTEGRADOS */}
          <div
            onClick={handleCameraTap}
            className={`relative bg-black flex items-center justify-center overflow-hidden shrink-0 cursor-crosshair transition-all duration-300 ${
              isKeyboardActive
                ? 'h-24 sm:min-h-[220px] sm:max-h-[270px]'
                : 'min-h-[190px] max-h-[250px] sm:min-h-[220px] sm:max-h-[270px]'
            }`}
            title="Toca en la cámara para re-enfocar"
          >
            <div id="barcode-camera-view" className="w-full h-full object-cover"></div>

            {/* RETÍCULA DE ENFOQUE ANIMADA AL TOCAR */}
            {focusIndicator.visible && (
              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-30 transition-all duration-300 animate-in zoom-in-75"
                style={{ left: focusIndicator.x, top: focusIndicator.y }}
              >
                <div className="w-14 h-14 border-2 border-amber-400 rounded-xl shadow-lg flex items-center justify-center">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping"></div>
                </div>
              </div>
            )}

            {/* CONTROLES SUPERIORES FLOTANTES (ENFOCAR, FLASH Y LENTE) */}
            {!isStarting && !scannerError && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute ${isKeyboardActive ? 'top-1.5 left-2 right-2' : 'top-2.5 left-2.5 right-2.5'} z-20 flex items-center justify-between pointer-events-auto transition-all`}
              >
                {/* Botón de Enfoque */}
                <button
                  type="button"
                  onClick={handleTriggerFocus}
                  className={`${isKeyboardActive ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} bg-black/60 hover:bg-black/80 active:scale-95 backdrop-blur-md text-white rounded-full font-semibold flex items-center gap-1.5 shadow-md transition-all cursor-pointer border border-white/20`}
                  title="Re-enfocar la cámara"
                >
                  <Focus className={`w-3.5 h-3.5 ${isFocusing ? 'text-amber-400 animate-spin' : 'text-white'}`} />
                  <span>{isFocusing ? 'Enfocando...' : 'Enfocar'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  {/* Selector / Alternador de Lente (si hay más de 1 cámara trasera) */}
                  {availableCameras.length > 1 && (
                    <button
                      type="button"
                      onClick={handleSwitchCamera}
                      className={`${isKeyboardActive ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} bg-black/60 hover:bg-black/80 active:scale-95 backdrop-blur-md text-white rounded-full font-semibold flex items-center gap-1 shadow-md transition-all cursor-pointer border border-white/20`}
                      title={`Cambiar lente (actual: ${cameraLabel})`}
                    >
                      <SwitchCamera className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-bold text-white/90">
                        {cameraLabel}
                      </span>
                    </button>
                  )}

                  {/* Botón de Flash / Linterna */}
                  <button
                    type="button"
                    onClick={handleToggleTorch}
                    className={`${isKeyboardActive ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} active:scale-95 backdrop-blur-md rounded-full font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer border ${
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

            {/* CONTROLES INFERIORES FLOTANTES (SELECTOR DE ZOOM) */}
            {!isStarting && !scannerError && !isKeyboardActive && (
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
                        className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm scale-105'
                            : 'text-white/80 hover:bg-white/20'
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

            {isStarting && !scannerError && (
              <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2">
                <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Iniciando cámara...</span>
              </div>
            )}

            {scannerError && (
              <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center text-white gap-2">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p className="text-xs text-slate-300 max-w-xs">{scannerError}</p>
              </div>
            )}
          </div>

          {/* SECCIÓN DE BÚSQUEDA MANUAL (POR CÓDIGO O NOMBRE) */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-100 space-y-2.5 sm:space-y-3 shrink-0">
            <label className="block text-xs font-semibold text-slate-700 leading-none">
              Buscar por código o nombre del producto:
            </label>

            <form onSubmit={handleExecuteSearch} className="flex gap-2">
              <div className="flex-1">
                <AutoScrollInput
                  type="text"
                  placeholder="Escribe el código o descripción del producto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  icon={Search}
                  onClear={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setHasSearched(false);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans shadow-xs"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Buscar</span>
                )}
              </button>
            </form>

            {/* LISTA DE RESULTADOS */}
            {searchResults.length > 0 && (
              <div className="max-h-36 sm:max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 bg-white rounded-2xl shadow-sm">
                {searchResults.map((med) => (
                  <div
                    key={med.codigo}
                    onClick={() => handleSelectItem(med)}
                    className="p-2.5 sm:p-3 text-xs hover:bg-blue-50 cursor-pointer text-slate-800 flex justify-between items-center transition-colors gap-2"
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
            )}

            {/* AVISO DE NO ENCONTRADO CON OPCIÓN DE REGISTRAR */}
            {hasSearched && searchResults.length === 0 && !isSearching && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-center text-xs text-amber-900 space-y-1.5">
                <p className="font-semibold">No se encontraron productos</p>
                <p className="text-[11px] text-amber-700">
                  ¿Deseas agregar "{searchQuery}" como producto nuevo?
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectNewCode(searchQuery)}
                  className="mt-1 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                >
                  Registrar con este código
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
