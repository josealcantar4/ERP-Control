import React from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Clock,
  ShieldCheck,
  Package
} from 'lucide-react';

export function TransferDetailModal({ isOpen, solicitud, onClose }) {
  if (!isOpen || !solicitud) return null;

  const isCompleted = solicitud.estado === 'completada';
  const isReceived = solicitud.estado === 'recibida';
  const isIncomplete = solicitud.estado === 'recibida_incompleta';
  const isDraft = solicitud.estado === 'borrador';

  const formattedDate = solicitud.fecha
    ? new Date(solicitud.fecha).toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'Fecha no registrada';

  const totalItems = solicitud.items?.length || 0;
  const totalUnits = solicitud.items?.reduce(
    (acc, it) => acc + Number(it.cantidadDespachada || it.cantidadSolicitada || 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-100 max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0 bg-slate-50/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-extrabold text-slate-900 font-mono tracking-tight">
                {solicitud.folio || 'Sin Folio'}
              </span>

              {/* ESTADO PILL */}
              {isCompleted && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Despachada
                </span>
              )}
              {isReceived && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Recibida Completa
                </span>
              )}
              {isIncomplete && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Con Faltantes
                </span>
              )}
              {isDraft && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Borrador
                </span>
              )}
              {!isCompleted && !isReceived && !isIncomplete && !isDraft && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                  {solicitud.estado || 'Enviada'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formattedDate}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* METADATOS: ORIGEN Y DESTINO */}
        <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50/80 border-b border-slate-100 text-xs shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/60 space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Building2 className="w-3 h-3 text-blue-600" />
              Origen
            </span>
            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">
              {solicitud.sucursalOrigen || 'Sucursal'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              Por: {solicitud.usuarioSolicitante || 'N/A'}
            </p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/60 space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Package className="w-3 h-3 text-emerald-600" />
              Destino
            </span>
            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">
              {solicitud.areaDestino || 'Bodega Central'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              Para: {solicitud.usuarioDestino || 'N/A'}
            </p>
          </div>
        </div>

        {/* LISTA DE FALTANTES REPORTADOS SI EXISTEN */}
        {solicitud.reporteFaltantes && solicitud.reporteFaltantes.length > 0 && (
          <div className="p-4 bg-red-50/90 border-b border-red-100 text-xs text-red-800 space-y-2 shrink-0">
            <div className="flex items-center gap-1.5 font-bold text-red-900">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Inconsistencia Reportada en Sucursal:</span>
            </div>
            <div className="bg-white/80 rounded-xl p-2.5 border border-red-200 divide-y divide-red-100 text-xs">
              {solicitud.reporteFaltantes.map((f, i) => (
                <div key={i} className="py-1 flex items-center justify-between">
                  <span className="font-medium">{f.descripcion}</span>
                  <span className="font-mono font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                    Faltante: {f.cantidadDespachada || f.cantidadSolicitada} pz
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LISTADO DE MEDICAMENTOS */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Productos Despachados ({totalItems})</span>
            <span className="font-mono text-slate-500">{totalUnits} unidades totales</span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white">
            {solicitud.items?.map((item, index) => {
              const qty = item.cantidadDespachada ?? item.cantidadSolicitada ?? 0;
              return (
                <div key={index} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900">{item.descripcion}</span>
                      {item.esExtra && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                          EXTRA
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 block">
                      EAN: {item.codigo}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-xs bg-slate-100 px-2.5 py-1 rounded-xl text-slate-800">
                      {qty} pzas
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] leading-tight">
              {isCompleted || isReceived || isIncomplete
                ? 'Registro permanente: Transferencia cerrada e inmutable.'
                : 'Transferencia activa.'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-sm"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
