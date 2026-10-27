import { flushSync } from 'react-dom';

/**
 * Ejecuta una actualización de estado de React envuelta en la API de View Transitions
 * con dirección y contexto, permitiendo transiciones nativas y fluidas entre vistas SPA.
 *
 * @param {Function} updateFn - Función que actualiza el estado de React
 * @param {Object} [options] - Opciones de contexto de la transición
 * @param {'forward' | 'back' | 'tab' | 'login' | 'modal'} [options.direction='forward'] - Dirección o tipo contextual
 * @param {string} [options.type] - Tipo específico opcional
 */
export function transitionView(updateFn, { direction = 'forward', type = null } = {}) {
  // Si el navegador no soporta la View Transitions API o durante SSR, ejecuta directamente
  if (typeof document === 'undefined' || !document.startViewTransition) {
    updateFn();
    return;
  }

  // Asigna los atributos de contexto en la raíz <html> para que el CSS aplique la animación correspondiente
  document.documentElement.dataset.transitionDirection = direction;
  if (type) {
    document.documentElement.dataset.transitionType = type;
  }

  try {
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        updateFn();
      });
    });

    // Limpia los atributos contextuales una vez concluida la transición
    transition.finished.finally(() => {
      delete document.documentElement.dataset.transitionDirection;
      delete document.documentElement.dataset.transitionType;
    });
  } catch (err) {
    console.warn('Fallback de View Transition:', err);
    updateFn();
    delete document.documentElement.dataset.transitionDirection;
    delete document.documentElement.dataset.transitionType;
  }
}
