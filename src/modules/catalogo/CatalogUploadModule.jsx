import React, { useState, useEffect, useMemo } from 'react';
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
  HardDriveDownload,
  Search,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Tag
} from 'lucide-react';
import { catalogService } from './catalogService';
import { CleanProductModal } from './CleanProductModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { AutoScrollInput } from '../../shared/AutoScrollInput';
import { MarqueeText } from '../../shared/MarqueeText';

export function CatalogUploadModule({ currentUser, onBack }) {
  const activeUser = currentUser || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_current_user') || '{}') : {});
  const isRootAdmin = activeUser?.username?.toLowerCase() === 'administrador';
  const hasCatalogAccess = isRootAdmin || activeUser?.roles?.includes('catalogo');

  const [catalogStatus, setCatalogStatus] = useState({
    localCount: 0,
    cleanCount: 0,
    lastSync: null,
    lastModified: null,
    fileId: '',
    totalExcelRows: 0,
    duplicateCount: 0
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

  // Estado del Catálogo Limpio (Firestore)
  const [cleanItems, setCleanItems] = useState([]);
  const [cleanSearchQuery, setCleanSearchQuery] = useState('');
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [editingCleanItem, setEditingCleanItem] = useState(null);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);

  // Diálogo modal para confirmaciones
  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    variant: 'primary',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: null
  });

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  // Cargar estado inicial y reconciliar con Firestore
  const loadStatus = async () => {
    try {
      if (isRootAdmin) {
        const items = await catalogService.getCleanCatalogItems();
        setCleanItems(items);
      }

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

    // Suscripción reactiva en tiempo real al Catálogo Limpio (Exclusivo Administrador)
    let unsubscribe = null;
    if (isRootAdmin) {
      unsubscribe = catalogService.subscribeCleanCatalog((items) => {
        setCleanItems(items);
        setCatalogStatus(prev => ({ ...prev, cleanCount: items.length }));
      });
    }

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isRootAdmin]);

  // Forzar Sincronización Manual del Excel Central
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

      const dupText = result.duplicateCount > 0 ? ` (${result.duplicateCount} códigos duplicados colapsados)` : '';
      setFeedback({
        type: 'success',
        message: `Sincronización completada con éxito. Se indexaron ${result.totalRecords.toLocaleString()} productos únicos de ${result.totalExcelRows?.toLocaleString() || result.totalRecords} filas del Excel${dupText}.`
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

  // Guardar ID o URL personalizada del recurso central (Exclusivo Administrador)
  const handleSaveConfig = () => {
    if (!isRootAdmin) return;
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

  // Apertura de modales de producto limpio (Exclusivo Administrador)
  const handleOpenAddClean = () => {
    if (!isRootAdmin) return;
    setEditingCleanItem(null);
    setIsCleanModalOpen(true);
  };

  const handleOpenEditClean = (item) => {
    if (!isRootAdmin) return;
    setEditingCleanItem(item);
    setIsCleanModalOpen(true);
  };

  // Guardar o Actualizar producto limpio (Exclusivo Administrador)
  const handleSaveCleanProduct = async (codigo, descripcion) => {
    if (!isRootAdmin) return;
    if (editingCleanItem) {
      await catalogService.updateCleanCatalogItem(codigo, descripcion);
      setFeedback({
        type: 'success',
        message: `Producto "${codigo}" actualizado correctamente en el Catálogo Limpio.`
      });
    } else {
      await catalogService.saveToCleanCatalog(codigo, descripcion);
      setFeedback({
        type: 'success',
        message: `Producto "${codigo}" registrado exitosamente en el Catálogo Limpio.`
      });
    }
  };

  // Eliminar producto limpio con confirmación (Exclusivo Administrador)
  const handleDeleteCleanProduct = (item) => {
    if (!isRootAdmin) return;
    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar del Catálogo Limpio?',
      message: `¿Estás seguro de eliminar el producto "${item.codigo} - ${item.descripcion}"?\n\nEsta acción removerá el registro permanentemente del Catálogo Limpio y de la memoria local.`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        try {
          await catalogService.deleteFromCleanCatalog(item.codigo);
          setFeedback({
            type: 'success',
            message: `Producto "${item.codigo}" eliminado del Catálogo Limpio.`
          });
        } catch (err) {
          console.error('Error eliminando producto:', err);
          setFeedback({
            type: 'error',
            message: 'No fue posible eliminar el producto del Catálogo Limpio.'
          });
        }
      }
    });
  };

  const handleSyncFromHistory = () => {
    if (!isRootAdmin) return;
    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'primary',
      title: 'Alimentar Catálogo Limpio desde Historial',
      message: '¿Deseas escanear todas las solicitudes, extras y despachos directos registrados para incorporar automáticamente todos sus productos al Catálogo Limpio?',
      confirmText: 'Escanear e Incorporar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        setIsHistorySyncing(true);
        try {
          const status = await catalogService.syncFromOperationsHistory();
          if (status) {
            setCatalogStatus(status);
            const items = await catalogService.getCleanCatalogItems();
            setCleanItems(items);
            setFeedback({
              type: 'success',
              message: `Catálogo Limpio actualizado exitosamente con ${status.cleanCount.toLocaleString()} productos de operaciones reales.`
            });
          }
        } catch (e) {
          console.error('Error sincronizando desde historial:', e);
          setFeedback({
            type: 'error',
            message: 'No fue posible completar la sincronización desde el historial.'
          });
        } finally {
          setIsHistorySyncing(false);
        }
      }
    });
  };

  // Filtro de búsqueda en tiempo real
  const filteredCleanItems = useMemo(() => {
    const q = cleanSearchQuery.trim().toLowerCase();
    if (!q) return cleanItems;
    return cleanItems.filter(it => {
      const cod = String(it.codigo || '').toLowerCase();
      const desc = String(it.descripcion || '').toLowerCase();
      return cod.includes(q) || desc.includes(q);
    });
  }, [cleanItems, cleanSearchQuery]);

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

  if (!hasCatalogAccess) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4 animate-fade-in select-none">
        <div className="w-16 h-16 rounded-3xl bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-sm">
          <Database className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acceso Restringido</h2>
        <p className="text-xs sm:text-sm text-slate-500">
          No cuentas con el rol asignado para sincronizar el Catálogo Central. Solicita este rol a un administrador para ingresar.
        </p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold transition-all shadow-md cursor-pointer"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 select-none">
      
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

          {/* Configuración avanzada (Solo visible y editable por el usuario Administrador) */}
          {isRootAdmin && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="self-start sm:self-auto p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              title="Configuración avanzada del recurso central"
            >
              <Settings2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* CONFIGURACIÓN AVANZADA COLAPSABLE (Solo visible y editable por el usuario Administrador) */}
        {isRootAdmin && showConfig && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Identificador del Recurso Central</span>
              <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">Exclusivo Administrador</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customFileId}
                onChange={(e) => setCustomFileId(e.target.value)}
                placeholder="ID o enlace del archivo en Google Drive"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveConfig}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        )}

        {/* TARJETAS DE ESTADO */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isRootAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
          
          {/* Tarjeta 1: Productos Locales Base */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Catálogo Base</span>
            </div>
            <div className="text-xl font-mono font-bold text-slate-900">
              {catalogStatus.localCount.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-400">
              {catalogStatus.totalExcelRows > 0
                ? `${catalogStatus.localCount.toLocaleString()} únicos (${catalogStatus.totalExcelRows.toLocaleString()} filas)`
                : 'Productos indexados'}
            </p>
          </div>

          {/* Tarjeta 2: Catálogo Limpio (Solo visible para el usuario Administrador) */}
          {isRootAdmin && (
            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                <span>Catálogo Limpio</span>
              </div>
              <div className="text-xl font-mono font-bold text-slate-900">
                {catalogStatus.cleanCount.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400">
                Productos validados
              </p>
            </div>
          )}

          {/* Tarjeta 3: Última Sincronización */}
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

          {/* Tarjeta 4: Estado Servidor Central */}
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
                <span className="text-slate-400">Verificando en Drive...</span>
              ) : serverState === 'up_to_date' ? (
                <span className="text-emerald-700">Actualizado</span>
              ) : serverState === 'server_updated' ? (
                <span className="text-blue-600">Nueva versión en Drive</span>
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
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-medium animate-fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <p>{feedback.message}</p>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold px-2 py-1"
            >
              &times;
            </button>
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
                  {syncProgress.totalRecords?.toLocaleString()} productos procesados
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
              Descarga la versión más reciente del archivo desde el Servidor Central y reconstruye el índice local de productos en este dispositivo.
            </p>
          </div>
        )}

      </div>

      {/* SECCIÓN: GESTIÓN DEL CATÁLOGO LIMPIO (Exclusivo Administrador) */}
      {isRootAdmin && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
          
          {/* Cabecera de la sección */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Catálogo Limpio
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    {cleanItems.length} {cleanItems.length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Catálogo validado automáticamente en operaciones reales (solicitudes, extras y despachos).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                onClick={handleSyncFromHistory}
                disabled={isHistorySyncing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="Escanear historial de solicitudes y despachos para registrar productos"
              >
                <HardDriveDownload className={`w-4 h-4 text-emerald-600 ${isHistorySyncing ? 'animate-bounce' : ''}`} />
                <span>{isHistorySyncing ? 'Alimentando...' : 'Alimentar desde Historial'}</span>
              </button>
              <button
                onClick={handleOpenAddClean}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Producto</span>
              </button>
            </div>
          </div>

          {/* Barra de Búsqueda con AutoScroll y Carrusel */}
          <div>
            <AutoScrollInput
              type="text"
              value={cleanSearchQuery}
              onChange={(e) => setCleanSearchQuery(e.target.value)}
              placeholder="Buscar en el catálogo limpio por código o descripción..."
              icon={Search}
              onClear={() => setCleanSearchQuery('')}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Listado de Productos Limpios */}
          {cleanItems.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-bold text-slate-700">
                  Catálogo Limpio Vacío (0 Registros)
                </h3>
                <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                  El Catálogo Limpio reúne los productos validados que se solicitan, se envían como extras o se despachan directamente, eliminando el ruido y registros obsoletos del catálogo general.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={handleSyncFromHistory}
                  disabled={isHistorySyncing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                >
                  <HardDriveDownload className="w-3.5 h-3.5" />
                  <span>{isHistorySyncing ? 'Alimentando...' : 'Alimentar desde Historial de Pedidos'}</span>
                </button>
                <button
                  onClick={handleOpenAddClean}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar producto manual</span>
                </button>
              </div>
            </div>
          ) : filteredCleanItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
              No se encontraron productos limpios que coincidan con "{cleanSearchQuery}".
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filteredCleanItems.map((item) => (
                <div
                  key={item.codigo}
                  className="p-3.5 bg-slate-50/90 hover:bg-slate-100/80 rounded-2xl border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span className="shrink-0 inline-flex items-center gap-1 bg-white border border-slate-200/90 text-slate-800 font-mono text-[11px] font-bold px-2.5 py-1 rounded-xl shadow-2xs">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      {item.codigo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <MarqueeText
                        text={item.descripcion}
                        className="text-xs font-semibold text-slate-900 block"
                      />
                      {item.updatedAt && (
                        <p className="text-[10px] text-slate-400">
                          Actualizado: {formatDate(item.updatedAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => handleOpenEditClean(item)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                      title="Editar descripción"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCleanProduct(item)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      title="Eliminar producto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* MODAL PARA AGREGAR / EDITAR PRODUCTO LIMPIO (Exclusivo Administrador) */}
      {isRootAdmin && (
        <CleanProductModal
          isOpen={isCleanModalOpen}
          item={editingCleanItem}
          onClose={() => setIsCleanModalOpen(false)}
          onSave={handleSaveCleanProduct}
        />
      )}

      {/* MODAL DIALOG PARA CONFIRMACIONES Y ALERTAS */}
      <ModalDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        variant={dialog.variant}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={closeDialog}
      />

    </div>
  );
}
