import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, CheckCircle, X } from 'lucide-react';

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registrado:', r);
    },
    onRegisterError(error) {
      console.error('Error al registrar SW:', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-slate-900 border border-slate-700 text-white p-4 shadow-2xl flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {offlineReady ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <RefreshCw className="w-5 h-5 text-blue-400 shrink-0 animate-spin" />
          )}
          <span className="text-sm font-medium">
            {offlineReady
              ? 'Aplicación lista para funcionar sin conexión (Offline).'
              : 'Nueva actualización del sistema disponible.'}
          </span>
        </div>
        <button
          onClick={close}
          className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          title="Cerrar notificación"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {needRefresh && (
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={() => updateServiceWorker(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-colors"
          >
            Actualizar ahora
          </button>
        </div>
      )}
    </div>
  );
}
