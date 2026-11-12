/**
 * Indicador visual que alerta al usuario cuando el dispositivo no tiene conexión a internet y opera en modo offline.
 */

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, X, Clock } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePendingSync } from '../hooks/usePendingSync';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const { pendingSyncCount, justSynced } = usePendingSync(1800);
  const [showRestored, setShowRestored] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    let dismissTimer = null;
    let hideTimer = null;

    if (!isOnline || pendingSyncCount > 0) {
      setShowRestored(false);
      setIsDismissing(false);
    } else if (wasOffline || justSynced) {
      setShowRestored(true);
      setIsDismissing(false);

      dismissTimer = setTimeout(() => {
        setIsDismissing(true);
      }, 9400);

      hideTimer = setTimeout(() => {
        setShowRestored(false);
        setIsDismissing(false);
      }, 10000);
    }

    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [isOnline, wasOffline, pendingSyncCount, justSynced]);

  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-300 animate-slide-down select-none">
        <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
        <span>
          Modo Offline: Sin conexión a internet. Los cambios se guardan localmente
          {pendingSyncCount > 0
            ? ` • ${pendingSyncCount} ${pendingSyncCount === 1 ? 'operación en cola' : 'operaciones en cola'}`
            : ' y se sincronizarán al reconectar.'}
        </span>
      </div>
    );
  }

  if (pendingSyncCount > 0) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-300 animate-slide-down select-none">
        <Clock className="w-4 h-4 shrink-0 animate-pulse" />
        <span>
          {pendingSyncCount === 1
            ? '1 operación en cola de envío. Se enviará automáticamente al tener conexión con el servidor.'
            : `${pendingSyncCount} operaciones en cola de envío. Se enviarán automáticamente al tener conexión con el servidor.`}
        </span>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div
        className={`bg-emerald-600 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-600 select-none ${
          isDismissing
            ? 'opacity-0 -translate-y-full max-h-0 py-0 overflow-hidden'
            : 'opacity-100 translate-y-0 animate-slide-down'
        }`}
      >
        <Wifi className="w-4 h-4 shrink-0" />
        <span>
          {wasOffline
            ? 'Conexión restablecida. Sincronización en la nube activa.'
            : 'Operaciones en cola sincronizadas con el servidor.'}
        </span>
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
