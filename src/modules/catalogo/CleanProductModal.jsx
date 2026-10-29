import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Tag, FileText, Check, AlertCircle, Sparkles } from 'lucide-react';
import { useModalAnimation } from '../../hooks';

export function CleanProductModal({
  isOpen,
  item = null, // null para nuevo, objeto para editar
  onClose,
  onSave
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setCodigo(item.codigo || '');
        setDescripcion(item.descripcion || '');
      } else {
        setCodigo('');
        setDescripcion('');
      }
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, item]);

  if (!shouldRender) return null;

  const isEditing = Boolean(item);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanCod = codigo.trim();
    const cleanDesc = descripcion.trim().toUpperCase();

    if (!cleanCod) {
      setErrorMsg('Ingresa el código o clave del producto.');
      return;
    }
    if (!cleanDesc) {
      setErrorMsg('Ingresa la descripción del producto.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(cleanCod, cleanDesc);
      onClose();
    } catch (err) {
      console.error('Error al guardar producto:', err);
      setErrorMsg(err.message || 'Error al guardar en el catálogo limpio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, !isSubmitting)}
      className={`fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-hidden my-auto overscroll-contain ${cardClass}`}
      >
        
        {/* ENCABEZADO */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isEditing ? 'Editar Producto Limpio' : 'Nuevo Producto Limpio'}
              </h3>
              <p className="text-xs text-slate-500">
                Almacenado directamente en el Catálogo Limpio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* CÓDIGO */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Código / Clave del Producto
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                disabled={isEditing || isSubmitting}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. 7501008493012 o 001"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-60 disabled:bg-slate-100"
              />
            </div>
            {isEditing && (
              <p className="text-[10px] text-slate-400">
                El código identifica unívocamente al producto y no puede ser alterado.
              </p>
            )}
          </div>

          {/* DESCRIPCIÓN */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Descripción Oficial del Producto
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <textarea
                rows={3}
                disabled={isSubmitting}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej. PARACETAMOL 500MG TABLETAS C/20"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-60 resize-none"
              />
            </div>
          </div>

          {/* BOTONES */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'Guardar Cambios' : 'Registrar en Nube'}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
