import React from 'react';
import { SendHorizontal, Boxes, ChevronRight, Building, Users, Shield, PackageOpen, Database } from 'lucide-react';

export function DashboardScreen({ currentUser, onNavigate }) {
  const hasSolicitar = currentUser?.roles?.includes('solicitar');
  const hasDespachar = currentUser?.roles?.includes('despachar');
  const isAdmin = currentUser?.username?.toLowerCase() === 'administrador';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2 pb-16">
      
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
          <div onClick={() => onNavigate('solicitar')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985]">
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
          <div onClick={() => onNavigate('recibir')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985]">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-5 group-hover:scale-105 transition-transform">
                <PackageOpen className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Sucursal</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">Recibir Pedido</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Confirma las cajas de transferencia enviadas desde la matriz y reporta faltantes.</p>
            </div>
          </div>
        )}

        {/* CARD 2: DESPACHAR PEDIDO */}
        {hasDespachar && (
          <div onClick={() => onNavigate('despachar')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-emerald-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[220px] active:scale-[0.985]">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-5 group-hover:scale-105 transition-transform">
                <Boxes className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Matriz / Bodega</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">Despachar Pedido</h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Revisa pedidos, surte productos físicos y agrega extras.</p>
            </div>
          </div>
        )}

        {/* CARD 3: ADMIN */}
        {isAdmin && (
          <div onClick={() => onNavigate('upload-catalog')} className="group relative bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px] active:scale-[0.985] sm:col-span-2">
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