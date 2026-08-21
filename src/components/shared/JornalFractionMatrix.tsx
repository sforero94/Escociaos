// JornalFractionMatrix.tsx
// Reusable work matrix component for assigning jornal fractions across workers and lotes
// Used in both RegistrarTrabajoDialog and DailyMovementForm for consistent UX

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Trabajador, Lote, WorkMatrix, ObservacionesMatrix } from '../../types/shared';
import { calculateLaborCost, calculateContractorCost } from '../../utils/laborCosts';

export interface JornalFractionMatrixProps {
  trabajadores: Trabajador[];
  lotes: Lote[];
  workMatrix: WorkMatrix;
  observaciones: ObservacionesMatrix;
  onFraccionChange: (trabajadorId: string, loteId: string, fraccion: string) => void;
  onObservacionesChange: (trabajadorId: string, loteId: string, obs: string) => void;
  onRemoveTrabajador?: (trabajadorId: string) => void;
  disabled?: boolean;
  showCostPreview?: boolean; // Show calculated cost per worker
}

/**
 * Los dos controles de una asignación (fracción + observación). Viven en un solo lugar a
 * proposito: el componente tiene dos disposiciones — tabla horizontal para varios lotes y lista
 * vertical para uno solo — y si cada una trajera su propia copia del `Select`, las opciones de
 * jornal podrian divergir sin que ningun test lo note.
 */
function ControlesAsignacion({
  trabajadorId,
  loteId,
  workMatrix,
  observaciones,
  onFraccionChange,
  onObservacionesChange,
  disabled,
}: {
  trabajadorId: string;
  loteId: string;
  workMatrix: WorkMatrix;
  observaciones: ObservacionesMatrix;
  onFraccionChange: (trabajadorId: string, loteId: string, fraccion: string) => void;
  onObservacionesChange: (trabajadorId: string, loteId: string, obs: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <Select
        value={workMatrix[trabajadorId]?.[loteId] || '0.0'}
        onValueChange={(value) => onFraccionChange(trabajadorId, loteId, value)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs border-primary/20 hover:border-primary/40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.0">-</SelectItem>
          <SelectItem value="0.25">2 horas</SelectItem>
          <SelectItem value="0.5">4 horas</SelectItem>
          <SelectItem value="0.75">6 horas</SelectItem>
          <SelectItem value="1.0">8 horas</SelectItem>
        </SelectContent>
      </Select>

      <Textarea
        value={observaciones[trabajadorId]?.[loteId] || ''}
        onChange={(e) => onObservacionesChange(trabajadorId, loteId, e.target.value)}
        placeholder="Notas..."
        rows={2}
        className="text-xs resize-none border-primary/20 focus:border-primary/40"
        disabled={disabled}
      />
    </>
  );
}

export function JornalFractionMatrix({
  trabajadores,
  lotes,
  workMatrix,
  observaciones,
  onFraccionChange,
  onObservacionesChange,
  onRemoveTrabajador,
  disabled = false,
  showCostPreview = false,
}: JornalFractionMatrixProps) {
  // Calculate responsive column width based on lot count
  const getColumnWidth = (lotCount: number): string => {
    if (lotCount <= 2) return 'min-w-[200px]';
    if (lotCount <= 4) return 'min-w-[160px]';
    if (lotCount <= 6) return 'min-w-[140px]';
    return 'min-w-[120px]';
  };

  // Calculate total fractions worked by a worker across all lotes
  const calculateTotalFraccion = (trabajadorId: string): number => {
    return lotes.reduce((sum, lote) => {
      const fraccion = workMatrix[trabajadorId]?.[lote.id] || '0.0';
      return sum + parseFloat(fraccion);
    }, 0);
  };

  // Calculate cost for a worker (type-aware)
  const calculateCosto = (trabajador: Trabajador, fraccion: number): number => {
    if (fraccion === 0) return 0;

    try {
      if (trabajador.type === 'empleado') {
        const { totalCost } = calculateLaborCost({
          salary: trabajador.data.salario || 0,
          benefits: trabajador.data.prestaciones_sociales || 0,
          allowances: trabajador.data.auxilios_no_salariales || 0,
          weeklyHours: trabajador.data.horas_semanales || 48,
          fractionWorked: fraccion,
        });
        return totalCost;
      } else {
        const { totalCost } = calculateContractorCost(
          trabajador.data.tarifa_jornal || 0,
          fraccion
        );
        return totalCost;
      }
    } catch {
      return 0;
    }
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (trabajadores.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">
          No hay trabajadores seleccionados. Seleccione al menos un trabajador para continuar.
        </p>
      </div>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No hay lotes disponibles para esta tarea.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-primary/10 shadow-[0_2px_12px_rgba(115,153,28,0.06)] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-gradient-to-r from-primary/5 to-transparent border-b border-primary/10">
          <h3 className="text-sm text-foreground flex items-center gap-2">
            <span className="text-xl">📋</span>
            Matriz de Asignación Trabajador × Lote
          </h3>
        </div>

        {/* Scroll guidance for many lots */}
        {lotes.length > 5 && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-blue-900">
              Esta matriz tiene {lotes.length} lotes. Desliza horizontalmente para ver todos. ←→
            </p>
          </div>
        )}

        {/* Un solo lote -> LISTA VERTICAL, no tabla.
            Por que existe esta rama: la tabla de abajo fija la columna del trabajador a la
            izquierda y la del total a la derecha, y deja las columnas de lote desplazandose en
            el medio. Eso funciona en el dialogo ancho de Labores, pero `DailyMovementForm`
            monta esta matriz en un panel lateral de 480px y SIEMPRE le pasa exactamente un
            lote (un movimiento diario es de un solo lote). Medido en produccion el 2026-08-21:
            contenedor 445px, columna Trabajador 434px, columna Total 87px -- las dos fijas
            suman 521px dentro de 445px, se superponen entre si y tapan por completo la unica
            columna que tiene los controles, que quedaba dibujada fuera de la pantalla.
            Deslizar no ayudaba: una columna `sticky` se queda clavada encima. Resultado: era
            IMPOSIBLE cargar el jornal desde esa pantalla.
            Con un solo lote la tabla no aporta nada -- no hay nada que comparar entre columnas --
            asi que se cae a una lista, que no tiene ancho minimo ni scroll horizontal. */}
        {lotes.length === 1 ? (
          <ul className="divide-y divide-primary/5">
            {trabajadores.map((trabajador) => {
              const lote = lotes[0];
              const totalFraccion = calculateTotalFraccion(trabajador.data.id!);
              const totalCosto = showCostPreview ? calculateCosto(trabajador, totalFraccion) : 0;

              return (
                <li key={trabajador.data.id!} className="space-y-3 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {trabajador.data.nombre}
                        </span>
                        {trabajador.type === 'contratista' ? (
                          <Badge
                            variant="outline"
                            className="flex-shrink-0 border-blue-200 bg-blue-50 text-xs text-blue-700"
                          >
                            {trabajador.data.tipo_contrato}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="flex-shrink-0 border-green-200 bg-green-50 text-xs text-green-700"
                          >
                            Empleado
                          </Badge>
                        )}
                      </div>
                      {showCostPreview && totalFraccion > 0 && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          Costo: {formatCurrency(totalCosto)}
                        </p>
                      )}
                    </div>

                    <span
                      className={`inline-flex flex-shrink-0 items-center justify-center rounded-lg px-3 py-1 text-sm font-semibold ${
                        totalFraccion > 0
                          ? 'bg-primary/10 text-primary'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {totalFraccion.toFixed(2)}
                    </span>

                    {onRemoveTrabajador && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveTrabajador(trabajador.data.id!)}
                        disabled={disabled}
                        className="h-7 w-7 flex-shrink-0 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        ✕
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                    <ControlesAsignacion
                      trabajadorId={trabajador.data.id!}
                      loteId={lote.id}
                      workMatrix={workMatrix}
                      observaciones={observaciones}
                      onFraccionChange={onFraccionChange}
                      onObservacionesChange={onObservacionesChange}
                      disabled={disabled}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          /* Varios lotes: la tabla horizontal original, con scroll y columnas fijas. */
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-brand-brown/70 sticky left-0 bg-background z-10">
                  Trabajador
                </th>
                {lotes.map((lote) => (
                  <th
                    key={lote.id}
                    className={`text-center py-3 px-2 text-xs font-medium text-brand-brown/70 ${getColumnWidth(
                      lotes.length
                    )}`}
                  >
                    {lote.nombre}
                  </th>
                ))}
                <th className="text-center py-3 px-4 text-xs font-medium text-brand-brown/70 sticky right-0 bg-background z-10">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {trabajadores.map((trabajador) => {
                const totalFraccion = calculateTotalFraccion(trabajador.data.id!);
                const totalCosto = showCostPreview ? calculateCosto(trabajador, totalFraccion) : 0;

                return (
                  <tr
                    key={trabajador.data.id!}
                    className="hover:bg-background transition-colors"
                  >
                    {/* Worker name column (sticky left) */}
                    <td className="py-3 px-5 sticky left-0 bg-white hover:bg-background z-10">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {trabajador.data.nombre}
                            </span>
                            {trabajador.type === 'contratista' && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0"
                              >
                                {trabajador.data.tipo_contrato}
                              </Badge>
                            )}
                            {trabajador.type === 'empleado' && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-green-50 text-green-700 border-green-200 flex-shrink-0"
                              >
                                Empleado
                              </Badge>
                            )}
                          </div>
                          {showCostPreview && totalFraccion > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Costo: {formatCurrency(totalCosto)}
                            </p>
                          )}
                        </div>
                        {onRemoveTrabajador && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveTrabajador(trabajador.data.id!)}
                            disabled={disabled}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0 ml-2 flex-shrink-0"
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    </td>

                    {/* Lote columns (fractions + observations) */}
                    {lotes.map((lote) => (
                      <td key={lote.id} className="py-2 px-2 text-center">
                        <div className="space-y-1.5">
                          <ControlesAsignacion
                            trabajadorId={trabajador.data.id!}
                            loteId={lote.id}
                            workMatrix={workMatrix}
                            observaciones={observaciones}
                            onFraccionChange={onFraccionChange}
                            onObservacionesChange={onObservacionesChange}
                            disabled={disabled}
                          />
                        </div>
                      </td>
                    ))}

                    {/* Total column (sticky right) */}
                    <td className="py-3 px-4 text-center sticky right-0 bg-white hover:bg-background z-10">
                      <span
                        className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-sm font-semibold ${
                          totalFraccion > 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {totalFraccion.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Summary footer */}
        <div className="px-5 py-3 bg-background border-t border-primary/10">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">
              {trabajadores.length} trabajador{trabajadores.length !== 1 ? 'es' : ''}
            </span>
            <span className="text-gray-600">
              {lotes.length} lote{lotes.length !== 1 ? 's' : ''}
            </span>
            <span className="font-medium text-foreground">
              Total registros a crear:{' '}
              {trabajadores.reduce((count, trabajador) => {
                const workerRecords = lotes.filter(
                  (lote) =>
                    parseFloat(workMatrix[trabajador.data.id!]?.[lote.id] || '0.0') > 0
                ).length;
                return count + workerRecords;
              }, 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 space-y-1">
            <p className="font-medium">Fracciones de jornal (8 horas)</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 text-blue-800">
              <li>2 horas = 0.25 jornal (1/4 del día)</li>
              <li>4 horas = 0.5 jornal (1/2 del día)</li>
              <li>6 horas = 0.75 jornal (3/4 del día)</li>
              <li>8 horas = 1.0 jornal (día completo)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
