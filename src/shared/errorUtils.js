/**
 * Utilidad compartida para distinguir errores de validación/negocio de errores técnicos crudos
 * (Firebase, red o excepciones de ejecución) y presentar mensajes amigables con detalle opcional.
 */

export const DEFAULT_FRIENDLY_ERROR_MESSAGE =
  'Ocurrió un error de conexión o del sistema. Por favor intenta de nuevo.';

const TECHNICAL_ERROR_PATTERNS = [
  /firebase(?:error)?/i,
  /\b(?:auth|firestore|storage|functions|database|app)\/[a-z0-9-]+/i,
  /\b(?:permission-denied|unauthenticated|unavailable|deadline-exceeded|resource-exhausted|failed-precondition|aborted|out-of-range|unimplemented|internal|data-loss)\b/i,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|DOMException|QuotaExceededError|NetworkError|AbortError|ChunkLoadError)\b/,
  /\bMissing or insufficient permissions\b/i,
  /\bFailed to fetch\b/i,
  /\bNetworkError when attempting to fetch\b/i,
  /\bNetwork Error\b/i,
  /\bLoad failed\b/i,
  /\bInternal Server Error\b/i,
  /\bRequest failed with status code\b/i,
  /\bCannot read propert(?:y|ies) of\b/i,
  /\bis not a function\b/i,
  /\bis not defined\b/i,
  /\bUnexpected token\b/i,
  /\bLoading chunk \d+ failed\b/i,
  /\b(?:ERR_[A-Z0-9_]+|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/,
  /\n\s+at\s+\S+/,
  /\([a-z-]+\/[a-z0-9-]+\)/i
];

export function isTechnicalError(errorInput) {
  if (!errorInput) return false;

  if (typeof errorInput === 'object') {
    const code = typeof errorInput.code === 'string' ? errorInput.code.trim() : '';
    if (code) return true;

    const name = typeof errorInput.name === 'string' ? errorInput.name.trim() : '';
    if (name && name !== 'Error' && name !== 'ValidationError') {
      return true;
    }

    const msg = typeof errorInput.message === 'string' ? errorInput.message : '';
    if (TECHNICAL_ERROR_PATTERNS.some((re) => re.test(msg))) {
      return true;
    }

    return false;
  }

  if (typeof errorInput === 'string') {
    const msg = errorInput.trim();
    if (!msg) return false;
    return TECHNICAL_ERROR_PATTERNS.some((re) => re.test(msg));
  }

  return false;
}

export function parseErrorDisplay(errorInput, options = {}) {
  const {
    forceTechnical = false,
    fallbackMessage = DEFAULT_FRIENDLY_ERROR_MESSAGE
  } = options;

  let rawMessage = '';
  let rawCode = '';
  let rawName = '';

  if (typeof errorInput === 'string') {
    rawMessage = errorInput;
  } else if (errorInput && typeof errorInput === 'object') {
    rawMessage =
      typeof errorInput.message === 'string'
        ? errorInput.message
        : typeof errorInput.error === 'string'
        ? errorInput.error
        : '';
    rawCode = typeof errorInput.code === 'string' ? errorInput.code.trim() : '';
    rawName = typeof errorInput.name === 'string' ? errorInput.name.trim() : '';
  }

  const trimmedMsg = rawMessage.trim();
  const technical =
    Boolean(forceTechnical) ||
    isTechnicalError(errorInput) ||
    (!trimmedMsg && Boolean(rawCode));

  if (!technical) {
    return {
      isTechnical: false,
      displayMessage: trimmedMsg || fallbackMessage,
      technicalDetails: ''
    };
  }

  const detailParts = [];
  if (rawCode && !trimmedMsg.includes(rawCode)) {
    detailParts.push(`[${rawCode}]`);
  }
  if (trimmedMsg) {
    detailParts.push(trimmedMsg);
  } else if (rawName) {
    detailParts.push(rawName);
  }

  return {
    isTechnical: true,
    displayMessage: fallbackMessage,
    technicalDetails: detailParts.join(' ').trim() || 'Error técnico sin detalles adicionales.'
  };
}
