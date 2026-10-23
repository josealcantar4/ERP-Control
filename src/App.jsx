import React, { useState, useEffect, useCallback } from 'react';
import { userService, organizationService, AdminUsersModule, LoginScreen } from './modules/usuarios';
import { catalogService, CatalogUploadModule, CatalogSyncModal } from './modules/catalogo';
import { transferService } from './modules/transferencias';
import { SolicitarModule } from './modules/solicitar';
import { DespacharModule } from './modules/despachar';
import { RecibirModule } from './modules/recibir';
import { MaterialModule, materialService } from './modules/material';
import {
  AppleNavbar,
  DashboardScreen,
  OfflineIndicator,
  ReloadPrompt,
  ScreenRefreshSpinner,
  NotificationsModal
} from './shared';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => {
    return localStorage.getItem('currentScreen') || 'dashboard';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isScreenUpdating, setIsScreenUpdating] = useState(false);

  // Estado del modal de sincronización automática de catálogo post-login
  const [syncModal, setSyncModal] = useState({
    isOpen: false,
    status: 'checking',
    progress: { percent: 0, currentBatch: 0, totalBatches: 0, message: '', totalRecords: 0 },
    error: null
  });

  // Estado del modal y alertas de notificaciones
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationsList, setNotificationsList] = useState([]);

  // Suscripción reactiva en tiempo real a notificaciones de material
  useEffect(() => {
    if (currentUser) {
      const unsub = materialService.subscribeMateriales((items) => {
        const notifs = materialService.calculateNotifications(items);
        setNotificationsList(notifs);
      });
      return () => unsub && unsub();
    }
  }, [currentUser]);

  // Verificación de información nueva en segundo plano al abrir cualquier pantalla
  // EXCLUSIÓN: El módulo 'upload-catalog' no muestra spinner ni ejecuta esta verificación.
  const performScreenRefresh = useCallback(async (screen) => {
    if (!screen || screen === 'upload-catalog') {
      setIsScreenUpdating(false);
      return;
    }

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
      // Duración mínima suave de 700ms para una animación perceptible y nativa sin parpadeos
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 700 - elapsed);
      setTimeout(() => {
        setIsScreenUpdating(false);
      }, remaining);
    }
  }, []);

  // Solicitar permiso de notificaciones Push del navegador/dispositivo
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Navegación con persistencia automática, restablecimiento de scroll y animación de refresco
  const navigateTo = (screen) => {
    setCurrentScreen(screen);
    localStorage.setItem('currentScreen', screen);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    performScreenRefresh(screen);
  };

  // 1. Guardar automáticamente la pantalla actual en localStorage y asegurar scroll superior
  useEffect(() => {
    if (currentUser && currentScreen) {
      localStorage.setItem('currentScreen', currentScreen);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [currentScreen, currentUser]);

  // Sincronización automática silenciosa post-login
  const runCatalogAutoSync = async (force = false) => {
    try {
      if (!force) {
        // Consulta silenciosa de metadatos al Servidor Central
        const check = await catalogService.checkServerCatalogVersion();
        
        // Si ya está actualizado y hay datos locales: CERO descargas, acceso inmediato!
        if (check.upToDate) {
          return;
        }
      }

      // Si hay archivo nuevo o la base local está vacía, mostrar modal transparente
      setSyncModal({
        isOpen: true,
        status: 'downloading',
        progress: {
          percent: 5,
          currentBatch: 0,
          totalBatches: 0,
          message: 'Conectando con el Servidor Central...',
          totalRecords: 0
        },
        error: null
      });

      const result = await catalogService.syncCatalogFromServer((status) => {
        setSyncModal(prev => ({
          ...prev,
          status: status.phase === 'done' ? 'done' : 'saving',
          progress: status
        }));
      });

      setSyncModal(prev => ({
        ...prev,
        status: 'done',
        progress: {
          percent: 100,
          currentBatch: 0,
          totalBatches: 0,
          message: 'Sincronización completada con éxito.',
          totalRecords: result.totalRecords
        }
      }));

      // Cierre automático del modal tras éxito
      setTimeout(() => {
        setSyncModal(prev => ({ ...prev, isOpen: false }));
      }, 1500);

    } catch (err) {
      console.warn('Error durante auto-sincronización del catálogo:', err);
      setSyncModal(prev => ({
        ...prev,
        isOpen: true,
        status: 'error',
        error: err.message || 'Error al conectar con el Servidor Central.'
      }));
    }
  };

  // 2. Verificar sesión guardada al iniciar la PWA
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
      }

      setCurrentScreen(targetScreen);
      localStorage.setItem('currentScreen', targetScreen);

      // Verificación de datos nuevos al iniciar
      performScreenRefresh(targetScreen);

      // Disparar verificación silenciosa post-login
      runCatalogAutoSync();
    }
    setIsLoading(false);
  }, [performScreenRefresh]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (user.roles?.length === 1) {
      let defaultScreen = 'dashboard';
      if (user.roles[0] === 'solicitar') defaultScreen = 'solicitar';
      else if (user.roles[0] === 'despachar') defaultScreen = 'despachar';
      else if (user.roles[0] === 'material') defaultScreen = 'material';
      navigateTo(defaultScreen);
    } else {
      navigateTo('dashboard');
    }

    // Disparar verificación silenciosa post-login
    runCatalogAutoSync();
  };

  const handleLogout = () => {
    userService.logout();
    setCurrentUser(null);
    setCurrentScreen('dashboard');
    localStorage.removeItem('currentScreen');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 animate-fade-in select-none">
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <OfflineIndicator />

      {/* Modal de Sincronización Automática Transparente */}
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
        onLogout={handleLogout}
        onNavigate={navigateTo}
        currentScreen={currentScreen}
        notificationCount={notificationsList.length}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      {/* Modal Independiente de Notificaciones y Alertas de Reemplazo */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        notifications={notificationsList}
        onClose={() => setIsNotificationsOpen(false)}
        onMarkAsReplaced={async (materialId) => {
          await materialService.markAsStatus(materialId, 'reemplazado');
        }}
        onNavigateToMaterial={() => {
          navigateTo('material');
        }}
      />

      {/* Indicador de actualización de pantalla discreto estilo iOS (sin opacar el fondo) */}
      <ScreenRefreshSpinner isRefreshing={isScreenUpdating} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16">
        <div key={currentScreen} className="ios-page-transition">
          {currentScreen === 'dashboard' && (
            <DashboardScreen
              currentUser={currentUser}
              onNavigate={navigateTo}
              onRefresh={() => performScreenRefresh('dashboard')}
            />
          )}
          {currentScreen === 'solicitar' && (
            <SolicitarModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={() => performScreenRefresh('solicitar')}
            />
          )}
          {currentScreen === 'despachar' && (
            <DespacharModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={() => performScreenRefresh('despachar')}
            />
          )}
          {currentScreen === 'recibir' && (
            <RecibirModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={() => performScreenRefresh('recibir')}
            />
          )}
          {currentScreen === 'material' && (
            <MaterialModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={() => performScreenRefresh('material')}
            />
          )}
          {currentScreen === 'admin' && (
            <AdminUsersModule
              currentUser={currentUser}
              onBack={() => navigateTo('dashboard')}
              onRefresh={() => performScreenRefresh('admin')}
            />
          )}
          {currentScreen === 'upload-catalog' && (
            <CatalogUploadModule onBack={() => navigateTo('dashboard')} />
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-[11px] text-slate-400">
        ERP Control &bull; {currentUser.sede}
      </footer>
      <ReloadPrompt />
    </div>
  );
}
