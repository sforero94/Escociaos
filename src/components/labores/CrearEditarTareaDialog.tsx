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
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Import types from main component
import type { Tarea, TipoTarea, Empleado, Lote, Sublote } from './Labores';

interface CrearEditarTareaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea: Tarea | null;
  tiposTareas: TipoTarea[];
  lotes: Lote[];
  sublotes: Sublote[];
  empleados: Empleado[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

const CrearEditarTareaDialog: React.FC<CrearEditarTareaDialogProps> = ({
  open,
  onOpenChange,
  tarea,
  tiposTareas,
  lotes,
  sublotes,
  empleados,
  onSuccess,
  onError,
}) => {
  // Form state
  const [formData, setFormData] = useState({
    codigo_tarea: '',
    nombre: '',
    tipo_tarea_id: '',
    descripcion: '',
    lote_id: '',
    sublote_id: '',
    estado: 'Banco' as Tarea['estado'],
    prioridad: 'Media' as Tarea['prioridad'],
    fecha_estimada_inicio: '',
    fecha_estimada_fin: '',
    jornales_estimados: '',
    responsable_id: '',
    observaciones: '',
  });

  const [loading, setLoading] = useState(false);
  const [filteredSublotes, setFilteredSublotes] = useState<Sublote[]>([]);

  // Initialize form when tarea changes
  useEffect(() => {
    if (tarea) {
      setFormData({
        codigo_tarea: tarea.codigo_tarea || '',
        nombre: tarea.nombre || '',
        tipo_tarea_id: tarea.tipo_tarea_id || '',
        descripcion: tarea.descripcion || '',
        lote_id: tarea.lote_id || '',
        sublote_id: tarea.sublote_id || '',
        estado: tarea.estado || 'Banco',
        prioridad: tarea.prioridad || 'Media',
        fecha_estimada_inicio: tarea.fecha_estimada_inicio || '',
        fecha_estimada_fin: tarea.fecha_estimada_fin || '',
        jornales_estimados: tarea.jornales_estimados?.toString() || '',
        responsable_id: tarea.responsable_id || '',
        observaciones: tarea.observaciones || '',
      });
    } else {
      // Reset form for new task
      setFormData({
        codigo_tarea: '',
        nombre: '',
        tipo_tarea_id: '',
        descripcion: '',
        lote_id: '',
        sublote_id: '',
        estado: 'Banco',
        prioridad: 'Media',
        fecha_estimada_inicio: '',
        fecha_estimada_fin: '',
        jornales_estimados: '',
        responsable_id: '',
        observaciones: '',
      });
    }
  }, [tarea]);

  // Filter sublotes when lote changes
  useEffect(() => {
    if (formData.lote_id) {
      setFilteredSublotes(sublotes.filter(s => s.lote_id === formData.lote_id));
    } else {
      setFilteredSublotes([]);
    }
  }, [formData.lote_id, sublotes]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear sublote if lote changes
    if (field === 'lote_id') {
      setFormData(prev => ({ ...prev, sublote_id: '' }));
    }
  };

  const generateTaskCode = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `T${timestamp}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generate code for new tasks
      const taskData = {
        ...formData,
        codigo_tarea: formData.codigo_tarea || generateTaskCode(),
        jornales_estimados: formData.jornales_estimados ? parseFloat(formData.jornales_estimados) : null,
        fecha_estimada_inicio: formData.fecha_estimada_inicio || null,
        fecha_estimada_fin: formData.fecha_estimada_fin || null,
        tipo_tarea_id: formData.tipo_tarea_id || null,
        lote_id: formData.lote_id || null,
        sublote_id: formData.sublote_id || null,
        responsable_id: formData.responsable_id || null,
      };

      if (tarea?.id) {
        // Update existing task
        const { error } = await getSupabase()
          .from('tareas')
          .update(taskData)
          .eq('id', tarea.id);

        if (error) throw error;
      } else {
        // Create new task
        const { error } = await getSupabase()
          .from('tareas')
          .insert([taskData]);

        if (error) throw error;
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      onError(`Error al ${tarea?.id ? 'actualizar' : 'crear'} tarea: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!tarea?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Tarea' : 'Nueva Tarea'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modifica los detalles de la tarea seleccionada.'
              : 'Crea una nueva tarea para el sistema de gestión de labores.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información Básica */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo_tarea">Código de Tarea</Label>
              <Input
                id="codigo_tarea"
                value={formData.codigo_tarea}
                onChange={(e) => handleInputChange('codigo_tarea', e.target.value)}
                placeholder="Se generará automáticamente"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.estado}
                onValueChange={(value) => handleInputChange('estado', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Banco">Banco</SelectItem>
                  <SelectItem value="Programada">Programada</SelectItem>
                  <SelectItem value="En Proceso">En Proceso</SelectItem>
                  <SelectItem value="Completada">Completada</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre de la Tarea *</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => handleInputChange('nombre', e.target.value)}
              placeholder="Ej: Fumigación lote principal"
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_tarea">Tipo de Tarea</Label>
              <Select
                value={formData.tipo_tarea_id}
                onValueChange={(value) => handleInputChange('tipo_tarea_id', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {tiposTareas.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id}>
                      <div className="flex items-center gap-2">
                        <span>{tipo.nombre}</span>
                        <Badge variant="outline" className="text-xs">
                          {tipo.categoria}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prioridad">Prioridad</Label>
              <Select
                value={formData.prioridad}
                onValueChange={(value) => handleInputChange('prioridad', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baja">Baja</SelectItem>
                  <SelectItem value="Media">Media</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={formData.descripcion}
              onChange={(e) => handleInputChange('descripcion', e.target.value)}
              placeholder="Describe detalladamente la tarea a realizar..."
              rows={3}
              disabled={loading}
            />
          </div>

          {/* Ubicación */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Ubicación</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lote">Lote</Label>
                <Select
                  value={formData.lote_id}
                  onValueChange={(value) => handleInputChange('lote_id', value)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {lotes.map((lote) => (
                      <SelectItem key={lote.id} value={lote.id}>
                        {lote.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sublote">Sublote</Label>
                <Select
                  value={formData.sublote_id}
                  onValueChange={(value) => handleInputChange('sublote_id', value)}
                  disabled={loading || !formData.lote_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar sublote" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSublotes.map((sublote) => (
                      <SelectItem key={sublote.id} value={sublote.id}>
                        {sublote.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Fechas y Estimaciones */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Planificación</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha_inicio">Fecha Estimada Inicio</Label>
                <Input
                  id="fecha_inicio"
                  type="date"
                  value={formData.fecha_estimada_inicio}
                  onChange={(e) => handleInputChange('fecha_estimada_inicio', e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fecha_fin">Fecha Estimada Fin</Label>
                <Input
                  id="fecha_fin"
                  type="date"
                  value={formData.fecha_estimada_fin}
                  onChange={(e) => handleInputChange('fecha_estimada_fin', e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jornales">Jornales Estimados</Label>
                <Input
                  id="jornales"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.jornales_estimados}
                  onChange={(e) => handleInputChange('jornales_estimados', e.target.value)}
                  placeholder="0.0"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Responsable */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Asignación</h3>
            <div className="space-y-2">
              <Label htmlFor="responsable">Responsable</Label>
              <Select
                value={formData.responsable_id}
                onValueChange={(value) => handleInputChange('responsable_id', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar responsable" />
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
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observaciones */}
          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea
              id="observaciones"
              value={formData.observaciones}
              onChange={(e) => handleInputChange('observaciones', e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={2}
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
              disabled={loading || !formData.nombre.trim()}
              className="bg-[#73991C] hover:bg-[#5a7716]"
            >
              {loading ? 'Guardando...' : (isEditing ? 'Actualizar Tarea' : 'Crear Tarea')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CrearEditarTareaDialog;