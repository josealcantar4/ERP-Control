import React, { useRef, useState, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

export function MarqueeSearchInput({
  label = '',
  value = '',
  onChange,
  onClear,
  onFocus,
  onBlur,
  placeholder = '',
  icon: Icon = Search,
  className = '',
  containerClassName = '',
  disabled = false,
  autoFocus = false,
  loading = false,
  ...props
}) {
  const containerRef = useRef(null);
  const textMeasureRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);

  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const isFloating = Boolean(label && (isFocused || hasValue));
  const textToDisplay = (!isFloating && label) ? label : placeholder;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      if (containerRef.current && textMeasureRef.current) {
        // Espacio horizontal libre dentro del input restando icono y botón de limpiar (solo si hay valor)
        const iconPadding = Icon ? 38 : 16;
        const clearPadding = onClear && value ? 36 : 16;
        const availableWidth = containerRef.current.clientWidth - iconPadding - clearPadding;
        const textWidth = textMeasureRef.current.scrollWidth;

        if (availableWidth > 0 && textWidth > availableWidth + 4) {
          setIsOverflowing(true);
          setDistance(Math.ceil(textWidth - availableWidth + 14));
        } else {
          setIsOverflowing(false);
          setDistance(0);
        }
      }
    };

    checkOverflow();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkOverflow();
      });
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', checkOverflow);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(checkOverflow).catch(() => {});
    }

    // Verificaciones diferidas para asegurar layout tras View Transitions y animaciones
    const t1 = setTimeout(checkOverflow, 80);
    const t2 = setTimeout(checkOverflow, 320);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', checkOverflow);
      }
    };
  }, [textToDisplay, Icon, onClear, value]);

  // Duración suave proporcional a la distancia del overflow
  const duration = Math.max(3.8, Math.round(distance / 22) + 2);
  const showMarquee = !hasValue && !isFocused && textToDisplay && isOverflowing && distance > 0;
  const animKey = Math.round(distance);

  return (
    <div ref={containerRef} className={`relative flex items-center w-full group ${containerClassName}`}>
      {Icon && (
        <Icon className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors ${
          isFocused ? 'text-blue-500' : 'text-slate-400'
        }`} />
      )}

      <input
        type="text"
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={isFocused || (!isOverflowing && !label) ? placeholder : ''}
        onFocus={(e) => {
          setIsFocused(true);
          if (onFocus) onFocus(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          if (onBlur) onBlur(e);
        }}
        className={`w-full bg-slate-50 border rounded-2xl py-2.5 text-xs text-slate-900 transition-all duration-200 outline-none ${
          Icon ? 'pl-10' : 'pl-3.5'
        } ${onClear && value ? 'pr-9' : 'pr-3.5'} ${
          isFocused
            ? 'border-2 border-blue-500 bg-white shadow-sm'
            : hasValue
            ? 'border border-slate-300 bg-white'
            : 'border border-slate-200 focus:bg-white hover:border-slate-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''} ${className}`}
        {...props}
      />

      {/* Etiqueta Flotante cuando se proporciona prop 'label' */}
      {label && isFloating && (
        <label
          className={`absolute left-3.5 top-0 -translate-y-1/2 bg-white px-1.5 text-[10px] font-bold rounded-md z-10 pointer-events-none select-none transition-all duration-200 ${
            isFocused ? 'text-blue-600' : 'text-slate-600'
          }`}
        >
          {label}
        </label>
      )}

      {/* Medidor invisible para calcular longitud natural del texto */}
      <span
        ref={textMeasureRef}
        aria-hidden="true"
        className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-xs font-normal tracking-normal"
      >
        {textToDisplay}
      </span>

      {/* Texto animado tipo Marquesina (cuando no cabe en pantalla y no está enfocado) */}
      {showMarquee ? (
        <div
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none overflow-hidden select-none z-10 ${
            Icon ? 'left-10' : 'left-3.5'
          } ${onClear ? 'right-9' : 'right-3.5'}`}
        >
          <div
            className="inline-block whitespace-nowrap text-xs text-slate-400"
            style={{
              animation: `searchMarquee_${animKey} ${duration}s ease-in-out infinite alternate`
            }}
          >
            {textToDisplay}
          </div>
          <style>{`
            @keyframes searchMarquee_${animKey} {
              0%, 25% {
                transform: translateX(0px);
              }
              75%, 100% {
                transform: translateX(-${animKey}px);
              }
            }
          `}</style>
        </div>
      ) : (
        !hasValue && !isFocused && label && !isOverflowing && (
          <span
            className={`absolute top-1/2 -translate-y-1/2 pointer-events-none select-none text-xs text-slate-400 font-normal ${
              Icon ? 'left-10' : 'left-3.5'
            }`}
          >
            {label}
          </span>
        )
      )}

      {loading && (
        <Loader2 className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 text-blue-600 animate-spin pointer-events-none z-10 ${
          value && onClear ? 'right-9' : 'right-3'
        }`} />
      )}

      {value && onClear && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer z-10"
          title="Limpiar campo"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
