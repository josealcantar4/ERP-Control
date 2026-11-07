import React, { useState, useRef, useEffect, forwardRef } from 'react';

export const FloatingInput = forwardRef(function FloatingInput(
  {
    label,
    id,
    name,
    type = 'text',
    value = '',
    onChange,
    onFocus,
    onBlur,
    placeholder = '',
    required = false,
    disabled = false,
    className = '',
    containerClassName = '',
    icon: Icon = null,
    endAdornment = null,
    error = '',
    multiline = false,
    rows = 2,
    ...props
  },
  ref
) {
  const containerRef = useRef(null);
  const textMeasureRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);

  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const isFloating = isFocused || hasValue;

  const inputId = id || (name ? `floating-${name}` : undefined);
  const textToDisplay = (!isFloating && label) ? label : placeholder;

  useEffect(() => {
    if (multiline) return;
    const checkOverflow = () => {
      if (containerRef.current && textMeasureRef.current) {
        const availableWidth = containerRef.current.clientWidth - (Icon ? 44 : 20) - (endAdornment ? 36 : 20);
        const textWidth = textMeasureRef.current.scrollWidth;
        if (textWidth > availableWidth + 6) {
          setIsOverflowing(true);
          setDistance(textWidth - availableWidth + 12);
        } else {
          setIsOverflowing(false);
          setDistance(0);
        }
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [textToDisplay, Icon, endAdornment, multiline]);

  const duration = Math.max(3.5, Math.round(distance / 24) + 2);
  const showMarquee = !hasValue && !isFocused && !multiline && label && isOverflowing;

  return (
    <div ref={containerRef} className={`relative w-full ${containerClassName}`}>
      <div className="relative w-full">
        {Icon && (
          <div
            className={`absolute left-3.5 pointer-events-none text-slate-400 z-10 transition-colors ${
              isFocused ? 'text-blue-500' : ''
            } ${multiline ? 'top-3.5' : 'top-1/2 -translate-y-1/2'}`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}

        {multiline ? (
          <textarea
            ref={ref}
            id={inputId}
            name={name}
            rows={rows}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            placeholder={isFocused ? placeholder : ''}
            onFocus={(e) => {
              setIsFocused(true);
              if (onFocus) onFocus(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              if (onBlur) onBlur(e);
            }}
            className={`w-full bg-white rounded-2xl p-3.5 text-xs text-slate-900 transition-all duration-200 outline-none resize-none ${
              Icon ? 'pl-10' : 'pl-3.5'
            } ${endAdornment ? 'pr-11' : 'pr-3.5'} ${
              isFocused
                ? 'border-2 border-blue-500 shadow-sm'
                : hasValue
                ? 'border border-slate-300'
                : 'border border-slate-200 hover:border-slate-300'
            } ${disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''} ${
              error ? 'border-red-500 focus:border-red-500' : ''
            } ${className}`}
            {...props}
          />
        ) : (
          <input
            ref={ref}
            id={inputId}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            placeholder={isFocused ? placeholder : ''}
            onFocus={(e) => {
              setIsFocused(true);
              if (onFocus) onFocus(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              if (onBlur) onBlur(e);
            }}
            className={`w-full bg-white rounded-2xl px-3.5 py-3 text-xs text-slate-900 transition-all duration-200 outline-none ${
              Icon ? 'pl-10' : 'pl-3.5'
            } ${endAdornment ? 'pr-11' : 'pr-3.5'} ${
              isFocused
                ? 'border-2 border-blue-500 shadow-sm'
                : hasValue
                ? 'border border-slate-300'
                : 'border border-slate-200 hover:border-slate-300'
            } ${disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''} ${
              error ? 'border-red-500 focus:border-red-500' : ''
            } ${className}`}
            {...props}
          />
        )}

        {/* Medidor invisible para calcular longitud natural del label/placeholder */}
        {!multiline && (
          <span
            ref={textMeasureRef}
            aria-hidden="true"
            className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-xs font-sans px-1"
          >
            {textToDisplay}
          </span>
        )}

        {/* Floating Label (flota arriba con borde semi-grueso al enfocar, regresa abajo si está vacío) */}
        {label && (
          <label
            htmlFor={inputId}
            className={`absolute transition-all duration-200 pointer-events-none select-none ${
              Icon && !isFloating ? 'left-10' : 'left-3.5'
            } ${
              isFloating
                ? 'top-0 -translate-y-1/2 bg-white px-1.5 text-[10px] font-bold rounded-md z-10 ' +
                  (isFocused ? 'text-blue-600' : 'text-slate-600')
                : multiline
                ? 'top-3.5 text-xs text-slate-400 font-normal'
                : 'top-1/2 -translate-y-1/2 text-xs text-slate-400 font-normal'
            } ${showMarquee ? 'overflow-hidden max-w-[calc(100%-3rem)]' : ''}`}
          >
            {showMarquee ? (
              <span
                className="inline-block whitespace-nowrap"
                style={{
                  '--marquee-dist': `-${distance}px`,
                  animation: `floatingLabelBounce ${duration}s ease-in-out infinite alternate`
                }}
              >
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
              </span>
            ) : (
              <>
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
              </>
            )}
          </label>
        )}

        {showMarquee && (
          <style jsx="true">{`
            @keyframes floatingLabelBounce {
              0%, 18% {
                transform: translateX(0);
              }
              82%, 100% {
                transform: translateX(var(--marquee-dist, -40px));
              }
            }
          `}</style>
        )}

        {endAdornment && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center z-10">
            {endAdornment}
          </div>
        )}
      </div>

      {error && (
        <span className="block text-[11px] text-red-500 mt-1 font-medium">{error}</span>
      )}
    </div>
  );
});
