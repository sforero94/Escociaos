// TrabajadorMultiSelect.tsx
// Reusable worker (employee + contractor) multi-select component with tabs
// Used in both RegistrarTrabajoDialog and DailyMovementForm for consistent UX

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import type { Empleado, Contratista, Trabajador } from '../../types/shared';

export interface TrabajadorMultiSelectProps {
  empleados: Empleado[];
  contratistas: Contratista[];
  selectedTrabajadores: Trabajador[];
  onSelectionChange: (trabajadores: Trabajador[]) => void;
  disabled?: boolean;
}

export function TrabajadorMultiSelect({
  empleados,
  contratistas,
  selectedTrabajadores,
  onSelectionChange,
  disabled = false,
}: TrabajadorMultiSelectProps) {
  const [workerTab, setWorkerTab] = useState<'empleados' | 'contratistas'>('empleados');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter workers based on search term
  const filteredEmpleados = useMemo(() => {
    if (!searchTerm) return empleados;
    const term = searchTerm.toLowerCase();
    return empleados.filter(
      (e) =>
        e.nombre.toLowerCase().includes(term) ||
        e.cargo?.toLowerCase().includes(term)
    );
  }, [empleados, searchTerm]);

  const filteredContratistas = useMemo(() => {
    if (!searchTerm) return contratistas;
    const term = searchTerm.toLowerCase();
    return contratistas.filter(
      (c) =>
        c.nombre.toLowerCase().includes(term) ||
        c.tipo_contrato?.toLowerCase().includes(term)
    );
  }, [contratistas, searchTerm]);

  // Check if worker is selected
  const isTrabajadorSelected = (id: string, type: 'empleado' | 'contratista'): boolean => {
    return selectedTrabajadores.some(
      (t) => t.type === type && t.data.id === id
    );
  };

  // Add worker to selection
  const addTrabajador = (trabajador: Trabajador) => {
    if (!isTrabajadorSelected(trabajador.data.id, trabajador.type)) {
      onSelectionChange([...selectedTrabajadores, trabajador]);
    }
  };

  // Remove worker from selection
  const removeTrabajador = (id: string, type: 'empleado' | 'contratista') => {
    onSelectionChange(
      selectedTrabajadores.filter(
        (t) => !(t.type === type && t.data.id === id)
      )
    );
  };

  // Toggle worker selection
  const toggleTrabajador = (id: string, type: 'empleado' | 'contratista', data: Empleado | Contratista) => {
    if (isTrabajadorSelected(id, type)) {
      removeTrabajador(id, type);
    } else {
      addTrabajador({ type, data } as Trabajador);
    }
  };

  // Toggle select all for current tab
  const toggleSelectAll = () => {
    const currentList = workerTab === 'empleados' ? filteredEmpleados : filteredContratistas;
    const allSelected = currentList.every((worker) =>
      isTrabajadorSelected(worker.id, workerTab === 'empleados' ? 'empleado' : 'contratista')
    );

    if (allSelected) {
      // Deselect all from current tab
      const newSelection = selectedTrabajadores.filter((t) => {
        if (workerTab === 'empleados') {
          return t.type !== 'empleado' || !filteredEmpleados.some((e) => e.id === t.data.id);
        } else {
          return t.type !== 'contratista' || !filteredContratistas.some((c) => c.id === t.data.id);
        }
      });
      onSelectionChange(newSelection);
    } else {
      // Select all from current tab
      const toAdd = currentList
        .filter((worker) => !isTrabajadorSelected(worker.id, workerTab === 'empleados' ? 'empleado' : 'contratista'))
        .map((worker) => ({
          type: workerTab === 'empleados' ? 'empleado' : 'contratista',
          data: worker,
        } as Trabajador));
      onSelectionChange([...selectedTrabajadores, ...toAdd]);
    }
  };

  // Count selected workers by type
  const selectedCount = {
    empleados: selectedTrabajadores.filter((t) => t.type === 'empleado').length,
    contratistas: selectedTrabajadores.filter((t) => t.type === 'contratista').length,
  };

  const totalSelected = selectedCount.empleados + selectedCount.contratistas;

  return (
    <div className="space-y-4">
      {/* Tabs for Employees vs Contractors */}
      <div className="flex justify-center border-b border-gray-200">
        <button
          type="button"
          onClick={() => {
            setWorkerTab('empleados');
            setSearchTerm('');
          }}
          disabled={disabled}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            workerTab === 'empleados'
              ? 'border-[#73991C] text-[#73991C]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Empleados ({empleados.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setWorkerTab('contratistas');
            setSearchTerm('');
          }}
          disabled={disabled}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            workerTab === 'contratistas'
              ? 'border-[#73991C] text-[#73991C]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Contratistas ({contratistas.length})
        </button>
      </div>

      {/* Search bar */}
      <div className="max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder={
              workerTab === 'empleados'
                ? 'Buscar empleado...'
                : 'Buscar contratista...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={disabled}
            className="pl-10"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-center">
          {workerTab === 'empleados'
            ? `${filteredEmpleados.length} empleados encontrados${
                searchTerm ? ` de ${empleados.length} totales` : ''
              }`
            : `${filteredContratistas.length} contratistas encontrados${
                searchTerm ? ` de ${contratistas.length} totales` : ''
              }`}
        </p>
      </div>

      {/* Select All / Deselect All button */}
      {((workerTab === 'empleados' && filteredEmpleados.length > 0) ||
        (workerTab === 'contratistas' && filteredContratistas.length > 0)) && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            disabled={disabled}
            className="text-sm"
          >
            {(workerTab === 'empleados' &&
              filteredEmpleados.every((e) =>
                isTrabajadorSelected(e.id, 'empleado')
              )) ||
            (workerTab === 'contratistas' &&
              filteredContratistas.every((c) =>
                isTrabajadorSelected(c.id, 'contratista')
              ))
              ? 'Deseleccionar Todos'
              : 'Seleccionar Todos'}
          </Button>
        </div>
      )}

      {/* Worker selection grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {workerTab === 'empleados' ? (
          filteredEmpleados.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-400">
              <div className="p-3 bg-gray-50 rounded-full mb-3">
                <Search className="h-6 w-6 opacity-30" />
              </div>
              <p className="text-sm font-medium">No se encontraron empleados</p>
              <p className="text-xs mt-1">
                {searchTerm
                  ? `No hay empleados que coincidan con "${searchTerm}"`
                  : 'No hay empleados disponibles'}
              </p>
              {searchTerm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="mt-2 text-xs"
                  disabled={disabled}
                >
                  Limpiar búsqueda
                </Button>
              )}
            </div>
          ) : (
            filteredEmpleados.map((empleado) => {
              const isSelected = isTrabajadorSelected(empleado.id, 'empleado');
              return (
                <button
                  key={empleado.id}
                  type="button"
                  onClick={() => toggleTrabajador(empleado.id, 'empleado', empleado)}
                  disabled={disabled}
                  className={`relative p-2 rounded-lg border-2 transition-all text-left hover:shadow-md ${
                    isSelected
                      ? 'border-[#73991C] bg-[#73991C]/5 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-[#73991C] rounded-full flex items-center justify-center">
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                  <p className="font-medium text-xs text-gray-900 pr-5 truncate">
                    {empleado.nombre}
                  </p>
                  {empleado.cargo && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{empleado.cargo}</p>
                  )}
                </button>
              );
            })
          )
        ) : filteredContratistas.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-400">
            <div className="p-3 bg-gray-50 rounded-full mb-3">
              <Search className="h-6 w-6 opacity-30" />
            </div>
            <p className="text-sm font-medium">No se encontraron contratistas</p>
            <p className="text-xs mt-1">
              {searchTerm
                ? `No hay contratistas que coincidan con "${searchTerm}"`
                : 'No hay contratistas disponibles'}
            </p>
            {searchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm('')}
                className="mt-2 text-xs"
                disabled={disabled}
              >
                Limpiar búsqueda
              </Button>
            )}
          </div>
        ) : (
          filteredContratistas.map((contratista) => {
            const isSelected = isTrabajadorSelected(contratista.id, 'contratista');
            return (
              <button
                key={contratista.id}
                type="button"
                onClick={() =>
                  toggleTrabajador(contratista.id, 'contratista', contratista)
                }
                disabled={disabled}
                className={`relative p-2 rounded-lg border-2 transition-all text-left hover:shadow-md ${
                  isSelected
                    ? 'border-[#73991C] bg-[#73991C]/5 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSelected && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-[#73991C] rounded-full flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
                <p className="font-medium text-xs text-gray-900 pr-5 truncate">
                  {contratista.nombre}
                </p>
                <Badge
                  variant="outline"
                  className="mt-0.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 px-1 py-0"
                >
                  {contratista.tipo_contrato}
                </Badge>
              </button>
            );
          })
        )}
      </div>

      {/* Selection summary */}
      {totalSelected > 0 && (
        <div className="bg-[#73991C]/5 border border-[#73991C]/20 rounded-lg p-3">
          <p className="text-sm text-[#172E08] text-center">
            <span className="font-semibold">{totalSelected}</span>{' '}
            {totalSelected === 1 ? 'trabajador seleccionado' : 'trabajadores seleccionados'}
            {selectedCount.empleados > 0 && selectedCount.contratistas > 0 && (
              <span className="text-gray-600">
                {' '}
                ({selectedCount.empleados} empleados, {selectedCount.contratistas}{' '}
                contratistas)
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
