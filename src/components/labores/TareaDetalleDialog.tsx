import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { formatearFecha, formatearFechaCorta } from '../../utils/fechas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Clock,
  DollarSign,
  Calendar,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  User,
  MapPin,
  Tag,
  AlertTriangle
} from 'lucide-react';

// Import types from main component
import type { Tarea, RegistroTrabajo, Empleado } from './Labores';

// Import cost calculation utilities
import { calculateTaskEstimatedCost } from '../../utils/laborCosts';

interface TareaDetalleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea: Tarea | null;
}

const TareaDetalleDialog: React.FC<TareaDetalleDialogProps> = ({
  open,
  onOpenChange,
  tarea,
}) => {
  const [registrosTrabajo, setRegistrosTrabajo] = useState<RegistroTrabajo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(false);

  // Load work records and employees when dialog opens
  useEffect(() => {
    if (open && tarea?.id) {
      cargarDatosTarea();
    }
  }, [open, tarea?.id]);

  const cargarDatosTarea = async () => {
    if (!tarea?.id) return;

    try {
      setLoading(true);

      // Load work records with employee details
      const { data: registros, error: errorRegistros } = await getSupabase()
        .from('registros_trabajo')
        .select(`
          *,
          empleados:empleado_id (
            id,
            nombre,
            cargo,
            salario
          )
        `)
        .eq('tarea_id', tarea.id)
        .order('fecha_trabajo', { ascending: false });

      if (errorRegistros) throw errorRegistros;
      setRegistrosTrabajo(registros || []);

      // Load all employees for reference
      const { data: empleadosData, error: errorEmpleados } = await getSupabase()
        .from('empleados')
        .select('*')
        .eq('estado', 'Activo')
        .order('nombre');

      if (errorEmpleados) throw errorEmpleados;
      setEmpleados(empleadosData || []);

    } catch (error: any) {
    } finally {
      setLoading(false);
    }
  };

  // Calculate progress metrics
  const calcularMetricas = () => {
    if (!tarea) return null;

    const jornalesRegistrados = registrosTrabajo.reduce((sum, r) => sum + parseFloat(r.fraccion_jornal), 0);
    const jornalesEstimados = tarea.jornales_estimados || 0;
    const progresoJornales = jornalesEstimados > 0 ? (jornalesRegistrados / jornalesEstimados) * 100 : 0;

    // Costo actual viene directamente de registros_trabajo (ya calculado correctamente)
    const costoActual = registrosTrabajo.reduce((sum, r) => sum + r.costo_jornal, 0);
    
    // Costo estimado usando el costo por hora del responsable
    const responsable = empleados.find(e => e.id === tarea.responsable_id);
    const costoEstimado = responsable ? calculateTaskEstimatedCost(
      responsable.salario || 0,
      responsable.prestaciones_sociales || 0,
      responsable.auxilios_no_salariales || 0,
      responsable.horas_semanales || 48,
      jornalesEstimados
    ) : 0;

    const diasTranscurridos = tarea.fecha_estimada_inicio
      ? Math.max(0, Math.ceil((new Date().getTime() - new Date(tarea.fecha_estimada_inicio).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const diasTotales = tarea.fecha_estimada_inicio && tarea.fecha_estimada_fin
      ? Math.max(1, Math.ceil((new Date(tarea.fecha_estimada_fin).getTime() - new Date(tarea.fecha_estimada_inicio).getTime()) / (1000 * 60 * 60 * 24)))
      : 1;

    const progresoTiempo = (diasTranscurridos / diasTotales) * 100;

    return {
      jornalesRegistrados,
      jornalesEstimados,
      progresoJornales: Math.min(progresoJornales, 100),
      costoActual,
      costoEstimado,
      diasTranscurridos,
      diasTotales,
      progresoTiempo: Math.min(progresoTiempo, 100),
    };
  };

  const metricas = calcularMetricas();

  if (!tarea) return null;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Alta': return 'destructive';
      case 'Media': return 'default';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completada': return 'bg-green-100 text-green-800 border-green-200';
      case 'En Proceso': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Cancelada': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[1120px] p-0 gap-0 overflow-hidden flex flex-col bg-white">
        {/* Header */}
        <DialogHeader className="px-6 md:px-8 py-5 border-b bg-gray-50/80 flex-shrink-0 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pr-8">
            <div className="space-y-2 max-w-full md:max-w-[75%]">
              <div className="flex flex-wrap items-center gap-3">
                <DialogTitle className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                  {tarea.nombre}
                </DialogTitle>
                <Badge variant="outline" className="font-mono text-xs text-gray-500 bg-white">
                  {tarea.codigo_tarea}
                </Badge>
              </div>
              
              <DialogDescription className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-sm ${getStatusColor(tarea.estado)}`}>
                  {tarea.estado}
                </span>
                <span className="text-gray-300">|</span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Tag className="h-3.5 w-3.5 text-gray-400" />
                  {tarea.tipo_tarea?.nombre || 'Sin tipo'}
                </span>
              </DialogDescription>
            </div>

            <div className="flex items-center gap-3 mt-1 md:mt-0">
               <Badge variant={getPriorityColor(tarea.prioridad)} className="px-3 py-1 text-sm shadow-sm">
                  Prioridad {tarea.prioridad}
               </Badge>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 bg-gray-50/30">
          <div className="px-6 md:px-8 py-6 md:py-8 space-y-6 max-w-[1120px] mx-auto w-full">

            {/* Métricas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {/* Progreso */}
              <div className="bg-white px-4 py-3.5 md:p-4 rounded-xl border shadow-sm space-y-2.5 md:space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-700">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    Progreso
                  </div>
                  <span className="text-xs md:text-[13px] font-medium text-gray-500 whitespace-nowrap">
                    {metricas?.progresoJornales.toFixed(0)}%
                  </span>
                </div>
                <Progress value={metricas?.progresoJornales || 0} className="h-1.5 md:h-2" />
                <div className="flex justify-between gap-3 text-[11px] md:text-xs text-gray-500">
                  <span className="truncate">{metricas?.jornalesRegistrados.toFixed(1)} Jornales</span>
                  <span className="truncate text-right">Meta: {metricas?.jornalesEstimados.toFixed(1)}</span>
                </div>
              </div>

              {/* Tiempo */}
              <div className="bg-white px-4 py-3.5 md:p-4 rounded-xl border shadow-sm space-y-2.5 md:space-y-3 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-700">
                    <Clock className="h-4 w-4 text-green-600" />
                    Tiempo
                  </div>
                  <span className="text-xs md:text-[13px] font-medium text-gray-500 whitespace-nowrap">
                    {metricas?.diasTranscurridos} / {metricas?.diasTotales} días
                  </span>
                </div>
                <Progress value={metricas?.progresoTiempo || 0} className="h-1.5 md:h-2" />
                <div className="flex justify-between gap-3 text-[11px] md:text-xs text-gray-500">
                  <span className="truncate">Inicio: {tarea.fecha_estimada_inicio ? formatearFechaCorta(tarea.fecha_estimada_inicio) : '-'}</span>
                  <span className="truncate text-right">Fin: {tarea.fecha_estimada_fin ? formatearFechaCorta(tarea.fecha_estimada_fin) : '-'}</span>
                </div>
              </div>

              {/* Costos */}
              <div className="bg-white px-4 py-3.5 md:p-4 rounded-xl border shadow-sm space-y-2.5 md:space-y-3 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-700">
                    <DollarSign className="h-4 w-4 text-purple-600" />
                    Costos
                  </div>
                  <span className={`text-xs font-medium ${(metricas?.costoActual || 0) > (metricas?.costoEstimado || 0) ? 'text-red-600' : 'text-green-600'}`}>
                    {((metricas?.costoActual || 0) - (metricas?.costoEstimado || 0)) > 0 ? '+' : ''}
                    ${((metricas?.costoActual || 0) - (metricas?.costoEstimado || 0)).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-4">
                   <div className="min-w-0">
                      <p className="text-xl md:text-2xl font-bold text-gray-900 leading-tight break-words">${metricas?.costoActual.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Costo Actual</p>
                   </div>
                   <div className="text-right min-w-0">
                      <p className="text-sm font-medium text-gray-700 break-words">${metricas?.costoEstimado.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Estimado</p>
                   </div>
                </div>
              </div>
            </div>

            {/* Detalles Generales - Horizontal Layout */}
            <div className="bg-white rounded-xl p-6 border shadow-sm">
              <div className="flex items-center gap-2 pb-4 border-b mb-6">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Detalles Generales</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Ubicación */}
                <div className="flex gap-4">
                  <div className="mt-1 p-1.5 bg-gray-50 rounded-md h-fit">
                    <MapPin className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-gray-500">Ubicación</p>
                    <p className="text-base font-medium text-gray-900 truncate">
                      {tarea.lote?.nombre || 'Sin lote'}
                    </p>
                    {tarea.sublote && (
                      <p className="text-sm text-gray-600 bg-gray-50 px-2 py-0.5 rounded-md inline-block truncate">
                        {tarea.sublote.nombre}
                      </p>
                    )}
                  </div>
                </div>

                {/* Responsable */}
                <div className="flex gap-4">
                  <div className="mt-1 p-1.5 bg-gray-50 rounded-md h-fit">
                    <User className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-gray-500">Responsable</p>
                    <p className="text-base font-medium text-gray-900 truncate">
                      {empleados.find(e => e.id === tarea.responsable_id)?.nombre || 'Sin asignar'}
                    </p>
                  </div>
                </div>

                {/* Fechas */}
                <div className="flex gap-4">
                  <div className="mt-1 p-1.5 bg-gray-50 rounded-md h-fit">
                    <Calendar className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-gray-500">Fechas Programadas</p>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-600">Inicio:</span>
                        <span className="font-medium text-gray-900 truncate">
                          {tarea.fecha_estimada_inicio ? formatearFecha(tarea.fecha_estimada_inicio) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-600">Fin:</span>
                        <span className="font-medium text-gray-900 truncate">
                          {tarea.fecha_estimada_fin ? formatearFecha(tarea.fecha_estimada_fin) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {tarea.observaciones && (
                <div className="pt-6 border-t mt-6">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Observaciones</p>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {tarea.observaciones}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Historial de Trabajo */}
            <div className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Historial de Trabajo</h4>
                    <p className="text-xs text-gray-500">Registro detallado de actividades</p>
                  </div>
                </div>
                <Badge variant="secondary" className="px-3 py-1">
                  {registrosTrabajo.length} registros
                </Badge>
              </div>

              <div className="flex-1 overflow-hidden max-h-[400px]">
                {registrosTrabajo.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                    <div className="p-4 bg-gray-50 rounded-full mb-3">
                      <AlertTriangle className="h-8 w-8 opacity-20" />
                    </div>
                    <p className="text-sm font-medium">No hay registros de trabajo aún</p>
                    <p className="text-xs mt-1">Los registros aparecerán aquí cuando se reporten labores</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-gray-50/30 sticky top-0">
                          <TableHead className="w-[120px] pl-6">Fecha</TableHead>
                          <TableHead className="min-w-[200px]">Empleado</TableHead>
                          <TableHead className="text-right w-[100px]">Jornal</TableHead>
                          <TableHead className="text-right w-[120px] pr-6">Costo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registrosTrabajo.map((registro) => (
                          <TableRow key={registro.id} className="hover:bg-blue-50/30 transition-colors">
                            <TableCell className="pl-6 font-medium text-sm text-gray-600">
                              {formatearFechaCorta(registro.fecha_trabajo)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 py-1">
                                <span className="text-sm font-semibold text-gray-900 truncate">
                                  {(registro as any).empleados?.nombre || 'Desconocido'}
                                </span>
                                {(registro.observaciones) && (
                                  <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded w-fit max-w-full truncate">
                                    {registro.observaciones}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="font-mono font-normal">
                                {registro.fraccion_jornal}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right pr-6 font-medium text-gray-900">
                              ${registro.costo_jornal.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default TareaDetalleDialog;