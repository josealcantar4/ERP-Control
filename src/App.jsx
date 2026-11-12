/**
 * Componente raíz de la aplicación ERP Control. Administra el enrutamiento de módulos, estado de autenticación, actualización PWA, sincronización global de catálogo y estructura del contenedor principal.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { userService, organizationService, AdminUsersModule, LoginScreen } from './modules/usuarios';
import { catalogService, CatalogUploadModule, CatalogSyncModal } from './modules/catalogo';
import { transferService, TransferDetailModal, dismissNotification } from './modules/transferencias';
import { SolicitarModule } from './modules/solicitar';
import { DespacharModule } from './modules/despachar';
import { RecibirModule } from './modules/recibir';
import { MaterialModule, materialService } from './modules/material';
import {
  AppleNavbar,
  AppSidebar,
  userPreferencesService,
  themeService,
  DashboardScreen,
  OfflineIndicator,
  ReloadPrompt,
  ScreenRefreshSpinner,
  LogoutLoadingScreen,
  NotificationsModal,
  transitionView
} from './shared';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => {
    return localStorage.getItem('currentScreen') || 'dashboard';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutUserInfo, setLogoutUserInfo] = useState(null);
  const isLoggingOutRef = useRef(false);
  const logoutTimerRef = useRef(null);
  const [isScreenUpdating, setIsScreenUpdating] = useState(false);
  const isScreenRefreshingRef = useRef(false);
  const lastScreenRefreshTimeRef = useRef({});

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);

  const [syncModal, setSyncModal] = useState({
    isOpen: false,
    status: 'checking',
    progress: { percent: 0, currentBatch: 0, totalBatches: 0, message: '', totalRecords: 0 },
    error: null
  });
  const isCatalogSyncingRef = useRef(false);
  const lastCatalogCheckTimeRef = useRef(0);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const isNotificationsOpenRef = useRef(false);
  useEffect(() => {
    isNotificationsOpenRef.current = isNotificationsOpen;
  }, [isNotificationsOpen]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userPreferences, setUserPreferences] = useState(() => {
    return userPreferencesService.getLocalPreferences();
  });

  useEffect(() => {
    themeService.applyTheme();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = userPreferencesService.subscribeUserPreferences(currentUser, (newPrefs) => {
      setUserPreferences(newPrefs);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [currentUser?.id, currentUser?.username]);

  const handleUpdatePreferences = async (partial) => {
    setUserPreferences(prev => ({
      ...prev,
      ...partial,
      sounds: {
        ...(prev?.sounds || {}),
        ...(partial.sounds || {})
      }
    }));
    await userPreferencesService.savePreferences(currentUser, partial);
  };
  const [materialNotifications, setMaterialNotifications] = useState([]);
  const [transferNotifications, setTransferNotifications] = useState([]);
  const [notificationDetailTransfer, setNotificationDetailTransfer] = useState(null);

  const handleViewTransferDetail = useCallback((solicitud, notifId) => {
    setIsNotificationsOpen(false);
    if (notifId) {
      dismissNotification(notifId);
      setTransferNotifications(prev => prev.filter(n => n.id !== notifId));
    }
    setNotificationDetailTransfer(solicitud);
  }, []);

  const notificationsList = React.useMemo(() => {
    return [...transferNotifications, ...materialNotifications];
  }, [transferNotifications, materialNotifications]);

  useEffect(() => {
    if (currentUser) {
      const unsubMaterial = materialService.subscribeMateriales((items) => {
        const notifs = materialService.calculateNotifications(items);
        setMaterialNotifications(notifs);
      });

      const unsubSolicitudes = transferService.subscribeSolicitudes((solicitudes) => {
        const notifs = transferService.calculateTransferNotifications(solicitudes, currentUser);
        setTransferNotifications(notifs);
      }, currentUser);

      const unsubClean = catalogService.subscribeCleanCatalog();

      return () => {
        if (unsubMaterial) unsubMaterial();
        if (unsubSolicitudes) unsubSolicitudes();
        if (unsubClean) unsubClean();
      };
    } else {
      transferService.resetSolicitudesSubscription();
      setMaterialNotifications([]);
      setTransferNotifications([]);
    }
  }, [currentUser]);

  useEffect(() => {
    const handleDismissed = (e) => {
      const dismissedId = e.detail?.notifId;
      if (dismissedId) {
        setTransferNotifications(prev => prev.filter(n => n.id !== dismissedId));
        setMaterialNotifications(prev => prev.filter(n => n.id !== dismissedId));
      }
    };
    const handleUpdated = () => {
      if (currentUser) {
        const latestSolicitudes = transferService.getLocalSolicitudes();
        setTransferNotifications(transferService.calculateTransferNotifications(latestSolicitudes, currentUser));
      }
    };
    window.addEventListener('erp_notifications_dismissed', handleDismissed);
    window.addEventListener('erp_notifications_updated', handleUpdated);
    return () => {
      window.removeEventListener('erp_notifications_dismissed', handleDismissed);
      window.removeEventListener('erp_notifications_updated', handleUpdated);
    };
  }, [currentUser]);

  const runCatalogAutoSync = useCallback(async (force = false) => {
    if (isCatalogSyncingRef.current) return;

    const now = Date.now();
    if (!force && (now - lastCatalogCheckTimeRef.current < 4000)) {
      return;
    }
    lastCatalogCheckTimeRef.current = now;

    try {
      if (!force) {
        const check = await catalogService.checkServerCatalogVersion();
        
        if (check.upToDate) {
          return;
        }
      }

      isCatalogSyncingRef.current = true;

      setSyncModal({
        isOpen: true,
        status: 'downloading',
        progress: {
          percent: 5,
          currentBatch: 0,
          totalBatches: 0,
          message: 'Detectada nueva versión en Servidor Central. Conectando...',
          totalRecords: 0
        },
        error: null
      });

      const result = await catalogService.syncCatalogFromServer((status) => {
        setSyncModal(prev => ({
          ...prev,
          isOpen: true,
          status: status.phase === 'done' ? 'done' : status.phase,
          progress: status
        }));
      });

      setSyncModal(prev => ({
        ...prev,
        isOpen: true,
        status: 'done',
        progress: {
          percent: 100,
          currentBatch: 0,
          totalBatches: 0,
          message: `Sincronización completada con éxito (${result.totalRecords.toLocaleString()} productos disponibles).`,
          totalRecords: result.totalRecords
        }
      }));

      window.dispatchEvent(new CustomEvent('erp_catalog_synced', { detail: result }));

      setTimeout(() => {
        setSyncModal(prev => (prev.status === 'done' ? { ...prev, isOpen: false } : prev));
      }, 6000);

    } catch (err) {
      console.warn('Error durante sincronización del catálogo:', err);
      setSyncModal(prev => ({
        ...prev,
        isOpen: true,
        status: 'error',
        error: err.message || 'Error al conectar con el Servidor Central.'
      }));
    } finally {
      isCatalogSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleTriggerSync = (e) => {
      const force = e.detail?.force ?? true;
      runCatalogAutoSync(force);
    };
    window.addEventListener('erp_trigger_catalog_sync', handleTriggerSync);
    return () => window.removeEventListener('erp_trigger_catalog_sync', handleTriggerSync);
  }, [runCatalogAutoSync]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = catalogService.subscribeCatalogVersion(async (serverMeta) => {
      if (!serverMeta) return;

      const localFingerprint = localStorage.getItem('erp_catalog_last_fingerprint');
      const localModified = localStorage.getItem('erp_catalog_last_modified');
      const localCount = await catalogService.getLocalBaseCount();

      const isOutdated = localCount === 0 ||
        (serverMeta.fingerprint && localFingerprint && serverMeta.fingerprint !== localFingerprint) ||
        (serverMeta.lastModified && localModified && serverMeta.lastModified !== localModified) ||
        (!localFingerprint && serverMeta.fingerprint);

      if (isOutdated && !isCatalogSyncingRef.current) {
        runCatalogAutoSync(true);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [currentUser, runCatalogAutoSync]);

  const performScreenRefresh = useCallback(async (screen, force = false) => {
    if (!screen || screen === 'upload-catalog') {
      setIsScreenUpdating(false);
      return;
    }

    const now = Date.now();
    const lastTime = lastScreenRefreshTimeRef.current[screen] || 0;
    if (!force && (isScreenRefreshingRef.current || (now - lastTime < 4000))) {
      return;
    }

    isScreenRefreshingRef.current = true;
    lastScreenRefreshTimeRef.current[screen] = now;
    setIsScreenUpdating(true);
    const startTime = Date.now();

    try {
      if (screen === 'solicitar') {
        await Promise.all([
          transferService.refreshSolicitudes(),
          userService.getMatrizDestinatarios()
        ]);
      } else if (screen === 'despachar' || screen === 'recibir') {
        await transferService.refreshSolicitudes();
      } else if (screen === 'admin') {
        await Promise.all([
          userService.refreshUsers(),
          organizationService.refreshSedesAndAreas()
        ]);
      } else if (screen === 'material') {
        await Promise.all([
          materialService.refreshAll(),
          organizationService.refreshSedesAndAreas()
        ]);
      } else if (screen === 'dashboard') {
        await Promise.all([
          transferService.refreshSolicitudes(),
          userService.getMatrizDestinatarios(),
          materialService.refreshAll()
        ]);
      }
    } catch (err) {
      console.warn('Error durante verificación de nueva información:', err);
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 600 - elapsed);
      setTimeout(() => {
        setIsScreenUpdating(false);
        isScreenRefreshingRef.current = false;
      }, remaining);
    }
  }, []);

  const handleRefreshSolicitar = useCallback(() => performScreenRefresh('solicitar', true), [performScreenRefresh]);
  const handleRefreshDespachar = useCallback(() => performScreenRefresh('despachar', true), [performScreenRefresh]);
  const handleRefreshRecibir = useCallback(() => performScreenRefresh('recibir', true), [performScreenRefresh]);
  const handleRefreshMaterial = useCallback(() => performScreenRefresh('material', true), [performScreenRefresh]);
  const handleRefreshAdmin = useCallback(() => performScreenRefresh('admin', true), [performScreenRefresh]);
  const handleRefreshDashboard = useCallback(() => performScreenRefresh('dashboard', true), [performScreenRefresh]);
  useEffect(() => {
    if (!currentUser) return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        runCatalogAutoSync();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        runCatalogAutoSync();
      }
    }, 60000);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      clearInterval(intervalId);
    };
  }, [currentUser, runCatalogAutoSync]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  const navigateTo = (screen, customDirection = null) => {
    setIsSidebarOpen(false);
    const direction = customDirection || (screen === 'dashboard' ? 'back' : 'forward');
    transitionView(() => {
      setCurrentScreen(screen);
      localStorage.setItem('currentScreen', screen);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, { direction });
    setTimeout(() => {
      performScreenRefresh(screen);
    }, 120);
  };
  useEffect(() => {
    if (currentUser && currentScreen) {
      localStorage.setItem('currentScreen', currentScreen);
    }
  }, [currentScreen, currentUser]);

  useEffect(() => {
    const savedUser = userService.getCurrentUser();
    if (savedUser) {
      setCurrentUser(savedUser);
      
      const storedScreen = localStorage.getItem('currentScreen');
      let targetScreen = 'dashboard';

      if (storedScreen) {
        targetScreen = storedScreen;
      } else if (savedUser.roles?.length === 1) {
        if (savedUser.roles[0] === 'solicitar') targetScreen = 'solicitar';
        else if (savedUser.roles[0] === 'despachar') targetScreen = 'despachar';
        else if (savedUser.roles[0] === 'material') targetScreen = 'material';
        else if (savedUser.roles[0] === 'admin') targetScreen = 'admin';
      }

      setCurrentScreen(targetScreen);
      localStorage.setItem('currentScreen', targetScreen);

      performScreenRefresh(targetScreen);

      runCatalogAutoSync();
    }
    setIsLoading(false);
  }, [performScreenRefresh]);

  useEffect(() => {
    const handleUserUpdated = (e) => {
      if (e.detail) {
        setCurrentUser(e.detail);
      }
    };
    window.addEventListener('erp_current_user_updated', handleUserUpdated);
    return () => window.removeEventListener('erp_current_user_updated', handleUserUpdated);
  }, []);

  const handleLoginSuccess = (user) => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    isLoggingOutRef.current = false;
    setIsLoggingOut(false);
    setLogoutUserInfo(null);
    setIsSidebarOpen(false);
    transitionView(() => {
      setCurrentUser(user);
      let targetScreen = 'dashboard';
      if (user.roles?.length === 1) {
        if (user.roles[0] === 'solicitar') targetScreen = 'solicitar';
        else if (user.roles[0] === 'despachar') targetScreen = 'despachar';
        else if (user.roles[0] === 'material') targetScreen = 'material';
        else if (user.roles[0] === 'admin') targetScreen = 'admin';
      }
      setCurrentScreen(targetScreen);
      localStorage.setItem('currentScreen', targetScreen);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, { direction: 'login' });

    runCatalogAutoSync();
  };

  const handleLogout = () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    const userSnapshot = currentUser
      ? {
          nombre: currentUser.nombre,
          username: currentUser.username
        }
      : null;

    setLogoutUserInfo(userSnapshot);
    setIsSidebarOpen(false);
    setIsNotificationsOpen(false);
    setNotificationDetailTransfer(null);
    setIsScreenUpdating(false);
    setSyncModal(prev => ({ ...prev, isOpen: false }));
    setIsLoggingOut(true);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    userService.logout();
    transferService.resetSolicitudesSubscription();
    sessionStorage.removeItem('erp_recibir_order_id');
    sessionStorage.removeItem('erp_despachar_solicitud_id');
    setCurrentUser(null);
    setCurrentScreen('dashboard');
    localStorage.removeItem('currentScreen');

    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    logoutTimerRef.current = setTimeout(() => {
      transitionView(() => {
        setIsLoggingOut(false);
        setLogoutUserInfo(null);
        isLoggingOutRef.current = false;
      }, { direction: 'login' });
    }, 950);
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 animate-fade-in select-none">
        <div className="flex flex-col items-center gap-4 animate-scale-in">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-blue-500/25">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m7.5 4.27 9 5.15" />
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">ERP Control</h1>
            <p className="text-xs font-semibold text-slate-400">Cargando aplicación...</p>
          </div>
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mt-2"></div>
        </div>
      </div>
    );
  }

  if (isLoggingOut) {
    return <LogoutLoadingScreen user={logoutUserInfo} />;
  }

  if (!currentUser) {
    return (
      <>
        <OfflineIndicator />
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
        <ReloadPrompt />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200 overflow-x-clip relative">
      <OfflineIndicator />

      <div
        className={`flex flex-col min-h-dvh w-full transition-transform duration-300 ease-out ${
          isSidebarOpen ? 'transform -translate-x-72 sm:-translate-x-80 pointer-events-none select-none' : ''
        }`}
      >
        <CatalogSyncModal
          isOpen={syncModal.isOpen}
          status={syncModal.status}
          progress={syncModal.progress}
          error={syncModal.error}
          onRetry={() => runCatalogAutoSync(true)}
          onDismiss={() => setSyncModal(prev => ({ ...prev, isOpen: false }))}
        />

        <AppleNavbar
          currentUser={currentUser}
          onNavigate={navigateTo}
          currentScreen={currentScreen}
          notificationCount={notificationsList.length}
          isNotificationsOpen={isNotificationsOpen}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          onOpenNotifications={() => {
            if (isNotificationsOpenRef.current) {
              setIsNotificationsOpen(false);
              return;
            }
            setIsSidebarOpen(false);

            transferService.unlockAudioEngine();
            if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission();
            }
            if (currentUser) {
              const latestSolicitudes = transferService.getLocalSolicitudes();
              const freshTransferNotifs = transferService.calculateTransferNotifications(latestSolicitudes, currentUser);
              setTransferNotifications(freshTransferNotifs);

              const latestMaterial = materialService.getLocalMateriales();
              const freshMaterialNotifs = materialService.calculateNotifications(latestMaterial);
              setMaterialNotifications(freshMaterialNotifs);
            }
            setIsNotificationsOpen(true);
          }}
        />
      <NotificationsModal
        isOpen={isNotificationsOpen}
        notifications={notificationsList}
        onClose={() => setIsNotificationsOpen(false)}
        onDismissNotification={(notifId) => {
          setTransferNotifications(prev => prev.filter(n => n.id !== notifId));
          setMaterialNotifications(prev => prev.filter(n => n.id !== notifId));
        }}
        onMarkAsReplaced={async (materialId) => {
          await materialService.markAsStatus(materialId, 'reemplazado');
        }}
        onNavigateToMaterial={() => {
          navigateTo('material');
        }}
        onNavigateToScreen={(screen, orderId, notif) => {
          setIsNotificationsOpen(false);
          if (notif?.id) {
            dismissNotification(notif.id);
            setTransferNotifications(prev => prev.filter(n => n.id !== notif.id));
            setMaterialNotifications(prev => prev.filter(n => n.id !== notif.id));
          }
          if (orderId) {
            if (screen === 'recibir') {
              sessionStorage.setItem('erp_recibir_order_id', orderId);
            } else if (screen === 'despachar') {
              sessionStorage.setItem('erp_despachar_solicitud_id', orderId);
            }
          }
          navigateTo(screen);
          window.dispatchEvent(new CustomEvent('erp_open_solicitud', {
            detail: { screen, orderId, notif }
          }));
        }}
        onViewTransferDetail={handleViewTransferDetail}
      />

      <TransferDetailModal
        isOpen={Boolean(notificationDetailTransfer)}
        solicitud={notificationDetailTransfer}
        onClose={() => {
          if (notificationDetailTransfer?.id) {
            dismissNotification(`tr-falt-${notificationDetailTransfer.id}`);
            dismissNotification(`tr-falt-entregados-${notificationDetailTransfer.id}`);
          }
          setNotificationDetailTransfer(null);
        }}
      />

      <ScreenRefreshSpinner isRefreshing={isScreenUpdating} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16">
        <div key={currentScreen} className="ios-page-transition">
          {currentScreen === 'dashboard' && (
            <DashboardScreen
              currentUser={currentUser}
              onNavigate={navigateTo}
              onRefresh={handleRefreshDashboard}
            />
          )}
          {currentScreen === 'solicitar' && (
            <SolicitarModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={handleRefreshSolicitar}
            />
          )}
          {currentScreen === 'despachar' && (
            <DespacharModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={handleRefreshDespachar}
            />
          )}
          {currentScreen === 'recibir' && (
            <RecibirModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={handleRefreshRecibir}
            />
          )}
          {currentScreen === 'material' && (
            <MaterialModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={handleRefreshMaterial}
            />
          )}
          {currentScreen === 'admin' && (
            <AdminUsersModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={handleRefreshAdmin}
            />
          )}
          {currentScreen === 'upload-catalog' && (
            <CatalogUploadModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
            />
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
        ERP Control &bull; {currentUser.sede}
      </footer>
      <ReloadPrompt />
    </div>

    <AppSidebar
      isOpen={isSidebarOpen}
      onClose={() => setIsSidebarOpen(false)}
      currentUser={currentUser}
      onLogout={handleLogout}
      preferences={userPreferences}
      onUpdatePreferences={handleUpdatePreferences}
    />
  </div>
  );
}
