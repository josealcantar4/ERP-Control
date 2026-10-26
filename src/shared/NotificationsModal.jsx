import React, { useState } from 'react';
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
  Calendar,
  ArrowRight
} from 'lucide-react';
import { useBodyScrollLock } from '../hooks';

export function NotificationsModal({
  isOpen,
  notifications = [],
  onClose,
  onMarkAsReplaced,
  onNavigateToMaterial
}) {
  useBodyScrollLock(isOpen);

  const [filterTab, setFilterTab] = useState('todas'); // 'todas' | 'vencidas' | 'proximas'

  if (!isOpen) return null;

  const vencidas = notifications.filter(n => n.tipo === 'vencida');
  const proximas = notifications.filter(n => n.tipo === 'proxima');

  const filteredList = filterTab === 'vencidas'
    ? vencidas
    : filterTab === 'proximas'
    ? proximas
    : notifications;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in select-none overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 overscroll-contain">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm relative">
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm">
                  {notifications.length > 99 ? '99+' : notifications.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Notificaciones
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TABS DE FILTRO */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setFilterTab('todas')}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
              filterTab === 'todas'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Todas ({notifications.length})
          </button>
          <button
            onClick={() => setFilterTab('vencidas')}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
              filterTab === 'vencidas'
                ? 'bg-red-50 text-red-700 shadow-sm border border-red-200 font-bold'
                : 'text-slate-500 hover:text-red-700'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span>Vencidas ({vencidas.length})</span>
          </button>
          <button
            onClick={() => setFilterTab('proximas')}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
              filterTab === 'proximas'
                ? 'bg-amber-50 text-amber-800 shadow-sm border border-amber-200 font-bold'
                : 'text-slate-500 hover:text-amber-800'
            }`}
          >
            <Clock className="w-3 h-3 text-amber-500" />
            <span>Próximas ({proximas.length})</span>
          </button>
        </div>

        {/* LISTADO DE NOTIFICACIONES */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {filteredList.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">
                ¡Al día! No hay notificaciones pendientes
              </h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                No tienes notificaciones pendientes en este momento.
              </p>
            </div>
          ) : (
            filteredList.map((notif) => {
              const isOverdue = notif.tipo === 'vencida';
              const it = notif.item;

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                    isOverdue
                      ? 'bg-red-50/50 border-red-200/80 hover:border-red-300'
                      : 'bg-amber-50/40 border-amber-200/80 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                          isOverdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isOverdue ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      </span>
                      <div>
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isOverdue
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {notif.titulo}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200/80">
                      Fecha límite: {notif.fechaReemplazo}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {notif.mensaje}
                  </p>

                  {/* METADATOS DEL ÍTEM */}
                  {it && (
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/60 flex items-center justify-between text-[11px] gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <Package className="w-3.5 h-3.5 text-blue-600" />
                        <span>{it.descripcion}</span>
                        <span className="font-mono text-slate-500 font-semibold">({it.cantidad} pz)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                        <span className="flex items-center gap-0.5">
                          <User className="w-3 h-3 text-indigo-500" />
                          {it.personal}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-0.5">
                          <Building2 className="w-3 h-3 text-emerald-500" />
                          {it.area}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ACCIONES RÁPIDAS */}
                  <div className="pt-1 flex items-center justify-end gap-2">
                    {onMarkAsReplaced && (
                      <button
                        type="button"
                        onClick={() => onMarkAsReplaced(notif.materialId)}
                        className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Marcar Reemplazado</span>
                      </button>
                    )}

                    {onNavigateToMaterial && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToMaterial();
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>Ver en Módulo</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex justify-between items-center text-xs">
          <span className="text-[11px] text-slate-400">
            {notifications.length} {notifications.length === 1 ? 'notificación activa' : 'notificaciones activas'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
