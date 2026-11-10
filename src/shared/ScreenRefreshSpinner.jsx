/**
 * Indicador visual de carga y refresco de pantalla durante la actualización de datos locales.
 */

import React from 'react';
import { createPortal } from 'react-dom';

export function ScreenRefreshSpinner({ isRefreshing }) {
  if (!isRefreshing) return null;

  const content = (
    <div
      className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none transition-all duration-300 animate-slide-down select-none"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white dark:bg-slate-800 px-3.5 py-1.5 rounded-full shadow-2xl border border-slate-200/90 dark:border-slate-700 flex items-center gap-2 ring-1 ring-black/5">
        <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
        <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Actualizando...</span>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
