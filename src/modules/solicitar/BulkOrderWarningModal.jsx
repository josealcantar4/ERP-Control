import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  ArrowRight,
  Building2
} from 'lucide-react';
import { useModalAnimation } from '../../hooks';

export function BulkOrderWarningModal({
  isOpen,
  onClose,
  onConfirm,
  bulkItems = [],
  destSede = '',
  destArea = ''
}) {
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

  const [countdown, setCountdown] = useState(10);
  const [isAgreed, setIsAgreed] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(10);
      setIsAgreed(false);
      return;
    }

    setCountdown(10);
    setIsAgreed(false);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!shouldRender) return null;

  const targetLabel = destArea
    ? `${destSede} (${destArea})`
    : destSede || 'Destino seleccionado';

  const modalContent = (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] overflow-hidden overscroll-contain ${cardClass}`}
      >
        {/* ENCABEZADO */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-sm border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Advertencia de Volumen de Pedido
              </h3>
              <p className="text-[11px] text-amber-800 font-medium">
                Recomendación para pedidos mayores a 4 piezas
              </p>
            </div>
          </div>

          {/* TEMPORIZADOR EN VIVO */}
          <div className="shrink-0">
            {countdown > 0 ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/90 text-amber-800 text-xs font-bold border border-amber-300">
                <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                <span>{countdown}s</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Listo</span>
              </div>
            )}
          </div>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <div className="p-5 space-y-4 overflow-y-auto overscroll-contain text-xs text-slate-600 flex-1">
          {/* AVISO DESCRIPTIVO */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-2xl space-y-1.5">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <Building2 className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Destino: {targetLabel}</span>
            </div>
            <p className="text-slate-700 leading-relaxed text-[11px] sm:text-xs">
              El destino seleccionado (<strong>{targetLabel}</strong>) no es una bodega y se detectó que el pedido incluye productos con <strong>más de 4 piezas</strong>. Para estas cantidades se recomienda <strong>pedirlos a bodega directamente en vez de control piso</strong> para no desabastecer las existencias de exhibición y piso de venta.
            </p>
          </div>

          {/* LISTA DE PRODUCTOS CON > 4 PIEZAS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
              <span>Productos con más de 4 piezas ({bulkItems.length})</span>
              <span>Existencias pedidas</span>
            </div>

            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 overscroll-contain border border-slate-100 rounded-2xl p-1 bg-slate-50/50">
              {bulkItems.map((item, idx) => (
                <div
                  key={item.codigo || idx}
                  className="p-2.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {item.descripcion}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Cód: {item.codigo}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold">
                      <Package className="w-3 h-3 text-amber-700" />
                      {item.cantidadSolicitada} pzas
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CHECKBOX DE ACUERDO */}
          <div className="pt-1">
            <label
              className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all select-none ${
                countdown > 0
                  ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                  : isAgreed
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 cursor-pointer shadow-xs'
                  : 'bg-white border-amber-300 hover:bg-amber-50/40 text-slate-800 cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                disabled={countdown > 0}
                checked={isAgreed}
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="text-xs">
                <span className="font-bold block text-slate-900">
                  {countdown > 0
                    ? `Espera ${countdown} segundo${countdown === 1 ? '' : 's'} para habilitar la confirmación...`
                    : 'Estoy de acuerdo con solicitar estas existencias'}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">
                  He leído la recomendación y confirmo que deseo continuar con el pedido con estas cantidades.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* PIE DE BOTONES */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-2.5 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
          >
            Revisar Pedido
          </button>
          <button
            type="button"
            disabled={countdown > 0 || !isAgreed}
            onClick={() => {
              if (countdown === 0 && isAgreed) {
                onConfirm();
              }
            }}
            className={`flex-1 py-2.5 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              countdown > 0 || !isAgreed
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/25 cursor-pointer'
            }`}
          >
            <span>Continuar con el Pedido</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
