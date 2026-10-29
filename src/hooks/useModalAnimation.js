import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

// Rastreo global del último punto de toque/clic en la pantalla
let lastClickPoint = null;

if (typeof window !== 'undefined') {
  const recordPoint = (e) => {
    const touch = (e.touches && e.touches.length > 0) ? e.touches[0] : e;
    if (touch && touch.clientX != null && touch.clientY != null) {
      lastClickPoint = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }
  };
  window.addEventListener('pointerdown', recordPoint, { capture: true, passive: true });
  window.addEventListener('touchstart', recordPoint, { capture: true, passive: true });
  window.addEventListener('mousedown', recordPoint, { capture: true, passive: true });
}

/**
 * Hook para animar modales con apertura fluida desde el botón que se pulsó
 * y retracción en sentido inverso hacia dicho botón al cerrarse.
 * Elimina cualquier borrosidad en textos y garantiza salida sin saltos ni parpadeos.
 */
export function useModalAnimation({
  isOpen,
  onClose,
  duration = 180,
  cardRef: externalCardRef = null,
  centerOrigin = false
}) {
  const [shouldRender, setShouldRender] = useState(Boolean(isOpen));
  const [isClosing, setIsClosing] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(Boolean(isOpen));

  const internalCardRef = useRef(null);
  const cardRef = externalCardRef || internalCardRef;
  const originLockedRef = useRef('50% 50%');
  const timerRef = useRef(null);
  const prevIsOpenRef = useRef(Boolean(isOpen));

  // Sincronizar shouldRender inmediatamente durante el render al pasar isOpen a true
  // Esto garantiza que el DOM (p. ej. el contenedor de la cámara) exista desde el primer frame
  if (Boolean(isOpen) !== prevIsOpen) {
    setPrevIsOpen(Boolean(isOpen));
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    }
  }

  // Bloquear scroll de fondo de forma segura durante todo el ciclo (incluyendo salida)
  useBodyScrollLock(shouldRender);

  // Calcular y congelar el transform-origin exacto ÚNICAMENTE al momento de abrir
  useLayoutEffect(() => {
    if (isOpen && shouldRender && !isClosing) {
      if (!centerOrigin && cardRef.current && lastClickPoint && (Date.now() - lastClickPoint.time < 5000)) {
        const rect = cardRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const pctX = Math.round(((lastClickPoint.x - rect.left) / rect.width) * 100);
          const pctY = Math.round(((lastClickPoint.y - rect.top) / rect.height) * 100);
          // Acotar a un rango visualmente balanceado
          const clampedX = Math.max(0, Math.min(100, pctX));
          const clampedY = Math.max(0, Math.min(100, pctY));
          originLockedRef.current = `${clampedX}% ${clampedY}%`;
          cardRef.current.style.transformOrigin = originLockedRef.current;
          return;
        }
      }
      originLockedRef.current = '50% 50%';
      if (cardRef.current) {
        cardRef.current.style.transformOrigin = '50% 50%';
      }
    }
  }, [isOpen, shouldRender, isClosing, centerOrigin]);

  // Manejo reactivo de apertura y cierre cuando la prop isOpen cambia desde el padre
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    const nowOpen = Boolean(isOpen);
    prevIsOpenRef.current = nowOpen;

    if (nowOpen && !wasOpen) {
      // Apertura desde el padre
      if (timerRef.current) clearTimeout(timerRef.current);
      setShouldRender(true);
      setIsClosing(false);
    } else if (!nowOpen && wasOpen && shouldRender) {
      // Cierre ordenado por el padre: salida fluida en reversa
      setIsClosing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, duration);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [isOpen, shouldRender, duration]);

  // Función para cerrar con animación de reversa invocada desde dentro del modal
  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
      if (onClose) onClose();
    }, duration);
  }, [isClosing, duration, onClose]);

  // Limpiar temporizador al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Soporte para tecla Escape
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender, isClosing, handleClose]);

  const cardClass = isClosing ? 'animate-modal-exit' : 'animate-modal-enter';
  const backdropClass = isClosing ? 'animate-backdrop-exit' : 'animate-backdrop-enter';

  return {
    shouldRender,
    isClosing,
    transformOrigin: originLockedRef.current,
    cardRef,
    handleClose,
    backdropClass,
    cardClass,
    cardStyle: { transformOrigin: originLockedRef.current }
  };
}
