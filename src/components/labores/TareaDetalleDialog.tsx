import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
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
        .eq('activo', true)
        .order('nombre');

      if (errorEmpleados) throw errorEmpleados;
      setEmpleados(empleadosData || []);

    } catch (error: any) {
      console.error('Error cargando datos de tarea:', error);
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

    const costoActual = registrosTrabajo.reduce((sum, r) => sum + r.costo_jornal, 0);
    const costoEstimado = jornalesEstimados * (empleados.find(e => e.id === tarea.responsable_id)?.salario || 0);

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
      {/* Usamos un ancho explícito para aprovechar más espacio en desktop */}
      <DialogContent className="w-[min(1120px,100vw-2rem)] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-white">
        {/* Header Compacto */}
        <DialogHeader className="px-5 md:px-6 py-4 border-b bg-gray-50/60 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 pr-6 md:pr-10">
            <div className="space-y-1 max-w-full md:max-w-[70%]">
              <DialogTitle className="text-xl md:text-2xl font-bold text-gray-900 flex flex-wrap items-center gap-2">
                {tarea.nombre}
                <Badge variant="outline" className="font-normal text-xs text-gray-500 whitespace-nowrap">
                  {tarea.codigo_tarea}
                </Badge>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(tarea.estado)}`}>
                  {tarea.estado}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {tarea.tipo_tarea?.nombre || 'Sin tipo'}
                </span>
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 md:gap-3 mt-1 md:mt-0">
               <Badge variant={getPriorityColor(tarea.prioridad)} className="whitespace-nowrap">
                  Prioridad {tarea.prioridad}
               </Badge>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 md:px-6 py-5 md:py-6 space-y-5 md:space-y-6 max-w-5xl mx-auto w-full">
            
            {/* Métricas Compactas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
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
                  <span className="truncate">Inicio: {tarea.fecha_estimada_inicio ? new Date(tarea.fecha_estimada_inicio).toLocaleDateString('es-CO', {day: '2-digit', month: 'short'}) : '-'}</span>
                  <span className="truncate text-right">Fin: {tarea.fecha_estimada_fin ? new Date(tarea.fecha_estimada_fin).toLocaleDateString('es-CO', {day: '2-digit', month: 'short'}) : '-'}</span>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
              {/* Columna Izquierda: Detalles */}
              <div className="lg:col-span-1 space-y-5 md:space-y-6">
                <div className="bg-gray-50 rounded-2xl p-4 md:p-5 border space-y-4 md:space-y-5">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Detalles Generales
                  </h4>
                  
                  <div className="space-y-3.5 text-sm leading-relaxed">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">Ubicación</p>
                        <p className="text-gray-600">
                          {tarea.lote?.nombre || 'Sin lote'}
                          {tarea.sublote ? ` • ${tarea.sublote.nombre}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">Responsable</p>
                        <p className="text-gray-600">
                          {empleados.find(e => e.id === tarea.responsable_id)?.nombre || 'Sin asignar'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">Fechas</p>
                        <p className="text-gray-600 break-words">
                          {tarea.fecha_estimada_inicio ? new Date(tarea.fecha_estimada_inicio).toLocaleDateString('es-CO') : 'N/A'}
                          {' - '}
                          {tarea.fecha_estimada_fin ? new Date(tarea.fecha_estimada_fin).toLocaleDateString('es-CO') : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {tarea.observaciones && (
                    <>
                      <Separator />
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observaciones</p>
                        <p className="text-sm text-gray-700 leading-relaxed break-words">
                          {tarea.observaciones}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Columna Derecha: Historial */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl border shadow-sm h-full flex flex-col">
                  <div className="px-4 md:px-5 py-3.5 md:py-4 border-b flex items-center justify-between bg-gray-50/60 rounded-t-2xl">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2 text-sm md:text-base">
                      <CheckCircle className="h-4 w-4 text-gray-500" />
                      Historial de Trabajo
                    </h4>
                    <Badge variant="secondary" className="font-normal text-xs md:text-sm whitespace-nowrap">
                      {registrosTrabajo.length} registros
                    </Badge>
                  </div>

                  <div className="flex-1 overflow-hidden">
                    {registrosTrabajo.length === 0 ? (
                      <div className="h-44 md:h-48 flex flex-col items-center justify-center text-gray-500 px-4">
                        <AlertTriangle className="h-8 w-8 mb-2 opacity-20" />
                        <p className="text-sm">No hay registros de trabajo aún</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-[88px] md:w-[100px]">Fecha</TableHead>
                              <TableHead>Empleado</TableHead>
                              <TableHead className="text-right">Jornal</TableHead>
                              <TableHead className="text-right">Costo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {registrosTrabajo.map((registro) => (
                              <TableRow key={registro.id} className="hover:bg-gray-50/60">
                                <TableCell className="font-medium text-[11px] md:text-xs whitespace-nowrap">
                                  {new Date(registro.fecha_trabajo).toLocaleDateString('es-CO', {
                                    day: '2-digit',
                                    month: 'short'
                                  })}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-xs md:text-sm font-medium text-gray-900 break-words">
                                      {(registro as any).empleados?.nombre || 'Desconocido'}
                                    </span>
                                    {(registro.observaciones) && (
                                    <span className="text-[11px] md:text-xs text-gray-500 break-words">
                                      {registro.observaciones}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs md:text-sm whitespace-nowrap">
                                {registro.fraccion_jornal}
                              </TableCell>
                              <TableCell className="text-right text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">
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
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default TareaDetalleDialog;