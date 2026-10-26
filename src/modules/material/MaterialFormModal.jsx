import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, User, Package, Check, AlertCircle, PlusCircle, Building2, Tag } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks';

export function MaterialFormModal({
  isOpen,
  editingItem = null,
  tipos = [],
  personalList = [],
  areasList = [],
  onClose,
  onSave,
  onOpenManageTipos,
  onOpenManagePersonal
}) {
  useBodyScrollLock(isOpen);

  const [formData, setFormData] = useState({
    tipoControl: '',
    personal: '',
    area: '',
    descripcion: '',
    cantidad: 1,
    fechaEntrega: new Date().toISOString().split('T')[0],
    requiereReemplazo: false,
    fechaReemplazo: '',
    estado: 'activo',
    notas: ''
  });

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        setFormData({
          tipoControl: editingItem.tipoControl || '',
          personal: editingItem.personal || '',
          area: editingItem.area || '',
          descripcion: editingItem.descripcion || '',
          cantidad: editingItem.cantidad || 1,
          fechaEntrega: editingItem.fechaEntrega || new Date().toISOString().split('T')[0],
          requiereReemplazo: Boolean(editingItem.requiereReemplazo),
          fechaReemplazo: editingItem.fechaReemplazo || '',
          estado: editingItem.estado || 'activo',
          notas: editingItem.notas || ''
        });
      } else {
        setFormData({
          tipoControl: tipos.length > 0 ? tipos[0].nombre : '',
          personal: personalList.length > 0 ? personalList[0].nombre : '',
          area: areasList.length > 0 ? areasList[0].nombre : '',
          descripcion: '',
          cantidad: 1,
          fechaEntrega: new Date().toISOString().split('T')[0],
          requiereReemplazo: false,
          fechaReemplazo: '',
          estado: 'activo',
          notas: ''
        });
      }
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, editingItem, tipos, personalList, areasList]);

  // Si cambia la persona seleccionada, auto-asignar su área si la tiene guardada
  const handlePersonalChange = (selectedPersonName) => {
    const found = personalList.find(p => p.nombre === selectedPersonName);
    setFormData(prev => ({
      ...prev,
      personal: selectedPersonName,
      area: (found && found.area) ? found.area : prev.area
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.tipoControl) {
      setErrorMsg('Selecciona un tipo de control (ej. Papelería, Informática).');
      return;
    }
    if (!formData.personal?.trim()) {
      setErrorMsg('Indica a qué persona se le entrega el material.');
      return;
    }
    if (!formData.area?.trim()) {
      setErrorMsg('Selecciona el área correspondiente de la persona.');
      return;
    }
    if (!formData.descripcion?.trim()) {
      setErrorMsg('Escribe la descripción de la herramienta o material.');
      return;
    }
    if (!formData.cantidad || Number(formData.cantidad) <= 0) {
      setErrorMsg('La cantidad entregada debe ser mayor a 0.');
      return;
    }
    if (!formData.fechaEntrega) {
      setErrorMsg('Indica la fecha de entrega.');
      return;
    }
    if (formData.requiereReemplazo && !formData.fechaReemplazo) {
      setErrorMsg('Has marcado que requiere reemplazo. Indica la fecha programada de cambio/revisión.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(formData);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Error al guardar la entrega de material.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in select-none overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 overscroll-contain">
        
        {/* ENCABEZADO */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {editingItem ? 'Editar Entrega de Material' : 'Registrar Material Brindado'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Control de herramientas, papelería y equipo asignado al personal
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

        {/* CONTENIDO SCROLLEABLE */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-sans">
          
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200/80 rounded-2xl text-red-700 flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span className="font-semibold text-xs leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* 1. TIPO DE CONTROL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
                Tipo de Control *
              </label>
              {onOpenManageTipos && (
                <button
                  type="button"
                  onClick={onOpenManageTipos}
                  className="text-blue-600 hover:text-blue-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>Gestionar Tipos</span>
                </button>
              )}
            </div>
            <select
              value={formData.tipoControl}
              onChange={(e) => setFormData({ ...formData, tipoControl: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
            >
              <option value="">-- Seleccionar Tipo de Control --</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.nombre}>{t.nombre}</option>
              ))}
            </select>
          </div>

          {/* 2. PERSONAL RECEPTOR Y ÁREA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  A quién se le brinda *
                </label>
                {onOpenManagePersonal && (
                  <button
                    type="button"
                    onClick={onOpenManagePersonal}
                    className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>+ Persona</span>
                  </button>
                )}
              </div>
              {personalList.length > 0 ? (
                <select
                  value={formData.personal}
                  onChange={(e) => handlePersonalChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
                >
                  <option value="">-- Seleccionar Persona --</option>
                  {personalList.map((p) => (
                    <option key={p.id} value={p.nombre}>
                      {p.nombre} {p.puesto ? `(${p.puesto})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Nombre de la persona"
                  value={formData.personal}
                  onChange={(e) => setFormData({ ...formData, personal: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500"
                />
              )}
            </div>

            <div>
              <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                Área del Personal *
              </label>
              <select
                value={formData.area}
                onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
              >
                <option value="">-- Seleccionar Área --</option>
                {areasList.map((a) => (
                  <option key={a.id} value={a.nombre}>{a.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. DESCRIPCIÓN DEL MATERIAL Y CANTIDAD */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                Herramienta / Material Entregado *
              </label>
              <input
                type="text"
                placeholder="Ej. Engrapadora industrial, Laptop Dell, Cúter..."
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                Cantidad *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.cantidad}
                onChange={(e) => setFormData({ ...formData, cantidad: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-mono font-bold"
              />
            </div>
          </div>

          {/* 4. FECHA DE ENTREGA */}
          <div>
            <label className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Fecha de Entrega *
            </label>
            <input
              type="date"
              value={formData.fechaEntrega}
              onChange={(e) => setFormData({ ...formData, fechaEntrega: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500 font-mono"
            />
          </div>

          {/* 5. FECHA DE REEMPLAZO OPCIONAL CON CHECKBOX */}
          <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-3.5 space-y-3 transition-all">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.requiereReemplazo}
                onChange={(e) => setFormData({ ...formData, requiereReemplazo: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
              />
              <div>
                <span className="font-bold text-amber-950 block text-xs">
                  Programar fecha de reemplazo o revisión periódica
                </span>
                <span className="text-[11px] text-amber-700 block leading-tight mt-0.5">
                  El sistema generará alertas y notificaciones automáticas cuando se acerque o venza la fecha.
                </span>
              </div>
            </label>

            {formData.requiereReemplazo && (
              <div className="pt-2 border-t border-amber-200/60 animate-fade-in space-y-1">
                <label className="block font-semibold text-amber-900 uppercase tracking-wider text-[10px]">
                  Fecha Programada de Reemplazo / Devolución *
                </label>
                <input
                  type="date"
                  required={formData.requiereReemplazo}
                  value={formData.fechaReemplazo}
                  onChange={(e) => setFormData({ ...formData, fechaReemplazo: e.target.value })}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                />
              </div>
            )}
          </div>

          {/* 6. ESTADO (EN MODO EDICIÓN) */}
          {editingItem && (
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                Estado del Material
              </label>
              <select
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500"
              >
                <option value="activo">Activo / En uso por el personal</option>
                <option value="reemplazado">Reemplazado / Renovation completada</option>
                <option value="devuelto">Devuelto al almacén / Dado de baja</option>
              </select>
            </div>
          )}

          {/* 7. NOTAS Y OBSERVACIONES */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
              Notas u Observaciones (Opcional)
            </label>
            <textarea
              rows="2"
              placeholder="Número de serie, condición de entrega, accesorios incluidos..."
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-2xl cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{editingItem ? 'Guardar Cambios' : 'Registrar Entrega'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
