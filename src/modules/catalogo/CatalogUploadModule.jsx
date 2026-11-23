/**
 * Módulo de administración del catálogo que permite forzar la sincronización del archivo central y gestionar el catálogo limpio.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft,
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
  Tag,
  ChevronDown,
  Loader2,
  Link2,
  ArrowRight
} from 'lucide-react';
import { catalogService, CATALOG_FILE_ID_REGEX, isValidCatalogFileId } from './catalogService';
import { CleanProductModal } from './CleanProductModal';
import { RelatedCodeModal } from './RelatedCodeModal';
import { ModalDialog } from '../../shared/ModalDialog';
import { MarqueeText } from '../../shared/MarqueeText';
import { MarqueeSearchInput, FloatingInput, playSuccessSound, transitionView } from '../../shared';

export function CatalogUploadModule({ currentUser, onBack }) {
  const activeUser = currentUser || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_current_user') || '{}') : {});
  const isRootAdmin = activeUser?.username?.toLowerCase() === 'administrador';
  const hasCatalogAccess = isRootAdmin || activeUser?.roles?.includes('catalogo');

  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('erp_catalog_active_tab') || 'sincronizacion';
    if (saved === 'limpio' && !isRootAdmin) return 'sincronizacion';
    return saved;
  });
  const [tabDirection, setTabDirection] = useState('initial');

  const TAB_ORDER = useMemo(() => {
    return isRootAdmin
      ? ['sincronizacion', 'limpio', 'relacionados']
      : ['sincronizacion', 'relacionados'];
  }, [isRootAdmin]);

  const handleSwitchTab = (newTab) => {
    if (newTab === activeTab) return;
    const oldIdx = TAB_ORDER.indexOf(activeTab);
    const newIdx = TAB_ORDER.indexOf(newTab);
    const direction = newIdx >= oldIdx ? 'forward' : 'back';
    setTabDirection(direction);
    transitionView(() => {
      setActiveTab(newTab);
    }, { direction });
  };

  const getTabAnimationClass = () => {
    if (tabDirection === 'initial') return 'animate-fade-in';
    return tabDirection === 'forward' ? 'animate-tab-slide-right' : 'animate-tab-slide-left';
  };

  useEffect(() => {
    localStorage.setItem('erp_catalog_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isRootAdmin && activeTab === 'limpio') {
      setActiveTab('sincronizacion');
    }
  }, [isRootAdmin, activeTab]);

  const [catalogStatus, setCatalogStatus] = useState({
    localCount: 0,
    cleanCount: 0,
    relatedCount: 0,
    lastSync: null,
    lastModified: null,
    fileId: '',
    totalExcelRows: 0,
    duplicateCount: 0
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [serverState, setServerState] = useState('checking');
  const [feedback, setFeedback] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [customFileId, setCustomFileId] = useState('');
  const [configError, setConfigError] = useState('');

  const [cleanItems, setCleanItems] = useState([]);
  const [cleanSearchQuery, setCleanSearchQuery] = useState('');
  const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);
  const [editingCleanItem, setEditingCleanItem] = useState(null);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);

  const [relatedItems, setRelatedItems] = useState([]);
  const [relatedSearchQuery, setRelatedSearchQuery] = useState('');
  const [isRelatedModalOpen, setIsRelatedModalOpen] = useState(false);
  const [editingRelatedItem, setEditingRelatedItem] = useState(null);
  const [relatedItemsLimit, setRelatedItemsLimit] = useState(15);
  const [isLoadingMoreRelated, setIsLoadingMoreRelated] = useState(false);
  const relatedSentinelRef = useRef(null);

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

  useEffect(() => {
    if (feedback && feedback.type === 'success') {
      playSuccessSound();
    }
  }, [feedback]);

  const handleForceSync = () => {
    setFeedback(null);
    window.dispatchEvent(new CustomEvent('erp_trigger_catalog_sync', { detail: { force: true } }));
  };

  const loadStatus = useCallback(async () => {
    try {
      if (isRootAdmin) {
        const items = await catalogService.getCleanCatalogItems();
        setCleanItems(items);
      }

      const rels = await catalogService.getRelatedCodes();
      setRelatedItems(rels);

      const status = await catalogService.getCatalogStatus();
      setCatalogStatus(status);
      setCustomFileId(status.fileId);

      setIsVerifying(true);
      const versionCheck = await catalogService.checkServerCatalogVersion();
      if (versionCheck.offline) {
        setServerState('offline');
      } else if (versionCheck.upToDate) {
        setServerState('up_to_date');
      } else {
        setServerState('server_updated');
        window.dispatchEvent(new CustomEvent('erp_trigger_catalog_sync', { detail: { force: false } }));
      }
    } catch (err) {
      console.warn('Error al verificar estado:', err);
      setServerState('offline');
    } finally {
      setIsVerifying(false);
    }
  }, [isRootAdmin]);

  useEffect(() => {
    loadStatus();

    let unsubscribe = null;
    if (isRootAdmin) {
      unsubscribe = catalogService.subscribeCleanCatalog((items) => {
        setCleanItems(items);
        setCatalogStatus(prev => ({ ...prev, cleanCount: items.length }));
      });
    }

    const unsubRelated = catalogService.subscribeRelatedCodes((items) => {
      setRelatedItems(items);
      setCatalogStatus(prev => ({ ...prev, relatedCount: items.length }));
    });

    const handleGlobalSync = async (e) => {
      setServerState('up_to_date');
      const status = await catalogService.getCatalogStatus();
      setCatalogStatus(status);
      const totalRecs = e.detail?.totalRecords;
      setFeedback({
        type: 'success',
        message: `Catálogo sincronizado exitosamente (${totalRecs ? totalRecs.toLocaleString() : '30,225'} productos indexados).`
      });
    };
    window.addEventListener('erp_catalog_synced', handleGlobalSync);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if (typeof unsubRelated === 'function') {
        unsubRelated();
      }
      window.removeEventListener('erp_catalog_synced', handleGlobalSync);
    };
  }, [isRootAdmin, loadStatus]);

  const handleSaveConfig = () => {
    if (!isRootAdmin) return;
    const clean = String(customFileId || '').trim();
    const lowerClean = clean.toLowerCase();

    if (!clean) {
      const msg = 'Por favor ingresa el ID del archivo de Google Drive.';
      setConfigError(msg);
      setFeedback({ type: 'error', message: msg });
      return;
    }

    if (
      lowerClean.includes('http://') ||
      lowerClean.includes('https://') ||
      clean.includes('..') ||
      clean.includes('/') ||
      clean.includes('\\')
    ) {
      const msg =
        'No se permiten URLs completas ni rutas relativas. Ingresa únicamente el ID del archivo de Google Drive.';
      setConfigError(msg);
      setFeedback({ type: 'error', message: msg });
      return;
    }

    if (!CATALOG_FILE_ID_REGEX.test(clean) || !isValidCatalogFileId(clean)) {
      const msg =
        'Identificador inválido. Debe contener solo entre 25 y 45 caracteres (letras, números, "-" o "_"), sin espacios ni caracteres especiales.';
      setConfigError(msg);
      setFeedback({ type: 'error', message: msg });
      return;
    }

    try {
      catalogService.setCatalogFileId(clean);
      setConfigError('');
      setShowConfig(false);
      setFeedback({
        type: 'success',
        message: 'Identificador de Google Drive actualizado correctamente.'
      });
      loadStatus();
    } catch (err) {
      const msg = err.message || 'El identificador ingresado no es válido.';
      setConfigError(msg);
      setFeedback({ type: 'error', message: msg });
    }
  };

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

  const filteredCleanItems = useMemo(() => {
    const q = cleanSearchQuery.trim().toLowerCase();
    if (!q) return cleanItems;
    return cleanItems.filter(it => {
      const cod = String(it.codigo || '').toLowerCase();
      const desc = String(it.descripcion || '').toLowerCase();
      return cod.includes(q) || desc.includes(q);
    });
  }, [cleanItems, cleanSearchQuery]);

  const [cleanItemsLimit, setCleanItemsLimit] = useState(15);
  const [isLoadingMoreClean, setIsLoadingMoreClean] = useState(false);
  const cleanSentinelRef = useRef(null);

  const visibleCleanItems = useMemo(() => {
    return filteredCleanItems.slice(0, cleanItemsLimit);
  }, [filteredCleanItems, cleanItemsLimit]);

  const hasMoreClean = visibleCleanItems.length < filteredCleanItems.length;

  const handleLoadMoreClean = useCallback(() => {
    if (isLoadingMoreClean) return;
    setIsLoadingMoreClean(true);
    setTimeout(() => {
      setCleanItemsLimit(prev => prev + 15);
      setIsLoadingMoreClean(false);
    }, 250);
  }, [isLoadingMoreClean]);

  const handleCleanSearchChange = (val) => {
    setCleanSearchQuery(val);
    setCleanItemsLimit(15);
  };

  useEffect(() => {
    if (!hasMoreClean || isLoadingMoreClean) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        handleLoadMoreClean();
      }
    }, { rootMargin: '120px' });

    const el = cleanSentinelRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasMoreClean, isLoadingMoreClean, handleLoadMoreClean]);

  const filteredRelatedItems = useMemo(() => {
    const q = relatedSearchQuery.trim().toLowerCase();
    if (!q) return relatedItems;
    return relatedItems.filter(it => {
      const cod = String(it.codigo || '').toLowerCase();
      const maestro = String(it.codigoMaestro || '').toLowerCase();
      const desc = String(it.descripcion || '').toLowerCase();
      const notas = String(it.notas || '').toLowerCase();
      return cod.includes(q) || maestro.includes(q) || desc.includes(q) || notas.includes(q);
    });
  }, [relatedItems, relatedSearchQuery]);

  const visibleRelatedItems = useMemo(() => {
    return filteredRelatedItems.slice(0, relatedItemsLimit);
  }, [filteredRelatedItems, relatedItemsLimit]);

  const hasMoreRelated = visibleRelatedItems.length < filteredRelatedItems.length;

  const handleLoadMoreRelated = useCallback(() => {
    if (isLoadingMoreRelated) return;
    setIsLoadingMoreRelated(true);
    setTimeout(() => {
      setRelatedItemsLimit(prev => prev + 15);
      setIsLoadingMoreRelated(false);
    }, 250);
  }, [isLoadingMoreRelated]);

  const handleRelatedSearchChange = (val) => {
    setRelatedSearchQuery(val);
    setRelatedItemsLimit(15);
  };

  useEffect(() => {
    if (!hasMoreRelated || isLoadingMoreRelated) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        handleLoadMoreRelated();
      }
    }, { rootMargin: '120px' });

    const el = relatedSentinelRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasMoreRelated, isLoadingMoreRelated, handleLoadMoreRelated]);

  const handleOpenAddRelated = () => {
    setEditingRelatedItem(null);
    setIsRelatedModalOpen(true);
  };

  const handleOpenEditRelated = (item) => {
    setEditingRelatedItem(item);
    setIsRelatedModalOpen(true);
  };

  const handleOpenAddAnotherRelated = (item) => {
    setEditingRelatedItem({
      codigoMaestro: item.codigoMaestro,
      descripcion: item.descripcion,
      isAddingToExistingMaster: true
    });
    setIsRelatedModalOpen(true);
  };

  const handleSaveRelatedCode = async (payload) => {
    const saved = await catalogService.saveRelatedCodes(payload, activeUser);
    const updated = await catalogService.getRelatedCodes();
    setRelatedItems(updated);
    setCatalogStatus(prev => ({ ...prev, relatedCount: updated.length }));
    const count = Array.isArray(saved) ? saved.length : 1;
    setFeedback({
      type: 'success',
      message: `${count === 1 ? 'Código relacionado vinculado' : `${count} códigos relacionados vinculados`} exitosamente a "${payload.descripcion}".`
    });
  };

  const handleDeleteRelatedCode = (item) => {
    if (!isRootAdmin) {
      setDialog({
        isOpen: true,
        type: 'alert',
        variant: 'warning',
        title: 'Acceso Restringido',
        message: 'Solo el usuario Administrador tiene autorización para eliminar códigos relacionados.',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }

    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar Código Relacionado?',
      message: `¿Estás seguro de eliminar el código relacionado "${item.codigo}" vinculado a "${item.descripcion}"?\n\nAl eliminarlo, este código ya no se reconocerá automáticamente como equivalente del producto maestro.`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        try {
          await catalogService.deleteRelatedCode(item.codigo, activeUser);
          const updated = await catalogService.getRelatedCodes();
          setRelatedItems(updated);
          setCatalogStatus(prev => ({ ...prev, relatedCount: updated.length }));
          setFeedback({
            type: 'success',
            message: `Código relacionado "${item.codigo}" eliminado con éxito.`
          });
        } catch (err) {
          console.error('Error eliminando código relacionado:', err);
          setFeedback({
            type: 'error',
            message: err.message || 'No fue posible eliminar el código relacionado.'
          });
        }
      }
    });
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
      
      <div className="sticky top-16 z-30 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 pt-2 pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <button
            onClick={onBack}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Dashboard</span>
          </button>

          <div className={`bg-slate-200/80 dark:bg-slate-800 p-1 rounded-full grid ${isRootAdmin ? 'grid-cols-3' : 'grid-cols-2'} sm:flex text-xs font-medium border border-transparent dark:border-slate-700/60 w-full sm:w-auto shrink-0`}>
            <button
              type="button"
              onClick={() => handleSwitchTab('sincronizacion')}
              className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-full text-center whitespace-nowrap truncate transition-all cursor-pointer ${
                activeTab === 'sincronizacion'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold dark:bg-slate-900 dark:text-white dark:border dark:border-slate-700'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Sincronización
            </button>
            {isRootAdmin && (
              <button
                type="button"
                onClick={() => handleSwitchTab('limpio')}
                className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-full text-center whitespace-nowrap truncate transition-all cursor-pointer ${
                  activeTab === 'limpio'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold dark:bg-slate-900 dark:text-white dark:border dark:border-slate-700'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span className="hidden sm:inline">Catálogo </span>Limpio ({cleanItems.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSwitchTab('relacionados')}
              className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-full text-center whitespace-nowrap truncate transition-all cursor-pointer ${
                activeTab === 'relacionados'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold dark:bg-slate-900 dark:text-white dark:border dark:border-slate-700'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <span className="hidden sm:inline">Códigos </span>Relacionados ({relatedItems.length})
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'sincronizacion' && (
        <div
          key="tab-sincronizacion"
          className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6 ${getTabAnimationClass()}`}
        >
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Database className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                Administración &bull; Base de Datos
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Sincronización del Catálogo Central
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Almacenamiento local ultrarrápido con actualización inteligente en la nube.
              </p>
            </div>
          </div>

          {isRootAdmin && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="self-start sm:self-auto p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Configuración avanzada del recurso central"
            >
              <Settings2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {isRootAdmin && showConfig && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 pb-1">
              <span>Configuración del Archivo Fuente</span>
              <span className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-full">Exclusivo Administrador</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <FloatingInput
                  label="ID del Archivo en Google Drive"
                  value={customFileId}
                  onChange={(e) => {
                    setCustomFileId(e.target.value);
                    if (configError) setConfigError('');
                  }}
                  placeholder="Ej. 1BKAflq-3XwRVvRngQXxYXpSRBDPbcQom"
                  className="font-mono text-xs"
                  error={configError}
                />
              </div>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="bg-slate-900 dark:bg-blue-600 dark:hover:bg-blue-500 text-white px-4 py-3 rounded-2xl text-xs font-bold hover:bg-slate-800 cursor-pointer transition-colors shrink-0 shadow-sm"
              >
                Guardar
              </button>
            </div>
            {configError && (
              <p className="text-[11px] font-medium text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{configError}</span>
              </p>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isRootAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
          
          <div className="bg-slate-50/80 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Catálogo Base</span>
            </div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {catalogStatus.localCount.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-400">
              {catalogStatus.totalExcelRows > 0
                ? `${catalogStatus.localCount.toLocaleString()} únicos (${catalogStatus.totalExcelRows.toLocaleString()} filas)`
                : 'Productos indexados'}
            </p>
          </div>

          {isRootAdmin && (
            <div className="bg-slate-50/80 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                <span>Catálogo Limpio</span>
              </div>
              <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
                {catalogStatus.cleanCount.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400">
                Productos validados
              </p>
            </div>
          )}

          <div className="bg-slate-50/80 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">
              <Link2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Códigos Relacionados</span>
            </div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {(catalogStatus.relatedCount ?? relatedItems.length).toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-400">
              Códigos alternos activos
            </p>
          </div>

          <div className="bg-slate-50/80 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Última Sincro</span>
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={formatDate(catalogStatus.lastSync)}>
              {formatDate(catalogStatus.lastSync)}
            </div>
            <p className="text-[10px] text-slate-400 truncate" title={catalogStatus.lastModified ? `Edición archivo: ${formatDate(catalogStatus.lastModified)}` : 'En este navegador'}>
              {catalogStatus.lastModified ? `Archivo: ${formatDate(catalogStatus.lastModified)}` : 'En este navegador'}
            </p>
          </div>

          <div className="bg-slate-50/80 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">
              {serverState === 'offline' ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>Servidor Central</span>
            </div>
            <div className="text-xs font-bold">
              {isVerifying ? (
                <span className="text-slate-400">Verificando en Servidor Central...</span>
              ) : serverState === 'up_to_date' ? (
                <span className="text-emerald-700 dark:text-emerald-400">Actualizado</span>
              ) : serverState === 'server_updated' ? (
                <span className="text-blue-600 dark:text-blue-400">Nueva versión en Servidor Central</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Sin conexión</span>
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

        <div className="space-y-3 pt-2">
          <button
            onClick={handleForceSync}
            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2.5 active:scale-[0.99]"
          >
            <HardDriveDownload className="w-5 h-5" />
            <span>Forzar Sincronización Manual</span>
          </button>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
            Descarga la versión más reciente del archivo desde el Servidor Central y reconstruye el índice local de productos visiblemente en pantalla para todos los usuarios.
          </p>
        </div>

      </div>
      )}

      {activeTab === 'limpio' && isRootAdmin && (
        <div
          key="tab-limpio"
          className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6 ${getTabAnimationClass()}`}
        >
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Catálogo Limpio
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                    {cleanItems.length} {cleanItems.length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Catálogo validado automáticamente en operaciones reales (solicitudes, extras y despachos).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={handleSyncFromHistory}
                disabled={isHistorySyncing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="Escanear transferencias pasadas para agregar productos al catálogo limpio"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>{isHistorySyncing ? 'Sincronizando...' : 'Alimentar de Historial'}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenAddClean}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Producto</span>
              </button>
            </div>
          </div>

          <div>
            <MarqueeSearchInput
              label="Buscar en catálogo limpio"
              value={cleanSearchQuery}
              onChange={(e) => handleCleanSearchChange(e.target.value)}
              placeholder="Buscar en el catálogo limpio por código o descripción..."
              icon={Search}
              onClear={() => handleCleanSearchChange('')}
            />
          </div>

          {cleanItems.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                  Catálogo Limpio Vacío (0 Registros)
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  El Catálogo Limpio reúne los productos validados que se solicitan, se envían como extras o se despachan directamente, eliminando el ruido y registros obsoletos del catálogo general.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={handleOpenAddClean}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar producto manual</span>
                </button>
              </div>
            </div>
          ) : filteredCleanItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
              No se encontraron productos limpios que coincidan con "{cleanSearchQuery}".
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {visibleCleanItems.map((item) => (
                <div
                  key={item.codigo}
                  className="p-3.5 bg-slate-50/90 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span className="shrink-0 inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-bold px-2.5 py-1 rounded-xl shadow-2xs">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      {item.codigo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <MarqueeText
                        text={item.descripcion}
                        className="text-xs font-semibold text-slate-900 dark:text-white block"
                      />
                      {item.updatedAt && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          Actualizado: {formatDate(item.updatedAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => handleOpenEditClean(item)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl transition-colors cursor-pointer"
                      title="Editar descripción"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCleanProduct(item)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-xl transition-colors cursor-pointer"
                      title="Eliminar producto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
                <span>Mostrando {visibleCleanItems.length} de {filteredCleanItems.length} productos</span>
              </div>

              {hasMoreClean && (
                <div ref={cleanSentinelRef} className="pt-1 pb-2 text-center">
                  <button
                    type="button"
                    disabled={isLoadingMoreClean}
                    onClick={handleLoadMoreClean}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                  >
                    {isLoadingMoreClean ? (
                      <>
                        <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                        <span>Cargando más productos...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                        <span>Cargar más productos</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Sección Códigos Relacionados (Alternos) */}
      {activeTab === 'relacionados' && (
        <div
          key="tab-relacionados"
          className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-6 ${getTabAnimationClass()}`}
        >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Códigos Relacionados
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300">
                  {relatedItems.length} {relatedItems.length === 1 ? 'código' : 'códigos'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vincula códigos de barras alternos a productos del catálogo maestro para que el escáner los reconozca al surtir y solicitar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={handleOpenAddRelated}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Relacionar Código</span>
            </button>
          </div>
        </div>

        <div>
          <MarqueeSearchInput
            label="Buscar códigos relacionados"
            value={relatedSearchQuery}
            onChange={(e) => handleRelatedSearchChange(e.target.value)}
            placeholder="Buscar por código relacionado, código maestro o descripción..."
            icon={Search}
            onClear={() => handleRelatedSearchChange('')}
          />
        </div>

        {relatedItems.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 flex items-center justify-center mx-auto">
              <Link2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                Sin Códigos Relacionados (0 Registros)
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                Relaciona códigos de barras de nuevas presentaciones o variantes de laboratorio para que el escáner los identifique automáticamente con su producto maestro oficial.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
              <button
                onClick={handleOpenAddRelated}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Relacionar primer código</span>
              </button>
            </div>
          </div>
        ) : filteredRelatedItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
            No se encontraron códigos relacionados que coincidan con "{relatedSearchQuery}".
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {visibleRelatedItems.map((item) => (
              <div
                key={item.codigo}
                className="p-3.5 bg-slate-50/90 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Código Relacionado */}
                    <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-mono text-[11px] font-bold px-2.5 py-1 rounded-xl shadow-2xs">
                      <Tag className="w-3 h-3 text-indigo-500" />
                      {item.codigo}
                    </span>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200/60 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                      Relacionado
                    </span>

                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                    {/* Código Maestro */}
                    <span className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold px-2 py-1 rounded-xl shadow-2xs">
                      <Database className="w-3 h-3 text-emerald-600" />
                      {item.codigoMaestro}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200/60 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                      Maestro
                    </span>
                  </div>

                  {/* Descripción */}
                  <div className="min-w-0">
                    <MarqueeText
                      text={item.descripcion}
                      className="text-xs font-semibold text-slate-900 dark:text-white block"
                    />
                  </div>

                  {/* Notas o fechas */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 dark:text-slate-500">
                    {item.notas && (
                      <span className="text-slate-500 dark:text-slate-400 italic">
                        "{item.notas}"
                      </span>
                    )}
                    {item.updatedAt && (
                      <span>Actualizado: {formatDate(item.updatedAt)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  <button
                    onClick={() => handleOpenAddAnotherRelated(item)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition-colors cursor-pointer"
                    title="Vincular otro código alterno a este mismo producto maestro"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditRelated(item)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition-colors cursor-pointer"
                    title="Editar código relacionado"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {isRootAdmin && (
                    <button
                      onClick={() => handleDeleteRelatedCode(item)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-xl transition-colors cursor-pointer"
                      title="Eliminar código relacionado (Solo Administrador)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
              <span>Mostrando {visibleRelatedItems.length} de {filteredRelatedItems.length} códigos relacionados</span>
            </div>

            {hasMoreRelated && (
              <div ref={relatedSentinelRef} className="pt-1 pb-2 text-center">
                <button
                  type="button"
                  disabled={isLoadingMoreRelated}
                  onClick={handleLoadMoreRelated}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  {isLoadingMoreRelated ? (
                    <>
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span>Cargando más códigos...</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                      <span>Cargar más códigos</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {isRootAdmin && (
        <CleanProductModal
          isOpen={isCleanModalOpen}
          item={editingCleanItem}
          onClose={() => setIsCleanModalOpen(false)}
          onSave={handleSaveCleanProduct}
        />
      )}

      <RelatedCodeModal
        isOpen={isRelatedModalOpen}
        item={editingRelatedItem}
        currentUser={activeUser}
        onClose={() => setIsRelatedModalOpen(false)}
        onSave={handleSaveRelatedCode}
      />

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
