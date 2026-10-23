import React from 'react';
import { Pill, LogOut, Wifi, WifiOff, Users, Bell } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallPrompt } from './PWAInstallPrompt';

export function AppleNavbar({
  currentUser,
  onLogout,
  onNavigate,
  currentScreen,
  notificationCount = 0,
  onOpenNotifications
}) {
  const { isOnline } = useOnlineStatus();
  const isAdmin = currentUser?.username?.toLowerCase() === 'administrador';

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* Brand & Sede */}
        <div
          onClick={() => onNavigate && onNavigate('dashboard')}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 text-base tracking-tight">ERP Control</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {currentUser?.sede} &bull; {currentUser?.area}
            </p>
          </div>
        </div>

        {/* Right Status & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Notifications button with Live Badge Dot */}
          <button
            onClick={onOpenNotifications}
            className={`p-2 rounded-2xl transition-all cursor-pointer relative ${
              notificationCount > 0
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
            title="Notificaciones y Alertas de Reemplazo"
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm animate-scale-in">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {/* Admin shortcut button */}
          {isAdmin && onNavigate && (
            <button
              onClick={() => onNavigate(currentScreen === 'admin' ? 'dashboard' : 'admin')}
              className={`p-2 rounded-2xl transition-all cursor-pointer ${
                currentScreen === 'admin'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-purple-50 text-slate-600 hover:text-purple-700'
              }`}
              title="Gestión de Usuarios y Sedes"
            >
              <Users className="w-4 h-4" />
            </button>
          )}

          {/* Offline / Online Pill */}
          <div
            className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                : 'bg-amber-50 text-amber-700 border-amber-200/60 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* PWA Install */}
          <PWAInstallPrompt />

          {/* User profile & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <span className="block text-xs font-bold text-slate-800 leading-tight">
                {currentUser?.nombre}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                @{currentUser?.username}
              </span>
            </div>

            <button
              onClick={onLogout}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
}
