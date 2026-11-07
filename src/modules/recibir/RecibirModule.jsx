import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, Check, PackageOpen, AlertTriangle, Truck, X, RotateCcw, FileText, ChevronRight } from 'lucide-react';
import { transferService, formatTransferFolio, canUserReceive, playCheckSound } from '../transferencias';
import { transitionView, QuantityStepper, DiscrepancySummaryModal } from '../../shared';

export function getDispatchedQty(item) {
  if (!item) return 0;
  // 1. Si bodega registró cantidadDespachada explícita (incluso 0 si hubo faltante total en bodega)
  if (item.cantidadDespachada !== undefined && item.cantidadDespachada !== null) {
    const desp = Number(item.cantidadDespachada);
    if (!isNaN(desp) && desp >= 0) return desp;
  }

  // 2. Si es despacho directo o sin solicitud previa con 'cantidad'
  if (item.cantidad !== undefined && item.cantidad !== null) {
    const cant = Number(item.cantidad);
    if (!isNaN(cant) && cant >= 0) return cant;
  }

  // 3. Fallback a cantidadSolicitada
  if (item.cantidadSolicitada !== undefined && item.cantidadSolicitada !== null) {
    const sol = Number(item.cantidadSolicitada);
    if (!isNaN(sol) && sol >= 0) return sol;
  }

  // 4. Fallback a cantidadEsperada
  if (item.cantidadEsperada !== undefined && item.cantidadEsperada !== null) {
    const esp = Number(item.cantidadEsperada);
    if (!isNaN(esp) && esp >= 0) return esp;
  }

  return 0;
}

export const getExpectedQty = getDispatchedQty;

export function getExpectedNewFaltanteQty(item, order = null) {
  if (!item) return 0;
  if (item.cantidadDespachada !== undefined && item.cantidadDespachada !== null) {
    const desp = Number(item.cantidadDespachada);
    if (!isNaN(desp) && desp >= 0) return desp;
  }
  const reporteItem = order?.reporteFaltantes?.find(rf => rf.codigo === item.codigo);
  const cantFaltante = Number(
    reporteItem?.cantidadFaltante ??
    item.cantidadFaltanteReportada ??
    item.cantidadEsperada ??
    0
  );
  return cantFaltante >= 0 ? cantFaltante : 0;
}

function getProgressFromOrder(order) {
  if (!order) return { checked: {}, quantities: {}, checkedFaltantes: {}, faltantesQtys: {}, observations: {}, faltanteObservations: {} };
  const prog = order.recepcionProgreso || {};
  const checked = { ...(prog.checkedItems || {}) };
  const quantities = { ...(prog.receivedQuantities || {}) };
  const checkedFaltantes = { ...(prog.checkedNewFaltantes || {}) };
  const faltantesQtys = { ...(prog.newFaltantesQuantities || {}) };
  const observations = { ...(prog.itemObservations || {}) };
  const faltanteObservations = { ...(prog.newFaltanteObservations || {}) };

  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item, idx) => {
      const dispatched = getDispatchedQty(item);
      if (checked[idx] === undefined && item.recibido !== undefined) {
        checked[idx] = Boolean(item.recibido);
      }
      if (observations[idx] === undefined && item.observacionRecepcion) {
        observations[idx] = item.observacionRecepcion;
      }
      if (quantities[idx] === undefined || !checked[idx]) {
        const itemRec = Number(item.cantidadRecibida);
        if (!isNaN(itemRec) && itemRec >= 0 && item.recibido) {
          quantities[idx] = itemRec;
        } else {
          // Inicializar siempre al número de piezas despachadas por bodega
          quantities[idx] = dispatched;
        }
      }
    });
  }

  if (order.resolucionFaltantes?.itemsResolucion && Array.isArray(order.resolucionFaltantes.itemsResolucion)) {
    order.resolucionFaltantes.itemsResolucion.filter(i => i.despachado).forEach((item, idx) => {
      const dispatched = getExpectedNewFaltanteQty(item, order);
      if (checkedFaltantes[idx] === undefined && item.recibido !== undefined) {
        checkedFaltantes[idx] = Boolean(item.recibido);
      }
      if (faltantesQtys[idx] === undefined || !checkedFaltantes[idx]) {
        const itemRec = Number(item.cantidadRecibida);
        if (!isNaN(itemRec) && itemRec >= 0 && item.recibido) {
          faltantesQtys[idx] = itemRec;
        } else {
          // Inicializar siempre al número de piezas despachadas por bodega
          faltantesQtys[idx] = dispatched;
        }
      }
      const qty = faltantesQtys[idx] !== undefined ? faltantesQtys[idx] : dispatched;
      // Solo preservar observación de reenvío si realmente hay faltante y no precargar motivos de reportes anteriores
      if (qty < dispatched) {
        if (faltanteObservations[idx] === undefined && item.observacionRecepcionReenvio) {
          faltanteObservations[idx] = item.observacionRecepcionReenvio;
        }
      } else {
        delete faltanteObservations[idx];
      }
    });
  }

  return { checked, quantities, checkedFaltantes, faltantesQtys, observations, faltanteObservations };
}

export function RecibirModule({ currentUser, onBack, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.filter(s => canUserReceive(s, currentUser));
  });

  const [selectedOrder, setSelectedOrder] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return null;
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    return validos.find(s => s.id === savedOrderId) || null;
  });

  const [checkedItems, setCheckedItems] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return {};
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    const found = validos.find(s => s.id === savedOrderId);
    return getProgressFromOrder(found).checked;
  });

  const [receivedQuantities, setReceivedQuantities] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return {};
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    const found = validos.find(s => s.id === savedOrderId);
    return getProgressFromOrder(found).quantities;
  });

  const [checkedNewFaltantes, setCheckedNewFaltantes] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return {};
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    const found = validos.find(s => s.id === savedOrderId);
    return getProgressFromOrder(found).checkedFaltantes;
  });

  const [newFaltantesQuantities, setNewFaltantesQuantities] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return {};
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    const found = validos.find(s => s.id === savedOrderId);
    return getProgressFromOrder(found).faltantesQtys;
  });

  const [itemObservations, setItemObservations] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return {};
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    const found = validos.find(s => s.id === savedOrderId);
    return getProgressFromOrder(found).observations || {};
  });

  const [newFaltanteObservations, setNewFaltanteObservations] = useState(() => {
    const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
    if (!savedOrderId) return {};
    const list = transferService.getLocalSolicitudes() || [];
    const validos = list.filter(s => canUserReceive(s, currentUser));
    const found = validos.find(s => s.id === savedOrderId);
    return getProgressFromOrder(found).faltanteObservations || {};
  });

  const [activeObservationIndex, setActiveObservationIndex] = useState(null);
  const [activeFaltanteObservationIndex, setActiveFaltanteObservationIndex] = useState(null);
  
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
          // Si el estado local aún no tenía progreso cargado, sincronizarlo
          const prog = getProgressFromOrder(found);
          setCheckedItems(prev => (Object.keys(prev).length > 0 ? prev : prog.checked));
          setReceivedQuantities(prev => (Object.keys(prev).length > 0 ? prev : prog.quantities));
          setCheckedNewFaltantes(prev => (Object.keys(prev).length > 0 ? prev : prog.checkedFaltantes));
          setNewFaltantesQuantities(prev => (Object.keys(prev).length > 0 ? prev : prog.faltantesQtys));
          setItemObservations(prev => (Object.keys(prev).length > 0 ? prev : (prog.observations || {})));
          setNewFaltanteObservations(prev => (Object.keys(prev).length > 0 ? prev : (prog.faltanteObservations || {})));
        } else if (!validos.some(s => s.id === targetId)) {
          sessionStorage.removeItem('erp_recibir_order_id');
          setSelectedOrder(null);
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
      const prog = getProgressFromOrder(sol);
      setCheckedItems(prog.checked);
      setReceivedQuantities(prog.quantities);
      setCheckedNewFaltantes(prog.checkedFaltantes);
      setNewFaltantesQuantities(prog.faltantesQtys);
      setItemObservations(prog.observations || {});
      setNewFaltanteObservations(prog.faltanteObservations || {});
      setActiveObservationIndex(null);
      setActiveFaltanteObservationIndex(null);
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
      setItemObservations({});
      setNewFaltanteObservations({});
      setActiveObservationIndex(null);
      setActiveFaltanteObservationIndex(null);
      sessionStorage.removeItem('erp_recibir_order_id');
    }, { direction: 'back' });
  };

  const getReceivedQty = (index, item) => {
    const dispatched = getDispatchedQty(item);
    const val = receivedQuantities[index];
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return Number(val);
    }
    const itemRec = Number(item?.cantidadRecibida);
    if (!isNaN(itemRec) && itemRec >= 0 && item?.recibido) {
      return itemRec;
    }
    return dispatched;
  };

  // Ajuste de cantidades con stepper [ - ] / [ + ] / [ 🗑️ ]
  const handleQuantityChange = async (index, newQty) => {
    const item = selectedOrder?.items?.[index];
    if (!item) return;
    if (!checkedItems[index]) {
      playCheckSound();
    }
    const dispatched = getDispatchedQty(item);
    const newChecked = { ...checkedItems, [index]: true };
    const newQuantities = { ...receivedQuantities, [index]: newQty };
    const newObservations = { ...itemObservations };
    if (newQty === dispatched) {
      delete newObservations[index];
      if (activeObservationIndex === index) {
        setActiveObservationIndex(null);
      }
    }

    setCheckedItems(newChecked);
    setReceivedQuantities(newQuantities);
    setItemObservations(newObservations);

    const updatedItems = (selectedOrder.items || []).map((it, idx) => {
      if (idx === index) {
        return {
          ...it,
          recibido: true,
          cantidadRecibida: newQty,
          observacionRecepcion: newQty === dispatched ? '' : (newObservations[idx] || it.observacionRecepcion || '')
        };
      }
      return it;
    });

    const updatedOrder = {
      ...selectedOrder,
      items: updatedItems,
      recepcionProgreso: {
        ...(selectedOrder.recepcionProgreso || {}),
        checkedItems: newChecked,
        receivedQuantities: newQuantities,
        checkedNewFaltantes,
        newFaltantesQuantities,
        itemObservations: newObservations,
        updatedAt: new Date().toISOString()
      }
    };

    setSelectedOrder(updatedOrder);
    setSolicitudes(prev => prev.map(s => s.id === updatedOrder.id ? updatedOrder : s));

    await transferService.updateReceivingProgress(selectedOrder.id, {
      checkedItems: newChecked,
      receivedQuantities: newQuantities,
      checkedNewFaltantes,
      newFaltantesQuantities,
      itemObservations: newObservations,
      items: updatedItems
    });
  };

  // Toque sobre la fila: Si el producto tiene discrepancia se bloquea para selección normal; si no, toggle
  const handleRowClick = async (index) => {
    const item = selectedOrder?.items?.[index];
    if (!item) return;
    const dispatched = getDispatchedQty(item);
    const current = getReceivedQty(index, item);
    const hasDiscrepancy = current !== dispatched;

    // Si tiene discrepancia, se mantiene bloqueado en modo revisado con discrepancia
    if (hasDiscrepancy) {
      return;
    }

    const willBeChecked = !checkedItems[index];
    if (willBeChecked) {
      playCheckSound();
    }

    const newChecked = { ...checkedItems, [index]: willBeChecked };
    const newQuantities = {
      ...receivedQuantities,
      [index]: willBeChecked ? dispatched : (receivedQuantities[index] !== undefined ? receivedQuantities[index] : dispatched)
    };

    setCheckedItems(newChecked);
    setReceivedQuantities(newQuantities);

    const updatedItems = (selectedOrder.items || []).map((it, idx) => {
      if (idx === index) {
        return {
          ...it,
          recibido: willBeChecked,
          cantidadRecibida: willBeChecked ? dispatched : (newQuantities[idx] ?? dispatched)
        };
      }
      return it;
    });

    const updatedOrder = {
      ...selectedOrder,
      items: updatedItems,
      recepcionProgreso: {
        ...(selectedOrder.recepcionProgreso || {}),
        checkedItems: newChecked,
        receivedQuantities: newQuantities,
        checkedNewFaltantes,
        newFaltantesQuantities,
        itemObservations,
        updatedAt: new Date().toISOString()
      }
    };

    setSelectedOrder(updatedOrder);
    setSolicitudes(prev => prev.map(s => s.id === updatedOrder.id ? updatedOrder : s));

    await transferService.updateReceivingProgress(selectedOrder.id, {
      checkedItems: newChecked,
      receivedQuantities: newQuantities,
      checkedNewFaltantes,
      newFaltantesQuantities,
      itemObservations,
      items: updatedItems
    });
  };

  // Captura de observación por producto en recepción de caja física
  const handleObservationChange = async (index, text) => {
    const newObservations = { ...itemObservations, [index]: text };
    setItemObservations(newObservations);

    const updatedItems = (selectedOrder?.items || []).map((it, idx) => {
      if (idx === index) {
        return {
          ...it,
          observacionRecepcion: text
        };
      }
      return it;
    });

    const updatedOrder = {
      ...selectedOrder,
      items: updatedItems,
      recepcionProgreso: {
        ...(selectedOrder.recepcionProgreso || {}),
        checkedItems,
        receivedQuantities,
        checkedNewFaltantes,
        newFaltantesQuantities,
        itemObservations: newObservations,
        updatedAt: new Date().toISOString()
      }
    };

    setSelectedOrder(updatedOrder);
    setSolicitudes(prev => prev.map(s => s.id === updatedOrder.id ? updatedOrder : s));

    await transferService.updateReceivingProgress(selectedOrder.id, {
      checkedItems,
      receivedQuantities,
      checkedNewFaltantes,
      newFaltantesQuantities,
      itemObservations: newObservations,
      items: updatedItems
    });
  };

  const getReceivedNewFaltanteQty = (idx, item) => {
    const dispatched = getExpectedNewFaltanteQty(item, selectedOrder);
    const val = newFaltantesQuantities[idx];
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return Number(val);
    }
    const itemRec = Number(item?.cantidadRecibida);
    if (!isNaN(itemRec) && itemRec >= 0 && item?.recibido) {
      return itemRec;
    }
    return dispatched;
  };

  const handleNewFaltanteQtyChange = async (idx, newQty) => {
    if (!checkedNewFaltantes[idx]) {
      playCheckSound();
    }
    const item = selectedOrder?.resolucionFaltantes?.itemsResolucion?.filter(i => i.despachado)?.[idx];
    const dispatched = getExpectedNewFaltanteQty(item, selectedOrder);
    const newChecked = { ...checkedNewFaltantes, [idx]: true };
    const newQuantities = { ...newFaltantesQuantities, [idx]: newQty };
    const newObs = { ...newFaltanteObservations };
    if (newQty >= dispatched) {
      delete newObs[idx];
      if (activeFaltanteObservationIndex === idx) {
        setActiveFaltanteObservationIndex(null);
      }
    }

    setCheckedNewFaltantes(newChecked);
    setNewFaltantesQuantities(newQuantities);
    setNewFaltanteObservations(newObs);

    const updatedOrder = {
      ...selectedOrder,
      recepcionProgreso: {
        ...(selectedOrder.recepcionProgreso || {}),
        checkedItems,
        receivedQuantities,
        checkedNewFaltantes: newChecked,
        newFaltantesQuantities: newQuantities,
        itemObservations,
        newFaltanteObservations: newObs,
        updatedAt: new Date().toISOString()
      }
    };

    setSelectedOrder(updatedOrder);
    setSolicitudes(prev => prev.map(s => s.id === updatedOrder.id ? updatedOrder : s));

    await transferService.updateReceivingProgress(selectedOrder.id, {
      checkedItems,
      receivedQuantities,
      checkedNewFaltantes: newChecked,
      newFaltantesQuantities: newQuantities,
      itemObservations,
      newFaltanteObservations: newObs
    });
  };

  const handleNewFaltanteObservationChange = async (idx, text) => {
    const newObs = { ...newFaltanteObservations, [idx]: text };
    setNewFaltanteObservations(newObs);

    const updatedOrder = {
      ...selectedOrder,
      recepcionProgreso: {
        ...(selectedOrder?.recepcionProgreso || {}),
        checkedItems,
        receivedQuantities,
        checkedNewFaltantes,
        newFaltantesQuantities,
        itemObservations,
        newFaltanteObservations: newObs,
        updatedAt: new Date().toISOString()
      }
    };

    setSelectedOrder(updatedOrder);
    setSolicitudes(prev => prev.map(s => s.id === updatedOrder.id ? updatedOrder : s));

    await transferService.updateReceivingProgress(selectedOrder.id, {
      checkedItems,
      receivedQuantities,
      checkedNewFaltantes,
      newFaltantesQuantities,
      itemObservations,
      newFaltanteObservations: newObs
    });
  };

  const handleNewFaltanteRowClick = async (idx) => {
    const item = selectedOrder?.resolucionFaltantes?.itemsResolucion?.filter(i => i.despachado)?.[idx];
    if (!item) return;
    const dispatched = getExpectedNewFaltanteQty(item, selectedOrder);
    const current = getReceivedNewFaltanteQty(idx, item);
    if (current !== dispatched) return;

    const willBeChecked = !checkedNewFaltantes[idx];
    if (willBeChecked) {
      playCheckSound();
    }

    const newChecked = { ...checkedNewFaltantes, [idx]: willBeChecked };
    const newQuantities = {
      ...newFaltantesQuantities,
      [idx]: willBeChecked ? dispatched : (newFaltantesQuantities[idx] !== undefined ? newFaltantesQuantities[idx] : dispatched)
    };
    const newObs = { ...newFaltanteObservations };
    if (willBeChecked) {
      delete newObs[idx];
      if (activeFaltanteObservationIndex === idx) {
        setActiveFaltanteObservationIndex(null);
      }
    }

    setCheckedNewFaltantes(newChecked);
    setNewFaltantesQuantities(newQuantities);
    setNewFaltanteObservations(newObs);

    const updatedOrder = {
      ...selectedOrder,
      recepcionProgreso: {
        ...(selectedOrder.recepcionProgreso || {}),
        checkedItems,
        receivedQuantities,
        checkedNewFaltantes: newChecked,
        newFaltantesQuantities: newQuantities,
        itemObservations,
        newFaltanteObservations: newObs,
        updatedAt: new Date().toISOString()
      }
    };

    setSelectedOrder(updatedOrder);
    setSolicitudes(prev => prev.map(s => s.id === updatedOrder.id ? updatedOrder : s));

    await transferService.updateReceivingProgress(selectedOrder.id, {
      checkedItems,
      receivedQuantities,
      checkedNewFaltantes: newChecked,
      newFaltantesQuantities: newQuantities,
      itemObservations,
      newFaltanteObservations: newObs
    });
  };

  // Validación final al presionar "Listo, Terminar Revisión"
  const handleListo = () => {
    if (!selectedOrder?.items) return;

    const discrepancies = [];
    selectedOrder.items.forEach((item, index) => {
      const dispatched = getDispatchedQty(item);
      const isChecked = checkedItems[index];
      // Si el ítem no fue revisado por el usuario, se toma como 0 (ausencia total)
      const received = isChecked ? getReceivedQty(index, item) : 0;
      const diff = received - dispatched;

      if (diff !== 0) {
        const obs = itemObservations[index] || item.observacionRecepcion || '';
        discrepancies.push({
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidadEsperada: dispatched,
          cantidadDespachada: dispatched,
          cantidadRecibida: received,
          diferencia: diff,
          tipo: received === 0 ? 'ausencia_total' : (diff < 0 ? 'faltante' : 'extra'),
          observacion: obs,
          motivoRecepcion: obs
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
    const updatedItems = (selectedOrder.items || []).map((it, idx) => ({
      ...it,
      recibido: true,
      cantidadRecibida: getReceivedQty(idx, it),
      cantidadEsperada: getDispatchedQty(it),
      cantidadDespachada: getDispatchedQty(it),
      observacionRecepcion: itemObservations[idx] || it.observacionRecepcion || ''
    }));
    await transferService.receiveSolicitud(selectedOrder.id, faltantes, updatedItems);
    setIsDiscrepancyModalOpen(false);
    closeOrder();
  };

  const handleConfirmDiscrepancies = async (summaryData) => {
    const obsMap = { ...itemObservations };
    (summaryData.discrepancias || []).forEach(d => {
      const foundIdx = selectedOrder.items?.findIndex(it => it.codigo === d.codigo);
      if (foundIdx !== -1 && d.observacion !== undefined) {
        obsMap[foundIdx] = d.observacion;
      }
    });

    await transferService.receiveWithDiscrepancies(selectedOrder.id, {
      discrepancias: summaryData.discrepancias,
      observaciones: summaryData.observaciones,
      usuarioReceptor: currentUser?.username || 'sucursal',
      itemsActualizados: selectedOrder.items.map((it, idx) => ({
        ...it,
        recibido: Boolean(checkedItems[idx]),
        cantidadRecibida: getReceivedQty(idx, it),
        cantidadEsperada: getDispatchedQty(it),
        cantidadDespachada: getDispatchedQty(it),
        observacionRecepcion: obsMap[idx] || it.observacionRecepcion || ''
      }))
    });
    setIsDiscrepancyModalOpen(false);
    closeOrder();
  };

  // Manejo de finalización de recepción para re-despacho de faltantes (cerrar o volver a reportar)
  const handleListoFaltantes = async (reReportToBodega = false) => {
    const itemsResolucion = selectedOrder.resolucionFaltantes?.itemsResolucion || [];
    const newlyDispatched = itemsResolucion.filter(i => i.despachado);

    const itemsRecibidos = [];
    const itemsAunFaltantes = [];

    newlyDispatched.forEach((item, idx) => {
      const dispatchedQty = getExpectedNewFaltanteQty(item, selectedOrder);
      const currentVal = newFaltantesQuantities[idx];
      // Si el usuario ajustó la cantidad o marcó el ítem, usamos la cantidad indicada; si no, por defecto la despachada
      const receivedQty = currentVal !== undefined ? Number(currentVal) : dispatchedQty;
      const obs = newFaltanteObservations[idx] || item.observacion || '';

      if (receivedQty > 0) {
        itemsRecibidos.push({
          ...item,
          cantidadRecibida: receivedQty,
          observacion: obs,
          motivoRecepcion: obs
        });
      }

      if (receivedQty < dispatchedQty) {
        itemsAunFaltantes.push({
          ...item,
          cantidadAunFaltante: dispatchedQty - receivedQty,
          cantidadEsperadaReenvio: dispatchedQty,
          cantidadRecibidaReenvio: receivedQty,
          observacion: obs,
          motivoRecepcion: obs
        });
      }
    });

    const notasReporte = itemsAunFaltantes.map(af => af.observacion).filter(Boolean).join('; ');

    await transferService.receiveFaltantes(selectedOrder.id, {
      itemsRecibidos,
      itemsAunFaltantes,
      reReportToBodega,
      notas: notasReporte,
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
                const checkedCount = isFaltante
                  ? Object.values(sol.recepcionProgreso?.checkedNewFaltantes || {}).filter(Boolean).length
                  : Object.values(sol.recepcionProgreso?.checkedItems || {}).filter(Boolean).length;
                const totalCount = isFaltante
                  ? (sol.resolucionFaltantes?.itemsResolucion?.filter(i => i.despachado).length || 0)
                  : (sol.items?.length || 0);
                const percent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
                const hasProgress = checkedCount > 0;

                return (
                  <div
                    key={sol.id}
                    onClick={() => openOrder(sol)}
                    className={`bg-white rounded-3xl p-5 border shadow-sm flex flex-col justify-between gap-3.5 hover:shadow-md transition-all cursor-pointer group ios-card-hover active:scale-[0.99] ${
                      isFaltante ? 'border-purple-200 hover:border-purple-400' : 'border-slate-200/80 hover:border-indigo-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
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
                          {hasProgress && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <Check className="w-2.5 h-2.5 stroke-[3]" /> Revisando
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
                            ? `${totalCount} ítems en este reenvío`
                            : `${totalCount} productos en total`}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span
                          className={`hidden sm:inline-flex px-4 py-2.5 text-white font-bold text-xs rounded-2xl shadow-sm transition-all group-hover:shadow-md ${
                            isFaltante ? 'bg-purple-600 group-hover:bg-purple-500' : 'bg-indigo-600 group-hover:bg-indigo-500'
                          }`}
                        >
                          {isFaltante 
                            ? (hasProgress ? 'Continuar Revisión' : 'Revisar Faltantes') 
                            : (hasProgress ? 'Continuar Revisión' : 'Revisar Caja')}
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

                    {/* Barra de Progreso de Productos (idéntica al módulo de despacho) */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                        <span>Progreso de revisión: {checkedCount} de {totalCount} productos</span>
                        <span className="font-bold text-slate-800 font-mono">{percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isFaltante
                              ? 'bg-purple-600'
                              : percent === 100
                              ? 'bg-emerald-500'
                              : 'bg-indigo-600'
                          }`}
                          style={{ width: `${percent}%` }}
                        ></div>
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
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-200/80 shadow-sm space-y-3">
            {/* Top row: Título sin borde y badges */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm sm:text-base font-extrabold text-purple-700 uppercase tracking-wide flex items-center gap-2">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 shrink-0" />
                <span>Recepción de Reenvío</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                  <Check className="w-3 h-3 text-emerald-600 stroke-[3]" /> Guardado
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-mono border border-purple-200">
                  Reenvío Activo
                </span>
              </div>
            </div>

            {/* Folio y Descripción */}
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
                {selectedOrder.resolucionFaltantes?.folioEnvio || selectedOrder.folio || formatTransferFolio(selectedOrder)}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Verifica los productos nuevos enviados en esta caja. Lo recibido en la entrega anterior se mantiene conservado y bloqueado.
              </p>
            </div>

            {/* Contexto de Seguimiento: Motivo Sucursal + Respuesta Bodega */}
            {(() => {
              const motivoSucursal =
                selectedOrder.reporteDiscrepancias?.observaciones ||
                selectedOrder.observacionesRecepcion ||
                selectedOrder.reporteFaltantes?.map(rf => rf.observacion || rf.motivo).filter(Boolean).join('; ');
              const respuestaBodega =
                selectedOrder.resolucionFaltantes?.notas ||
                selectedOrder.observaciones;
              const usuarioSucursal = selectedOrder.reporteDiscrepancias?.usuarioReceptor;
              const usuarioBodega = selectedOrder.resolucionFaltantes?.usuarioResolucion;

              if (!motivoSucursal && !respuestaBodega) return null;

              return (
                <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {motivoSucursal && (
                    <div className="p-3 bg-red-50/70 rounded-2xl border border-red-200/80 text-xs flex flex-col justify-between gap-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-red-900 text-[11px] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>Reporte Sucursal</span>
                        </span>
                        {usuarioSucursal && (
                          <span className="text-[10px] font-semibold text-red-700 bg-white/90 px-2 py-0.5 rounded-full border border-red-200/80 shrink-0">
                            {usuarioSucursal}
                          </span>
                        )}
                      </div>
                      <p className="text-red-950 font-medium italic text-xs leading-snug pl-5 break-words">
                        &ldquo;{motivoSucursal}&rdquo;
                      </p>
                    </div>
                  )}

                  {respuestaBodega && (
                    <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-200/80 text-xs flex flex-col justify-between gap-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-purple-900 text-[11px] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>Respuesta Bodega</span>
                        </span>
                        {usuarioBodega && (
                          <span className="text-[10px] font-semibold text-purple-700 bg-white/90 px-2 py-0.5 rounded-full border border-purple-200/80 shrink-0">
                            {usuarioBodega}
                          </span>
                        )}
                      </div>
                      <p className="text-purple-950 font-medium italic text-xs leading-snug pl-5 break-words">
                        &ldquo;{respuestaBodega}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Listado Diferenciado: Lo nuevo para checar + lo pasado inmutable */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {/* 1. SECCIÓN: LO NUEVO MANDADO PARA VOLVER A CHECAR */}
            {selectedOrder.resolucionFaltantes?.itemsResolucion
              ?.filter(i => i.despachado)
              .map((item, idx) => {
                const reporteItem = selectedOrder.reporteFaltantes?.find(rf => rf.codigo === item.codigo);
                const originalItem = selectedOrder.items?.find(it => it.codigo === item.codigo);

                const cantFaltanteReportada = Number(
                  reporteItem?.cantidadFaltante ??
                  item.cantidadFaltanteReportada ??
                  1
                );

                const expected = getExpectedNewFaltanteQty(item, selectedOrder);
                const isChecked = Boolean(checkedNewFaltantes[idx]);
                const current = getReceivedNewFaltanteQty(idx, item);
                const diff = current - expected;
                const hasDiscrepancy = isChecked && diff !== 0;
                const isUnderReceived = current < expected;
                const showObsField = isUnderReceived || activeFaltanteObservationIndex === idx;

                const cantSolicitadaTotal = Number(
                  originalItem?.cantidadSolicitada ??
                  reporteItem?.cantidadSolicitada ??
                  cantFaltanteReportada
                );

                const cantRecibidaPrevia = Number(
                  reporteItem?.cantidadRecibida ??
                  originalItem?.cantidadRecibida ??
                  (cantSolicitadaTotal > cantFaltanteReportada ? cantSolicitadaTotal - cantFaltanteReportada : 0)
                );

                // Es envío parcial de faltantes si Bodega mandó menos de lo que se reportó faltante
                const isPartialReenvio = Boolean(expected < cantFaltanteReportada);

                const motivoSucursalItem = 
                  reporteItem?.observacion || 
                  reporteItem?.motivoRecepcion || 
                  reporteItem?.motivo || 
                  item.observacionRecepcion || 
                  item.motivoSucursal ||
                  originalItem?.observacionRecepcion;

                const itemMotivo = 
                  item.motivo || 
                  item.motivoParcial || 
                  item.motivoNoDespacho || 
                  (isPartialReenvio ? selectedOrder.resolucionFaltantes?.notas : null) ||
                  item.motivoOriginal;

                return (
                  <div
                    key={'new-' + idx}
                    onClick={() => handleNewFaltanteRowClick(idx)}
                    className={`p-4 space-y-2.5 cursor-pointer transition-all duration-200 border-l-4 ${
                      hasDiscrepancy
                        ? 'bg-amber-50/40 border-l-amber-500'
                        : isChecked
                        ? 'bg-purple-50/40 border-l-purple-500'
                        : 'bg-white hover:bg-slate-50 border-l-purple-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                                isChecked && !hasDiscrepancy ? 'line-through text-slate-400 font-semibold' : 'text-slate-900'
                              }`}
                            >
                              {item.descripcion}
                            </h4>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-700 uppercase tracking-wider">
                              Reenvío de Faltante
                            </span>
                            {isPartialReenvio ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800 uppercase tracking-wider border border-amber-200">
                                Envío Parcial ({expected} de {cantFaltanteReportada} pz faltantes)
                              </span>
                            ) : !isUnderReceived ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 uppercase tracking-wider border border-emerald-200">
                                Completo ({expected} pz)
                              </span>
                            ) : null}
                            {isUnderReceived && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-red-100 text-red-800 uppercase tracking-wider border border-red-200">
                                {expected - current === 1 ? 'Falta 1 pz en reenvío' : `Faltan ${expected - current} pz en reenvío`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-x-2 gap-y-1 text-[11px] font-mono text-slate-600 mt-1 flex-wrap">
                            <span className="whitespace-nowrap">Código: <strong>{item.codigo}</strong></span>
                            <span className="whitespace-nowrap before:content-['•'] before:mr-2 before:text-slate-300">
                              Despachadas en esta caja: <strong className="text-purple-700 font-bold">{expected} pz</strong>
                            </span>
                            {cantRecibidaPrevia > 0 && (
                              <span className="whitespace-nowrap before:content-['•'] before:mr-2 before:text-slate-300 text-slate-600 font-medium">
                                Recibidas previamente: <strong className="text-slate-700">{cantRecibidaPrevia} pz</strong>
                              </span>
                            )}
                            {cantSolicitadaTotal > 0 && (
                              <span className="whitespace-nowrap before:content-['•'] before:mr-2 before:text-slate-300 text-slate-400">
                                (Pedido original: {cantSolicitadaTotal} pz)
                              </span>
                            )}
                          </div>

                          {/* Motivo reportado por la sucursal para este producto */}
                          {Boolean(motivoSucursalItem) && (
                            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-rose-950 bg-rose-50/90 px-2.5 py-1 rounded-xl border border-rose-200/80">
                              <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span className="font-bold text-rose-900 text-[11px]">Motivo reporte:</span>
                              <span className="italic font-medium text-rose-900 break-words">&ldquo;{motivoSucursalItem}&rdquo;</span>
                            </div>
                          )}

                          {/* Cita del Despachador para este producto si aplica */}
                          {Boolean(itemMotivo && itemMotivo !== motivoSucursalItem) && (
                            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-purple-950 bg-purple-50/90 px-2.5 py-1 rounded-xl border border-purple-200/80">
                              <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span className="font-bold text-purple-900 text-[11px]">Nota despacho:</span>
                              <span className="italic font-medium text-purple-900 break-words">&ldquo;{itemMotivo}&rdquo;</span>
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

                    {/* Campo de observación si se reciben menos piezas o se desea agregar observación */}
                    {showObsField ? (
                      <div className="pt-2.5 border-t border-purple-100 sm:pl-9" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-xs text-purple-900 mb-1 font-semibold">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-purple-500" />
                            <span>{isUnderReceived ? 'Motivo / observación de este faltante' : 'Observación / nota del producto:'}</span>
                            {isUnderReceived && <span className="text-red-500 font-bold">*</span>}
                          </div>
                          {!isUnderReceived && (
                            <button
                              type="button"
                              onClick={() => {
                                const newObs = { ...newFaltanteObservations };
                                delete newObs[idx];
                                setNewFaltanteObservations(newObs);
                                setActiveFaltanteObservationIndex(null);
                              }}
                              className="text-[10px] text-purple-600 hover:text-purple-800 font-semibold cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={newFaltanteObservations[idx] || ''}
                          onChange={(e) => handleNewFaltanteObservationChange(idx, e.target.value)}
                          placeholder={
                            isUnderReceived
                              ? "Ej. Faltante físico en el reenvío, pieza rota o dañada..."
                              : "Observación opcional sobre este producto..."
                          }
                          className="w-full text-xs px-3.5 py-2.5 bg-white hover:bg-slate-50 focus:bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-900 placeholder:text-slate-400 shadow-2xs transition-all font-medium"
                        />
                      </div>
                    ) : (
                      <div className="pt-1 sm:pl-9" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setActiveFaltanteObservationIndex(idx)}
                          className="text-[11px] text-purple-700 hover:text-purple-900 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors hover:underline"
                        >
                          <FileText className="w-3 h-3 text-purple-600" />
                          <span>Agregar observación del producto</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            {/* 2. SECCIÓN: FALTANTES QUE NO FUERON DESPACHADOS POR BODEGA (BLOQUEADOS) */}
            {selectedOrder.resolucionFaltantes?.itemsResolucion
              ?.filter(i => !i.despachado)
              .map((item, idx) => (
                <div
                  key={'not-sent-' + idx}
                  className="p-3.5 sm:p-4 flex items-start sm:items-center justify-between gap-3 bg-red-50/30 border-l-4 border-l-red-300 opacity-80 select-none"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-slate-700 break-words">{item.descripcion}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 shrink-0">
                          No enviado por Bodega ({item.motivoNoDespacho || 'Sin existencia'})
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 block">Código: {item.codigo}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center self-start sm:self-center">
                    <span className="px-2.5 py-1 rounded-xl font-mono text-xs font-bold bg-red-100 text-red-800">
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
                  className="p-3.5 sm:p-4 flex items-start sm:items-center justify-between gap-3 bg-slate-50/60 opacity-75 select-none"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-slate-600 line-through break-words">
                          {item.descripcion}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                          Recibido anteriormente
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 block">Código: {item.codigo}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center self-start sm:self-center">
                    <span className="px-2.5 py-1 rounded-xl font-mono text-xs font-bold bg-slate-200/80 text-slate-700">
                      {item.cantidadRecibida ?? item.cantidadDespachada ?? item.cantidadSolicitada} pzas
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {(() => {
            const newlyDispatched = (selectedOrder.resolucionFaltantes?.itemsResolucion || []).filter(i => i.despachado);
            const totalFaltantesAun = newlyDispatched.reduce((acc, item, idx) => {
              const dispatchedQty = getExpectedNewFaltanteQty(item, selectedOrder);
              const currentVal = newFaltantesQuantities[idx];
              const receivedQty = currentVal !== undefined ? Number(currentVal) : dispatchedQty;
              return acc + Math.max(0, dispatchedQty - receivedQty);
            }, 0);
            const hasAunFaltantes = totalFaltantesAun > 0;

            if (hasAunFaltantes) {
              return (
                <div className="pt-2 space-y-3">
                  <div className="p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-2xl text-xs space-y-1 text-amber-900">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Falta{totalFaltantesAun === 1 ? ' 1 pieza' : `n ${totalFaltantesAun} piezas`} en este reenvío</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-800">
                      Elige si deseas volver a reportar los faltantes a Bodega para solicitar un nuevo surtido, o si prefieres concluir y cerrar el pedido definitivamente con las observaciones.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Opción 1: Re-reportar a Bodega */}
                    <button
                      type="button"
                      onClick={() => handleListoFaltantes(true)}
                      className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Volver a Reportar a Bodega</span>
                    </button>

                    {/* Opción 2: Cerrar definitivamente con faltantes */}
                    <button
                      type="button"
                      onClick={() => handleListoFaltantes(false)}
                      className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0" />
                      <span>Cerrar Pedido c/ Faltantes</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="pt-2 space-y-2">
                <p className="text-xs text-center text-slate-500">
                  Todos los productos enviados han sido recibidos. Al confirmar, el pedido queda completado y cerrado con éxito.
                </p>
                <button
                  type="button"
                  onClick={() => handleListoFaltantes(false)}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <PackageOpen className="w-5 h-5" />
                  <span>Listo, Confirmar Recepción de Faltantes</span>
                </button>
              </div>
            );
          })()}
        </div>
      ) : (
        /* VISTA DE RECEPCIÓN ESTÁNDAR */
        <div key={selectedOrder.id} className="space-y-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Recepción de Caja Física</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                  <Check className="w-3 h-3 text-emerald-600 stroke-[3]" /> Guardado
                </span>
                {(selectedOrder.sinSolicitud || selectedOrder.esDespachoDirecto) && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Despacho sin Solicitud
                  </span>
                )}
              </div>
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

              const ajusteDespachoItem = selectedOrder.ajustesDespacho?.find(a => 
                (a.codigo && item.codigo && String(a.codigo) === String(item.codigo)) ||
                (a.descripcion && item.descripcion && a.descripcion.toLowerCase() === item.descripcion.toLowerCase())
              );

              const itemMotivo = 
                item.motivoAjusteDespacho || 
                item.motivo || 
                item.motivoAjuste || 
                item.motivoParcial || 
                ajusteDespachoItem?.motivo || 
                ajusteDespachoItem?.motivoAjusteDespacho;

              return (
                <div
                  key={index}
                  onClick={() => handleRowClick(index)}
                  className={`p-4 flex flex-col gap-3 transition-all duration-200 border-l-4 ${
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
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
                            Despachadas: <strong className="text-slate-700">{cantDespachada} pzas</strong>{' '}
                            {hasDiffSolicitadoDespachado && (
                              <span className="text-slate-500 font-semibold">
                                ({cantSolicitada} pz solicitadas)
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Cita/justificación del despacho si no mandaron todas las piezas */}
                        {itemMotivo && (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-950 bg-amber-50/90 px-2.5 py-1 rounded-xl border border-amber-200/80">
                            <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="italic font-medium text-amber-900">&ldquo;{itemMotivo}&rdquo;</span>
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

                  {/* Campo de observación por producto en recepción de caja física */}
                  {(hasDiscrepancy || activeObservationIndex === index) ? (
                    <div className="pt-2.5 border-t border-slate-100 sm:pl-9" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{hasDiscrepancy ? 'Motivo del faltante o discrepancia *' : 'Observación / nota del producto:'}</span>
                          {hasDiscrepancy && <span className="text-red-500 font-bold">*</span>}
                        </div>
                        {!hasDiscrepancy && (
                          <button
                            type="button"
                            onClick={() => {
                              const newObs = { ...itemObservations };
                              delete newObs[index];
                              setItemObservations(newObs);
                              setActiveObservationIndex(null);
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={itemObservations[index] || ''}
                        onChange={(e) => handleObservationChange(index, e.target.value)}
                        placeholder={
                          hasDiscrepancy
                            ? "Ej: Faltaron piezas físicas en caja, empaque quebrado, caducado..."
                            : "Observación opcional sobre este producto..."
                        }
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:outline-none transition-colors text-slate-800 placeholder:text-slate-400 font-medium"
                      />
                    </div>
                  ) : (
                    <div className="sm:pl-9 -mt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setActiveObservationIndex(index)}
                        className="text-[11px] text-slate-400 hover:text-indigo-600 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Agregar observación del producto</span>
                      </button>
                    </div>
                  )}
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
