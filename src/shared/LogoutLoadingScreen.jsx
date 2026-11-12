/**
 * Pantalla de carga visual mostrada durante el cierre de sesión seguro del usuario.
 */

import React from 'react';
import { LogOut } from 'lucide-react';

export function LogoutLoadingScreen({ user }) {
  const displayName = user?.username ? `@${user.username}` : user?.nombre || '';

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-dvh bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 animate-fade-in select-none transition-colors"
    >
      <div className="w-full max-w-xs flex flex-col items-center gap-5 animate-scale-in">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-sky-500 to-teal-600 text-white flex items-center justify-center shadow-xl shadow-sky-500/25 overflow-hidden">
            <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full p-2.5">
              <path d="M224 128H288V224H384V288H288V384H224V288H128V224H224V128Z" fill="white" />
            </svg>
          </div>
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-red-500 dark:text-red-400">
            <LogOut className="w-3 h-3" />
          </span>
        </div>

        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            ERP Control
          </h1>

          <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="w-3.5 h-3.5 border-2 border-sky-600 dark:border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>Cerrando sesión...</span>
          </div>

          {displayName && (
            <p className="text-[11px] font-medium font-mono text-slate-400 dark:text-slate-500 truncate max-w-[240px]">
              {displayName}
            </p>
          )}
        </div>

        <div className="w-44 h-1.5 bg-slate-300/60 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500 animate-logout-progress" />
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-8">
        Desconectando de forma segura
      </p>
    </div>
  );
}
