import React, { useState, useEffect } from 'react';
import {
  ScanBarcode, Send, Trash2, CheckCircle2, ArrowLeft, History, ChevronRight, Plus, Minus,
  Building2, Layers, Info
} from 'lucide-react';
import { organizationService } from '../usuarios/organizationService';
import { catalogService } from '../catalogo/catalogService';
import { transferService, formatTransferFolio, canUserViewInSolicitar } from '../transferencias';
import { TransferDetailModal } from '../transferencias/TransferDetailModal';
import { BulkOrderWarningModal } from './BulkOrderWarningModal';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { MarqueeText } from '../../shared/MarqueeText';
import { transitionView } from '../../shared';

export function SolicitarModule({ currentUser, onBack, onRefresh }) {
  const [sedesList, setSedesList] = useState([]);
  const [areasList, setAreasList] = useState([]);
  const [selectedDestSede, setSelectedDestSede] = useState('');
  const [selectedDestArea, setSelectedDestArea] = useState('');
  const [detailSolicitud, setDetailSolicitud] = useState(null);

  const [currentDraft, setCurrentDraft] = useState({
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

  const [savingStatus, setSavingStatus] = useState('saved');
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('erp_solicitar_active_tab') || 'captura';
  });

  const handleSwitchTab = (newTab) => {
    if (newTab === activeTab) return;
    const direction = newTab === 'historial' ? 'forward' : 'back';
    transitionView(() => {
      setActiveTab(newTab);
    }, { direction });
  };
  const [historialList, setHistorialList] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(false);
  const [scannedMedicine, setScannedMedicine] = useState(null);
  const [isBulkWarningOpen, setIsBulkWarningOpen] = useState(false);
  const [bulkWarningItems, setBulkWarningItems] = useState([]);

  useEffect(() => {
    localStorage.setItem('erp_solicitar_active_tab', activeTab);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (activeTab === 'historial' && onRefresh) {
      onRefresh();
    }
  }, [activeTab]);

  const [dialog, setDialog] = useState({
    isOpen: false, type: 'alert', title: '', message: '', variant: 'primary', confirmText: 'Aceptar', onConfirm: () => {}
  });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    // Suscribir a Sedes y Áreas en tiempo real
    const unsubSedes = organizationService.subscribeSedes((sedes) => {
      setSedesList(sedes);
    });
    const unsubAreas = organizationService.subscribeAreas((areas) => {
      setAreasList(areas);
    });

    async function init() {
      const draft = await transferService.getActiveDraft(currentUser.username);
      if (draft && draft.items && draft.items.length > 0) {
        setCurrentDraft(draft);
        if (draft.sucursalDestino) setSelectedDestSede(draft.sucursalDestino);
        if (draft.areaDestino) setSelectedDestArea(draft.areaDestino);
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
    // REGLA: Si no hay productos, NO guardar borrador. Si ya existía, eliminarlo de inmediato.
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

  const handleDestSedeChange = (destSedeName) => {
    setSelectedDestSede(destSedeName);
    setSelectedDestArea('');
    const updated = {
      ...currentDraft,
      sucursalDestino: destSedeName,
      areaDestino: '',
      esTransferenciaInterna: (currentUser?.sede || '').toLowerCase() === (destSedeName || '').toLowerCase()
    };
    setCurrentDraft(updated);
    if (updated.items && updated.items.length > 0) {
      triggerAutoSave(updated);
    }
  };

  const handleDestAreaChange = (areaName) => {
    setSelectedDestArea(areaName);
    const updated = {
      ...currentDraft,
      areaDestino: areaName
    };
    setCurrentDraft(updated);
    if (updated.items && updated.items.length > 0) {
      triggerAutoSave(updated);
    }
  };

  const handleBarcodeDetected = async (barcode, itemObject) => {
    setIsScannerOpen(false);
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

    // Registrar producto automáticamente en Catálogo Limpio
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

    const isTargetOwnSede = (selectedDestSede || currentDraft.sucursalDestino || '').toLowerCase() === (currentUser?.sede || '').toLowerCase();
    const updated = {
      ...currentDraft,
      sucursalDestino: selectedDestSede || currentDraft.sucursalDestino || '',
      areaDestino: selectedDestArea || currentDraft.areaDestino || '',
      esTransferenciaInterna: isTargetOwnSede,
      items: newItems
    };
    setCurrentDraft(updated);
    triggerAutoSave(updated);
  };

  const executeRemoveItem = async (index) => {
    const newItems = currentDraft.items.filter((_, i) => i !== index);
    const updated = { ...currentDraft, items: newItems };
    setCurrentDraft(updated);

    if (newItems.length === 0) {
      // Si se quedó sin productos, eliminar el borrador de inmediato para no dejar basura
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
    areasList.find(a => a.nombre?.toLowerCase() === currentUser.area?.toLowerCase())?.excluirTransferencias
  );

  const availableDestSedes = sedesList.filter(s => {
    if (s.esDestino === false) return false;
    const isOwnSede = (s.nombre || '').toLowerCase() === (currentUser?.sede || '').toLowerCase();
    if (!isOwnSede) return true;
    const areas = Array.isArray(s.areas) ? s.areas : [];
    const operativeAreas = areas.filter(ar => {
      const aObj = areasList.find(a => a.nombre?.toLowerCase() === ar.toLowerCase());
      return !aObj?.excluirTransferencias;
    });
    return operativeAreas.length >= 2;
  });

  const targetSedeObj = sedesList.find(s => s.nombre === selectedDestSede);
  const targetAllAreas = Array.isArray(targetSedeObj?.areas) ? targetSedeObj.areas : [];
  const isTargetOwnSede = (selectedDestSede || '').toLowerCase() === (currentUser?.sede || '').toLowerCase();

  // Filtrar áreas que NO estén excluidas de transferencias
  const operativeTargetAreas = targetAllAreas.filter(areaName => {
    const aObj = areasList.find(a => a.nombre?.toLowerCase() === areaName.toLowerCase());
    return !aObj?.excluirTransferencias;
  });

  const availableDestAreas = isTargetOwnSede
    ? operativeTargetAreas.filter(a => a.toLowerCase() !== (currentUser?.area || '').toLowerCase())
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

    // Detección de productos con más de 4 piezas hacia destinos que NO son Bodega
    const isDestinationBodega = /bodega/i.test(selectedDestArea || '') || /bodega/i.test(selectedDestSede || '');
    const bulkItems = (currentDraft.items || []).filter(item => (Number(item.cantidadSolicitada) || 0) > 4);

    // Si el destino NO es una bodega y se solicitan más de 4 piezas, advertir con la cuenta regresiva
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
      const finalized = {
        ...currentDraft,
        folio: currentDraft.folio || '',
        sucursalOrigen: currentUser?.sede || 'Sucursal',
        areaOrigen: currentUser?.area || '',
        sucursalDestino: selectedDestSede,
        areaDestino: selectedDestArea || '',
        usuarioSolicitante: currentUser?.username,
        esTransferenciaInterna: isTargetOwnSede,
        fecha: new Date().toISOString()
      };
      if (finalized.items && finalized.items.length > 0) {
        await catalogService.saveBatchToCleanCatalog(finalized.items);
      }
      await transferService.saveDraft(finalized);
      await transferService.submitSolicitud(finalized.id);

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
    const isAdmin =
      currentUser?.username?.toLowerCase() === 'administrador' ||
      currentUser?.roles?.includes('admin');
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
        try {
          await transferService.deleteDraft(sol.id, currentUser);
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
        }
      },
      onCancel: closeDialog
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      <div className="flex items-center justify-between vt-module-header">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /><span>Volver al Inicio</span>
        </button>
        <div className="bg-slate-200/70 p-0.5 rounded-full flex text-xs font-medium">
          <button
            onClick={() => handleSwitchTab('captura')}
            className={`px-3 py-1 rounded-full cursor-pointer transition-all duration-200 ${
              activeTab === 'captura'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Captura
          </button>
          <button
            onClick={() => handleSwitchTab('historial')}
            className={`px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-all duration-200 ${
              activeTab === 'historial'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3 h-3" />
            <span>Historial ({historialList.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'captura' ? (
        <div key="tab-captura" className="space-y-5 animate-fade-in">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
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
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2 text-xs text-amber-800">
                <Info className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Tu área actual (<strong>{currentUser?.area}</strong>) está configurada como excluida de transferencias de mercancía.
                </span>
              </div>
            )}

            {/* Selector de Destino: Sede y Área Condicional */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Sede de Destino *
                </label>
                <select
                  value={selectedDestSede}
                  onChange={(e) => handleDestSedeChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
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
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Área de Destino {targetHasAreas ? '*' : ''}
                </label>
                {targetHasAreas ? (
                  <select
                    value={selectedDestArea}
                    onChange={(e) => handleDestAreaChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">-- Seleccionar Área --</option>
                    {availableDestAreas.map((areaName, idx) => (
                      <option key={idx} value={areaName}>
                        {areaName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full bg-slate-100/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-500 text-xs flex items-center gap-1.5">
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

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Productos ({currentDraft.items?.length || 0})</h3>
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
              <div className="divide-y divide-slate-100">
                {currentDraft.items.map((item, idx) => (
                  <div key={item.codigo + '-' + idx} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <MarqueeText
                        text={item.descripcion}
                        className="text-sm font-semibold text-slate-900 block"
                      />
                      <p className="text-xs font-mono text-slate-400">Código: {item.codigo}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(idx, -1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Disminuir piezas"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold text-xs px-2 text-slate-800 min-w-8 text-center select-none">
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

            {currentDraft.items && currentDraft.items.length > 0 && (
              <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-slate-500">Tu lista está autoguardada.</span>
                <button onClick={handleSubmitSolicitud} className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold text-xs rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer">
                  <Send className="w-4 h-4" /><span>Enviar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div key="tab-historial" className="space-y-3 animate-fade-in">
          {historialList.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-1">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No hay transferencias en el historial</p>
              <p className="text-xs text-slate-400">Tus solicitudes y borradores aparecerán aquí.</p>
            </div>
          ) : (
            historialList.map((sol) => {
              const isDraft = sol.estado === 'borrador';
              const isAdmin =
                currentUser?.username?.toLowerCase() === 'administrador' ||
                currentUser?.roles?.includes('admin');
              const canDeleteDraft = isDraft && (isAdmin || sol.usuarioSolicitante === currentUser?.username);

              return (
                <div
                  key={sol.id}
                  onClick={() => {
                    if (isDraft) {
                      // Cargar borrador para continuar capturando
                      setCurrentDraft(sol);
                      if (sol.sucursalDestino) setSelectedDestSede(sol.sucursalDestino);
                      if (sol.areaDestino) setSelectedDestArea(sol.areaDestino);
                      handleSwitchTab('captura');
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    } else {
                      // Abrir vista detallada para completadas o en tránsito
                      setDetailSolicitud(sol);
                    }
                  }}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-bold text-slate-900 font-mono text-blue-700 shrink-0">
                        {sol.folio ? sol.folio : `Ref: ${formatTransferFolio(sol)}`}
                      </span>
                      {Boolean(sol.esTransferenciaInterna || (sol.sucursalOrigen && sol.sucursalOrigen === sol.sucursalDestino)) && (
                        <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0">
                          Transferencia Interna
                        </span>
                      )}
                      {(sol.sucursalDestino || sol.areaDestino) && (
                        <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full truncate">
                          ➔ {sol.sucursalDestino || 'Destino'}{sol.areaDestino ? ` (${sol.areaDestino})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          isDraft
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : sol.estado === 'faltantes_despachados'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : sol.estado === 'cerrada_con_faltantes'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : sol.estado === 'recibida_incompleta'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : sol.estado === 'completada' || sol.estado === 'recibida'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : sol.estado === 'en_despacho'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {isDraft
                          ? 'Borrador'
                          : sol.estado === 'faltantes_despachados'
                          ? 'Faltantes en camino'
                          : sol.estado === 'cerrada_con_faltantes'
                          ? 'Cerrada c/ faltantes'
                          : sol.estado === 'recibida_incompleta'
                          ? 'Incompleta'
                          : sol.estado === 'recibida' && sol.reporteFaltantes?.length > 0
                          ? 'Recibida c/ Faltantes'
                          : sol.estado === 'en_despacho'
                          ? 'En Despacho'
                          : sol.estado
                          ? String(sol.estado).replace(/_/g, ' ')
                          : ''}
                      </span>

                      {/* Botón de eliminar SOLO disponible para borradores */}
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
                </div>
              );
            })
          )}
        </div>
      )}

      <BarcodeScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onDetected={handleBarcodeDetected} />
      <CaptureQuantityModal isOpen={isQuantityOpen} scannedItem={scannedMedicine} onClose={() => setIsQuantityOpen(false)} onConfirmQuantity={handleConfirmQuantity} />
      <ModalDialog isOpen={dialog.isOpen} type={dialog.type} title={dialog.title} message={dialog.message} confirmText={dialog.confirmText} onConfirm={dialog.onConfirm} onCancel={dialog.onCancel} />
      
      {/* Modal de Detalle de Transferencia */}
      <TransferDetailModal
        isOpen={Boolean(detailSolicitud)}
        solicitud={detailSolicitud}
        onClose={() => setDetailSolicitud(null)}
      />

      {/* Modal de Advertencia con Cuenta Regresiva para Pedidos > 4 Piezas hacia Bodega */}
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
}