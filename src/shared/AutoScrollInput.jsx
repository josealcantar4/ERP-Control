import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * AutoScrollInput: Input con avance de texto automático tipo carrusel
 * para descripciones largas de medicamentos que se cortan en pantallas estrechas.
 * 
 * - Si el texto desborda el ancho visible, avanza suavemente hacia el final
 *   para permitir leer la dosis, gramaje o presentación completa.
 * - Pausa en los extremos para lectura cómoda.
 * - Se detiene al hacer clic o enfocar para no interrumpir la edición.
 * - Ofrece botones interactivos de carrusel (◀ / ▶) para navegar manualmente.
 */
export const AutoScrollInput = forwardRef(function AutoScrollInput(
  {
    value = '',
    onChange,
    placeholder = '',
    className = '',
    containerClassName = '',
    type = 'text',
    disabled = false,
    readOnly = false,
    autoAdvance = true,
    showCarouselButtons = true,
    icon: Icon = null,
    onClear = null,
    onFocus,
    onBlur,
    ...restProps
  },
  ref
) {
  const localInputRef = useRef(null);
  const inputRef = localInputRef;

  useImperativeHandle(ref, () => inputRef.current);

  const [hasOverflow, setHasOverflow] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0); // 0 (inicio) a 1 (final)

  const isFocusedRef = useRef(false);
  isFocusedRef.current = isFocused;

  // Medir desbordamiento y ejecutar animación de avance
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    let animFrameId = null;
    let timeoutId = null;
    let isCancelled = false;

    const measureOverflow = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      const overflows = maxScroll > 8 && String(value || '').trim().length > 0;
      setHasOverflow(overflows);
      return { overflows, maxScroll };
    };

    const { overflows, maxScroll } = measureOverflow();

    if (!overflows || !autoAdvance || isFocused || disabled) {
      return;
    }

    // Configuración de animación fluida
    let currentScroll = el.scrollLeft;
    let direction = 1; // 1 = adelante, -1 = reversa
    const speed = 0.55; // Píxeles por cuadro (~35px/segundo a 60fps)

    const step = () => {
      if (isCancelled || isFocusedRef.current || !el) return;

      currentScroll += direction * speed;

      if (direction === 1 && currentScroll >= maxScroll) {
        currentScroll = maxScroll;
        el.scrollLeft = maxScroll;
        setScrollProgress(1);
        direction = -1;
        // Pausa de 2.2 segundos al final para leer la dosis/presentación
        timeoutId = setTimeout(() => {
          if (!isCancelled && !isFocusedRef.current) {
            animFrameId = requestAnimationFrame(step);
          }
        }, 2200);
        return;
      } else if (direction === -1 && currentScroll <= 0) {
        currentScroll = 0;
        el.scrollLeft = 0;
        setScrollProgress(0);
        direction = 1;
        // Pausa de 1.8 segundos al inicio
        timeoutId = setTimeout(() => {
          if (!isCancelled && !isFocusedRef.current) {
            animFrameId = requestAnimationFrame(step);
          }
        }, 1800);
        return;
      }

      el.scrollLeft = currentScroll;
      if (maxScroll > 0) {
        setScrollProgress(Math.min(1, Math.max(0, currentScroll / maxScroll)));
      }
      animFrameId = requestAnimationFrame(step);
    };

    // Esperar 1.4s antes de iniciar el avance
    timeoutId = setTimeout(() => {
      if (!isCancelled && !isFocusedRef.current) {
        animFrameId = requestAnimationFrame(step);
      }
    }, 1400);

    return () => {
      isCancelled = true;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [value, autoAdvance, isFocused, disabled]);

  // Manejo de botones de carrusel manual
  const handleScrollLeft = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = inputRef.current;
    if (el) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
      setScrollProgress(0);
    }
  };

  const handleScrollRight = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = inputRef.current;
    if (el) {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      setScrollProgress(1);
    }
  };

  const handleInputFocus = (e) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleInputBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  return (
    <div className={`relative flex items-center w-full group ${containerClassName}`}>
      {/* Icono izquierdo opcional */}
      {Icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
          <Icon className="w-4 h-4" />
        </div>
      )}

      {/* Input principal */}
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        title={hasOverflow ? String(value) : undefined}
        className={`w-full transition-all ${
          Icon ? 'pl-9' : 'pl-3'
        } ${
          hasOverflow && showCarouselButtons
            ? 'pr-20'
            : onClear && value
            ? 'pr-9'
            : 'pr-3'
        } ${className}`}
        {...restProps}
      />

      {/* Controles del carrusel / Botones de navegación cuando el texto desborda */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10 pointer-events-auto">
        {hasOverflow && showCarouselButtons && (
          <div
            className="flex items-center gap-0.5 bg-slate-100/90 hover:bg-slate-200/90 border border-slate-200 rounded-lg p-0.5 shadow-xs transition-opacity"
            title="Navegar texto largo (carrusel)"
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={handleScrollLeft}
              className={`p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-white active:scale-90 transition-all cursor-pointer ${
                scrollProgress <= 0.05 ? 'opacity-40' : 'opacity-100'
              }`}
              title="Ir al inicio del texto"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={handleScrollRight}
              className={`p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-white active:scale-90 transition-all cursor-pointer ${
                scrollProgress >= 0.95 ? 'opacity-40' : 'opacity-100'
              }`}
              title="Avanzar al final (ver dosis / presentación)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Botón de Limpiar */}
        {onClear && value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onClear}
            className="w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            title="Limpiar campo"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
});
