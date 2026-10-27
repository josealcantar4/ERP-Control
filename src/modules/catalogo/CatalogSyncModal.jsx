import React from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, CheckCircle2, AlertTriangle, Layers, ArrowRight } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks';

export function CatalogSyncModal({
  isOpen,
  status, // 'checking' | 'downloading' | 'parsing' | 'saving' | 'done' | 'error'
  progress, // { percent, currentBatch, totalBatches, message, totalRecords }
  error,
  onRetry,
  onDismiss
}) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const isDone = status === 'done';
  const isError = status === 'error';
  const percent = progress?.percent || 0;

  const modalContent = (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-6 select-none overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-7 max-w-md w-full max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-100 text-center space-y-5 my-0 sm:my-auto animate-in fade-in zoom-in-95 duration-200 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-7">
        
        {/* ICONO DE ESTADO */}
        <div>
          {isDone ? (
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 mx-auto flex items-center justify-center shadow-sm shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
          ) : isError ? (
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 mx-auto flex items-center justify-center shadow-sm shrink-0">
              <AlertTriangle className="w-7 h-7" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white mx-auto flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
          )}
        </div>

        {/* TÍTULOS Y DESCRIPCIÓN */}
        <div className="space-y-1.5">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            {isDone
              ? 'Catálogo Sincronizado'
              : isError
              ? 'Servidor Central No Disponible'
              : 'Sincronizando Catálogo Central'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            {isDone
              ? 'La base de datos de productos está completamente actualizada y lista para trabajar.'
              : isError
              ? 'No pudimos conectar con el Servidor Central. Puedes reintentar o seguir trabajando con tu base de datos local.'
              : 'Optimizando el índice de productos en este dispositivo para consultas instantáneas y modo offline.'}
          </p>
        </div>

        {/* BARRA DE PROGRESO Y MENSAJE ACTIVO */}
        {!isDone && !isError && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-3 text-left">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="truncate pr-2">{progress?.message || 'Procesando...'}</span>
              <span className="font-mono text-blue-600 shrink-0">{percent}%</span>
            </div>

            <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              ></div>
            </div>

            {progress?.totalBatches > 0 && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span className="inline-flex items-center gap-1 font-mono font-bold bg-blue-100/70 text-blue-800 px-2 py-0.5 rounded-md shrink-0">
                  <Layers className="w-3 h-3" />
                  Lote {progress.currentBatch} de {progress.totalBatches}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {progress?.totalRecords?.toLocaleString()} registros
                </span>
              </div>
            )}
          </div>
        )}

        {/* RESUMEN DE ÉXITO */}
        {isDone && (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-800 space-y-1">
            <div className="font-bold flex items-center justify-center gap-1.5">
              <span>{progress?.totalRecords?.toLocaleString()} productos indexados</span>
            </div>
            <p className="text-[11px] text-emerald-600">Disponibles para escaneo de códigos de barra y búsquedas rápidas.</p>
          </div>
        )}

        {/* ACCIONES Y BOTONES */}
        <div className="pt-1">
          {isDone && (
            <button
              onClick={onDismiss}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {isError && (
            <div className="space-y-2">
              <button
                onClick={onRetry}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar Sincronización</span>
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-2xl transition-all cursor-pointer"
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