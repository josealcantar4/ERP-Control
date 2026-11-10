/**
 * Módulo principal para la gestión, surtido físico, control de faltantes, agregados extra y confirmación de transferencias salientes.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Plus,
  Clock,
  Search,
  ScanBarcode,
  Truck,
  Check,
  ChevronRight,
  Trash2,
  Loader2,
  X,
  PackagePlus,
  Minus,
  FileText,
  AlertTriangle,
  History,
  ChevronDown
} from 'lucide-react';
import { transferService, formatTransferFolio, canUserDispatch, playCheckSound, playOrderSuccessSound, formatOrderRequestedBy } from '../transferencias';
import { userService } from '../usuarios/userService';
import { catalogService } from '../catalogo/catalogService';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { AutoScrollInput } from '../../shared/AutoScrollInput';
import { MarqueeText } from '../../shared/MarqueeText';
import { TransferDetailModal } from '../transferencias/TransferDetailModal';
import { DespacharFaltantesModal } from './DespacharFaltantesModal';
import { DespachoDirectoModal } from './DespachoDirectoModal';
import { transitionView, QuantityStepper, MarqueeSearchInput, FloatingInput } from '../../shared';
import { useModalAnimation } from '../../hooks';

export const DespacharModule = React.memo(function DespacharModule({ currentUser, onBack, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => {
    const list = transferService.getLocalSolicitudes() || [];
    return list.filter(s => canUserDispatch(s, currentUser));
  });
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [detailSolicitud, setDetailSolicitud] = useState(null);
  const [selectedFaltanteSolicitud, setSelectedFaltanteSolicitud] = useState(null);
  const [isLoadingSolicitudes, setIsLoadingSolicitudes] = useState(() => {
    return (transferService.getLocalSolicitudes() || []).length === 0;
  });

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('erp_despachar_active_tab') || 'despachar';
  });

  const [historySearch, setHistorySearch] = useState('');
  const [historyLimit, setHistoryLimit] = useState(15);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [isHistorialInitialLoading, setIsHistorialInitialLoading] = useState(false);
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    const unsub = userService.subscribeUsers((list) => {
      setUsersList(list);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);
  const sentinelRef = useRef(null);

  const handleSwitchTab = (newTab) => {
    if (newTab === activeTab) return;
    const direction = newTab === 'historial' ? 'forward' : 'back';
    if (newTab === 'historial') {
      setIsHistorialInitialLoading(true);
      setHistoryLimit(15);
      setTimeout(() => setIsHistorialInitialLoading(false), 220);
    }
    transitionView(() => {
      setActiveTab(newTab);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, { direction });
  };

  useEffect(() => {
    localStorage.setItem('erp_despachar_active_tab', activeTab);
  }, [activeTab]);

  const [isProcessing, setIsProcessing] = useState(false);

  const [dispatchFolioDigits, setDispatchFolioDigits] = useState('');
  const folioDebounceRef = useRef(null);
  const justificationDebounceRef = useRef({});

  useEffect(() => {
    return () => {
      if (folioDebounceRef.current) clearTimeout(folioDebounceRef.current);
      Object.keys(justificationDebounceRef.current).forEach((k) => {
        clearTimeout(justificationDebounceRef.current[k]);
      });
    };
  }, []);

  const handleInputScrollIntoView = (e) => {
    const el = e.currentTarget || e.target;
    setTimeout(() => {
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  };

  const flushPendingJustifications = (orderId = selectedSolicitud?.id) => {
    if (!orderId) return;
    const pendingIndexes = Object.keys(justificationDebounceRef.current);
    if (pendingIndexes.length === 0) return;

    pendingIndexes.forEach((idxStr) => {
      clearTimeout(justificationDebounceRef.current[idxStr]);
      const idx = Number(idxStr);
      const it = selectedSolicitud?.items?.[idx];
      if (it) {
        const qtyDesp = it.cantidadDespachada !== undefined ? it.cantidadDespachada : it.cantidadSolicitada;
        transferService.updateItemDespachoQty(orderId, idx, qtyDesp, it.motivoAjusteDespacho, selectedSolicitud.items);
      }
    });
    justificationDebounceRef.current = {};
  };

  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQtyModalOpen, setIsQtyModalOpen] = useState(false);

  const [isDirectDispatchOpen, setIsDirectDispatchOpen] = useState(false);

  const handleSelectSolicitud = (sol) => {
    if (!sol && selectedSolicitud?.id) {
      flushPendingJustifications(selectedSolicitud.id);
    }
    const direction = sol ? 'forward' : 'back';
    const latestSol = sol
      ? (transferService.getLocalSolicitudes().find(s => s.id === sol.id) || sol)
      : null;
    transitionView(() => {
      setSelectedSolicitud(latestSol);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (latestSol) {
        const initialDigits = latestSol.folio ? String(latestSol.folio).replace(/^TR/i, '') : '';
        setDispatchFolioDigits(initialDigits);
        if (latestSol.id) {
          sessionStorage.setItem('erp_despachar_solicitud_id', latestSol.id);
        }
      } else {
        setDispatchFolioDigits('');
        sessionStorage.removeItem('erp_despachar_solicitud_id');
      }
    }, { direction });
  };

  const [extraQuery, setExtraQuery] = useState('');
  const [extraResults, setExtraResults] = useState([]);
  const [selectedExtraItem, setSelectedExtraItem] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    variant: 'primary',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    inputValue: '',
    inputPlaceholder: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false, children: null }));
  };

  const isAdmin =
    currentUser?.username?.toLowerCase() === 'administrador' ||
    currentUser?.roles?.includes('admin');

  const openOrderById = useCallback((targetId) => {
    if (!targetId) return;
    const all = (solicitudes && solicitudes.length > 0)
      ? solicitudes
      : (transferService.getLocalSolicitudes() || []).filter(s => canUserDispatch(s, currentUser));
    const target = all.find(s => s.id === targetId);
    if (!target) return;

    const hasUnresolvedFaltantes = Boolean(
      target.estado === 'recibida_incompleta' ||
      (target.reporteFaltantes?.length > 0 && !target.resolucionFaltantes) ||
      (target.reporteDiscrepancias && !target.reporteDiscrepancias.resuelto && !target.resolucionFaltantes)
    );

    if (hasUnresolvedFaltantes) {
      setSelectedFaltanteSolicitud(target);
      setSelectedSolicitud(null);
      setDetailSolicitud(null);
      sessionStorage.removeItem('erp_despachar_solicitud_id');
      transferService.dismissNotification(`tr-falt-${target.id}`);
    } else if (
      target.estado === 'recibida' ||
      target.estado === 'completada' ||
      target.estado === 'cerrada_con_faltantes' ||
      target.estado === 'faltantes_despachados'
    ) {
      setDetailSolicitud(target);
      setSelectedSolicitud(null);
      setSelectedFaltanteSolicitud(null);
      sessionStorage.removeItem('erp_despachar_solicitud_id');
      transferService.dismissNotification(`tr-falt-${target.id}`);
      transferService.dismissNotification(`tr-falt-entregados-${target.id}`);
    } else if (target.estado === 'enviada' || target.estado === 'en_despacho') {
      handleSelectSolicitud(target);
      setSelectedFaltanteSolicitud(null);
      setDetailSolicitud(null);
    }
  }, [solicitudes, currentUser]);

  useEffect(() => {
    const handleOpenEvent = (e) => {
      const detail = e.detail;
      if (detail && detail.screen === 'despachar' && detail.orderId) {
        openOrderById(detail.orderId);
      }
    };
    window.addEventListener('erp_open_solicitud', handleOpenEvent);
    return () => window.removeEventListener('erp_open_solicitud', handleOpenEvent);
  }, [openOrderById]);

  useEffect(() => {
    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      const filtered = list.filter(s => canUserDispatch(s, currentUser));

      setSolicitudes(filtered);
      setIsLoadingSolicitudes(false);

      const savedId = sessionStorage.getItem('erp_despachar_solicitud_id');
      const targetId = selectedSolicitud?.id || savedId;
      if (targetId) {
        const refreshed = filtered.find(s => s.id === targetId);
        if (refreshed) {
          if (
            refreshed.estado === 'recibida' ||
            refreshed.estado === 'completada' ||
            refreshed.estado === 'cerrada_con_faltantes' ||
            refreshed.estado === 'faltantes_despachados'
          ) {
            setDetailSolicitud(refreshed);
            setSelectedSolicitud(null);
            sessionStorage.removeItem('erp_despachar_solicitud_id');
            transferService.dismissNotification(`tr-falt-${refreshed.id}`);
            transferService.dismissNotification(`tr-falt-entregados-${refreshed.id}`);
          } else if (refreshed.estado === 'recibida_incompleta') {
            setSelectedFaltanteSolicitud(refreshed);
            setSelectedSolicitud(null);
            sessionStorage.removeItem('erp_despachar_solicitud_id');
            transferService.dismissNotification(`tr-falt-${refreshed.id}`);
          } else if (refreshed.estado === 'enviada' || refreshed.estado === 'en_despacho') {
            setSelectedSolicitud(prev => {
              if (!prev || prev.id !== refreshed.id) return refreshed;
              return {
                ...refreshed,
                folio: prev.folio || refreshed.folio,
                items: (refreshed.items || []).map((it, idx) => {
                  const localIt = prev.items?.[idx];
                  if (!localIt) return it;
                  return {
                    ...it,
                    atendido: localIt.atendido !== undefined ? localIt.atendido : it.atendido,
                    cantidadDespachada: localIt.cantidadDespachada !== undefined ? localIt.cantidadDespachada : it.cantidadDespachada,
                    motivoAjusteDespacho: localIt.motivoAjusteDespacho !== undefined ? localIt.motivoAjusteDespacho : it.motivoAjusteDespacho
                  };
                })
              };
            });
            setDispatchFolioDigits(prev => {
              if (prev) return prev;
              return refreshed.folio ? String(refreshed.folio).replace(/^TR/i, '') : '';
            });
          }
        } else if (!filtered.some(s => s.id === targetId)) {
          sessionStorage.removeItem('erp_despachar_solicitud_id');
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser, selectedSolicitud?.id, isAdmin]);

  const handleDeleteDraft = (e, sol) => {
    e.stopPropagation();
    const canDelete = isAdmin || sol.usuarioSolicitante === currentUser?.username;

    if (!canDelete) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Acción no permitida',
        message: 'Solo el creador original del borrador o un Administrador tienen permiso para eliminarlo.',
        variant: 'danger',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Eliminar Borrador',
      message: `¿Estás seguro de eliminar el borrador de ${sol.sucursalOrigen} (${sol.folio || 'Sin Folio'})?`,
      variant: 'danger',
      confirmText: 'Eliminar Borrador',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          await transferService.deleteDraft(sol.id, currentUser);
        } catch (err) {
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Error',
            message: err.message,
            variant: 'danger',
            confirmText: 'Entendido',
            onConfirm: closeDialog
          });
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  const readyToDispatch = solicitudes.filter(s => s.estado === 'enviada' || s.estado === 'en_despacho');
  const reportesIncompletos = solicitudes.filter(
    s =>
      s.estado === 'recibida_incompleta' ||
      (s.reporteFaltantes && s.reporteFaltantes.length > 0 && !s.resolucionFaltantes && s.estado !== 'cerrada_con_faltantes' && s.estado !== 'faltantes_despachados')
  );
  const inProgressDrafts = solicitudes.filter(s => s.estado === 'borrador');
  const completedSolicitudes = solicitudes.filter(
    s =>
      s.estado === 'completada' ||
      s.estado === 'recibida' ||
      s.estado === 'faltantes_despachados' ||
      s.estado === 'cerrada_con_faltantes' ||
      s.estado === 'recibida_incompleta'
  );

  const sortedCompleted = useMemo(() => {
    return [...completedSolicitudes].sort((a, b) => {
      const dateA = new Date(a.fechaDespacho || a.fechaRecepcion || a.fecha || 0).getTime();
      const dateB = new Date(b.fechaDespacho || b.fechaRecepcion || b.fecha || 0).getTime();
      return dateB - dateA;
    });
  }, [completedSolicitudes]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return sortedCompleted;
    return sortedCompleted.filter(sol => {
      const folio = (sol.folio || formatTransferFolio(sol) || '').toLowerCase();
      const sucursal = (sol.sucursalOrigen || '').toLowerCase();
      const solicitante = (sol.usuarioSolicitante || '').toLowerCase();
      const itemsMatch = sol.items?.some(it => 
        (it.descripcion || '').toLowerCase().includes(q) ||
        (it.codigo || '').toLowerCase().includes(q)
      );
      return folio.includes(q) || sucursal.includes(q) || solicitante.includes(q) || itemsMatch;
    });
  }, [sortedCompleted, historySearch]);

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
    }, 300);
  }, [isLoadingMoreHistory]);

  const handleSearchChange = (val) => {
    setHistorySearch(val);
    setHistoryLimit(15);
  };

  useEffect(() => {
    if (activeTab !== 'historial' || !hasMoreHistory || isLoadingMoreHistory) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        handleLoadMoreHistory();
      }
    }, { rootMargin: '150px' });

    const el = sentinelRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [activeTab, hasMoreHistory, isLoadingMoreHistory, handleLoadMoreHistory]);

  const handleConfirmFaltantesResolution = async (resolutionData) => {
    if (!selectedFaltanteSolicitud) return;

    setIsProcessing(true);
    try {
      await transferService.resolveReporteFaltantes(selectedFaltanteSolicitud.id, {
        ...resolutionData,
        usuarioResolucion: currentUser?.username || 'bodega'
      });
      playOrderSuccessSound();
      const targetSol = selectedFaltanteSolicitud;
      setSelectedFaltanteSolicitud(null);

      const hasDispatched = resolutionData.itemsResolucion.some(i => i.despachado);
      setDialog({
        isOpen: true,
        type: 'alert',
        title: hasDispatched ? 'Faltantes Despachados' : 'Reporte Cerrado',
        message: hasDispatched
          ? `Se registraron los productos faltantes como despachados para ${targetSol.sucursalOrigen}. La sucursal podrá recibirlos en su módulo.`
          : `El reporte de faltantes para ${targetSol.sucursalOrigen} ha sido cerrado sin envío. Queda registrado en el historial.`,
        variant: 'success',
        confirmText: 'Aceptar',
        onConfirm: closeDialog
      });
    } catch (err) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Error',
        message: err.message || 'No se pudo procesar la resolución de faltantes.',
        variant: 'danger',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleItem = async (index) => {
    if (!selectedSolicitud) return;
    const item = selectedSolicitud.items?.[index];
    const willBeChecked = !item?.atendido;
    if (willBeChecked) {
      playCheckSound();
    }

    const updatedItems = (selectedSolicitud.items || []).map((it, idx) => {
      if (idx === index) {
        return { ...it, atendido: willBeChecked };
      }
      return it;
    });
    const newEstado = selectedSolicitud.estado === 'enviada' ? 'en_despacho' : selectedSolicitud.estado;
    const updatedSol = {
      ...selectedSolicitud,
      items: updatedItems,
      estado: newEstado
    };

    setSelectedSolicitud(updatedSol);
    setSolicitudes(prev => prev.map(s => s.id === updatedSol.id ? updatedSol : s));

    await transferService.toggleItemAtendido(selectedSolicitud.id, index, willBeChecked, updatedItems);
  };

  const resetExtraModal = () => {
    setIsExtraModalOpen(false);
    setIsQtyModalOpen(false);
    setExtraQuery('');
    setExtraResults([]);
    setSelectedExtraItem(null);
  };

  const handleExecuteSearch = async (e) => {
    if (e) e.preventDefault();
    const query = extraQuery.trim();
    
    if (!query) {
      setExtraResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const exactItem = await catalogService.findByBarcode(query);
      if (exactItem) {
        handleSelectExtraItem(exactItem);
        setIsSearching(false);
        return;
      }

      const results = await catalogService.searchMedicines(query);
      setExtraResults(results || []);
    } catch (err) {
      console.error('Error al buscar producto:', err);
      setExtraResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectExtraItem = (item) => {
    setSelectedExtraItem(item);
    setExtraQuery('');
    setExtraResults([]);
    setIsExtraModalOpen(false);
    setIsQtyModalOpen(true);
  };

  const handleConfirmQuantity = async (qty) => {
    if (!selectedExtraItem || !selectedSolicitud) return;

    setIsProcessing(true);
    try {
      if (selectedExtraItem.codigo && selectedExtraItem.descripcion) {
        await catalogService.saveToCleanCatalog(
          selectedExtraItem.codigo,
          selectedExtraItem.descripcion
        );
      }

      const newItem = {
        codigo: selectedExtraItem.codigo,
        descripcion: selectedExtraItem.descripcion,
        cantidadSolicitada: 0,
        cantidadDespachada: Number(qty || 1),
        esExtra: true,
        atendido: true
      };
      const updatedItems = [...(selectedSolicitud.items || []), newItem];
      const updatedSol = { ...selectedSolicitud, items: updatedItems };
      setSelectedSolicitud(updatedSol);
      setSolicitudes(prev => prev.map(s => s.id === updatedSol.id ? updatedSol : s));

      await transferService.addExtraItem(selectedSolicitud.id, {
        codigo: selectedExtraItem.codigo,
        descripcion: selectedExtraItem.descripcion,
        cantidad: qty
      });
      playCheckSound();
      resetExtraModal();
    } catch (err) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Error',
        message: err.message || 'No se pudo agregar el producto extra.',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveExtraItem = async (e, index) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const item = selectedSolicitud?.items?.[index];
    const itemName = item?.descripcion ? `"${item.descripcion}"` : 'este producto extra';

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: '¿Eliminar producto extra?',
      message: `¿Estás seguro que deseas quitar ${itemName} de la lista de envío?`,
      variant: 'danger',
      confirmText: 'Sí, quitar',
      cancelText: 'Conservar',
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          const updatedItems = (selectedSolicitud.items || []).filter((_, i) => i !== index);
          const updatedSol = { ...selectedSolicitud, items: updatedItems };
          setSelectedSolicitud(updatedSol);
          setSolicitudes(prev => prev.map(s => s.id === updatedSol.id ? updatedSol : s));
          await transferService.removeExtraItem(selectedSolicitud.id, index);
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  const handleUpdateExtraQty = async (index, newQty) => {
    if (!selectedSolicitud) return;
    if (newQty <= 0) {
      handleRemoveExtraItem(null, index);
      return;
    }
    const item = selectedSolicitud.items?.[index];
    if (!item || !item.esExtra) return;
    const updatedItems = [...selectedSolicitud.items];
    updatedItems[index] = { ...item, cantidadDespachada: newQty };
    const updatedSol = { ...selectedSolicitud, items: updatedItems };
    setSelectedSolicitud(updatedSol);
    setSolicitudes(prev => prev.map(s => s.id === updatedSol.id ? updatedSol : s));
    await transferService.updateExtraItemQty(selectedSolicitud.id, index, newQty);
  };

  const handleUpdateRequestedItemQty = async (index, newQty) => {
    if (!selectedSolicitud) return;
    const item = selectedSolicitud.items?.[index];
    if (!item) return;
    const maxQty = item.cantidadSolicitada !== undefined ? Number(item.cantidadSolicitada) : 999999;
    const validQty = Math.max(0, Math.min(maxQty, Number(newQty)));

    const shouldBeAtendido = validQty > 0 ? true : item.atendido;

    const updatedItems = [...selectedSolicitud.items];
    updatedItems[index] = {
      ...item,
      cantidadDespachada: validQty,
      atendido: shouldBeAtendido
    };
    const newEstado = selectedSolicitud.estado === 'enviada' ? 'en_despacho' : selectedSolicitud.estado;
    const updatedSol = { ...selectedSolicitud, items: updatedItems, estado: newEstado };
    setSelectedSolicitud(updatedSol);
    setSolicitudes(prev => prev.map(s => s.id === updatedSol.id ? updatedSol : s));
    await transferService.updateItemDespachoQty(selectedSolicitud.id, index, validQty, item.motivoAjusteDespacho, updatedItems);
  };

  const handleUpdateItemJustification = (index, motivo) => {
    if (!selectedSolicitud) return;
    const item = selectedSolicitud.items?.[index];
    if (!item) return;

    const updatedItems = [...selectedSolicitud.items];
    updatedItems[index] = {
      ...item,
      motivoAjusteDespacho: motivo
    };
    const updatedSol = { ...selectedSolicitud, items: updatedItems };
    setSelectedSolicitud(updatedSol);
    setSolicitudes(prev => prev.map(s => s.id === updatedSol.id ? updatedSol : s));

    const qtyDesp = item.cantidadDespachada !== undefined ? item.cantidadDespachada : item.cantidadSolicitada;
    const currentOrderId = selectedSolicitud.id;

    if (justificationDebounceRef.current[index]) {
      clearTimeout(justificationDebounceRef.current[index]);
    }
    justificationDebounceRef.current[index] = setTimeout(() => {
      delete justificationDebounceRef.current[index];
      transferService.updateItemDespachoQty(currentOrderId, index, qtyDesp, motivo, updatedItems);
    }, 450);
  };

  const handleJustificationBlur = (index) => {
    if (justificationDebounceRef.current[index]) {
      clearTimeout(justificationDebounceRef.current[index]);
      delete justificationDebounceRef.current[index];
    }
    if (!selectedSolicitud) return;
    const item = selectedSolicitud.items?.[index];
    if (!item) return;
    const qtyDesp = item.cantidadDespachada !== undefined ? item.cantidadDespachada : item.cantidadSolicitada;
    transferService.updateItemDespachoQty(selectedSolicitud.id, index, qtyDesp, item.motivoAjusteDespacho, selectedSolicitud.items);
  };

  const handleExtraScanDetected = async (barcode, itemObject) => {
    setIsProcessing(true);

    try {
      const cleanBarcode = String(barcode || '').trim().replace(/\s+/g, '').replace(/\//g, '-');
      let item = itemObject;
      if (!item && cleanBarcode) {
        item = await catalogService.findByBarcode(cleanBarcode);
      }

      if (item) {
        handleSelectExtraItem(item);
      } else {
        setDialog({
          isOpen: true,
          type: 'prompt',
          title: 'Producto Extra no encontrado',
          message: `El código "${cleanBarcode}" no se encuentra registrado.\nEscribe el nombre del producto extra:`,
          inputPlaceholder: 'Ej. Solución Fisiológica 500ml',
          inputValue: '',
          confirmText: 'Seleccionar',
          cancelText: 'Cancelar',
          onConfirm: async () => {
            const desc = dialog.inputValue?.trim();
            closeDialog();
            if (desc) {
              const newItem = { codigo: cleanBarcode, descripcion: desc };
              handleSelectExtraItem(newItem);
              await catalogService.saveToCleanCatalog(cleanBarcode, desc);
            }
          },
          onCancel: closeDialog
        });
      }
    } catch (err) {
      console.error('Error procesando escaneo:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalizeDispatch = async () => {
    if (
      !selectedSolicitud ||
      selectedSolicitud.estado === 'recibida' ||
      selectedSolicitud.estado === 'completada' ||
      selectedSolicitud.estado === 'cerrada_con_faltantes'
    ) {
      return;
    }

    if (folioDebounceRef.current) {
      clearTimeout(folioDebounceRef.current);
      folioDebounceRef.current = null;
    }
    flushPendingJustifications(selectedSolicitud.id);

    if (!dispatchFolioDigits.trim()) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Folio Requerido',
        message: 'Debes ingresar el folio de transferencia generado en el otro sistema (TR...) para poder despachar.',
        variant: 'danger',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    const fullFolio = `TR${dispatchFolioDigits.trim()}`;
    const uninspectedItems = (selectedSolicitud.items || []).filter(i => !i.atendido);
    const allChecked = uninspectedItems.length === 0;

    const executeComplete = async () => {
      closeDialog();
      setIsProcessing(true);
      const currentSol = selectedSolicitud;
      try {
        const itemsFinal = (currentSol.items || []).map(item => {
          const despQty = item.cantidadDespachada !== undefined
            ? Number(item.cantidadDespachada)
            : (item.esExtra ? Number(item.cantidad || 1) : Number(item.cantidadSolicitada ?? 1));
          const motivoClean = item.motivoAjusteDespacho ? String(item.motivoAjusteDespacho).trim() : (item.motivo ? String(item.motivo).trim() : '');

          return {
            ...item,
            cantidadDespachada: despQty,
            ...(motivoClean ? { motivoAjusteDespacho: motivoClean, motivo: motivoClean } : {})
          };
        });

        const ajustesDespacho = itemsFinal
          .filter(i => !i.esExtra && i.cantidadDespachada < Number(i.cantidadSolicitada ?? 1))
          .map(i => ({
            codigo: i.codigo,
            descripcion: i.descripcion,
            cantidadSolicitada: Number(i.cantidadSolicitada ?? 1),
            cantidadDespachada: Number(i.cantidadDespachada),
            diferencia: Number(i.cantidadSolicitada ?? 1) - Number(i.cantidadDespachada),
            motivo: i.motivoAjusteDespacho || i.motivo || '',
            motivoAjusteDespacho: i.motivoAjusteDespacho || i.motivo || ''
          }));

        await transferService.completeSolicitud(currentSol.id, fullFolio, {
          items: itemsFinal,
          ajustesDespacho,
          usuarioDespachador: currentUser?.username || 'despacho'
        });
        playOrderSuccessSound();

        setDetailSolicitud({ ...currentSol, estado: 'completada', folio: fullFolio, items: itemsFinal, ajustesDespacho });
        setSelectedSolicitud(null);
        setDispatchFolioDigits('');
        sessionStorage.removeItem('erp_despachar_solicitud_id');
      } finally {
        setIsProcessing(false);
      }
    };

    if (!allChecked) {
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: 'Productos pendientes en caja',
        message: `Tienes ${uninspectedItems.length} producto${uninspectedItems.length === 1 ? '' : 's'} sin marcar como empacados en la caja física.\n¿Deseas finalizar y enviar el despacho con folio ${fullFolio} de todas formas?`,
        confirmText: 'Finalizar de todos modos',
        cancelText: 'Continuar empacando',
        variant: 'danger',
        children: (
          <div className="space-y-2 pt-1 text-left">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5 text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>Productos sin marcar ({uninspectedItems.length}):</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500 font-semibold">
                {uninspectedItems.reduce((acc, it) => {
                  const q = it.cantidadDespachada !== undefined
                    ? Number(it.cantidadDespachada)
                    : (it.esExtra ? Number(it.cantidad || 1) : Number(it.cantidadSolicitada || 1));
                  return acc + q;
                }, 0)} pzas totales
              </span>
            </div>

            <div className="max-h-48 sm:max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-red-200/80 bg-red-50/40 p-2 text-xs overscroll-contain shadow-2xs">
              {uninspectedItems.map((item, idx) => {
                const qty = item.cantidadDespachada !== undefined
                  ? Number(item.cantidadDespachada)
                  : (item.esExtra ? Number(item.cantidad || 1) : Number(item.cantidadSolicitada || 1));
                return (
                  <div key={idx} className="py-2 first:pt-1 last:pb-1 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 truncate block text-xs" title={item.descripcion}>
                          {item.descripcion}
                        </span>
                        {item.esExtra && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-700 uppercase">
                            Extra
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        Código: {item.codigo}
                      </span>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-xl font-mono text-xs font-extrabold bg-white text-red-700 border border-red-200 shadow-2xs">
                      {qty} pz
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ),
        onConfirm: executeComplete,
        onCancel: closeDialog
      });
      return;
    }

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Finalizar Despacho',
      message: `¿Confirmas que la caja con folio ${fullFolio} para ${selectedSolicitud.sucursalOrigen} está lista y empacada?`,
      confirmText: 'Confirmar y Despachar',
      cancelText: 'Revisar',
      variant: 'success',
      children: null,
      onConfirm: executeComplete,
      onCancel: closeDialog
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 relative">

      {isProcessing && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 animate-fade-in">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <span className="text-sm font-bold text-slate-800">Procesando...</span>
          </div>
        </div>,
        document.body
      )}

      <div className="sticky top-16 z-30 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 pt-2 pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => {
              if (selectedSolicitud) {
                handleSelectSolicitud(null);
              } else {
                onBack();
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{selectedSolicitud ? 'Volver a Pedidos' : 'Volver al Inicio'}</span>
          </button>

          {selectedSolicitud ? (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full truncate border border-slate-200/60 dark:border-slate-700/60">
              Despacho: <strong className="text-slate-800 dark:text-slate-200">{currentUser?.sede}{currentUser?.area ? ` (${currentUser.area})` : ''}</strong>
            </span>
          ) : (
            <div className="bg-slate-200/80 dark:bg-slate-800 p-1 rounded-full flex text-xs font-medium border border-transparent dark:border-slate-700/60 shrink-0">
              <button
                type="button"
                onClick={() => handleSwitchTab('despachar')}
                className={`px-3 py-1 rounded-full flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                  activeTab === 'despachar'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <span>Despachar</span>
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
                <span>Historial ({completedSolicitudes.length})</span>
              </button>
            </div>
          )}
        </div>

        {!selectedSolicitud && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
            <span>Punto de despacho: <strong className="text-slate-700 dark:text-slate-300">{currentUser?.sede}{currentUser?.area ? ` (${currentUser.area})` : ''}</strong></span>
          </div>
        )}

        {!selectedSolicitud && activeTab === 'historial' && (
          <div className="relative pt-0.5">
            <MarqueeSearchInput
              placeholder="Buscar en historial por folio, sucursal, producto o solicitante..."
              value={historySearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClear={() => handleSearchChange('')}
            />
          </div>
        )}
      </div>

      {!selectedSolicitud ? (
        <div className="space-y-6 animate-fade-in">
          {activeTab === 'despachar' ? (
            <div key="tab-despachar" className="space-y-6 animate-fade-in">

          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 rounded-3xl p-5 sm:p-6 text-white shadow-lg shadow-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-blue-100">
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Despacho Directo</span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                Despachar sin Solicitud Previa
              </h2>
              <p className="text-xs text-blue-100/90 max-w-md leading-relaxed">
                Arma y despacha una caja directamente hacia cualquier sucursal registrando su folio TR y la observación oficial del sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDirectDispatchOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-blue-700 hover:bg-blue-50 active:scale-95 rounded-2xl text-xs font-extrabold shadow-sm transition-all cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nuevo Despacho Directo</span>
            </button>
          </div>

          {reportesIncompletos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Atención: Reporte de Faltantes ({reportesIncompletos.length})
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full border border-red-200">
                  Pendientes por despachar
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {reportesIncompletos.map((sol) => (
                  <div key={sol.id} className="bg-red-50/70 rounded-3xl p-5 border border-red-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-red-950 font-mono text-sm sm:text-base">
                          Folio: {sol.folio || formatTransferFolio(sol)}
                        </span>
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-600 text-white uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                          <AlertTriangle className="w-3 h-3" />
                          Faltantes pendientes por despachar
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 uppercase">
                        Sucursal: {sol.sucursalOrigen}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-red-900">
                      Productos reportados con faltante / discrepancia:
                    </p>

                    <ul className="text-xs text-red-900 space-y-1.5 bg-white/80 p-3 rounded-2xl border border-red-200/70 divide-y divide-red-100">
                      {sol.reporteFaltantes?.map((faltante, i) => {
                        const cantF = faltante.cantidadFaltante !== undefined && faltante.cantidadFaltante !== null
                          ? Number(faltante.cantidadFaltante)
                          : (faltante.diferencia !== undefined ? Math.abs(Number(faltante.diferencia)) : 1);
                        const obs = faltante.observacion || faltante.motivoRecepcion || faltante.motivo;
                        return (
                          <li key={i} className="pt-1.5 first:pt-0 flex flex-col gap-1">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-semibold text-slate-800">&bull; {faltante.descripcion}</span>
                              <strong className="font-mono text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-lg border border-red-200 shrink-0">
                                Falta {cantF} pz{cantF === 1 ? '' : 's'}
                              </strong>
                            </div>
                            {obs && (
                              <div className="text-[11px] text-red-800 bg-red-50/90 px-2.5 py-1 rounded-xl border border-red-200/60 italic flex items-center gap-1.5">
                                <FileText className="w-3 h-3 text-red-600 shrink-0" />
                                <span>Motivo reportado: &ldquo;{obs}&rdquo;</span>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {(sol.reporteDiscrepancias?.observaciones || sol.observacionesRecepcion) && (
                      <div className="p-2.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-[11px]">Nota general de sucursal:</strong>
                          <p className="italic">&ldquo;{sol.reporteDiscrepancias?.observaciones || sol.observacionesRecepcion}&rdquo;</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-1 pt-2.5 border-t border-red-200/70 flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-[11px] text-red-700 italic">
                        Reporte pendiente de resolución o re-despacho desde Bodega.
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFaltanteSolicitud(sol);
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Atender Faltantes</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Listas para Despachar ({readyToDispatch.length})
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                Prioridad alta &bull; Enviadas por sucursal
              </span>
            </div>

            {isLoadingSolicitudes ? (
              <div className="grid grid-cols-1 gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3 animate-pulse">
                    <div className="h-5 bg-slate-200 rounded-xl w-1/3"></div>
                    <div className="h-4 bg-slate-100 rounded-xl w-1/2"></div>
                    <div className="h-6 bg-slate-100 rounded-2xl w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : readyToDispatch.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                <p className="text-sm font-semibold text-slate-700">Sin pedidos pendientes de surtido</p>
                <p className="text-xs text-slate-400">
                  Todas las transferencias solicitadas han sido atendidas.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {readyToDispatch.map((sol) => {
                  const totalItems = sol.items?.length || 0;
                  const attendedCount = sol.items?.filter(i => i.atendido).length || 0;
                  const percent = totalItems > 0 ? Math.round((attendedCount / totalItems) * 100) : 0;

                  return (
                    <div
                      key={sol.id}
                      onClick={() => handleSelectSolicitud(sol)}
                      className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group ios-card-hover"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-extrabold text-blue-700 font-mono">
                              {sol.folio ? `${sol.folio} — ${sol.sucursalOrigen}` : `${sol.sucursalOrigen} • Ref: ${formatTransferFolio(sol)}`}
                            </span>
                            {Boolean(sol.esTransferenciaInterna || (sol.sucursalOrigen && sol.sucursalOrigen === sol.sucursalDestino)) && (
                              <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-transparent border border-indigo-200 dark:border-indigo-500/30 px-2 py-0.5 rounded-full">
                                Transferencia Interna
                              </span>
                            )}
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                              {sol.estado === 'en_despacho' ? 'En Surtido' : 'Nueva Solicitud'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            {formatOrderRequestedBy(sol, usersList)}
                          </p>
                          {(sol.observaciones || sol.motivo || sol.notas) && (
                            <div className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/30 px-2.5 py-1 rounded-xl border border-amber-200/80 dark:border-amber-500/20 mt-1">
                              <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <span className="italic line-clamp-2">&ldquo;{sol.observaciones || sol.motivo || sol.notas}&rdquo;</span>
                            </div>
                          )}
                        </div>

                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-transparent text-blue-600 dark:text-blue-400 border border-transparent dark:border-blue-500/30 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {sol.items?.slice(0, 4).map((it, idx) => (
                          <span
                            key={idx}
                            className={`text-[11px] px-2.5 py-1 rounded-xl font-medium ${
                              it.atendido
                                ? 'bg-emerald-50 text-emerald-700 line-through opacity-70'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {it.cantidadSolicitada || it.cantidadDespachada}x {it.descripcion?.split('-')[0]}
                          </span>
                        ))}
                        {totalItems > 4 && (
                          <span className="text-[11px] text-slate-400 px-1 py-1 font-medium">
                            +{totalItems - 4} más
                          </span>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Progreso de caja: {attendedCount} de {totalItems} ítems</span>
                        <span className="font-semibold text-slate-800">{percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 tracking-tight">
                  En Proceso de Captura en Sucursales ({inProgressDrafts.length})
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Monitoreo en vivo &bull; Aún no enviadas
              </span>
            </div>

            {inProgressDrafts.length === 0 ? (
              <div className="bg-slate-100/70 dark:!bg-slate-900/40 rounded-3xl p-6 border border-slate-200/80 dark:!border-slate-800/80 text-center text-slate-500 dark:!text-slate-400 text-xs shadow-2xs backdrop-blur-xs">
                No hay sucursales armando borradores en este momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {inProgressDrafts.map((sol) => {
                  const canDelete = isAdmin || sol.usuarioSolicitante === currentUser?.username;

                  return (
                    <div
                      key={sol.id}
                      className="ios-card rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/80 shadow-sm flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {sol.folio ? `${sol.folio} (${sol.sucursalOrigen})` : `${sol.sucursalOrigen} • Ref: ${formatTransferFolio(sol)}`}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-transparent text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 uppercase tracking-wider">
                            Borrador en vivo
                          </span>
                          {sol.areaDestino && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-transparent px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-500/30">
                              {sol.areaDestino}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatOrderRequestedBy(sol, usersList)} &bull; ({sol.items?.length || 0} productos hasta ahora)
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {new Date(sol.fecha).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {canDelete && (
                          <button
                            onClick={(e) => handleDeleteDraft(e, sol)}
                            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-transparent dark:border-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                            title="Eliminar borrador"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            </div>
          ) : (
            <div key="tab-historial" className="space-y-4 animate-fade-in">
              {isHistorialInitialLoading || isLoadingSolicitudes ? (
                <div className="bg-white rounded-3xl p-10 border border-slate-200/80 shadow-sm text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">Cargando transferencias...</p>
                  <p className="text-[11px] text-slate-400">Consultando historial en tiempo real</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 border border-slate-200/80 shadow-sm text-center space-y-2">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-700">
                    {historySearch ? 'No se encontraron resultados' : 'Sin transferencias en el historial'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {historySearch
                      ? `No hay transferencias que coincidan con "${historySearch}".`
                      : 'Las transferencias completadas o recibidas por las sucursales aparecerán aquí.'}
                  </p>
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange('')}
                      className="mt-2 text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                    >
                      Ver todo el historial
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="space-y-2">
                    {visibleHistory.map((sol) => (
                      <div
                        key={sol.id}
                        onClick={() => setDetailSolicitud(sol)}
                        className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all text-xs flex items-center justify-between gap-3 text-slate-500 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-transparent text-emerald-600 dark:text-emerald-400 border border-transparent dark:border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm break-all">
                                {sol.folio || formatTransferFolio(sol)}
                              </span>
                              <span className="text-slate-700 font-semibold truncate">
                                {sol.sucursalOrigen}
                              </span>
                              {sol.areaOrigen && (
                                <span className="text-[10px] text-slate-400">
                                  ({sol.areaOrigen})
                                </span>
                              )}
                              {(sol.sinSolicitud || sol.esDespachoDirecto) && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-transparent text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                                  Directo
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                              <span className="whitespace-nowrap">{sol.items?.length || 0} producto(s)</span>
                              {sol.fecha && (
                                <>
                                  <span className="shrink-0">&bull;</span>
                                  <span className="font-mono whitespace-nowrap">
                                    {new Date(sol.fechaDespacho || sol.fecha).toLocaleDateString('es-MX', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </>
                              )}
                              {sol.usuarioSolicitante && (
                                <>
                                  <span className="shrink-0">&bull;</span>
                                  <span className="whitespace-nowrap">{formatOrderRequestedBy(sol, usersList)}</span>
                                </>
                              )}
                            </div>
                            {(sol.observaciones || sol.motivo || sol.notas) && (
                              <div className="flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/30 px-2.5 py-1 rounded-xl border border-amber-200/80 dark:border-amber-500/20 mt-1.5">
                                <FileText className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <span className="italic line-clamp-2">&ldquo;{sol.observaciones || sol.motivo || sol.notas}&rdquo;</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                            (sol.estado === 'recibida_incompleta' || (sol.reporteFaltantes?.length > 0 && !sol.resolucionFaltantes && sol.estado !== 'cerrada_con_faltantes' && sol.estado !== 'faltantes_despachados'))
                              ? 'bg-red-50 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                              : sol.estado === 'faltantes_despachados'
                              ? 'bg-purple-50 dark:bg-transparent text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                              : sol.estado === 'cerrada_con_faltantes'
                              ? 'bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                              : sol.estado === 'recibida'
                              ? 'bg-blue-50 dark:bg-transparent text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                              : 'bg-emerald-50 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                          }`}>
                            {(sol.estado === 'recibida_incompleta' || (sol.reporteFaltantes?.length > 0 && !sol.resolucionFaltantes && sol.estado !== 'cerrada_con_faltantes' && sol.estado !== 'faltantes_despachados'))
                              ? 'Incompleta'
                              : sol.estado === 'faltantes_despachados'
                              ? 'Faltantes en Tránsito'
                              : sol.estado === 'cerrada_con_faltantes'
                              ? 'Cerrada con Faltantes'
                              : sol.estado === 'recibida'
                              ? 'Recibida'
                              : 'Completada'}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 text-center text-xs text-slate-400">
                    <span>Mostrando {visibleHistory.length} de {filteredHistory.length} transferencias</span>
                  </div>

                  {hasMoreHistory && (
                    <div ref={sentinelRef} className="pt-2 pb-2 text-center">
                      <button
                        type="button"
                        disabled={isLoadingMoreHistory}
                        onClick={handleLoadMoreHistory}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-2xl border border-slate-200/80 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-60"
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
          )}

        </div>
      ) : (
        <div key={selectedSolicitud.id} className="space-y-4 animate-fade-in">

          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
                  Orden de Despacho & Surtido
                </span>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 font-mono break-all leading-tight">
                  {selectedSolicitud.folio ? `${selectedSolicitud.folio} - ${selectedSolicitud.sucursalOrigen}` : selectedSolicitud.sucursalOrigen}
                </h2>
                <p className="text-xs text-slate-500">
                  Solicitado por: <strong className="text-slate-800">{selectedSolicitud.usuarioSolicitante || 'Sucursal'}</strong>
                </p>
              </div>

              <button
                onClick={() => setIsExtraModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-2xl border border-blue-200 transition-colors shadow-sm cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Agregar Extras</span>
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span>Folio de Transferencia (del sistema)</span>
                  <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  Ingresa el número generado al transferir
                </p>
              </div>
              <div className="flex items-stretch shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:border-blue-500 max-w-xs bg-white">
                <div className="bg-slate-100 px-3.5 py-2 text-slate-600 font-bold text-sm border-r border-slate-200 flex items-center justify-center select-none font-mono">
                  TR
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dispatchFolioDigits}
                  placeholder="000123"
                  maxLength={12}
                  onFocus={handleInputScrollIntoView}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setDispatchFolioDigits(digits);
                    const fullFolio = digits ? `TR${digits}` : '';
                    setSelectedSolicitud(prev => prev ? ({ ...prev, folio: fullFolio }) : null);
                    if (folioDebounceRef.current) clearTimeout(folioDebounceRef.current);
                    folioDebounceRef.current = setTimeout(() => {
                      if (selectedSolicitud?.id) {
                        transferService.updateFolio(selectedSolicitud.id, fullFolio);
                      }
                    }, 400);
                  }}
                  className="w-full bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none font-mono tracking-wide"
                />
              </div>
            </div>

            {(() => {
              const total = selectedSolicitud.items?.length || 0;
              const checked = selectedSolicitud.items?.filter(i => i.atendido).length || 0;
              const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

              return (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                    <span>Lista de Empaque (Toca el producto)</span>
                    <span className="text-blue-600 font-mono">{checked} de {total} listos</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {selectedSolicitud.items?.map((item, index) => {
              const isExtra = Boolean(item.esExtra);
              const maxQty = isExtra ? undefined : Number(item.cantidadSolicitada ?? 1);
              const currentQty = item.cantidadDespachada !== undefined
                ? Number(item.cantidadDespachada)
                : (isExtra ? Number(item.cantidad || 1) : Number(item.cantidadSolicitada ?? 1));
              const hasFaltante = !isExtra && currentQty < maxQty;
              const isZero = currentQty === 0;

              return (
                <div
                  key={index}
                  className={`p-4 transition-colors ${
                    item.atendido ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    onClick={() => handleToggleItem(index)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                          item.atendido
                            ? 'bg-emerald-500 text-white shadow-sm scale-105'
                            : 'border-2 border-slate-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`text-sm font-semibold truncate ${
                              item.atendido
                                ? 'line-through text-slate-400'
                                : 'text-slate-900 font-bold'
                            }`}
                          >
                            {item.descripcion}
                          </h4>
                          {isExtra && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                              EXTRA
                            </span>
                          )}
                          {hasFaltante && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                              {isZero ? 'Sin existencias (0 pz)' : `Envío parcial (${currentQty}/${maxQty})`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                          <span>Código: {item.codigo}</span>
                          {!isExtra && (
                            <>
                              <span>•</span>
                              <span>Solicitadas: <strong>{maxQty} pz</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                      {isExtra ? (
                        <QuantityStepper
                          value={currentQty}
                          min={1}
                          onChange={(newVal) => handleUpdateExtraQty(index, newVal)}
                          onDelete={(e) => handleRemoveExtraItem(e, index)}
                          showDelete={true}
                        />
                      ) : (
                        <QuantityStepper
                          value={currentQty}
                          min={0}
                          max={maxQty}
                          onChange={(newVal) => handleUpdateRequestedItemQty(index, newVal)}
                          onDelete={() => handleUpdateRequestedItemQty(index, 0)}
                          showDelete={true}
                        />
                      )}
                    </div>
                  </div>

                  {hasFaltante && (
                    <div
                      className="mt-3 pt-3 border-t border-slate-200 sm:pl-9 transition-opacity duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FloatingInput
                        label="Motivo del ajuste / faltante (Opcional)"
                        value={item.motivoAjusteDespacho || ''}
                        onChange={(e) => handleUpdateItemJustification(index, e.target.value)}
                        onFocus={handleInputScrollIntoView}
                        onBlur={() => handleJustificationBlur(index)}
                        placeholder="Ej. Producto dañado en almacén o falta de stock temporal"
                        icon={FileText}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {(selectedSolicitud.estado === 'enviada' || selectedSolicitud.estado === 'en_despacho') ? (
            <div className="pt-2">
              <button
                onClick={handleFinalizeDispatch}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Truck className="w-5 h-5" />
                <span>Finalizar y Enviar Caja a Sucursal</span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-700">
                  Este pedido ya no está pendiente de despacho (Estado actual: <strong className="font-mono text-slate-900">{selectedSolicitud.estado}</strong>).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSolicitud(null)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Volver al listado
              </button>
            </div>
          )}

        </div>
      )}

      <ExtraProductModal
        isOpen={isExtraModalOpen}
        onClose={resetExtraModal}
        onOpenScanner={() => setIsScannerOpen(true)}
        extraQuery={extraQuery}
        setExtraQuery={setExtraQuery}
        handleExecuteSearch={handleExecuteSearch}
        isSearching={isSearching}
        extraResults={extraResults}
        onSelectExtraItem={handleSelectExtraItem}
      />

      <CaptureQuantityModal
        isOpen={isQtyModalOpen}
        onClose={resetExtraModal}
        scannedItem={selectedExtraItem}
        onConfirmQuantity={handleConfirmQuantity}
      />

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        isPaused={isQtyModalOpen || dialog.isOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleExtraScanDetected}
      />

      <ModalDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        inputValue={dialog.inputValue}
        inputPlaceholder={dialog.inputPlaceholder}
        onInputChange={(val) => setDialog(prev => ({ ...prev, inputValue: val }))}
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
      >
        {dialog.children}
      </ModalDialog>

      <TransferDetailModal
        isOpen={Boolean(detailSolicitud)}
        solicitud={detailSolicitud}
        onClose={() => {
          if (detailSolicitud?.id) {
            transferService.dismissNotification(`tr-falt-${detailSolicitud.id}`);
            transferService.dismissNotification(`tr-falt-entregados-${detailSolicitud.id}`);
          }
          setDetailSolicitud(null);
        }}
      />

      <DespacharFaltantesModal
        isOpen={Boolean(selectedFaltanteSolicitud)}
        solicitud={selectedFaltanteSolicitud}
        onClose={() => {
          if (selectedFaltanteSolicitud?.id) {
            transferService.dismissNotification(`tr-falt-${selectedFaltanteSolicitud.id}`);
          }
          setSelectedFaltanteSolicitud(null);
        }}
        onConfirmResolution={handleConfirmFaltantesResolution}
        isProcessing={isProcessing}
      />

      <DespachoDirectoModal
        isOpen={isDirectDispatchOpen}
        currentUser={currentUser}
        onClose={() => setIsDirectDispatchOpen(false)}
        onSuccess={(newDispatch) => {
          setDialog({
            isOpen: true,
            type: 'alert',
            variant: 'success',
            title: 'Despacho Realizado',
            message: `El pedido con folio ${newDispatch.folio} hacia ${newDispatch.sucursalOrigen} ha sido despachado exitosamente con la observación "Pedido despachado sin haber sido solicitado".`,
            confirmText: 'Aceptar',
            onConfirm: closeDialog
          });
        }}
      />

    </div>
  );
});

function ExtraProductModal({
  isOpen,
  onClose,
  onOpenScanner,
  extraQuery,
  setExtraQuery,
  handleExecuteSearch,
  isSearching,
  extraResults,
  onSelectExtraItem
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  if (!shouldRender) return null;

  const content = (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] overscroll-contain ${cardClass}`}
      >
        <div className="p-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Agregar Producto Extra</h3>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <button
            type="button"
            onClick={() => {
              handleClose();
              onOpenScanner();
            }}
            className="w-full py-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 border border-blue-200 transition-colors cursor-pointer"
          >
            <ScanBarcode className="w-4 h-4" />
            <span>Escanear código de barras</span>
          </button>

          <form onSubmit={handleExecuteSearch} className="flex gap-2 items-center">
            <div className="flex-1">
              <MarqueeSearchInput
                placeholder="Buscar por nombre o fármaco..."
                value={extraQuery}
                onChange={(e) => setExtraQuery(e.target.value)}
                icon={Search}
                onClear={() => {
                  setExtraQuery('');
                }}
                loading={isSearching}
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>Buscar</span>
              )}
            </button>
          </form>

          {extraResults.length > 0 && (
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
              {extraResults.map((med) => (
                <div
                  key={med.codigo}
                  onClick={() => onSelectExtraItem(med)}
                  className="p-3 text-xs hover:bg-blue-50 cursor-pointer text-slate-800 flex justify-between items-center transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <MarqueeText
                      text={med.descripcion}
                      className="font-semibold text-slate-900 text-xs block"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-white px-2 py-1 rounded-md border border-slate-100">
                    {med.codigo}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
