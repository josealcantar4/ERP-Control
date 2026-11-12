/**
 * Componente delimitador de errores para capturar fallos de renderizado en React y evitar caídas totales de la interfaz.
 */

import React from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { parseErrorDisplay } from './errorUtils';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const { displayMessage, technicalDetails } = parseErrorDisplay(this.state.error, {
        forceTechnical: true,
        fallbackMessage:
          'Ocurrió un error de conexión o del sistema. El sistema aisló el fallo para proteger tus datos.'
      });

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 mx-auto flex items-center justify-center shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Se presentó un problema inesperado
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                {displayMessage}
              </p>

              {technicalDetails && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={this.toggleDetails}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <span>{this.state.showDetails ? 'Ocultar detalles' : 'Ver detalles'}</span>
                    {this.state.showDetails ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {this.state.showDetails && (
                    <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-left text-[11px] font-mono text-slate-600 break-words max-h-36 overflow-y-auto select-text">
                      {technicalDetails}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-2xl transition-colors cursor-pointer"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-2xl shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recargar página</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
