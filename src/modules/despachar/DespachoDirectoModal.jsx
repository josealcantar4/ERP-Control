import React, { useState, useEffect } from 'react';
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
import { organizationService } from '../usuarios/organizationService';
import { catalogService } from '../catalogo/catalogService';
import { transferService, canUserDispatch } from '../transferencias';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { AutoScrollInput } from '../../shared/AutoScrollInput';
import { MarqueeText } from '../../shared/MarqueeText';
import { useModalAnimation } from '../../hooks';

export function DespachoDirectoModal({
  isOpen,
  currentUser,
  onClose,
  onSuccess
}) {
  const { shouldRender, cardRef, handleClose, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  // Pestañas del modal: 'captura' | 'historial'
  const [activeTab, setActiveTab] = useState('captura');

  const handleSwitchTab = (newTab) => {
    setActiveTab(newTab);
  };

  // ID del borrador actual si se está continuando uno existente
  const [currentDraftId, setCurrentDraftId] = useState(null);

  // Sedes y Destino
  const [sedesList, setSedesList] = useState([]);
  const [areasList, setAreasList] = useState([]);
  const [selectedSede, setSelectedSede] = useState('');
  const [selectedArea, setSelectedArea] = useState('');

  // Folio TR
  const [folioDigits, setFolioDigits] = useState('');

  // Observaciones
  const [notasAdicionales, setNotasAdicionales] = useState('');

  // Artículos en la caja
  const [packedItems, setPackedItems] = useState([]);

  // Lista de borradores de despacho directo en captura
  const [directDrafts, setDirectDrafts] = useState([]);

  // Búsqueda de productos en catálogo
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Modales de escaneo y captura de cantidad
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);

  // Estados de validación y carga
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');

  // Estado de diálogo modal de confirmación y alerta
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

  // Cargar lista de sedes, áreas y borradores
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

  // Sedes disponibles para despachar:
  // - Sedes distintas a la actual.
  // - O la misma sede actual SI tiene 2 o más áreas operativas (para transferencias internas entre áreas).
  const availableDirectSedes = sedesList.filter(s => {
    const isOwnSede = (s.nombre || '').toLowerCase() === (currentUser?.sede || '').toLowerCase();
    if (!isOwnSede) return true;
    const areas = Array.isArray(s.areas) ? s.areas : [];
    const operativeAreas = areas.filter(ar => {
      const aObj = areasList.find(a => a.nombre?.toLowerCase() === ar.toLowerCase());
      return !aObj?.excluirTransferencias;
    });
    return operativeAreas.length >= 2;
  });

  const targetDirectSedeObj = sedesList.find(s => s.nombre === selectedSede);
  const targetDirectAllAreas = Array.isArray(targetDirectSedeObj?.areas) ? targetDirectSedeObj.areas : [];
  const isTargetDirectOwnSede = (selectedSede || '').toLowerCase() === (currentUser?.sede || '').toLowerCase();

  // Filtrar áreas operativas (que NO estén excluidas de transferencias)
  const operativeDirectAreas = targetDirectAllAreas.filter(areaName => {
    const aObj = areasList.find(a => a.nombre?.toLowerCase() === areaName.toLowerCase());
    return !aObj?.excluirTransferencias;
  });

  const availableDirectAreas = isTargetDirectOwnSede
    ? operativeDirectAreas.filter(a => a.toLowerCase() !== (currentUser?.area || '').toLowerCase())
    : operativeDirectAreas;

  const targetDirectHasAreas = operativeDirectAreas.length > 0;

  // Limpiar campos al abrir nuevo despacho
  const handleResetForm = () => {
    setCurrentDraftId(null);
    setSelectedSede('');
    setSelectedArea('');
    setFolioDigits('');
    setNotasAdicionales('');
    setPackedItems([]);
    setSearchQuery('');
    setSearchResults([]);
    setErrorMsg('');
    setIsSubmitting(false);
    setSavingStatus('');
  };

  useEffect(() => {
    if (isOpen) {
      handleResetForm();
      setActiveTab('captura');
    }
  }, [isOpen]);

  // Búsqueda en catálogo con debounce
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

  if (!shouldRender) return null;

  // Cargar un borrador existente del historial para continuar capturando
  const handleLoadDraft = (draft) => {
    setCurrentDraftId(draft.id);
    setSelectedSede(draft.sucursalReceptora || draft.sucursalOrigen || '');
    setSelectedArea(draft.areaReceptora || draft.areaDestino || draft.areaOrigen || '');
    const cleanDigits = (draft.folio || '').replace(/^TR/i, '');
    setFolioDigits(cleanDigits);

    // Separar notas adicionales de la leyenda base si existiera
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

    handleSwitchTab('captura');
    setErrorMsg('');
  };

  // Eliminar un borrador del historial con validación y confirmación
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

  // Guardar como borrador para continuar después
  const handleSaveDraft = async () => {
    if (packedItems.length === 0) {
      setErrorMsg('Agrega al menos un producto antes de guardar como borrador.');
      return;
    }

    const fullFolio = folioDigits.trim() ? `TR${folioDigits.trim()}` : '';
    const observacionBase = 'Pedido despachado sin haber sido solicitado';
    const observacionFinal = notasAdicionales.trim()
      ? `${observacionBase}: ${notasAdicionales.trim()}`
      : observacionBase;

    try {
      setIsSubmitting(true);
      setSavingStatus('saving');
      await catalogService.saveBatchToCleanCatalog(packedItems);
      const saved = await transferService.saveDirectDispatchDraft({
        id: currentDraftId,
        folio: fullFolio,
        sucursalOrigen: selectedSede.trim(),
        areaOrigen: selectedArea ? selectedArea.trim() : '',
        sucursalReceptora: selectedSede.trim(),
        areaReceptora: selectedArea ? selectedArea.trim() : '',
        sucursalDestino: currentUser?.sede || 'Bodega',
        areaDestino: currentUser?.area || '',
        sucursalDespachadora: currentUser?.sede || 'Bodega',
        areaDespachadora: currentUser?.area || '',
        esTransferenciaInterna: (selectedSede || '').toLowerCase() === (currentUser?.sede || '').toLowerCase(),
        usuarioSolicitante: selectedSede.trim() || 'Despacho Directo',
        usuarioDespacho: currentUser?.username || 'Bodega',
        observaciones: observacionFinal,
        items: packedItems
      });

      if (saved) {
        setCurrentDraftId(saved.id);
      }
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus(''), 2500);
    } catch (err) {
      console.error('Error guardando borrador:', err);
      setErrorMsg('No se pudo guardar el borrador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Selección de producto desde resultados de búsqueda
  const handleSelectProduct = (item) => {
    setPendingItem(item);
    setSearchQuery('');
    setSearchResults([]);
    setIsQuantityOpen(true);
  };

  // Detección de código de barras desde cámara
  const handleBarcodeDetected = async (code) => {
    setIsScannerOpen(false);
    try {
      let item = await catalogService.findByBarcode(code);
      if (!item) {
        const customDesc = window.prompt(
          `El código "${code}" no está en el catálogo.\nEscribe el nombre del producto:`,
          ''
        );
        if (!customDesc?.trim()) return;
        item = { codigo: code, descripcion: customDesc.trim().toUpperCase() };
        await catalogService.saveToCleanCatalog(code, customDesc.trim().toUpperCase());
      }
      setPendingItem(item);
      setIsQuantityOpen(true);
    } catch (err) {
      console.error('Error procesando escaneo de código:', err);
    }
  };

  // Confirmar cantidad agregada
  const handleConfirmQuantity = (qty) => {
    setIsQuantityOpen(false);
    if (!pendingItem) return;

    // Registrar producto automáticamente en Catálogo Limpio
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

  // Ejecutar eliminación confirmada de producto
  const executeRemoveItem = (codigo) => {
    setPackedItems(prev => prev.filter(it => String(it.codigo) !== String(codigo)));
  };

  // Eliminar producto de la lista con confirmación obligatoria
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

  // Modificar cantidad directamente en la lista (+ / -) con validación preventiva
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

  // Enviar el despacho directo
  const handleFinalize = async (e) => {
    e.preventDefault();
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

    const fullFolio = `TR${folioDigits.trim()}`;
    const observacionBase = 'Pedido despachado sin haber sido solicitado';
    const observacionFinal = notasAdicionales.trim()
      ? `${observacionBase}: ${notasAdicionales.trim()}`
      : observacionBase;

    try {
      setIsSubmitting(true);
      await catalogService.saveBatchToCleanCatalog(packedItems);
      const newDispatch = await transferService.createDirectDispatch({
        id: currentDraftId,
        folio: fullFolio,
        sucursalOrigen: selectedSede.trim(),
        areaOrigen: selectedArea ? selectedArea.trim() : '',
        sucursalReceptora: selectedSede.trim(),
        areaReceptora: selectedArea ? selectedArea.trim() : '',
        sucursalDestino: currentUser?.sede || 'Bodega',
        areaDestino: currentUser?.area || '',
        sucursalDespachadora: currentUser?.sede || 'Bodega',
        areaDespachadora: currentUser?.area || '',
        usuarioSolicitante: selectedSede.trim(),
        usuarioDespacho: currentUser?.username || 'Bodega',
        esTransferenciaInterna: isTargetDirectOwnSede,
        observaciones: observacionFinal,
        items: packedItems
      });

      if (onSuccess) {
        onSuccess(newDispatch);
      }
      onClose();
    } catch (err) {
      console.error('Error al despachar pedido directo:', err);
      setErrorMsg(err.message || 'Error al guardar el despacho en Firebase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalUnits = packedItems.reduce((acc, it) => acc + (it.cantidad || 0), 0);

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) handleClose();
      }}
      className={`fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] flex flex-col overflow-hidden my-auto overscroll-contain ${cardClass}`}
      >
        
        {/* ENCABEZADO CON PESTAÑAS */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-100 shrink-0 bg-slate-50/70 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Despacho Directo (Sin Solicitud)
                </h3>
                <p className="text-xs text-slate-500">
                  {currentDraftId ? 'Continuando borrador en captura' : 'Salida de mercancía sin solicitud previa'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* SELECTOR DE PESTAÑAS (CAPTURA / HISTORIAL) */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleSwitchTab('captura')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'captura'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Capturar Despacho</span>
              {packedItems.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'captura' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'
                }`}>
                  {packedItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSwitchTab('historial')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'historial'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Borradores en Captura</span>
              {directDrafts.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'historial' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                }`}>
                  {directDrafts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* CONTENEDOR DESLIZABLE CONTINUO (CERO DESBORDAMIENTO, CERO SALTOS BRUSCOS) */}
        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          <div
            className="flex w-[200%] flex-1 min-h-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: activeTab === 'captura' ? 'translateX(0%)' : 'translateX(-50%)' }}
          >
            {/* PANEL 1: CAPTURA DE DESPACHO (50% de 200% = 100% de la ventana) */}
            <div className="w-1/2 h-full overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {savingStatus === 'saved' && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Borrador guardado exitosamente. Puedes continuar en cualquier momento desde la pestaña "Borradores en Captura".</span>
                </div>
              )}

              {/* METADATOS: SUCURSAL DESTINO, ÁREA DESTINO (CONDICIONAL) Y FOLIO TR */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                
                {/* Sede Destino */}
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

                {/* Área de Destino (Condicional según las áreas configuradas en la sede) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Área de Destino {targetDirectHasAreas ? '*' : ''}</span>
                  </label>
                  {targetDirectHasAreas ? (
                    <select
                      value={selectedArea}
                      onChange={(e) => setSelectedArea(e.target.value)}
                      disabled={isSubmitting}
                      className={`w-full bg-slate-50 border rounded-2xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                        !selectedArea ? 'text-slate-400 border-slate-300' : 'text-slate-800 border-slate-200'
                      }`}
                    >
                      <option value="">-- Selecciona un área de destino --</option>
                      {availableDirectAreas.map((ar, idx) => (
                        <option key={idx} value={ar} className="text-slate-800">
                          {ar}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full bg-slate-100/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-500 text-xs flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{selectedSede ? 'Esta sede opera de forma directa' : 'Selecciona primero una sede'}</span>
                    </div>
                  )}
                </div>

                {/* Folio de Transferencia TR */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Folio Transferencia (TR) *</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 font-mono font-bold text-xs text-blue-600 select-none">
                      TR
                    </span>
                    <input
                      type="text"
                      value={folioDigits}
                      onChange={(e) => setFolioDigits(e.target.value.replace(/[^0-9a-zA-Z_-]/g, ''))}
                      disabled={isSubmitting}
                      placeholder="12345"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

              </div>

              {/* NOTAS ADICIONALES (OPCIONAL) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Notas o Comentarios Adicionales (Opcional)</span>
                </label>
                <AutoScrollInput
                  type="text"
                  value={notasAdicionales}
                  onChange={(e) => setNotasAdicionales(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Ej. Envío de apoyo por alta demanda, sustitución de lote..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* CAPTURA DE PRODUCTOS */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Productos a Empacar en la Caja ({packedItems.length})
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {totalUnits} unidades totales
                  </span>
                </div>

                {/* Barra de Búsqueda + Botón Escanear */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AutoScrollInput
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar producto por código o descripción..."
                      icon={Search}
                      onClear={() => setSearchQuery('')}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    {isSearching && (
                      <Loader2 className="w-4 h-4 absolute right-12 top-1/2 -translate-y-1/2 text-blue-600 animate-spin pointer-events-none" />
                    )}
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

                {/* Resultados flotantes de búsqueda */}
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

                {/* LISTA DE PRODUCTOS EMPACADOS */}
                {packedItems.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-1 text-slate-400">
                    <Truck className="w-7 h-7 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">Caja vacía</p>
                    <p className="text-[11px] text-slate-400">
                      Usa el buscador o el escáner para agregar medicamentos a esta caja.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
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
                          {/* Controles de Cantidad con botones - y + */}
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

                          {/* Botón Borrar */}
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

              {/* LEYENDA DISCRETA DE OBSERVACIÓN OFICIAL - AL FINAL ANTES DE LOS BOTONES */}
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

            {/* PANEL 2: HISTORIAL (BORRADORES EN CAPTURA) */}
            <div className="w-1/2 h-full overflow-y-auto p-5 sm:p-6 space-y-3 overscroll-contain">
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
          </div>
        </div>

        {/* PIE DE ACCIONES */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          {activeTab === 'captura' ? (
            <div className="flex items-center gap-2">
              {packedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5 text-blue-600" />
                  <span>Guardar Borrador</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleFinalize}
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
            <button
              type="button"
              onClick={() => {
                handleResetForm();
                handleSwitchTab('captura');
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Despacho</span>
            </button>
          )}
        </div>

      </div>

      {/* MODAL DE ESCANEO DE CÓDIGO */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      {/* MODAL DE CAPTURA DE CANTIDAD */}
      <CaptureQuantityModal
        isOpen={isQuantityOpen}
        scannedItem={pendingItem}
        onClose={() => setIsQuantityOpen(false)}
        onConfirmQuantity={handleConfirmQuantity}
      />

      {/* DIÁLOGO MODAL DE CONFIRMACIÓN / VALIDACIÓN DE ACCIDENTES */}
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

    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
