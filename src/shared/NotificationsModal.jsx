/**
 * Modal con centro de notificaciones para consultar alertas de pedidos, faltantes y avisos del sistema.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  User,
  Building2,
  ArrowRight,
  Truck,
  Inbox
} from 'lucide-react';
import {
  playNotificationSound,
  unlockAudioEngine,
  dismissNotification
} from '../modules/transferencias';

export function NotificationsModal({
  isOpen,
  notifications = [],
  onClose,
  onMarkAsReplaced,
  onNavigateToMaterial,
  onNavigateToScreen,
  onDismissNotification,
  onViewTransferDetail
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  const [coords, setCoords] = useState(() => ({
    top: 64,
    left: 12,
    width: 384,
    arrowLeft: 340
  }));

  const [localDismissedIds, setLocalDismissedIds] = useState(new Set());
  const isPointerDownInsideBoxRef = useRef(false);

  const handleDismiss = (notifId, e) => {
    if (e) e.stopPropagation();
    dismissNotification(notifId);
    setLocalDismissedIds(prev => new Set(prev).add(notifId));
    if (onDismissNotification) onDismissNotification(notifId);
  };

  const [permissionState, setPermissionState] = useState(() => {
    return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'default';
  });

  const handleRequestPermission = async () => {
    unlockAudioEngine();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setPermissionState(res);
        if (res === 'granted') {
          playNotificationSound();
        }
      } catch (_e) {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  const updatePosition = () => {
    const bell = document.getElementById('navbar-notification-bell-btn');
    const viewportWidth = window.innerWidth;
    const boxWidth = Math.min(390, viewportWidth - 24);

    if (!bell) {
      setCoords({
        top: 64,
        left: Math.max(12, viewportWidth - boxWidth - 16),
        width: boxWidth,
        arrowLeft: boxWidth - 36
      });
      return;
    }

    const rect = bell.getBoundingClientRect();
    const bellCenter = rect.left + rect.width / 2;

    let targetLeft = bellCenter - boxWidth + 40;

    if (targetLeft + boxWidth > viewportWidth - 12) {
      targetLeft = viewportWidth - boxWidth - 12;
    }
    if (targetLeft < 12) {
      targetLeft = 12;
    }

    let arrowLeft = bellCenter - targetLeft;
    arrowLeft = Math.max(26, Math.min(boxWidth - 26, arrowLeft));

    setCoords({
      top: Math.round(rect.bottom + 10),
      left: Math.round(targetLeft),
      width: Math.round(boxWidth),
      arrowLeft: Math.round(arrowLeft)
    });
  };

  useEffect(() => {
    if (!shouldRender) return;

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isClosing) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    const handlePointerDown = (e) => {
      if (isClosing) return;

      const box = document.getElementById('notification-messagebox-card');
      const bell = document.getElementById('navbar-notification-bell-btn');

      const isInsideBox = Boolean(box && (box === e.target || box.contains(e.target)));
      isPointerDownInsideBoxRef.current = isInsideBox;
      if (isInsideBox) return;
      if (bell && (bell === e.target || bell.contains(e.target) || (e.target.closest && e.target.closest('#navbar-notification-bell-btn')))) {
        return;
      }

      onClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, [shouldRender, isClosing, onClose]);

  if (!shouldRender) return null;

  const activeNotifications = notifications.filter(n => !localDismissedIds.has(n.id));

  const formatNotifDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const messageboxContent = (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/5 sm:bg-transparent transition-opacity cursor-default ${
          isClosing ? 'animate-backdrop-exit' : 'animate-backdrop-enter'
        }`}
        onClick={isClosing ? undefined : () => {
          if (isPointerDownInsideBoxRef.current) {
            isPointerDownInsideBoxRef.current = false;
            return;
          }
          onClose();
        }}
        aria-hidden="true"
      />

      <div
        id="notification-messagebox-card"
        role="dialog"
        aria-label="Panel de Notificaciones"
        className={`fixed z-[60] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-slate-900/20 border border-slate-200 dark:border-slate-800 flex flex-col max-h-[82vh] sm:max-h-[520px] overscroll-contain ${
          isClosing
            ? 'animate-popover-exit pointer-events-none'
            : 'animate-popover-enter'
        }`}
        style={{
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          width: `${coords.width}px`,
          transformOrigin: `${coords.arrowLeft}px -8px`
        }}
      >
        <div
          className="absolute -top-[7px] w-3.5 h-3.5 bg-white dark:bg-slate-900 border-t border-l border-slate-200 dark:border-slate-800 z-20 pointer-events-none"
          style={{
            left: `${coords.arrowLeft}px`,
            transform: 'translateX(-50%) rotate(45deg)'
          }}
          aria-hidden="true"
        />
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 rounded-t-3xl shrink-0 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-amber-50 dark:bg-transparent text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-500/30 flex items-center justify-center shadow-2xs relative">
              <Bell className="w-4 h-4" />
              {activeNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-extrabold flex items-center justify-center shadow-xs">
                  {activeNotifications.length > 99 ? '99+' : activeNotifications.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Notificaciones
              </h3>
              <p className="text-[10px] text-slate-400">
                {activeNotifications.length === 1 ? '1 aviso pendiente' : `${activeNotifications.length} avisos pendientes`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar notificaciones"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {permissionState !== 'granted' && typeof window !== 'undefined' && 'Notification' in window && (
          <div className="px-4 py-2 bg-amber-50/95 dark:bg-transparent border-b border-amber-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <span className="text-amber-800 dark:text-amber-400 text-[11px] font-medium leading-tight">
              Activa notificaciones del sistema para recibir avisos aquí.
            </span>
            <button
              type="button"
              onClick={handleRequestPermission}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold shrink-0 transition-colors cursor-pointer shadow-2xs"
            >
              Activar
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 max-h-[58vh] sm:max-h-[380px] overscroll-contain">
          {activeNotifications.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-transparent text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                ¡Al día! No hay notificaciones pendientes
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                No tienes avisos pendientes en este momento.
              </p>
            </div>
          ) : (
            activeNotifications.map((notif) => {
              if (notif.categoria === 'transferencia') {
                const isNueva = notif.tipo === 'nueva_solicitud';
                const isDespacho = notif.tipo === 'caja_despachada';
                const isFaltante = notif.tipo === 'reporte_faltantes';
                const isFaltantesEntregados = notif.tipo === 'faltantes_entregados';

                const badgeBg = isNueva
                  ? 'bg-blue-100 dark:bg-transparent text-blue-800 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                  : isDespacho
                  ? 'bg-emerald-100 dark:bg-transparent text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                  : isFaltante
                  ? 'bg-rose-100 dark:bg-transparent text-rose-800 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                  : isFaltantesEntregados
                  ? 'bg-emerald-100 dark:bg-transparent text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-indigo-100 dark:bg-transparent text-indigo-800 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30';

                const cardBorder = isNueva
                  ? 'bg-blue-50/40 dark:bg-slate-800/40 border-blue-200/80 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500'
                  : isDespacho
                  ? 'bg-emerald-50/40 dark:bg-slate-800/40 border-emerald-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500'
                  : isFaltante
                  ? 'bg-rose-50/40 dark:bg-slate-800/40 border-rose-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500'
                  : isFaltantesEntregados
                  ? 'bg-emerald-50/40 dark:bg-slate-800/40 border-emerald-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500'
                  : 'bg-indigo-50/40 dark:bg-slate-800/40 border-indigo-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500';

                const icon = isNueva ? (
                  <Inbox className="w-3.5 h-3.5 text-blue-600" />
                ) : isDespacho ? (
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                ) : isFaltante ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                ) : isFaltantesEntregados ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Truck className="w-3.5 h-3.5 text-indigo-600" />
                );

                const handleTransferAction = () => {
                  handleDismiss(notif.id);
                  onClose();
                  if (notif.tipo === 'faltantes_entregados' && notif.solicitud) {
                    if (onViewTransferDetail) {
                      onViewTransferDetail(notif.solicitud, notif.id);
                    }
                  } else if (onNavigateToScreen && notif.actionScreen) {
                    onNavigateToScreen(notif.actionScreen, notif.solicitudId, notif);
                  }
                };

                return (
                  <div
                    key={notif.id}
                    onClick={handleTransferAction}
                    className={`p-3 rounded-2xl border transition-all space-y-2 cursor-pointer active:scale-[0.99] hover:shadow-xs group ${cardBorder}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shrink-0 shadow-2xs border border-slate-100 dark:border-slate-700">
                          {icon}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full truncate ${badgeBg}`}>
                          {notif.titulo}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700">
                          {formatNotifDate(notif.fecha)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss(notif.id, e);
                          }}
                          className="w-5 h-5 rounded-full hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                          title="Descartar aviso"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-800 dark:text-slate-200 font-medium leading-snug">
                      {notif.mensaje}
                    </p>
                    <div className="pt-0.5 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-slate-500">
                        {notif.subtitulo}
                      </span>

                      {notif.actionScreen && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTransferAction();
                          }}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs border border-transparent dark:border-slate-700 group-hover:bg-blue-600"
                        >
                          <span>{notif.actionText}</span>
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              const isOverdue = notif.tipo === 'vencida';
              const it = notif.item;

              const handleMaterialAction = () => {
                handleDismiss(notif.id);
                if (onNavigateToMaterial) {
                  onClose();
                  onNavigateToMaterial();
                }
              };

              return (
                <div
                  key={notif.id}
                  onClick={handleMaterialAction}
                  className={`p-3 rounded-2xl border transition-all space-y-2 cursor-pointer active:scale-[0.99] hover:shadow-xs group ${
                    isOverdue
                      ? 'bg-red-50/50 dark:bg-slate-800/40 border-red-200/80 dark:border-slate-800 hover:border-red-300'
                      : 'bg-amber-50/40 dark:bg-slate-800/40 border-amber-200/80 dark:border-slate-800 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isOverdue ? 'bg-red-100 dark:bg-transparent text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30' : 'bg-amber-100 dark:bg-transparent text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                        }`}
                      >
                        {isOverdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </span>
                      <span
                        className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full truncate ${
                          isOverdue
                            ? 'bg-red-100 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30'
                            : 'bg-amber-100 dark:bg-transparent text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                        }`}
                      >
                        {notif.titulo}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200/80">
                        {notif.fechaReemplazo}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(notif.id, e);
                        }}
                        className="w-5 h-5 rounded-full hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="Descartar aviso"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-800 font-medium leading-snug">
                    {notif.mensaje}
                  </p>
                  {it && (
                    <div className="p-2 bg-white/90 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 flex items-center justify-between text-[10px] gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 font-bold text-slate-900 dark:text-slate-100 truncate">
                        <Package className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate">{it.descripcion}</span>
                        <span className="font-mono text-slate-500 font-semibold shrink-0">({it.cantidad} pz)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500 text-[9px] shrink-0">
                        <span className="flex items-center gap-0.5">
                          <User className="w-2.5 h-2.5 text-indigo-500" />
                          {it.personal}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-0.5">
                          <Building2 className="w-2.5 h-2.5 text-emerald-500" />
                          {it.area}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-0.5 flex items-center justify-end gap-1.5">
                    {onMarkAsReplaced && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsReplaced(notif.materialId);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-slate-700 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Marcar Reemplazado</span>
                      </button>
                    )}

                    {onNavigateToMaterial && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMaterialAction();
                        }}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs border border-transparent dark:border-slate-700 group-hover:bg-blue-600"
                      >
                        <span>Ver en Módulo</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-b-3xl flex items-center justify-center text-xs shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">
            {activeNotifications.length} {activeNotifications.length === 1 ? 'notificación activa' : 'notificaciones activas'}
          </span>
        </div>
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(messageboxContent, document.body) : messageboxContent;
}
