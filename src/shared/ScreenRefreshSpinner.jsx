import React from 'react';
import { createPortal } from 'react-dom';

/**
 * ScreenRefreshSpinner
 * 
 * Indicador de actualización flotante y discreto al estilo iOS.
 * Cumple con el requisito estricto: "solo el spinner pero sin opacar al fondo".
 * Se renderiza mediante portal en document.body con z-[99999] para mantenerse
 * permanentemente encima de todos los elementos sin interferir en los clics.
 */
export function ScreenRefreshSpinner({ isRefreshing }) {
  if (!isRefreshing) return null;

  const content = (
    <div
      className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none transition-all duration-300 animate-slide-down select-none"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-2xl border border-slate-200/90 flex items-center gap-2 ring-1 ring-black/5">
        <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
        <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Actualizando...</span>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
