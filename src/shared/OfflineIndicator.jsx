import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();

  if (isOnline && !wasOffline) {
    return null;
  }

  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-300">
        <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
        <span>
          Modo Offline: Sin conexión a internet. Los productos escaneados se guardan en tu dispositivo y se sincronizarán al reconectar.
        </span>
      </div>
    );
  }

  return (
    <div className="bg-emerald-600 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-300">
      <Wifi className="w-4 h-4 shrink-0" />
      <span>Conexión restablecida. Sincronización en la nube activa.</span>
    </div>
  );
}
