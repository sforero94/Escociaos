import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { formatearFecha } from '../../utils/fechas';
import { StandardDialog } from '../ui/standard-dialog';
import { CalendarIcon, Clock } from 'lucide-react';

// Import types from main component
import type { Tarea, Empleado, Contratista, Trabajador, Lote, RegistroTrabajo } from './Labores';

// Import shared components
import { TrabajadorMultiSelect } from '../shared/TrabajadorMultiSelect';
import { JornalFractionMatrix } from '../shared/JornalFractionMatrix';

// Import cost calculation utilities
import { calculateLaborCost, calculateContractorCost } from '../../utils/laborCosts';

// Import shared types for matrix operations
import type { WorkMatrix, ObservacionesMatrix } from '../../types/shared';

interface RegistrarTrabajoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea: Tarea | null;
  empleados: Empleado[];
  contratistas: Contratista[];
  lotes: Lote[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

const RegistrarTrabajoDialog: React.FC<RegistrarTrabajoDialogProps> = ({
  open,
  onOpenChange,
  tarea,
  empleados,
  contratistas,
  lotes,
  onSuccess,
  onError,
}) => {
  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(1);
  const [fechaTrabajo, setFechaTrabajo] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTrabajadores, setSelectedTrabajadores] = useState<Trabajador[]>([]);
  const [workMatrix, setWorkMatrix] = useState<WorkMatrix>({}); // Use shared WorkMatrix type
  const [observaciones, setObservaciones] = useState<ObservacionesMatrix>({}); // Use shared ObservacionesMatrix type
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      setFechaTrabajo(new Date().toISOString().split('T')[0]);
      setSelectedTrabajadores([]);
      setWorkMatrix({});
      setObservaciones({});
    }
  }, [open]);

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  // Handle worker removal - cleanup work matrix when a worker is removed
  const handleRemoveTrabajador = (trabajadorId: string) => {
    setSelectedTrabajadores(prev => prev.filter(st => st.data.id !== trabajadorId));
    setWorkMatrix(prev => {
      const newMatrix = { ...prev };
      delete newMatrix[trabajadorId];
      return newMatrix;
    });
    setObservaciones(prev => {
      const newObs = { ...prev };
      delete newObs[trabajadorId];
      return newObs;
    });
  };

  const calculateCostoJornal = (trabajador: Trabajador, fraccion: RegistroTrabajo['fraccion_jornal']) => {
    if (trabajador.type === 'contratista') {
      console.log('💵 Calculating contractor cost:', {
        nombre: trabajador.data.nombre,
        tarifa_jornal: trabajador.data.tarifa_jornal,
        fraccion: fraccion,
        fraccion_parsed: parseFloat(fraccion)
      });
      const costResult = calculateContractorCost(
        trabajador.data.tarifa_jornal,
        parseFloat(fraccion)
      );
      console.log('💰 Contractor cost result:', costResult);
      return costResult.totalCost;
    } else {
      const costResult = calculateLaborCost({
        salary: trabajador.data.salario || 0,
        benefits: trabajador.data.prestaciones_sociales || 0,
        allowances: trabajador.data.auxilios_no_salariales || 0,
        weeklyHours: trabajador.data.horas_semanales || 48,
        fractionWorked: parseFloat(fraccion),
      });
      return costResult.totalCost;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tarea?.id) {
      onError('No se ha seleccionado una tarea válida');
      return;
    }

    if (selectedTrabajadores.length === 0) {
      onError('Debe seleccionar al menos un trabajador (empleado o contratista)');
      return;
    }

    // Get lotes for this task - prioritize lote_ids over lotes array
    const tareaLotes = (tarea.lote_ids && tarea.lote_ids.length > 0)
      ? tarea.lote_ids.map(id => lotes.find(l => l.id === id)).filter(Boolean)
      : (tarea.lotes && tarea.lotes.length > 0 ? tarea.lotes : []);

    setLoading(true);

    try {
      const registrosData: any[] = [];

      // Iterate through work matrix to create records
      selectedTrabajadores.forEach((trabajador: Trabajador) => {
        tareaLotes.forEach(lote => {
          if (lote) {
            const fraccion = workMatrix[trabajador.data.id]?.[lote.id] || '0.0';
            if (parseFloat(fraccion) > 0) {
              const registro: any = {
                tarea_id: tarea.id,
                lote_id: lote.id,
                fecha_trabajo: fechaTrabajo,
                fraccion_jornal: fraccion,
                observaciones: observaciones[trabajador.data.id]?.[lote.id] || null,
                costo_jornal: calculateCostoJornal(trabajador, fraccion as RegistroTrabajo['fraccion_jornal']),
              };

              // Set either empleado_id or contratista_id based on worker type
              if (trabajador.type === 'empleado') {
                registro.empleado_id = trabajador.data.id;
                registro.contratista_id = null;
                registro.valor_jornal_empleado = trabajador.data.salario || 0;
              } else {
                registro.empleado_id = null;
                registro.contratista_id = trabajador.data.id;
                registro.valor_jornal_empleado = null;
              }

              registrosData.push(registro);
            }
          }
        });
      });

      if (registrosData.length === 0) {
        onError('Debe asignar al menos una fracción de jornal');
        return;
      }

      // Check for duplicate records before inserting
      const empleadoIds = registrosData.filter(r => r.empleado_id).map(r => r.empleado_id);
      const contratistaIds = registrosData.filter(r => r.contratista_id).map(r => r.contratista_id);
      const loteIds = registrosData.map(r => r.lote_id);

      // Build OR conditions only for non-empty arrays
      const orConditions: string[] = [];
      if (empleadoIds.length > 0) {
        orConditions.push(`empleado_id.in.(${empleadoIds.join(',')})`);
      }
      if (contratistaIds.length > 0) {
        orConditions.push(`contratista_id.in.(${contratistaIds.join(',')})`);
      }

      // Only check for duplicates if we have workers to check
      let existingRecords: any[] = [];
      if (orConditions.length > 0) {
        const { data, error: checkError } = await getSupabase()
          .from('registros_trabajo')
          .select('empleado_id, contratista_id, lote_id, empleados(nombre), contratistas(nombre)')
          .eq('tarea_id', tarea.id)
          .eq('fecha_trabajo', fechaTrabajo)
          .or(orConditions.join(','))
          .in('lote_id', loteIds);

        if (checkError) throw checkError;
        existingRecords = data || [];
      }

      // Find duplicates
      const duplicates: string[] = [];
      if (existingRecords && existingRecords.length > 0) {
        registrosData.forEach(newRecord => {
          const isDuplicate = (existingRecords as any[]).some(
            (existing: any) =>
              (existing.empleado_id === newRecord.empleado_id && newRecord.empleado_id) ||
              (existing.contratista_id === newRecord.contratista_id && newRecord.contratista_id) &&
              existing.lote_id === newRecord.lote_id
          );
          if (isDuplicate) {
            const trabajador = selectedTrabajadores.find((t: Trabajador) =>
              (t.type === 'empleado' && t.data.id === newRecord.empleado_id) ||
              (t.type === 'contratista' && t.data.id === newRecord.contratista_id)
            );
            const trabajadorNombre = trabajador?.data.nombre || 'Desconocido';
            const loteNombre = tareaLotes.find((l: any) => l && l.id === newRecord.lote_id)?.nombre || 'Desconocido';
            duplicates.push(`${trabajadorNombre} en ${loteNombre}`);
          }
        });
      }

      if (duplicates.length > 0) {
        onError(`Ya existe registro de trabajo para esta fecha:\n${duplicates.join('\n')}`);
        return;
      }

      console.log('📝 Attempting to insert work records:', JSON.stringify(registrosData, null, 2));

      const { error } = await getSupabase()
        .from('registros_trabajo')
        .insert(registrosData);

      if (error) {
        console.error('❌ Supabase insert error:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

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

  // Get task lots for Step 3 work matrix
  const tareaLotes = (tarea && tarea.lote_ids && tarea.lote_ids.length > 0)
    ? tarea.lote_ids.map((id: string) => lotes.find((l: Lote) => l.id === id)).filter((l: Lote | undefined): l is Lote => l !== undefined)
    : (tarea?.lotes && tarea.lotes.length > 0 ? tarea.lotes : []);

  const footerButtons = (
    <>
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
              (currentStep === 2 && selectedTrabajadores.length === 0)
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
    </>
  );

  return (
    <StandardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <Clock className="h-5 w-5 inline mr-2" />
          Registrar Trabajo - {tarea?.nombre}
        </>
      }
      description="Siga los pasos para registrar el trabajo realizado"
      size="xl"
      footer={footerButtons}
    >
      <>
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

          {/* Step 2: Select Workers (Employees + Contractors) - Using Shared Component */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="h-16 w-16 bg-[#73991C]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Seleccionar Trabajadores
                </h3>
                <p className="text-gray-600">
                  Seleccione empleados o contratistas que trabajaron en esta tarea
                </p>
              </div>

              <TrabajadorMultiSelect
                empleados={empleados}
                contratistas={contratistas}
                selectedTrabajadores={selectedTrabajadores}
                onSelectionChange={setSelectedTrabajadores}
                disabled={loading}
              />
            </div>
          )}

          {/* Step 3: Matrix Interface - Using Shared Component */}
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
                  Distribuya las fracciones de jornal entre trabajadores y lotes
                </p>
              </div>

              <JornalFractionMatrix
                trabajadores={selectedTrabajadores}
                lotes={tareaLotes}
                workMatrix={workMatrix}
                observaciones={observaciones}
                onFraccionChange={(trabajadorId, loteId, frac) => {
                  setWorkMatrix(prev => ({
                    ...prev,
                    [trabajadorId]: { ...prev[trabajadorId], [loteId]: frac }
                  }));
                }}
                onObservacionesChange={(trabajadorId, loteId, obs) => {
                  setObservaciones(prev => ({
                    ...prev,
                    [trabajadorId]: { ...prev[trabajadorId], [loteId]: obs }
                  }));
                }}
                onRemoveTrabajador={handleRemoveTrabajador}
                disabled={loading}
                showCostPreview={true}
              />

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Resumen del Registro</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-green-700">Fecha:</span>
                    <span className="ml-2 font-medium">{formatearFecha(fechaTrabajo)}</span>
                  </div>
                  <div>
                    <span className="text-green-700">Trabajadores:</span>
                    <span className="ml-2 font-medium">{selectedTrabajadores.length}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-green-700">Registros a crear:</span>
                    <span className="ml-2 font-medium">
                      {selectedTrabajadores.reduce((total: number, trabajador: Trabajador) => {
                        return total + tareaLotes.filter((lote: Lote) => {
                          const fraccion = workMatrix[trabajador.data.id]?.[lote.id] || '0.0';
                          return parseFloat(fraccion) > 0;
                        }).length;
                      }, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
      </>
    </StandardDialog>
  );
};

export default RegistrarTrabajoDialog;