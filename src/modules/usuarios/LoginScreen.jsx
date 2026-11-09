/**
 * Pantalla de autenticación de usuarios para inicio de sesión en el sistema ERP Control.
 */

import React, { useState } from 'react';
import { Lock, User, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { userService } from './userService';
import { FloatingInput } from '../../shared';

export function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      
      <div className="text-center mb-6 space-y-1.5">
        <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-sky-500 to-teal-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-500/20 overflow-hidden">
            <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full p-2">
              <path d="M224 128H288V224H384V288H288V384H224V288H128V224H224V128Z" fill="white" />
            </svg>
          </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          ERP Control
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          Control de Transferencias de Productos
        </p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl p-7 border border-slate-200/80 shadow-sm space-y-5">
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <FloatingInput
            label="Usuario"
            required
            autoComplete="username"
            placeholder="Ingresa tu usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            icon={User}
          />

          <FloatingInput
            label="Contraseña"
            required
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={Lock}
            endAdornment={
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />

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
