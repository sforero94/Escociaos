import React, { useState, useEffect, useMemo } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, User, Briefcase } from 'lucide-react';
import { calculateLaborCost, calculateContractorCost } from '@/utils/laborCosts';

import type { RegistroTrabajo, Empleado, Contratista, Lote } from './Labores';

type FraccionJornal = '0.25' | '0.5' | '0.75' | '1.0';

const FRACCION_OPTIONS: { value: FraccionJornal; label: string }[] = [
  { value: '0.25', label: '1/4 jornal (2h)' },
  { value: '0.5', label: '1/2 jornal (4h)' },
  { value: '0.75', label: '3/4 jornal (6h)' },
  { value: '1.0', label: 'Jornal completo (8h)' },
];

interface EditarRegistroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registro: RegistroTrabajo | null;
  empleados: Empleado[];
  contratistas: Contratista[];
  lotes: Lote[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

const EditarRegistroDialog: React.FC<EditarRegistroDialogProps> = ({
  open,
  onOpenChange,
  registro,
  empleados,
  contratistas,
  lotes,
  onSuccess,
  onError,
}) => {
  const [tipoTrabajador, setTipoTrabajador] = useState<'empleado' | 'contratista'>('empleado');
  const [trabajadorId, setTrabajadorId] = useState<string>('');
  const [loteId, setLoteId] = useState<string>('');
  const [fraccionJornal, setFraccionJornal] = useState<FraccionJornal>('1.0');
  const [observaciones, setObservaciones] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize form from registro when dialog opens
  useEffect(() => {
    if (open && registro) {
      const isContratista = !!(registro as any).contratistas || !!registro.contratista_id;
      setTipoTrabajador(isContratista ? 'contratista' : 'empleado');
      setTrabajadorId(
        isContratista
          ? (registro.contratista_id || '')
          : (registro.empleado_id || '')
      );
      setLoteId(registro.lote_id || '');
      setFraccionJornal(registro.fraccion_jornal as FraccionJornal);
      setObservaciones(registro.observaciones || '');
      setSearchTerm('');
    }
  }, [open, registro]);

  // Get the selected worker object
  const selectedWorker = useMemo(() => {
    if (!trabajadorId) return null;
    if (tipoTrabajador === 'empleado') {
      return empleados.find(e => e.id === trabajadorId) || null;
    } else {
      return contratistas.find(c => c.id === trabajadorId) || null;
    }
  }, [tipoTrabajador, trabajadorId, empleados, contratistas]);

  // Calculate cost preview
  const costoPreview = useMemo(() => {
    if (!selectedWorker || !fraccionJornal) return 0;
    const fraccion = parseFloat(fraccionJornal);
    if (tipoTrabajador === 'contratista') {
      return calculateContractorCost(
        (selectedWorker as Contratista).tarifa_jornal,
        fraccion
      ).totalCost;
    } else {
      const emp = selectedWorker as Empleado;
      return calculateLaborCost({
        salary: emp.salario || 0,
        benefits: emp.prestaciones_sociales || 0,
        allowances: emp.auxilios_no_salariales || 0,
        weeklyHours: emp.horas_semanales || 48,
        fractionWorked: fraccion,
      }).totalCost;
    }
  }, [selectedWorker, fraccionJornal, tipoTrabajador]);

  // Filter workers by search term
  const filteredWorkers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (tipoTrabajador === 'empleado') {
      return empleados.filter(e => e.nombre.toLowerCase().includes(term));
    } else {
      return contratistas.filter(c => c.nombre.toLowerCase().includes(term));
    }
  }, [tipoTrabajador, searchTerm, empleados, contratistas]);

  const handleSubmit = async () => {
    if (!registro?.id || !trabajadorId) {
      onError('Datos incompletos para actualizar el registro');
      return;
    }

    setLoading(true);
    try {
      const isContratista = tipoTrabajador === 'contratista';
      const fraccion = parseFloat(fraccionJornal);

      // Calculate cost
      let costoJornal: number;
      let valorJornalEmpleado: number | null = null;

      if (isContratista) {
        const contratista = contratistas.find(c => c.id === trabajadorId);
        if (!contratista) throw new Error('Contratista no encontrado');
        costoJornal = calculateContractorCost(contratista.tarifa_jornal, fraccion).totalCost;
      } else {
        const empleado = empleados.find(e => e.id === trabajadorId);
        if (!empleado) throw new Error('Empleado no encontrado');
        costoJornal = calculateLaborCost({
          salary: empleado.salario || 0,
          benefits: empleado.prestaciones_sociales || 0,
          allowances: empleado.auxilios_no_salariales || 0,
          weeklyHours: empleado.horas_semanales || 48,
          fractionWorked: fraccion,
        }).totalCost;
        valorJornalEmpleado = empleado.salario || 0;
      }

      const { error } = await getSupabase()
        .from('registros_trabajo')
        .update({
          empleado_id: isContratista ? null : trabajadorId,
          contratista_id: isContratista ? trabajadorId : null,
          lote_id: loteId || null,
          fraccion_jornal: fraccionJornal,
          observaciones: observaciones || null,
          costo_jornal: costoJornal,
          valor_jornal_empleado: valorJornalEmpleado,
        })
        .eq('id', registro.id);

      if (error) throw error;

      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al actualizar el registro';
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!registro) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Editar Registro de Trabajo</DialogTitle>
          <DialogDescription>
            Modifica los datos del registro de trabajo
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-6 py-5 space-y-5 mx-0">
          {/* Worker type toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de trabajador</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={tipoTrabajador === 'empleado' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => { setTipoTrabajador('empleado'); setTrabajadorId(''); setSearchTerm(''); }}
              >
                <User className="h-4 w-4 mr-1.5" />
                Empleado
              </Button>
              <Button
                type="button"
                variant={tipoTrabajador === 'contratista' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => { setTipoTrabajador('contratista'); setTrabajadorId(''); setSearchTerm(''); }}
              >
                <Briefcase className="h-4 w-4 mr-1.5" />
                Contratista
              </Button>
            </div>
          </div>

          {/* Worker selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {tipoTrabajador === 'empleado' ? 'Empleado' : 'Contratista'}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-[140px] overflow-y-auto border rounded-md">
              {filteredWorkers.length === 0 ? (
                <p className="p-3 text-sm text-gray-500 text-center">No se encontraron resultados</p>
              ) : (
                filteredWorkers.map((worker) => {
                  const id = worker.id || '';
                  const isSelected = id === trabajadorId;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                      onClick={() => setTrabajadorId(id)}
                    >
                      <span className={isSelected ? 'font-semibold' : ''}>
                        {worker.nombre}
                      </span>
                      {tipoTrabajador === 'contratista' && (
                        <Badge variant="outline" className="text-xs">
                          {(worker as Contratista).tipo_contrato}
                        </Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Lote selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Lote</Label>
            <Select value={loteId} onValueChange={setLoteId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar lote" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sin_lote__">Sin lote</SelectItem>
                {lotes.map((lote) => (
                  <SelectItem key={lote.id} value={lote.id}>
                    {lote.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fraccion jornal */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Fracción de jornal</Label>
            <Select value={fraccionJornal} onValueChange={(v) => setFraccionJornal(v as FraccionJornal)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRACCION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observaciones */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Observaciones</Label>
            <Input
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Observaciones (opcional)"
            />
          </div>

          {/* Cost preview */}
          {selectedWorker && (
            <div className="bg-gray-50 rounded-lg p-3 border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Costo calculado:</span>
                <span className="text-lg font-bold text-gray-900">
                  ${costoPreview.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !trabajadorId}>
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditarRegistroDialog;
