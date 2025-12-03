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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { CalendarIcon, X, ChevronDown, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Import types from main component
import type { Tarea, TipoTarea, Empleado, Lote } from './Labores';

interface CrearEditarTareaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea: Tarea | null;
  tiposTareas: TipoTarea[];
  lotes: Lote[];
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
    lote_id: '', // Keep for backward compatibility
    lote_ids: [] as string[], // New: Multiple lotes
    estado: 'Banco' as Tarea['estado'],
    prioridad: 'Media' as Tarea['prioridad'],
    fecha_estimada_inicio: '',
    fecha_estimada_fin: '',
    jornales_estimados: '',
    responsable_id: '',
    observaciones: '',
  });

  const [loading, setLoading] = useState(false);
  const [openCombobox, setOpenCombobox] = useState(false);

  // Initialize form when tarea changes
  useEffect(() => {
    if (tarea) {
      setFormData({
        codigo_tarea: tarea.codigo_tarea || '',
        nombre: tarea.nombre || '',
        tipo_tarea_id: tarea.tipo_tarea_id || '',
        descripcion: tarea.descripcion || '',
        lote_id: tarea.lote_id || '', // Backward compatibility
        lote_ids: tarea.lotes?.map(l => l.id) || [], // Multiple lotes
        estado: tarea.estado || 'Banco',
        prioridad: tarea.prioridad || 'Media',
        fecha_estimada_inicio: tarea.fecha_estimada_inicio || '',
        fecha_estimada_fin: tarea.fecha_estimada_fin || '',
        jornales_estimados: tarea.jornales_estimados?.toString() || '',
        responsable_id: tarea.responsable_id || '',
        observaciones: tarea.observaciones || '',
      });
    } else {
      // Reset form for new task with auto-generated code
      setFormData({
        codigo_tarea: generateTaskCode(),
        nombre: '',
        tipo_tarea_id: '',
        descripcion: '',
        lote_id: '',
        lote_ids: [], // Start with empty array
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


  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        lote_id: formData.lote_ids.length > 0 ? formData.lote_ids[0] : null, // Backward compatibility - use first lote
        responsable_id: formData.responsable_id || null,
      };

      let taskId: string;

      if (tarea?.id) {
        // Update existing task
        const { error } = await getSupabase()
          .from('tareas')
          .update(taskData)
          .eq('id', tarea.id);

        if (error) throw error;
        taskId = tarea.id;
      } else {
        // Create new task
        const { data, error } = await getSupabase()
          .from('tareas')
          .insert([taskData])
          .select('id')
          .single();

        if (error) throw error;
        taskId = data.id;
      }

      // Handle multiple lotes assignment
      if (formData.lote_ids.length > 0) {
        // Delete existing assignments
        await getSupabase()
          .from('tareas_lotes')
          .delete()
          .eq('tarea_id', taskId);

        // Insert new assignments
        const loteAssignments = formData.lote_ids.map(loteId => ({
          tarea_id: taskId,
          lote_id: loteId,
        }));

        const { error: loteError } = await getSupabase()
          .from('tareas_lotes')
          .insert(loteAssignments);

        if (loteError) throw loteError;
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
                readOnly
                className="bg-gray-50"
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                Código generado automáticamente
              </p>
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
            <div className="space-y-2">
              <Label htmlFor="lotes">Lotes</Label>
              <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className="w-full justify-between text-left font-normal"
                    disabled={loading}
                    onClick={() => console.log('Click en selector de lotes. Total lotes:', lotes.length)}
                  >
                    {formData.lote_ids.length > 0
                      ? `${formData.lote_ids.length} lote${formData.lote_ids.length > 1 ? 's' : ''} seleccionado${formData.lote_ids.length > 1 ? 's' : ''}`
                      : "Seleccionar lotes"
                    }
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 z-[9999]">
                  <Command>
                    <CommandInput placeholder="Buscar lotes..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron lotes.</CommandEmpty>
                      <CommandGroup>
                        {lotes.map((lote) => {
                          const isSelected = formData.lote_ids.includes(lote.id);
                          return (
                            <CommandItem
                              key={lote.id}
                              value={lote.nombre}
                              onSelect={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  lote_ids: isSelected
                                    ? prev.lote_ids.filter(id => id !== lote.id)
                                    : [...prev.lote_ids, lote.id]
                                }));
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  isSelected ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              {lote.nombre}
                              {lote.area_hectareas && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {lote.area_hectareas} ha
                                </span>
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {formData.lote_ids.length > 0 && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, lote_ids: [] }))}
                        className="w-full text-xs"
                      >
                        Limpiar selección
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {formData.lote_ids.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.lote_ids.map((loteId) => {
                    const lote = lotes.find(l => l.id === loteId);
                    return lote ? (
                      <Badge key={loteId} variant="secondary" className="text-xs">
                        {lote.nombre}
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            lote_ids: prev.lote_ids.filter(id => id !== loteId)
                          }))}
                          className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
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
