/**
 * Modal de visualización detallada del historial, estado actual, artículos y observaciones de una transferencia.
 */

import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Clock,
  Package,
  Truck,
  PackagePlus,
  AlertCircle,
  FileText,
  ArrowRight,
  User,
  MapPin
} from 'lucide-react';
import { formatTransferFolio, dismissNotification, formatOrderRequestedBy } from './transferService';
import { userService } from '../usuarios/userService';
import { useModalAnimation, usePendingSync } from '../../hooks';
import { MarqueeText } from '../../shared/MarqueeText';

export function TransferDetailModal({ isOpen, solicitud, onClose }) {
  const [usersList, setUsersList] = React.useState([]);
  const { pendingSyncIds } = usePendingSync();

  React.useEffect(() => {
    const unsub = userService.subscribeUsers((list) => {
      setUsersList(list);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const lastSolicitudRef = useRef(solicitud);
  if (solicitud) lastSolicitudRef.current = solicitud;
  const currentSolicitud = solicitud || lastSolicitudRef.current;

  useEffect(() => {
    if (isOpen && currentSolicitud?.id) {
      dismissNotification(`tr-falt-${currentSolicitud.id}`);
      dismissNotification(`tr-falt-entregados-${currentSolicitud.id}`);
      dismissNotification(`tr-falt-env-${currentSolicitud.id}`);
      dismissNotification(`tr-comp-${currentSolicitud.id}`);
      dismissNotification(`tr-nueva-${currentSolicitud.id}`);
    }
  }, [isOpen, currentSolicitud?.id]);

  const handleModalClose = () => {
    if (currentSolicitud?.id) {
      dismissNotification(`tr-falt-${currentSolicitud.id}`);
      dismissNotification(`tr-falt-entregados-${currentSolicitud.id}`);
      dismissNotification(`tr-falt-env-${currentSolicitud.id}`);
      dismissNotification(`tr-comp-${currentSolicitud.id}`);
      dismissNotification(`tr-nueva-${currentSolicitud.id}`);
    }
    if (onClose) onClose();
  };

  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen: Boolean(isOpen && solicitud),
    onClose: handleModalClose,
    centerOrigin: true
  });

  if (!shouldRender || !currentSolicitud) return null;

  const isCompleted = currentSolicitud.estado === 'completada';
  const isReceived = currentSolicitud.estado === 'recibida';
  const isIncomplete = currentSolicitud.estado === 'recibida_incompleta';
  const isDraft = currentSolicitud.estado === 'borrador';
  const isFaltantesDespachados = currentSolicitud.estado === 'faltantes_despachados';
  const isCerradaConFaltantes = currentSolicitud.estado === 'cerrada_con_faltantes';
  const hasFaltantesReport = Boolean(currentSolicitud.reporteFaltantes && currentSolicitud.reporteFaltantes.length > 0);

  const isSolicitada = Boolean(currentSolicitud.solicitada || currentSolicitud.solicitado || (currentSolicitud.estado && currentSolicitud.estado !== 'borrador'));
  const isDespachada = Boolean(currentSolicitud.despachada || currentSolicitud.despachado || currentSolicitud.atendida || currentSolicitud.atendido || isCompleted || isReceived || isIncomplete || isFaltantesDespachados || isCerradaConFaltantes);
  const isRecibida = Boolean(currentSolicitud.recibida || currentSolicitud.recibido || isReceived || isIncomplete || isCerradaConFaltantes);
  const isEnTransito = Boolean(currentSolicitud.enTransito || (isDespachada && !isRecibida));
  const isDirect = Boolean(currentSolicitud.esDespachoDirecto || currentSolicitud.sinSolicitud);

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
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] flex flex-col overflow-hidden my-auto overscroll-contain ${cardClass}`}
      >
        
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0 bg-slate-50/80 dark:bg-slate-900">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                {currentSolicitud.folio ? currentSolicitud.folio : `Ref: ${formatTransferFolio(currentSolicitud)}`}
              </span>

              {Boolean(currentSolicitud.esTransferenciaInterna || (currentSolicitud.sucursalOrigen && currentSolicitud.sucursalOrigen === currentSolicitud.sucursalDestino)) && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-transparent text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                  Transferencia Interna
                </span>
              )}
              {(currentSolicitud.sinSolicitud || currentSolicitud.esDespachoDirecto) && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-transparent text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 flex items-center gap-1">
                  <PackagePlus className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                  Despacho sin Solicitud
                </span>
              )}
              {isCompleted && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Despachada
                </span>
              )}
              {isReceived && hasFaltantesReport && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-transparent text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Recibida (Faltantes Atendidos)
                </span>
              )}
              {isReceived && !hasFaltantesReport && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-transparent text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Recibida Completa
                </span>
              )}
              {isFaltantesDespachados && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 dark:bg-transparent text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                  Faltantes en Tránsito
                </span>
              )}
              {isIncomplete && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Con Faltantes Pendientes
                </span>
              )}
              {isCerradaConFaltantes && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  Cerrada con Faltantes
                </span>
              )}
              {isDraft && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-transparent text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Borrador
                </span>
              )}
              {currentSolicitud.estado === 'en_despacho' && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-transparent text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                  En Despacho
                </span>
              )}
              {!isCompleted && !isReceived && !isIncomplete && !isDraft && !isFaltantesDespachados && !isCerradaConFaltantes && currentSolicitud.estado !== 'en_despacho' && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 uppercase">
                  {String(currentSolicitud.estado || 'Enviada').replace(/_/g, ' ')}
                </span>
              )}
              {!isDraft && pendingSyncIds.has(currentSolicitud.id) && (
                <span
                  title="Pendiente de sincronizar con el servidor"
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1"
                >
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>En cola de envío</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span>{formattedDate}</span>
            </div>

            {!isDirect && (
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 pt-0.5">
                {formatOrderRequestedBy(currentSolicitud, usersList)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Progress Bar Dinámico */}
          <div className="px-4 pt-4 pb-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800">
            {(() => {
              const showFaltantes = hasFaltantesReport || isFaltantesDespachados || isIncomplete || isCerradaConFaltantes;
              const faltantesResueltos = Boolean(currentSolicitud.resolucionFaltantes);

              const isOrdenRecibida = currentSolicitud.estado && !['borrador', 'enviada'].includes(currentSolicitud.estado);

              const steps = [
                {
                  key: 'solicitado',
                  label: isDirect ? 'Despachado' : 'Solicitado',
                  done: isSolicitada,
                  active: isSolicitada,
                  icon: isSolicitada ? CheckCircle2 : Clock,
                  color: isSolicitada ? 'emerald' : 'slate',
                },
                {
                  key: 'orden',
                  label: 'Orden recibida',
                  done: isOrdenRecibida,
                  active: isOrdenRecibida,
                  icon: isOrdenRecibida ? CheckCircle2 : Clock,
                  color: isOrdenRecibida ? 'emerald' : 'slate',
                },
                {
                  key: 'atendido',
                  label: 'Atendido',
                  done: isDespachada,
                  active: isDespachada,
                  icon: isDespachada ? CheckCircle2 : (currentSolicitud.estado === 'en_despacho' ? Truck : Clock),
                  color: isDespachada ? 'emerald' : currentSolicitud.estado === 'en_despacho' ? 'blue' : 'slate',
                },
                ...(showFaltantes ? [{
                  key: 'faltantes',
                  label: 'Faltantes',
                  done: faltantesResueltos || isCerradaConFaltantes,
                  active: true,
                  icon: (faltantesResueltos || isCerradaConFaltantes) ? CheckCircle2 : (isFaltantesDespachados ? Truck : AlertTriangle),
                  color: (faltantesResueltos || isCerradaConFaltantes) ? 'emerald' : (isFaltantesDespachados ? 'purple' : 'red'),
                }] : []),
                {
                  key: 'recibido',
                  label: 'Recibido',
                  done: isRecibida,
                  active: isRecibida,
                  icon: isRecibida ? CheckCircle2 : (isEnTransito && !showFaltantes ? Truck : Clock),
                  color: isRecibida ? 'emerald' : (isEnTransito ? 'blue' : 'slate'),
                },
              ];

              const colorMap = {
                emerald: {
                  dot: 'bg-emerald-500 dark:bg-emerald-400',
                  icon: 'text-emerald-600 dark:text-emerald-400',
                  label: 'text-emerald-700 dark:text-emerald-400',
                  line: 'bg-emerald-400 dark:bg-emerald-500',
                },
                blue: {
                  dot: 'bg-blue-500 dark:bg-blue-400',
                  icon: 'text-blue-600 dark:text-blue-400',
                  label: 'text-blue-700 dark:text-blue-400',
                  line: 'bg-blue-400 dark:bg-blue-500',
                },
                purple: {
                  dot: 'bg-purple-500 dark:bg-purple-400',
                  icon: 'text-purple-600 dark:text-purple-400',
                  label: 'text-purple-700 dark:text-purple-400',
                  line: 'bg-purple-400 dark:bg-purple-500',
                },
                red: {
                  dot: 'bg-red-400 dark:bg-red-500',
                  icon: 'text-red-500 dark:text-red-400',
                  label: 'text-red-600 dark:text-red-400',
                  line: 'bg-red-300 dark:bg-red-600',
                },
                slate: {
                  dot: 'bg-slate-300 dark:bg-slate-600',
                  icon: 'text-slate-400 dark:text-slate-500',
                  label: 'text-slate-400 dark:text-slate-500',
                  line: 'bg-slate-200 dark:bg-slate-700',
                },
              };

              return (
                <div className="flex items-start w-full gap-0">
                  {steps.map((step, i) => {
                    const c = colorMap[step.color] || colorMap.slate;
                    const Icon = step.icon;
                    const isLast = i === steps.length - 1;
                    const nextStep = !isLast ? steps[i + 1] : null;
                    const lineColor = step.done && nextStep?.active
                      ? (colorMap[nextStep.color] || colorMap.slate).line
                      : step.done
                      ? colorMap.emerald.line
                      : colorMap.slate.line;

                    return (
                      <div key={step.key} className="flex flex-col items-center flex-1 min-w-0">
                        <div className="flex items-center w-full">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${step.active ? c.dot : 'bg-slate-200 dark:bg-slate-700'} transition-all`}>
                            <Icon className={`w-3.5 h-3.5 ${step.active ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                          </div>
                          {!isLast && (
                            <div className={`h-0.5 flex-1 transition-all ${lineColor}`} />
                          )}
                        </div>
                        <span className={`text-[9px] font-bold mt-1.5 text-center leading-tight w-full ${c.label} truncate px-0.5`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="p-4 bg-slate-50/80 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-xs space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-blue-500" />
                  {isDirect ? 'Despachado desde' : 'Solicitado desde'}
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
                  {currentSolicitud.sucursalOrigen || 'Sucursal'}
                </p>
                {currentSolicitud.areaOrigen && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Área: {currentSolicitud.areaOrigen}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isDirect
                    ? `Despachó: ${currentSolicitud.usuarioDespacho || currentSolicitud.usuarioSolicitante || 'Bodega'}`
                    : `Solicitó: ${currentSolicitud.usuarioSolicitante || 'N/A'}`}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1">
                  <Package className="w-3 h-3 text-emerald-500" />
                  {isRecibida ? 'Recibido en' : 'Destinado a'}
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
                  {currentSolicitud.sucursalDestino || 'Sucursal Destino'}
                </p>
                {currentSolicitud.areaDestino && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Área: {currentSolicitud.areaDestino}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {currentSolicitud.usuarioReceptor
                    ? `Recibió: ${currentSolicitud.usuarioReceptor}`
                    : isEnTransito
                    ? `En camino a: ${currentSolicitud.usuarioDestino || 'destinatario'}`
                    : `Destinatario: ${currentSolicitud.usuarioDestino || 'General'}`}
                </p>
              </div>
            </div>

            {(() => {
              const rawObs = currentSolicitud.observaciones || currentSolicitud.motivo || currentSolicitud.notas;
              const obs = typeof rawObs === 'string' ? rawObs.trim() : rawObs;
              const isGenericDirectObs = isDirect && (!obs || obs === 'Pedido despachado sin haber sido solicitado' || obs === 'Pedido despachado sin haber sido solicitado.');
              if (!obs || isGenericDirectObs) return null;
              return (
                <div className="flex items-start gap-1.5 px-0.5 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-[3px]" />
                  <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-relaxed">
                    <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      Observaciones del Pedido:
                    </span>
                    <span className="font-normal text-slate-600 dark:text-slate-300 break-words min-w-0 max-w-full whitespace-pre-line">
                      {obs}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

        {!hasFaltantesReport && (currentSolicitud.observacionesRecepcion || currentSolicitud.reporteDiscrepancias?.observaciones) && (
          <div className="p-3.5 bg-emerald-50/90 dark:bg-transparent border-b border-emerald-200/70 dark:border-slate-800 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-400">
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Observaciones de Recepción en Sucursal:</span>
            </div>
            <p className="text-emerald-800 dark:text-emerald-300 font-medium pl-5 leading-relaxed italic">
              &ldquo;{currentSolicitud.observacionesRecepcion || currentSolicitud.reporteDiscrepancias?.observaciones}&rdquo;
            </p>
          </div>
        )}

        {hasFaltantesReport && (
          <div className="p-4 bg-red-50/70 dark:bg-transparent border-b border-red-100 dark:border-slate-800 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-red-900 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>Historial de Faltantes Reportados:</span>
              </div>
              {currentSolicitud.resolucionFaltantes ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-transparent text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                  Reporte Atendido por Bodega
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30">
                  Pendiente de Atención
                </span>
              )}
            </div>

            {(currentSolicitud.reporteDiscrepancias?.observaciones || currentSolicitud.observacionesRecepcion) && (
              <div className="p-2.5 bg-red-100/60 dark:bg-transparent rounded-xl border border-red-200 dark:border-slate-800 text-xs text-red-950 dark:text-red-400 space-y-0.5">
                <span className="font-bold text-[11px] text-red-900 dark:text-red-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                  <span>Motivo reportado por sucursal:</span>
                </span>
                <p className="italic text-red-900 dark:text-red-300 pl-4.5 text-[11px] leading-snug">
                  &ldquo;{currentSolicitud.reporteDiscrepancias?.observaciones || currentSolicitud.observacionesRecepcion}&rdquo;
                </p>
              </div>
            )}

            <div className="bg-white/90 dark:bg-slate-900 rounded-2xl p-3 border border-red-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs shadow-2xs space-y-1.5">
              {currentSolicitud.reporteFaltantes.map((f, i) => {
                const resItem =
                  currentSolicitud.resolucionFaltantes?.itemsResolucion?.find(r => r.codigo === f.codigo) ||
                  currentSolicitud.resolucionFaltantes?.itemsResolucion?.[i];

                const cantFaltante = f.cantidadFaltante !== undefined
                  ? f.cantidadFaltante
                  : (f.diferencia !== undefined ? Math.abs(f.diferencia) : (f.cantidadDespachada || f.cantidadSolicitada || 1));

                return (
                  <div
                    key={i}
                    className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-100">{f.descripcion}</span>
                      <div className="space-y-0.5 text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-1">
                        <div>Código: <strong className="text-slate-800 dark:text-slate-200">{f.codigo}</strong></div>
                        {f.cantidadRecibida !== undefined && (
                          <div>Recibidas: <strong className="text-slate-800 dark:text-slate-200">{f.cantidadRecibida} de {f.cantidadDespachada || f.cantidadSolicitada} pz</strong></div>
                        )}
                        <div className="text-red-600 dark:text-red-400 font-bold">
                          Faltante: {cantFaltante} pz
                        </div>
                      </div>
                      {Boolean(f.observacion || f.motivoRecepcion || (f.motivo && !f.motivoAjusteDespacho)) && (
                        <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-red-950 dark:text-red-200 bg-red-50/90 dark:bg-transparent px-2.5 py-0.5 rounded-lg border border-red-200 dark:border-red-500/30">
                          <FileText className="w-3 h-3 text-red-600 shrink-0" />
                          <span className="font-semibold text-red-900 dark:text-red-300">Motivo sucursal:</span>
                          <span className="italic font-medium text-red-900 dark:text-red-200">&ldquo;{f.observacion || f.motivoRecepcion || f.motivo}&rdquo;</span>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {resItem ? (
                        resItem.despachado ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Despachado ({resItem.cantidadDespachada} pz)</span>
                            </span>
                            {(resItem.motivoParcial || resItem.motivo) && (
                              <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium italic">
                                "{resItem.motivoParcial || resItem.motivo}"
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-transparent text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                            <X className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                            <span>No despachado ({resItem.motivoNoDespacho || 'Sin stock'})</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-transparent text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Pendiente en Bodega</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {currentSolicitud.resolucionFaltantes && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
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
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                      {currentSolicitud.resolucionFaltantes.folioEnvio}
                    </span>
                  </div>
                )}
                {currentSolicitud.resolucionFaltantes.notas && (
                  <div className="text-slate-500 dark:text-slate-400 italic">
                    &ldquo;{currentSolicitud.resolucionFaltantes.notas}&rdquo;
                  </div>
                )}
              </div>
            )}

            {currentSolicitud.recepcionFaltantes && (
              <div className="p-2.5 bg-purple-50/70 dark:bg-transparent rounded-xl border border-purple-200/80 dark:border-slate-800 text-[11px] text-purple-950 dark:text-purple-400 space-y-1 mt-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span>
                    <strong>Recepción de Reenvío:</strong>{' '}
                    {currentSolicitud.recepcionFaltantes.usuarioRecepcion || 'Sucursal'}
                  </span>
                  {currentSolicitud.recepcionFaltantes.fechaRecepcion && (
                    <span className="text-[10px] text-purple-700 dark:text-purple-400 font-mono">
                      {new Date(currentSolicitud.recepcionFaltantes.fechaRecepcion).toLocaleString('es-MX')}
                    </span>
                  )}
                </div>
                {currentSolicitud.recepcionFaltantes.itemsAunFaltantes?.length > 0 && (
                  <div className="mt-1 pt-1.5 border-t border-purple-200/60 space-y-1">
                    <span className="text-[10px] font-bold text-red-800 dark:text-red-400 uppercase tracking-wider block">
                      Faltantes definitivos al cerrar reenvío:
                    </span>
                    {currentSolicitud.recepcionFaltantes.itemsAunFaltantes.map((af, idx) => (
                      <div key={idx} className="bg-white/80 dark:bg-slate-900 p-1.5 rounded-lg border border-purple-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{af.descripcion}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-transparent px-1.5 py-0.5 rounded border border-red-200 dark:border-red-500/30 text-[10px]">
                            Faltaron {af.cantidadAunFaltante} pz
                          </span>
                          {(af.observacion || af.motivoRecepcion) && (
                            <span className="text-[10px] italic text-purple-900 dark:text-purple-300">
                              &ldquo;{af.observacion || af.motivoRecepcion}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {currentSolicitud.recepcionFaltantes.notas && (
                  <div className="text-slate-500 italic">
                    &ldquo;{currentSolicitud.recepcionFaltantes.notas}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentSolicitud.reporteDiscrepancias?.discrepancias?.some(d => d.tipo === 'extra') && (
          <div className="p-4 bg-blue-50/70 dark:bg-transparent border-b border-blue-100 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-400">
              <span className="flex items-center gap-1.5">
                <PackagePlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Productos Extra Reportados en Recepción:</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-transparent text-blue-800 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                +{currentSolicitud.reporteDiscrepancias.totalExtras || 0} pzas extra
              </span>
            </div>
            <div className="bg-white/90 dark:bg-slate-900 rounded-2xl p-3 border border-blue-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs shadow-2xs space-y-1.5">
              {currentSolicitud.reporteDiscrepancias.discrepancias
                .filter(d => d.tipo === 'extra')
                .map((ext, i) => (
                  <div key={i} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{ext.descripcion}</span>
                    <span className="font-mono text-xs font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-transparent px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-500/30">
                      +{ext.diferencia} extra (Recibidas: {ext.cantidadRecibida})
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>Productos Despachados ({totalItems})</span>
            <span className="font-mono text-slate-500 dark:text-slate-400">{totalUnits} unidades totales</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
            {currentSolicitud.items?.map((item, index) => {
              const qty = item.cantidadDespachada ?? item.cantidadSolicitada ?? 0;
              return (
                <div key={index} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <MarqueeText
                        text={item.descripcion}
                        className="font-bold text-slate-900 dark:text-slate-100 text-xs block"
                      />
                      {item.esExtra && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-100 dark:bg-transparent text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30">
                          EXTRA
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 block">
                      EAN: {item.codigo}
                    </span>
                    {item.cantidadSolicitada !== undefined && item.cantidadDespachada !== undefined && !item.esExtra && Number(item.cantidadSolicitada) !== Number(item.cantidadDespachada) && (
                      <span className="inline-block text-[10px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-transparent text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded mt-0.5 mr-1">
                        {item.cantidadDespachada} despachadas ({item.cantidadSolicitada} solicitadas)
                      </span>
                    )}
                    {(() => {
                      const aj = !item.esExtra
                        ? currentSolicitud.ajustesDespacho?.find(a =>
                            (a.codigo && item.codigo && String(a.codigo) === String(item.codigo)) ||
                            (a.descripcion && item.descripcion && a.descripcion.toLowerCase() === item.descripcion.toLowerCase())
                          )
                        : null;
                      const rawM = item.motivoAjusteDespacho || item.motivo || item.motivoAjuste || aj?.motivo || aj?.motivoAjusteDespacho;
                      const m = typeof rawM === 'string' ? rawM.trim() : rawM;
                      return m ? (
                        <div className="mt-1 w-fit max-w-full flex items-start gap-1.5 text-[10px] bg-amber-50/90 dark:bg-transparent text-amber-900 dark:text-amber-400 border border-amber-200/80 dark:border-amber-500/30 px-2 py-0.5 rounded-lg">
                          <FileText className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-[2px]" />
                          <span className="italic font-medium text-amber-900 dark:text-amber-400 break-words min-w-0 max-w-full whitespace-pre-line">
                            &ldquo;{m}&rdquo;
                          </span>
                        </div>
                      ) : null;
                    })()}
                    {item.cantidadRecibida !== undefined && (
                      <span className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                        item.cantidadRecibida === qty
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-transparent border border-emerald-200 dark:border-emerald-500/30'
                          : 'text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-transparent border border-amber-200 dark:border-amber-500/30'
                      }`}>
                        Recibidas en caja: {item.cantidadRecibida} pz
                      </span>
                    )}
                    {Boolean(item.observacionRecepcion || item.motivoRecepcion) && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 dark:bg-transparent text-rose-900 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-lg mt-0.5 italic font-medium">
                        <FileText className="w-3 h-3 text-rose-500 shrink-0" />
                        <span>Motivo recepción: &ldquo;{item.observacionRecepcion || item.motivoRecepcion}&rdquo;</span>
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl text-slate-800 dark:text-slate-200">
                      {qty} pzas
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
