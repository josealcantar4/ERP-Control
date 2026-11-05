import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';

/**
 * Control numérico estilo "stepper" para ajuste de cantidades.
 * Incluye botones [ - ] y [ + ], visor de cantidad central y botón de papelera [ 🗑️ ] para ausencia total (0).
 */
export function QuantityStepper({
  value = 0,
  min = 0,
  max = undefined,
  onChange,
  onDelete,
  disabled = false,
  showDelete = true,
  size = 'md', // 'sm' | 'md'
  className = ''
}) {
  const numValue = Number(value) || 0;

  const handleDecrease = (e) => {
    e.stopPropagation();
    if (disabled || numValue <= min) return;
    const nextVal = Math.max(min, numValue - 1);
    if (onChange) onChange(nextVal);
  };

  const handleIncrease = (e) => {
    e.stopPropagation();
    if (disabled || (max !== undefined && numValue >= max)) return;
    const nextVal = max !== undefined ? Math.min(max, numValue + 1) : numValue + 1;
    if (onChange) onChange(nextVal);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (onDelete) {
      onDelete();
    } else if (onChange) {
      onChange(0);
    }
  };

  const isMin = numValue <= min;
  const isMax = max !== undefined && numValue >= max;
  const isZero = numValue === 0;

  const btnSize = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const textSize = size === 'sm' ? 'text-xs min-w-[1.75rem]' : 'text-xs sm:text-sm min-w-[2rem]';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 bg-slate-50 border border-slate-200/90 rounded-2xl p-0.5 sm:p-1 shadow-2xs select-none transition-all ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
    >
      {/* Botón Disminuir [ - ] */}
      <button
        type="button"
        onClick={handleDecrease}
        disabled={disabled || isMin}
        className={`${btnSize} flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white active:scale-90 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent shadow-2xs disabled:shadow-none`}
        title="Disminuir piezas (-1)"
      >
        <Minus className={iconSize} />
      </button>

      {/* Número al centro */}
      <span
        className={`font-mono font-extrabold ${textSize} text-center select-none ${
          isZero ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {numValue}
      </span>

      {/* Botón Aumentar [ + ] */}
      <button
        type="button"
        onClick={handleIncrease}
        disabled={disabled || isMax}
        className={`${btnSize} flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white active:scale-90 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent shadow-2xs disabled:shadow-none`}
        title="Aumentar piezas (+1)"
      >
        <Plus className={iconSize} />
      </button>

      {/* Botón Papelera [ 🗑️ ] */}
      {showDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={disabled || isZero}
          className={`${btnSize} flex items-center justify-center rounded-xl transition-all cursor-pointer ml-0.5 ${
            isZero
              ? 'text-red-300 opacity-40 cursor-not-allowed'
              : 'text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-90'
          }`}
          title="Ausencia total (0 piezas)"
        >
          <Trash2 className={iconSize} />
        </button>
      )}
    </div>
  );
}
