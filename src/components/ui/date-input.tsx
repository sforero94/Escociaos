import React, { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { formatearFecha, parsearFechaDDMMAAAA, fechaAISODate } from '../../utils/fechas';

interface DateInputProps {
  value: string; // formato aaaa-mm-dd
  onChange: (value: string) => void; // devuelve formato aaaa-mm-dd
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  min?: string; // formato aaaa-mm-dd
  max?: string; // formato aaaa-mm-dd
}

export function DateInput({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  disabled = false,
  required = false,
  className = '',
  min,
  max,
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convertir valor ISO a display dd/mm/aaaa
  useEffect(() => {
    if (value) {
      setDisplayValue(formatearFecha(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;
    
    // Remover caracteres no numéricos excepto /
    input = input.replace(/[^\d/]/g, '');
    
    // Auto-agregar barras
    if (input.length === 2 && !input.includes('/')) {
      input = input + '/';
    } else if (input.length === 5 && input.split('/').length === 2) {
      input = input + '/';
    }
    
    // Limitar a 10 caracteres (dd/mm/aaaa)
    if (input.length > 10) {
      input = input.substring(0, 10);
    }
    
    setDisplayValue(input);
    setError(null);
    
    // Si está completo, validar y convertir a ISO
    if (input.length === 10) {
      const partes = input.split('/');
      if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10);
        const anio = parseInt(partes[2], 10);
        
        // Validaciones básicas
        if (dia < 1 || dia > 31) {
          setError('Día inválido');
          onChange('');
          return;
        }
        if (mes < 1 || mes > 12) {
          setError('Mes inválido');
          onChange('');
          return;
        }
        if (anio < 1900 || anio > 2100) {
          setError('Año inválido');
          onChange('');
          return;
        }
        
        // Crear fecha y validar que sea válida
        const fecha = new Date(anio, mes - 1, dia);
        if (fecha.getDate() !== dia || fecha.getMonth() !== mes - 1 || fecha.getFullYear() !== anio) {
          setError('Fecha inválida');
          onChange('');
          return;
        }
        
        // Convertir a formato ISO para el valor
        const valorISO = fechaAISODate(fecha);
        
        // Validar min/max
        if (min && valorISO < min) {
          setError('Fecha muy antigua');
          onChange('');
          return;
        }
        if (max && valorISO > max) {
          setError('Fecha muy reciente');
          onChange('');
          return;
        }
        
        onChange(valorISO);
      }
    } else {
      // Si no está completo, limpiar el valor
      onChange('');
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    
    // Si el campo está vacío y es requerido, mostrar error
    if (required && !displayValue) {
      setError('Este campo es requerido');
    }
    
    // Si hay texto pero no está completo, mostrar error
    if (displayValue && displayValue.length < 10) {
      setError('Formato incompleto (dd/mm/aaaa)');
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permitir: backspace, delete, tab, escape, enter
    if ([8, 9, 27, 13, 46].includes(e.keyCode)) {
      return;
    }
    
    // Permitir: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if ((e.keyCode === 65 || e.keyCode === 67 || e.keyCode === 86 || e.keyCode === 88) && (e.ctrlKey || e.metaKey)) {
      return;
    }
    
    // Permitir: flechas
    if (e.keyCode >= 35 && e.keyCode <= 40) {
      return;
    }
    
    // Permitir: /
    if (e.keyCode === 191 || e.key === '/') {
      return;
    }
    
    // Asegurarse que sea número
    if ((e.keyCode < 48 || e.keyCode > 57) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-4 py-3 pr-10
            border rounded-xl
            bg-white text-[#172E08]
            placeholder:text-[#4D240F]/40
            focus:outline-none focus:ring-2 focus:ring-[#73991C] focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : 'border-[#73991C]/20'}
            ${isFocused ? 'ring-2 ring-[#73991C]' : ''}
            ${className}
          `}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <Calendar className="w-5 h-5 text-[#4D240F]/40" />
        </div>
      </div>
      
      {error && (
        <p className="text-xs text-red-600 mt-1 ml-1">{error}</p>
      )}
      
      {!error && !isFocused && displayValue && displayValue.length === 10 && (
        <p className="text-xs text-[#73991C] mt-1 ml-1">✓ Fecha válida</p>
      )}
    </div>
  );
}