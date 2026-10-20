import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, Check, PackageOpen, AlertTriangle } from 'lucide-react';
import { transferService } from '../services/transferService';
import { ModalDialog } from './ModalDialog';

export function RecibirModule({ currentUser, onBack }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);

  useEffect(() => {
    const unsubscribe = transferService.subscribeSolicitudes((list) => {
      // Mostrar solo los pedidos que Matriz ya despachó ("completada") para esta sucursal
      const validos = list.filter(s => s.estado === 'completada' && s.usuarioSolicitante === currentUser.username);
      setSolicitudes(validos);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const openOrder = (sol) => {
    setSelectedOrder(sol);
    setCheckedItems({});
  };

  const toggleItem = (index) => {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleListo = () => {
    const total = selectedOrder.items?.length || 0;
    const isAllChecked = selectedOrder.items?.every((_, i) => checkedItems[i]);

    if (!isAllChecked) {
      setConfirmIncomplete(false);
      setIsReportModalOpen(true);
    } else {
      finalizeReceive([]); // Todo completo, sin faltantes
    }
  };

  const finalizeReceive = async (faltantes) => {
    await transferService.receiveSolicitud(selectedOrder.id, faltantes);
    setIsReportModalOpen(false);
    setSelectedOrder(null);
  };

  const sendReport = () => {
    const faltantes = selectedOrder.items.filter((_, i) => !checkedItems[i]);
    finalizeReceive(faltantes);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <button onClick={() => selectedOrder ? setSelectedOrder(null) : onBack()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /><span>{selectedOrder ? 'Volver' : 'Volver al Inicio'}</span>
        </button>
      </div>

      {!selectedOrder ? (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Transferencias Entrantes ({solicitudes.length})</h3>
          {solicitudes.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
              <p className="text-sm font-semibold text-slate-700">Sin pedidos entrantes</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {solicitudes.map(sol => (
                <div key={sol.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold text-blue-700 font-mono tracking-tight">{sol.folio || 'Sin Folio'}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Enviado por: {sol.usuarioDestino}</p>
                    <p className="text-[11px] font-semibold text-slate-400 mt-1">{sol.items?.length || 0} medicamentos en total</p>
                  </div>
                  <button onClick={() => openOrder(sol)} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-sm cursor-pointer">
                    Continuar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Recepción de Caja Física</span>
            <h2 className="text-xl font-extrabold text-slate-900 font-mono">{selectedOrder.folio}</h2>
            <p className="text-xs text-slate-500">Toca el producto tras verificar que viene dentro de la caja.</p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {selectedOrder.items?.map((item, index) => (
              <div key={index} onClick={() => toggleItem(index)} className={`p-4 flex items-center gap-3 cursor-pointer transition-colors ${checkedItems[index] ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${checkedItems[index] ? 'bg-indigo-500 text-white' : 'border-2 border-slate-300'}`}>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={`text-sm font-bold ${checkedItems[index] ? 'line-through text-slate-400' : 'text-slate-900'}`}>{item.descripcion}</h4>
                  <span className="text-[11px] font-mono text-slate-400">{item.codigo}</span>
                </div>
                <span className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold bg-slate-100 text-slate-800">{item.cantidadDespachada} pzas</span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <button onClick={handleListo} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-sm rounded-3xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer">
              <PackageOpen className="w-5 h-5" /><span>Listo, Terminar Revisión</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL INLINE: REPORTE DE FALTANTES */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Aviso: Revisión Incompleta</h3>
                <p className="text-xs text-slate-500 mt-1">No has seleccionado todos los elementos. Faltan productos físicos en la caja.</p>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-2xl cursor-pointer">
              <input type="checkbox" checked={confirmIncomplete} onChange={(e) => setConfirmIncomplete(e.target.checked)} className="mt-0.5 w-4 h-4 text-red-600 rounded" />
              <span className="text-xs font-bold text-red-900">No he recibido el pedido completo y quiero reportar faltantes a Matriz.</span>
            </label>

            {confirmIncomplete && (
              <div className="max-h-40 overflow-y-auto border-t border-slate-100 pt-3 text-xs">
                <span className="font-bold text-slate-700 block mb-2">Se reportará lo siguiente:</span>
                <ul className="space-y-1 text-slate-600">
                  {selectedOrder.items.filter((_, i) => !checkedItems[i]).map((it, idx) => (
                    <li key={idx} className="flex justify-between border-b border-slate-50 pb-1">
                      <span className="truncate">{it.descripcion}</span>
                      <strong className="font-mono">{it.cantidadDespachada}pz</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 flex gap-2 justify-end">
              <button onClick={() => setIsReportModalOpen(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-2xl cursor-pointer">Cancelar</button>
              <button disabled={!confirmIncomplete} onClick={sendReport} className={`px-4 py-2.5 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer ${confirmIncomplete ? 'bg-red-600 hover:bg-red-500' : 'bg-red-300'}`}>Enviar Reporte</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}