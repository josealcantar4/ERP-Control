import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, HelpCircle, X, Info } from 'lucide-react';
import { useModalAnimation } from '../hooks';
import { AutoScrollInput } from './AutoScrollInput';

/**
 * Custom React Modal for Alerts, Confirmations, and Prompts.
 * Completely replaces native browser window.alert, window.confirm, and window.prompt.
 */
export function ModalDialog({
  isOpen,
  type = 'alert', // 'alert' | 'confirm' | 'prompt'
  title = '',
  message = '',
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  variant = 'primary', // 'primary' | 'danger' | 'success'
  inputValue = '',
  inputPlaceholder = '',
  onInputChange,
  onConfirm,
  onCancel,
  onClose
}) {
  const isConfirmActionRef = React.useRef(false);

  const {
    shouldRender,
    cardRef,
    handleClose,
    backdropClass,
    cardClass,
    cardStyle
  } = useModalAnimation({
    isOpen,
    onClose: () => {
      if (isConfirmActionRef.current) {
        isConfirmActionRef.current = false;
        if (onConfirm) onConfirm();
      } else {
        if (onCancel) onCancel();
        else if (onClose) onClose();
      }
    }
  });

  if (!shouldRender) return null;

  const handleConfirmClick = () => {
    isConfirmActionRef.current = true;
    handleClose();
  };

  const handleCancelClick = () => {
    isConfirmActionRef.current = false;
    handleClose();
  };

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && type !== 'alert') {
          handleCancelClick();
        }
      }}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 overflow-hidden p-5 sm:p-6 space-y-4 my-auto overscroll-contain max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] ${cardClass}`}
      >
        
        {/* Header Icon + Title */}
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              variant === 'danger'
                ? 'bg-red-50 text-red-600'
                : variant === 'success'
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-blue-50 text-blue-600'
            }`}
          >
            {variant === 'danger' ? (
              <AlertCircle className="w-5 h-5" />
            ) : variant === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : type === 'confirm' ? (
              <HelpCircle className="w-5 h-5" />
            ) : (
              <Info className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-1 flex-1">
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              {title}
            </h3>
            {message && (
              <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Optional Input for Prompt type with AutoScroll & Carousel */}
        {type === 'prompt' && (
          <div className="pt-1">
            <AutoScrollInput
              type="text"
              autoFocus
              value={inputValue}
              placeholder={inputPlaceholder}
              onChange={(e) => onInputChange && onInputChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-2">
          {type !== 'alert' && (
            <button
              type="button"
              onClick={handleCancelClick}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-2xl transition-all cursor-pointer"
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirmClick}
            className={`px-5 py-2.5 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all cursor-pointer ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-500'
                : variant === 'success'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmText}
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
