import React, { useState, useEffect } from 'react';
import {
  ScanBarcode, Send, Trash2, CheckCircle2, ArrowLeft, History, ChevronRight
} from 'lucide-react';
import { userService } from '../usuarios/userService';
import { catalogService } from '../catalogo/catalogService';
import { transferService, formatTransferFolio } from '../transferencias';
import { TransferDetailModal } from '../transferencias/TransferDetailModal';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { CaptureQuantityModal } from '../../shared/CaptureQuantityModal';
import { ModalDialog } from '../../shared/ModalDialog';

export function SolicitarModule({ currentUser, onBack, onRefresh }) {
  const [destinatarios, setDestinatarios] = useState([]);
  const [selectedDestinatarioId, setSelectedDestinatarioId] = useState('');
  const [detailSolicitud, setDetailSolicitud] = useState(null);

  const [currentDraft, setCurrentDraft] = useState({
    id: 'sol-' + Date.now(),
    sucursalOrigen: currentUser?.sede || 'Sucursal',
    usuarioSolicitante: currentUser?.username,
    usuarioDestino: '',
    areaDestino: '',
    estado: 'borrador',
    fecha: new Date().toISOString(),
    items: []
  });

  const [savingStatus, setSavingStatus] = useState('saved');
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('erp_solicitar_active_tab') || 'captura';
  });
  const [historialList, setHistorialList] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(false);
  const [scannedMedicine, setScannedMedicine] = useState(null);

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
    async function init() {
      const matrizUsers = await userService.getMatrizDestinatarios();
      setDestinatarios(matrizUsers);

      const draft = await transferService.getActiveDraft(currentUser.username);
      if (draft && draft.items && draft.items.length > 0) {
        setCurrentDraft(draft);
        if (draft.usuarioDestino) setSelectedDestinatarioId(draft.usuarioDestino);
      }
    }
    init();

    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      setHistorialList(
        list.filter(s => {
          if (s.usuarioSolicitante !== currentUser.username) return false;
          if (s.estado === 'borrador' && (!s.items || s.items.length === 0)) return false;
          return true;
        })
      );
    });
    return () => unsubscribe();
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
      await transferService.saveDraft({ ...draft, folio: draft.folio || '' });
      setSavingStatus('saved');
    } catch (e) {
      setSavingStatus('saved');
    }
  };

  const handleDestinatarioChange = (username) => {
    setSelectedDestinatarioId(username);
    if (!username) {
      const updated = { ...currentDraft, usuarioDestino: '', areaDestino: '' };
      setCurrentDraft(updated);
      if (updated.items && updated.items.length > 0) {
        triggerAutoSave(updated);
      }
      return;
    }
    const destUser = destinatarios.find(d => d.username === username);
    if (destUser) {
      const updated = { ...currentDraft, usuarioDestino: destUser.username, areaDestino: destUser.area };
      setCurrentDraft(updated);
      if (updated.items && updated.items.length > 0) {
        triggerAutoSave(updated);
      }
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

    const destUser = destinatarios.find(d => d.username === selectedDestinatarioId) || destinatarios[0];
    const updated = { ...currentDraft, usuarioDestino: destUser?.username || '', areaDestino: destUser?.area || '', items: newItems };
    setCurrentDraft(updated);
    triggerAutoSave(updated);
  };

  const handleRemoveItem = async (index) => {
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

  const handleSubmitSolicitud = async () => {
    if (!selectedDestinatarioId) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Destinatario Requerido',
        message: 'Por favor selecciona a quién solicitas la transferencia en el menú desplegable.',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }
    if (!currentDraft.items || currentDraft.items.length === 0) {
      setDialog({ isOpen: true, type: 'alert', title: 'Lista vacía', message: 'Agrega al menos un producto escaneando su código.', confirmText: 'Entendido', onConfirm: closeDialog });
      return;
    }
    const destUser = destinatarios.find(d => d.username === selectedDestinatarioId);
    if (!destUser) {
      setDialog({ isOpen: true, type: 'alert', title: 'Destinatario Inválido', message: 'El destinatario seleccionado no es válido. Por favor selecciona uno de la lista.', confirmText: 'Entendido', onConfirm: closeDialog });
      return;
    }

    setDialog({
      isOpen: true, type: 'confirm', title: 'Confirmar Envío a Matriz',
      message: `¿Deseas enviar la solicitud de transferencia con ${currentDraft.items.length} productos a ${destUser.nombre}?`,
      confirmText: 'Enviar Pedido', cancelText: 'Revisar',
      onConfirm: async () => {
        closeDialog();
        try {
          const finalized = {
            ...currentDraft,
            folio: currentDraft.folio || '',
            usuarioDestino: destUser.username,
            areaDestino: destUser.area,
            fecha: new Date().toISOString()
          };
          await transferService.saveDraft(finalized);
          await transferService.submitSolicitud(finalized.id);

          setCurrentDraft({
            id: 'sol-' + Date.now(),
            sucursalOrigen: currentUser?.sede,
            usuarioSolicitante: currentUser?.username,
            usuarioDestino: '',
            areaDestino: '',
            estado: 'borrador',
            fecha: new Date().toISOString(),
            items: []
          });
          setSelectedDestinatarioId('');
          setActiveTab('historial');
        } catch (e) {}
      }, onCancel: closeDialog
    });
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
              usuarioSolicitante: currentUser?.username,
              usuarioDestino: '',
              areaDestino: '',
              estado: 'borrador',
              fecha: new Date().toISOString(),
              items: []
            });
            setSelectedDestinatarioId('');
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
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /><span>Volver al Inicio</span>
        </button>
        <div className="bg-slate-200/70 p-0.5 rounded-full flex text-xs font-medium">
          <button
            onClick={() => setActiveTab('captura')}
            className={`px-3 py-1 rounded-full cursor-pointer transition-all duration-200 ${
              activeTab === 'captura'
                ? 'bg-white text-slate-900 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Captura
          </button>
          <button
            onClick={() => setActiveTab('historial')}
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
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detalles de Envío</span>
            </div>

            {/* Selector de Destinatario */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                ¿A quién solicitas la transferencia? *
              </label>
              <select
                value={selectedDestinatarioId}
                onChange={(e) => handleDestinatarioChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="">-- Seleccionar destinatario --</option>
                {destinatarios.map((d) => (
                  <option key={d.username} value={d.username}>
                    {d.nombre} — {d.area}
                  </option>
                ))}
              </select>
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
                      <h4 className="text-sm font-semibold text-slate-900 truncate">{item.descripcion}</h4>
                      <p className="text-xs font-mono text-slate-400">Código: {item.codigo}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold rounded-xl text-sm border border-blue-100 font-mono">{item.cantidadSolicitada} pzas</span>
                      <button onClick={() => handleRemoveItem(idx)} className="w-8 h-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center cursor-pointer"><Trash2 className="w-4 h-4" /></button>
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
                      if (sol.usuarioDestino) setSelectedDestinatarioId(sol.usuarioDestino);
                      setActiveTab('captura');
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    } else {
                      // Abrir vista detallada para completadas o en tránsito
                      setDetailSolicitud(sol);
                    }
                  }}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 font-mono text-blue-700">
                        {sol.folio ? sol.folio : `Ref: ${formatTransferFolio(sol)}`}
                      </span>
                      {sol.areaDestino && (
                        <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                          Destino: {sol.areaDestino}
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
                          : sol.estado}
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
    </div>
  );
}