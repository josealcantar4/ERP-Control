import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Plus, Trash2, AlertCircle, Building2, Briefcase } from 'lucide-react';

export function MaterialPersonalModal({
  isOpen,
  personalList = [],
  areasList = [],
  onClose,
  onAddPersonal,
  onDeletePersonal
}) {
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [area, setArea] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanNombre = nombre.trim();
    if (!cleanNombre) {
      setErrorMsg('Ingresa el nombre completo de la persona.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onAddPersonal(cleanNombre, puesto.trim(), area);
      setNombre('');
      setPuesto('');
      setArea('');
    } catch (err) {
      setErrorMsg(err.message || 'Error al agregar personal.');
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
            <div className="w-8 h-8 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Directorio de Personal
              </h3>
              <p className="text-[11px] text-slate-500">
                Personas registradas para asignación de herramientas y material
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

          {/* FORMULARIO PARA REGISTRAR NUEVA PERSONA */}
          <form onSubmit={handleAdd} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider text-[10px]">
              Agregar Nueva Persona
            </label>
            
            <input
              type="text"
              placeholder="Nombre completo (ej. Juan Pérez)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Puesto / Cargo"
                  value={puesto}
                  onChange={(e) => setPuesto(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Área habitual --</option>
                  {areasList.map((a) => (
                    <option key={a.id} value={a.nombre}>{a.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !nombre.trim()}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Guardar Persona</span>
            </button>
          </form>

          {/* LISTADO DE PERSONAL REGISTRADO */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-700">
              Personal Registrado ({personalList.length})
            </span>
            {personalList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200/80">
                Aún no has agregado personas a la lista.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm max-h-56 overflow-y-auto">
                {personalList.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900">{p.nombre}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        {p.puesto && (
                          <span className="flex items-center gap-0.5">
                            <Briefcase className="w-3 h-3 text-slate-400" />
                            {p.puesto}
                          </span>
                        )}
                        {p.area && (
                          <span className="flex items-center gap-0.5 font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                            <Building2 className="w-3 h-3" />
                            {p.area}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeletePersonal(p.id)}
                      className="w-7 h-7 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                      title="Eliminar de la lista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
