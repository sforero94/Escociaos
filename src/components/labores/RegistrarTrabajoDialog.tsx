import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { CalendarIcon, Clock, DollarSign, Search } from 'lucide-react';

// Import types from main component
import type { Tarea, Empleado, Lote, RegistroTrabajo } from './Labores';

// Import cost calculation utilities
import { calculateLaborCost, STANDARD_WORKDAY_HOURS } from '../../utils/laborCosts';

interface RegistrarTrabajoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea: Tarea | null;
  empleados: Empleado[];
  lotes: Lote[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

const RegistrarTrabajoDialog: React.FC<RegistrarTrabajoDialogProps> = ({
  open,
  onOpenChange,
  tarea,
  empleados,
  lotes,
  onSuccess,
  onError,
}) => {
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const [fechaTrabajo, setFechaTrabajo] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEmpleados, setSelectedEmpleados] = useState<Empleado[]>([]);
  const [workMatrix, setWorkMatrix] = useState<Record<string, Record<string, RegistroTrabajo['fraccion_jornal']>>>({}); // empleado_id -> lote_id -> fraccion
  const [observaciones, setObservaciones] = useState<Record<string, Record<string, string>>>({}); // empleado_id -> lote_id -> observaciones
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // ✨ NUEVO: Búsqueda de empleados

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      setFechaTrabajo(new Date().toISOString().split('T')[0]);
      setSelectedEmpleados([]);
      setWorkMatrix({});
      setObservaciones({});
      setSearchTerm(''); // ✨ NUEVO: Limpiar búsqueda al abrir
    }
  }, [open]);

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  // ✨ NUEVO: Filtrar empleados por búsqueda
  const filteredEmpleados = empleados.filter(empleado =>
    empleado.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (empleado.cargo && empleado.cargo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addEmpleado = (empleado: Empleado) => {
    if (!selectedEmpleados.find(se => se.id === empleado.id)) {
      setSelectedEmpleados(prev => [...prev, empleado]);
    }
  };

  const removeEmpleado = (empleadoId: string) => {
    setSelectedEmpleados(prev => prev.filter(se => se.id !== empleadoId));
    // Also clean up the work matrix for this employee
    setWorkMatrix(prev => {
      const newMatrix = { ...prev };
      delete newMatrix[empleadoId];
      return newMatrix;
    });
    setObservaciones(prev => {
      const newObs = { ...prev };
      delete newObs[empleadoId];
      return newObs;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = filteredEmpleados.every(emp => selectedEmpleados.some(se => se.id === emp.id));
    if (allSelected) {
      // Deselect all filtered employees
      filteredEmpleados.forEach(emp => {
        removeEmpleado(emp.id);
      });
    } else {
      // Select all filtered employees
      filteredEmpleados.forEach(emp => {
        if (!selectedEmpleados.some(se => se.id === emp.id)) {
          addEmpleado(emp);
        }
      });
    }
  };

  const updateWorkFraccion = (empleadoId: string, loteId: string, fraccion: RegistroTrabajo['fraccion_jornal']) => {
    setWorkMatrix(prev => ({
      ...prev,
      [empleadoId]: {
        ...prev[empleadoId],
        [loteId]: fraccion
      }
    }));
  };

  const updateWorkObservaciones = (empleadoId: string, loteId: string, obs: string) => {
    setObservaciones(prev => ({
      ...prev,
      [empleadoId]: {
        ...prev[empleadoId],
        [loteId]: obs
      }
    }));
  };

  const calculateCostoJornal = (empleado: Empleado, fraccion: RegistroTrabajo['fraccion_jornal']) => {
    const costResult = calculateLaborCost({
      salary: empleado.salario || 0,
      benefits: empleado.prestaciones_sociales || 0,
      allowances: empleado.auxilios_no_salariales || 0,
      weeklyHours: empleado.horas_semanales || 48,
      fractionWorked: parseFloat(fraccion),
    });

    return costResult.totalCost;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tarea?.id) {
      onError('No se ha seleccionado una tarea válida');
      return;
    }

    if (selectedEmpleados.length === 0) {
      onError('Debe seleccionar al menos un empleado');
      return;
    }

    // Get lotes for this task
    const tareaLotes = tarea.lotes || (tarea.lote_ids ? tarea.lote_ids.map(id => lotes.find(l => l.id === id)).filter(Boolean) : []);

    setLoading(true);

    try {
      const registrosData: any[] = [];

      // Iterate through work matrix to create records
      selectedEmpleados.forEach(empleado => {
        tareaLotes.forEach(lote => {
          if (lote) {
            const fraccion = workMatrix[empleado.id]?.[lote.id] || '0.0';
            if (parseFloat(fraccion) > 0) { // Only create records for non-zero fractions
              registrosData.push({
                tarea_id: tarea.id,
                empleado_id: empleado.id,
                lote_id: lote.id,
                fecha_trabajo: fechaTrabajo,
                fraccion_jornal: fraccion,
                observaciones: observaciones[empleado.id]?.[lote.id] || null,
                valor_jornal_empleado: empleado.salario || 0,
                costo_jornal: calculateCostoJornal(empleado, fraccion as RegistroTrabajo['fraccion_jornal']),
              });
            }
          }
        });
      });

      if (registrosData.length === 0) {
        onError('Debe asignar al menos una fracción de jornal');
        return;
      }

      const { error } = await getSupabase()
        .from('registros_trabajo')
        .insert(registrosData);

      if (error) throw error;

      // Success message indicating automatic status change
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      // Handle specific validation errors from the database trigger
      if (error.message?.includes('jornales registrados')) {
        onError('Error de validación: ' + error.message);
      } else {
        onError(`Error al registrar trabajo: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fraccionJornalOptions = [
    { value: '0.25', label: '1/4 jornal (2 horas)', horas: 2 },
    { value: '0.5', label: '1/2 jornal (4 horas)', horas: 4 },
    { value: '0.75', label: '3/4 jornal (6 horas)', horas: 6 },
    { value: '1.0', label: '1 jornal completo (8 horas)', horas: 8 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1920px] max-h-[100vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Registrar Trabajo - {tarea?.nombre}
          </DialogTitle>
          <DialogDescription>
            Siga los pasos para registrar el trabajo realizado
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center space-x-4">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step <= currentStep
                      ? 'bg-[#73991C] text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {step}
                </div>
                <span className={`ml-2 text-sm ${
                  step <= currentStep ? 'text-[#73991C] font-medium' : 'text-gray-500'
                }`}>
                  {step === 1 ? 'Fecha' : step === 2 ? 'Empleados' : 'Matriz'}
                </span>
                {step < 3 && (
                  <div className={`w-12 h-0.5 mx-4 ${
                    step < currentStep ? 'bg-[#73991C]' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Select Date */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <CalendarIcon className="h-16 w-16 text-[#73991C] mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Seleccionar Fecha del Trabajo
                </h3>
                <p className="text-gray-600">
                  Elija la fecha en que se realizó el trabajo
                </p>
              </div>

              <div className="flex justify-center">
                <div className="space-y-2">
                  <Label htmlFor="fecha_trabajo" className="text-center block">
                    Fecha del Trabajo
                  </Label>
                  <Input
                    id="fecha_trabajo"
                    type="date"
                    value={fechaTrabajo}
                    onChange={(e) => setFechaTrabajo(e.target.value)}
                    disabled={loading}
                    max={new Date().toISOString().split('T')[0]}
                    className="text-center text-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Select Employees */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="h-16 w-16 bg-[#73991C]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Seleccionar Empleados
                </h3>
                <p className="text-gray-600">
                  Seleccione múltiples empleados que trabajaron en esta tarea
                </p>
              </div>

              {/* Select All / Deselect All button */}
              {filteredEmpleados.length > 0 && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="text-sm"
                  >
                    {filteredEmpleados.every(emp => selectedEmpleados.some(se => se.id === emp.id))
                      ? 'Deseleccionar Todos'
                      : 'Seleccionar Todos'
                    }
                  </Button>
                </div>
              )}

              {/* ✨ NUEVO: Campo de búsqueda */}
              <div className="max-w-md mx-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    type="text"
                    placeholder="Buscar empleado o cargo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  {filteredEmpleados.length} empleados encontrados
                  {searchTerm && ` de ${empleados.length} totales`}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredEmpleados.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-8 text-gray-400">
                    <div className="p-3 bg-gray-50 rounded-full mb-3">
                      <Search className="h-6 w-6 opacity-30" />
                    </div>
                    <p className="text-sm font-medium">No se encontraron empleados</p>
                    <p className="text-xs mt-1">
                      {searchTerm ? `No hay empleados que coincidan con "${searchTerm}"` : 'No hay empleados disponibles'}
                    </p>
                    {searchTerm && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchTerm('')}
                        className="mt-2 text-xs"
                      >
                        Limpiar búsqueda
                      </Button>
                    )}
                  </div>
                ) : (
                  filteredEmpleados.map((empleado) => {
                    const isSelected = selectedEmpleados.some(se => se.id === empleado.id);
                    return (
                      <button
                        key={empleado.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            removeEmpleado(empleado.id);
                          } else {
                            addEmpleado(empleado);
                          }
                        }}
                        className={`
                          relative p-4 rounded-xl border-2 transition-all text-left
                          hover:shadow-md
                          ${isSelected
                            ? 'border-[#73991C] bg-[#73991C]/5 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                          }
                        `}
                      >
                        {/* Check verde en esquina superior derecha al seleccionar */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-[#73991C] rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        
                        {/* Solo nombre, sin cargo */}
                        <p className="font-medium text-sm text-gray-900 pr-6">
                          {empleado.nombre}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedEmpleados.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>{selectedEmpleados.length}</strong> empleado{selectedEmpleados.length !== 1 ? 's' : ''} seleccionado{selectedEmpleados.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Matrix Interface */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="h-16 w-16 bg-[#73991C]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Asignar Trabajo por Lote
                </h3>
                <p className="text-gray-600">
                  Distribuya las fracciones de jornal entre empleados y lotes
                </p>
              </div>

              {selectedEmpleados.length > 0 && tarea && (
                <div className="bg-white rounded-2xl border border-[#73991C]/10 shadow-[0_2px_12px_rgba(115,153,28,0.06)] overflow-hidden">
                  {/* Header */}
                  <div className="px-5 py-3 bg-gradient-to-r from-[#73991C]/5 to-transparent border-b border-[#73991C]/10">
                    <h3 className="text-sm text-[#172E08] flex items-center gap-2">
                      <span className="text-xl">📋</span>
                      Matriz de Asignación Empleado × Lote
                    </h3>
                  </div>

                  {/* Tabla con scroll horizontal */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F8FAF5]">
                        <tr>
                          <th className="text-left py-3 px-5 text-xs font-medium text-[#4D240F]/70 sticky left-0 bg-[#F8FAF5] z-10">
                            Empleado
                          </th>
                          {(tarea.lotes || (tarea.lote_ids ? tarea.lote_ids.map(id => lotes.find(l => l.id === id)).filter(Boolean) : [])).map((lote) => (
                            <th key={lote?.id} className="text-center py-3 px-4 text-xs font-medium text-[#4D240F]/70 min-w-[160px]">
                              {lote?.nombre}
                            </th>
                          ))}
                          <th className="text-center py-3 px-4 text-xs font-medium text-[#4D240F]/70 sticky right-0 bg-[#F8FAF5] z-10">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#73991C]/5">
                        {selectedEmpleados.map((empleado) => {
                          const tareaLotes = tarea.lotes || (tarea.lote_ids ? tarea.lote_ids.map(id => lotes.find(l => l.id === id)).filter(Boolean) : []);
                          const totalFraccion = tareaLotes.reduce((sum, lote) => {
                            if (lote) {
                              const fraccion = workMatrix[empleado.id]?.[lote.id] || '0.0';
                              return sum + parseFloat(fraccion);
                            }
                            return sum;
                          }, 0);

                          return (
                            <tr key={empleado.id} className="hover:bg-[#F8FAF5] transition-colors">
                              <td className="py-3 px-5 sticky left-0 bg-white hover:bg-[#F8FAF5] z-10">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-[#172E08]">
                                    {empleado.nombre}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeEmpleado(empleado.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0 ml-2"
                                  >
                                    ✕
                                  </Button>
                                </div>
                              </td>
                              {tareaLotes.map((lote) => (
                                <td key={lote?.id} className="py-2 px-3 text-center">
                                  <div className="space-y-2">
                                    <Select
                                      value={workMatrix[empleado.id]?.[lote?.id || ''] || '0.0'}
                                      onValueChange={(value) => updateWorkFraccion(empleado.id, lote?.id || '', value as RegistroTrabajo['fraccion_jornal'])}
                                      disabled={loading}
                                    >
                                      <SelectTrigger className="h-9 text-xs border-[#73991C]/20 hover:border-[#73991C]/40">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0.0">-</SelectItem>
                                        <SelectItem value="0.25">1/4</SelectItem>
                                        <SelectItem value="0.5">1/2</SelectItem>
                                        <SelectItem value="0.75">3/4</SelectItem>
                                        <SelectItem value="1.0">1</SelectItem>
                                        <SelectItem value="1.5">1.5</SelectItem>
                                        <SelectItem value="2.0">2</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Textarea
                                      value={observaciones[empleado.id]?.[lote?.id || ''] || ''}
                                      onChange={(e) => updateWorkObservaciones(empleado.id, lote?.id || '', e.target.value)}
                                      placeholder="Observaciones (opcional)..."
                                      rows={2}
                                      className="text-xs resize-none border-[#73991C]/20 focus:border-[#73991C]/40"
                                      disabled={loading}
                                    />
                                  </div>
                                </td>
                              ))}
                              <td className="py-3 px-4 text-center sticky right-0 bg-white hover:bg-[#F8FAF5] z-10">
                                <span className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-sm font-semibold ${
                                  totalFraccion > 0
                                    ? 'bg-[#73991C]/10 text-[#73991C]'
                                    : 'bg-gray-100 text-gray-400'
                                }`}>
                                  {totalFraccion.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Resumen del Registro</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-green-700">Fecha:</span>
                    <span className="ml-2 font-medium">{new Date(fechaTrabajo).toLocaleDateString('es-CO')}</span>
                  </div>
                  <div>
                    <span className="text-green-700">Empleados:</span>
                    <span className="ml-2 font-medium">{selectedEmpleados.length}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-green-700">Registros a crear:</span>
                    <span className="ml-2 font-medium">
                      {selectedEmpleados.reduce((total, empleado) => {
                        const tareaLotes = tarea?.lotes || (tarea?.lote_ids ? tarea.lote_ids.map(id => lotes.find(l => l.id === id)).filter(Boolean) : []);
                        return total + tareaLotes.filter(lote => {
                          const fraccion = workMatrix[empleado.id]?.[lote?.id || ''] || '0.0';
                          return parseFloat(fraccion) > 0;
                        }).length;
                      }, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1 || loading}
          >
            Anterior
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>

            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={
                  (currentStep === 1 && !fechaTrabajo) ||
                  (currentStep === 2 && selectedEmpleados.length === 0)
                }
                className="bg-[#73991C] hover:bg-[#5a7716]"
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="bg-[#73991C] hover:bg-[#5a7716]"
              >
                {loading ? 'Registrando...' : 'Registrar Trabajo'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarTrabajoDialog;