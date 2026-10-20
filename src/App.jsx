import React, { useState, useEffect } from 'react';
import { userService } from './services/userService';
import { AppleNavbar } from './components/AppleNavbar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { SolicitarModule } from './components/SolicitarModule';
import { DespacharModule } from './components/DespacharModule';
import { RecibirModule } from './components/RecibirModule'; // <-- Nuevo Módulo
import { AdminUsersModule } from './components/AdminUsersModule';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ReloadPrompt } from './components/ReloadPrompt';
import { CatalogUploadModule } from './components/CatalogUploadModule';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => {
    return localStorage.getItem('currentScreen') || 'dashboard';
  });
  const [isLoading, setIsLoading] = useState(true);

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
        {/* Nueva ruta de Recibir */}
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