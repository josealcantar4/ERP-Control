import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Truck,
  AlertTriangle,
  Package,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar,
  FileText,
  Loader2,
  Minus,
  Plus
} from 'lucide-react';
import { formatTransferFolio, playCheckSound } from '../transferencias';
import { MarqueeText } from '../../shared/MarqueeText';
import { useModalAnimation } from '../../hooks';

export function DespacharFaltantesModal({
  isOpen,
  solicitud,
  onClose,
  onConfirmResolution,
  isProcessing = false
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen: Boolean(isOpen && solicitud),
    onClose
  });

  const lastSolicitudRef = useRef(solicitud);
  if (solicitud) lastSolicitudRef.current = solicitud;
  const currentSolicitud = solicitud || lastSolicitudRef.current;

  const [itemsState, setItemsState] = useState([]);
  const [folioEnvioDigits, setFolioEnvioDigits] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (currentSolicitud && currentSolicitud.reporteFaltantes) {
      // Inicializar cada ítem faltante: por defecto marcado para despachar con la cantidad reportada
      const initial = currentSolicitud.reporteFaltantes.map((f, idx) => ({
        index: idx,
        codigo: f.codigo || '',
        descripcion: f.descripcion || '',
        cantidadFaltanteReportada: Number(f.cantidadDespachada || f.cantidadSolicitada || 1),
        despachado: true,
        cantidadDespachada: Number(f.cantidadDespachada || f.cantidadSolicitada || 1),
        motivoNoDespacho: 'Sin existencia en almacén'
      }));
      setItemsState(initial);

      const existingDigits = currentSolicitud.folio ? String(currentSolicitud.folio).replace(/^TR/i, '') : '';
      setFolioEnvioDigits(existingDigits);
      setNotas('');
    }
  }, [currentSolicitud]);

  if (!shouldRender || !currentSolicitud) return null;

  const toggleItemDespachado = (idx, despachado) => {
    if (despachado) {
      playCheckSound();
    }
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, despachado } : it))
    );
  };

  const updateItemCantidad = (idx, rawVal) => {
    // Si el usuario borra el valor con retroceso, permitimos que quede vacío en el input para que pueda teclear libremente
    if (rawVal === '') {
      setItemsState(prev =>
        prev.map(it => (it.index === idx ? { ...it, cantidadDespachada: '' } : it))
      );
      return;
    }

    const item = itemsState.find(it => it.index === idx);
    const max = item?.cantidadFaltanteReportada || 999999;
    const parsed = parseInt(rawVal, 10);
    if (isNaN(parsed)) return;

    const clamped = Math.max(1, Math.min(max, parsed));
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, cantidadDespachada: clamped } : it))
    );
  };

  const handleBlurCantidad = (idx) => {
    setItemsState(prev =>
      prev.map(it => {
        if (it.index === idx) {
          const max = it.cantidadFaltanteReportada || 1;
          const num = parseInt(it.cantidadDespachada, 10);
          const validNum = isNaN(num) || num < 1 ? 1 : Math.min(max, num);
          return { ...it, cantidadDespachada: validNum };
        }
        return it;
      })
    );
  };

  const stepItemCantidad = (idx, delta) => {
    setItemsState(prev =>
      prev.map(it => {
        if (it.index === idx) {
          const max = it.cantidadFaltanteReportada || 1;
          const current = parseInt(it.cantidadDespachada, 10) || 1;
          const next = Math.max(1, Math.min(max, current + delta));
          return { ...it, cantidadDespachada: next };
        }
        return it;
      })
    );
  };

  const updateItemMotivo = (idx, motivo) => {
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, motivoNoDespacho: motivo } : it))
    );
  };

  const updateItemMotivoParcial = (idx, motivo) => {
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, motivoParcial: motivo } : it))
    );
  };

  const hasAnyDispatched = itemsState.some(i => i.despachado && (parseInt(i.cantidadDespachada, 10) || 0) > 0);
  const totalItemsToDispatch = itemsState.filter(i => i.despachado && (parseInt(i.cantidadDespachada, 10) || 0) > 0).length;

  const handleConfirm = () => {
    const fullFolio = folioEnvioDigits.trim() ? `TR${folioEnvioDigits.trim()}` : currentSolicitud.folio || '';

    const payload = {
      folioEnvio: fullFolio,
      notas: notas.trim(),
      itemsResolucion: itemsState.map(i => {
        const rawQty = parseInt(i.cantidadDespachada, 10);
        const validQty = isNaN(rawQty) || rawQty < 1 ? 1 : Math.min(i.cantidadFaltanteReportada, rawQty);
        return {
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidadFaltanteReportada: i.cantidadFaltanteReportada,
          despachado: i.despachado,
          cantidadDespachada: i.despachado ? validQty : 0,
          motivoNoDespacho: !i.despachado ? i.motivoNoDespacho : '',
          motivoParcial: i.despachado && validQty < i.cantidadFaltanteReportada ? (i.motivoParcial || '') : '',
          motivo: !i.despachado ? i.motivoNoDespacho : (validQty < i.cantidadFaltanteReportada ? (i.motivoParcial || '') : '')
        };
      })
    };

    onConfirmResolution(payload);
  };

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, !isProcessing)}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] overflow-hidden overscroll-contain ${cardClass}`}
      >

        {/* HEADER */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Atender Reporte de Faltantes
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Sucursal: <strong className="text-slate-800">{currentSolicitud.sucursalOrigen}</strong> &bull; Folio:{' '}
              <span className="font-mono font-bold text-blue-700">
                {currentSolicitud.folio || formatTransferFolio(currentSolicitud)}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* AVISO EXPLICATIVO */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
            <Package className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Gestión de faltantes:</strong> Indica qué productos se enviarán a la sucursal para cubrir el reporte y cuáles no se pudieron surtir. El historial conservará el registro del faltante original y su resolución.
            </div>
          </div>

          {/* LISTA DE ÍTEMS FALTANTES */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
              Productos Reportados como Faltantes ({itemsState.length})
            </label>

            <div className="space-y-2">
              {itemsState.map(it => (
                <div
                  key={it.index}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    it.despachado
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-slate-50 border-slate-200 opacity-90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <MarqueeText
                        text={it.descripcion}
                        className="text-sm font-bold text-slate-900 block"
                      />
                      <p className="text-[11px] font-mono text-slate-400">
                        Código: {it.codigo} &bull; Faltante reportado:{' '}
                        <strong className="text-red-700">{it.cantidadFaltanteReportada} pz</strong>
                      </p>
                    </div>

                    {/* SELECTOR DESPACHAR / NO DESPACHAR */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shrink-0 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => toggleItemDespachado(it.index, true)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          it.despachado
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Despachar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleItemDespachado(it.index, false)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          !it.despachado
                            ? 'bg-red-600 text-white shadow-2xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                        <span>No enviar</span>
                      </button>
                    </div>
                  </div>

                  {/* CONTROLES CONDICIONALES SEGÚN SELECCIÓN */}
                  {it.despachado ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-100 text-xs">
                      <span className="text-emerald-900 font-semibold">Cantidad a enviar:</span>
                      <div className="flex items-center gap-2">
                        {/* Control stepper con [ - ] input [ + ] */}
                        <div className="inline-flex items-center bg-white border border-emerald-300 rounded-xl shadow-2xs overflow-hidden">
                          <button
                            type="button"
                            onClick={() => stepItemCantidad(it.index, -1)}
                            disabled={(parseInt(it.cantidadDespachada, 10) || 1) <= 1}
                            className="w-7 h-7 flex items-center justify-center text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 active:scale-90 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            title="Disminuir piezas (-1)"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <input
                            type="text"
                            inputMode="numeric"
                            value={it.cantidadDespachada !== undefined ? it.cantidadDespachada : ''}
                            onChange={e => updateItemCantidad(it.index, e.target.value)}
                            onBlur={() => handleBlurCantidad(it.index)}
                            className="w-12 py-1 text-center font-mono font-extrabold text-xs text-slate-900 bg-transparent focus:outline-none focus:bg-emerald-50/50"
                          />

                          <button
                            type="button"
                            onClick={() => stepItemCantidad(it.index, 1)}
                            disabled={(parseInt(it.cantidadDespachada, 10) || 1) >= it.cantidadFaltanteReportada}
                            className="w-7 h-7 flex items-center justify-center text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 active:scale-90 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            title="Aumentar piezas (+1)"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="text-[11px] font-mono text-emerald-800 font-bold">
                          de {it.cantidadFaltanteReportada} pz
                        </span>
                      </div>

                      {/* Campo de justificación opcional si envía menos de lo que faltaba */}
                      {(parseInt(it.cantidadDespachada, 10) || 1) < it.cantidadFaltanteReportada && (
                        <div className="w-full mt-2.5 pt-2 border-t border-emerald-100 flex flex-col sm:flex-row sm:items-center gap-1.5 animate-fade-in">
                          <label className="text-[11px] font-bold text-emerald-900 shrink-0 flex items-center gap-1">
                            <FileText className="w-3 h-3 text-emerald-600" />
                            <span>Motivo faltante parcial (opcional):</span>
                          </label>
                          <input
                            type="text"
                            value={it.motivoParcial || ''}
                            onChange={e => updateItemMotivoParcial(it.index, e.target.value)}
                            placeholder="Ej. Solo cuento con 2 pzas en almacén"
                            className="w-full text-xs px-2.5 py-1.5 bg-white border border-emerald-200 hover:border-emerald-300 focus:border-emerald-500 rounded-xl focus:outline-none text-slate-800 placeholder:text-slate-400 font-medium"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200 text-xs">
                      <span className="text-slate-500 font-medium shrink-0">Motivo:</span>
                      <select
                        value={it.motivoNoDespacho}
                        onChange={e => updateItemMotivo(it.index, e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500"
                      >
                        <option value="Sin existencia en almacén">Sin existencia en almacén</option>
                        <option value="Aclarado: No procedió el faltante">Aclarado: No procedió el faltante</option>
                        <option value="Cancelado por sucursal">Cancelado</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* FOLIO DE ENVÍO DE FALTANTES */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-700 block">
              Folio de Transferencia / Envío de Faltantes
            </label>
            <div className="flex items-stretch shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:border-blue-500 max-w-xs bg-white">
              <div className="bg-slate-100 px-3 py-2 text-slate-600 font-bold text-xs border-r border-slate-200 flex items-center justify-center select-none">
                TR
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={folioEnvioDigits}
                placeholder="000123"
                onChange={e => setFolioEnvioDigits(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Puedes conservar el folio original o ingresar el nuevo folio generado en el sistema externo.
            </p>
          </div>

          {/* NOTAS / OBSERVACIONES */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Observaciones para la Sucursal (opcional)
            </label>
            <textarea
              rows={2}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej. Se envían 2 piezas en paquete complementario sellado..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              hasAnyDispatched
                ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-emerald-600/20'
                : 'bg-amber-600 hover:bg-amber-500 active:scale-95 shadow-amber-600/20'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : hasAnyDispatched ? (
              <>
                <Truck className="w-4 h-4" />
                <span>Despachar Faltantes ({totalItemsToDispatch})</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Cerrar Reporte sin Envío</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
