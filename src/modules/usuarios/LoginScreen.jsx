import React, { useState } from 'react';
import { Pill, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { userService } from './userService';

export function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await userService.login(username, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message || 'Usuario o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8">
      
      {/* Brand Header */}
      <div className="text-center mb-6 space-y-1.5">
        <div className="w-14 h-14 rounded-3xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-500/20">
          <Pill className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          ERP Control
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          Control de Transferencias de Medicamentos
        </p>
      </div>

      {/* Main Login Card (Apple Clean Light Style) */}
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 border border-slate-200/80 shadow-sm space-y-5">
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Usuario
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                autoComplete="username"
                placeholder="Ingresa tu usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Iniciando...' : 'Iniciar Sesión'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

      </div>

      <p className="text-[11px] text-slate-400 mt-6">
        ERP Control &bull; Acceso Seguro
      </p>

    </div>
  );
}
