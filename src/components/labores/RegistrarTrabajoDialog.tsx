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
import { CalendarIcon, Clock, DollarSign } from 'lucide-react';

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
  // Form state
  const [formData, setFormData] = useState({
    empleado_id: '',
    fecha_trabajo: new Date().toISOString().split('T')[0], // Today's date
    fraccion_jornal: '1.0' as RegistroTrabajo['fraccion_jornal'],
    observaciones: '',
  });

  const [loading, setLoading] = useState(false);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        empleado_id: '',
        fecha_trabajo: new Date().toISOString().split('T')[0],
        fraccion_jornal: '1.0',
        observaciones: '',
      });
      setSelectedEmpleado(null);
    }
  }, [open]);

  // Update selected employee when empleado_id changes
  useEffect(() => {
    if (formData.empleado_id) {
      const empleado = empleados.find(e => e.id === formData.empleado_id);
      setSelectedEmpleado(empleado || null);
    } else {
      setSelectedEmpleado(null);
    }
  }, [formData.empleado_id, empleados]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const calculateCostoJornal = () => {
    if (!selectedEmpleado?.salario) return 0;
    const fraccion = parseFloat(formData.fraccion_jornal);
    return selectedEmpleado.salario * fraccion;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tarea?.id) {
      onError('No se ha seleccionado una tarea válida');
      return;
    }

    setLoading(true);

    try {
      const costoJornal = calculateCostoJornal();
      const valorJornalEmpleado = selectedEmpleado?.salario || 0;

      const registroData = {
        tarea_id: tarea.id,
        empleado_id: formData.empleado_id,
        fecha_trabajo: formData.fecha_trabajo,
        fraccion_jornal: formData.fraccion_jornal,
        observaciones: formData.observaciones || null,
        valor_jornal_empleado: valorJornalEmpleado,
        costo_jornal: costoJornal,
      };

      const { error } = await getSupabase()
        .from('registros_trabajo')
        .insert([registroData]);

      if (error) throw error;

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      onError(`Error al registrar trabajo: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fraccionJornalOptions = [
    { value: '0.25', label: '1/4 jornal (3 horas)', horas: 3 },
    { value: '0.5', label: '1/2 jornal (6 horas)', horas: 6 },
    { value: '0.75', label: '3/4 jornal (9 horas)', horas: 9 },
    { value: '1.0', label: '1 jornal completo (12 horas)', horas: 12 },
  ];

  const costoJornal = calculateCostoJornal();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Registrar Trabajo
          </DialogTitle>
          <DialogDescription>
            Registre el trabajo realizado en la tarea "{tarea?.nombre}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información de la tarea */}
          {tarea && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="font-semibold text-sm text-gray-900 mb-2">Tarea Seleccionada</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Código:</span>
                  <span className="ml-2 font-medium">{tarea.codigo_tarea}</span>
                </div>
                <div>
                  <span className="text-gray-600">Tipo:</span>
                  <span className="ml-2">{tarea.tipo_tarea?.nombre || 'Sin tipo'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Lote:</span>
                  <span className="ml-2">{tarea.lote?.nombre || 'Sin lote'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Estado:</span>
                  <Badge
                    variant={
                      tarea.estado === 'En Proceso' ? 'default' :
                      tarea.estado === 'Completada' ? 'secondary' : 'outline'
                    }
                    className="ml-2"
                  >
                    {tarea.estado}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Selección de empleado */}
          <div className="space-y-2">
            <Label htmlFor="empleado">Empleado *</Label>
            <Select
              value={formData.empleado_id}
              onValueChange={(value) => handleInputChange('empleado_id', value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar empleado" />
              </SelectTrigger>
              <SelectContent>
                {empleados.map((empleado) => (
                  <SelectItem key={empleado.id} value={empleado.id}>
                    <div className="flex items-center gap-2">
                      <span>{empleado.nombre}</span>
                      {empleado.cargo && (
                        <Badge variant="outline" className="text-xs">
                          {empleado.cargo}
                        </Badge>
                      )}
                      {empleado.salario && (
                        <span className="text-xs text-gray-500">
                          ${empleado.salario.toLocaleString()}/jornal
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha y fracción de jornal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha_trabajo">Fecha del Trabajo *</Label>
              <Input
                id="fecha_trabajo"
                type="date"
                value={formData.fecha_trabajo}
                onChange={(e) => handleInputChange('fecha_trabajo', e.target.value)}
                disabled={loading}
                max={new Date().toISOString().split('T')[0]} // No future dates
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fraccion_jornal">Fracción de Jornal *</Label>
              <Select
                value={formData.fraccion_jornal}
                onValueChange={(value) => handleInputChange('fraccion_jornal', value)}
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
          </div>

          {/* Información del costo */}
          {selectedEmpleado && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-sm text-blue-900 mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Cálculo del Costo
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Salario base:</span>
                  <span className="ml-2 font-medium">
                    ${selectedEmpleado.salario?.toLocaleString() || 0}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Fracción:</span>
                  <span className="ml-2 font-medium">
                    {formData.fraccion_jornal} ({fraccionJornalOptions.find(o => o.value === formData.fraccion_jornal)?.horas}h)
                  </span>
                </div>
                <div className="col-span-2 border-t border-blue-300 pt-2">
                  <span className="text-blue-900 font-semibold">Costo total:</span>
                  <span className="ml-2 text-lg font-bold text-blue-700">
                    ${costoJornal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={formData.observaciones}
              onChange={(e) => handleInputChange('observaciones', e.target.value)}
              placeholder="Observaciones sobre el trabajo realizado..."
              rows={3}
              disabled={loading}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.empleado_id || !formData.fecha_trabajo}
              className="bg-[#73991C] hover:bg-[#5a7716]"
            >
              {loading ? 'Registrando...' : 'Registrar Trabajo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarTrabajoDialog;