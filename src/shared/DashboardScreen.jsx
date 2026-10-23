import React, { useState, useEffect } from 'react';
import { SendHorizontal, Boxes, ChevronRight, PackageOpen, Database, ClipboardCheck } from 'lucide-react';
import { transferService } from '../modules/transferencias/transferService';
import { materialService } from '../modules/material/materialService';

export function DashboardScreen({ currentUser, onNavigate, onRefresh }) {
  const [solicitudes, setSolicitudes] = useState(() => transferService.getLocalSolicitudes() || []);
  const [materiales, setMateriales] = useState(() => materialService.getLocalMateriales());
  const hasSolicitar = currentUser?.roles?.includes('solicitar');
  const hasDespachar = currentUser?.roles?.includes('despachar');
  const isAdmin = currentUser?.username?.toLowerCase() === 'administrador' || currentUser?.roles?.includes('admin');
  const hasMaterial = currentUser?.roles?.includes('material') || isAdmin;

  useEffect(() => {
    const unsub = transferService.subscribeSolicitudes((list) => {
      setSolicitudes(list);
    });
    const unsubMat = materialService.subscribeMateriales((list) => {
      setMateriales(list);
    });
    return () => {
      if (unsub) unsub();
      if (unsubMat) unsubMat();
    };
  }, []);

  // Notificaciones de reemplazo de material
  const pendingMaterialAlerts = materialService.calculateNotifications(materiales).length;

  // Conteos en vivo
  const entrantesCount = solicitudes.filter(
    s => s.estado === 'completada' && s.usuarioSolicitante === currentUser?.username
  ).length;

  const isAdminOrNoRestrictions =
    currentUser?.username?.toLowerCase() === 'administrador' ||
    currentUser?.roles?.includes('admin');

  const pendientesDespachoCount = solicitudes.filter(s => {
    if (s.estado !== 'enviada' && s.estado !== 'en_despacho') return false;
    if (isAdminOrNoRestrictions) return true;
    const userArea = (currentUser?.area || '').toLowerCase();
    const areaDest = (s.areaDestino || '').toLowerCase();
    if (userArea.includes('patente')) {
      return areaDest.includes('patente') || s.usuarioDestino === currentUser?.username;
    }
    if (userArea.includes('generic') || userArea.includes('genéric')) {
      return (areaDest.includes('generic') || areaDest.includes('genéric')) || s.usuarioDestino === currentUser?.username;
    }
    return true;
  }).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2 pb-16 animate-fade-in select-none">
      
      <div className="space-y-1">
        <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
          Panel de Control &bull; {currentUser?.sede}
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Hola, {currentUser?.nombre?.split(' ')[0]} 👋
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Selecciona un módulo para gestionar transferencias o administración del sistema.
        </p>
      </div>

      <div className={`grid gap-4 ${hasSolicitar && hasDespachar ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        
        {/* CARD 1: SOLICITAR PEDIDO */}
        {hasSolicitar && (
          <div onClick={() => onNavigate('solicitar')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985] ios-card-hover">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-5 group-hover:scale-105 transition-transform">
                <SendHorizontal className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Sucursal</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">Solicitar Pedido</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Escanea códigos de barra y envía la solicitud a la Matriz.</p>
            </div>
          </div>
        )}

        {/* CARD 1B: RECIBIR PEDIDO (Aparece si tiene rol de Solicitar) */}
        {hasSolicitar && (
          <div onClick={() => onNavigate('recibir')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985] ios-card-hover">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-5 group-hover:scale-105 transition-transform">
                <PackageOpen className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Sucursal</span>
                {entrantesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 animate-fade-in">
                    {entrantesCount} {entrantesCount === 1 ? 'por recibir' : 'por recibir'}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">Recibir Pedido</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Confirma las cajas de transferencia enviadas desde la matriz y reporta faltantes.</p>
            </div>
          </div>
        )}

        {/* CARD 2: DESPACHAR PEDIDO */}
        {hasDespachar && (
          <div onClick={() => onNavigate('despachar')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-emerald-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985] ios-card-hover">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-5 group-hover:scale-105 transition-transform">
                <Boxes className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Matriz / Bodega</span>
                {pendientesDespachoCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 animate-fade-in">
                    {pendientesDespachoCount} {pendientesDespachoCount === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">Despachar Pedido</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Revisa pedidos, surte productos físicos y agrega extras.</p>
            </div>
          </div>
        )}

        {/* CARD 2B: REGISTRO DE MATERIAL BRINDADO */}
        {hasMaterial && (
          <div onClick={() => onNavigate('material')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-amber-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985] ios-card-hover">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-lg shadow-amber-500/20 mb-5 group-hover:scale-105 transition-transform">
                <ClipboardCheck className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Control Interno</span>
                {pendingMaterialAlerts > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 animate-fade-in flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                    {pendingMaterialAlerts} {pendingMaterialAlerts === 1 ? 'alerta' : 'alertas'}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">Material Brindado</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Control de papelería, cómputo, herramientas y material entregado con alertas de reemplazo.
              </p>
            </div>
          </div>
        )}

        {/* CARD 3: ADMIN */}
        {isAdmin && (
          <div onClick={() => onNavigate('upload-catalog')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px] active:scale-[0.985] sm:col-span-2 ios-card-hover">
             <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform shrink-0">
                  <Database className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Catálogo Base</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">Sincronizar Catálogo Central</h2>
                  <p className="text-xs text-slate-500 mt-1">Verifica el estado del catálogo, consulta registros locales y fuerza actualizaciones desde el servidor central.</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors mt-2" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}