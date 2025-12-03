import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import {
  Calendar,
  DollarSign,
  Users,
  Clock,
  TrendingUp,
  FileBarChart,
  Download,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
} from 'lucide-react';

// Import types from main component
import type { Tarea, Empleado, TipoTarea } from './Labores';

interface ReportesViewProps {
  tareas: Tarea[];
  empleados: Empleado[];
  tiposTareas: TipoTarea[];
}

interface CostoPorTipo {
  tipo: string;
  costo: number;
  jornales: number;
  tareas: number;
}

interface CostoPorEmpleado {
  empleado: string;
  costo: number;
  jornales: number;
  tareas: number;
}

interface TendenciaCostos {
  fecha: string;
  costo: number;
  jornales: number;
}

interface EstadisticasGenerales {
  totalTareas: number;
  tareasCompletadas: number;
  tareasEnProceso: number;
  totalCostos: number;
  totalJornales: number;
  promedioCostoTarea: number;
  empleadosActivos: number;
}

const ReportesView: React.FC<ReportesViewProps> = ({
  tareas,
  empleados,
  tiposTareas,
}) => {
  const [loading, setLoading] = useState(true);
  const [fechaInicio, setFechaInicio] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split('T')[0]);

  // Estados de datos
  const [estadisticasGenerales, setEstadisticasGenerales] = useState<EstadisticasGenerales | null>(null);
  const [costosPorTipo, setCostosPorTipo] = useState<CostoPorTipo[]>([]);
  const [costosPorEmpleado, setCostosPorEmpleado] = useState<CostoPorEmpleado[]>([]);
  const [tendenciaCostos, setTendenciaCostos] = useState<TendenciaCostos[]>([]);
  const [registrosTrabajo, setRegistrosTrabajo] = useState<any[]>([]);

  // Cargar datos al montar y cuando cambian las fechas
  useEffect(() => {
    cargarDatosReportes();
  }, [fechaInicio, fechaFin]);

  const cargarDatosReportes = async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Cargar registros de trabajo en el rango de fechas
      const { data: registros, error: errorRegistros } = await supabase
        .from('registros_trabajo')
        .select(`
          *,
          tareas!inner(codigo_tarea, nombre, tipo_tarea_id, lote_id, sublote_id),
          empleados!inner(nombre, cargo, salario)
        `)
        .gte('fecha_trabajo', fechaInicio)
        .lte('fecha_trabajo', fechaFin)
        .order('fecha_trabajo', { ascending: true });

      if (errorRegistros) throw errorRegistros;

      setRegistrosTrabajo(registros || []);
      procesarDatos(registros || []);
    } catch (error: any) {
      console.error('Error cargando datos de reportes:', error);
    } finally {
      setLoading(false);
    }
  };

  const procesarDatos = (registros: any[]) => {
    // Estadísticas generales
    const totalCostos = registros.reduce((sum, r) => sum + (Number(r.costo_jornal) || 0), 0);
    const totalJornales = registros.reduce((sum, r) => sum + (Number(r.fraccion_jornal) || 0), 0);
    const empleadosUnicos = new Set(registros.map(r => r.empleado_id)).size;

    // Tareas únicas completadas en el período
    const tareasUnicas = new Set(registros.map(r => r.tarea_id)).size;

    setEstadisticasGenerales({
      totalTareas: tareasUnicas,
      tareasCompletadas: tareas.filter(t => t.estado === 'Completada').length,
      tareasEnProceso: tareas.filter(t => t.estado === 'En Proceso').length,
      totalCostos,
      totalJornales,
      promedioCostoTarea: tareasUnicas > 0 ? Number((totalCostos / tareasUnicas).toFixed(2)) : 0,
      empleadosActivos: empleadosUnicos,
    });

    // Costos por tipo de tarea
    const costosTipoMap = new Map<string, { costo: number; jornales: number; tareas: Set<string> }>();

    registros.forEach(registro => {
      const tipoNombre = registro.tareas?.tipo_tarea_id
        ? tiposTareas.find(t => t.id === registro.tareas.tipo_tarea_id)?.nombre || 'Sin tipo'
        : 'Sin tipo';

      if (!costosTipoMap.has(tipoNombre)) {
        costosTipoMap.set(tipoNombre, { costo: 0, jornales: 0, tareas: new Set() });
      }

      const data = costosTipoMap.get(tipoNombre)!;
      data.costo += Number(registro.costo_jornal) || 0;
      data.jornales += Number(registro.fraccion_jornal) || 0;
      data.tareas.add(registro.tarea_id);
    });

    const costosTipoArray: CostoPorTipo[] = Array.from(costosTipoMap.entries()).map(([tipo, data]) => ({
      tipo,
      costo: data.costo,
      jornales: data.jornales,
      tareas: data.tareas.size,
    })).sort((a, b) => b.costo - a.costo);

    setCostosPorTipo(costosTipoArray);

    // Costos por empleado
    const costosEmpleadoMap = new Map<string, { costo: number; jornales: number; tareas: Set<string> }>();

    registros.forEach(registro => {
      const empleadoNombre = registro.empleados?.nombre || 'Sin nombre';

      if (!costosEmpleadoMap.has(empleadoNombre)) {
        costosEmpleadoMap.set(empleadoNombre, { costo: 0, jornales: 0, tareas: new Set() });
      }

      const data = costosEmpleadoMap.get(empleadoNombre)!;
      data.costo += Number(registro.costo_jornal) || 0;
      data.jornales += Number(registro.fraccion_jornal) || 0;
      data.tareas.add(registro.tarea_id);
    });

    const costosEmpleadoArray: CostoPorEmpleado[] = Array.from(costosEmpleadoMap.entries()).map(([empleado, data]) => ({
      empleado,
      costo: data.costo,
      jornales: data.jornales,
      tareas: data.tareas.size,
    })).sort((a, b) => b.costo - a.costo);

    setCostosPorEmpleado(costosEmpleadoArray);

    // Tendencia de costos por fecha
    const tendenciaMap = new Map<string, { costo: number; jornales: number }>();

    registros.forEach(registro => {
      const fecha = registro.fecha_trabajo;
      if (!tendenciaMap.has(fecha)) {
        tendenciaMap.set(fecha, { costo: 0, jornales: 0 });
      }

      const data = tendenciaMap.get(fecha)!;
      data.costo += Number(registro.costo_jornal) || 0;
      data.jornales += Number(registro.fraccion_jornal) || 0;
    });

    const tendenciaArray: TendenciaCostos[] = Array.from(tendenciaMap.entries())
      .map(([fecha, data]) => ({
        fecha: new Date(fecha).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }),
        costo: data.costo,
        jornales: data.jornales,
      }))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    setTendenciaCostos(tendenciaArray);
  };

  const COLORS = ['#73991C', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C', '#34495E', '#E67E22'];

  const formatCurrency = (value: number) => `$${Number(value).toLocaleString('es-CO')}`;
  const formatNumber = (value: number) => Number(value).toFixed(2);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#73991C]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reportes y Analytics</h2>
          <p className="text-gray-600">Análisis de costos y productividad laboral</p>
        </div>

        <div className="flex gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Fecha Inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Fecha Fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <Button onClick={cargarDatosReportes} variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Estadísticas Generales */}
      {estadisticasGenerales && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Costos</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(estadisticasGenerales.totalCostos)}</div>
              <p className="text-xs text-muted-foreground">
                En el período seleccionado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jornales Totales</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(estadisticasGenerales.totalJornales)}</div>
              <p className="text-xs text-muted-foreground">
                Equivalente a {Math.round(estadisticasGenerales.totalJornales * 12)} horas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estadisticasGenerales.empleadosActivos}</div>
              <p className="text-xs text-muted-foreground">
                Participaron en el período
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo Promedio x Tarea</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(estadisticasGenerales.promedioCostoTarea)}</div>
              <p className="text-xs text-muted-foreground">
                Por tarea completada
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Costos por Tipo de Tarea */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Costos por Tipo de Tarea
            </CardTitle>
            <CardDescription>
              Distribución de costos laborales por categoría de trabajo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costosPorTipo}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="tipo"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis tickFormatter={formatCurrency} />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(value), 'Costo']}
                  labelStyle={{ color: '#000' }}
                />
                <Bar dataKey="costo" fill="#73991C" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribución por Empleado */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Distribución por Empleado
            </CardTitle>
            <CardDescription>
              Participación de cada empleado en los costos totales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={costosPorEmpleado}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ empleado, costo }) => `${empleado}: ${formatCurrency(costo)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="costo"
                >
                  {costosPorEmpleado.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tendencia de Costos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Tendencia de Costos Diarios
            </CardTitle>
            <CardDescription>
              Evolución de los costos laborales a lo largo del período seleccionado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={tendenciaCostos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis tickFormatter={formatCurrency} />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    name === 'costo' ? formatCurrency(value) : formatNumber(value),
                    name === 'costo' ? 'Costo' : 'Jornales'
                  ]}
                  labelStyle={{ color: '#000' }}
                />
                <Area
                  type="monotone"
                  dataKey="costo"
                  stackId="1"
                  stroke="#73991C"
                  fill="#73991C"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tablas de detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Costos por Tipo */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle por Tipo de Tarea</CardTitle>
            <CardDescription>
              Costos desglosados por categoría de trabajo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Jornales</TableHead>
                  <TableHead className="text-right">Tareas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costosPorTipo.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.tipo}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.costo)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.jornales)}</TableCell>
                    <TableCell className="text-right">{item.tareas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Costos por Empleado */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle por Empleado</CardTitle>
            <CardDescription>
              Costos desglosados por trabajador
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Jornales</TableHead>
                  <TableHead className="text-right">Tareas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costosPorEmpleado.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.empleado}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.costo)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.jornales)}</TableCell>
                    <TableCell className="text-right">{item.tareas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Registro detallado de trabajo */}
      <Card>
        <CardHeader>
          <CardTitle>Registro Detallado de Trabajo</CardTitle>
          <CardDescription>
            Lista completa de registros de trabajo en el período seleccionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Fracción</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrosTrabajo.slice(0, 50).map((registro, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {new Date(registro.fecha_trabajo).toLocaleDateString('es-CO')}
                    </TableCell>
                    <TableCell>{registro.empleados?.nombre || 'N/A'}</TableCell>
                    <TableCell>{registro.tareas?.codigo_tarea || 'N/A'}</TableCell>
                    <TableCell>
                      {registro.tareas?.tipo_tarea_id
                        ? tiposTareas.find(t => t.id === registro.tareas.tipo_tarea_id)?.nombre || 'Sin tipo'
                        : 'Sin tipo'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">
                        {registro.fraccion_jornal} ({Math.round(Number(registro.fraccion_jornal) * 12)}h)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(registro.costo_jornal) || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {registrosTrabajo.length > 50 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              Mostrando 50 de {registrosTrabajo.length} registros. Use filtros para ver más datos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportesView;