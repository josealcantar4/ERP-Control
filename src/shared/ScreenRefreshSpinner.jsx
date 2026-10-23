import React from 'react';

/**
 * ScreenRefreshSpinner
 * 
 * Indicador de actualización flotante y discreto al estilo iOS.
 * Cumple con el requisito estricto: "solo el spinner pero sin opacar al fondo".
 * No genera capas oscuras ni bloquea clics gracias a pointer-events-none.
 */
export function ScreenRefreshSpinner({ isRefreshing }) {
  if (!isRefreshing) return null;

  return (
    <div
      className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 animate-slide-down select-none"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg border border-slate-200/90 flex items-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
        <span className="text-[11px] font-semibold text-slate-600 tracking-tight">Actualizando...</span>
      </div>
    </div>
  );
}
