import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  Eye,
  Clock,
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  CheckCircle,
  AlertCircle
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Detalles de Tarea: {tarea.nombre}
          </DialogTitle>
          <DialogDescription>
            Código: {tarea.codigo_tarea} • Estado: {tarea.estado}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Task Overview */}
          <div className="bg-gray-50 p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Resumen de la Tarea</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Progress Card */}
              <div className="bg-white p-4 rounded border">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  <h4 className="font-medium">Progreso de Trabajo</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Jornales:</span>
                    <span>{metricas?.jornalesRegistrados.toFixed(1)} / {metricas?.jornalesEstimados.toFixed(1)}</span>
                  </div>
                  <Progress value={metricas?.progresoJornales || 0} className="h-2" />
                  <p className="text-xs text-gray-600">
                    {metricas?.progresoJornales.toFixed(1)}% completado
                  </p>
                </div>
              </div>

              {/* Time Progress Card */}
              <div className="bg-white p-4 rounded border">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium">Progreso Temporal</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Días:</span>
                    <span>{metricas?.diasTranscurridos} / {metricas?.diasTotales}</span>
                  </div>
                  <Progress value={metricas?.progresoTiempo || 0} className="h-2" />
                  <p className="text-xs text-gray-600">
                    {metricas?.progresoTiempo.toFixed(1)}% del tiempo estimado
                  </p>
                </div>
              </div>

              {/* Cost Card */}
              <div className="bg-white p-4 rounded border">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-5 w-5 text-purple-600" />
                  <h4 className="font-medium">Costos</h4>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Actual:</span>
                    <span className="font-medium">${metricas?.costoActual.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimado:</span>
                    <span className="font-medium">${metricas?.costoEstimado.toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-1 mt-2">
                    <div className="flex justify-between font-semibold">
                      <span>Diferencia:</span>
                      <span className={(metricas?.costoActual || 0) > (metricas?.costoEstimado || 0) ? 'text-red-600' : 'text-green-600'}>
                        ${((metricas?.costoActual || 0) - (metricas?.costoEstimado || 0)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Task Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded border">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Información General
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Tipo:</span>
                  <span>{tarea.tipo_tarea?.nombre || 'Sin tipo'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Lote:</span>
                  <span>{tarea.lote?.nombre || 'Sin lote'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sublote:</span>
                  <span>{tarea.sublote?.nombre || 'Sin sublote'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Prioridad:</span>
                  <Badge variant={tarea.prioridad === 'Alta' ? 'destructive' : tarea.prioridad === 'Media' ? 'default' : 'secondary'}>
                    {tarea.prioridad}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Responsable:</span>
                  <span>{empleados.find(e => e.id === tarea.responsable_id)?.nombre || 'Sin asignar'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded border">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Fechas Importantes
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Inicio estimado:</span>
                  <span>{tarea.fecha_estimada_inicio ? new Date(tarea.fecha_estimada_inicio).toLocaleDateString('es-CO') : 'No definido'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fin estimado:</span>
                  <span>{tarea.fecha_estimada_fin ? new Date(tarea.fecha_estimada_fin).toLocaleDateString('es-CO') : 'No definido'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Estado:</span>
                  <Badge variant={
                    tarea.estado === 'Completada' ? 'secondary' :
                    tarea.estado === 'En Proceso' ? 'default' :
                    tarea.estado === 'Cancelada' ? 'destructive' : 'outline'
                  }>
                    {tarea.estado}
                  </Badge>
                </div>
                {tarea.observaciones && (
                  <div className="mt-3 pt-3 border-t">
                    <span className="text-gray-600 text-xs">Observaciones:</span>
                    <p className="text-sm mt-1">{tarea.observaciones}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Work Records */}
          <div className="bg-white p-4 rounded border">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Registro de Trabajo ({registrosTrabajo.length} entradas)
            </h4>

            {registrosTrabajo.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No hay registros de trabajo para esta tarea</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Fracción</TableHead>
                      <TableHead>Horas</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Observaciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrosTrabajo.map((registro) => (
                      <TableRow key={registro.id}>
                        <TableCell>
                          {new Date(registro.fecha_trabajo).toLocaleDateString('es-CO')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {(registro as any).empleados?.nombre || 'Empleado desconocido'}
                            </div>
                            {(registro as any).empleados?.cargo && (
                              <div className="text-xs text-gray-500">
                                {(registro as any).empleados.cargo}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{registro.fraccion_jornal}</TableCell>
                        <TableCell>{(parseFloat(registro.fraccion_jornal) * 12).toFixed(1)}h</TableCell>
                        <TableCell>${registro.costo_jornal.toLocaleString()}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {registro.observaciones || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TareaDetalleDialog;