import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Clock,
  ShieldCheck,
  Package,
  Truck,
  PackagePlus,
  AlertCircle
} from 'lucide-react';
import { formatTransferFolio } from './transferService';
import { useModalAnimation } from '../../hooks';
import { MarqueeText } from '../../shared/MarqueeText';

export function TransferDetailModal({ isOpen, solicitud, onClose }) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen: Boolean(isOpen && solicitud),
    onClose,
    centerOrigin: true
  });

  const lastSolicitudRef = useRef(solicitud);
  if (solicitud) lastSolicitudRef.current = solicitud;
  const currentSolicitud = solicitud || lastSolicitudRef.current;

  if (!shouldRender || !currentSolicitud) return null;

  const isCompleted = currentSolicitud.estado === 'completada';
  const isReceived = currentSolicitud.estado === 'recibida';
  const isIncomplete = currentSolicitud.estado === 'recibida_incompleta';
  const isDraft = currentSolicitud.estado === 'borrador';
  const isFaltantesDespachados = currentSolicitud.estado === 'faltantes_despachados';
  const isCerradaConFaltantes = currentSolicitud.estado === 'cerrada_con_faltantes';
  const hasFaltantesReport = Boolean(currentSolicitud.reporteFaltantes && currentSolicitud.reporteFaltantes.length > 0);

  const formattedDate = currentSolicitud.fecha
    ? new Date(currentSolicitud.fecha).toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'Fecha no registrada';

  const totalItems = currentSolicitud.items?.length || 0;
  const totalUnits = currentSolicitud.items?.reduce(
    (acc, it) => acc + Number(it.cantidadDespachada || it.cantidadSolicitada || 0),
    0
  );

  const modalContent = (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md select-none overflow-hidden overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] flex flex-col overflow-hidden my-auto overscroll-contain ${cardClass}`}
      >
        
        {/* HEADER */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0 bg-slate-50/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-extrabold text-slate-900 font-mono tracking-tight">
                {currentSolicitud.folio ? currentSolicitud.folio : `Ref: ${formatTransferFolio(currentSolicitud)}`}
              </span>

              {/* ESTADO PILL */}
              {Boolean(currentSolicitud.esTransferenciaInterna || (currentSolicitud.sucursalOrigen && currentSolicitud.sucursalOrigen === currentSolicitud.sucursalDestino)) && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Transferencia Interna
                </span>
              )}
              {(currentSolicitud.sinSolicitud || currentSolicitud.esDespachoDirecto) && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                  <PackagePlus className="w-3 h-3 text-amber-700" />
                  Despacho sin Solicitud
                </span>
              )}
              {isCompleted && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Despachada
                </span>
              )}
              {isReceived && hasFaltantesReport && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Recibida (Faltantes Atendidos)
                </span>
              )}
              {isReceived && !hasFaltantesReport && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Recibida Completa
                </span>
              )}
              {isFaltantesDespachados && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-purple-600" />
                  Faltantes en Tránsito
                </span>
              )}
              {isIncomplete && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Con Faltantes Pendientes
                </span>
              )}
              {isCerradaConFaltantes && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Cerrada c/ Faltantes
                </span>
              )}
              {isDraft && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Borrador
                </span>
              )}
              {currentSolicitud.estado === 'en_despacho' && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  En Despacho
                </span>
              )}
              {!isCompleted && !isReceived && !isIncomplete && !isDraft && !isFaltantesDespachados && !isCerradaConFaltantes && currentSolicitud.estado !== 'en_despacho' && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                  {String(currentSolicitud.estado || 'Enviada').replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formattedDate}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* METADATOS: ORIGEN Y DESTINO */}
        <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50/80 border-b border-slate-100 text-xs shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/60 space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Building2 className="w-3 h-3 text-blue-600" />
              Origen
            </span>
            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">
              {currentSolicitud.sucursalOrigen || 'Sucursal'}{currentSolicitud.areaOrigen ? ` (${currentSolicitud.areaOrigen})` : ''}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              Por: {currentSolicitud.usuarioSolicitante || 'N/A'}
            </p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/60 space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Package className="w-3 h-3 text-emerald-600" />
              Destino
            </span>
            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">
              {currentSolicitud.sucursalDestino || (currentSolicitud.areaDestino ? 'Matriz' : 'Bodega Central')}{currentSolicitud.areaDestino ? ` (${currentSolicitud.areaDestino})` : ''}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {currentSolicitud.usuarioDespacho ? `Despachado: ${currentSolicitud.usuarioDespacho}` : `Para: ${currentSolicitud.usuarioDestino || 'General'}`}
            </p>
          </div>
        </div>

        {/* OBSERVACIÓN DEL PEDIDO (EJ. DESPACHO SIN SOLICITUD) */}
        {currentSolicitud.observaciones && (
          <div className="p-3.5 bg-amber-50/90 border-b border-amber-200/70 text-xs space-y-1 shrink-0">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Observaciones del Pedido:</span>
            </div>
            <p className="text-amber-800 font-medium pl-5 leading-relaxed">
              {currentSolicitud.observaciones}
            </p>
          </div>
        )}

        {/* HISTORIAL PERMANENTE DE FALTANTES Y RESOLUCIÓN */}
        {hasFaltantesReport && (
          <div className="p-4 bg-red-50/70 border-b border-red-100 text-xs space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-red-900">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Historial de Faltantes Reportados:</span>
              </div>
              {currentSolicitud.resolucionFaltantes ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Reporte Atendido por Bodega
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                  Pendiente de Atención
                </span>
              )}
            </div>

            <div className="bg-white/90 rounded-2xl p-3 border border-red-200/80 divide-y divide-slate-100 text-xs shadow-2xs space-y-1.5">
              {currentSolicitud.reporteFaltantes.map((f, i) => {
                const resItem =
                  currentSolicitud.resolucionFaltantes?.itemsResolucion?.find(r => r.codigo === f.codigo) ||
                  currentSolicitud.resolucionFaltantes?.itemsResolucion?.[i];

                return (
                  <div
                    key={i}
                    className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800">{f.descripcion}</span>
                      <span className="text-[11px] font-mono text-slate-400 ml-1.5">
                        ({f.cantidadDespachada || f.cantidadSolicitada} pz faltantes)
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {resItem ? (
                        resItem.despachado ? (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Despachado ({resItem.cantidadDespachada} pz)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                            <X className="w-3 h-3 text-slate-500" />
                            <span>No despachado ({resItem.motivoNoDespacho || 'Sin stock'})</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Pendiente en Bodega</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Metadatos de la resolución si existe */}
            {currentSolicitud.resolucionFaltantes && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span>
                    <strong>Atendido por:</strong>{' '}
                    {currentSolicitud.resolucionFaltantes.usuarioResolucion || 'Bodega'}
                  </span>
                  <span>
                    <strong>Fecha:</strong>{' '}
                    {new Date(currentSolicitud.resolucionFaltantes.fechaResolucion).toLocaleString('es-MX')}
                  </span>
                </div>
                {currentSolicitud.resolucionFaltantes.folioEnvio && (
                  <div>
                    <strong>Folio de Reenvío:</strong>{' '}
                    <span className="font-mono font-bold text-blue-700">
                      {currentSolicitud.resolucionFaltantes.folioEnvio}
                    </span>
                  </div>
                )}
                {currentSolicitud.resolucionFaltantes.notas && (
                  <div className="text-slate-500 italic">
                    &ldquo;{currentSolicitud.resolucionFaltantes.notas}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* LISTADO DE PRODUCTOS */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Productos Despachados ({totalItems})</span>
            <span className="font-mono text-slate-500">{totalUnits} unidades totales</span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white">
            {currentSolicitud.items?.map((item, index) => {
              const qty = item.cantidadDespachada ?? item.cantidadSolicitada ?? 0;
              return (
                <div key={index} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <MarqueeText
                        text={item.descripcion}
                        className="font-bold text-slate-900 text-xs block"
                      />
                      {item.esExtra && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          EXTRA
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 block">
                      EAN: {item.codigo}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-xs bg-slate-100 px-2.5 py-1 rounded-xl text-slate-800">
                      {qty} pzas
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] leading-tight">
              {isCompleted || isReceived || isIncomplete
                ? 'Registro permanente: Transferencia cerrada e inmutable.'
                : 'Transferencia activa.'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-sm"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
