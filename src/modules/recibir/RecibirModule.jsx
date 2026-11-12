/**
 * Módulo para la inspección física, verificación de productos recibidos, captura de discrepancias y reporte de faltantes por sucursal.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Check,
  PackageOpen,
  AlertTriangle,
  AlertCircle,
  Truck,
  X,
  RotateCcw,
  FileText,
  ChevronRight,
  History,
  Clock,
  Loader2,
  ChevronDown
} from 'lucide-react';
import {
  transferService,
  formatTransferFolio,
  canUserReceive,
  canUserViewInRecibirHistory,
  formatOrderRequestedBy,
  TransferDetailModal,
  playCheckSound,
  playOrderSuccessSound
} from '../transferencias';
import { userService } from '../usuarios/userService';
import {
  transitionView,
  QuantityStepper,
  DiscrepancySummaryModal,
  ModalDialog,
  MarqueeSearchInput,
  FloatingInput
} from '../../shared';
import { usePendingSync } from '../../hooks';

export function getDispatchedQty(item) {
  if (!item) return 0;
  if (item.cantidadDespachada !== undefined && item.cantidadDespachada !== null) {
    const desp = Number(item.cantidadDespachada);
    if (!isNaN(desp) && desp >= 0) return desp;
  }

  if (item.cantidad !== undefined && item.cantidad !== null) {
    const cant = Number(item.cantidad);
    if (!isNaN(cant) && cant >= 0) return cant;
  }

  if (item.cantidadSolicitada !== undefined && item.cantidadSolicitada !== null) {
    const sol = Number(item.cantidadSolicitada);
    if (!isNaN(sol) && sol >= 0) return sol;
  }

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
          faltantesQtys[idx] = dispatched;
        }
      }
      const qty = faltantesQtys[idx] !== undefined ? faltantesQtys[idx] : dispatched;
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

export const RecibirModule = React.memo(function RecibirModule({ currentUser, onBack, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.filter(s => canUserReceive(s, currentUser));
  });

  const [historialList, setHistorialList] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.filter(s => canUserViewInRecibirHistory(s, currentUser));
  });

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('erp_recibir_active_tab') || 'recibir';
  });

  const [historySearch, setHistorySearch] = useState('');
  const [historyLimit, setHistoryLimit] = useState(15);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [isHistorialInitialLoading, setIsHistorialInitialLoading] = useState(false);
  const [detailSolicitud, setDetailSolicitud] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const isSubmittingRef = useRef(false);
  const { pendingSyncIds } = usePendingSync();

  useEffect(() => {
    const unsub = userService.subscribeUsers((list) => {
      setUsersList(list);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('erp_recibir_active_tab', activeTab);
  }, [activeTab]);

  const handleSwitchTab = (newTab) => {
    if (newTab === activeTab) return;
    if (newTab === 'historial') {
      setIsHistorialInitialLoading(true);
      setHistoryLimit(15);
      setTimeout(() => setIsHistorialInitialLoading(false), 220);
    }
    transitionView(() => {
      setActiveTab(newTab);
    });
  };

  const sortedHistory = useMemo(() => {
    return [...historialList].sort((a, b) => {
      const dateA = new Date(a.fechaRecepcion || a.reporteDiscrepancias?.fecha || a.fechaDespacho || a.fecha || 0).getTime();
      const dateB = new Date(b.fechaRecepcion || b.reporteDiscrepancias?.fecha || b.fechaDespacho || b.fecha || 0).getTime();
      return dateB - dateA;
    });
  }, [historialList]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return sortedHistory;

    return sortedHistory.filter(sol => {
      const folio = (sol.folio || formatTransferFolio(sol) || '').toLowerCase();
      const origen = (sol.sucursalDestino || sol.usuarioDestino || 'Bodega').toLowerCase();
      const areaOrigen = (sol.areaDestino || '').toLowerCase();
      const receptor = (sol.usuarioReceptor || sol.usuarioRecepcion || sol.reporteDiscrepancias?.usuarioReceptor || '').toLowerCase();
      const obs = (sol.observaciones || '').toLowerCase();
      const matchesText =
        folio.includes(q) ||
        origen.includes(q) ||
        areaOrigen.includes(q) ||
        receptor.includes(q) ||
        obs.includes(q);
      if (matchesText) return true;

      return sol.items?.some(it => {
        const desc = (it.descripcion || '').toLowerCase();
        const cod = (it.codigo || '').toLowerCase();
        return desc.includes(q) || cod.includes(q);
      });
    });
  }, [sortedHistory, historySearch]);

  const visibleHistory = useMemo(() => {
    return filteredHistory.slice(0, historyLimit);
  }, [filteredHistory, historyLimit]);

  const hasMoreHistory = visibleHistory.length < filteredHistory.length;

  const handleLoadMoreHistory = useCallback(() => {
    if (isLoadingMoreHistory) return;
    setIsLoadingMoreHistory(true);
    setTimeout(() => {
      setHistoryLimit(prev => prev + 15);
      setIsLoadingMoreHistory(false);
    }, 200);
  }, [isLoadingMoreHistory]);

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
  
  const [isDiscrepancyModalOpen, setIsDiscrepancyModalOpen] = useState(false);
  const [discrepanciesToReport, setDiscrepanciesToReport] = useState([]);

  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    variant: 'primary',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const [isLoadingOrders, setIsLoadingOrders] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.length === 0;
  });

  useEffect(() => {
    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      const validos = list.filter((s) => canUserReceive(s, currentUser));
      setSolicitudes(validos);
      const recibidos = list.filter((s) => canUserViewInRecibirHistory(s, currentUser));
      setHistorialList(recibidos);
      setIsLoadingOrders(false);

      const savedOrderId = sessionStorage.getItem('erp_recibir_order_id');
      const targetId = selectedOrder?.id || savedOrderId;
      if (targetId) {
        const found = validos.find(s => s.id === targetId);
        if (found) {
          setSelectedOrder(found);
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

  const handleRowClick = async (index) => {
    const item = selectedOrder?.items?.[index];
    if (!item) return;
    const dispatched = getDispatchedQty(item);
    const current = getReceivedQty(index, item);
    const hasDiscrepancy = current !== dispatched;

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

  const handleListo = () => {
    if (!selectedOrder?.items) return;

    const discrepancies = [];
    selectedOrder.items.forEach((item, index) => {
      const dispatched = getDispatchedQty(item);
      const isChecked = checkedItems[index];
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
      const folio = selectedOrder ? formatTransferFolio(selectedOrder) : 'este pedido';
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: 'Confirmar Recepción de Pedido',
        message: `¿Confirmas que has verificado físicamente todos los productos del pedido ${folio} y deseas dar por terminada la recepción?`,
        confirmText: 'Sí, finalizar recepción',
        cancelText: 'Continuar revisando',
        variant: 'primary',
        onConfirm: () => {
          closeDialog();
          finalizeReceive([]);
        },
        onCancel: closeDialog
      });
    }
  };

  const finalizeReceive = async (faltantes = []) => {
    if (!selectedOrder || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const updatedItems = (selectedOrder.items || []).map((it, idx) => ({
        ...it,
        recibido: true,
        cantidadRecibida: getReceivedQty(idx, it),
        cantidadEsperada: getDispatchedQty(it),
        cantidadDespachada: getDispatchedQty(it),
        observacionRecepcion: itemObservations[idx] || it.observacionRecepcion || ''
      }));
      await transferService.receiveSolicitud(selectedOrder.id, faltantes, updatedItems, currentUser?.username || 'sucursal');
      playOrderSuccessSound();
      setIsDiscrepancyModalOpen(false);
      closeOrder();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleConfirmDiscrepancies = async (summaryData) => {
    if (!selectedOrder || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
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
      playOrderSuccessSound();
      setIsDiscrepancyModalOpen(false);
      closeOrder();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleListoFaltantes = async (reReportToBodega = false) => {
    if (!selectedOrder || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const itemsResolucion = selectedOrder.resolucionFaltantes?.itemsResolucion || [];
      const newlyDispatched = itemsResolucion.filter(i => i.despachado);

      const itemsRecibidos = [];
      const itemsAunFaltantes = [];

      newlyDispatched.forEach((item, idx) => {
        const dispatchedQty = getExpectedNewFaltanteQty(item, selectedOrder);
        const currentVal = newFaltantesQuantities[idx];
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
      playOrderSuccessSound();
      closeOrder();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const requestConfirmListoFaltantes = (reReportToBodega = false) => {
    const folio = selectedOrder ? formatTransferFolio(selectedOrder) : 'este pedido';

    if (reReportToBodega) {
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: 'Volver a Reportar a Bodega',
        message: `¿Confirmas que deseas enviar un nuevo reporte de faltantes a Bodega para el pedido ${folio}?`,
        confirmText: 'Sí, volver a reportar',
        cancelText: 'Cancelar',
        variant: 'danger',
        onConfirm: () => {
          closeDialog();
          handleListoFaltantes(true);
        },
        onCancel: closeDialog
      });
      return;
    }

    const itemsResolucion = selectedOrder?.resolucionFaltantes?.itemsResolucion || [];
    const newlyDispatched = itemsResolucion.filter(i => i.despachado);
    const itemsAunFaltantes = [];

    newlyDispatched.forEach((item, idx) => {
      const dispatchedQty = getExpectedNewFaltanteQty(item, selectedOrder);
      const currentVal = newFaltantesQuantities[idx];
      const receivedQty = currentVal !== undefined ? Number(currentVal) : dispatchedQty;
      if (receivedQty < dispatchedQty) {
        itemsAunFaltantes.push(item);
      }
    });

    const hasFaltantes = itemsAunFaltantes.length > 0;
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: hasFaltantes ? 'Cerrar Pedido con Faltantes' : 'Confirmar Recepción de Faltantes',
      message: hasFaltantes
        ? `¿Confirmas que deseas cerrar definitivamente el pedido ${folio} con los faltantes registrados?`
        : `¿Confirmas que has recibido y verificado los productos reenviados del pedido ${folio} y deseas dar por terminada la recepción?`,
      confirmText: hasFaltantes ? 'Sí, cerrar con faltantes' : 'Sí, finalizar recepción',
      cancelText: 'Continuar revisando',
      variant: 'primary',
      onConfirm: () => {
        closeDialog();
        handleListoFaltantes(false);
      },
      onCancel: closeDialog
    });
  };

  const isReDespacho = selectedOrder?.estado === 'faltantes_despachados';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 select-none">
      <div className="sticky top-16 z-30 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 pt-2 pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6 space-y-2.5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => selectedOrder ? closeOrder() : onBack()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{selectedOrder ? 'Volver a Entrantes' : 'Volver al Inicio'}</span>
          </button>

          {selectedOrder ? (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full truncate border border-slate-200/60 dark:border-slate-700/60">
              Recepción: <strong className="text-slate-800 dark:text-slate-200">{currentUser?.sede}{currentUser?.area ? ` (${currentUser.area})` : ''}</strong>
            </span>
          ) : (
            <div className="bg-slate-200/80 dark:bg-slate-800 p-1 rounded-full flex text-xs font-medium border border-transparent dark:border-slate-700/60 shrink-0">
              <button
                type="button"
                onClick={() => handleSwitchTab('recibir')}
                className={`px-3 py-1 rounded-full cursor-pointer transition-all duration-200 ${
                  activeTab === 'recibir'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <span>Recibir</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchTab('historial')}
                className={`px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-all duration-200 ${
                  activeTab === 'historial'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Historial ({historialList.length})</span>
              </button>
            </div>
          )}
        </div>

        {!selectedOrder && activeTab === 'historial' && (
          <div className="relative pt-1">
            <MarqueeSearchInput
              label="Buscar en historial"
              placeholder="Buscar por folio, origen, producto o notas..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              onClear={() => setHistorySearch('')}
            />
          </div>
        )}
      </div>

      {!selectedOrder ? (
        activeTab === 'recibir' ? (
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
                          {pendingSyncIds.has(sol.id) && (
                            <span
                              title="En cola para sincronizar al recuperar conexión"
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1 whitespace-nowrap"
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>En cola</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {formatOrderRequestedBy(sol, usersList)}
                        </p>
                        {(() => {
                          const rawObs = sol.observaciones || sol.motivo || sol.notas;
                          const obs = typeof rawObs === 'string' ? rawObs.trim() : rawObs;
                          const isDirect = sol.sinSolicitud || sol.esDespachoDirecto;
                          const isGeneric = isDirect && (!obs || obs === 'Pedido despachado sin haber sido solicitado' || obs === 'Pedido despachado sin haber sido solicitado.');
                          if (!obs || isGeneric) return null;
                          return (
                            <div className="flex items-start gap-1.5 text-xs mt-1">
                              <AlertCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-[3px]" />
                              <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-relaxed">
                                <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                  Observaciones:
                                </span>
                                <span className="font-normal text-slate-600 dark:text-slate-300 break-words min-w-0 max-w-full whitespace-pre-line">
                                  {obs}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
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
        ) : (
          <div key="historial-list" className="space-y-4 animate-fade-in">
            {isHistorialInitialLoading ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center space-y-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cargando transferencias recibidas...</p>
                <p className="text-[11px] text-slate-400">Consultando historial en tiempo real</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center space-y-2">
                <History className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {historySearch ? 'No se encontraron resultados' : 'Sin transferencias recibidas en el historial'}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {historySearch
                    ? `No hay transferencias que coincidan con "${historySearch}".`
                    : 'Las transferencias recibidas e inspeccionadas físicamente por este usuario aparecerán aquí.'}
                </p>
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                  >
                    Ver todo el historial
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleHistory.map(sol => {
                  const isFaltantesCerrados = sol.estado === 'cerrada_con_faltantes';
                  const isIncompleta = sol.estado === 'recibida_incompleta';
                  const hasFaltantesReport = Boolean(sol.reporteFaltantes && sol.reporteFaltantes.length > 0);
                  const totalUnits = sol.items?.reduce((acc, it) => acc + Number(it.cantidadRecibida || it.cantidadDespachada || it.cantidad || 0), 0) || 0;
                  const totalItems = sol.items?.length || 0;

                  const dateStr = sol.fechaRecepcion || sol.reporteDiscrepancias?.fecha || sol.fechaDespacho || sol.fecha;
                  const formattedDate = dateStr
                    ? new Date(dateStr).toLocaleString('es-MX', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })
                    : 'Fecha no registrada';

                  const origenText = sol.sucursalDestino || sol.usuarioDestino || 'Bodega';
                  const receptorText = sol.usuarioReceptor || sol.usuarioRecepcion || sol.reporteDiscrepancias?.usuarioReceptor || currentUser?.username || 'Sucursal';

                  return (
                    <div
                      key={sol.id}
                      onClick={() => setDetailSolicitud(sol)}
                      className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-3.5 hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all cursor-pointer group ios-card-hover active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-lg font-bold font-mono tracking-tight text-emerald-700 dark:text-emerald-400">
                              {sol.resolucionFaltantes?.folioEnvio || sol.folio || formatTransferFolio(sol)}
                            </h4>
                            {Boolean(sol.esTransferenciaInterna || (sol.sucursalOrigen && sol.sucursalOrigen === sol.sucursalDestino)) && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-transparent text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                                Transferencia Interna
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                              isIncompleta
                                ? 'bg-red-50 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                                : isFaltantesCerrados
                                ? 'bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                                : 'bg-emerald-50 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                            }`}>
                              {isIncompleta
                                ? 'Incompleta con Faltantes'
                                : isFaltantesCerrados
                                ? 'Cerrada con Faltantes'
                                : 'Recibida Completa'}
                            </span>
                            {(sol.sinSolicitud || sol.esDespachoDirecto) && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-transparent text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-600 uppercase tracking-wider">
                                Despacho Directo
                              </span>
                            )}
                            {pendingSyncIds.has(sol.id) && (
                              <span
                                title="En cola para sincronizar al recuperar conexión"
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1 whitespace-nowrap"
                              >
                                <Clock className="w-2.5 h-2.5 shrink-0" />
                                <span>En cola</span>
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {formatOrderRequestedBy(sol, usersList)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Enviado desde: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{origenText}{sol.areaDestino ? ` (${sol.areaDestino})` : ''}</strong>
                          </p>
                          {(() => {
                            const obsRec = typeof sol.observacionesRecepcion === 'string' ? sol.observacionesRecepcion.trim() : sol.observacionesRecepcion;
                            const rawOrderObs = sol.observaciones || sol.motivo || sol.notas;
                            const obsOrder = typeof rawOrderObs === 'string' ? rawOrderObs.trim() : rawOrderObs;
                            const obs = obsRec || obsOrder;
                            const isDirect = Boolean(sol.sinSolicitud || sol.esDespachoDirecto);
                            const isGeneric = isDirect && !obsRec && (!obs || obs === 'Pedido despachado sin haber sido solicitado' || obs === 'Pedido despachado sin haber sido solicitado.');
                            if (!obs || isGeneric) return null;
                            return (
                              <div className="flex items-start gap-1.5 text-xs mt-1">
                                <AlertCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-[3px]" />
                                <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-relaxed">
                                  <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                    Observaciones:
                                  </span>
                                  <span className="font-normal text-slate-600 dark:text-slate-300 break-words min-w-0 max-w-full whitespace-pre-line">
                                    {obs}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
                            <span>Recibió: <strong className="text-slate-600 dark:text-slate-300 font-medium">{receptorText}</strong></span>
                            <span>&bull;</span>
                            <span>{totalItems} producto{totalItems === 1 ? '' : 's'} ({totalUnits} pzas)</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 hidden sm:inline">
                            {formattedDate}
                          </span>
                          <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2 text-center text-xs text-slate-400">
                  <span>Mostrando {visibleHistory.length} de {filteredHistory.length} transferencias recibidas</span>
                </div>

                {hasMoreHistory && (
                  <div className="pt-1 flex justify-center">
                    <button
                      type="button"
                      onClick={handleLoadMoreHistory}
                      disabled={isLoadingMoreHistory}
                      className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-2xl shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isLoadingMoreHistory ? (
                        <>
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                          <span>Cargando más transferencias...</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                          <span>Cargar más ({filteredHistory.length - visibleHistory.length} restantes)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {!hasMoreHistory && filteredHistory.length > 0 && (
                  <p className="text-center text-[11px] text-slate-400 pt-2 pb-2">
                    Has llegado al final del historial ({filteredHistory.length} transferencias en total)
                  </p>
                )}
              </div>
            )}
          </div>
        )
      ) : isReDespacho ? (
        <div key={selectedOrder.id} className="space-y-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-200/80 shadow-sm space-y-3">
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

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
                {selectedOrder.resolucionFaltantes?.folioEnvio || selectedOrder.folio || formatTransferFolio(selectedOrder)}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Verifica los productos nuevos enviados en esta caja. Lo recibido en la entrega anterior se mantiene conservado y bloqueado.
              </p>
            </div>

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

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
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

                          {Boolean(motivoSucursalItem) && (
                            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-rose-950 bg-rose-50/90 px-2.5 py-1 rounded-xl border border-rose-200/80">
                              <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span className="font-bold text-rose-900 text-[11px]">Motivo reporte:</span>
                              <span className="italic font-medium text-rose-900 break-words">&ldquo;{motivoSucursalItem}&rdquo;</span>
                            </div>
                          )}

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

                    {showObsField ? (
                      <div className="pt-2.5 border-t border-purple-100 sm:pl-9" onClick={(e) => e.stopPropagation()}>
                        <FloatingInput
                          label={isUnderReceived ? 'Motivo / observación de este faltante' : 'Observación / nota del producto'}
                          required={isUnderReceived}
                          value={newFaltanteObservations[idx] || ''}
                          onChange={(e) => handleNewFaltanteObservationChange(idx, e.target.value)}
                          placeholder={
                            isUnderReceived
                              ? "Ej. Faltante físico en el reenvío, pieza rota o dañada..."
                              : "Observación opcional sobre este producto..."
                          }
                          icon={FileText}
                          endAdornment={!isUnderReceived ? (
                            <button
                              type="button"
                              onClick={() => {
                                const newObs = { ...newFaltanteObservations };
                                delete newObs[idx];
                                setNewFaltanteObservations(newObs);
                                setActiveFaltanteObservationIndex(null);
                              }}
                              className="w-6 h-6 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="Cancelar observación"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
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
                    <button
                      type="button"
                      onClick={() => requestConfirmListoFaltantes(true)}
                      className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Volver a Reportar a Bodega</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => requestConfirmListoFaltantes(false)}
                      className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0" />
                      <span>Cerrar Pedido con Faltantes</span>
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
                  onClick={() => requestConfirmListoFaltantes(false)}
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
            {(() => {
              const rawObs = selectedOrder.observaciones || selectedOrder.motivo || selectedOrder.notas;
              const obs = typeof rawObs === 'string' ? rawObs.trim() : rawObs;
              const isDirect = Boolean(selectedOrder.sinSolicitud || selectedOrder.esDespachoDirecto);
              const isGenericDirectObs = isDirect && (!obs || obs === 'Pedido despachado sin haber sido solicitado' || obs === 'Pedido despachado sin haber sido solicitado.');
              if (!obs || isGenericDirectObs) return null;
              return (
                <div className="flex items-start gap-1.5 pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-[3px]" />
                  <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-relaxed">
                    <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      Observación del Despacho:
                    </span>
                    <span className="font-normal text-slate-600 dark:text-slate-300 break-words min-w-0 max-w-full whitespace-pre-line">
                      {obs}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

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

              const ajusteDespachoItem = !item.esExtra
                ? selectedOrder.ajustesDespacho?.find(a =>
                    (a.codigo && item.codigo && String(a.codigo) === String(item.codigo)) ||
                    (a.descripcion && item.descripcion && a.descripcion.toLowerCase() === item.descripcion.toLowerCase())
                  )
                : null;

              const rawItemMotivo =
                item.motivoAjusteDespacho ||
                item.motivo ||
                item.motivoAjuste ||
                item.motivoParcial ||
                ajusteDespachoItem?.motivo ||
                ajusteDespachoItem?.motivoAjusteDespacho;
              const itemMotivo = typeof rawItemMotivo === 'string' ? rawItemMotivo.trim() : rawItemMotivo;

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

                          {hasDiffSolicitadoDespachado && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${
                              cantDespachada < cantSolicitada
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-blue-100 text-blue-800 border-blue-200'
                            }`}>
                              {cantDespachada} despachadas ({cantSolicitada} solicitadas)
                            </span>
                          )}

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

                        {itemMotivo && (
                          <div className="mt-1.5 w-fit max-w-full flex items-start gap-1.5 text-xs text-amber-950 bg-amber-50/90 px-2.5 py-1 rounded-xl border border-amber-200/80">
                            <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-[2px]" />
                            <span className="italic font-medium text-amber-900 break-words min-w-0 max-w-full whitespace-pre-line">
                              &ldquo;{itemMotivo}&rdquo;
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                      <QuantityStepper
                        value={current}
                        min={0}
                        onChange={(newQty) => handleQuantityChange(index, newQty)}
                        onDelete={() => handleQuantityChange(index, 0)}
                      />
                    </div>
                  </div>

                  {(hasDiscrepancy || activeObservationIndex === index) ? (
                    <div className="pt-2.5 border-t border-slate-100 sm:pl-9" onClick={(e) => e.stopPropagation()}>
                      <FloatingInput
                        label={hasDiscrepancy ? 'Motivo del faltante o discrepancia' : 'Observación / nota del producto'}
                        required={hasDiscrepancy}
                        value={itemObservations[index] || ''}
                        onChange={(e) => handleObservationChange(index, e.target.value)}
                        placeholder={
                          hasDiscrepancy
                            ? "Ej: Faltaron piezas físicas en caja, empaque quebrado, caducado..."
                            : "Observación opcional sobre este producto..."
                        }
                        icon={FileText}
                        endAdornment={!hasDiscrepancy ? (
                          <button
                            type="button"
                            onClick={() => {
                              const newObs = { ...itemObservations };
                              delete newObs[index];
                              setItemObservations(newObs);
                              setActiveObservationIndex(null);
                            }}
                            className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
                            title="Cancelar observación"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
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

      <DiscrepancySummaryModal
        isOpen={isDiscrepancyModalOpen}
        onClose={() => setIsDiscrepancyModalOpen(false)}
        onConfirm={handleConfirmDiscrepancies}
        solicitud={selectedOrder}
        discrepancias={discrepanciesToReport}
        usuarioReceptor={currentUser?.username}
      />

      <ModalDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
        onClose={closeDialog}
      />

      <TransferDetailModal
        isOpen={Boolean(detailSolicitud)}
        solicitud={detailSolicitud}
        onClose={() => setDetailSolicitud(null)}
      />
    </div>
  );
});
