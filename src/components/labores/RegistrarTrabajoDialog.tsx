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
import { CalendarIcon, Clock, DollarSign, Search } from 'lucide-react';

// Import types from main component
import type { Tarea, Empleado, RegistroTrabajo } from './Labores';

interface RegistrarTrabajoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea: Tarea | null;
  empleados: Empleado[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

const RegistrarTrabajoDialog: React.FC<RegistrarTrabajoDialogProps> = ({
  open,
  onOpenChange,
  tarea,
  empleados,
  onSuccess,
  onError,
}) => {
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const [fechaTrabajo, setFechaTrabajo] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEmpleados, setSelectedEmpleados] = useState<{ empleado: Empleado; fraccion: RegistroTrabajo['fraccion_jornal']; observaciones: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // ✨ NUEVO: Búsqueda de empleados

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      setFechaTrabajo(new Date().toISOString().split('T')[0]);
      setSelectedEmpleados([]);
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
    if (!selectedEmpleados.find(se => se.empleado.id === empleado.id)) {
      setSelectedEmpleados(prev => [...prev, {
        empleado,
        fraccion: '1.0' as RegistroTrabajo['fraccion_jornal'],
        observaciones: ''
      }]);
    }
  };

  const removeEmpleado = (empleadoId: string) => {
    setSelectedEmpleados(prev => prev.filter(se => se.empleado.id !== empleadoId));
  };

  const updateEmpleadoFraccion = (empleadoId: string, fraccion: RegistroTrabajo['fraccion_jornal']) => {
    setSelectedEmpleados(prev => prev.map(se =>
      se.empleado.id === empleadoId ? { ...se, fraccion } : se
    ));
  };

  const updateEmpleadoObservaciones = (empleadoId: string, observaciones: string) => {
    setSelectedEmpleados(prev => prev.map(se =>
      se.empleado.id === empleadoId ? { ...se, observaciones } : se
    ));
  };

  const calculateCostoJornal = (empleado: Empleado, fraccion: RegistroTrabajo['fraccion_jornal']) => {
    const salario = empleado.salario || 0;
    const prestaciones = empleado.prestaciones_sociales || 0;
    const auxilios = empleado.auxilios_no_salariales || 0;
    const horasSemanales = empleado.horas_semanales || 48; // Default 48h semanales
    
    // Costo por hora
    const costoHora = (salario + prestaciones + auxilios) / horasSemanales;
    
    // Costo por jornal (8 horas × fracción)
    return costoHora * 8 * parseFloat(fraccion);
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

    setLoading(true);

    try {
      const registrosData = selectedEmpleados.map(se => ({
        tarea_id: tarea.id,
        empleado_id: se.empleado.id,
        fecha_trabajo: fechaTrabajo,
        fraccion_jornal: se.fraccion,
        observaciones: se.observaciones || null,
        valor_jornal_empleado: se.empleado.salario || 0,
        costo_jornal: calculateCostoJornal(se.empleado, se.fraccion),
      }));

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
                  {step === 1 ? 'Fecha' : step === 2 ? 'Empleados' : 'Jornales'}
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
                  Elija los empleados que trabajaron en esta tarea
                </p>
              </div>

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
                  <div className="col-span-full">
                    {filteredEmpleados.map((empleado) => {
                      const isSelected = selectedEmpleados.some(se => se.empleado.id === empleado.id);
                      return (
                        <div
                          key={empleado.id}
                          onClick={() => isSelected ? removeEmpleado(empleado.id) : addEmpleado(empleado)}
                          className={`p-2.5 border-2 rounded-md cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#73991C] bg-[#73991C]/5'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium text-gray-900 text-xs truncate">{empleado.nombre}</h4>
                              {empleado.cargo && (
                                <Badge variant="outline" className="text-[10px] mt-0.5 px-1 py-0">
                                  {empleado.cargo}
                                </Badge>
                              )}
                              {empleado.salario && (
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  ${empleado.salario.toLocaleString()}/jornal
                                </p>
                              )}
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ml-2 ${
                              isSelected ? 'border-[#73991C] bg-[#73991C]' : 'border-gray-300'
                            }`}>
                              {isSelected && <span className="text-white text-[10px]">✓</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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

          {/* Step 3: Assign Jornales */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <DollarSign className="h-16 w-16 text-[#73991C] mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Asignar Jornales
                </h3>
                <p className="text-gray-600">
                  Especifique las fracciones de jornal y observaciones para cada empleado
                </p>
              </div>

              <div className="space-y-4">
                {selectedEmpleados.map((selectedEmpleado, index) => (
                  <div key={selectedEmpleado.empleado.id} className="bg-gray-50 p-4 rounded-lg border">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {selectedEmpleado.empleado.nombre}
                        </h4>
                        {selectedEmpleado.empleado.cargo && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {selectedEmpleado.empleado.cargo}
                          </Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeEmpleado(selectedEmpleado.empleado.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        ✕
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fracción de Jornal</Label>
                        <Select
                          value={selectedEmpleado.fraccion}
                          onValueChange={(value) => updateEmpleadoFraccion(selectedEmpleado.empleado.id, value as RegistroTrabajo['fraccion_jornal'])}
                          disabled={loading}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fraccionJornalOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{option.label}</span>
                                  <span className="text-xs text-gray-500 ml-2">
                                    {option.horas}h
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Costo Calculado</Label>
                        <div className="bg-white p-3 rounded border text-center">
                          <span className="text-lg font-semibold text-[#73991C]">
                            ${calculateCostoJornal(selectedEmpleado.empleado, selectedEmpleado.fraccion).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <Label>Observaciones</Label>
                      <Textarea
                        value={selectedEmpleado.observaciones}
                        onChange={(e) => updateEmpleadoObservaciones(selectedEmpleado.empleado.id, e.target.value)}
                        placeholder="Observaciones específicas para este empleado..."
                        rows={2}
                        disabled={loading}
                      />
                    </div>
                  </div>
                ))}
              </div>

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
                    <span className="text-green-700">Costo Total:</span>
                    <span className="ml-2 text-lg font-bold text-green-700">
                      ${selectedEmpleados.reduce((total, se) =>
                        total + calculateCostoJornal(se.empleado, se.fraccion), 0
                      ).toLocaleString()}
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