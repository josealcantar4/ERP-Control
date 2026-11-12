/**
 * Modal interactivo que muestra el progreso en tiempo real de la sincronización del catálogo central con almacenamiento local.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, CheckCircle2, AlertTriangle, Layers, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useModalAnimation } from '../../hooks';
import { parseErrorDisplay } from '../../shared/errorUtils';

export function CatalogSyncModal({
  isOpen,
  status,
  progress,
  error,
  onRetry,
  onDismiss
}) {
  const [expandedDetailKey, setExpandedDetailKey] = React.useState(null);
  const detailKey = `${isOpen ? '1' : '0'}:${status}:${typeof error === 'string' ? error : error?.message || ''}`;
  const showDetails = expandedDetailKey === detailKey;

  const { shouldRender, cardRef, handleClose, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose: onDismiss
  });

  if (!shouldRender) return null;

  const isDone = status === 'done';
  const isError = status === 'error';
  const percent = progress?.percent || 0;
  const parsedError = isError && error ? parseErrorDisplay(error) : null;

  const modalContent = (
    <div className={`fixed inset-0 z-[9999] bg-slate-900/70 dark:bg-black/80 flex items-center justify-center p-3 sm:p-6 select-none overflow-y-auto overscroll-contain ${backdropClass}`}>
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-100 dark:border-slate-800 text-center space-y-5 my-auto ${cardClass}`}
      >
        
        <div>
          {isDone ? (
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-transparent text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30 mx-auto flex items-center justify-center shadow-sm shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
          ) : isError ? (
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-transparent text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/30 mx-auto flex items-center justify-center shadow-sm shrink-0">
              <AlertTriangle className="w-7 h-7" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white mx-auto flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isDone
              ? 'Catálogo Sincronizado'
              : isError
              ? 'Servidor Central No Disponible'
              : 'Sincronizando Catálogo Central'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
            {isDone
              ? 'La base de datos de productos está completamente actualizada y lista para trabajar.'
              : isError
              ? 'No pudimos conectar con el Servidor Central. Puedes reintentar o seguir trabajando con tu base de datos local.'
              : 'Optimizando el índice de productos en este dispositivo para consultas instantáneas y modo offline.'}
          </p>
          {isError && parsedError && parsedError.technicalDetails && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  setExpandedDetailKey((prev) => (prev === detailKey ? null : detailKey))
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <span>{showDetails ? 'Ocultar detalles' : 'Ver detalles'}</span>
                {showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {showDetails && (
                <div className="mt-2 p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-left text-[11px] font-mono text-slate-600 dark:text-slate-300 break-words max-h-32 overflow-y-auto select-text">
                  {parsedError.technicalDetails}
                </div>
              )}
            </div>
          )}
        </div>

        {!isDone && !isError && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug break-words flex-1 min-w-0">
                {progress?.message || 'Procesando...'}
              </p>
              <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 shrink-0 tabular-nums">
                {percent}%
              </span>
            </div>

            <div className="w-full bg-slate-200/80 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${percent}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-0.5">
              {progress?.totalBatches > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold bg-blue-100/80 dark:bg-transparent text-blue-800 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1 rounded-lg shrink-0">
                  <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Lote {progress.currentBatch} de {progress.totalBatches}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  Sincronizando información...
                </span>
              )}

              {progress?.totalRecords > 0 && (
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 ml-auto shrink-0">
                  <strong className="text-slate-700 dark:text-slate-200 font-semibold">{progress.totalRecords.toLocaleString()}</strong> registros
                </span>
              )}
            </div>
          </div>
        )}

        {isDone && (
          <div className="p-4 bg-emerald-50 dark:bg-transparent rounded-2xl border border-emerald-100 dark:border-slate-800 text-xs text-emerald-800 dark:text-emerald-400 space-y-1">
            <div className="font-bold flex items-center justify-center gap-1.5">
              <span>{progress?.totalRecords?.toLocaleString()} productos indexados</span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Disponibles para escaneo de códigos de barra y búsquedas rápidas.</p>
          </div>
        )}

        <div className="pt-1">
          {isDone && (
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {isError && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onRetry}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar Sincronización</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-2xl transition-all cursor-pointer"
              >
                Continuar con versión local
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
