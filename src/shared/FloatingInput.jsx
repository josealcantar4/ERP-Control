/**
 * Campo de entrada de texto con etiqueta flotante animada y soporte para tema claro y oscuro.
 */

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
  const labelMeasureRef = useRef(null);
  const placeholderMeasureRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [labelOverflow, setLabelOverflow] = useState({ overflowing: false, distance: 0 });
  const [placeholderOverflow, setPlaceholderOverflow] = useState({ overflowing: false, distance: 0 });

  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const isFloating = isFocused || hasValue;

  const inputId = id || (name ? `floating-${name}` : undefined);

  useEffect(() => {
    if (multiline) return;
    const el = containerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      if (!containerRef.current) return;
      const leftPad = Icon ? 40 : 14;
      const rightPad = endAdornment ? 44 : 14;
      const availableWidth = containerRef.current.clientWidth - leftPad - rightPad - 4;
      if (availableWidth <= 0) return;

      if (labelMeasureRef.current && label) {
        const labelWidth = labelMeasureRef.current.scrollWidth;
        if (labelWidth > availableWidth + 4) {
          setLabelOverflow({ overflowing: true, distance: Math.ceil(labelWidth - availableWidth + 12) });
        } else {
          setLabelOverflow({ overflowing: false, distance: 0 });
        }
      } else {
        setLabelOverflow({ overflowing: false, distance: 0 });
      }

      if (placeholderMeasureRef.current && placeholder) {
        const placeholderWidth = placeholderMeasureRef.current.scrollWidth;
        if (placeholderWidth > availableWidth + 4) {
          setPlaceholderOverflow({ overflowing: true, distance: Math.ceil(placeholderWidth - availableWidth + 12) });
        } else {
          setPlaceholderOverflow({ overflowing: false, distance: 0 });
        }
      } else {
        setPlaceholderOverflow({ overflowing: false, distance: 0 });
      }
    };

    checkOverflow();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(checkOverflow);
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', checkOverflow);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(checkOverflow).catch(() => {});
    }

    const t1 = setTimeout(checkOverflow, 60);
    const t2 = setTimeout(checkOverflow, 250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', checkOverflow);
      }
    };
  }, [label, placeholder, Icon, endAdornment, multiline]);

  const labelDuration = Math.max(3.5, Number((labelOverflow.distance / 24 + 2).toFixed(2)));
  const placeholderDuration = Math.max(3.5, Number((placeholderOverflow.distance / 24 + 2).toFixed(2)));
  const showLabelMarquee = !hasValue && !isFocused && !multiline && Boolean(label) && labelOverflow.overflowing && labelOverflow.distance > 0;
  const showPlaceholderMarquee = isFocused && !hasValue && !multiline && Boolean(placeholder) && placeholderOverflow.overflowing && placeholderOverflow.distance > 0;

  return (
    <div ref={containerRef} className={`relative w-full ${containerClassName}`}>
      <div className="relative w-full">
        {Icon && (
          <div
            className={`absolute left-3.5 pointer-events-none z-10 transition-colors ${
              isFocused ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'
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
            className={`w-full bg-white rounded-2xl p-3.5 text-xs text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200 outline-none resize-none ${
              Icon ? 'pl-10' : 'pl-3.5'
            } ${endAdornment ? 'pr-11' : 'pr-3.5'} ${
              isFocused
                ? 'border-2 border-blue-500 shadow-sm'
                : hasValue
                ? 'border border-slate-300 dark:border-slate-600'
                : 'border border-slate-200 hover:border-slate-300 dark:hover:border-slate-500'
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
            placeholder={isFocused && !showPlaceholderMarquee ? placeholder : ''}
            onFocus={(e) => {
              setIsFocused(true);
              if (onFocus) onFocus(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              if (onBlur) onBlur(e);
            }}
            className={`w-full bg-white rounded-2xl px-3.5 py-3 text-xs text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200 outline-none ${
              Icon ? 'pl-10' : 'pl-3.5'
            } ${endAdornment ? 'pr-11' : 'pr-3.5'} ${
              isFocused
                ? 'border-2 border-blue-500 shadow-sm'
                : hasValue
                ? 'border border-slate-300 dark:border-slate-600'
                : 'border border-slate-200 hover:border-slate-300 dark:hover:border-slate-500'
            } ${disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''} ${
              error ? 'border-red-500 focus:border-red-500' : ''
            } ${className}`}
            {...props}
          />
        )}

        {!multiline && (
          <>
            <span
              ref={labelMeasureRef}
              aria-hidden="true"
              className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-xs font-normal"
            >
              {label}{required ? ' *' : ''}
            </span>
            <span
              ref={placeholderMeasureRef}
              aria-hidden="true"
              className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-xs font-normal"
            >
              {placeholder}
            </span>
          </>
        )}

        {showPlaceholderMarquee && (
          <div
            aria-hidden="true"
            className={`absolute top-1/2 -translate-y-1/2 pointer-events-none overflow-hidden select-none z-10 ${
              Icon ? 'left-10' : 'left-3.5'
            } ${endAdornment ? 'right-11' : 'right-3.5'}`}
          >
            <span
              className="block w-max whitespace-nowrap text-xs text-slate-400 dark:text-slate-500"
              style={{
                '--marquee-dist': `-${placeholderOverflow.distance}px`,
                animation: `marqueeBounce ${placeholderDuration}s ease-in-out infinite alternate`
              }}
            >
              {placeholder}
            </span>
          </div>
        )}

        {label && (
          <label
            htmlFor={inputId}
            className={`absolute transition-all duration-200 pointer-events-none select-none ${
              Icon && !isFloating ? 'left-10' : 'left-3.5'
            } ${
              isFloating
                ? 'top-0 -translate-y-1/2 bg-white px-1.5 text-[10px] font-bold rounded-md z-10 max-w-[calc(100%-2rem)] truncate ' +
                  (isFocused ? 'text-blue-600' : 'text-slate-600')
                : multiline
                ? 'top-3.5 text-xs text-slate-400 font-normal'
                : 'top-1/2 -translate-y-1/2 text-xs text-slate-400 font-normal'
            } ${showLabelMarquee ? `overflow-hidden ${endAdornment ? 'right-11' : 'right-3.5'}` : ''}`}
          >
            {showLabelMarquee ? (
              <span
                className="block w-max whitespace-nowrap"
                style={{
                  '--marquee-dist': `-${labelOverflow.distance}px`,
                  animation: `marqueeBounce ${labelDuration}s ease-in-out infinite alternate`
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
