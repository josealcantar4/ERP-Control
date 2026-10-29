import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Package, Plus, Minus } from 'lucide-react';
import { useModalAnimation } from '../hooks';
import { MarqueeText } from './MarqueeText';

export function CaptureQuantityModal({ isOpen, onClose, scannedItem, onConfirmQuantity }) {
  const { shouldRender, cardRef, handleClose, handleBackdropClick, backdropClass, cardClass, cardStyle } = useModalAnimation({
    isOpen: Boolean(isOpen && scannedItem),
    onClose
  });

  const lastItemRef = useRef(scannedItem);
  if (scannedItem) lastItemRef.current = scannedItem;
  const currentItem = scannedItem || lastItemRef.current;

  const [cantidad, setCantidad] = useState('1');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCantidad('1');
      setErrorMsg('');
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender || !currentItem) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const qty = parseInt(cantidad, 10);
    if (!qty || qty <= 0) {
      setErrorMsg('Ingresa una cantidad mayor a 0');
      return;
    }
    onConfirmQuantity(qty);
  };

  const modalContent = (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto overscroll-contain select-none ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100/80 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] my-auto overscroll-contain ${cardClass}`}
      >
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Producto Identificado</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanned Drug Info Card */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-1">
            <span className="text-[10px] font-mono text-slate-400 block tracking-wider uppercase">
              CÓDIGO: {currentItem.codigo}
            </span>
            <div className="text-base font-bold text-slate-900 leading-snug">
              <MarqueeText text={currentItem.descripcion} />
            </div>
          </div>

          {/* Numeric Input */}
          <div className="space-y-2 text-center">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Cantidad a Solicitar
            </label>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  const cur = parseInt(cantidad, 10) || 1;
                  if (cur > 1) setCantidad(String(cur - 1));
                }}
                className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center transition-all cursor-pointer select-none"
                title="Menos una pieza"
              >
                <Minus className="w-5 h-5" />
              </button>

              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={cantidad}
                onChange={(e) => {
                  setErrorMsg('');
                  const val = e.target.value.replace(/\D/g, '');
                  setCantidad(val);
                }}
                className="w-32 text-center text-4xl font-extrabold text-blue-600 bg-slate-100 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl py-3 focus:outline-none transition-all font-mono"
              />

              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  const cur = parseInt(cantidad, 10) || 0;
                  setCantidad(String(cur + 1));
                }}
                className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center transition-all cursor-pointer select-none"
                title="Más una pieza"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {errorMsg ? (
              <p className="text-xs text-red-500 font-semibold">{errorMsg}</p>
            ) : (
              <p className="text-[11px] text-slate-400">
                Escribe las piezas requeridas
              </p>
            )}
          </div>

          {/* Action Button: "Listo" */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold text-sm rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-5 h-5" />
              <span>Listo</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}