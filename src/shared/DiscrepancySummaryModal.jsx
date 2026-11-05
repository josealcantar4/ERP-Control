import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  PackageMinus,
  PackagePlus,
  ArrowRight,
  RotateCcw,
  Send,
  Building2,
  FileText
} from 'lucide-react';
import { useModalAnimation } from '../hooks';

export function DiscrepancySummaryModal({
  isOpen,
  onClose,
  onConfirm,
  solicitud,
  discrepancias = [],
  usuarioReceptor = ''
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  const [observaciones, setObservaciones] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!shouldRender || !solicitud) return null;

  const faltantes = discrepancias.filter(d => d.tipo === 'faltante' || d.tipo === 'ausencia_total');
  const extras = discrepancias.filter(d => d.tipo === 'extra');

  const totalFaltantesPzas = faltantes.reduce((acc, d) => acc + Math.abs(d.diferencia), 0);
  const totalExtrasPzas = extras.reduce((acc, d) => acc + d.diferencia, 0);

  const handleConfirmReport = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        observaciones: observaciones.trim(),
        discrepancias,
        totalFaltantesPzas,
        totalExtrasPzas
      });
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90dvh] overflow-hidden my-auto ${cardClass}`}
      >
        {/* ENCABEZADO */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100/80 border border-amber-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Reporte de Discrepancias
            </span>
            <span className="font-mono text-xs font-bold text-slate-500">
              {solicitud.folio || `Ref: ${solicitud.id}`}
            </span>
          </div>

          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Resumen de Diferencias en Caja
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verifica las piezas faltantes o sobrantes antes de emitir el reporte al despachador responsable.
            </p>
          </div>

          {/* BADGES DE RESUMEN */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {faltantes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-red-100/90 text-red-800 border border-red-200">
                <PackageMinus className="w-3.5 h-3.5 text-red-600" />
                <span>{faltantes.length} prod. con faltante ({totalFaltantesPzas} pzas)</span>
              </span>
            )}
            {extras.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-100/90 text-blue-800 border border-blue-200">
                <PackagePlus className="w-3.5 h-3.5 text-blue-600" />
                <span>{extras.length} prod. con extra (+{totalExtrasPzas} pzas)</span>
              </span>
            )}
          </div>
        </div>

        {/* LISTADO DE DISCREPANCIAS CON SCROLL */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5 flex-1 divide-y divide-slate-100">
          {discrepancias.map((disc, idx) => {
            const isMissing = disc.tipo === 'faltante';
            const isAbsence = disc.tipo === 'ausencia_total';
            const isExtra = disc.tipo === 'extra';

            return (
              <div
                key={disc.codigo || idx}
                className={`rounded-2xl p-3.5 border transition-all space-y-2 ${
                  isAbsence
                    ? 'bg-red-50/80 border-red-200'
                    : isMissing
                    ? 'bg-amber-50/80 border-amber-200'
                    : 'bg-emerald-50/80 border-emerald-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                      {disc.descripcion}
                    </h4>
                    <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                      Código: {disc.codigo}
                    </span>
                  </div>

                  {/* Badge de Tipo */}
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${
                      isAbsence
                        ? 'bg-red-200/80 text-red-900'
                        : isMissing
                        ? 'bg-amber-200/80 text-amber-900'
                        : 'bg-emerald-200/80 text-emerald-900'
                    }`}
                  >
                    {isAbsence ? 'No Recibido' : isMissing ? 'Incompleto' : 'Piezas Extra'}
                  </span>
                </div>

                {/* Métricas: Esperado vs Recibido vs Diferencia */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-white/90 p-2 rounded-xl border border-slate-200/70 text-center">
                    <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                      Esperado
                    </span>
                    <span className="text-xs sm:text-sm font-mono font-bold text-slate-700">
                      {disc.cantidadEsperada} pzas
                    </span>
                  </div>

                  <div className="bg-white/90 p-2 rounded-xl border border-slate-200/70 text-center">
                    <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                      Recibido
                    </span>
                    <span
                      className={`text-xs sm:text-sm font-mono font-bold ${
                        isAbsence
                          ? 'text-red-600'
                          : isMissing
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {disc.cantidadRecibida} pzas
                    </span>
                  </div>

                  <div
                    className={`p-2 rounded-xl border text-center ${
                      isAbsence || isMissing
                        ? 'bg-red-100/60 border-red-200 text-red-800'
                        : 'bg-emerald-100/60 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    <span className="text-[10px] font-semibold block uppercase opacity-80">
                      Diferencia
                    </span>
                    <span className="text-xs sm:text-sm font-mono font-extrabold">
                      {disc.diferencia > 0 ? `+${disc.diferencia}` : disc.diferencia} pz
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* CAMPO DE OBSERVACIONES */}
          <div className="pt-2 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Observaciones de la Recepción (Opcional):</span>
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. La caja llegó abierta, cinta violada o empaque dañado..."
              className="w-full text-xs p-3 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-all placeholder:text-slate-400 text-slate-800"
            />
          </div>

          {/* AVISO AL RESPONSABLE */}
          <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200/70 text-[11px] text-blue-900 flex items-start gap-2 leading-relaxed">
            <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Al confirmar, se guardará este reporte en el historial de la transferencia y se enviará una notificación inmediata a{' '}
              <strong className="font-semibold text-blue-950">
                {solicitud.sucursalDestino || solicitud.usuarioDestino || 'el responsable de despacho'}
              </strong>{' '}
              para la aclaración o re-despacho correspondiente.
            </p>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-white flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Modificar Conteo</span>
          </button>

          <button
            type="button"
            onClick={handleConfirmReport}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer shadow-md shadow-red-600/20 flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Enviando...' : 'Confirmar y Enviar Reporte'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
