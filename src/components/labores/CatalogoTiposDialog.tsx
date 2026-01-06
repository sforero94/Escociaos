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
import { StandardDialog } from '../ui/standard-dialog';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Switch } from '../ui/switch';
import {
  Plus,
  Edit,
  Trash2,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

// Import types from main component
import type { TipoTarea } from './Labores';

interface CatalogoTiposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const CatalogoTiposDialog: React.FC<CatalogoTiposDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  onError,
}) => {
  // Estados principales
  const [tiposTareas, setTiposTareas] = useState<TipoTarea[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoTarea | null>(null);

  // Estado del formulario
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: '',
    descripcion: '',
    activo: true,
  });

  // Cargar tipos de tareas al abrir el diálogo
  useEffect(() => {
    if (open) {
      cargarTiposTareas();
    }
  }, [open]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      resetForm();
      setShowForm(false);
      setEditingTipo(null);
    }
  }, [open]);

  const resetForm = () => {
    setFormData({
      nombre: '',
      categoria: '',
      descripcion: '',
      activo: true,
    });
  };

  const cargarTiposTareas = async () => {
    try {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from('tipos_tareas')
        .select('*')
        .order('categoria', { ascending: true })
        .order('nombre', { ascending: true });

      if (error) throw error;
      setTiposTareas(data || []);
    } catch (error: any) {
      onError(`Error al cargar tipos de tareas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNuevoTipo = () => {
    resetForm();
    setEditingTipo(null);
    setShowForm(true);
  };

  const handleEditarTipo = (tipo: TipoTarea) => {
    setFormData({
      nombre: tipo.nombre,
      categoria: tipo.categoria,
      descripcion: tipo.descripcion || '',
      activo: tipo.activo,
    });
    setEditingTipo(tipo);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim() || !formData.categoria.trim()) {
      onError('Nombre y categoría son obligatorios');
      return;
    }

    try {
      setLoading(true);

      if (editingTipo) {
        // Update existing
        const { error } = await getSupabase()
          .from('tipos_tareas')
          .update({
            nombre: formData.nombre.trim(),
            categoria: formData.categoria.trim(),
            descripcion: formData.descripcion.trim() || null,
            activo: formData.activo,
          })
          .eq('id', editingTipo.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await getSupabase()
          .from('tipos_tareas')
          .insert([{
            nombre: formData.nombre.trim(),
            categoria: formData.categoria.trim(),
            descripcion: formData.descripcion.trim() || null,
            activo: formData.activo,
          }]);

        if (error) throw error;
      }

      await cargarTiposTareas();
      setShowForm(false);
      resetForm();
      setEditingTipo(null);
      onSuccess();
    } catch (error: any) {
      onError(`Error al ${editingTipo ? 'actualizar' : 'crear'} tipo de tarea: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActivo = async (tipo: TipoTarea) => {
    try {
      const { error } = await getSupabase()
        .from('tipos_tareas')
        .update({ activo: !tipo.activo })
        .eq('id', tipo.id);

      if (error) throw error;

      await cargarTiposTareas();
      onSuccess();
    } catch (error: any) {
      onError(`Error al cambiar estado: ${error.message}`);
    }
  };

  const handleEliminarTipo = async (tipo: TipoTarea) => {
    if (!window.confirm(`¿Está seguro de eliminar el tipo "${tipo.nombre}"?`)) return;

    try {
      const { error } = await getSupabase()
        .from('tipos_tareas')
        .delete()
        .eq('id', tipo.id);

      if (error) throw error;

      await cargarTiposTareas();
      onSuccess();
    } catch (error: any) {
      onError(`Error al eliminar tipo de tarea: ${error.message}`);
    }
  };

  // Agrupar por categoría
  const tiposPorCategoria = tiposTareas.reduce((acc, tipo) => {
    if (!acc[tipo.categoria]) {
      acc[tipo.categoria] = [];
    }
    acc[tipo.categoria].push(tipo);
    return acc;
  }, {} as Record<string, TipoTarea[]>);

  const categorias = Object.keys(tiposPorCategoria).sort();

  const footerButtons = !showForm ? (
    <Button variant="outline" onClick={() => onOpenChange(false)}>
      Cerrar
    </Button>
  ) : null;

  return (
    <StandardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Catálogo de Tipos de Tareas
        </span>
      }
      description="Gestiona los tipos de tareas disponibles para organizar el trabajo agrícola"
      size="full"
      footer={footerButtons}
    >
      <div className="space-y-6">
          {!showForm ? (
            // Vista de lista
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Tipos de Tareas</h3>
                  <p className="text-sm text-gray-600">
                    {tiposTareas.length} tipos registrados
                  </p>
                </div>
                <Button onClick={handleNuevoTipo} className="bg-[#73991C] hover:bg-[#5a7716]">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Tipo
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#73991C]"></div>
                </div>
              ) : categorias.length === 0 ? (
                <div className="text-center py-12">
                  <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No hay tipos de tareas registrados</p>
                  <Button onClick={handleNuevoTipo} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primer Tipo
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {categorias.map((categoria) => (
                    <div key={categoria} className="border rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {categoria}
                        </Badge>
                        <span className="text-sm text-gray-600">
                          ({tiposPorCategoria[categoria].length} tipos)
                        </span>
                      </h4>

                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nombre</TableHead>
                              <TableHead>Descripción</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead className="w-32">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tiposPorCategoria[categoria].map((tipo) => (
                              <TableRow key={tipo.id}>
                                <TableCell className="font-medium">
                                  {tipo.nombre}
                                </TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {tipo.descripcion || 'Sin descripción'}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={tipo.activo}
                                      onCheckedChange={() => handleToggleActivo(tipo)}
                                      disabled={loading}
                                    />
                                    <span className="text-sm">
                                      {tipo.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleEditarTipo(tipo)}
                                      disabled={loading}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleEliminarTipo(tipo)}
                                      disabled={loading}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Formulario
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => handleInputChange('nombre', e.target.value)}
                    placeholder="Ej: Fumigación"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoría *</Label>
                  <Select
                    value={formData.categoria}
                    onValueChange={(value) => handleInputChange('categoria', value)}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mantenimiento del cultivo">Mantenimiento del cultivo</SelectItem>
                      <SelectItem value="Cosecha">Cosecha</SelectItem>
                      <SelectItem value="Proyectos Especiales">Proyectos Especiales</SelectItem>
                      <SelectItem value="Aplicaciones Fitosanitarias">Aplicaciones Fitosanitarias</SelectItem>
                      <SelectItem value="Fertilización y Enmiendas">Fertilización y Enmiendas</SelectItem>
                      <SelectItem value="Monitoreo">Monitoreo</SelectItem>
                      <SelectItem value="Infraestructura">Infraestructura</SelectItem>
                      <SelectItem value="Siembra">Siembra</SelectItem>
                      <SelectItem value="Administrativas">Administrativas</SelectItem>
                      <SelectItem value="Apoyo Finca">Apoyo Finca</SelectItem>
                      <SelectItem value="Otras">Otras</SelectItem>
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
                  placeholder="Describe las características de este tipo de tarea..."
                  rows={3}
                  disabled={loading}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="activo"
                  checked={formData.activo}
                  onCheckedChange={(checked) => handleInputChange('activo', checked)}
                  disabled={loading}
                />
                <Label htmlFor="activo">Tipo activo (disponible para nuevas tareas)</Label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !formData.nombre.trim() || !formData.categoria.trim()}
                  className="bg-[#73991C] hover:bg-[#5a7716]"
                >
                  {loading ? 'Guardando...' : (editingTipo ? 'Actualizar Tipo' : 'Crear Tipo')}
                </Button>
              </div>
            </form>
          )}
      </div>
    </StandardDialog>
  );
};

export default CatalogoTiposDialog;