import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Tag, Plus, Trash2, AlertCircle } from 'lucide-react';

const COLOR_OPTIONS = [
  { id: 'blue', label: 'Azul', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { id: 'indigo', label: 'Índigo', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  { id: 'purple', label: 'Púrpura', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { id: 'amber', label: 'Ámbar', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { id: 'emerald', label: 'Verde', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { id: 'rose', label: 'Rosa', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
];

export function MaterialTypesModal({ isOpen, tipos = [], onClose, onAddTipo, onDeleteTipo }) {
  const [nombre, setNombre] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const clean = nombre.trim();
    if (!clean) {
      setErrorMsg('Ingresa el nombre del tipo de control.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onAddTipo(clean, selectedColor);
      setNombre('');
    } catch (err) {
      setErrorMsg(err.message || 'Error al agregar tipo de control.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in select-none overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Tipos de Control
              </h3>
              <p className="text-[11px] text-slate-500">
                Categorías de material (Papelería, Informática, Herramientas...)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200/80 rounded-2xl text-red-700 flex items-start gap-2.5 animate-fade-in text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* FORMULARIO PARA CREAR NUEVO TIPO */}
          <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider text-[10px]">
              Crear Nuevo Tipo de Control
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej. Papelería, Cómputo, Seguridad..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isSubmitting || !nombre.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>

            {/* SELECCIÓN DE COLOR */}
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-1.5">Color de identificación:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLOR_OPTIONS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setSelectedColor(col.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${col.bg} ${col.text} ${
                      selectedColor === col.id ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-400 font-extrabold' : col.border
                    }`}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* LISTADO DE TIPOS EXISTENTES */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-700">
              Tipos Registrados ({tipos.length})
            </span>
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
              {tipos.map((tipo) => {
                const colorObj = COLOR_OPTIONS.find(c => c.id === tipo.color) || COLOR_OPTIONS[0];
                return (
                  <div
                    key={tipo.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colorObj.bg} ${colorObj.text} ${colorObj.border}`}>
                        {tipo.nombre}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteTipo(tipo.id)}
                      className="w-7 h-7 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                      title="Eliminar tipo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            Listo
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
