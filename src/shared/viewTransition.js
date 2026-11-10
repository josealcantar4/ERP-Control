/**
 * Ejecutor directo e instantáneo de cambios de vista sin bloqueos de renderizado.
 */

export function transitionView(updateFn) {
  if (typeof updateFn === 'function') {
    updateFn();
  }
}

