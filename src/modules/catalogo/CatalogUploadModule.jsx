import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Database,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Layers,
  Settings2,
  HardDriveDownload
} from 'lucide-react';
import { catalogService } from './catalogService';

export function CatalogUploadModule({ onBack }) {
  const [catalogStatus, setCatalogStatus] = useState({
    localCount: 0,
    cleanCount: 0,
    lastSync: null,
    lastModified: null,
    fileId: ''
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [serverState, setServerState] = useState('checking'); // 'up_to_date' | 'server_updated' | 'offline' | 'checking'
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({
    percent: 0,
    currentBatch: 0,
    totalBatches: 0,
    message: '',
    totalRecords: 0
  });
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message }
  const [showConfig, setShowConfig] = useState(false);
  const [customFileId, setCustomFileId] = useState('');

  // Cargar estado inicial del catálogo
  const loadStatus = async () => {
    try {
      const status = await catalogService.getCatalogStatus();
      setCatalogStatus(status);
      setCustomFileId(status.fileId);

      // Verificación no intrusiva con el servidor
      setIsVerifying(true);
      const versionCheck = await catalogService.checkServerCatalogVersion();
      if (versionCheck.offline) {
        setServerState('offline');
      } else if (versionCheck.upToDate) {
        setServerState('up_to_date');
      } else {
        setServerState('server_updated');
      }
    } catch (err) {
      console.warn('Error al verificar estado:', err);
      setServerState('offline');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Forzar Sincronización Manual
  const handleForceSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    setSyncProgress({
      percent: 5,
      currentBatch: 0,
      totalBatches: 0,
      message: 'Iniciando sincronización con el Servidor Central...',
      totalRecords: 0
    });

    try {
      const result = await catalogService.syncCatalogFromServer((status) => {
        setSyncProgress(status);
      });

      setFeedback({
        type: 'success',
        message: `Sincronización completada con éxito. Se indexaron ${result.totalRecords.toLocaleString()} medicamentos.`
      });
      await loadStatus();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al conectar con el Servidor Central. Verifica tu conexión de red.'
      });
    } finally {
      setIsSyncing(false);
    }
  };


// Guardar ID o URL personalizada del recurso central
  const handleSaveConfig = () => {
    if (!customFileId.trim()) return;
    let clean = customFileId.trim();

    // Solo extrae ID si NO es una URL completa que empieza con http(s)
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      const matchId = clean.match(/\/d\/([a-zA-Z0-9_-]+)/) || clean.match(/id=([a-zA-Z0-9_-]+)/);
      if (matchId && matchId[1]) {
        clean = matchId[1];
      }
    }

    catalogService.setCatalogFileId(clean);
    setShowConfig(false);
    setFeedback({
      type: 'success',
      message: 'Identificador o enlace del Servidor Central actualizado correctamente.'
    });
    loadStatus();
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Nunca sincronizado';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 select-none">
      
      {/* BOTÓN VOLVER */}
      <button
        onClick={onBack}
        disabled={isSyncing}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3.5 py-1.5 rounded-full border border-slate-200/80 shadow-sm transition-all cursor-pointer disabled:opacity-50"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Volver al Dashboard</span>
      </button>

      {/* ENCABEZADO PRINCIPAL */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Database className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Administración &bull; Base de Datos
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Sincronización del Catálogo Central
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Almacenamiento local ultrarrápido con actualización inteligente en la nube.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="self-start sm:self-auto p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
            title="Configuración avanzada"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>

        {/* CONFIGURACIÓN AVANZADA COLAPSABLE */}
        {showConfig && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Identificador del Recurso Central</span>
              <span className="text-[10px] text-slate-400 font-normal">Solo administradores</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customFileId}
                onChange={(e) => setCustomFileId(e.target.value)}
                placeholder="ID o identificador del archivo"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveConfig}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        )}

        {/* TARJETAS DE ESTADO */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Tarjeta 1: Medicamentos Locales */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Memoria Local</span>
            </div>
            <div className="text-xl font-mono font-bold text-slate-900">
              {catalogStatus.localCount.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-400">Medicamentos indexados</p>
          </div>

          {/* Tarjeta 2: Última Sincronización */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Última Sincro</span>
            </div>
            <div className="text-xs font-bold text-slate-800 truncate">
              {formatDate(catalogStatus.lastSync)}
            </div>
            <p className="text-[10px] text-slate-400">En este navegador</p>
          </div>

          {/* Tarjeta 3: Estado Servidor Central */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              {serverState === 'offline' ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>Servidor Central</span>
            </div>
            <div className="text-xs font-bold">
              {isVerifying ? (
                <span className="text-slate-400">Verificando...</span>
              ) : serverState === 'up_to_date' ? (
                <span className="text-emerald-700">Actualizado</span>
              ) : serverState === 'server_updated' ? (
                <span className="text-blue-600">Nueva versión</span>
              ) : (
                <span className="text-amber-600">Sin conexión</span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              {serverState === 'up_to_date'
                ? 'Coincide con la nube'
                : serverState === 'server_updated'
                ? 'Disponible para descarga'
                : 'Trabajando en local'}
            </p>
          </div>

        </div>

        {/* FEEDBACK BANNER */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <p>{feedback.message}</p>
          </div>
        )}

        {/* TARJETA DE PROGRESO ACTIVO */}
        {isSyncing && (
          <div className="p-5 bg-slate-50 border border-blue-200/70 rounded-2xl space-y-3 text-left">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                <span>{syncProgress.message || 'Sincronizando...'}</span>
              </div>
              <span className="font-mono text-blue-600">{syncProgress.percent}%</span>
            </div>

            <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${syncProgress.percent}%` }}
              ></div>
            </div>

            {syncProgress.totalBatches > 0 && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span className="inline-flex items-center gap-1 font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                  <Layers className="w-3 h-3" />
                  Lote {syncProgress.currentBatch} de {syncProgress.totalBatches}
                </span>
                <span className="text-[10px] text-slate-400">
                  {syncProgress.totalRecords?.toLocaleString()} medicamentos procesados
                </span>
              </div>
            )}
          </div>
        )}

        {/* ACCIÓN PRINCIPAL: FORZAR SINCRONIZACIÓN MANUAL */}
        {!isSyncing && (
          <div className="space-y-3 pt-2">
            <button
              onClick={handleForceSync}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2.5 active:scale-[0.99]"
            >
              <HardDriveDownload className="w-5 h-5" />
              <span>Forzar Sincronización Manual</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Descarga la versión más reciente del archivo desde el Servidor Central y reconstruye el índice local de medicamentos en este dispositivo.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
