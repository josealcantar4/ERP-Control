/**
 * Componente genérico para diálogos modales de alerta, éxito y confirmación de acciones críticas.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, HelpCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useModalAnimation } from '../hooks';
import { AutoScrollInput } from './AutoScrollInput';
import { FloatingInput } from './FloatingInput';
import { playSuccessSound } from '../modules/transferencias';
import { parseErrorDisplay } from './errorUtils';

export function ModalDialog({
  isOpen,
  type = 'alert',
  title = '',
  message = '',
  error = null,
  friendlyMessage = '',
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  variant = 'primary',
  inputValue = '',
  inputPlaceholder = '',
  onInputChange,
  onConfirm,
  onCancel,
  onClose,
  children
}) {
  const actionTriggeredRef = React.useRef(false);
  const [expandedDetailKey, setExpandedDetailKey] = React.useState(null);

  const errorSource = error || message;
  const hasErrorContent = Boolean(errorSource);
  const detailKey = `${isOpen ? '1' : '0'}:${title}:${typeof errorSource === 'string' ? errorSource : errorSource?.message || ''}`;
  const showDetails = expandedDetailKey === detailKey;
  const shouldParseError = hasErrorContent && (variant === 'danger' || Boolean(error));
  const parsedError = React.useMemo(() => {
    if (!shouldParseError) {
      return {
        isTechnical: false,
        displayMessage: typeof message === 'string' ? message : '',
        technicalDetails: ''
      };
    }
    return parseErrorDisplay(errorSource, {
      ...(friendlyMessage ? { fallbackMessage: friendlyMessage } : {})
    });
  }, [shouldParseError, errorSource, message, friendlyMessage]);

  const {
    shouldRender,
    isClosing,
    cardRef,
    handleClose,
    handleBackdropClick,
    backdropClass,
    cardClass,
    cardStyle
  } = useModalAnimation({
    isOpen,
    onClose: () => {
      if (actionTriggeredRef.current) return;
      actionTriggeredRef.current = true;
      if (onCancel) onCancel();
      else if (onClose) onClose();
    }
  });

  React.useEffect(() => {
    if (isOpen) {
      actionTriggeredRef.current = false;
    }
  }, [isOpen, title, message, error, type]);

  React.useEffect(() => {
    if (isOpen && variant === 'success') {
      playSuccessSound();
    }
  }, [isOpen, variant]);

  if (!shouldRender) return null;

  const handleConfirmClick = () => {
    if (actionTriggeredRef.current || isClosing) return;
    actionTriggeredRef.current = true;
    if (onConfirm) {
      onConfirm();
    } else {
      handleClose();
    }
  };

  const handleCancelClick = () => {
    if (actionTriggeredRef.current || isClosing) return;
    handleClose();
  };

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, type !== 'alert' ? handleCancelClick : false)}
      className={`fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full ${children ? 'max-w-md' : 'max-w-sm'} shadow-2xl border border-slate-100 overflow-hidden p-5 sm:p-6 space-y-4 my-auto overscroll-contain max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] flex flex-col ${cardClass}`}
      >
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

          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              {title}
            </h3>
            {hasErrorContent && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">
                  {parsedError.displayMessage}
                </p>

                {parsedError.isTechnical && parsedError.technicalDetails && (
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetailKey((prev) => (prev === detailKey ? null : detailKey))
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <span>{showDetails ? 'Ocultar detalles' : 'Ver detalles'}</span>
                      {showDetails ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {showDetails && (
                      <div className="mt-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-600 break-words max-h-36 overflow-y-auto select-text">
                        {parsedError.technicalDetails}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {children && (
          <div className="pt-0.5 min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>
        )}
        {type === 'prompt' && (
          <div className="pt-1">
            <FloatingInput
              autoFocus
              value={inputValue}
              label={inputPlaceholder || 'Ingresa un valor'}
              placeholder={inputPlaceholder}
              onChange={(e) => onInputChange && onInputChange(e.target.value)}
            />
          </div>
        )}
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
