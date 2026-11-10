/**
 * Hook para controlar animaciones de apertura, cierre y ciclo de vida de montaje de componentes modales.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

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

  if (Boolean(isOpen) !== prevIsOpen) {
    setPrevIsOpen(Boolean(isOpen));
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    }
  }

  useBodyScrollLock(shouldRender);

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    const nowOpen = Boolean(isOpen);
    prevIsOpenRef.current = nowOpen;

    if (nowOpen && !wasOpen) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setShouldRender(true);
      setIsClosing(false);
    } else if (!nowOpen && wasOpen && shouldRender) {
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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

  const handleBackdropClick = useCallback((e, conditionOrAction = true) => {
    if (e.target !== e.currentTarget) return false;

    if (typeof conditionOrAction === 'function') {
      conditionOrAction();
      return true;
    }

    if (!conditionOrAction) {
      return false;
    }

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
