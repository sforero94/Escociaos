import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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
  DialogTrigger,
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
import { Switch } from '../ui/switch';
import Papa from 'papaparse';
import {
  UserPlus,
  Upload,
  Search,
  Edit,
  Trash2,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Users,
  UserCheck,
  UserX,
} from 'lucide-react';

// Tipos
interface Empleado {
  id?: string;
  nombre: string;
  cedula?: string;
  telefono?: string;
  email?: string;
  estado: 'Activo' | 'Inactivo';
  cargo?: string;
  tipo_contrato?: string;
  fecha_inicio_contrato?: string;
  fecha_fin_contrato?: string;
  horas_semanales?: number;
  periodicidad_pago?: string;
  salario?: number;
  prestaciones_sociales?: number;
  auxilios_no_salariales?: number;
  medio_pago?: string;
  banco?: string;
  numero_cuenta?: string;
  created_at?: string;
  updated_at?: string;
}

// Valores por defecto para nuevo empleado
const EMPLEADO_INICIAL: Empleado = {
  nombre: '',
  estado: 'Activo',
};

// Componente principal
const Personal: React.FC = () => {
  // Estados
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('Todos');
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [editingEmpleado, setEditingEmpleado] = useState<Empleado | null>(null);
  const [formData, setFormData] = useState<Empleado>(EMPLEADO_INICIAL);
  const [alert, setAlert] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [csvData, setCsvData] = useState<Empleado[]>([]);
  const [csvPreview, setCsvPreview] = useState(false);

  // Cargar empleados al montar el componente
  useEffect(() => {
    fetchEmpleados();
  }, []);

  // Auto-ocultar alertas después de 5 segundos
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  // Función para obtener empleados de Supabase
  const fetchEmpleados = async () => {
    try {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from('empleados')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setEmpleados(data || []);
    } catch (error: any) {
      showAlert('error', `Error al cargar empleados: ${error.message}`);
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

  // Función para guardar empleado (crear o actualizar)
  const handleSaveEmpleado = async () => {
    try {
      // Validación básica
      if (!formData.nombre.trim()) {
        showAlert('error', 'El nombre del empleado es obligatorio');
        return;
      }

      setLoading(true);

      if (editingEmpleado) {
        // Actualizar empleado existente
        const { error } = await getSupabase()
          .from('empleados')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEmpleado.id);

        if (error) throw error;
        showAlert('success', 'Empleado actualizado exitosamente');
      } else {
        // Crear nuevo empleado
        const { error } = await getSupabase().from('empleados').insert([formData]);

        if (error) throw error;
        showAlert('success', 'Empleado creado exitosamente');
      }

      // Recargar lista y cerrar formulario
      await fetchEmpleados();
      handleCloseForm();
    } catch (error: any) {
      showAlert('error', `Error al guardar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para eliminar empleado
  const handleDeleteEmpleado = async (id: string) => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Verificar si el empleado tiene registros de trabajo
      const { data: registrosTrabajo, error: errorRegistros } = await supabase
        .from('registros_trabajo')
        .select('id', { count: 'exact', head: true })
        .eq('empleado_id', id);

      if (errorRegistros) throw errorRegistros;

      // Verificar si el empleado es responsable de alguna tarea
      const { data: tareasResponsable, error: errorTareas } = await supabase
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .eq('responsable_id', id);

      if (errorTareas) throw errorTareas;

      const tieneRegistros = (registrosTrabajo as any)?.count > 0;
      const tieneTareas = (tareasResponsable as any)?.count > 0;

      if (tieneRegistros || tieneTareas) {
        const detalles = [];
        if (tieneRegistros) detalles.push(`${(registrosTrabajo as any).count} registro(s) de trabajo`);
        if (tieneTareas) detalles.push(`${(tareasResponsable as any).count} tarea(s) asignada(s)`);

        const mensaje = `No se puede eliminar este empleado porque tiene:\n\n${detalles.join('\n')}\n\n¿Desea desactivarlo en su lugar?`;

        if (window.confirm(mensaje)) {
          // Desactivar en lugar de eliminar
          await handleToggleEstado(id, 'Inactivo');
        }
        return;
      }

      // Si no tiene dependencias, confirmar eliminación
      if (!window.confirm('¿Está seguro de eliminar este empleado? Esta acción no se puede deshacer.')) return;

      const { error } = await supabase.from('empleados').delete().eq('id', id);

      if (error) throw error;
      showAlert('success', 'Empleado eliminado exitosamente');
      await fetchEmpleados();
    } catch (error: any) {
      showAlert('error', `Error al eliminar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para cambiar estado del empleado
  const handleToggleEstado = async (id: string, nuevoEstado: 'Activo' | 'Inactivo') => {
    try {
      setLoading(true);
      const { error } = await getSupabase()
        .from('empleados')
        .update({
          estado: nuevoEstado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      showAlert('success', `Empleado ${nuevoEstado.toLowerCase()} exitosamente`);
      await fetchEmpleados();
    } catch (error: any) {
      showAlert('error', `Error al cambiar estado: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para abrir formulario de edición
  const handleEditEmpleado = (empleado: Empleado) => {
    setEditingEmpleado(empleado);
    setFormData(empleado);
    setShowFormDialog(true);
  };

  // Función para abrir formulario de nuevo empleado
  const handleNewEmpleado = () => {
    setEditingEmpleado(null);
    setFormData(EMPLEADO_INICIAL);
    setShowFormDialog(true);
  };

  // Función para cerrar formulario
  const handleCloseForm = () => {
    setShowFormDialog(false);
    setEditingEmpleado(null);
    setFormData(EMPLEADO_INICIAL);
  };

  // Función para manejar cambios en el formulario
  const handleInputChange = (
    field: keyof Empleado,
    value: string | number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Función auxiliar para limpiar y validar valores
  const cleanValue = (value: any, defaultValue: any = undefined) => {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    return value;
  };

  const parseNumber = (value: any, defaultValue: number | undefined = undefined) => {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  // Función para normalizar valores de medio_pago al enum correcto
  const normalizeMedioPago = (value: string | undefined): string | undefined => {
    if (!value) return undefined;

    const normalizado = value.trim().toLowerCase();

    // Mapeo de valores comunes a los valores correctos del enum
    const mapeo: Record<string, string> = {
      'efectivo': 'Efectivo',
      'transferencia': 'Transferencia bancaria',
      'transferencia bancaria': 'Transferencia bancaria',
      'transferencia banco': 'Transferencia bancaria',
      'transferencia electrónica': 'Transferencia bancaria',
      'transferencia electronica': 'Transferencia bancaria',
      'cheque': 'Cheque',
    };

    const valorMapeado = mapeo[normalizado];
    if (valorMapeado) {
      return valorMapeado;
    }

    // Si no encuentra mapeo, intentar encontrar coincidencia parcial
    if (normalizado.includes('transfer')) {
      return 'Transferencia bancaria';
    }

    // Si no se puede mapear, devolver undefined para que se omita el campo
    console.warn(`Valor de medio_pago no reconocido: "${value}". Se omitirá este campo.`);
    return undefined;
  };

  // Función para procesar archivo CSV
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          // Mapear datos CSV al formato de Empleado
          const mappedData: Empleado[] = results.data.map((row: any) => {
            const empleado: any = {
              nombre: cleanValue(row.Nombre || row.nombre, ''),
              estado: (cleanValue(row.Estado || row.estado, 'Activo')) as 'Activo' | 'Inactivo',
            };

            // Solo agregar campos opcionales si tienen valor
            const cedula = cleanValue(row.Cédula || row.cedula || row.Cedula);
            if (cedula) empleado.cedula = cedula;

            const telefono = cleanValue(row.Teléfono || row.telefono || row.Telefono);
            if (telefono) empleado.telefono = telefono;

            const email = cleanValue(row.Email || row.email);
            if (email) empleado.email = email;

            const cargo = cleanValue(row.Cargo || row.cargo);
            if (cargo) empleado.cargo = cargo;

            const tipo_contrato = cleanValue(row['Tipo de Contrato'] || row.tipo_contrato);
            if (tipo_contrato) empleado.tipo_contrato = tipo_contrato;

            const fecha_inicio = cleanValue(row['Fecha Inicio'] || row.fecha_inicio_contrato);
            if (fecha_inicio) empleado.fecha_inicio_contrato = fecha_inicio;

            const fecha_fin = cleanValue(row['Fecha Fin'] || row.fecha_fin_contrato);
            if (fecha_fin) empleado.fecha_fin_contrato = fecha_fin;

            const horas = parseNumber(row['Horas Semanales'] || row.horas_semanales);
            if (horas !== undefined) empleado.horas_semanales = horas;

            const periodicidad = cleanValue(row['Periodicidad Pago'] || row.periodicidad_pago);
            if (periodicidad) empleado.periodicidad_pago = periodicidad;

            const salario = parseNumber(row.Salario || row.salario);
            if (salario !== undefined) empleado.salario = salario;

            const prestaciones = parseNumber(row['Prestaciones Sociales'] || row.prestaciones_sociales);
            if (prestaciones !== undefined) empleado.prestaciones_sociales = prestaciones;

            const auxilios = parseNumber(row['Auxilios No Salariales'] || row.auxilios_no_salariales);
            if (auxilios !== undefined) empleado.auxilios_no_salariales = auxilios;

            const medio_pago = normalizeMedioPago(row['Medio de Pago'] || row.medio_pago);
            if (medio_pago) empleado.medio_pago = medio_pago;

            const banco = cleanValue(row.Banco || row.banco);
            if (banco) empleado.banco = banco;

            const numero_cuenta = cleanValue(row['Número de Cuenta'] || row.numero_cuenta);
            if (numero_cuenta) empleado.numero_cuenta = numero_cuenta;

            return empleado;
          });

          // Filtrar filas vacías y validar datos mínimos requeridos
          const validData = mappedData.filter((emp) => {
            if (!emp.nombre || emp.nombre.trim() === '') {
              return false;
            }
            // Validar que el estado sea válido
            if (emp.estado !== 'Activo' && emp.estado !== 'Inactivo') {
              emp.estado = 'Activo';
            }
            return true;
          });

          if (validData.length === 0) {
            showAlert('error', 'No se encontraron datos válidos en el archivo');
            return;
          }

          setCsvData(validData);
          setCsvPreview(true);
          showAlert('info', `${validData.length} empleados cargados. Revisa y confirma.`);
        } catch (error: any) {
          showAlert('error', `Error al procesar CSV: ${error.message}`);
        }
      },
      error: (error) => {
        showAlert('error', `Error al leer archivo: ${error.message}`);
      },
    });
  };

  // Función para guardar datos CSV en masa
  const handleSaveCsvData = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Verificar que todos los registros tengan nombre
      const invalidRecords = csvData.filter((emp: Empleado) => !emp.nombre || emp.nombre.trim() === '');
      if (invalidRecords.length > 0) {
        showAlert('error', `${invalidRecords.length} registro(s) sin nombre. Todos los empleados deben tener nombre.`);
        return;
      }

      // Limpiar datos antes de insertar - eliminar campos undefined, null, o NaN
      const cleanedData = csvData.map((emp: Empleado) => {
        const cleaned: Record<string, any> = {};

        Object.entries(emp).forEach(([key, value]) => {
          // Solo incluir campos que tengan valores válidos
          if (value !== undefined && value !== null && value !== '') {
            // Para números, verificar que no sea NaN
            if (typeof value === 'number' && !isNaN(value)) {
              cleaned[key] = value;
            } else if (typeof value !== 'number') {
              cleaned[key] = value;
            }
          }
        });

        // Asegurar que siempre tenga nombre y estado
        if (!cleaned.nombre) cleaned.nombre = emp.nombre;
        if (!cleaned.estado) cleaned.estado = emp.estado || 'Activo';

        return cleaned;
      });

      // Log para debug (se verá en la consola del navegador)
      console.log('Datos a insertar (primer registro):', cleanedData[0]);

      // Insertar en lotes de 100 para evitar problemas con inserciones masivas
      const batchSize = 100;
      let importedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < cleanedData.length; i += batchSize) {
        const batch = cleanedData.slice(i, i + batchSize);

        const { error } = await supabase
          .from('empleados')
          .insert(batch)
          .select();

        if (error) {
          failedCount += batch.length;
          console.error('Error en lote:', error);
          console.error('Datos del lote que falló:', batch);
          errors.push(`Lote ${Math.floor(i / batchSize) + 1}: ${error.message}`);

          // Si es el primer error, mostrar detalles completos
          if (errors.length === 1 && error.details) {
            errors.push(`Detalles: ${error.details}`);
          }
        } else {
          importedCount += batch.length;
        }
      }

      if (importedCount > 0) {
        showAlert('success', `${importedCount} empleado(s) importado(s) exitosamente`);
        await fetchEmpleados();
        setShowCsvDialog(false);
        setCsvData([]);
        setCsvPreview(false);
      }

      if (failedCount > 0) {
        const errorMessage = `${failedCount} empleado(s) fallaron al importar:\n${errors.join('\n')}`;
        showAlert('error', errorMessage);
      }
    } catch (error: any) {
      console.error('Error completo:', error);
      showAlert('error', `Error al importar: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para descargar template CSV
  const handleDownloadTemplate = () => {
    const template = `Nombre,Cédula,Teléfono,Email,Estado,Cargo,Tipo de Contrato,Fecha Inicio,Fecha Fin,Horas Semanales,Periodicidad Pago,Salario,Prestaciones Sociales,Auxilios No Salariales,Medio de Pago,Banco,Número de Cuenta
Juan Pérez,1234567890,3001234567,juan@example.com,Activo,Operario de Campo,Indefinido,2024-01-15,,48,Quincenal,1500000,,,Transferencia bancaria,Bancolombia,12345678
María García,9876543210,3109876543,maria@example.com,Activo,Jefe de Cosecha,Indefinido,2023-06-01,,48,Mensual,2500000,,,Transferencia bancaria,Davivienda,87654321`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_empleados.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Filtrar empleados según búsqueda y filtros
  const empleadosFiltrados = empleados.filter((empleado) => {
    const matchesSearch =
      empleado.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empleado.cedula?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empleado.cargo?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterEstado === 'Todos' || empleado.estado === filterEstado;

    return matchesSearch && matchesFilter;
  });

  // Renderizar
  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Personal</h1>
        <p className="text-gray-600 mt-1">
          Administra la información de todos los empleados de Escocia Hass
        </p>
      </div>

      {/* Alertas */}
      {alert && (
        <Alert
          className={`mb-4 ${
            alert.type === 'success'
              ? 'bg-green-50 border-green-200'
              : alert.type === 'error'
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }`}
        >
          {alert.type === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
          {alert.type === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
          {alert.type === 'info' && <AlertCircle className="h-4 w-4 text-blue-600" />}
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Barra de acciones */}
      <Card className="mb-6 border border-gray-200">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
            {/* Filtro por estado */}
            <div className="w-full md:w-32">
              <Label htmlFor="filter-estado">Estado</Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger id="filter-estado" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="Activo">Activo</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Búsqueda */}
            <div className="flex-1 max-w-full">
              <Label htmlFor="search">Buscar</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Nombre, cédula o cargo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden md:inline">Plantilla CSV</span>
              </Button>

              <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-blue-50"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="hidden md:inline">Importar CSV</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Importar Empleados desde CSV</DialogTitle>
                    <DialogDescription>
                      Carga un archivo CSV con los datos de los empleados. Descarga
                      la plantilla si necesitas el formato correcto.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="csv-file">Seleccionar archivo CSV</Label>
                      <Input
                        id="csv-file"
                        type="file"
                        accept=".csv"
                        onChange={handleCsvUpload}
                        className="mt-1"
                      />
                    </div>

                    {csvPreview && csvData.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2">
                          Vista previa ({csvData.length} empleados)
                        </h3>
                        <div className="border rounded-lg overflow-x-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Cédula</TableHead>
                                <TableHead>Cargo</TableHead>
                                <TableHead>Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {csvData.slice(0, 10).map((emp, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{emp.nombre}</TableCell>
                                  <TableCell>{emp.cedula}</TableCell>
                                  <TableCell>{emp.cargo}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        emp.estado === 'Activo'
                                          ? 'default'
                                          : 'secondary'
                                      }
                                    >
                                      {emp.estado}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {csvData.length > 10 && (
                            <p className="text-sm text-gray-500 p-2 text-center">
                              ... y {csvData.length - 10} empleados más
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCsvDialog(false);
                        setCsvData([]);
                        setCsvPreview(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSaveCsvData}
                      disabled={csvData.length === 0 || loading}
                      className="bg-[#73991C] hover:bg-[#5a7716]"
                    >
                      {loading ? 'Importando...' : 'Importar Empleados'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                onClick={handleNewEmpleado}
                className="flex items-center gap-2 bg-[#73991C] hover:bg-[#5a7716]"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden md:inline">Nuevo Empleado</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Empleados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-[#73991C]" />
              <p className="text-3xl font-bold">{empleados.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <UserCheck className="h-8 w-8 text-green-600" />
              <p className="text-3xl font-bold text-green-600">
                {empleados.filter((e) => e.estado === 'Activo').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Inactivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <UserX className="h-8 w-8 text-gray-500" />
              <p className="text-3xl font-bold text-gray-500">
                {empleados.filter((e) => e.estado === 'Inactivo').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de empleados */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Empleados</CardTitle>
          <CardDescription>
            {empleadosFiltrados.length} empleado(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#73991C]"></div>
            </div>
          ) : empleadosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No se encontraron empleados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Cédula</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Salario</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empleadosFiltrados.map((empleado) => (
                    <TableRow key={empleado.id}>
                      <TableCell className="font-medium">
                        {empleado.nombre}
                      </TableCell>
                      <TableCell>{empleado.cedula || '-'}</TableCell>
                      <TableCell>{empleado.cargo || '-'}</TableCell>
                      <TableCell>{empleado.telefono || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={empleado.estado === 'Activo'}
                            onCheckedChange={(checked) =>
                              handleToggleEstado(
                                empleado.id!,
                                checked ? 'Activo' : 'Inactivo'
                              )
                            }
                            disabled={loading}
                          />
                          <span className={`text-sm font-medium ${
                            empleado.estado === 'Activo'
                              ? 'text-green-700'
                              : 'text-gray-500'
                          }`}>
                            {empleado.estado}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {empleado.salario
                          ? `$${empleado.salario.toLocaleString()}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditEmpleado(empleado)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              empleado.id && handleDeleteEmpleado(empleado.id)
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Dialog de formulario de empleado */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEmpleado ? 'Editar Empleado' : 'Nuevo Empleado'}
            </DialogTitle>
            <DialogDescription>
              Complete la información del empleado. Los campos marcados con * son
              obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Información Personal */}
            <div className="col-span-2">
              <h3 className="font-semibold text-lg mb-3 border-b pb-2">
                Información Personal
              </h3>
            </div>

            <div>
              <Label htmlFor="nombre">
                Nombre Completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => handleInputChange('nombre', e.target.value)}
                placeholder="Juan Pérez"
                className="mt-1"
              />
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="empleado@example.com"
                className="mt-1"
              />
            </div>

            {/* Información Laboral */}
            <div className="col-span-2 mt-4">
              <h3 className="font-semibold text-lg mb-3 border-b pb-2">
                Información Laboral
              </h3>
            </div>

            <div>
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.estado}
                onValueChange={(value) =>
                  handleInputChange('estado', value as 'Activo' | 'Inactivo')
                }
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
              <Label htmlFor="cargo">Cargo</Label>
              <Input
                id="cargo"
                value={formData.cargo || ''}
                onChange={(e) => handleInputChange('cargo', e.target.value)}
                placeholder="Operario de Campo"
                className="mt-1"
              />
            </div>

            {/* Información Contractual */}
            <div className="col-span-2 mt-4">
              <h3 className="font-semibold text-lg mb-3 border-b pb-2">
                Información Contractual
              </h3>
            </div>

            <div>
              <Label htmlFor="tipo_contrato">Tipo de Contrato</Label>
              <Select
                value={formData.tipo_contrato || ''}
                onValueChange={(value) =>
                  handleInputChange('tipo_contrato', value)
                }
              >
                <SelectTrigger id="tipo_contrato" className="mt-1">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Indefinido">Indefinido</SelectItem>
                  <SelectItem value="Fijo">Fijo</SelectItem>
                  <SelectItem value="Por obra o labor">Por obra o labor</SelectItem>
                  <SelectItem value="Prestación de servicios">
                    Prestación de servicios
                  </SelectItem>
                  <SelectItem value="Aprendizaje">Aprendizaje</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="fecha_inicio_contrato">Fecha de Inicio</Label>
              <Input
                id="fecha_inicio_contrato"
                type="date"
                value={formData.fecha_inicio_contrato || ''}
                onChange={(e) =>
                  handleInputChange('fecha_inicio_contrato', e.target.value)
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="fecha_fin_contrato">Fecha de Fin</Label>
              <Input
                id="fecha_fin_contrato"
                type="date"
                value={formData.fecha_fin_contrato || ''}
                onChange={(e) =>
                  handleInputChange('fecha_fin_contrato', e.target.value)
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="horas_semanales">Horas Semanales</Label>
              <Input
                id="horas_semanales"
                type="number"
                value={formData.horas_semanales || ''}
                onChange={(e) =>
                  handleInputChange('horas_semanales', parseFloat(e.target.value))
                }
                placeholder="48"
                className="mt-1"
              />
            </div>

            {/* Información de Compensación */}
            <div className="col-span-2 mt-4">
              <h3 className="font-semibold text-lg mb-3 border-b pb-2">
                Compensación
              </h3>
            </div>

            <div>
              <Label htmlFor="periodicidad_pago">Periodicidad de Pago</Label>
              <Select
                value={formData.periodicidad_pago || ''}
                onValueChange={(value) =>
                  handleInputChange('periodicidad_pago', value)
                }
              >
                <SelectTrigger id="periodicidad_pago" className="mt-1">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mensual">Mensual</SelectItem>
                  <SelectItem value="Quincenal">Quincenal</SelectItem>
                  <SelectItem value="Semanal">Semanal</SelectItem>
                  <SelectItem value="Diario">Diario</SelectItem>
                  <SelectItem value="Por jornal">Por jornal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="salario">Salario</Label>
              <Input
                id="salario"
                type="number"
                value={formData.salario || ''}
                onChange={(e) =>
                  handleInputChange('salario', parseFloat(e.target.value))
                }
                placeholder="1500000"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="prestaciones_sociales">Prestaciones Sociales</Label>
              <Input
                id="prestaciones_sociales"
                type="number"
                value={formData.prestaciones_sociales || ''}
                onChange={(e) =>
                  handleInputChange(
                    'prestaciones_sociales',
                    parseFloat(e.target.value)
                  )
                }
                placeholder="0"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="auxilios_no_salariales">
                Auxilios e Ingresos No Salariales
              </Label>
              <Input
                id="auxilios_no_salariales"
                type="number"
                value={formData.auxilios_no_salariales || ''}
                onChange={(e) =>
                  handleInputChange(
                    'auxilios_no_salariales',
                    parseFloat(e.target.value)
                  )
                }
                placeholder="0"
                className="mt-1"
              />
            </div>

            {/* Información Bancaria */}
            <div className="col-span-2 mt-4">
              <h3 className="font-semibold text-lg mb-3 border-b pb-2">
                Información Bancaria
              </h3>
            </div>

            <div>
              <Label htmlFor="medio_pago">Medio de Pago</Label>
              <Select
                value={formData.medio_pago || ''}
                onValueChange={(value) => handleInputChange('medio_pago', value)}
              >
                <SelectTrigger id="medio_pago" className="mt-1">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia bancaria">
                    Transferencia bancaria
                  </SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="banco">Banco</Label>
              <Input
                id="banco"
                value={formData.banco || ''}
                onChange={(e) => handleInputChange('banco', e.target.value)}
                placeholder="Bancolombia"
                className="mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="numero_cuenta">Número de Cuenta</Label>
              <Input
                id="numero_cuenta"
                value={formData.numero_cuenta || ''}
                onChange={(e) =>
                  handleInputChange('numero_cuenta', e.target.value)
                }
                placeholder="12345678"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseForm}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEmpleado}
              disabled={loading || !formData.nombre.trim()}
              className="bg-[#73991C] hover:bg-[#5a7716]"
            >
              {loading
                ? 'Guardando...'
                : editingEmpleado
                ? 'Actualizar'
                : 'Crear Empleado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Personal;