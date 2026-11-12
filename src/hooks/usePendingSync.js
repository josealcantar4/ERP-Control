/**
 * Hook para observar transferencias operativas en cola pendientes de sincronizar con Firebase.
 * Aplica un umbral de gracia en línea para evitar parpadeos en guardados rápidos.
 */

import { useState, useEffect, useRef } from 'react';
import { transferService } from '../modules/transferencias/transferService';
import { useOnlineStatus } from './useOnlineStatus';

function computeVisibleSet(operationalMap, isOnline, graceMs, nowMs) {
  const visibleIds = new Set();
  let nextExpiryDelay = Infinity;

  operationalMap.forEach((ts, id) => {
    const elapsed = nowMs - ts;
    if (!isOnline || elapsed >= graceMs) {
      visibleIds.add(id);
    } else {
      nextExpiryDelay = Math.min(nextExpiryDelay, graceMs - elapsed);
    }
  });

  return { visibleIds, nextExpiryDelay };
}

export function usePendingSync(graceMs = 1800) {
  const { isOnline } = useOnlineStatus();
  const [state, setState] = useState(() => {
    const initialMap = transferService.getOperationalPendingSyncMap();
    const { visibleIds } = computeVisibleSet(initialMap, isOnline, graceMs, Date.now());
    return {
      pendingSyncIds: visibleIds,
      rawPendingCount: initialMap.size,
      justSynced: false
    };
  });

  const prevVisibleCountRef = useRef(state.pendingSyncIds.size);
  const graceTimerRef = useRef(null);
  const syncedClearTimerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const applySnapshot = (operationalMap) => {
      if (!active) return;

      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }

      const { visibleIds, nextExpiryDelay } = computeVisibleSet(
        operationalMap,
        isOnline,
        graceMs,
        Date.now()
      );

      const nextCount = visibleIds.size;
      const wasVisible = prevVisibleCountRef.current > 0;
      const clearedCleanly = wasVisible && nextCount === 0 && operationalMap.size === 0 && isOnline;

      prevVisibleCountRef.current = nextCount;

      if (clearedCleanly) {
        if (syncedClearTimerRef.current) clearTimeout(syncedClearTimerRef.current);
        syncedClearTimerRef.current = setTimeout(() => {
          if (!active) return;
          setState((prev) => (prev.justSynced ? { ...prev, justSynced: false } : prev));
        }, 3800);
      } else if (nextCount > 0 && syncedClearTimerRef.current) {
        clearTimeout(syncedClearTimerRef.current);
        syncedClearTimerRef.current = null;
      }

      setState((prev) => ({
        pendingSyncIds: visibleIds,
        rawPendingCount: operationalMap.size,
        justSynced: nextCount > 0 ? false : (clearedCleanly ? true : prev.justSynced)
      }));

      if (isOnline && nextExpiryDelay !== Infinity) {
        graceTimerRef.current = setTimeout(() => {
          if (!active) return;
          applySnapshot(transferService.getOperationalPendingSyncMap());
        }, Math.max(50, nextExpiryDelay + 25));
      }
    };

    const unsubscribe = transferService.subscribePendingSync((operationalMap) => {
      applySnapshot(operationalMap);
    });

    return () => {
      active = false;
      unsubscribe();
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      if (syncedClearTimerRef.current) clearTimeout(syncedClearTimerRef.current);
    };
  }, [graceMs, isOnline]);

  return {
    pendingSyncIds: state.pendingSyncIds,
    pendingSyncCount: state.pendingSyncIds.size,
    rawPendingCount: state.rawPendingCount,
    justSynced: state.justSynced
  };
}
