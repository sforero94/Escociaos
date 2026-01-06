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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import {
  UserPlus,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  Briefcase,
} from 'lucide-react';
import { formatCost } from '../../utils/laborCosts';

// Tipos
interface Contratista {
  id?: string;
  nombre: string;
  tipo_contrato: 'Jornal' | 'Contrato';
  tarifa_jornal: number;
  cedula?: string;
  telefono?: string;
  estado: 'Activo' | 'Inactivo';
  fecha_inicio?: string;
  fecha_fin?: string;
  observaciones?: string;
  created_at?: string;
  updated_at?: string;
}

// Valores por defecto para nuevo contratista
const CONTRATISTA_INICIAL: Contratista = {
  nombre: '',
  tipo_contrato: 'Jornal',
  tarifa_jornal: 0,
  estado: 'Activo',
};

// Componente principal
const Contratistas: React.FC = () => {
  // Estados
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('Todos');
  const [filterTipo, setFilterTipo] = useState<string>('Todos');
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingContratista, setEditingContratista] = useState<Contratista | null>(null);
  const [formData, setFormData] = useState<Contratista>(CONTRATISTA_INICIAL);
  const [alert, setAlert] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Cargar contratistas al montar el componente
  useEffect(() => {
    fetchContratistas();
  }, []);

  // Auto-ocultar alertas después de 5 segundos
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  // Función para obtener contratistas de Supabase
  const fetchContratistas = async () => {
    try {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from('contratistas')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setContratistas(data || []);
    } catch (error: any) {
      showAlert('error', `Error al cargar contratistas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para mostrar alertas
  const showAlert = (
    type: 'success' | 'error' | 'info',
    message: string
  ) => {
    setAlert({ type, message });
  };

  // Función para guardar contratista (crear o actualizar)
  const handleSaveContratista = async () => {
    try {
      // Validación básica
      if (!formData.nombre.trim()) {
        showAlert('error', 'El nombre del contratista es obligatorio');
        return;
      }

      if (!formData.tarifa_jornal || formData.tarifa_jornal <= 0) {
        showAlert('error', 'La tarifa por jornal debe ser mayor a 0');
        return;
      }

      setLoading(true);

      if (editingContratista) {
        // Actualizar contratista existente
        const { error } = await getSupabase()
          .from('contratistas')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingContratista.id);

        if (error) throw error;
        showAlert('success', 'Contratista actualizado exitosamente');
      } else {
        // Crear nuevo contratista
        const { error } = await getSupabase().from('contratistas').insert([formData]);

        if (error) throw error;
        showAlert('success', 'Contratista creado exitosamente');
      }

      // Recargar lista y cerrar formulario
      await fetchContratistas();
      handleCloseForm();
    } catch (error: any) {
      showAlert('error', `Error al guardar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para eliminar/inactivar contratista
  const handleDeleteContratista = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este contratista?')) {
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabase();

      // Verificar si el contratista tiene registros de trabajo
      const { count, error: errorRegistros } = await supabase
        .from('registros_trabajo')
        .select('id', { count: 'exact', head: true })
        .eq('contratista_id', id);

      if (errorRegistros) throw errorRegistros;

      if (count && count > 0) {
        showAlert(
          'error',
          `No se puede eliminar: el contratista tiene ${count} registro(s) de trabajo. Puede marcarlo como Inactivo en su lugar.`
        );
        return;
      }

      // Eliminar contratista
      const { error } = await supabase.from('contratistas').delete().eq('id', id);

      if (error) throw error;

      showAlert('success', 'Contratista eliminado exitosamente');
      await fetchContratistas();
    } catch (error: any) {
      showAlert('error', `Error al eliminar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para abrir formulario de edición
  const handleEditContratista = (contratista: Contratista) => {
    setEditingContratista(contratista);
    setFormData(contratista);
    setShowFormDialog(true);
  };

  // Función para abrir formulario de nuevo contratista
  const handleNewContratista = () => {
    setEditingContratista(null);
    setFormData(CONTRATISTA_INICIAL);
    setShowFormDialog(true);
  };

  // Función para cerrar formulario
  const handleCloseForm = () => {
    setShowFormDialog(false);
    setEditingContratista(null);
    setFormData(CONTRATISTA_INICIAL);
  };

  // Función para manejar cambios en el formulario
  const handleInputChange = (field: keyof Contratista, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Filtrar contratistas
  const filteredContratistas = contratistas.filter((contratista) => {
    const matchesSearch =
      contratista.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contratista.cedula && contratista.cedula.includes(searchTerm));

    const matchesEstado =
      filterEstado === 'Todos' || contratista.estado === filterEstado;

    const matchesTipo =
      filterTipo === 'Todos' || contratista.tipo_contrato === filterTipo;

    return matchesSearch && matchesEstado && matchesTipo;
  });

  // Estadísticas
  const stats = {
    total: contratistas.length,
    activos: contratistas.filter((c) => c.estado === 'Activo').length,
    jornal: contratistas.filter((c) => c.tipo_contrato === 'Jornal').length,
    contrato: contratistas.filter((c) => c.tipo_contrato === 'Contrato').length,
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contratistas</h1>
          <p className="text-gray-500 mt-1">
            Gestión de contratistas externos (Jornal y Contrato)
          </p>
        </div>
        <Button onClick={handleNewContratista} className="bg-[#73991C] hover:bg-[#5a7716]">
          <UserPlus className="w-4 h-4 mr-2" />
          Nuevo Contratista
        </Button>
      </div>

      {/* Alertas */}
      {alert && (
        <Alert
          className={
            alert.type === 'success'
              ? 'bg-green-50 border-green-200'
              : alert.type === 'error'
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }
        >
          {alert.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
          {alert.type === 'error' && <XCircle className="w-4 h-4 text-red-600" />}
          {alert.type === 'info' && <AlertCircle className="w-4 h-4 text-blue-600" />}
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Contratistas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Jornal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.jornal}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Contrato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.contrato}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Buscar</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Nombre o cédula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="filterEstado">Estado</Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger id="filterEstado" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filterTipo">Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger id="filterTipo" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="Jornal">Jornal</SelectItem>
                  <SelectItem value="Contrato">Contrato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de contratistas */}
      <Card>
        <CardHeader>
          <CardTitle>
            Lista de Contratistas ({filteredContratistas.length})
          </CardTitle>
          <CardDescription>
            Gestiona los contratistas externos que realizan trabajos por jornal o contrato
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando...</div>
          ) : filteredContratistas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No se encontraron contratistas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tarifa/Jornal</TableHead>
                    <TableHead>Cédula</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContratistas.map((contratista) => (
                    <TableRow key={contratista.id}>
                      <TableCell className="font-medium">{contratista.nombre}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            contratista.tipo_contrato === 'Jornal'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }
                        >
                          {contratista.tipo_contrato}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCost(contratista.tarifa_jornal)}</TableCell>
                      <TableCell>{contratista.cedula || '-'}</TableCell>
                      <TableCell>{contratista.telefono || '-'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={contratista.estado === 'Activo' ? 'default' : 'secondary'}
                          className={
                            contratista.estado === 'Activo'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {contratista.estado}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditContratista(contratista)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteContratista(contratista.id!)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de formulario */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingContratista ? 'Editar Contratista' : 'Nuevo Contratista'}
            </DialogTitle>
            <DialogDescription>
              Complete la información del contratista externo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Información básica */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="nombre">
                  Nombre Completo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => handleInputChange('nombre', e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="tipo_contrato">
                  Tipo de Contrato <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.tipo_contrato}
                  onValueChange={(value) => handleInputChange('tipo_contrato', value)}
                >
                  <SelectTrigger id="tipo_contrato" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Jornal">Jornal (Día de trabajo)</SelectItem>
                    <SelectItem value="Contrato">Contrato (Proyecto/Tarea)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="tarifa_jornal">
                  Tarifa por Jornal (COP) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="tarifa_jornal"
                  type="number"
                  value={formData.tarifa_jornal || ''}
                  onChange={(e) =>
                    handleInputChange('tarifa_jornal', parseFloat(e.target.value) || 0)
                  }
                  placeholder="80000"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tarifa fija por día completo de trabajo (8 horas)
                </p>
              </div>

              <div>
                <Label htmlFor="cedula">Cédula</Label>
                <Input
                  id="cedula"
                  value={formData.cedula || ''}
                  onChange={(e) => handleInputChange('cedula', e.target.value)}
                  placeholder="1234567890"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono || ''}
                  onChange={(e) => handleInputChange('telefono', e.target.value)}
                  placeholder="3001234567"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => handleInputChange('estado', value)}
                >
                  <SelectTrigger id="estado" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Activo">Activo</SelectItem>
                    <SelectItem value="Inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="fecha_inicio">Fecha Inicio</Label>
                <Input
                  id="fecha_inicio"
                  type="date"
                  value={formData.fecha_inicio || ''}
                  onChange={(e) => handleInputChange('fecha_inicio', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="fecha_fin">Fecha Fin</Label>
                <Input
                  id="fecha_fin"
                  type="date"
                  value={formData.fecha_fin || ''}
                  onChange={(e) => handleInputChange('fecha_fin', e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  value={formData.observaciones || ''}
                  onChange={(e) => handleInputChange('observaciones', e.target.value)}
                  placeholder="Notas adicionales sobre el contratista..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseForm}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveContratista}
              disabled={loading}
              className="bg-[#73991C] hover:bg-[#5a7716]"
            >
              {loading ? 'Guardando...' : editingContratista ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contratistas;
