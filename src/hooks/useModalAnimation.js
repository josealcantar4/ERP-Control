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

  // Rastreo de inicio y fin de interacción para evitar que clics sostenidos
  // o arrastres de texto desde adentro del modal cierren la ventana al soltarse afuera
  const isPointerDownInsideCardRef = useRef(false);
  const isPointerUpInsideCardRef = useRef(false);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!shouldRender || isClosing) return;

    const handleGlobalPointerDown = (e) => {
      const touch = (e.touches && e.touches.length > 0) ? e.touches[0] : e;
      if (touch && touch.clientX != null && touch.clientY != null) {
        pointerDownPosRef.current = { x: touch.clientX, y: touch.clientY };
      }

      const target = e.target;
      if (cardRef.current && (cardRef.current === target || cardRef.current.contains(target))) {
        isPointerDownInsideCardRef.current = true;
      } else {
        isPointerDownInsideCardRef.current = false;
      }
    };

    const handleGlobalPointerUp = (e) => {
      const target = e.target;
      if (cardRef.current && (cardRef.current === target || cardRef.current.contains(target))) {
        isPointerUpInsideCardRef.current = true;
      } else {
        isPointerUpInsideCardRef.current = false;
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, { capture: true, passive: true });
    window.addEventListener('mousedown', handleGlobalPointerDown, { capture: true, passive: true });
    window.addEventListener('touchstart', handleGlobalPointerDown, { capture: true, passive: true });

    window.addEventListener('pointerup', handleGlobalPointerUp, { capture: true, passive: true });
    window.addEventListener('mouseup', handleGlobalPointerUp, { capture: true, passive: true });
    window.addEventListener('touchend', handleGlobalPointerUp, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown, { capture: true });
      window.removeEventListener('mousedown', handleGlobalPointerDown, { capture: true });
      window.removeEventListener('touchstart', handleGlobalPointerDown, { capture: true });

      window.removeEventListener('pointerup', handleGlobalPointerUp, { capture: true });
      window.removeEventListener('mouseup', handleGlobalPointerUp, { capture: true });
      window.removeEventListener('touchend', handleGlobalPointerUp, { capture: true });
    };
  }, [shouldRender, isClosing, cardRef]);

  // Manejador seguro para cerrar al hacer clic en el backdrop
  const handleBackdropClick = useCallback((e, conditionOrAction = true) => {
    // 1. Debe ser un clic directo en el elemento del backdrop (e.currentTarget)
    if (e.target !== e.currentTarget) return false;

    // 2. Si el clic se dio sobre una barra de desplazamiento nativa del contenedor
    if (e.clientX > e.currentTarget.clientWidth || e.clientY > e.currentTarget.clientHeight) {
      return false;
    }

    // 3. Si el gesto (mousedown/touchstart) se originó adentro de la tarjeta del modal, NO cerrar
    // Esto evita que al arrastrar texto o soltar el clic afuera se cierre involuntariamente
    if (isPointerDownInsideCardRef.current) {
      isPointerDownInsideCardRef.current = false;
      return false;
    }

    // 4. Si el gesto terminó adentro de la tarjeta del modal, NO cerrar
    if (isPointerUpInsideCardRef.current) {
      isPointerUpInsideCardRef.current = false;
      return false;
    }

    // 5. Si fue un arrastre de mouse/touch significativo (> 20px), descartar como gesto de arrastre involuntario
    if (pointerDownPosRef.current && (pointerDownPosRef.current.x !== 0 || pointerDownPosRef.current.y !== 0)) {
      if (e.clientX != null && (e.clientX !== 0 || e.clientY !== 0)) {
        const dist = Math.hypot(
          e.clientX - pointerDownPosRef.current.x,
          e.clientY - pointerDownPosRef.current.y
        );
        if (dist > 20) {
          return false;
        }
      }
    }

    // 6. Si se pasó una función como acción personalizada (ej. handleCancelClick o handleClose con cleanup)
    if (typeof conditionOrAction === 'function') {
      conditionOrAction();
      return true;
    }

    // 7. Si se pasó una condición booleana y no se cumple (ej. !isSubmitting, !isProcessing)
    if (!conditionOrAction) {
      return false;
    }

    // 8. Cierre normal
    handleClose();
    return true;
  }, [handleClose]);

  const cardClass = isClosing ? 'animate-modal-exit' : 'animate-modal-enter';
  const backdropClass = isClosing ? 'animate-backdrop-exit' : 'animate-backdrop-enter';

  return {
    shouldRender,
    isClosing,
    transformOrigin: originLockedRef.current,
    cardRef,
    handleClose,
    handleBackdropClick,
    backdropClass,
    cardClass,
    cardStyle: { transformOrigin: originLockedRef.current }
  };
}
