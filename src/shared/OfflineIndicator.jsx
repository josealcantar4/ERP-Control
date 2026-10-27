import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [showRestored, setShowRestored] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    let dismissTimer = null;
    let hideTimer = null;

    if (!isOnline) {
      // Si se pierde la conexión, resetear el estado del banner verde
      setShowRestored(false);
      setIsDismissing(false);
    } else if (wasOffline) {
      // Conexión recuperada: mostrar banner verde
      setShowRestored(true);
      setIsDismissing(false);

      // Iniciar animación de salida a los 9.4 segundos
      dismissTimer = setTimeout(() => {
        setIsDismissing(true);
      }, 9400);

      // Desmontar completamente a los 10 segundos exactos
      hideTimer = setTimeout(() => {
        setShowRestored(false);
        setIsDismissing(false);
      }, 10000);
    }

    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [isOnline, wasOffline]);

  // 1. BANNER OFFLINE (Permanente mientras no haya internet)
  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-300 animate-slide-down select-none vt-offline">
        <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
        <span>
          Modo Offline: Sin conexión a internet. Los cambios se guardan localmente en tu dispositivo y se sincronizarán al reconectar.
        </span>
      </div>
    );
  }

  // 2. BANNER DE CONEXIÓN RESTABLECIDA (Desaparece tras 10 segundos con animación)
  if (showRestored) {
    return (
      <div
        className={`bg-emerald-600 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-600 select-none vt-offline ${
          isDismissing
            ? 'opacity-0 -translate-y-full max-h-0 py-0 overflow-hidden'
            : 'opacity-100 translate-y-0 animate-slide-down'
        }`}
      >
        <Wifi className="w-4 h-4 shrink-0" />
        <span>Conexión restablecida. Sincronización en la nube activa.</span>
        <button
          onClick={() => setShowRestored(false)}
          className="ml-2 w-5 h-5 rounded-full hover:bg-emerald-700/80 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          title="Ocultar"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return null;
}
