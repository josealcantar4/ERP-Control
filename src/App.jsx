import React, { useState, useEffect } from 'react';
import { userService, AdminUsersModule, LoginScreen } from './modules/usuarios';
import { catalogService, CatalogUploadModule, CatalogSyncModal } from './modules/catalogo';
import { SolicitarModule } from './modules/solicitar';
import { DespacharModule } from './modules/despachar';
import { RecibirModule } from './modules/recibir';
import { AppleNavbar, DashboardScreen, OfflineIndicator, ReloadPrompt } from './shared';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => {
    return localStorage.getItem('currentScreen') || 'dashboard';
  });
  const [isLoading, setIsLoading] = useState(true);

  // Estado del modal de sincronización automática de catálogo post-login
  const [syncModal, setSyncModal] = useState({
    isOpen: false,
    status: 'checking',
    progress: { percent: 0, currentBatch: 0, totalBatches: 0, message: '', totalRecords: 0 },
    error: null
  });

  // Solicitar permiso de notificaciones Push del navegador/dispositivo
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // 1. Guardar automáticamente la pantalla actual en localStorage cuando cambie
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentScreen', currentScreen);
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
      if (!storedScreen && savedUser.roles?.length === 1) {
        if (savedUser.roles[0] === 'solicitar') setCurrentScreen('solicitar');
        if (savedUser.roles[0] === 'despachar') setCurrentScreen('despachar');
      }

      // Disparar verificación silenciosa post-login
      runCatalogAutoSync();
    }
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (user.roles?.length === 1) {
      const defaultScreen = user.roles[0] === 'solicitar' ? 'solicitar' : 'despachar';
      setCurrentScreen(defaultScreen);
      localStorage.setItem('currentScreen', defaultScreen);
    } else {
      setCurrentScreen('dashboard');
      localStorage.setItem('currentScreen', 'dashboard');
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
        onNavigate={(screen) => setCurrentScreen(screen)}
        currentScreen={currentScreen}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 pt-5">
        {currentScreen === 'dashboard' && (
          <DashboardScreen currentUser={currentUser} onNavigate={(screen) => setCurrentScreen(screen)} />
        )}
        {currentScreen === 'solicitar' && (
          <SolicitarModule currentUser={currentUser} onBack={() => setCurrentScreen('dashboard')} />
        )}
        {currentScreen === 'despachar' && (
          <DespacharModule currentUser={currentUser} onBack={() => setCurrentScreen('dashboard')} />
        )}
        {currentScreen === 'recibir' && (
          <RecibirModule currentUser={currentUser} onBack={() => setCurrentScreen('dashboard')} />
        )}
        {currentScreen === 'admin' && (
          <AdminUsersModule currentUser={currentUser} onBack={() => setCurrentScreen('dashboard')} />
        )}
        {currentScreen === 'upload-catalog' && (
          <CatalogUploadModule onBack={() => setCurrentScreen('dashboard')} />
        )}
      </main>

      <footer className="py-4 text-center text-[11px] text-slate-400">
        ERP Control &bull; {currentUser.sede}
      </footer>
      <ReloadPrompt />
    </div>
  );
}
