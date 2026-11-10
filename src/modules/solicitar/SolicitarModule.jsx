/**
 * Módulo para la creación de solicitudes de reabastecimiento mediante escaneo de códigos de barra o búsqueda manual de catálogo.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ScanBarcode, Send, Trash2, CheckCircle2, ArrowLeft, History, ChevronRight, Plus, Minus,
  Building2, Layers, Info, Search, X, Loader2, ChevronDown, Clock, FileText
} from 'lucide-react';
import { organizationService, normalizeStr } from '../usuarios/organizationService';
import { userService } from '../usuarios/userService';
import { catalogService } from '../catalogo/catalogService';
import { transferService, formatTransferFolio, canUserViewInSolicitar, playOrderSuccessSound, formatOrderRequestedBy } from '../transferencias';
import { TransferDetailModal } from '../transferencias/TransferDetailModal';
import { BulkOrderWarningModal } from './BulkOrderWarningModal';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { MarqueeText } from '../../shared/MarqueeText';
import { transitionView, MarqueeSearchInput } from '../../shared';

export const SolicitarModule = React.memo(function SolicitarModule({ currentUser, onBack, onRefresh }) {
  const [sedesList, setSedesList] = useState([]);
  const [areasList, setAreasList] = useState([]);
  const [selectedDestSede, setSelectedDestSede] = useState('');
  const [selectedDestSedeId, setSelectedDestSedeId] = useState('');
  const [selectedDestArea, setSelectedDestArea] = useState('');
  const [selectedDestAreaId, setSelectedDestAreaId] = useState('');
  const [detailSolicitud, setDetailSolicitud] = useState(null);
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    const unsub = userService.subscribeUsers((list) => {
      setUsersList(list);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const [currentDraft, setCurrentDraft] = useState({
    id: 'sol-' + Date.now(),
    sucursalOrigen: currentUser?.sede || 'Sucursal',
    areaOrigen: currentUser?.area || '',
    sucursalDestino: '',
    areaDestino: '',
    usuarioSolicitante: currentUser?.username,
    solicitanteNombre: currentUser?.nombre || currentUser?.username,
    usuarioDestino: '',
    observaciones: '',
    motivo: '',
    estado: 'borrador',
    fecha: new Date().toISOString(),
    items: []
  });

  const [savingStatus, setSavingStatus] = useState('saved');
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('erp_solicitar_active_tab') || 'captura';
  });

  const [historialList, setHistorialList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLimit, setHistoryLimit] = useState(15);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [isHistorialInitialLoading, setIsHistorialInitialLoading] = useState(false);
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
    }, { direction });
  };
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(false);
  const [scannedMedicine, setScannedMedicine] = useState(null);
  const [isBulkWarningOpen, setIsBulkWarningOpen] = useState(false);
  const [bulkWarningItems, setBulkWarningItems] = useState([]);

  const sortedHistory = useMemo(() => {
    return [...historialList].sort((a, b) => {
      if (a.estado === 'borrador' && b.estado !== 'borrador') return -1;
      if (b.estado === 'borrador' && a.estado !== 'borrador') return 1;
      const dateA = new Date(a.fecha || 0).getTime();
      const dateB = new Date(b.fecha || 0).getTime();
      return dateB - dateA;
    });
  }, [historialList]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return sortedHistory;
    return sortedHistory.filter(sol => {
      const folio = (sol.folio || formatTransferFolio(sol) || '').toLowerCase();
      const destSede = (sol.sucursalDestino || '').toLowerCase();
      const destArea = (sol.areaDestino || '').toLowerCase();
      const itemsMatch = sol.items?.some(it => 
        (it.descripcion || '').toLowerCase().includes(q) ||
        (it.codigo || '').toLowerCase().includes(q)
      );
      return folio.includes(q) || destSede.includes(q) || destArea.includes(q) || itemsMatch;
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

  useEffect(() => {
    localStorage.setItem('erp_solicitar_active_tab', activeTab);
  }, [activeTab]);

  const [dialog, setDialog] = useState({
    isOpen: false, type: 'alert', title: '', message: '', variant: 'primary', confirmText: 'Aceptar', onConfirm: () => {}
  });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    const unsubSedes = organizationService.subscribeSedes((sedes) => {
      setSedesList(sedes);
    });
    const unsubAreas = organizationService.subscribeAreas((areas) => {
      setAreasList(areas);
    });

    async function init() {
      const draft = await transferService.getActiveDraft(currentUser.username);
      if (draft && draft.items && draft.items.length > 0) {
        setCurrentDraft(prev => {
          if (prev.items && prev.items.length > 0) return prev;
          if (draft.sucursalDestino) {
            setSelectedDestSede(draft.sucursalDestino);
            setSelectedDestSedeId(draft.sucursalDestinoId || '');
          }
          if (draft.areaDestino) {
            setSelectedDestArea(draft.areaDestino);
            setSelectedDestAreaId(draft.areaDestinoId || '');
          }
          return draft;
        });
      }
    }
    init();

    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      setHistorialList(
        list.filter(s => {
          if (!canUserViewInSolicitar(s, currentUser)) return false;
          if (s.estado === 'borrador' && (!s.items || s.items.length === 0)) return false;
          return true;
        })
      );
    });
    return () => {
      unsubSedes();
      unsubAreas();
      unsubscribe();
    };
  }, [currentUser]);

  const triggerAutoSave = async (draft) => {
    if (!draft || !draft.items || draft.items.length === 0) {
      if (draft?.id) {
        await transferService.deleteEmptyDraft(draft.id);
      }
      setSavingStatus('saved');
      return;
    }

    setSavingStatus('saving');
    try {
      if (draft.items && draft.items.length > 0) {
        catalogService.saveBatchToCleanCatalog(draft.items);
      }
      await transferService.saveDraft({ ...draft, folio: draft.folio || '' });
      setSavingStatus('saved');
    } catch (e) {
      setSavingStatus('saved');
    }
  };

  const handleDestSedeChange = (destSedeVal) => {
    const sObj = sedesList.find(s => s.id === destSedeVal || normalizeStr(s.nombre) === normalizeStr(destSedeVal));
    const sName = sObj?.nombre || destSedeVal;
    const sId = sObj?.id || '';
    setSelectedDestSede(sName);
    setSelectedDestSedeId(sId);
    setSelectedDestArea('');
    setSelectedDestAreaId('');
    const updated = {
      ...currentDraft,
      sucursalDestino: sName,
      sucursalDestinoId: sId,
      areaDestino: '',
      areaDestinoId: '',
      esTransferenciaInterna: normalizeStr(currentUser?.sede) === normalizeStr(sName)
    };
    setCurrentDraft(updated);
    if (updated.items && updated.items.length > 0) {
      triggerAutoSave(updated);
    }
  };

  const handleDestAreaChange = (areaVal) => {
    const aObj = areasList.find(a => a.id === areaVal || normalizeStr(a.nombre) === normalizeStr(areaVal));
    const aName = aObj?.nombre || areaVal;
    const aId = aObj?.id || '';
    setSelectedDestArea(aName);
    setSelectedDestAreaId(aId);
    const updated = {
      ...currentDraft,
      areaDestino: aName,
      areaDestinoId: aId
    };
    setCurrentDraft(updated);
    if (updated.items && updated.items.length > 0) {
      triggerAutoSave(updated);
    }
  };

  const handleBarcodeDetected = async (barcode, itemObject) => {
    const cleanBarcode = String(barcode || '').trim().replace(/\s+/g, '').replace(/\//g, '-');
    let item = itemObject;
    if (!item && cleanBarcode) {
      item = await catalogService.findByBarcode(cleanBarcode);
    }
    if (!item) {
      setDialog({
        isOpen: true, type: 'prompt', title: 'Producto no registrado',
        message: `El código "${cleanBarcode}" no se encontró en el catálogo.\nEscribe la descripción del producto para agregarlo:`,
        inputPlaceholder: 'Ej. Paracetamol 500mg', confirmText: 'Continuar', cancelText: 'Cancelar',
        onConfirm: async () => {
          const val = dialog.inputValue?.trim();
          closeDialog();
          if (val) {
            setScannedMedicine({ codigo: cleanBarcode, descripcion: val });
            await catalogService.saveToCleanCatalog(cleanBarcode, val);
            setIsQuantityOpen(true);
          }
        }, onCancel: closeDialog
      });
      return;
    }
    setScannedMedicine(item);
    setIsQuantityOpen(true);
  };

  const handleConfirmQuantity = (cantidad) => {
    setIsQuantityOpen(false);
    if (!scannedMedicine) return;

    if (scannedMedicine.codigo && scannedMedicine.descripcion) {
      catalogService.saveToCleanCatalog(scannedMedicine.codigo, scannedMedicine.descripcion);
    }

    const existingIndex = currentDraft.items.findIndex(i => String(i.codigo) === String(scannedMedicine.codigo));
    let newItems = [...currentDraft.items];

    if (existingIndex >= 0) {
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        cantidadSolicitada: newItems[existingIndex].cantidadSolicitada + cantidad,
        cantidadDespachada: newItems[existingIndex].cantidadSolicitada + cantidad
      };
    } else {
      newItems.unshift({
        codigo: scannedMedicine.codigo, descripcion: scannedMedicine.descripcion,
        cantidadSolicitada: cantidad, cantidadDespachada: cantidad, esExtra: false, atendido: false
      });
    }

    const targetSedeMatch = sedesList.find(s => s.id === selectedDestSedeId || normalizeStr(s.nombre) === normalizeStr(selectedDestSede || currentDraft.sucursalDestino));
    const targetAreaMatch = areasList.find(a => a.id === selectedDestAreaId || normalizeStr(a.nombre) === normalizeStr(selectedDestArea || currentDraft.areaDestino));
    const isTargetOwnSede = normalizeStr(selectedDestSede || currentDraft.sucursalDestino) === normalizeStr(currentUser?.sede);
    const updated = {
      ...currentDraft,
      sucursalDestino: selectedDestSede || currentDraft.sucursalDestino || '',
      sucursalDestinoId: targetSedeMatch?.id || selectedDestSedeId || currentDraft.sucursalDestinoId || '',
      areaDestino: selectedDestArea || currentDraft.areaDestino || '',
      areaDestinoId: targetAreaMatch?.id || selectedDestAreaId || currentDraft.areaDestinoId || '',
      esTransferenciaInterna: isTargetOwnSede,
      items: newItems
    };
    setCurrentDraft(updated);
    triggerAutoSave(updated);
    setScannedMedicine(null);
  };

  const executeRemoveItem = async (index) => {
    const newItems = currentDraft.items.filter((_, i) => i !== index);
    const updated = { ...currentDraft, items: newItems };
    setCurrentDraft(updated);

    if (newItems.length === 0) {
      if (currentDraft?.id) {
        await transferService.deleteEmptyDraft(currentDraft.id);
      }
      setSavingStatus('saved');
    } else {
      triggerAutoSave(updated);
    }
  };

  const handleRemoveItem = (index) => {
    const item = currentDraft.items[index];
    if (!item) return;

    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar producto?',
      message: `¿Estás seguro de quitar "${item.descripcion}" de la lista de solicitud?`,
      confirmText: 'Sí, quitar',
      cancelText: 'Conservar',
      onConfirm: () => {
        closeDialog();
        executeRemoveItem(index);
      },
      onCancel: closeDialog
    });
  };

  const handleUpdateQty = (index, delta) => {
    const item = currentDraft.items[index];
    if (!item) return;
    const newQty = (item.cantidadSolicitada || 1) + delta;
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    const newItems = [...currentDraft.items];
    newItems[index] = {
      ...item,
      cantidadSolicitada: newQty,
      cantidadDespachada: newQty
    };
    const updated = { ...currentDraft, items: newItems };
    setCurrentDraft(updated);
    triggerAutoSave(updated);
  };

  const isCurrentUserAreaExcluded = Boolean(
    currentUser?.area &&
    areasList.find(a => a.id === currentUser?.areaId || normalizeStr(a.nombre) === normalizeStr(currentUser?.area))?.excluirTransferencias
  );

  const availableDestSedes = sedesList.filter(s => {
    if (s.esDestino === false) return false;
    const isOwnSede = normalizeStr(s.nombre) === normalizeStr(currentUser?.sede);
    if (!isOwnSede) return true;
    const areas = Array.isArray(s.areas) ? s.areas : [];
    const operativeAreas = areas.filter(ar => {
      const aObj = areasList.find(a => a.id === ar || normalizeStr(a.nombre) === normalizeStr(ar));
      return !aObj?.excluirTransferencias;
    });
    return operativeAreas.length >= 2;
  });

  const targetSedeObj = sedesList.find(s => normalizeStr(s.nombre) === normalizeStr(selectedDestSede) || s.id === selectedDestSede);
  const targetAllAreas = Array.isArray(targetSedeObj?.areas) ? targetSedeObj.areas : [];
  const isTargetOwnSede = normalizeStr(selectedDestSede) === normalizeStr(currentUser?.sede);

  const operativeTargetAreas = targetAllAreas.map(ar => {
    const aObj = areasList.find(a => a.id === ar || normalizeStr(a.nombre) === normalizeStr(ar));
    return aObj ? { id: aObj.id, nombre: aObj.nombre } : { id: ar, nombre: ar };
  }).filter(aObj => {
    const fullObj = areasList.find(a => a.id === aObj.id || normalizeStr(a.nombre) === normalizeStr(aObj.nombre));
    return !fullObj?.excluirTransferencias;
  });

  const availableDestAreas = isTargetOwnSede
    ? operativeTargetAreas.filter(a => normalizeStr(a.nombre) !== normalizeStr(currentUser?.area) && a.id !== currentUser?.areaId)
    : operativeTargetAreas;

  const targetHasAreas = operativeTargetAreas.length > 0;

  const handleSubmitSolicitud = async () => {
    if (isCurrentUserAreaExcluded) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Área excluida de transferencias',
        message: `El área "${currentUser?.area}" está configurada como excluida de transferencias y pedidos de mercancía.`,
        variant: 'danger',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    if (!selectedDestSede) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Sede de Destino Requerida',
        message: 'Por favor selecciona la sede a la que deseas solicitar la transferencia.',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    if (targetHasAreas && !selectedDestArea) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Área de Destino Requerida',
        message: `La sede "${selectedDestSede}" tiene sub-áreas. Por favor selecciona el área a la que va dirigido el pedido.`,
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    if (isTargetOwnSede && selectedDestArea && selectedDestArea.toLowerCase() === (currentUser?.area || '').toLowerCase()) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Área no permitida',
        message: 'No puedes realizar una transferencia a tu misma área.',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    if (!currentDraft.items || currentDraft.items.length === 0) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Lista vacía',
        message: 'Agrega al menos un producto escaneando su código.',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    const isDestinationBodega = /bodega/i.test(selectedDestArea || '') || /bodega/i.test(selectedDestSede || '');
    const bulkItems = (currentDraft.items || []).filter(item => (Number(item.cantidadSolicitada) || 0) > 4);

    if (!isDestinationBodega && bulkItems.length > 0) {
      setBulkWarningItems(bulkItems);
      setIsBulkWarningOpen(true);
      return;
    }

    const destSummary = selectedDestArea
      ? `${selectedDestSede} (${selectedDestArea})`
      : selectedDestSede;

    const titleConfirm = isTargetOwnSede
      ? 'Confirmar Transferencia Interna'
      : 'Confirmar Solicitud de Transferencia';

    const msgConfirm = isTargetOwnSede
      ? `¿Deseas enviar esta transferencia interna de ${currentDraft.items.length} producto(s) a ${selectedDestArea}?`
      : `¿Deseas enviar la solicitud de transferencia con ${currentDraft.items.length} producto(s) a ${destSummary}?`;

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: titleConfirm,
      message: msgConfirm,
      confirmText: 'Enviar Pedido',
      cancelText: 'Revisar',
      onConfirm: async () => {
        closeDialog();
        await executeSendOrder();
      },
      onCancel: closeDialog
    });
  };

  const executeSendOrder = async () => {
    try {
      const targetSedeMatch = sedesList.find(s => s.id === selectedDestSedeId || normalizeStr(s.nombre) === normalizeStr(selectedDestSede));
      const targetAreaMatch = areasList.find(a => a.id === selectedDestAreaId || normalizeStr(a.nombre) === normalizeStr(selectedDestArea));
      const finalized = {
        ...currentDraft,
        folio: currentDraft.folio || '',
        sucursalOrigen: currentUser?.sede || 'Sucursal',
        sucursalOrigenId: currentUser?.sedeId || '',
        areaOrigen: currentUser?.area || '',
        areaOrigenId: currentUser?.areaId || '',
        sucursalDestino: selectedDestSede,
        sucursalDestinoId: targetSedeMatch?.id || selectedDestSedeId || '',
        areaDestino: selectedDestArea || '',
        areaDestinoId: targetAreaMatch?.id || selectedDestAreaId || '',
        usuarioSolicitante: currentUser?.username,
        solicitanteNombre: currentUser?.nombre || currentUser?.username,
        esTransferenciaInterna: isTargetOwnSede,
        observaciones: currentDraft.observaciones || currentDraft.motivo || '',
        motivo: currentDraft.motivo || currentDraft.observaciones || '',
        notas: currentDraft.observaciones || currentDraft.motivo || '',
        fecha: new Date().toISOString()
      };

      await transferService.sendSolicitud(finalized);
      playOrderSuccessSound();

      const newDraftId = 'sol-' + Date.now();
      setCurrentDraft({
        id: newDraftId,
        sucursalOrigen: currentUser?.sede || 'Sucursal',
        sucursalOrigenId: currentUser?.sedeId || '',
        areaOrigen: currentUser?.area || '',
        areaOrigenId: currentUser?.areaId || '',
        sucursalDestino: '',
        sucursalDestinoId: '',
        areaDestino: '',
        areaDestinoId: '',
        usuarioSolicitante: currentUser?.username,
        solicitanteNombre: currentUser?.nombre || currentUser?.username,
        usuarioDestino: '',
        observaciones: '',
        motivo: '',
        estado: 'borrador',
        fecha: new Date().toISOString(),
        items: []
      });
      setSelectedDestSede('');
      setSelectedDestSedeId('');
      setSelectedDestArea('');
      setSelectedDestAreaId('');
      setSelectedDestArea('');
      setSavingStatus('saved');

      handleSwitchTab('historial');
    } catch (e) {
      console.error('Error al enviar solicitud:', e);
    }
  };

  const handleConfirmBulkOrder = () => {
    setIsBulkWarningOpen(false);
    executeSendOrder();
  };

  const handleDeleteDraft = (e, sol) => {
    e.stopPropagation();
    const adminRoles = ['admin', 'administrador'];
    const currentRoles = Array.isArray(currentUser?.roles) ? currentUser.roles.map(r => String(r).toLowerCase()) : [];
    const currentUserName = (currentUser?.username || '').toLowerCase().trim();
    const isAdmin =
      currentUserName === 'administrador' ||
      currentRoles.some(r => adminRoles.includes(r));
    const solOwner = (sol.usuarioSolicitante || '').toLowerCase().trim();
    const canDelete = isAdmin || solOwner === currentUserName;

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

    const solRef = formatTransferFolio(sol);
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Eliminar Borrador',
      message: `¿Deseas eliminar permanentemente el borrador (${solRef}) con ${sol.items?.length || 0} productos?`,
      variant: 'danger',
      confirmText: 'Eliminar Borrador',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        setHistorialList(prev => prev.filter(s => s.id !== sol.id));

        if (currentDraft?.id === sol.id) {
          setCurrentDraft({
            id: 'sol-' + Date.now(),
            sucursalOrigen: currentUser?.sede || 'Sucursal',
            areaOrigen: currentUser?.area || '',
            sucursalDestino: '',
            areaDestino: '',
            usuarioSolicitante: currentUser?.username,
            usuarioDestino: '',
            estado: 'borrador',
            fecha: new Date().toISOString(),
            items: []
          });
          setSelectedDestSede('');
          setSelectedDestArea('');
        }

        try {
          await transferService.deleteDraft(sol.id, currentUser);
        } catch (err) {
          const fallback = transferService.getLocalSolicitudes().filter(s => canUserViewInSolicitar(s, currentUser));
          setHistorialList(fallback);
          setDialog({
            isOpen: true,
            type: 'alert',
            title: 'Error',
            message: err.message,
            variant: 'danger',
            confirmText: 'Entendido',
            onConfirm: closeDialog
          });
        }
      },
      onCancel: closeDialog
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      <div className="sticky top-16 z-30 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 pt-2 pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6 space-y-2.5">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-sm cursor-pointer transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /><span>Volver al Inicio</span>
          </button>
          <div className="bg-slate-200/80 dark:bg-slate-800 p-1 rounded-full flex text-xs font-medium border border-transparent dark:border-slate-700/60">
            <button
              onClick={() => handleSwitchTab('captura')}
              className={`px-3 py-1 rounded-full cursor-pointer transition-all duration-200 ${
                activeTab === 'captura'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Captura
            </button>
            <button
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
        </div>

        {activeTab === 'historial' && (
          <div className="relative pt-0.5">
            <MarqueeSearchInput
              placeholder="Buscar por folio, destino o producto..."
              value={historySearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClear={() => handleSearchChange('')}
            />
          </div>
        )}
      </div>

      {activeTab === 'captura' ? (
        <div key="tab-captura" className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                Destino de la Transferencia
              </span>
              {currentUser?.sede && (
                <span className="text-[11px] text-slate-500 font-medium">
                  Origen: <strong className="text-slate-800">{currentUser.sede}</strong>
                  {currentUser.area ? ` (${currentUser.area})` : ''}
                </span>
              )}
            </div>

            {isCurrentUserAreaExcluded && (
              <div className="p-3 bg-amber-50 dark:bg-transparent border border-amber-200/80 dark:border-amber-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-400 shadow-2xs">
                <Info className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Tu área actual (<strong>{currentUser?.area}</strong>) está configurada como excluida de transferencias de mercancía.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Sede de Destino *
                </label>
                <select
                  value={selectedDestSede}
                  onChange={(e) => handleDestSedeChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">-- Seleccionar Sede --</option>
                  {availableDestSedes.map((s) => (
                    <option key={s.id} value={s.nombre}>
                      {s.nombre} {s.nombre === currentUser?.sede ? '(Transferencia interna)' : `(${s.tipo || 'Sucursal'})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Área de Destino {targetHasAreas ? '*' : ''}
                </label>
                {targetHasAreas ? (
                  <select
                    value={selectedDestArea}
                    onChange={(e) => handleDestAreaChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">-- Seleccionar Área --</option>
                    {availableDestAreas.map((a, idx) => {
                      const aName = a.nombre || a;
                      const aId = a.id || aName;
                      return (
                        <option key={aId || idx} value={aName}>
                          {aName}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="w-full bg-slate-100/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selectedDestSede ? 'Esta sede opera de forma directa' : 'Selecciona primero una sede'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-center space-y-2">
            <button onClick={() => setIsScannerOpen(true)} className="w-full py-5 px-6 rounded-3xl bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/25 flex flex-col items-center justify-center gap-2 cursor-pointer group">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform"><ScanBarcode className="w-8 h-8 text-white" /></div>
              <div className="space-y-0.5"><span className="text-base font-bold tracking-tight">Escanear Código de Barras</span><p className="text-xs text-blue-100">Toca para capturar productos</p></div>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Productos ({currentDraft.items?.length || 0})</h3>
              <div className="text-[11px] text-slate-500">
                {savingStatus === 'saving' ? <span className="text-blue-600 animate-pulse">Guardando...</span> : <span className="text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Guardado</span>}
              </div>
            </div>

            {!currentDraft.items || currentDraft.items.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center"><ScanBarcode className="w-6 h-6" /></div>
                <p className="text-sm font-medium text-slate-700">Tu lista está vacía</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {currentDraft.items.map((item, idx) => (
                  <div key={item.codigo + '-' + idx} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <MarqueeText
                        text={item.descripcion}
                        className="text-sm font-semibold text-slate-900 dark:text-slate-100 block"
                      />
                      <p className="text-xs font-mono text-slate-400 dark:text-slate-500">Código: {item.codigo}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(idx, -1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Disminuir piezas"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold text-xs px-2 text-slate-800 dark:text-slate-200 min-w-8 text-center select-none">
                          {item.cantidadSolicitada}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(idx, 1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Aumentar piezas"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="w-7 h-7 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                        title="Eliminar producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Observaciones / Motivo (opcional)
              </label>
              <input
                type="text"
                value={currentDraft.observaciones || ''}
                onChange={(e) => setCurrentDraft(prev => ({ ...prev, observaciones: e.target.value, motivo: e.target.value, notas: e.target.value }))}
                placeholder="Ej. Surtido urgente para fin de semana, reposición de faltantes..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {currentDraft.items && currentDraft.items.length > 0 && (
              <div className="p-4 bg-slate-50/80 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">Tu lista está autoguardada.</span>
                <button onClick={handleSubmitSolicitud} className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold text-xs rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer">
                  <Send className="w-4 h-4" /><span>Enviar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div key="tab-historial" className="space-y-4 animate-fade-in">
          {isHistorialInitialLoading ? (
            <div className="bg-white rounded-3xl p-10 border border-slate-200/80 shadow-sm text-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-700">Cargando transferencias...</p>
              <p className="text-[11px] text-slate-400">Consultando historial en tiempo real</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-2">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700">
                {historySearch ? 'No se encontraron resultados' : 'No hay transferencias en el historial'}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {historySearch
                  ? `No hay registros que coincidan con "${historySearch}".`
                  : 'Tus solicitudes y borradores aparecerán aquí.'}
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
                {visibleHistory.map((sol) => {
                  const isDraft = sol.estado === 'borrador';
                  const adminRoles = ['admin', 'administrador'];
                  const currentRoles = Array.isArray(currentUser?.roles) ? currentUser.roles.map(r => String(r).toLowerCase()) : [];
                  const currentUserName = (currentUser?.username || '').toLowerCase().trim();
                  const isAdmin =
                    currentUserName === 'administrador' ||
                    currentRoles.some(r => adminRoles.includes(r));
                  const solOwner = (sol.usuarioSolicitante || '').toLowerCase().trim();
                  const canDeleteDraft = isDraft && (isAdmin || solOwner === currentUserName);

                  return (
                    <div
                      key={sol.id}
                      onClick={() => {
                        if (isDraft) {
                          setCurrentDraft(sol);
                          if (sol.sucursalDestino) setSelectedDestSede(sol.sucursalDestino);
                          if (sol.areaDestino) setSelectedDestArea(sol.areaDestino);
                          handleSwitchTab('captura');
                          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                        } else {
                          setDetailSolicitud(sol);
                        }
                      }}
                      className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-start sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                          <span className="text-sm font-bold text-slate-900 font-mono text-blue-700 break-all">
                            {sol.folio ? sol.folio : `Ref: ${formatTransferFolio(sol)}`}
                          </span>
                          {Boolean(sol.esTransferenciaInterna || (sol.sucursalOrigen && sol.sucursalOrigen === sol.sucursalDestino)) && (
                            <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-transparent border border-indigo-200 dark:border-indigo-500/30 px-2 py-0.5 rounded-full shrink-0">
                              Transferencia Interna
                            </span>
                          )}
                          {(sol.sucursalDestino || sol.areaDestino) && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full truncate max-w-full">
                              ➔ {sol.sucursalDestino || 'Destino'}{sol.areaDestino ? ` (${sol.areaDestino})` : ''}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap ${
                              isDraft
                                ? 'bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                                : sol.estado === 'faltantes_despachados'
                                ? 'bg-purple-50 dark:bg-transparent text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                                : sol.estado === 'cerrada_con_faltantes'
                                ? 'bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                                : sol.estado === 'recibida_incompleta'
                                ? 'bg-red-50 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                                : sol.estado === 'completada' || sol.estado === 'recibida'
                                ? 'bg-emerald-50 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                                : sol.estado === 'en_despacho'
                                ? 'bg-indigo-50 dark:bg-transparent text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30'
                                : 'bg-blue-50 dark:bg-transparent text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                            }`}
                          >
                            {isDraft
                              ? 'Borrador'
                              : sol.estado === 'faltantes_despachados'
                              ? 'Faltantes en camino'
                              : sol.estado === 'cerrada_con_faltantes'
                              ? 'Cerrada con Faltantes'
                              : sol.estado === 'recibida_incompleta'
                              ? 'Incompleta'
                              : sol.estado === 'recibida' && sol.reporteFaltantes?.length > 0
                              ? 'Recibida con Faltantes'
                              : sol.estado === 'en_despacho'
                              ? 'En Despacho'
                              : sol.estado
                              ? String(sol.estado).replace(/_/g, ' ')
                              : ''}
                          </span>

                          {canDeleteDraft && (
                            <button
                              onClick={(e) => handleDeleteDraft(e, sol)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="Eliminar borrador"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {sol.items?.length || 0} productos &bull;{' '}
                          {new Date(sol.fecha).toLocaleDateString('es-MX')}
                        </span>
                        <span className="text-[11px] font-semibold text-blue-600 group-hover:underline flex items-center gap-1">
                          {isDraft ? 'Continuar captura' : 'Ver detalle'}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 font-medium">
                        {formatOrderRequestedBy(sol, usersList)}
                      </p>

                      {(sol.observaciones || sol.motivo || sol.notas) && (
                        <div className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/30 px-3 py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-500/20">
                          <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span className="italic line-clamp-2">&ldquo;{sol.observaciones || sol.motivo || sol.notas}&rdquo;</span>
                        </div>
                      )}
                    </div>
                  );
                })}
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

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        isPaused={isQuantityOpen || dialog.isOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
      <CaptureQuantityModal
        isOpen={isQuantityOpen}
        scannedItem={scannedMedicine}
        onClose={() => {
          setIsQuantityOpen(false);
          setScannedMedicine(null);
        }}
        onConfirmQuantity={handleConfirmQuantity}
      />
      <ModalDialog isOpen={dialog.isOpen} type={dialog.type} title={dialog.title} message={dialog.message} confirmText={dialog.confirmText} onConfirm={dialog.onConfirm} onCancel={dialog.onCancel} />
      
      <TransferDetailModal
        isOpen={Boolean(detailSolicitud)}
        solicitud={detailSolicitud}
        onClose={() => setDetailSolicitud(null)}
      />

      <BulkOrderWarningModal
        isOpen={isBulkWarningOpen}
        onClose={() => setIsBulkWarningOpen(false)}
        onConfirm={handleConfirmBulkOrder}
        bulkItems={bulkWarningItems}
        destSede={selectedDestSede}
        destArea={selectedDestArea}
      />
    </div>
  );
});
