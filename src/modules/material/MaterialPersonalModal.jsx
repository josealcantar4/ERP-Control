import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Plus, Trash2, AlertCircle, Building2, Briefcase, Edit2, Check, RotateCcw } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks';

export function MaterialPersonalModal({
  isOpen,
  personalList = [],
  areasList = [],
  onClose,
  onAddPersonal,
  onUpdatePersonal,
  onDeletePersonal,
  canDelete = false
}) {
  useBodyScrollLock(isOpen);

  const [editingPerson, setEditingPerson] = useState(null);
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [area, setArea] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancelEdit = () => {
    setEditingPerson(null);
    setNombre('');
    setPuesto('');
    setArea('');
    setErrorMsg('');
  };

  const handleStartEdit = (p) => {
    setEditingPerson(p);
    setNombre(p.nombre || '');
    setPuesto(p.puesto || '');
    setArea(p.area || '');
    setErrorMsg('');
  };

  useEffect(() => {
    if (!isOpen) {
      handleCancelEdit();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanNombre = nombre.trim();
    if (!cleanNombre) {
      setErrorMsg('Ingresa el nombre completo de la persona.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingPerson) {
        if (onUpdatePersonal) {
          await onUpdatePersonal(editingPerson.id, cleanNombre, puesto.trim(), area);
        }
        handleCancelEdit();
      } else {
        await onAddPersonal(cleanNombre, puesto.trim(), area);
        handleCancelEdit();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar personal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in select-none overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 overscroll-contain">
        
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

          {/* FORMULARIO PARA REGISTRAR / EDITAR PERSONA */}
          <form onSubmit={handleSubmit} className={`p-4 rounded-2xl border transition-all space-y-3 ${
            editingPerson ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                {editingPerson ? `Modificar Personal: ${editingPerson.nombre}` : 'Agregar Nueva Persona'}
              </label>
              {editingPerson && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Cancelar</span>
                </button>
              )}
            </div>
            
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
              className={`w-full py-2.5 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                editingPerson
                  ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300'
                  : 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300'
              }`}
            >
              {editingPerson ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{editingPerson ? 'Guardar Cambios' : 'Guardar Persona'}</span>
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
                {personalList.map((p) => {
                  const isItemEditing = editingPerson?.id === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                        isItemEditing ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'
                      }`}
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

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(p)}
                          className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                            isItemEditing
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                          }`}
                          title="Editar información"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeletePersonal(p.id)}
                            className="w-7 h-7 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                            title="Eliminar de la lista"
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
