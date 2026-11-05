import { flushSync } from 'react-dom';

export function transitionView(updateFn, { direction = 'forward', type = null } = {}) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    updateFn();
    return;
  }

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
