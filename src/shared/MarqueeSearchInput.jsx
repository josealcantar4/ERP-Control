/**
 * Barra de búsqueda con soporte de texto marquesina para visualización de textos largos sin recorte.
 */

import React, { useRef, useState, useEffect, useId } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

export function MarqueeSearchInput({
  id,
  name,
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
  inputRef,
  ...props
}) {
  const generatedId = useId();
  const containerRef = useRef(null);
  const labelMeasureRef = useRef(null);
  const placeholderMeasureRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [labelOverflow, setLabelOverflow] = useState({ overflowing: false, distance: 0 });
  const [placeholderOverflow, setPlaceholderOverflow] = useState({ overflowing: false, distance: 0 });

  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const hasLabel = Boolean(label);
  const isFloating = hasLabel && (isFocused || hasValue);
  const inputId = id || (name ? `marquee-search-${name}` : generatedId);
  const hasClearButton = Boolean(hasValue && onClear && !disabled);
  const hasRightAction = Boolean(loading || hasClearButton);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      if (!containerRef.current) return;
      const iconPadding = Icon ? 40 : 14;
      const rightPad = loading && hasClearButton ? 56 : hasRightAction ? 40 : 14;
      const availableWidth = containerRef.current.clientWidth - iconPadding - rightPad - 4;
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
  }, [label, placeholder, Icon, hasClearButton, hasRightAction, loading]);

  const labelDuration = Math.max(3.5, Number((labelOverflow.distance / 24 + 2).toFixed(2)));
  const placeholderDuration = Math.max(3.5, Number((placeholderOverflow.distance / 24 + 2).toFixed(2)));
  const showLabelMarquee = hasLabel && !hasValue && !isFocused && labelOverflow.overflowing && labelOverflow.distance > 0;
  const showPlaceholderMarquee = hasLabel
    ? (isFocused && !hasValue && Boolean(placeholder) && placeholderOverflow.overflowing && placeholderOverflow.distance > 0)
    : (!hasValue && !isFocused && Boolean(placeholder) && placeholderOverflow.overflowing && placeholderOverflow.distance > 0);
  const nativePlaceholder = hasLabel
    ? (isFocused && !showPlaceholderMarquee ? placeholder : '')
    : (isFocused || !placeholderOverflow.overflowing ? placeholder : '');

  return (
    <div ref={containerRef} className={`relative flex items-center w-full group ${containerClassName}`}>
      {Icon && (
        <Icon className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10 transition-colors ${
          isFocused ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'
        }`} />
      )}

      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={nativePlaceholder}
        onFocus={(e) => {
          setIsFocused(true);
          if (onFocus) onFocus(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          if (onBlur) onBlur(e);
        }}
        className={`w-full rounded-2xl text-xs text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200 outline-none ${
          hasLabel ? 'py-3' : 'py-2.5'
        } ${
          Icon ? 'pl-10' : 'pl-3.5'
        } ${
          loading && hasClearButton ? 'pr-14' : hasRightAction ? 'pr-10' : 'pr-3.5'
        } ${
          disabled
            ? 'bg-slate-100 opacity-60 cursor-not-allowed'
            : (hasLabel || isFocused || hasValue ? 'bg-white' : 'bg-slate-50')
        } ${
          isFocused
            ? 'border-2 border-blue-500 shadow-sm'
            : hasValue
            ? 'border border-slate-300 dark:border-slate-600'
            : 'border border-slate-200 hover:border-slate-300 dark:hover:border-slate-500'
        } ${className}`}
        {...props}
      />

      <span
        ref={labelMeasureRef}
        aria-hidden="true"
        className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-xs font-normal tracking-normal"
      >
        {label}
      </span>
      <span
        ref={placeholderMeasureRef}
        aria-hidden="true"
        className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-xs font-normal tracking-normal"
      >
        {placeholder}
      </span>

      {showPlaceholderMarquee && (
        <div
          aria-hidden="true"
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none overflow-hidden select-none z-10 ${
            Icon ? 'left-10' : 'left-3.5'
          } ${loading && hasClearButton ? 'right-14' : hasRightAction ? 'right-10' : 'right-3.5'}`}
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

      {hasLabel && (
        <label
          htmlFor={inputId}
          className={`absolute transition-all duration-200 pointer-events-none select-none ${
            Icon && !isFloating ? 'left-10' : 'left-3.5'
          } ${
            isFloating
              ? 'top-0 -translate-y-1/2 bg-white px-1.5 text-[10px] font-bold rounded-md z-10 max-w-[calc(100%-2rem)] truncate ' +
                (isFocused ? 'text-blue-600' : 'text-slate-600')
              : 'top-1/2 -translate-y-1/2 text-xs text-slate-400 font-normal'
          } ${showLabelMarquee ? `overflow-hidden ${hasRightAction ? 'right-10' : 'right-3.5'}` : ''}`}
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
            </span>
          ) : (
            label
          )}
        </label>
      )}

      {loading && (
        <Loader2 className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 text-blue-600 animate-spin pointer-events-none z-10 ${
          hasClearButton ? 'right-9' : 'right-3'
        }`} />
      )}

      {hasClearButton && (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
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
