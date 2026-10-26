import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { transferService, formatTransferFolio } from '../transferencias';
import { catalogService } from '../catalogo/catalogService';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { TransferDetailModal } from '../transferencias/TransferDetailModal';
import { DespacharFaltantesModal } from './DespacharFaltantesModal';

export function DespacharModule({ currentUser, onBack, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => {
    return transferService.getLocalSolicitudes() || [];
  });
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [detailSolicitud, setDetailSolicitud] = useState(null);
  const [selectedFaltanteSolicitud, setSelectedFaltanteSolicitud] = useState(null);
  const [isLoadingSolicitudes, setIsLoadingSolicitudes] = useState(() => {
    return (transferService.getLocalSolicitudes() || []).length === 0;
  });

  // Estado global de carga
  const [isProcessing, setIsProcessing] = useState(false);

  // Folio de transferencia capturado por el despachador
  const [dispatchFolioDigits, setDispatchFolioDigits] = useState('');

  // Helper para persistir orden seleccionada en sessionStorage y restaurar scroll
  const handleSelectSolicitud = (sol) => {
    setSelectedSolicitud(sol);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (sol) {
      const initialDigits = sol.folio ? String(sol.folio).replace(/^TR/i, '') : '';
      setDispatchFolioDigits(initialDigits);
      if (sol.id) {
        sessionStorage.setItem('erp_despachar_solicitud_id', sol.id);
      }
    } else {
      setDispatchFolioDigits('');
      sessionStorage.removeItem('erp_despachar_solicitud_id');
    }
  };

  // Extra medicine states
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQtyModalOpen, setIsQtyModalOpen] = useState(false);

  const [extraQuery, setExtraQuery] = useState('');
  const [extraResults, setExtraResults] = useState([]);
  const [selectedExtraItem, setSelectedExtraItem] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Pop-up dialog states
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
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const isAdmin =
    currentUser?.username?.toLowerCase() === 'administrador' ||
    currentUser?.roles?.includes('admin');

  useEffect(() => {
    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      let filtered = list;

      if (!isAdmin) {
        const userArea = (currentUser?.area || '').toLowerCase();
        const isPatente = userArea.includes('patente');
        const isGenerico = userArea.includes('generic') || userArea.includes('genéric');

        filtered = list.filter((s) => {
          const areaDest = (s.areaDestino || '').toLowerCase();

          // 1. Usuarios de Patente solo visualizan solicitudes y borradores destinados a Bodega de Patente
          if (isPatente) {
            return areaDest.includes('patente') || s.usuarioDestino === currentUser?.username;
          }

          // 2. Usuarios de Genérico solo visualizan solicitudes y borradores de Genérico
          if (isGenerico) {
            return (
              areaDest.includes('generic') ||
              areaDest.includes('genéric') ||
              s.usuarioDestino === currentUser?.username
            );
          }

          // Otras áreas específicas
          if (userArea && userArea !== 'externo') {
            return areaDest.includes(userArea) || s.usuarioDestino === currentUser?.username;
          }

          return s.usuarioDestino === currentUser?.username;
        });
      }

      setSolicitudes(filtered);
      setIsLoadingSolicitudes(false);

      const savedId = sessionStorage.getItem('erp_despachar_solicitud_id');
      const targetId = selectedSolicitud?.id || savedId;
      if (targetId) {
        const refreshed = filtered.find(s => s.id === targetId);
        if (refreshed) {
          setSelectedSolicitud(refreshed);
          setDispatchFolioDigits(prev => {
            if (prev) return prev;
            return refreshed.folio ? String(refreshed.folio).replace(/^TR/i, '') : '';
          });
        } else if (!filtered.some(s => s.id === targetId)) {
          sessionStorage.removeItem('erp_despachar_solicitud_id');
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser, selectedSolicitud?.id, isAdmin]);

  // Borradores: Solo pueden ser eliminados por su creador original o Administrador
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

  // Classification of requests
  const readyToDispatch = solicitudes.filter(s => s.estado === 'enviada' || s.estado === 'en_despacho');
  const reportesIncompletos = solicitudes.filter(s => s.estado === 'recibida_incompleta');
  const inProgressDrafts = solicitudes.filter(s => s.estado === 'borrador');
  const completedSolicitudes = solicitudes.filter(
    s =>
      s.estado === 'completada' ||
      s.estado === 'recibida' ||
      s.estado === 'faltantes_despachados' ||
      s.estado === 'cerrada_con_faltantes'
  );

  const handleConfirmFaltantesResolution = async (resolutionData) => {
    if (!selectedFaltanteSolicitud) return;

    setIsProcessing(true);
    try {
      await transferService.resolveReporteFaltantes(selectedFaltanteSolicitud.id, {
        ...resolutionData,
        usuarioResolucion: currentUser?.username || 'bodega'
      });
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
    await transferService.toggleItemAtendido(selectedSolicitud.id, index);
  };

  const resetExtraModal = () => {
    setIsExtraModalOpen(false);
    setIsQtyModalOpen(false);
    setExtraQuery('');
    setExtraResults([]);
    setSelectedExtraItem(null);
  };

  // --- LÓGICA DE BÚSQUEDA MEJORADA (AUTO-SELECCIÓN) ---
  const handleExecuteSearch = async (e) => {
    if (e) e.preventDefault();
    const query = extraQuery.trim();
    
    if (!query) {
      setExtraResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // 1. Si coincide exactamente con un código de producto (ej. "01", "001", "1", EAN), auto-seleccionar
      const exactItem = await catalogService.findByBarcode(query);
      if (exactItem) {
        handleSelectExtraItem(exactItem); // Se salta la lista y abre la ventana de cantidad
        setIsSearching(false);
        return;
      }

      // 2. Si no es un código exacto, busca la lista de coincidencias en catálogo
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
      await transferService.addExtraItem(selectedSolicitud.id, {
        codigo: selectedExtraItem.codigo,
        descripcion: selectedExtraItem.descripcion,
        cantidad: qty
      });
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
    e.stopPropagation();

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Eliminar Extra',
      message: '¿Estás seguro que deseas quitar este producto extra de la lista de envío?',
      variant: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          await transferService.removeExtraItem(selectedSolicitud.id, index);
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  const handleExtraScanDetected = async (barcode, itemObject) => {
    setIsScannerOpen(false);
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
    if (!selectedSolicitud) return;

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
    const allChecked = selectedSolicitud.items?.every(i => i.atendido);

    if (!allChecked) {
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: 'Productos pendientes en caja',
        message: `Aún tienes productos sin marcar como empacados en la caja física.\n¿Deseas finalizar y enviar el despacho con folio ${fullFolio} de todas formas?`,
        confirmText: 'Finalizar de todos modos',
        cancelText: 'Continuar empacando',
        variant: 'danger',
        onConfirm: async () => {
          closeDialog();
          setIsProcessing(true);
          try {
            await transferService.completeSolicitud(selectedSolicitud.id, fullFolio);
            handleSelectSolicitud(null);
          } finally {
            setIsProcessing(false);
          }
        },
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
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          await transferService.completeSolicitud(selectedSolicitud.id, fullFolio);
          handleSelectSolicitud(null);
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 relative">

      {/* PANTALLA DE CARGA GLOBAL */}
      {isProcessing && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <span className="text-sm font-bold text-slate-800">Procesando...</span>
          </div>
        </div>,
        document.body
      )}

      {/* Top Header Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (selectedSolicitud) {
              handleSelectSolicitud(null);
            } else {
              onBack();
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{selectedSolicitud ? 'Volver a Pedidos' : 'Volver al Inicio'}</span>
        </button>

        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          Bodega: <strong className="text-slate-800">{currentUser?.area}</strong>
        </span>
      </div>

      {!selectedSolicitud ? (
        /* MAIN LIST VIEW */
        <div className="space-y-6 animate-fade-in">

          {/* REPORTE DE FALTANTES */}
          {reportesIncompletos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                <h3 className="text-sm font-bold text-slate-900">
                  Atención: Reporte de Faltantes ({reportesIncompletos.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {reportesIncompletos.map((sol) => (
                  <div key={sol.id} className="bg-red-50 rounded-3xl p-4 border border-red-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-red-900 font-mono text-sm">
                        Folio: {sol.folio || formatTransferFolio(sol)}
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 uppercase">
                        Sucursal: {sol.sucursalOrigen}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-red-800 mb-1">Productos reportados como faltantes:</p>
                    <ul className="text-xs text-red-700 space-y-1 mb-2 bg-white/60 p-2.5 rounded-xl border border-red-100">
                      {sol.reporteFaltantes?.map((faltante, i) => (
                        <li key={i} className="flex justify-between items-center">
                          <span>&bull; {faltante.descripcion}</span>
                          <strong className="font-mono text-red-800">{faltante.cantidadDespachada} pz</strong>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 pt-2.5 border-t border-red-200/70 flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-[11px] text-red-600 italic">
                        Reporte pendiente de resolución por Bodega.
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFaltanteSolicitud(sol);
                        }}
                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
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

          {/* SECTION 1: READY TO DISPATCH */}
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
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold text-blue-700 font-mono">
                              {sol.folio ? `${sol.folio} — ${sol.sucursalOrigen}` : `${sol.sucursalOrigen} • Ref: ${formatTransferFolio(sol)}`}
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              {sol.estado === 'en_despacho' ? 'En Surtido' : 'Nueva Solicitud'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Solicitante: <strong className="text-slate-700">{sol.usuarioSolicitante}</strong>
                          </p>
                        </div>

                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Items Summary Pills */}
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

                      {/* Packing Progress Bar */}
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

          {/* SECTION 2: IN PROCESS DRAFTS */}
          <div className="space-y-3 pt-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700 tracking-tight">
                  En Proceso de Captura en Sucursales ({inProgressDrafts.length})
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                Monitoreo en vivo &bull; Aún no enviadas
              </span>
            </div>

            {inProgressDrafts.length === 0 ? (
              <div className="bg-slate-100/60 rounded-3xl p-6 border border-slate-200/60 text-center text-slate-400 text-xs">
                No hay sucursales armando borradores en este momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {inProgressDrafts.map((sol) => {
                  const canDelete = isAdmin || sol.usuarioSolicitante === currentUser?.username;

                  return (
                    <div
                      key={sol.id}
                      className="bg-white/80 rounded-2xl p-4 border border-slate-200/60 shadow-sm flex items-center justify-between gap-3 opacity-90"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800">
                            {sol.folio ? `${sol.folio} (${sol.sucursalOrigen})` : `${sol.sucursalOrigen} • Ref: ${formatTransferFolio(sol)}`}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 uppercase">
                            Borrador en vivo
                          </span>
                          {sol.areaDestino && (
                            <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                              {sol.areaDestino}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {sol.usuarioSolicitante} está capturando ({sol.items?.length || 0} productos hasta ahora)
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400">
                          {new Date(sol.fecha).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {canDelete && (
                          <button
                            onClick={(e) => handleDeleteDraft(e, sol)}
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
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

          {/* SECTION 3: COMPLETED */}
          {completedSolicitudes.length > 0 && (
            <div className="pt-4 border-t border-slate-200/60 space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Transferencias Realizadas ({completedSolicitudes.length})
                </h4>
                <span className="text-[11px] text-slate-400">Haz clic para ver el resumen detallado</span>
              </div>
              <div className="space-y-2">
                {completedSolicitudes.map((sol) => (
                  <div
                    key={sol.id}
                    onClick={() => setDetailSolicitud(sol)}
                    className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all text-xs flex items-center justify-between text-slate-500 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm mr-2">
                          {sol.folio || formatTransferFolio(sol)}
                        </span>
                        <span className="text-slate-700 font-semibold mr-1">
                          {sol.sucursalOrigen}
                        </span>
                        <span className="text-slate-400">
                          &bull; {sol.items?.length || 0} productos
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sol.estado === 'faltantes_despachados'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : sol.estado === 'cerrada_con_faltantes'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : sol.estado === 'recibida_incompleta'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : sol.estado === 'recibida'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {sol.estado === 'faltantes_despachados'
                          ? 'Faltantes en Tránsito'
                          : sol.estado === 'cerrada_con_faltantes'
                          ? 'Cerrada c/ Faltantes'
                          : sol.estado === 'recibida_incompleta'
                          ? 'Incompleta'
                          : sol.estado === 'recibida'
                          ? 'Recibida'
                          : 'Completada'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        /* DETAIL TO-DO CHECKLIST VIEW */
        <div key={selectedSolicitud.id} className="space-y-4 animate-fade-in">

          {/* Header Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
                  Orden de Despacho & Surtido
                </span>
                <h2 className="text-xl font-extrabold text-slate-900 font-mono">
                  {selectedSolicitud.folio ? `${selectedSolicitud.folio} - ${selectedSolicitud.sucursalOrigen}` : selectedSolicitud.sucursalOrigen}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Solicitado por: <strong className="text-slate-800">{selectedSolicitud.usuarioSolicitante}</strong> &bull; Ref: <span className="font-mono font-semibold text-slate-700">{formatTransferFolio(selectedSolicitud)}</span>
                </p>
              </div>

              {/* Add Extra Item Button */}
              <button
                onClick={() => setIsExtraModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-2xl border border-blue-200 transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Agregar Extras</span>
              </button>
            </div>

            {/* Folio de Transferencia generado por el sistema externo */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span>Folio de Transferencia (del sistema)</span>
                  <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Ingresa el número generado al transferir
                </span>
              </div>
              <div className="flex items-stretch shadow-sm rounded-xl overflow-hidden border border-slate-200 focus-within:border-blue-500 max-w-xs bg-white">
                <div className="bg-slate-100 px-3.5 py-2 text-slate-600 font-bold text-sm border-r border-slate-200 flex items-center justify-center select-none">
                  TR
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dispatchFolioDigits}
                  placeholder="000123"
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setDispatchFolioDigits(digits);
                    const fullFolio = digits ? `TR${digits}` : '';
                    setSelectedSolicitud(prev => prev ? ({ ...prev, folio: fullFolio }) : null);
                    transferService.updateFolio(selectedSolicitud.id, fullFolio);
                  }}
                  className="w-full bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Checklist progress summary */}
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

          {/* Interactive To-Do Packing List */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {selectedSolicitud.items?.map((item, index) => (
              <div
                key={index}
                onClick={() => handleToggleItem(index)}
                className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  item.atendido ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      item.atendido
                        ? 'bg-emerald-500 text-white shadow-sm scale-105'
                        : 'border-2 border-slate-300 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-sm font-semibold truncate ${
                          item.atendido
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 font-bold'
                        }`}
                      >
                        {item.descripcion}
                      </h4>
                      {item.esExtra && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                          EXTRA
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Código: {item.codigo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold ${
                      item.atendido
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {item.esExtra ? item.cantidadDespachada : item.cantidadSolicitada} pzas
                  </span>
                  {item.esExtra && (
                    <button
                      onClick={(e) => handleRemoveExtraItem(e, index)}
                      className="w-8 h-8 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                      title="Eliminar extra"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Finalize Button */}
          <div className="pt-2">
            <button
              onClick={handleFinalizeDispatch}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Truck className="w-5 h-5" />
              <span>Finalizar y Enviar Caja a Sucursal</span>
            </button>
          </div>

        </div>
      )}

      {/* Extra Medicine Search Modal */}
      {isExtraModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto max-h-[90vh]">
            <div className="p-5 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Agregar Producto Extra</h3>
              <button
                onClick={resetExtraModal}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="w-full py-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 border border-blue-200 transition-colors cursor-pointer"
              >
                <ScanBarcode className="w-4 h-4" />
                <span>Escanear código de barras</span>
              </button>

              <form onSubmit={handleExecuteSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o fármaco..."
                    value={extraQuery}
                    onChange={(e) => setExtraQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                  />
                  {extraQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setExtraQuery('');
                        setExtraResults([]);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                      title="Limpiar búsqueda"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
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
                      onClick={() => handleSelectExtraItem(med)}
                      className="p-3 text-xs hover:bg-blue-50 cursor-pointer text-slate-800 flex justify-between items-center transition-colors"
                    >
                      <span className="font-semibold truncate pr-2">{med.descripcion}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-white px-2 py-1 rounded-md border border-slate-100">
                        {med.codigo}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Cantidad (Mismo componente usado en Solicitar) */}
      <CaptureQuantityModal
        isOpen={isQtyModalOpen}
        onClose={resetExtraModal}
        scannedItem={selectedExtraItem}
        onConfirmQuantity={handleConfirmQuantity}
      />

      {/* Barcode scanner for extras */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleExtraScanDetected}
      />

      {/* Custom React Dialog Pop-up */}
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
      />

      {/* Modal de Detalle de Transferencia Completada */}
      <TransferDetailModal
        isOpen={Boolean(detailSolicitud)}
        solicitud={detailSolicitud}
        onClose={() => setDetailSolicitud(null)}
      />

      {/* Modal Independiente para Atender y Despachar Faltantes */}
      <DespacharFaltantesModal
        isOpen={Boolean(selectedFaltanteSolicitud)}
        solicitud={selectedFaltanteSolicitud}
        onClose={() => setSelectedFaltanteSolicitud(null)}
        onConfirmResolution={handleConfirmFaltantesResolution}
        isProcessing={isProcessing}
      />

    </div>
  );
}