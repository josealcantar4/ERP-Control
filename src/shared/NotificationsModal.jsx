import React, { useState, useEffect } from 'react';
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
  const [filterTab, setFilterTab] = useState('todas'); // 'todas' | 'pedidos' | 'material'
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  const [coords, setCoords] = useState(() => ({
    top: 64,
    left: 12,
    width: 384,
    arrowLeft: 340
  }));

  const [localDismissedIds, setLocalDismissedIds] = useState(new Set());

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

  // Ciclo de animación de apertura (expandir hacia abajo) y cierre (contraer hacia el icono al revés)
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 180); // Duración sincronizada con animate-popover-exit (0.18s)
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  // Calcular la posición exacta debajo del ícono de la campana y la coordenada del pico
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

    // Alinear el contenedor para que el pico apunte al centro de la campana
    let targetLeft = bellCenter - boxWidth + 40;

    if (targetLeft + boxWidth > viewportWidth - 12) {
      targetLeft = viewportWidth - boxWidth - 12;
    }
    if (targetLeft < 12) {
      targetLeft = 12;
    }

    // Calcular posición del pico relativa al cuadro contenedor
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

    // Cierre con la tecla Escape
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isClosing) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    // Detección de toque / clic fuera: si se toca fuera del messagebox o de la campana, se cierra
    const handlePointerDown = (e) => {
      if (isClosing) return;

      const box = document.getElementById('notification-messagebox-card');
      const bell = document.getElementById('navbar-notification-bell-btn');

      if (box && (box === e.target || box.contains(e.target))) return;
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
  const transferNotifs = activeNotifications.filter(n => n.categoria === 'transferencia');
  const materialNotifs = activeNotifications.filter(n => n.categoria !== 'transferencia');

  const filteredList = filterTab === 'pedidos'
    ? transferNotifs
    : filterTab === 'material'
    ? materialNotifs
    : activeNotifications;

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
      {/* CAPA DE DETECCIÓN INVISIBLE: Tocar fuera del messagebox lo cierra */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/5 sm:bg-transparent transition-opacity cursor-default ${
          isClosing ? 'animate-backdrop-exit' : 'animate-backdrop-enter'
        }`}
        onClick={isClosing ? undefined : onClose}
        aria-hidden="true"
      />

      {/* MESSAGEBOX FLOTANTE: Animación desde el icono hacia abajo (apertura) y hacia el icono al revés (cierre) */}
      <div
        id="notification-messagebox-card"
        role="dialog"
        aria-label="Panel de Notificaciones"
        className={`fixed z-[60] bg-white rounded-3xl shadow-2xl shadow-slate-900/20 border border-slate-200 flex flex-col max-h-[82vh] sm:max-h-[520px] overscroll-contain ${
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
        {/* EL PICO (Carett / Flecha indicadora apuntando directamente a la campana) */}
        <div
          className="absolute -top-[7px] w-3.5 h-3.5 bg-white border-t border-l border-slate-200 z-20 pointer-events-none"
          style={{
            left: `${coords.arrowLeft}px`,
            transform: 'translateX(-50%) rotate(45deg)'
          }}
          aria-hidden="true"
        />

        {/* HEADER DEL MESSAGEBOX */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white rounded-t-3xl shrink-0 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-2xs relative">
              <Bell className="w-4 h-4" />
              {activeNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-extrabold flex items-center justify-center shadow-xs">
                  {activeNotifications.length > 99 ? '99+' : activeNotifications.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
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
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar notificaciones"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* BANNER DE ACTIVACIÓN DE PERMISOS SI NO ESTÁN OTORGADOS */}
        {permissionState !== 'granted' && typeof window !== 'undefined' && 'Notification' in window && (
          <div className="px-4 py-2 bg-amber-50/95 border-b border-amber-200/80 flex items-center justify-between gap-2 text-xs">
            <span className="text-amber-800 text-[11px] font-medium leading-tight">
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

        {/* PESTAÑAS COMPACTAS DE FILTRADO */}
        <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center gap-1 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterTab('todas')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all ${
              filterTab === 'todas'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Todas ({activeNotifications.length})
          </button>

          {transferNotifs.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterTab('pedidos')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                filterTab === 'pedidos'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs border border-blue-200 font-bold'
                  : 'text-slate-500 hover:text-blue-700'
              }`}
            >
              <Truck className="w-3 h-3 text-blue-500" />
              <span>Pedidos ({transferNotifs.length})</span>
            </button>
          )}

          {materialNotifs.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterTab('material')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                filterTab === 'material'
                  ? 'bg-amber-50 text-amber-800 shadow-2xs border border-amber-200 font-bold'
                  : 'text-slate-500 hover:text-amber-800'
              }`}
            >
              <Clock className="w-3 h-3 text-amber-500" />
              <span>Material ({materialNotifs.length})</span>
            </button>
          )}
        </div>

        {/* LISTADO DE NOTIFICACIONES */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 max-h-[58vh] sm:max-h-[380px] overscroll-contain">
          {filteredList.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">
                ¡Al día! No hay notificaciones pendientes
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                No tienes avisos pendientes en este momento.
              </p>
            </div>
          ) : (
            filteredList.map((notif) => {
              // CASO 1: NOTIFICACIONES DE TRANSFERENCIA (SOLICITUDES, DESPACHOS, FALTANTES)
              if (notif.categoria === 'transferencia') {
                const isNueva = notif.tipo === 'nueva_solicitud';
                const isDespacho = notif.tipo === 'caja_despachada';
                const isFaltante = notif.tipo === 'reporte_faltantes';
                const isFaltantesEntregados = notif.tipo === 'faltantes_entregados';

                const badgeBg = isNueva
                  ? 'bg-blue-100 text-blue-800'
                  : isDespacho
                  ? 'bg-emerald-100 text-emerald-800'
                  : isFaltante
                  ? 'bg-rose-100 text-rose-800'
                  : isFaltantesEntregados
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-indigo-100 text-indigo-800';

                const cardBorder = isNueva
                  ? 'bg-blue-50/40 border-blue-200/80 hover:border-blue-300'
                  : isDespacho
                  ? 'bg-emerald-50/40 border-emerald-200/80 hover:border-emerald-300'
                  : isFaltante
                  ? 'bg-rose-50/40 border-rose-200/80 hover:border-rose-300'
                  : isFaltantesEntregados
                  ? 'bg-emerald-50/40 border-emerald-200/80 hover:border-emerald-300'
                  : 'bg-indigo-50/40 border-indigo-200/80 hover:border-indigo-300';

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
                  if (notif.tipo === 'faltantes_entregados' && notif.solicitud) {
                    if (onViewTransferDetail) {
                      onViewTransferDetail(notif.solicitud, notif.id);
                    }
                  } else if (onNavigateToScreen && notif.actionScreen) {
                    onNavigateToScreen(notif.actionScreen, notif.solicitudId);
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
                        <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-2xs border border-slate-100">
                          {icon}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full truncate ${badgeBg}`}>
                          {notif.titulo}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200/80">
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

                    <p className="text-[11px] text-slate-800 font-medium leading-snug">
                      {notif.mensaje}
                    </p>

                    {/* METADATOS Y ACCIÓN RÁPIDA */}
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
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs group-hover:bg-blue-600"
                        >
                          <span>{notif.actionText}</span>
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // CASO 2: NOTIFICACIONES DE MATERIAL (ALERTAS DE REEMPLAZO Y VENCIMIENTO)
              const isOverdue = notif.tipo === 'vencida';
              const it = notif.item;

              const handleMaterialAction = () => {
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
                      ? 'bg-red-50/50 border-red-200/80 hover:border-red-300'
                      : 'bg-amber-50/40 border-amber-200/80 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isOverdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isOverdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </span>
                      <span
                        className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full truncate ${
                          isOverdue
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
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

                  {/* METADATOS DEL ÍTEM */}
                  {it && (
                    <div className="p-2 bg-white/90 rounded-xl border border-slate-200/60 flex items-center justify-between text-[10px] gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 font-bold text-slate-900 truncate">
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

                  {/* ACCIONES RÁPIDAS */}
                  <div className="pt-0.5 flex items-center justify-end gap-1.5">
                    {onMarkAsReplaced && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsReplaced(notif.materialId);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
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
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs group-hover:bg-blue-600"
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

        {/* FOOTER DEL MESSAGEBOX */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/80 rounded-b-3xl flex items-center justify-center text-xs shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">
            {activeNotifications.length} {activeNotifications.length === 1 ? 'notificación activa' : 'notificaciones activas'}
          </span>
        </div>
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(messageboxContent, document.body) : messageboxContent;
}
