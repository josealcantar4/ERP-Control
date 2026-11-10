/**
 * Modal para la creación y despacho inmediato de pedidos directos hacia cualquier sucursal sin solicitud previa.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  PackagePlus,
  Building2,
  ScanBarcode,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Truck,
  Loader2,
  Tag,
  FileText,
  Clock,
  History,
  Save,
  ChevronRight,
  Layers,
  Info
} from 'lucide-react';
import { organizationService, normalizeStr } from '../usuarios/organizationService';
import { catalogService } from '../catalogo/catalogService';
import { CleanProductModal } from '../catalogo/CleanProductModal';
import { transferService, canUserDispatch, playOrderSuccessSound } from '../transferencias';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { AutoScrollInput } from '../../shared/AutoScrollInput';
import { MarqueeText } from '../../shared/MarqueeText';
import { FloatingInput, MarqueeSearchInput } from '../../shared';
import { useModalAnimation } from '../../hooks';

export function DespachoDirectoModal({
  isOpen,
  currentUser,
  onClose,
  onSuccess
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  const [activeTab, setActiveTab] = useState('captura');
  const [tabDirection, setTabDirection] = useState('initial');

  const handleSwitchTab = (newTab) => {
    if (newTab === activeTab) return;
    const direction = newTab === 'historial' ? 'forward' : 'back';
    setTabDirection(direction);
    setActiveTab(newTab);
  };

  const getTabAnimationClass = (tabName) => {
    if (tabDirection === 'initial') return 'animate-fade-in';
    return tabName === 'historial' ? 'animate-tab-slide-right' : 'animate-tab-slide-left';
  };

  const [currentDraftId, setCurrentDraftId] = useState(null);

  const [sedesList, setSedesList] = useState([]);
  const [areasList, setAreasList] = useState([]);
  const [selectedSede, setSelectedSede] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');

  const [folioDigits, setFolioDigits] = useState('');

  const [notasAdicionales, setNotasAdicionales] = useState('');

  const [packedItems, setPackedItems] = useState([]);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const [directDrafts, setDirectDrafts] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);

  const [scanError, setScanError] = useState(null);
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [unregisteredCode, setUnregisteredCode] = useState('');
  const scanErrorTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
    };
  }, []);

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');

  const [viewportHeight, setViewportHeight] = useState(() => 
    typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : null
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const updateHeight = () => {
      setViewportHeight(window.visualViewport.height);
    };
    window.visualViewport.addEventListener('resize', updateHeight);
    window.visualViewport.addEventListener('scroll', updateHeight);
    return () => {
      window.visualViewport.removeEventListener('resize', updateHeight);
      window.visualViewport.removeEventListener('scroll', updateHeight);
    };
  }, []);

  const handleInputFocus = (e) => {
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      setTimeout(() => {
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 300);
    }
  };

  const isFormLoadingRef = useRef(false);
  const autoSaveTimerRef = useRef(null);

  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert',
    variant: 'primary',
    title: '',
    message: '',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    if (isOpen) {
      const unsubSedes = organizationService.subscribeSedes((sedes) => {
        setSedesList(sedes);
      });

      const unsubAreas = organizationService.subscribeAreas((areas) => {
        setAreasList(areas);
      });

      const unsubSolicitudes = transferService.subscribeSolicitudes((list) => {
        const drafts = list.filter(
          s => s.estado === 'borrador' && (s.sinSolicitud || s.esDespachoDirecto) && canUserDispatch(s, currentUser)
        );
        setDirectDrafts(drafts);
      });

      return () => {
        unsubSedes();
        unsubAreas();
        unsubSolicitudes();
      };
    }
  }, [isOpen, currentUser]);

  const availableDirectSedes = sedesList.filter(s => {
    const isOwnSede = normalizeStr(s.nombre) === normalizeStr(currentUser?.sede);
    if (!isOwnSede) return true;
    const areas = Array.isArray(s.areas) ? s.areas : [];
    const operativeAreas = areas.filter(ar => {
      const aObj = areasList.find(a => a.id === ar || normalizeStr(a.nombre) === normalizeStr(ar));
      return !aObj?.excluirTransferencias;
    });
    return operativeAreas.length >= 2;
  });

  const targetDirectSedeObj = sedesList.find(s => normalizeStr(s.nombre) === normalizeStr(selectedSede) || s.id === selectedSede);
  const targetDirectAllAreas = Array.isArray(targetDirectSedeObj?.areas) ? targetDirectSedeObj.areas : [];
  const isTargetDirectOwnSede = normalizeStr(selectedSede) === normalizeStr(currentUser?.sede);

  const operativeDirectAreas = targetDirectAllAreas.map(ar => {
    const aObj = areasList.find(a => a.id === ar || normalizeStr(a.nombre) === normalizeStr(ar));
    return aObj ? { id: aObj.id, nombre: aObj.nombre } : { id: ar, nombre: ar };
  }).filter(aObj => {
    const fullObj = areasList.find(a => a.id === aObj.id || normalizeStr(a.nombre) === normalizeStr(aObj.nombre));
    return !fullObj?.excluirTransferencias;
  });

  const availableDirectAreas = isTargetDirectOwnSede
    ? operativeDirectAreas.filter(a => normalizeStr(a.nombre) !== normalizeStr(currentUser?.area) && a.id !== currentUser?.areaId)
    : operativeDirectAreas;

  const targetDirectHasAreas = operativeDirectAreas.length > 0;

  const handleResetForm = () => {
    isFormLoadingRef.current = true;
    setCurrentDraftId(null);
    setSelectedSede('');
    setSelectedArea('');
    setSelectedAreaId('');
    setFolioDigits('');
    setNotasAdicionales('');
    setPackedItems([]);
    setSearchQuery('');
    setSearchResults([]);
    setErrorMsg('');
    setScanError(null);
    setUnregisteredCode('');
    setIsSubmitting(false);
    setIsConfirmOpen(false);
    setSavingStatus('');
  };

  useEffect(() => {
    if (isOpen) {
      handleResetForm();
      setActiveTab('captura');
      setTabDirection('initial');
    }
  }, [isOpen]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await catalogService.searchMedicines(q);
        setSearchResults(results.slice(0, 15));
      } catch (err) {
        console.error('Error buscando medicinas:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleLoadDraft = (draft) => {
    isFormLoadingRef.current = true;
    setCurrentDraftId(draft.id);
    setSelectedSede(draft.sucursalReceptora || draft.sucursalDestino || '');
    setSelectedArea(draft.areaReceptora || draft.areaDestino || '');
    setSelectedAreaId(draft.areaReceptoraId || draft.areaDestinoId || '');
    const cleanDigits = (draft.folio || '').replace(/^TR/i, '');
    setFolioDigits(cleanDigits);

    const obs = draft.observaciones || '';
    const prefix = 'Pedido despachado sin haber sido solicitado';
    if (obs.startsWith(prefix)) {
      const extra = obs.replace(prefix, '').replace(/^:\s*/, '').trim();
      setNotasAdicionales(extra);
    } else {
      setNotasAdicionales(obs);
    }

    setPackedItems(
      (draft.items || []).map(it => ({
        codigo: it.codigo,
        descripcion: it.descripcion,
        cantidad: Number(it.cantidadDespachada || it.cantidad || 1)
      }))
    );

    setSavingStatus('saved');
    setTabDirection('back');
    handleSwitchTab('captura');
    setErrorMsg('');
  };

  const handleDeleteDraft = (e, draftId) => {
    e.stopPropagation();
    const targetDraft = directDrafts.find(d => d.id === draftId);
    const draftFolio = targetDraft?.folio || 'Sin Folio';
    const draftSede = targetDraft?.sucursalOrigen || 'Sucursal no asignada';

    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar Borrador?',
      message: `¿Estás seguro de eliminar permanentemente el borrador de ${draftSede} (${draftFolio}) con ${targetDraft?.items?.length || 0} productos?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        try {
          await transferService.deleteEmptyDraft(draftId);
          if (currentDraftId === draftId) {
            handleResetForm();
          }
        } catch (err) {
          console.error('Error eliminando borrador:', err);
        }
      },
      onCancel: closeDialog
    });
  };

  const performAutoSave = useCallback(async () => {
    if (!packedItems || packedItems.length === 0) {
      if (currentDraftId) {
        try {
          await transferService.deleteEmptyDraft(currentDraftId);
          setCurrentDraftId(null);
        } catch (e) {
          console.error('Error eliminando borrador vacío:', e);
        }
      }
      setSavingStatus('');
      return;
    }

    try {
      setSavingStatus('saving');
      const fullFolio = folioDigits.trim() ? `TR${folioDigits.trim()}` : '';
      const observacionBase = 'Pedido despachado sin haber sido solicitado';
      const observacionFinal = notasAdicionales.trim()
        ? `${observacionBase}: ${notasAdicionales.trim()}`
        : observacionBase;

      catalogService.saveBatchToCleanCatalog(packedItems);

      const saved = await transferService.saveDirectDispatchDraft({
        id: currentDraftId,
        folio: fullFolio,
        sucursalOrigen: currentUser?.sede || 'Bodega',
        sucursalOrigenId: currentUser?.sedeId || '',
        areaOrigen: currentUser?.area || '',
        areaOrigenId: currentUser?.areaId || '',
        sucursalReceptora: selectedSede.trim(),
        sucursalReceptoraId: targetDirectSedeObj?.id || '',
        areaReceptora: selectedArea ? selectedArea.trim() : '',
        areaReceptoraId: selectedAreaId || '',
        sucursalDestino: selectedSede.trim(),
        sucursalDestinoId: targetDirectSedeObj?.id || '',
        areaDestino: selectedArea ? selectedArea.trim() : '',
        areaDestinoId: selectedAreaId || '',
        sucursalDespachadora: currentUser?.sede || 'Bodega',
        sucursalDespachadoraId: currentUser?.sedeId || '',
        areaDespachadora: currentUser?.area || '',
        areaDespachadoraId: currentUser?.areaId || '',
        esTransferenciaInterna: (selectedSede || '').toLowerCase() === (currentUser?.sede || '').toLowerCase(),
        usuarioSolicitante: currentUser?.username || 'Bodega',
        solicitanteNombre: currentUser?.nombre || currentUser?.username || 'Bodega',
        usuarioDespacho: currentUser?.username || 'Bodega',
        usuarioAtencion: currentUser?.username || 'Bodega',
        observaciones: observacionFinal,
        motivo: notasAdicionales.trim(),
        notas: notasAdicionales.trim(),
        items: packedItems
      });

      if (saved && !currentDraftId) {
        setCurrentDraftId(saved.id);
      }
      setSavingStatus('saved');
    } catch (err) {
      console.error('Error en autoguardado de borrador directo:', err);
      setSavingStatus('saved');
    }
  }, [packedItems, selectedSede, selectedArea, selectedAreaId, targetDirectSedeObj, folioDigits, notasAdicionales, currentDraftId, currentUser]);

  useEffect(() => {
    if (!isOpen) return;
    if (isFormLoadingRef.current) {
      isFormLoadingRef.current = false;
      return;
    }

    if (packedItems.length === 0 && !currentDraftId) {
      setSavingStatus('');
      return;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 450);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [packedItems, selectedSede, selectedArea, folioDigits, notasAdicionales, isOpen, performAutoSave, currentDraftId]);

  const handleSelectProduct = (item) => {
    setPendingItem(item);
    setSearchQuery('');
    setSearchResults([]);
    setScanError(null);
    setIsQuantityOpen(true);
  };

  const handleBarcodeDetected = async (code, itemObject) => {
    const cleanCode = String(code || '').trim().replace(/\s+/g, '').replace(/\//g, '-');
    if (!cleanCode) return;

    try {
      let item = itemObject;
      if (!item) {
        item = await catalogService.findByBarcode(cleanCode);
      }

      if (item) {
        setScanError(null);
        handleSelectProduct(item);
      } else {
        setScanError({ code: cleanCode });
        if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
        scanErrorTimerRef.current = setTimeout(() => {
          setScanError(null);
        }, 6000);
      }
    } catch (err) {
      console.error('Error procesando escaneo de código:', err);
    }
  };

  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      setIsSearching(true);
      try {
        const exact = await catalogService.findByBarcode(q);
        if (exact) {
          handleSelectProduct(exact);
          return;
        }

        if (searchResults && searchResults.length === 1) {
          handleSelectProduct(searchResults[0]);
          return;
        }

        if (!searchResults || searchResults.length === 0) {
          setScanError({ code: q });
          if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
          scanErrorTimerRef.current = setTimeout(() => {
            setScanError(null);
          }, 6000);
        }
      } catch (err) {
        console.error('Error buscando producto:', err);
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleSaveUnregisteredProduct = async (code, desc) => {
    try {
      await catalogService.saveToCleanCatalog(code, desc);
      const newItem = { codigo: code, descripcion: desc };
      setScanError(null);
      setIsCleanModalOpen(false);
      setPendingItem(newItem);
      setIsQuantityOpen(true);
    } catch (err) {
      console.error('Error registrando producto nuevo:', err);
    }
  };

  const handleConfirmQuantity = (qty) => {
    setIsQuantityOpen(false);
    if (!pendingItem) return;

    if (pendingItem.codigo && pendingItem.descripcion) {
      catalogService.saveToCleanCatalog(pendingItem.codigo, pendingItem.descripcion);
    }

    setPackedItems(prev => {
      const idx = prev.findIndex(i => String(i.codigo) === String(pendingItem.codigo));
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          cantidad: updated[idx].cantidad + qty
        };
        return updated;
      }
      return [
        {
          codigo: pendingItem.codigo,
          descripcion: pendingItem.descripcion,
          cantidad: qty
        },
        ...prev
      ];
    });

    setPendingItem(null);
  };

  const executeRemoveItem = (codigo) => {
    setPackedItems(prev => prev.filter(it => String(it.codigo) !== String(codigo)));
  };

  const handleRemoveItem = (codigo) => {
    const item = packedItems.find(it => String(it.codigo) === String(codigo));
    if (!item) return;

    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar producto?',
      message: `¿Estás seguro de quitar "${item.descripcion}" de la caja de despacho?`,
      confirmText: 'Sí, quitar',
      cancelText: 'Conservar',
      onConfirm: () => {
        closeDialog();
        executeRemoveItem(codigo);
      },
      onCancel: closeDialog
    });
  };

  const handleUpdateQty = (codigo, delta) => {
    const item = packedItems.find(it => String(it.codigo) === String(codigo));
    if (!item) return;

    const nextQty = item.cantidad + delta;
    if (nextQty <= 0) {
      handleRemoveItem(codigo);
      return;
    }

    setPackedItems(prev =>
      prev.map(it => {
        if (String(it.codigo) === String(codigo)) {
          return { ...it, cantidad: nextQty };
        }
        return it;
      })
    );
  };

  const handleOpenConfirm = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg('');

    if (!selectedSede || !selectedSede.trim()) {
      setErrorMsg('Debes seleccionar una sede de destino.');
      return;
    }

    if (targetDirectHasAreas && !selectedArea) {
      setErrorMsg(`La sede "${selectedSede}" requiere que selecciones un área de destino.`);
      return;
    }

    if (isTargetDirectOwnSede && selectedArea && selectedArea.toLowerCase() === (currentUser?.area || '').toLowerCase()) {
      setErrorMsg('No puedes realizar un despacho directo hacia tu misma área.');
      return;
    }

    if (!folioDigits.trim()) {
      setErrorMsg('Debes ingresar el folio de transferencia (TR...) generado en el otro sistema.');
      return;
    }

    if (packedItems.length === 0) {
      setErrorMsg('Debes agregar al menos un producto a la caja para despachar.');
      return;
    }

    setIsConfirmOpen(true);
  };

  const executeDispatch = async () => {
    const fullFolio = `TR${folioDigits.trim()}`;
    const observacionBase = 'Pedido despachado sin haber sido solicitado';
    const observacionFinal = notasAdicionales.trim()
      ? `${observacionBase}: ${notasAdicionales.trim()}`
      : observacionBase;

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await catalogService.saveBatchToCleanCatalog(packedItems);
      const newDispatch = await transferService.createDirectDispatch({
        id: currentDraftId,
        folio: fullFolio,
        sucursalOrigen: currentUser?.sede || 'Bodega',
        sucursalOrigenId: currentUser?.sedeId || '',
        areaOrigen: currentUser?.area || '',
        areaOrigenId: currentUser?.areaId || '',
        sucursalReceptora: selectedSede.trim(),
        sucursalReceptoraId: targetDirectSedeObj?.id || '',
        areaReceptora: selectedArea ? selectedArea.trim() : '',
        areaReceptoraId: selectedAreaId || '',
        sucursalDestino: selectedSede.trim(),
        sucursalDestinoId: targetDirectSedeObj?.id || '',
        areaDestino: selectedArea ? selectedArea.trim() : '',
        areaDestinoId: selectedAreaId || '',
        sucursalDespachadora: currentUser?.sede || 'Bodega',
        sucursalDespachadoraId: currentUser?.sedeId || '',
        areaDespachadora: currentUser?.area || '',
        areaDespachadoraId: currentUser?.areaId || '',
        usuarioSolicitante: currentUser?.username || 'Bodega',
        solicitanteNombre: currentUser?.nombre || currentUser?.username || 'Bodega',
        usuarioDespacho: currentUser?.username || 'Bodega',
        usuarioAtencion: currentUser?.username || 'Bodega',
        esTransferenciaInterna: isTargetDirectOwnSede,
        observaciones: observacionFinal,
        motivo: notasAdicionales.trim(),
        notas: notasAdicionales.trim(),
        items: packedItems
      });
      playOrderSuccessSound();

      if (onSuccess) {
        onSuccess(newDispatch);
      }
      setIsConfirmOpen(false);
      onClose();
    } catch (err) {
      console.error('Error al despachar pedido directo:', err);
      setErrorMsg(err.message || 'Error al guardar el despacho en Firebase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalUnits = packedItems.reduce((acc, it) => acc + (it.cantidad || 0), 0);

  if (!shouldRender) return null;

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, !isSubmitting)}
      className={`fixed inset-0 z-[100] bg-slate-900/70 flex items-center justify-center p-2 sm:p-6 overflow-hidden ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={{
          ...cardStyle,
          height: viewportHeight
            ? `${Math.min(
                viewportHeight - 16,
                typeof window !== 'undefined' && window.innerWidth < 640
                  ? (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.92
                  : 650
              )}px`
            : undefined,
          maxHeight: viewportHeight
            ? `${Math.min(viewportHeight - 16, (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.92)}px`
            : undefined
        }}
        className={`bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 dark:border-slate-800 h-[calc(100dvh-1rem)] sm:h-[650px] max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] flex flex-col overflow-hidden my-auto transition-[height,max-height] duration-300 ease-out ${cardClass}`}
      >
        
        <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Despacho Directo (Sin Solicitud)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {currentDraftId ? 'Continuando borrador en captura' : 'Salida de mercancía sin solicitud previa'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-center pt-0.5">
            <div className="bg-slate-200/80 dark:bg-slate-800 p-1 rounded-full flex text-xs font-medium w-fit border border-transparent dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => handleSwitchTab('captura')}
                className={`px-3.5 py-1 rounded-full cursor-pointer transition-all duration-200 active:scale-95 flex items-center gap-1.5 ${
                  activeTab === 'captura'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Capturar Despacho</span>
                {packedItems.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'captura' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300/80 text-slate-700'
                  }`}>
                    {packedItems.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTab('historial')}
                className={`px-3.5 py-1 rounded-full flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-95 ${
                  activeTab === 'historial'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Borradores en Captura</span>
                {directDrafts.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'historial' ? 'bg-amber-100 text-amber-800' : 'bg-slate-300/80 text-slate-700'
                  }`}>
                    {directDrafts.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'captura' ? (
          <div 
            key="captura"
            onFocusCapture={handleInputFocus}
            className={`flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain touch-pan-y ${getTabAnimationClass('captura')}`}
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
          >
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sede de Destino *</span>
                </label>
                <select
                  value={selectedSede}
                  onChange={(e) => {
                    setSelectedSede(e.target.value);
                    setSelectedArea('');
                  }}
                  disabled={isSubmitting}
                  className={`w-full bg-slate-50 border rounded-2xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                    !selectedSede ? 'text-slate-400 border-slate-300' : 'text-slate-800 border-slate-200'
                  }`}
                >
                  <option value="">-- Selecciona una sede de destino --</option>
                  {availableDirectSedes.map(s => (
                    <option key={s.id || s.nombre} value={s.nombre} className="text-slate-800">
                      {s.nombre} {s.nombre === currentUser?.sede ? '(Transferencia interna)' : (s.tipo ? `(${s.tipo})` : '')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Área de Destino {targetDirectHasAreas ? '*' : ''}</span>
                </label>
                {targetDirectHasAreas ? (
                  <select
                    value={selectedAreaId || selectedArea}
                    onChange={(e) => {
                      const val = e.target.value;
                      const found = areasList.find(a => a.id === val || normalizeStr(a.nombre) === normalizeStr(val));
                      if (found) {
                        setSelectedArea(found.nombre);
                        setSelectedAreaId(found.id);
                      } else {
                        setSelectedArea(val);
                        setSelectedAreaId(val);
                      }
                    }}
                    disabled={isSubmitting}
                    className={`w-full bg-slate-50 border rounded-2xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                      !selectedArea ? 'text-slate-400 border-slate-300' : 'text-slate-800 border-slate-200'
                    }`}
                  >
                    <option value="">-- Selecciona un área de destino --</option>
                    {availableDirectAreas.map((ar, idx) => {
                      const val = ar.id || ar.nombre;
                      const label = ar.nombre || ar.id;
                      return (
                        <option key={ar.id || idx} value={val} className="text-slate-800">
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="w-full bg-slate-100/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-500 text-xs flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selectedSede ? 'Esta sede opera de forma directa' : 'Selecciona primero una sede'}</span>
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <FloatingInput
                  label="Folio Transferencia (TR)"
                  required
                  value={folioDigits}
                  onChange={(e) => setFolioDigits(e.target.value.replace(/[^0-9a-zA-Z_-]/g, ''))}
                  disabled={isSubmitting}
                  placeholder="12345"
                  icon={Tag}
                  className="font-mono font-bold"
                />
              </div>

            </div>

            <div>
              <FloatingInput
                label="Notas o Comentarios Adicionales (Opcional)"
                value={notasAdicionales}
                onChange={(e) => setNotasAdicionales(e.target.value)}
                disabled={isSubmitting}
                placeholder="Ej. Envío de apoyo por alta demanda, sustitución de lote..."
                icon={FileText}
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 leading-tight">
                    Productos a empacar en la caja
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                    {totalUnits} unidades totales
                  </span>
                </div>

                <div className="flex flex-col items-end shrink-0 text-right min-h-[32px] justify-center">
                  {savingStatus === 'saving' ? (
                    <span className="text-blue-600 text-[11px] font-semibold animate-pulse flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Guardando...</span>
                    </span>
                  ) : savingStatus === 'saved' && packedItems.length > 0 ? (
                    <span className="text-emerald-600 text-[11px] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Guardado</span>
                    </span>
                  ) : null}

                  {packedItems.length > 0 && (
                    <span className="text-[11px] font-mono text-slate-500 font-medium block mt-0.5">
                      {packedItems.length} {packedItems.length === 1 ? 'Producto' : 'Productos'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <MarqueeSearchInput
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (scanError) setScanError(null);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar producto por código o descripción..."
                    icon={Search}
                    onClear={() => {
                      setSearchQuery('');
                      setScanError(null);
                    }}
                    loading={isSearching}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-2xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <ScanBarcode className="w-4 h-4" />
                  <span className="hidden sm:inline">Escanear</span>
                </button>
              </div>

              {scanError && (
                <div className="p-3 bg-amber-50 border border-amber-200/90 text-amber-900 rounded-2xl flex items-center justify-between gap-3 text-xs animate-fade-in shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="truncate">
                      El código <strong className="font-mono text-amber-950 font-bold">&quot;{scanError.code}&quot;</strong> no está en el catálogo.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setUnregisteredCode(scanError.code);
                        setIsCleanModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-bold transition-colors cursor-pointer shadow-sm"
                    >
                      Registrar
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanError(null)}
                      className="w-6 h-6 rounded-lg hover:bg-amber-200/60 text-amber-700 flex items-center justify-center transition-colors cursor-pointer"
                      title="Cerrar aviso"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl shadow-lg">
                  {searchResults.map((item) => (
                    <button
                      key={item.codigo}
                      type="button"
                      onClick={() => handleSelectProduct(item)}
                      className="w-full p-2.5 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-3 text-xs cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <MarqueeText
                          text={item.descripcion}
                          className="font-bold text-slate-800 text-xs block"
                        />
                        <p className="font-mono text-[10px] text-slate-400">EAN: {item.codigo}</p>
                      </div>
                      <span className="text-[11px] font-bold text-blue-600 shrink-0">
                        + Agregar
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {packedItems.length === 0 ? (
                <div className="p-6 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-1 text-slate-400">
                  <Truck className="w-7 h-7 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">Caja vacía</p>
                  <p className="text-[11px] text-slate-400">
                    Usa el buscador o el escáner para agregar medicamentos a esta caja.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {packedItems.map((it) => (
                    <div
                      key={it.codigo}
                      className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <MarqueeText
                          text={it.descripcion}
                          className="text-xs font-bold text-slate-800 block"
                        />
                        <p className="text-[10px] font-mono text-slate-400">
                          EAN: {it.codigo}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-white rounded-xl border border-slate-200 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(it.codigo, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title="Disminuir piezas"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs px-2 text-slate-800 min-w-8 text-center select-none">
                            {it.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(it.codigo, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title="Aumentar piezas"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.codigo)}
                          className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Quitar de la caja"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
              <span>
                Observación oficial registrada:{' '}
                <strong className="text-slate-700 font-semibold font-mono">
                  &ldquo;Pedido despachado sin haber sido solicitado&rdquo;
                </strong>
              </span>
            </div>
          </div>
        ) : (
          <div 
            key="historial"
            className={`flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-3 overscroll-contain touch-pan-y ${getTabAnimationClass('historial')}`}
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
          >
            <div className="flex items-center justify-between pb-1">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Despachos en Captura ({directDrafts.length})
              </h4>
              <span className="text-[11px] text-slate-400">
                Toca uno para continuar agregando productos
              </span>
            </div>

            {directDrafts.length === 0 ? (
              <div className="p-10 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <Clock className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No hay borradores en captura</p>
                <p className="text-[11px] text-slate-400">
                  Cuando comiences a armar una caja directa puedes guardarla como borrador para continuar después.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {directDrafts.map((draft) => {
                  const itemsCount = draft.items?.length || 0;
                  const units = (draft.items || []).reduce(
                    (acc, it) => acc + Number(it.cantidadDespachada || it.cantidad || 0),
                    0
                  );
                  const isCurrent = draft.id === currentDraftId;

                  return (
                    <div
                      key={draft.id}
                      onClick={() => handleLoadDraft(draft)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                        isCurrent
                          ? 'bg-blue-50/70 border-blue-300 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">
                            {draft.sucursalOrigen || 'Sin sucursal asignada'}
                            {draft.areaDestino ? ` (${draft.areaDestino})` : ''}
                          </span>
                          {Boolean(draft.esTransferenciaInterna) && (
                            <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                              Transferencia Interna
                            </span>
                          )}
                          <span className="font-mono text-xs font-semibold text-blue-600">
                            {draft.folio || 'Sin folio TR'}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                              Actualmente en edición
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>{itemsCount} productos ({units} pzas)</span>
                          <span className="text-slate-300">&bull;</span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {new Date(draft.fecha).toLocaleTimeString('es-MX', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadDraft(draft)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span>Continuar</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteDraft(e, draft.id)}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Eliminar borrador"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          {activeTab === 'captura' ? (
            <div key="footer-captura" className="flex items-center gap-3 animate-fade-in">
              <div className="text-[11px] text-slate-500">
                {savingStatus === 'saving' ? (
                  <span className="text-blue-600 font-semibold animate-pulse flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </span>
                ) : savingStatus === 'saved' && packedItems.length > 0 ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Borrador guardado</span>
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleOpenConfirm}
                disabled={isSubmitting || packedItems.length === 0 || !folioDigits.trim() || !selectedSede}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Despachando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Finalizar y Despachar</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div key="footer-historial" className="animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  handleResetForm();
                  handleSwitchTab('captura');
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-2xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Despacho</span>
              </button>
            </div>
          )}
        </div>

      </div>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        isPaused={isQuantityOpen || isCleanModalOpen || dialog.isOpen || isConfirmOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <CaptureQuantityModal
        isOpen={isQuantityOpen}
        scannedItem={pendingItem}
        onClose={() => {
          setIsQuantityOpen(false);
          setPendingItem(null);
        }}
        onConfirmQuantity={handleConfirmQuantity}
      />

      <ModalDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        variant={dialog.variant}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
        onClose={closeDialog}
      />

      <CleanProductModal
        isOpen={isCleanModalOpen}
        item={unregisteredCode ? { codigo: unregisteredCode, descripcion: '' } : null}
        onClose={() => setIsCleanModalOpen(false)}
        onSave={handleSaveUnregisteredProduct}
      />

      <ConfirmDirectDispatchModal
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isSubmitting) setIsConfirmOpen(false);
        }}
        onConfirm={executeDispatch}
        isSubmitting={isSubmitting}
        errorMsg={errorMsg}
        selectedSede={selectedSede}
        selectedArea={selectedArea}
        isTargetDirectOwnSede={isTargetDirectOwnSede}
        folioDigits={folioDigits}
        packedItems={packedItems}
        notasAdicionales={notasAdicionales}
        currentUser={currentUser}
      />

    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

function ConfirmDirectDispatchModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  errorMsg,
  selectedSede,
  selectedArea,
  isTargetDirectOwnSede,
  folioDigits,
  packedItems = [],
  notasAdicionales = '',
  currentUser
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  if (!shouldRender) return null;

  const totalUnits = packedItems.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);
  const fullFolio = `TR${(folioDigits || '').trim()}`;

  const content = (
    <div
      onClick={(e) => handleBackdropClick(e, !isSubmitting)}
      className={`fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] overscroll-contain ${cardClass}`}
      >
        <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                Confirmar Despacho Directo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Revisa el resumen antes de enviar la mercancía
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0 text-left">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-2xl text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Destino:
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedSede}
                </span>
                {selectedArea && (
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/60">
                    Área: {selectedArea}
                  </span>
                )}
              </div>

              <div className="font-mono text-xs font-bold px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80">
                Folio: {fullFolio}
              </div>
            </div>

            {isTargetDirectOwnSede && (
              <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                • Transferencia interna entre áreas de la misma sede
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-800 text-center">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Productos Distintos
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                {packedItems.length}
              </span>
            </div>
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border border-emerald-100 dark:border-emerald-800/50 text-center">
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Total de Piezas
              </span>
              <span className="text-lg font-bold text-emerald-800 dark:text-emerald-300 font-mono">
                {totalUnits}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Resumen de lo que se va a despachar:
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                {packedItems.length} ítem{packedItems.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="max-h-56 sm:max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-2 text-xs overscroll-contain shadow-2xs">
              {packedItems.map((item, idx) => (
                <div key={item.codigo || idx} className="py-2 first:pt-1 last:pb-1 flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate block text-xs" title={item.descripcion}>
                      {item.descripcion}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block mt-0.5">
                      Código: {item.codigo}
                    </span>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-xl font-mono text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs">
                    {item.cantidad} pza{item.cantidad === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {notasAdicionales.trim() && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Notas adicionales:</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                {notasAdicionales.trim()}
              </p>
            </div>
          )}

          <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
            <span>
              Se registrará con la observación:{' '}
              <strong className="text-slate-700 dark:text-slate-300 font-semibold font-mono">
                &ldquo;Pedido despachado sin haber sido solicitado&rdquo;
              </strong>
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
          >
            Volver a la caja
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-2xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Despachando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar y Despachar</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
