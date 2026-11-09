/**
 * Modal de configuración y administración de tipos y categorías de materiales disponibles en la organización.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Tag, Plus, Trash2, AlertCircle, Edit2, Check, RotateCcw } from 'lucide-react';
import { useModalAnimation } from '../../hooks';
import { ModalDialog } from '../../shared/ModalDialog';
import { FloatingInput, playSuccessSound } from '../../shared';

const COLOR_OPTIONS = [
  { id: 'blue', label: 'Azul', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { id: 'indigo', label: 'Índigo', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  { id: 'purple', label: 'Púrpura', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { id: 'amber', label: 'Ámbar', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { id: 'emerald', label: 'Verde', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { id: 'rose', label: 'Rosa', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
];

export function MaterialTypesModal({
  isOpen,
  tipos = [],
  onClose,
  onAddTipo,
  onUpdateTipo,
  onDeleteTipo,
  canDelete = false
}) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen,
    onClose
  });

  const [editingTipo, setEditingTipo] = useState(null);
  const [nombre, setNombre] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    variant: 'danger',
    confirmText: 'Sí, eliminar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {}
  });
  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  const handleCancelEdit = () => {
    setEditingTipo(null);
    setNombre('');
    setSelectedColor('blue');
    setErrorMsg('');
  };

  const handleStartEdit = (tipo) => {
    setEditingTipo(tipo);
    setNombre(tipo.nombre || '');
    setSelectedColor(tipo.color || 'blue');
    setErrorMsg('');
  };

  useEffect(() => {
    if (!isOpen) {
      handleCancelEdit();
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const handleDeleteTipo = (tipo) => {
    if (!tipo) return;
    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar tipo de control?',
      message: `¿Estás seguro de que deseas eliminar el tipo de material "${tipo.nombre}"?\nEsta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: () => {
        closeDialog();
        onDeleteTipo(tipo.id);
      },
      onCancel: closeDialog
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const clean = nombre.trim();
    if (!clean) {
      setErrorMsg('Ingresa el nombre del tipo de control.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingTipo) {
        if (onUpdateTipo) {
          await onUpdateTipo(editingTipo.id, clean, selectedColor);
        }
        handleCancelEdit();
      } else {
        await onAddTipo(clean, selectedColor);
        setNombre('');
      }
      playSuccessSound();
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar tipo de control.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, !isSubmitting)}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-hidden overscroll-contain ${cardClass}`}
      >
        
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-blue-50 dark:bg-transparent text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm dark:border dark:border-blue-500/30">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Tipos de Control
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Categorías de material (Papelería, Informática, Herramientas...)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200/80 rounded-2xl text-red-700 flex items-start gap-2.5 animate-fade-in text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className={`p-4 rounded-2xl border transition-all space-y-3 ${
            editingTipo ? 'bg-blue-50/50 dark:bg-slate-800/80 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/80'
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px]">
                {editingTipo ? `Modificar Tipo: "${editingTipo.nombre}"` : 'Crear Nuevo Tipo de Control'}
              </label>
              {editingTipo && (
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

            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <FloatingInput
                  label={editingTipo ? 'Modificar Tipo' : 'Nombre del Tipo'}
                  placeholder="Ej. Papelería, Cómputo, Seguridad..."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !nombre.trim()}
                className={`px-4 py-3 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  editingTipo
                    ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300'
                    : 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300'
                }`}
              >
                {editingTipo ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editingTipo ? 'Guardar' : 'Agregar'}</span>
              </button>
            </div>

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

          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Tipos Registrados ({tipos.length})
            </span>
            {tipos.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                Aún no has agregado tipos de control a la lista.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm max-h-56 overflow-y-auto">
                {tipos.map((tipo) => {
                  const colorObj = COLOR_OPTIONS.find(c => c.id === tipo.color) || COLOR_OPTIONS[0];
                  const isItemEditing = editingTipo?.id === tipo.id;

                  return (
                    <div
                      key={tipo.id}
                      className={`p-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                        isItemEditing ? 'bg-blue-50/70 dark:bg-blue-900/30 border-l-4 border-l-blue-600' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colorObj.bg} ${colorObj.text} ${colorObj.border}`}>
                          {tipo.nombre}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(tipo)}
                          className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                            isItemEditing
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800'
                          }`}
                          title="Editar tipo"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTipo(tipo)}
                            className="w-7 h-7 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                            title="Eliminar tipo"
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

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(
    <>
      {modalContent}
      <ModalDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
      />
    </>,
    document.body
  ) : modalContent;
}
