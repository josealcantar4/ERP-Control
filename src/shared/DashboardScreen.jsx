/**
 * Pantalla principal de inicio que muestra los accesos a módulos, alertas de transferencias y accesos rápidos según el rol del usuario.
 */

import React, { useState, useEffect } from 'react';
import { SendHorizontal, Boxes, ChevronRight, PackageOpen, Database, ClipboardCheck } from 'lucide-react';
import { transferService, canUserReceive, canUserDispatch } from '../modules/transferencias';
import { materialService } from '../modules/material/materialService';

export const DashboardScreen = React.memo(function DashboardScreen({ currentUser, onNavigate, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => transferService.getLocalSolicitudes() || []);
  const [materiales, setMateriales] = useState(() => materialService.getLocalMateriales());
  const hasSolicitar = currentUser?.roles?.includes('solicitar');
  const hasDespachar = currentUser?.roles?.includes('despachar');
  const isRootAdmin = currentUser?.username?.toLowerCase() === 'administrador';
  const hasMaterial = currentUser?.roles?.includes('material') || isRootAdmin;
  const hasCatalog = currentUser?.roles?.includes('catalogo') || isRootAdmin;

  useEffect(() => {
    const unsub = transferService.subscribeSolicitudes((list) => {
      setSolicitudes(list);
    });
    const unsubMat = materialService.subscribeMateriales((list) => {
      setMateriales(list);
    });

    const handleNotifUpdate = () => {
      setSolicitudes(transferService.getLocalSolicitudes() || []);
    };
    window.addEventListener('erp_notifications_updated', handleNotifUpdate);

    return () => {
      if (unsub) unsub();
      if (unsubMat) unsubMat();
      window.removeEventListener('erp_notifications_updated', handleNotifUpdate);
    };
  }, []);

  const pendingMaterialAlerts = materialService.calculateNotifications(materiales).length;
  const entrantesCount = solicitudes.filter(s => canUserReceive(s, currentUser)).length;
  const pendientesDespachoCount = solicitudes.filter(
    s => (s.estado === 'enviada' || s.estado === 'en_despacho') && canUserDispatch(s, currentUser)
  ).length;
  const faltantesPendientesCount = solicitudes.filter(
    s =>
      canUserDispatch(s, currentUser) &&
      (s.estado === 'recibida_incompleta' || (s.reporteFaltantes && s.reporteFaltantes.length > 0)) &&
      !s.resolucionFaltantes &&
      s.estado !== 'cerrada_con_faltantes' &&
      s.estado !== 'faltantes_despachados'
  ).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2 pb-16 animate-fade-in select-none">
      
      <div className="space-y-1">
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
          Panel de Control &bull; {currentUser?.sede}
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Hola, {currentUser?.nombre?.split(' ')[0]} 👋
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Selecciona un módulo para gestionar transferencias o administración del sistema.
        </p>
      </div>

      <div className={`grid gap-4 ${hasSolicitar || hasDespachar || hasMaterial || hasCatalog ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {hasSolicitar && (
          <div
            onClick={() => onNavigate('solicitar')}
            className="group relative bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-blue-400/80 dark:hover:border-blue-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px] sm:min-h-[185px] active:scale-[0.985] ios-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform shrink-0">
                <SendHorizontal className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="pt-1">
                <ChevronRight className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-active:text-blue-600 dark:group-active:text-blue-400 group-hover:translate-x-1 group-active:translate-x-1 transition-all duration-200 shrink-0" />
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Solicitar Pedido
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Escanea códigos de barra y genera solicitudes de reabastecimiento.
              </p>
            </div>
          </div>
        )}

        {hasSolicitar && (
          <div
            onClick={() => onNavigate('recibir')}
            className="group relative bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-violet-400/80 dark:hover:border-violet-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px] sm:min-h-[185px] active:scale-[0.985] ios-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform shrink-0">
                <PackageOpen className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                {entrantesCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-violet-100 dark:bg-transparent text-violet-700 dark:text-violet-400 border border-violet-200/60 dark:border-violet-500/30 animate-fade-in flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse"></span>
                    <span>{entrantesCount} por recibir</span>
                  </span>
                )}
                <ChevronRight className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-violet-500 dark:group-hover:text-violet-400 group-active:text-violet-500 dark:group-active:text-violet-400 group-hover:translate-x-1 group-active:translate-x-1 transition-all duration-200 shrink-0" />
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                Recibir Pedido
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Confirma los paquetes recibidos, verifica contenido y reporta faltantes.
              </p>
            </div>
          </div>
        )}

        {hasDespachar && (
          <div
            onClick={() => onNavigate('despachar')}
            className="group relative bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-emerald-400/80 dark:hover:border-emerald-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px] sm:min-h-[185px] active:scale-[0.985] ios-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform shrink-0">
                <Boxes className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end pt-1">
                {pendientesDespachoCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/30 animate-fade-in flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    <span>{pendientesDespachoCount} {pendientesDespachoCount === 1 ? 'pendiente' : 'pendientes'}</span>
                  </span>
                )}
                {faltantesPendientesCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-500/30 animate-fade-in flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                    <span>{faltantesPendientesCount} {faltantesPendientesCount === 1 ? 'faltante' : 'faltantes'}</span>
                  </span>
                )}
                <ChevronRight className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 group-active:text-emerald-500 dark:group-active:text-emerald-400 group-hover:translate-x-1 group-active:translate-x-1 transition-all duration-200 shrink-0" />
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Despachar Pedido
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Revisa pedidos, surte productos físicos y agrega extras.
              </p>
            </div>
          </div>
        )}

        {hasMaterial && (
          <div
            onClick={() => onNavigate('material')}
            className="group relative bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-orange-400/80 dark:hover:border-orange-500/50 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px] sm:min-h-[185px] active:scale-[0.985] ios-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform shrink-0">
                <ClipboardCheck className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                {pendingMaterialAlerts > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 dark:bg-transparent text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-500/30 animate-fade-in flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                    <span>{pendingMaterialAlerts} {pendingMaterialAlerts === 1 ? 'alerta' : 'alertas'}</span>
                  </span>
                )}
                <ChevronRight className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-orange-500 dark:group-hover:text-orange-400 group-active:text-orange-500 dark:group-active:text-orange-400 group-hover:translate-x-1 group-active:translate-x-1 transition-all duration-200 shrink-0" />
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                Material Brindado
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Control de papelería, cómputo, herramientas y material entregado con alertas de reemplazo.
              </p>
            </div>
          </div>
        )}

        {hasCatalog && (
          <div
            onClick={() => onNavigate('upload-catalog')}
            className="group relative bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-purple-400/80 dark:hover:border-purple-500/50 transition-all duration-300 cursor-pointer active:scale-[0.985] sm:col-span-2 ios-card-hover"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-indigo-700 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/20 group-hover:scale-105 transition-transform shrink-0">
                  <Database className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <div className="space-y-0.5">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors">
                    Sincronizar Catálogo Central
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Verifica el estado del catálogo, consulta registros locales y actualiza desde el servidor central.
                  </p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-purple-700 dark:group-hover:text-purple-400 group-active:text-purple-700 dark:group-active:text-purple-400 group-hover:translate-x-1 group-active:translate-x-1 transition-all duration-200 shrink-0" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
});
