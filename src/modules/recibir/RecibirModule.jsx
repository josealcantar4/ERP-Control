import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, Check, PackageOpen, AlertTriangle, Truck, X } from 'lucide-react';
import { transferService, formatTransferFolio } from '../transferencias';
import { useBodyScrollLock } from '../../hooks';

export function RecibirModule({ currentUser, onBack, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.filter(
      s =>
        (s.estado === 'completada' || s.estado === 'faltantes_despachados') &&
        s.usuarioSolicitante === currentUser?.username
    );
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [checkedNewFaltantes, setCheckedNewFaltantes] = useState({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);

  // Bloquear scroll de fondo cuando el modal de reporte de faltantes esté abierto
  useBodyScrollLock(isReportModalOpen);
  const [isLoadingOrders, setIsLoadingOrders] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return (
      list.filter(
        s =>
          (s.estado === 'completada' || s.estado === 'faltantes_despachados') &&
          s.usuarioSolicitante === currentUser?.username
      ).length === 0
    );
  });

  useEffect(() => {
    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      // Mostrar pedidos despachados inicialmente y re-despachos de faltantes
      const validos = list.filter(
        s =>
          (s.estado === 'completada' || s.estado === 'faltantes_despachados') &&
          s.usuarioSolicitante === currentUser.username
      );
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

  const openOrder = (sol) => {
    setSelectedOrder(sol);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setCheckedItems({});
    setCheckedNewFaltantes({});
    if (sol && sol.id) {
      sessionStorage.setItem('erp_recibir_order_id', sol.id);
    } else {
      sessionStorage.removeItem('erp_recibir_order_id');
    }
  };

  const closeOrder = () => {
    setSelectedOrder(null);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    setCheckedItems({});
    setCheckedNewFaltantes({});
    sessionStorage.removeItem('erp_recibir_order_id');
  };

  const toggleItem = (index) => {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleNewFaltante = (index) => {
    setCheckedNewFaltantes(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleListo = () => {
    const isAllChecked = selectedOrder.items?.every((_, i) => checkedItems[i]);

    if (!isAllChecked) {
      setConfirmIncomplete(false);
      setIsReportModalOpen(true);
    } else {
      finalizeReceive([]); // Todo completo, sin faltantes
    }
  };

  const finalizeReceive = async (faltantes) => {
    await transferService.receiveSolicitud(selectedOrder.id, faltantes);
    setIsReportModalOpen(false);
    closeOrder();
  };

  const sendReport = () => {
    const faltantes = selectedOrder.items.filter((_, i) => !checkedItems[i]);
    finalizeReceive(faltantes);
  };

  // Manejo de finalización de recepción para re-despacho de faltantes
  const handleListoFaltantes = async () => {
    const itemsResolucion = selectedOrder.resolucionFaltantes?.itemsResolucion || [];
    const newlyDispatched = itemsResolucion.filter(i => i.despachado);

    const isAllChecked = newlyDispatched.every((_, i) => checkedNewFaltantes[i]);

    if (!isAllChecked) {
      const itemsAunFaltantes = newlyDispatched.filter((_, i) => !checkedNewFaltantes[i]);
      const itemsRecibidos = newlyDispatched.filter((_, i) => checkedNewFaltantes[i]);

      await transferService.receiveFaltantes(selectedOrder.id, {
        itemsRecibidos,
        itemsAunFaltantes,
        usuarioRecepcion: currentUser?.username || 'sucursal'
      });
    } else {
      await transferService.receiveFaltantes(selectedOrder.id, {
        itemsRecibidos: newlyDispatched,
        itemsAunFaltantes: [],
        usuarioRecepcion: currentUser?.username || 'sucursal'
      });
    }
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
                    className={`bg-white rounded-3xl p-5 border shadow-sm flex items-center justify-between gap-3 hover:shadow-md transition-all cursor-pointer group ios-card-hover ${
                      isFaltante ? 'border-purple-200 hover:border-purple-400' : 'border-slate-200/80 hover:border-indigo-400'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-lg font-bold font-mono tracking-tight ${
                          isFaltante ? 'text-purple-700' : 'text-indigo-700'
                        }`}>
                          {sol.resolucionFaltantes?.folioEnvio || sol.folio || formatTransferFolio(sol)}
                        </h4>
                        {isFaltante && (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase tracking-wider">
                            Reenvío de Faltantes
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {isFaltante
                          ? 'Matriz envió los productos faltantes reportados'
                          : `Enviado por: ${sol.usuarioDestino}`}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400">
                        {isFaltante
                          ? `${sol.resolucionFaltantes?.itemsResolucion?.filter(i => i.despachado).length || 0} ítems en este reenvío`
                          : `${sol.items?.length || 0} productos en total`}
                      </p>
                    </div>
                    <button
                      onClick={() => openOrder(sol)}
                      className={`px-4 py-2.5 text-white font-bold text-xs rounded-2xl shadow-sm cursor-pointer transition-all active:scale-95 ${
                        isFaltante ? 'bg-purple-600 hover:bg-purple-500' : 'bg-indigo-600 hover:bg-indigo-500'
                      }`}
                    >
                      {isFaltante ? 'Revisar Faltantes' : 'Revisar Caja'}
                    </button>
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
          </div>

          {/* Listado Diferenciado: Lo nuevo para checar + lo pasado inmutable */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {/* 1. SECCIÓN: LO NUEVO MANDADO PARA VOLVER A CHECAR */}
            {selectedOrder.resolucionFaltantes?.itemsResolucion
              ?.filter(i => i.despachado)
              .map((item, idx) => (
                <div
                  key={'new-' + idx}
                  onClick={() => toggleNewFaltante(idx)}
                  className={`p-4 flex items-center gap-3.5 cursor-pointer transition-all duration-200 active:scale-[0.99] border-l-4 border-l-purple-500 ${
                    checkedNewFaltantes[idx] ? 'bg-purple-50/40' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      checkedNewFaltantes[idx]
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
                          checkedNewFaltantes[idx] ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {item.descripcion}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-700 uppercase tracking-wider">
                        Nuevo Envío
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Código: {item.codigo}
                    </span>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold bg-purple-100 text-purple-800">
                    {item.cantidadDespachada} pzas
                  </span>
                </div>
              ))}

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
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Recepción de Caja Física</span>
            <h2 className="text-xl font-extrabold text-slate-900 font-mono">{selectedOrder.folio || formatTransferFolio(selectedOrder)}</h2>
            <p className="text-xs text-slate-500">Toca el producto tras verificar que viene dentro de la caja.</p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {selectedOrder.items?.map((item, index) => (
              <div key={index} onClick={() => toggleItem(index)} className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 active:scale-[0.99] ${checkedItems[index] ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${checkedItems[index] ? 'bg-indigo-500 text-white scale-105' : 'border-2 border-slate-300'}`}>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={`text-sm font-bold transition-colors ${checkedItems[index] ? 'line-through text-slate-400' : 'text-slate-900'}`}>{item.descripcion}</h4>
                  <span className="text-[11px] font-mono text-slate-400">{item.codigo}</span>
                </div>
                <span className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold bg-slate-100 text-slate-800">{item.cantidadDespachada} pzas</span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <button onClick={handleListo} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer">
              <PackageOpen className="w-5 h-5" /><span>Listo, Terminar Revisión</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL INLINE: REPORTE DE FALTANTES */}
      {isReportModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in overflow-y-auto overscroll-contain">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5 animate-scale-in my-auto max-h-[90vh] overflow-y-auto overscroll-contain">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Aviso: Revisión Incompleta</h3>
                <p className="text-xs text-slate-500 mt-1">No has seleccionado todos los elementos. Faltan productos físicos en la caja.</p>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-2xl cursor-pointer">
              <input type="checkbox" checked={confirmIncomplete} onChange={(e) => setConfirmIncomplete(e.target.checked)} className="mt-0.5 w-4 h-4 text-red-600 rounded" />
              <span className="text-xs font-bold text-red-900">No he recibido el pedido completo y quiero reportar faltantes a Matriz.</span>
            </label>

            {confirmIncomplete && (
              <div className="max-h-40 overflow-y-auto border-t border-slate-100 pt-3 text-xs">
                <span className="font-bold text-slate-700 block mb-2">Se reportará lo siguiente:</span>
                <ul className="space-y-1 text-slate-600">
                  {selectedOrder.items.filter((_, i) => !checkedItems[i]).map((it, idx) => (
                    <li key={idx} className="flex justify-between border-b border-slate-50 pb-1">
                      <span className="truncate">{it.descripcion}</span>
                      <strong className="font-mono">{it.cantidadDespachada}pz</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 flex gap-2 justify-end">
              <button onClick={() => setIsReportModalOpen(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-2xl cursor-pointer transition-colors hover:bg-slate-200">Cancelar</button>
              <button disabled={!confirmIncomplete} onClick={sendReport} className={`px-4 py-2.5 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer ${confirmIncomplete ? 'bg-red-600 hover:bg-red-500' : 'bg-red-300'}`}>Enviar Reporte</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
