import React, { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';
import { formatTransferFolio } from '../transferencias';

export function DespacharFaltantesModal({
  isOpen,
  solicitud,
  onClose,
  onConfirmResolution,
  isProcessing = false
}) {
  const [itemsState, setItemsState] = useState([]);
  const [folioEnvioDigits, setFolioEnvioDigits] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (solicitud && solicitud.reporteFaltantes) {
      // Inicializar cada ítem faltante: por defecto marcado para despachar con la cantidad reportada
      const initial = solicitud.reporteFaltantes.map((f, idx) => ({
        index: idx,
        codigo: f.codigo || '',
        descripcion: f.descripcion || '',
        cantidadFaltanteReportada: Number(f.cantidadDespachada || f.cantidadSolicitada || 1),
        despachado: true,
        cantidadDespachada: Number(f.cantidadDespachada || f.cantidadSolicitada || 1),
        motivoNoDespacho: 'Sin existencia en almacén'
      }));
      setItemsState(initial);

      const existingDigits = solicitud.folio ? String(solicitud.folio).replace(/^TR/i, '') : '';
      setFolioEnvioDigits(existingDigits);
      setNotas('');
    }
  }, [solicitud]);

  if (!isOpen || !solicitud) return null;

  const toggleItemDespachado = (idx, despachado) => {
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, despachado } : it))
    );
  };

  const updateItemCantidad = (idx, val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, cantidadDespachada: num } : it))
    );
  };

  const updateItemMotivo = (idx, motivo) => {
    setItemsState(prev =>
      prev.map(it => (it.index === idx ? { ...it, motivoNoDespacho: motivo } : it))
    );
  };

  const hasAnyDispatched = itemsState.some(i => i.despachado && i.cantidadDespachada > 0);
  const totalItemsToDispatch = itemsState.filter(i => i.despachado).length;

  const handleConfirm = () => {
    const fullFolio = folioEnvioDigits.trim() ? `TR${folioEnvioDigits.trim()}` : solicitud.folio || '';

    const payload = {
      folioEnvio: fullFolio,
      notas: notas.trim(),
      itemsResolucion: itemsState.map(i => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidadFaltanteReportada: i.cantidadFaltanteReportada,
        despachado: i.despachado,
        cantidadDespachada: i.despachado ? i.cantidadDespachada : 0,
        motivoNoDespacho: !i.despachado ? i.motivoNoDespacho : ''
      }))
    };

    onConfirmResolution(payload);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md animate-fade-in select-none overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">

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
              Sucursal: <strong className="text-slate-800">{solicitud.sucursalOrigen}</strong> &bull; Folio:{' '}
              <span className="font-mono font-bold text-blue-700">
                {solicitud.folio || formatTransferFolio(solicitud)}
              </span>
            </p>
          </div>

          <button
            onClick={onClose}
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
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {it.descripcion}
                      </h4>
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
                    <div className="flex items-center gap-2 pt-1 border-t border-emerald-100 text-xs">
                      <span className="text-emerald-800 font-semibold">Cantidad a enviar:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max={it.cantidadFaltanteReportada}
                          value={it.cantidadDespachada}
                          onChange={e => updateItemCantidad(it.index, e.target.value)}
                          className="w-16 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-center font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-[11px] text-emerald-700 font-medium">piezas</span>
                      </div>
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
            onClick={onClose}
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
