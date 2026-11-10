/**
 * Modal con información institucional de la aplicación: creador, desarrollador actual, versión y fechas de compilación y catálogo.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Code2,
  Building2,
  Cpu,
  Server,
  BadgeCheck,
  FileBadge,
  Phone,
  CalendarClock,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { useModalAnimation } from '../hooks';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

function formatDateTime(isoString) {
  if (!isoString) return 'Sin registro';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Sin registro';
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return String(isoString);
  }
}

export function AboutModal({ isOpen, onClose }) {
  const isProduction =
    import.meta.env.MODE === 'production' ||
    import.meta.env.VITE_APP_ENV === 'production' ||
    import.meta.env.VITE_FIREBASE_PROJECT_ID === 'erpcontrolprod';

  const appVersion = isProduction ? 'v1.0.0' : 'Alpha v1.0.0';
  const appStatus = isProduction ? 'Estable' : 'En desarrollo';
  const currentDeveloper = import.meta.env.VITE_APP_DEVELOPER || 'José Antonio Alcantar Flores';

  const appBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : null;

  const [catalogLastModified, setCatalogLastModified] = useState(() => {
    return localStorage.getItem('erp_catalog_last_modified') || null;
  });

  useEffect(() => {
    if (!isOpen) return;

    const local = localStorage.getItem('erp_catalog_last_modified');
    if (local) {
      setCatalogLastModified(local);
    }

    getDoc(doc(db, 'catalogo_meta', 'version')).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.lastModified) {
          setCatalogLastModified(data.lastModified);
        }
      }
    }).catch(() => {});
  }, [isOpen]);

  const {
    shouldRender,
    cardRef,
    handleClose,
    handleBackdropClick,
    backdropClass,
    cardClass,
    cardStyle
  } = useModalAnimation({
    isOpen,
    onClose
  });

  if (!shouldRender) return null;

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, handleClose)}
      className={`fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 dark:bg-black/80 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden my-auto overscroll-contain max-h-[calc(100dvh-2rem)] flex flex-col ${cardClass}`}
      >
        <div className="p-4 sm:p-5 pb-3 sm:pb-4 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full p-2">
                <path d="M224 128H288V224H384V288H288V384H224V288H128V224H224V128Z" fill="white" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                  ERP Control
                </h3>
                {!isProduction && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase tracking-wider">
                    Alpha
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sistema Integral de Gestión Farmacéutica
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 pt-3 sm:pt-4 flex-1 overflow-y-auto space-y-2.5 text-xs overscroll-contain">
          <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <BadgeCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Creador
                </span>
                <p className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm truncate">
                  José Antonio Alcantar Flores
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <FileBadge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Cédula: <strong className="font-mono text-slate-800 dark:text-slate-200">15558123</strong></span>
              </div>
              <a
                href="tel:+524435344012"
                className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-mono">+52 443 534 4012</span>
              </a>
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Code2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Desarrollador
              </span>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm truncate">
                {currentDeveloper}
              </p>
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Uso Legal
              </span>
              <p className="font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                Uso legal para Farmacéutica Dimás Velazquez
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Versión
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  {appVersion}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <span className={`w-2 h-2 rounded-full ${isProduction ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Estado
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  {appStatus}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                <CalendarClock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Última Compilación / Publicación
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                    {isProduction ? 'Producción' : 'Desarrollo'}
                  </span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs mt-0.5 font-mono">
                  {formatDateTime(appBuildTime)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Catálogo Google Drive (Última Edición)
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase">
                    Excel
                  </span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs mt-0.5 font-mono">
                  {formatDateTime(catalogLastModified)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Cpu className="w-3.5 h-3.5 text-slate-400" /> Plataforma
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">PWA Offline-First</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                <Server className="w-3.5 h-3.5 text-slate-400" /> Servidor de Datos
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">Firebase Firestore</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
