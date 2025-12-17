import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatearFecha, formatearFechaCorta } from '../../utils/fechas';
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

// Import PDF generation utility
import { generarPDFReportesLabores } from '../../utils/generarPDFReportesLabores';

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

interface CostoPorLote {
  lote: string;
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
  indicadorEficiencia: number; // % de utilización de capacidad
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
  const [costosPorLote, setCostosPorLote] = useState<CostoPorLote[]>([]); // ✨ NUEVO
  const [tendenciaCostos, setTendenciaCostos] = useState<TendenciaCostos[]>([]);
  const [registrosTrabajo, setRegistrosTrabajo] = useState<any[]>([]);
  
  // ✨ NUEVO: Estado del toggle Jornales/Costos
  const [vistaGrafico, setVistaGrafico] = useState<'costos' | 'jornales'>('costos');

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
          tareas!inner(codigo_tarea, nombre, tipo_tarea_id),
          empleados!inner(nombre, cargo, salario),
          lote:lotes!lote_id(nombre)
        `)
        .gte('fecha_trabajo', fechaInicio)
        .lte('fecha_trabajo', fechaFin)
        .order('fecha_trabajo', { ascending: true });

      if (errorRegistros) throw errorRegistros;

      setRegistrosTrabajo(registros || []);
      procesarDatos(registros || []);
    } catch (error: any) {
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

    // Calcular indicador de eficiencia: % de utilización de capacidad instalada
    const diasPeriodo = Math.max(1, Math.ceil((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 60 * 60 * 24)));
    const capacidadInstalada = empleadosUnicos * diasPeriodo; // Empleados × días × 1 jornal/día
    const indicadorEficiencia = capacidadInstalada > 0 ? Number(((totalJornales / capacidadInstalada) * 100).toFixed(1)) : 0;

    setEstadisticasGenerales({
      totalTareas: tareasUnicas,
      tareasCompletadas: tareas.filter(t => t.estado === 'Completada').length,
      tareasEnProceso: tareas.filter(t => t.estado === 'En Proceso').length,
      totalCostos,
      totalJornales,
      indicadorEficiencia,
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

    // ✨ ACTUALIZADO: Costos por lote (usando lote_id de registros_trabajo)
    const costosLoteMap = new Map<string, { costo: number; jornales: number; tareas: Set<string> }>();

    registros.forEach(registro => {
      const loteNombre = registro.lote?.nombre || 'Sin lote';

      if (!costosLoteMap.has(loteNombre)) {
        costosLoteMap.set(loteNombre, { costo: 0, jornales: 0, tareas: new Set() });
      }

      const data = costosLoteMap.get(loteNombre)!;
      data.costo += Number(registro.costo_jornal) || 0;
      data.jornales += Number(registro.fraccion_jornal) || 0;
      data.tareas.add(registro.tarea_id);
    });

    const costosLoteArray: CostoPorLote[] = Array.from(costosLoteMap.entries()).map(([lote, data]) => ({
      lote,
      costo: data.costo,
      jornales: data.jornales,
      tareas: data.tareas.size,
    })).sort((a, b) => b.costo - a.costo);

    setCostosPorLote(costosLoteArray);

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
        fecha: formatearFechaCorta(fecha),
        costo: data.costo,
        jornales: data.jornales,
      }))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    setTendenciaCostos(tendenciaArray);
  };

  const COLORS = ['#73991C', '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C', '#34495E', '#E67E22'];

  const formatCurrency = (value: number) => `$${Number(value).toLocaleString('es-CO')}`;
  const formatNumber = (value: number) => Number(value).toFixed(2);

  // Función para exportar PDF
  const exportarPDF = () => {
    if (!estadisticasGenerales || registrosTrabajo.length === 0) return;

    generarPDFReportesLabores(
      registrosTrabajo,
      tiposTareas,
      estadisticasGenerales,
      fechaInicio,
      fechaFin
    );
  };

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
          <Button
            onClick={exportarPDF}
            variant="default"
            size="sm"
            disabled={!estadisticasGenerales || registrosTrabajo.length === 0}
            className="bg-[#73991C] hover:bg-[#5a7a15]"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar PDF
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
                Equivalente a {Math.round(estadisticasGenerales.totalJornales * 8)} horas
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
              <CardTitle className="text-sm font-medium">Eficiencia Operativa</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estadisticasGenerales.indicadorEficiencia}%</div>
              <p className="text-xs text-muted-foreground">
                Utilización de capacidad instalada
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ✨ NUEVO: Toggle de Visualización */}
      {estadisticasGenerales && (
        <div className="flex items-center justify-center">
          <div className="bg-gray-100 p-1 rounded-lg flex">
            <button
              onClick={() => setVistaGrafico('costos')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                vistaGrafico === 'costos'
                  ? 'bg-[#73991C] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              💰 Por Costos
            </button>
            <button
              onClick={() => setVistaGrafico('jornales')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                vistaGrafico === 'jornales'
                  ? 'bg-[#73991C] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⏰ Por Jornales
            </button>
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ✨ MODIFICADO: Costos/Jornales por Tipo de Tarea */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {vistaGrafico === 'costos' ? 'Costos por Tipo' : 'Jornales por Tipo'}
            </CardTitle>
            <CardDescription>
              {vistaGrafico === 'costos' 
                ? 'Distribución de costos laborales por categoría de trabajo'
                : 'Distribución de Jornales por categoría de trabajo'
              }
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
                <YAxis 
                  tickFormatter={vistaGrafico === 'costos' ? formatCurrency : formatNumber} 
                />
                <Tooltip
                  formatter={(value: any) => [
                    vistaGrafico === 'costos' ? formatCurrency(value) : formatNumber(value),
                    vistaGrafico === 'costos' ? 'Costo' : 'Jornales'
                  ]}
                  labelStyle={{ color: '#000' }}
                />
                <Bar 
                  dataKey={vistaGrafico === 'costos' ? 'costo' : 'jornales'} 
                  fill="#73991C" 
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ✨ MODIFICADO: Distribución por Lote */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {vistaGrafico === 'costos' ? 'Costos por Lote' : 'Jornales por Lote'}
            </CardTitle>
            <CardDescription>
              {vistaGrafico === 'costos' 
                ? 'Distribución de costos laborales por lote'
                : 'Distribución de Jornales por lote'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costosPorLote}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="lote"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis 
                  tickFormatter={vistaGrafico === 'costos' ? formatCurrency : formatNumber} 
                />
                <Tooltip
                  formatter={(value: any) => [
                    vistaGrafico === 'costos' ? formatCurrency(value) : formatNumber(value),
                    vistaGrafico === 'costos' ? 'Costo' : 'Jornales'
                  ]}
                  labelStyle={{ color: '#000' }}
                />
                <Bar 
                  dataKey={vistaGrafico === 'costos' ? 'costo' : 'jornales'} 
                  fill="#73991C" 
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ✨ MODIFICADO: Tendencia de Costos/Jornales */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {vistaGrafico === 'costos' ? 'Tendencia de Costos Diarios' : 'Tendencia de Jornales Diarios'}
            </CardTitle>
            <CardDescription>
              {vistaGrafico === 'costos' 
                ? 'Evolución de los costos laborales a lo largo del período seleccionado'
                : 'Evolución de los jornales a lo largo del período seleccionado'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={tendenciaCostos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis tickFormatter={vistaGrafico === 'costos' ? formatCurrency : formatNumber} />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    vistaGrafico === 'costo' ? formatCurrency(value) : formatNumber(value),
                    vistaGrafico === 'costos' ? 'Costo' : 'Jornales'
                  ]}
                  labelStyle={{ color: '#000' }}
                />
                <Area
                  type="monotone"
                  dataKey={vistaGrafico === 'costos' ? 'costo' : 'jornales'}
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
                      {formatearFecha(registro.fecha_trabajo)}
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
                        {registro.fraccion_jornal} ({Math.round(Number(registro.fraccion_jornal) * 8)}h)
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