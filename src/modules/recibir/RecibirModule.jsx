import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, Check, PackageOpen, AlertTriangle, Truck, X, RotateCcw, FileText, ChevronRight } from 'lucide-react';
import { transferService, formatTransferFolio, canUserReceive, playCheckSound } from '../transferencias';
import { transitionView, QuantityStepper, DiscrepancySummaryModal } from '../../shared';

export function RecibirModule({ currentUser, onBack, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.filter(s => canUserReceive(s, currentUser));
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [receivedQuantities, setReceivedQuantities] = useState({});
  const [checkedNewFaltantes, setCheckedNewFaltantes] = useState({});
  const [newFaltantesQuantities, setNewFaltantesQuantities] = useState({});
  
  // Estado para el modal de resumen de discrepancias
  const [isDiscrepancyModalOpen, setIsDiscrepancyModalOpen] = useState(false);
  const [discrepanciesToReport, setDiscrepanciesToReport] = useState([]);

  const [isLoadingOrders, setIsLoadingOrders] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.length === 0;
  });

  useEffect(() => {
    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      // Mostrar pedidos despachados inicialmente y re-despachos de faltantes según sede y área receptora
      const validos = list.filter((s) => canUserReceive(s, currentUser));
      setSolicitudes(validos);
      setIsLoadingOrders(false);

      const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
      const targetId = selectedOrder?.id || savedOrderId;
      if (targetId) {
        const found = validos.find(s => s.id === targetId);
        if (found) {
          setSelectedOrder(found);
        } else if (!validos.some(s => s.id === targetId)) {
          sessionStorage.removeItem('erp_recibir_order_id');
        }
      }
    });
    return () => unsubscribe();
  }, [currentUser, selectedOrder?.id]);

  // Listener para apertura inmediata reactiva al presionar notificaciones sin esperar remount
  useEffect(() => {
    const handleOpenEvent = (e) => {
      const detail = e.detail;
      if (detail && detail.screen === 'recibir' && detail.orderId) {
        const all = (solicitudes && solicitudes.length > 0)
          ? solicitudes
          : (transferService.getLocalSolicitudes() || []).filter(s => canUserReceive(s, currentUser));
        const found = all.find(s => s.id === detail.orderId);
        if (found) {
          openOrder(found);
          transferService.dismissNotification(`tr-falt-env-${found.id}`);
          transferService.dismissNotification(`tr-comp-${found.id}`);
        }
      }
    };
    window.addEventListener('erp_open_solicitud', handleOpenEvent);
    return () => window.removeEventListener('erp_open_solicitud', handleOpenEvent);
  }, [solicitudes, currentUser]);

  const openOrder = (sol) => {
    transitionView(() => {
      setSelectedOrder(sol);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      setCheckedItems({});
      setReceivedQuantities({});
      setCheckedNewFaltantes({});
      setNewFaltantesQuantities({});
      if (sol && sol.id) {
        sessionStorage.setItem('erp_recibir_order_id', sol.id);
      } else {
        sessionStorage.removeItem('erp_recibir_order_id');
      }
    }, { direction: 'forward' });
  };

  const closeOrder = () => {
    transitionView(() => {
      setSelectedOrder(null);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      setCheckedItems({});
      setReceivedQuantities({});
      setCheckedNewFaltantes({});
      setNewFaltantesQuantities({});
      sessionStorage.removeItem('erp_recibir_order_id');
    }, { direction: 'back' });
  };

  const getExpectedQty = (item) => Number(item?.cantidadDespachada ?? item?.cantidadSolicitada ?? 1);
  const getReceivedQty = (index, item) => {
    return receivedQuantities[index] !== undefined ? receivedQuantities[index] : getExpectedQty(item);
  };

  // Ajuste de cantidades con stepper [ - ] / [ + ] / [ 🗑️ ]
  const handleQuantityChange = (index, newQty) => {
    const item = selectedOrder?.items?.[index];
    if (!item) return;
    if (!checkedItems[index]) {
      playCheckSound();
    }
    setReceivedQuantities(prev => ({ ...prev, [index]: newQty }));
    setCheckedItems(prev => ({ ...prev, [index]: true }));
  };

  // Toque sobre la fila: Si el producto tiene discrepancia se bloquea para selección normal; si no, toggle
  const handleRowClick = (index) => {
    const item = selectedOrder?.items?.[index];
    if (!item) return;
    const expected = getExpectedQty(item);
    const current = getReceivedQty(index, item);
    const hasDiscrepancy = current !== expected;

    // Si tiene discrepancia, se mantiene bloqueado en modo revisado con discrepancia
    if (hasDiscrepancy) {
      return;
    }

    setCheckedItems(prev => {
      const willBeChecked = !prev[index];
      if (willBeChecked) {
        playCheckSound();
        setReceivedQuantities(q => ({ ...q, [index]: expected }));
      }
      return { ...prev, [index]: willBeChecked };
    });
  };

  // Re-despacho de faltantes
  const getExpectedNewFaltanteQty = (item) => Number(item?.cantidadDespachada || item?.cantidadFaltanteReportada || 1);
  const getReceivedNewFaltanteQty = (idx, item) => {
    return newFaltantesQuantities[idx] !== undefined ? newFaltantesQuantities[idx] : getExpectedNewFaltanteQty(item);
  };

  const handleNewFaltanteQtyChange = (idx, newQty) => {
    if (!checkedNewFaltantes[idx]) {
      playCheckSound();
    }
    setNewFaltantesQuantities(prev => ({ ...prev, [idx]: newQty }));
    setCheckedNewFaltantes(prev => ({ ...prev, [idx]: true }));
  };

  const handleNewFaltanteRowClick = (idx) => {
    const item = selectedOrder?.resolucionFaltantes?.itemsResolucion?.filter(i => i.despachado)?.[idx];
    if (!item) return;
    const expected = getExpectedNewFaltanteQty(item);
    const current = getReceivedNewFaltanteQty(idx, item);
    if (current !== expected) return;

    setCheckedNewFaltantes(prev => {
      const willBeChecked = !prev[idx];
      if (willBeChecked) {
        playCheckSound();
        setNewFaltantesQuantities(q => ({ ...q, [idx]: expected }));
      }
      return { ...prev, [idx]: willBeChecked };
    });
  };

  // Validación final al presionar "Listo, Terminar Revisión"
  const handleListo = () => {
    if (!selectedOrder?.items) return;

    const discrepancies = [];
    selectedOrder.items.forEach((item, index) => {
      const expected = getExpectedQty(item);
      const isChecked = checkedItems[index];
      // Si el ítem no fue revisado por el usuario, se toma como 0 (ausencia total)
      const received = isChecked ? getReceivedQty(index, item) : 0;
      const diff = received - expected;

      if (diff !== 0) {
        discrepancies.push({
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidadEsperada: expected,
          cantidadRecibida: received,
          diferencia: diff,
          tipo: received === 0 ? 'ausencia_total' : (diff < 0 ? 'faltante' : 'extra')
        });
      }
    });

    if (discrepancies.length > 0) {
      setDiscrepanciesToReport(discrepancies);
      setIsDiscrepancyModalOpen(true);
    } else {
      finalizeReceive([]); // Todo completo, sin discrepancias
    }
  };

  const finalizeReceive = async (faltantes = []) => {
    await transferService.receiveSolicitud(selectedOrder.id, faltantes);
    setIsDiscrepancyModalOpen(false);
    closeOrder();
  };

  const handleConfirmDiscrepancies = async (summaryData) => {
    await transferService.receiveWithDiscrepancies(selectedOrder.id, {
      discrepancias: summaryData.discrepancias,
      observaciones: summaryData.observaciones,
      usuarioReceptor: currentUser?.username || 'sucursal',
      itemsActualizados: selectedOrder.items.map((it, idx) => ({
        ...it,
        cantidadRecibida: getReceivedQty(idx, it),
        cantidadEsperada: getExpectedQty(it)
      }))
    });
    setIsDiscrepancyModalOpen(false);
    closeOrder();
  };

  // Manejo de finalización de recepción para re-despacho de faltantes
  const handleListoFaltantes = async () => {
    const itemsResolucion = selectedOrder.resolucionFaltantes?.itemsResolucion || [];
    const newlyDispatched = itemsResolucion.filter(i => i.despachado);

    const itemsRecibidos = [];
    const itemsAunFaltantes = [];

    newlyDispatched.forEach((item, idx) => {
      const isChecked = checkedNewFaltantes[idx];
      const dispatchedQty = getExpectedNewFaltanteQty(item);
      const receivedQty = isChecked ? getReceivedNewFaltanteQty(idx, item) : 0;

      if (receivedQty > 0) {
        itemsRecibidos.push({
          ...item,
          cantidadRecibida: receivedQty
        });
      }

      if (receivedQty < dispatchedQty) {
        itemsAunFaltantes.push({
          ...item,
          cantidadAunFaltante: dispatchedQty - receivedQty
        });
      }
    });

    await transferService.receiveFaltantes(selectedOrder.id, {
      itemsRecibidos,
      itemsAunFaltantes,
      usuarioRecepcion: currentUser?.username || 'sucursal'
    });
    closeOrder();
  };

  const isReDespacho = selectedOrder?.estado === 'faltantes_despachados';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 select-none">
      <div className="flex items-center justify-between">
        <button
          onClick={() => selectedOrder ? closeOrder() : onBack()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{selectedOrder ? 'Volver a Entrantes' : 'Volver al Inicio'}</span>
        </button>
      </div>

      {!selectedOrder ? (
        <div key="entrantes-list" className="space-y-4 animate-fade-in">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">
            Transferencias Entrantes ({solicitudes.length})
          </h3>

          {isLoadingOrders ? (
            <div className="grid grid-cols-1 gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3 animate-pulse">
                  <div className="h-5 bg-slate-200 rounded-xl w-1/3"></div>
                  <div className="h-4 bg-slate-100 rounded-xl w-1/2"></div>
                </div>
              ))}
            </div>
          ) : solicitudes.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
              <p className="text-sm font-semibold text-slate-700">Sin pedidos entrantes</p>
              <p className="text-xs text-slate-400">Los envíos completados por Matriz aparecerán aquí.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {solicitudes.map(sol => {
                const isFaltante = sol.estado === 'faltantes_despachados';
                return (
                  <div
                    key={sol.id}
                    onClick={() => openOrder(sol)}
                    className={`bg-white rounded-3xl p-5 border shadow-sm flex items-center justify-between gap-3 hover:shadow-md transition-all cursor-pointer group ios-card-hover active:scale-[0.99] ${
                      isFaltante ? 'border-purple-200 hover:border-purple-400' : 'border-slate-200/80 hover:border-indigo-400'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-lg font-bold font-mono tracking-tight ${
                          isFaltante ? 'text-purple-700' : 'text-indigo-700'
                        }`}>
                          {sol.resolucionFaltantes?.folioEnvio || sol.folio || formatTransferFolio(sol)}
                        </h4>
                        {Boolean(sol.esTransferenciaInterna || (sol.sucursalOrigen && sol.sucursalOrigen === sol.sucursalDestino)) && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Transferencia Interna
                          </span>
                        )}
                        {isFaltante && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase tracking-wider">
                            Reenvío de Faltantes
                          </span>
                        )}
                        {(sol.sinSolicitud || sol.esDespachoDirecto) && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider">
                            Sin Solicitud
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {isFaltante
                          ? 'Faltantes despachados en camino'
                          : `Enviado por: ${sol.sucursalDestino || sol.usuarioDestino || 'Bodega'}${sol.areaDestino ? ` (${sol.areaDestino})` : ''}`}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400">
                        {isFaltante
                          ? `${sol.resolucionFaltantes?.itemsResolucion?.filter(i => i.despachado).length || 0} ítems en este reenvío`
                          : `${sol.items?.length || 0} productos en total`}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span
                        className={`hidden sm:inline-flex px-4 py-2.5 text-white font-bold text-xs rounded-2xl shadow-sm transition-all group-hover:shadow-md ${
                          isFaltante ? 'bg-purple-600 group-hover:bg-purple-500' : 'bg-indigo-600 group-hover:bg-indigo-500'
                        }`}
                      >
                        {isFaltante ? 'Revisar Faltantes' : 'Revisar Caja'}
                      </span>
                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${
                          isFaltante
                            ? 'bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white'
                            : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
                        }`}
                      >
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : isReDespacho ? (
        /* VISTA DE RECEPCIÓN PARA RE-DESPACHO DE FALTANTES */
        <div key={selectedOrder.id} className="space-y-4 animate-fade-in">
          {/* Header Card Re-despacho */}
          <div className="bg-white rounded-3xl p-5 border border-purple-200/80 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-4 h-4" />
                Recepción de Faltantes Despachados
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-mono">
                Reenvío Activo
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 font-mono">
              {selectedOrder.resolucionFaltantes?.folioEnvio || selectedOrder.folio || formatTransferFolio(selectedOrder)}
            </h2>
            <p className="text-xs text-slate-500">
              Verifica los productos nuevos enviados en esta caja. Lo recibido en la entrega anterior se mantiene conservado y bloqueado.
            </p>

            {/* OBSERVACIÓN / CITA DE BODEGA AL ATENDER FALTANTES */}
            {(selectedOrder.resolucionFaltantes?.notas || selectedOrder.observaciones) && (
              <div className="p-3 bg-purple-50/90 rounded-2xl border border-purple-200 text-xs flex items-center justify-between gap-2.5 text-purple-950 mt-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                  <p className="text-purple-900 font-medium italic text-xs leading-snug">
                    "{selectedOrder.resolucionFaltantes?.notas || selectedOrder.observaciones}"
                  </p>
                </div>
                {selectedOrder.resolucionFaltantes?.usuarioResolucion && (
                  <span className="text-[10px] font-semibold text-purple-700 bg-white/80 px-2.5 py-0.5 rounded-full border border-purple-200 shadow-2xs shrink-0">
                    Atendido por: <strong>{selectedOrder.resolucionFaltantes.usuarioResolucion}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Listado Diferenciado: Lo nuevo para checar + lo pasado inmutable */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {/* 1. SECCIÓN: LO NUEVO MANDADO PARA VOLVER A CHECAR */}
            {selectedOrder.resolucionFaltantes?.itemsResolucion
              ?.filter(i => i.despachado)
              .map((item, idx) => {
                const expected = getExpectedNewFaltanteQty(item);
                const isChecked = Boolean(checkedNewFaltantes[idx]);
                const current = getReceivedNewFaltanteQty(idx, item);
                const diff = current - expected;
                const hasDiscrepancy = isChecked && diff !== 0;

                const originalItem = selectedOrder.items?.find(it => it.codigo === item.codigo);
                const requestedQty = Number(
                  originalItem?.cantidadSolicitada ??
                  item.cantidadFaltanteReportada ??
                  item.cantidadSolicitada ??
                  expected
                );
                const wasPartial = Boolean(requestedQty > expected);
                const itemMotivo = item.motivo || item.motivoParcial || item.motivoNoDespacho || (wasPartial ? selectedOrder.resolucionFaltantes?.notas : null);

                return (
                  <div
                    key={'new-' + idx}
                    onClick={() => handleNewFaltanteRowClick(idx)}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all duration-200 border-l-4 ${
                      hasDiscrepancy
                        ? 'bg-amber-50/40 border-l-amber-500'
                        : isChecked
                        ? 'bg-purple-50/40 border-l-purple-500'
                        : 'bg-white hover:bg-slate-50 border-l-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                          isChecked
                            ? 'bg-purple-600 text-white scale-105 shadow-2xs'
                            : 'border-2 border-purple-300'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`text-sm font-bold transition-colors ${
                              isChecked && !hasDiscrepancy ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {item.descripcion}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-700 uppercase tracking-wider">
                            Nuevo Envío
                          </span>
                          {wasPartial && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800 uppercase tracking-wider border border-amber-200">
                              Envío Parcial
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5 flex-wrap">
                          <span>Código: {item.codigo}</span>
                          <span>•</span>
                          <span>
                            Esperadas: <strong className="text-slate-700">{expected} pz</strong>{' '}
                            <span className="text-slate-500 font-semibold">
                              ({requestedQty} pz solicitadas)
                            </span>
                          </span>
                        </div>

                        {/* Cita del Despachador para este producto */}
                        {itemMotivo && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-purple-950 bg-purple-50/90 px-2.5 py-1 rounded-xl border border-purple-200/80">
                            <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span className="italic font-medium text-purple-900">"{itemMotivo}"</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <QuantityStepper
                        value={current}
                        min={0}
                        onChange={(newQty) => handleNewFaltanteQtyChange(idx, newQty)}
                        onDelete={() => handleNewFaltanteQtyChange(idx, 0)}
                      />
                    </div>
                  </div>
                );
              })}

            {/* 2. SECCIÓN: FALTANTES QUE NO FUERON DESPACHADOS POR BODEGA (BLOQUEADOS) */}
            {selectedOrder.resolucionFaltantes?.itemsResolucion
              ?.filter(i => !i.despachado)
              .map((item, idx) => (
                <div
                  key={'not-sent-' + idx}
                  className="p-4 flex items-center gap-3.5 bg-red-50/30 border-l-4 border-l-red-300 opacity-75 select-none"
                >
                  <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <X className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium text-slate-700 truncate">{item.descripcion}</h4>
                    <span className="text-[11px] font-mono text-slate-400">Código: {item.codigo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                      No enviado por Bodega ({item.motivoNoDespacho || 'Sin existencia'})
                    </span>
                    <span className="px-2.5 py-1 rounded-xl font-mono text-xs font-bold bg-red-50 text-red-800">
                      {item.cantidadFaltanteReportada} pz
                    </span>
                  </div>
                </div>
              ))}

            {/* 3. SECCIÓN: LO PASADO (YA RECIBIDO EN LA ENTREGA ANTERIOR, INMUTABLE) */}
            {selectedOrder.items
              ?.filter(it => !selectedOrder.reporteFaltantes?.some(rf => rf.codigo === it.codigo))
              .map((item, idx) => (
                <div
                  key={'prev-' + idx}
                  className="p-4 flex items-center gap-3.5 bg-slate-50/60 opacity-60 select-none"
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-slate-500 line-through truncate">{item.descripcion}</h4>
                    <span className="text-[11px] font-mono text-slate-400">{item.codigo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Recibido anteriormente
                    </span>
                    <span className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold bg-slate-200/80 text-slate-600">
                      {item.cantidadDespachada} pzas
                    </span>
                  </div>
                </div>
              ))}
          </div>

          <div className="pt-2">
            <button
              onClick={handleListoFaltantes}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <PackageOpen className="w-5 h-5" />
              <span>Listo, Finalizar Recepción de Faltantes</span>
            </button>
          </div>
        </div>
      ) : (
        /* VISTA DE RECEPCIÓN ESTÁNDAR */
        <div key={selectedOrder.id} className="space-y-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Recepción de Caja Física</span>
              {(selectedOrder.sinSolicitud || selectedOrder.esDespachoDirecto) && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  Despacho sin Solicitud
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 font-mono">{selectedOrder.folio || formatTransferFolio(selectedOrder)}</h2>
            <p className="text-xs text-slate-500">
              Toca el producto para marcarlo conforme, o ajusta las cantidades recibidas con los botones [ - ] y [ + ].
            </p>
            {selectedOrder.observaciones && (
              <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 text-xs flex items-start gap-2 text-amber-900 mt-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Observación del Despacho:</span>
                  <p className="text-amber-800 font-medium">{selectedOrder.observaciones}</p>
                </div>
              </div>
            )}
          </div>

          {/* LISTA DE PRODUCTOS CON STEPPER DE AJUSTE */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {selectedOrder.items?.map((item, index) => {
              const expected = getExpectedQty(item);
              const isChecked = Boolean(checkedItems[index]);
              const current = getReceivedQty(index, item);
              const diff = current - expected;
              const hasDiscrepancy = isChecked && diff !== 0;
              const isAbsent = isChecked && current === 0;
              const isMissing = isChecked && diff < 0 && current > 0;
              const isExtra = isChecked && diff > 0;

              const cantSolicitada = item.cantidadSolicitada !== undefined && item.cantidadSolicitada !== null
                ? Number(item.cantidadSolicitada)
                : null;
              const cantDespachada = item.cantidadDespachada !== undefined && item.cantidadDespachada !== null
                ? Number(item.cantidadDespachada)
                : expected;
              const hasDiffSolicitadoDespachado = Boolean(
                cantSolicitada !== null &&
                !item.esExtra &&
                cantSolicitada !== cantDespachada
              );

              return (
                <div
                  key={index}
                  onClick={() => handleRowClick(index)}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all duration-200 border-l-4 ${
                    hasDiscrepancy
                      ? isAbsent
                        ? 'bg-red-50/50 border-l-red-500 cursor-default'
                        : isMissing
                        ? 'bg-amber-50/50 border-l-amber-500 cursor-default'
                        : 'bg-blue-50/50 border-l-blue-500 cursor-default'
                      : isChecked
                      ? 'bg-indigo-50/30 border-l-indigo-500 cursor-pointer active:scale-[0.995]'
                      : 'bg-white hover:bg-slate-50 border-l-transparent cursor-pointer active:scale-[0.995]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Indicador de Estado / Check */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        isAbsent
                          ? 'bg-red-600 text-white shadow-2xs'
                          : isMissing
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : isExtra
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : isChecked
                          ? 'bg-indigo-600 text-white scale-105 shadow-2xs'
                          : 'border-2 border-slate-300'
                      }`}
                    >
                      {isAbsent ? (
                        <X className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      )}
                    </div>

                    {/* Información del Producto */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4
                          className={`text-sm font-bold transition-colors ${
                            isChecked && !hasDiscrepancy
                              ? 'line-through text-slate-400 font-semibold'
                              : 'text-slate-900'
                          }`}
                        >
                          {item.descripcion}
                        </h4>

                        {item.esExtra && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wider">
                            Extra ({cantDespachada} pz)
                          </span>
                        )}

                        {/* Etiqueta solo si no coinciden solicitadas vs despachadas */}
                        {hasDiffSolicitadoDespachado && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${
                            cantDespachada < cantSolicitada
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-blue-100 text-blue-800 border-blue-200'
                          }`}>
                            {cantDespachada} despachadas ({cantSolicitada} solicitadas)
                          </span>
                        )}

                        {/* Badges de Estado / Discrepancia en recepción */}
                        {isAbsent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200 uppercase tracking-wider">
                            Ausencia Total (0 pz)
                          </span>
                        )}
                        {isMissing && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
                            Faltan {Math.abs(diff)} pz
                          </span>
                        )}
                        {isExtra && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                            +{diff} pz Extra
                          </span>
                        )}
                        {isChecked && !hasDiscrepancy && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Conforme
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5 flex-wrap">
                        <span>Código: {item.codigo}</span>
                        <span>•</span>
                        <span>
                          Esperadas: <strong className="text-slate-700">{expected} pzas</strong>{' '}
                          {hasDiffSolicitadoDespachado && (
                            <span className="text-slate-500 font-semibold">
                              ({cantSolicitada} pz solicitadas)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Cita/justificación del despacho si existe */}
                      {item.motivoAjusteDespacho && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-950 bg-amber-50/90 px-2.5 py-1 rounded-xl border border-amber-200/80">
                          <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="italic font-medium text-amber-900">"{item.motivoAjusteDespacho}"</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stepper de Ajuste Numérico */}
                  <div className="shrink-0 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                    <QuantityStepper
                      value={current}
                      min={0}
                      onChange={(newQty) => handleQuantityChange(index, newQty)}
                      onDelete={() => handleQuantityChange(index, 0)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2">
            <button
              onClick={handleListo}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <PackageOpen className="w-5 h-5" />
              <span>Listo, Terminar Revisión</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE RESUMEN DE DISCREPANCIAS */}
      <DiscrepancySummaryModal
        isOpen={isDiscrepancyModalOpen}
        onClose={() => setIsDiscrepancyModalOpen(false)}
        onConfirm={handleConfirmDiscrepancies}
        solicitud={selectedOrder}
        discrepancias={discrepanciesToReport}
        usuarioReceptor={currentUser?.username}
      />
    </div>
  );
}
