import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';

interface Option {
  id: string;
  nombre: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = 'Seleccionar...',
  disabled = false
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const toggleOption = (optionId: string) => {
    if (selectedIds.includes(optionId)) {
      // Deseleccionar
      onChange(selectedIds.filter(id => id !== optionId));
    } else {
      // Seleccionar
      onChange([...selectedIds, optionId]);
    }
  };

  const selectAll = () => {
    onChange(options.map(opt => opt.id));
  };

  const deselectAll = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (selectedIds.length === 0) {
      return 'Todos';
    }
    if (selectedIds.length === options.length) {
      return 'Todos';
    }
    if (selectedIds.length === 1) {
      const selected = options.find(opt => opt.id === selectedIds[0]);
      return selected?.nombre || placeholder;
    }
    return `${selectedIds.length} seleccionados`;
  };

  return (
    <div className="space-y-2" ref={dropdownRef}>
      <Label>{label}</Label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <span className="truncate">{getDisplayText()}</span>
          <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0" />
        </Button>

        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
            {/* Acciones rápidas */}
            <div className="flex gap-2 p-2 border-b border-gray-200 bg-gray-50">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="flex-1 text-xs"
              >
                Todos
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={deselectAll}
                className="flex-1 text-xs"
              >
                Ninguno
              </Button>
            </div>

            {/* Lista de opciones */}
            <div className="overflow-y-auto">
              {options.map((option) => {
                const isSelected = selectedIds.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => toggleOption(option.id)}
                  >
                    <div
                      className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-[#73991C] border-[#73991C]'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="truncate text-left">{option.nombre}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
