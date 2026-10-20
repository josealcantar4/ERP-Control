import React, { useState, useEffect } from 'react';
import {
  ScanBarcode, Send, Plus, Trash2, CheckCircle2, ArrowLeft, History
} from 'lucide-react';
import { userService } from '../services/userService';
import { catalogService } from '../services/catalogService';
import { transferService } from '../services/transferService';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { CaptureQuantityModal } from './CaptureQuantityModal';
import { ModalDialog } from './ModalDialog';

export function SolicitarModule({ currentUser, onBack }) {
  const [destinatarios, setDestinatarios] = useState([]);
  const [selectedDestinatarioId, setSelectedDestinatarioId] = useState('');
  
  // Agregamos el estado para el Folio (solo números)
  const [folioDigits, setFolioDigits] = useState('');

  const [currentDraft, setCurrentDraft] = useState({
    id: 'sol-' + Date.now(),
    sucursalOrigen: currentUser?.sede || 'Sucursal',
    usuarioSolicitante: currentUser?.username,
    usuarioDestino: '', areaDestino: '', estado: 'borrador', fecha: new Date().toISOString(), items: []
  });

  const [savingStatus, setSavingStatus] = useState('saved');
  const [activeTab, setActiveTab] = useState('captura');
  const [historialList, setHistorialList] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isQuantityOpen, setIsQuantityOpen] = useState(false);
  const [scannedMedicine, setScannedMedicine] = useState(null);

  const [dialog, setDialog] = useState({
    isOpen: false, type: 'alert', title: '', message: '', variant: 'primary', confirmText: 'Aceptar', onConfirm: () => {}
  });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    async function init() {
      const matrizUsers = await userService.getMatrizDestinatarios();
      setDestinatarios(matrizUsers);
      if (matrizUsers.length > 0) setSelectedDestinatarioId(matrizUsers[0].username);

      const draft = await transferService.getActiveDraft(currentUser.username);
      if (draft && draft.items && draft.items.length > 0) {
        setCurrentDraft(draft);
        if (draft.usuarioDestino) setSelectedDestinatarioId(draft.usuarioDestino);
        if (draft.folio && draft.folio.startsWith('TR')) setFolioDigits(draft.folio.replace('TR', ''));
      }
    }
    init();

    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      setHistorialList(list.filter(s => s.usuarioSolicitante === currentUser.username));
    });
    return () => unsubscribe();
  }, [currentUser]);

  const triggerAutoSave = async (draft, folioInput = folioDigits) => {
    setSavingStatus('saving');
    try {
      const fullFolio = folioInput ? `TR${folioInput}` : '';
      await transferService.saveDraft({ ...draft, folio: fullFolio });
      setSavingStatus('saved');
    } catch (e) { setSavingStatus('saved'); }
  };

  const handleDestinatarioChange = (username) => {
    setSelectedDestinatarioId(username);
    const destUser = destinatarios.find(d => d.username === username);
    if (destUser) {
      const updated = { ...currentDraft, usuarioDestino: destUser.username, areaDestino: destUser.area };
      setCurrentDraft(updated);
      triggerAutoSave(updated);
    }
  };

  const handleBarcodeDetected = async (barcode) => {
    setIsScannerOpen(false);
    const item = await catalogService.findByBarcode(barcode);
    if (!item) {
      setDialog({
        isOpen: true, type: 'prompt', title: 'Medicamento no registrado',
        message: `El código "${barcode}" no se encontró en el catálogo.\nEscribe la descripción del producto para agregarlo:`,
        inputPlaceholder: 'Ej. Paracetamol 500mg', confirmText: 'Continuar', cancelText: 'Cancelar',
        onConfirm: async () => {
          const val = dialog.inputValue?.trim();
          closeDialog();
          if (val) {
            setScannedMedicine({ codigo: barcode, descripcion: val });
            await catalogService.saveToCleanCatalog(barcode, val);
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

    const existingIndex = currentDraft.items.findIndex(i => i.codigo === scannedMedicine.codigo);
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

  const handleRemoveItem = (index) => {
    const newItems = currentDraft.items.filter((_, i) => i !== index);
    const updated = { ...currentDraft, items: newItems };
    setCurrentDraft(updated);
    triggerAutoSave(updated);
  };

  const handleSubmitSolicitud = async () => {
    if (!folioDigits.trim()) {
      setDialog({ isOpen: true, type: 'alert', title: 'Folio Requerido', message: 'Debes ingresar los dígitos numéricos del folio de transferencia.', confirmText: 'Entendido', onConfirm: closeDialog });
      return;
    }
    if (!currentDraft.items || currentDraft.items.length === 0) {
      setDialog({ isOpen: true, type: 'alert', title: 'Lista vacía', message: 'Agrega al menos un medicamento escaneando su código.', confirmText: 'Entendido', onConfirm: closeDialog });
      return;
    }
    const destUser = destinatarios.find(d => d.username === selectedDestinatarioId) || destinatarios[0];

    setDialog({
      isOpen: true, type: 'confirm', title: 'Confirmar Envío a Matriz',
      message: `¿Deseas enviar el pedido TR${folioDigits} con ${currentDraft.items.length} productos a ${destUser.nombre}?`,
      confirmText: 'Enviar Pedido', cancelText: 'Revisar',
      onConfirm: async () => {
        closeDialog();
        try {
          const finalized = { ...currentDraft, folio: `TR${folioDigits}`, usuarioDestino: destUser.username, areaDestino: destUser.area, fecha: new Date().toISOString() };
          await transferService.saveDraft(finalized);
          await transferService.submitSolicitud(finalized.id);

          setCurrentDraft({ id: 'sol-' + Date.now(), sucursalOrigen: currentUser?.sede, usuarioSolicitante: currentUser?.username, usuarioDestino: destUser.username, areaDestino: destUser.area, estado: 'borrador', fecha: new Date().toISOString(), items: [] });
          setFolioDigits('');
          setActiveTab('historial');
        } catch (e) {}
      }, onCancel: closeDialog
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /><span>Volver al Inicio</span>
        </button>
        <div className="bg-slate-200/70 p-0.5 rounded-full flex text-xs font-medium">
          <button onClick={() => setActiveTab('captura')} className={`px-3 py-1 rounded-full cursor-pointer ${activeTab === 'captura' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>Captura</button>
          <button onClick={() => setActiveTab('historial')} className={`px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer ${activeTab === 'historial' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
            <History className="w-3 h-3" /><span>Historial ({historialList.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'captura' ? (
        <>
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detalles de Envío</span>
            </div>

            {/* Selector de Destinatario */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">¿A quién solicitas la transferencia?</label>
              <select value={selectedDestinatarioId} onChange={(e) => handleDestinatarioChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500">
                {destinatarios.map((d) => <option key={d.username} value={d.username}>{d.nombre} — {d.area}</option>)}
              </select>
            </div>

            {/* Nuevo Campo Folio */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Identificador / Folio de Transferencia *</label>
              <div className="flex items-stretch shadow-sm rounded-2xl overflow-hidden border border-slate-200 focus-within:border-blue-500">
                <div className="bg-slate-100 px-4 py-3 text-slate-600 font-bold text-sm border-r border-slate-200 flex items-center justify-center">
                  TR
                </div>
                <input
                  type="text" inputMode="numeric" value={folioDigits} placeholder="000123"
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFolioDigits(val);
                    triggerAutoSave(currentDraft, val);
                  }}
                  className="w-full bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div className="text-center space-y-2">
            <button onClick={() => setIsScannerOpen(true)} className="w-full py-5 px-6 rounded-3xl bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/25 flex flex-col items-center justify-center gap-2 cursor-pointer group">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform"><ScanBarcode className="w-8 h-8 text-white" /></div>
              <div className="space-y-0.5"><span className="text-base font-bold tracking-tight">Escanear Código de Barras</span><p className="text-xs text-blue-100">Toca para capturar medicamentos</p></div>
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Medicamentos ({currentDraft.items?.length || 0})</h3>
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
        </>
      ) : (
        <div className="space-y-3">
          {historialList.map((sol) => (
            <div key={sol.id} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 font-mono text-blue-700">{sol.folio || 'Sin Folio'}</span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-600">{sol.estado}</span>
              </div>
              <div className="text-xs text-slate-500">{sol.items?.length || 0} medicamentos solicitados</div>
            </div>
          ))}
        </div>
      )}

      <BarcodeScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onDetected={handleBarcodeDetected} />
      <CaptureQuantityModal isOpen={isQuantityOpen} scannedItem={scannedMedicine} onClose={() => setIsQuantityOpen(false)} onConfirmQuantity={handleConfirmQuantity} />
      <ModalDialog isOpen={dialog.isOpen} type={dialog.type} title={dialog.title} message={dialog.message} confirmText={dialog.confirmText} onConfirm={dialog.onConfirm} onCancel={dialog.onCancel} />
    </div>
  );
}