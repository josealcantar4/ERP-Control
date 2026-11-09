/**
 * Hook para bloquear el scroll del cuerpo del documento cuando se despliegan modales o paneles superpuestos.
 */

import { useEffect } from 'react';

let activeModalsCount = 0;
let originalBodyOverflow = '';
let originalHtmlOverflow = '';
let originalPaddingRight = '';

export function useBodyScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    if (activeModalsCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      originalHtmlOverflow = document.documentElement.style.overflow;
      originalPaddingRight = document.body.style.paddingRight;

      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    activeModalsCount++;

    return () => {
      activeModalsCount--;
      if (activeModalsCount <= 0) {
        activeModalsCount = 0;
        document.body.style.overflow = originalBodyOverflow || '';
        document.documentElement.style.overflow = originalHtmlOverflow || '';
        document.body.style.paddingRight = originalPaddingRight || '';
      }
    };
  }, [isOpen]);
}
