import React, { useState, useEffect, useMemo } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui/tabs';
import {
  ListTodo,
  CheckCircle,
  XCircle,
  FileBarChart,
  AlertCircle,
} from 'lucide-react';

// Importar subcomponentes
import CrearEditarTareaDialog from './CrearEditarTareaDialog';
import RegistrarTrabajoDialog from './RegistrarTrabajoDialog';
import CatalogoTiposDialog from './CatalogoTiposDialog';
import TareaDetalleDialog from './TareaDetalleDialog';
import ReportesView from './ReportesView';
import KanbanBoard from './KanbanBoard';
import type { ColumnActions } from './kanban-types';

// Tipos
export interface TipoTarea {
  id: string;
  nombre: string;
  categoria: string;
  descripcion?: string;
  activo: boolean;
}

export interface Empleado {
  id: string;
  nombre: string;
  cargo?: string;
  estado: 'Activo' | 'Inactivo';
  salario?: number;
  prestaciones_sociales?: number;
  auxilios_no_salariales?: number;
  horas_semanales?: number;
}

export interface Contratista {
  id: string;
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

export interface Lote {
  id: string;
  nombre: string;
  area_hectareas?: number;
}

export interface Sublote {
  id: string;
  lote_id: string;
  nombre: string;
}

export interface Tarea {
  id: string;
  codigo_tarea: string;
  nombre: string;
  tipo_tarea_id?: string;
  tipo_tarea?: TipoTarea;
  descripcion?: string;
  lote_id?: string; // Deprecated - kept for backward compatibility
  lote?: Lote; // Deprecated - kept for backward compatibility
  lote_ids?: string[]; // New: Array of lote UUIDs stored directly in tareas table
  lotes?: Lote[]; // New: Multiple lotes support (populated from lote_ids)
  lote_nombres?: string; // Aggregated lote names from view
  num_lotes?: number; // Number of lotes assigned
  sublote_id?: string;
  sublote?: Sublote;
  estado: 'Banco' | 'Programada' | 'En Proceso' | 'Completada' | 'Cancelada';
  prioridad: 'Alta' | 'Media' | 'Baja';
  fecha_estimada_inicio?: string;
  fecha_estimada_fin?: string;
  fecha_inicio_real?: string;
  fecha_fin_real?: string;
  jornales_estimados?: number;
  responsable_id?: string;
  responsable?: Empleado;
  observaciones?: string;
  created_at?: string;
  updated_at?: string;

  // Campos calculados desde la vista
  jornales_reales?: number;
  costo_total?: number;
  num_empleados?: number;
  dias_trabajados?: number;
}

export interface RegistroTrabajo {
  id?: string;
  tarea_id: string;
  empleado_id?: string;      // Optional - work record has either empleado_id or contratista_id
  contratista_id?: string;   // Optional - work record has either empleado_id or contratista_id
  lote_id: string;
  fecha_trabajo: string;
  fraccion_jornal: '0.25' | '0.5' | '0.75' | '1.0';
  observaciones?: string;
  valor_jornal_empleado?: number;
  costo_jornal?: number;
}

// Union type for workers (employees or contractors)
export type Trabajador =
  | { type: 'empleado'; data: Empleado }
  | { type: 'contratista'; data: Contratista };

// Componente principal
const Labores: React.FC = () => {
  // Estados principales
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [tiposTareas, setTiposTareas] = useState<TipoTarea[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de diálogos
  const [showCrearDialog, setShowCrearDialog] = useState(false);
  const [showRegistroDialog, setShowRegistroDialog] = useState(false);
  const [showCatalogoDialog, setShowCatalogoDialog] = useState(false);
  const [showDetalleDialog, setShowDetalleDialog] = useState(false);
  const [tareaSeleccionada, setTareaSeleccionada] = useState<Tarea | null>(null);

  // Estados de alertas
  const [alert, setAlert] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Tab activo
  const [tabActivo, setTabActivo] = useState('kanban');

  // Cargar datos al montar
  useEffect(() => {
    cargarDatos();
  }, []);

  // Auto-ocultar alertas
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  // Función para cargar todos los datos
  const cargarDatos = async () => {
    try {
      setLoading(true);
      
      // PRIMERO: Cargar recursos base (lotes, tipos, empleados, contratistas) en paralelo
      // Estos son independientes entre sí
      const [,,,lotesData] = await Promise.all([
        cargarTiposTareas(),
        cargarEmpleados(),
        cargarContratistas(),
        cargarLotes(),
      ]);

      // DESPUÉS: Cargar tareas que dependen de lotes estar cargados
      // Pasar lotesData directamente para evitar stale closure de React state
      await cargarTareas(lotesData);
      
    } catch (error: any) {
      showAlert('error', `Error al cargar datos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Cargar tareas desde la vista resumen
  // lotesData param avoids stale closure - React state may not be updated yet
  const cargarTareas = async (lotesData?: Lote[]) => {
    const lotesRef = lotesData || lotes;
    const { data, error } = await getSupabase()
      .from('vista_tareas_resumen')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transformar datos para incluir objetos anidados
    const tareasTransformadas = data?.map((t: any) => {
      // Convert lote_ids array to lote objects
      const taskLotes: Lote[] = [];
      if (t.lote_ids && Array.isArray(t.lote_ids)) {
        // Find matching lote objects using fresh lotesRef (not stale state)
        t.lote_ids.forEach((loteId: string) => {
          const lote = lotesRef.find(l => l.id === loteId);
          if (lote) taskLotes.push(lote);
        });
      }

      return {
        ...t,
        tipo_tarea: t.tipo_tarea_nombre ? {
          nombre: t.tipo_tarea_nombre,
          categoria: t.tipo_tarea_categoria,
        } : undefined,
        lote: t.lote_nombre ? { nombre: t.lote_nombre } : undefined, // Backward compatibility
        sublote: t.sublote_nombre ? { nombre: t.sublote_nombre } : undefined,
        responsable: t.responsable_nombre ? { nombre: t.responsable_nombre } : undefined,
        // Multiple lotes: populate from lote_ids array
        lotes: taskLotes,
      };
    }) || [];

    setTareas(tareasTransformadas as Tarea[]);
  };


  // Cargar tipos de tareas
  const cargarTiposTareas = async () => {
    const { data, error } = await getSupabase()
      .from('tipos_tareas')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw error;
    setTiposTareas(data || []);
  };

  // Cargar empleados activos
  const cargarEmpleados = async () => {
    const { data, error } = await getSupabase()
      .from('empleados')
      .select('id, nombre, cargo, estado, salario, prestaciones_sociales, auxilios_no_salariales, horas_semanales')
      .eq('estado', 'Activo')
      .order('nombre', { ascending: true });

    if (error) throw error;
    setEmpleados(data || []);
  };

  // Cargar contratistas activos
  const cargarContratistas = async () => {
    const { data, error } = await getSupabase()
      .from('contratistas')
      .select('*')
      .eq('estado', 'Activo')
      .order('nombre', { ascending: true });

    if (error) throw error;
    setContratistas(data || []);
  };

  // Cargar lotes (returns data to avoid stale closure when passed to cargarTareas)
  const cargarLotes = async (): Promise<Lote[]> => {
    const { data, error } = await getSupabase()
      .from('lotes')
      .select('id, nombre, area_hectareas')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw error;
    const result = data || [];
    setLotes(result);
    return result;
  };


  // Función para mostrar alertas
  const showAlert = (
    type: 'success' | 'error' | 'info',
    message: string
  ) => {
    setAlert({ type, message });
  };

  // Manejar creación de nueva tarea
  const handleNuevaTarea = (estado?: Tarea['estado']) => {
    setTareaSeleccionada({
      id: '',
      codigo_tarea: '',
      nombre: '',
      estado: estado || 'Banco',
      prioridad: 'Media',
    } as Tarea);
    setShowCrearDialog(true);
  };

  // Manejar edición de tarea
  const handleEditarTarea = (tarea: Tarea) => {
    setTareaSeleccionada(tarea);
    setShowCrearDialog(true);
  };

  // Manejar registro de trabajo
  const handleRegistrarTrabajo = (tarea: Tarea) => {
    setTareaSeleccionada(tarea);
    setShowRegistroDialog(true);
  };

  // Manejar vista de detalles
  const handleVerDetalles = (tarea: Tarea) => {
    setTareaSeleccionada(tarea);
    setShowDetalleDialog(true);
  };

  // Manejar cambio de estado de tarea
  const handleCambiarEstado = async (tarea: Tarea, nuevoEstado: Tarea['estado']) => {
    try {
      // Validación: No se puede poner "En Proceso" sin fecha de inicio
      if (nuevoEstado === 'En Proceso' && !tarea.fecha_inicio_real) {
        showAlert('error', 'No se puede cambiar a "En Proceso" sin registros de trabajo');
        return;
      }

      const { error } = await getSupabase()
        .from('tareas')
        .update({ estado: nuevoEstado })
        .eq('id', tarea.id);

      if (error) throw error;

      showAlert('success', `Estado cambiado a "${nuevoEstado}"`);
      await cargarTareas();
    } catch (error: any) {
      // Handle specific validation errors from the database trigger
      if (error.message?.includes('jornales registrados')) {
        showAlert('error', 'Error de validación: ' + error.message);
      } else {
        showAlert('error', `Error al cambiar estado: ${error.message}`);
      }
    }
  };

  // Manejar eliminación de tarea
  const handleEliminarTarea = async (tarea: Tarea) => {
    if (!window.confirm(`¿Está seguro de eliminar la tarea "${tarea.nombre}"?`)) return;

    try {
      const { error } = await getSupabase()
        .from('tareas')
        .delete()
        .eq('id', tarea.id);

      if (error) throw error;

      showAlert('success', 'Tarea eliminada exitosamente');
      await cargarTareas();
    } catch (error: any) {
      showAlert('error', `Error al eliminar: ${error.message}`);
    }
  };

  // Filtrar tareas por búsqueda
  const tareasFiltradas = tareas.filter((tarea) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      tarea.nombre.toLowerCase().includes(searchLower) ||
      tarea.codigo_tarea.toLowerCase().includes(searchLower) ||
      tarea.tipo_tarea?.nombre.toLowerCase().includes(searchLower) ||
      tarea.lote?.nombre.toLowerCase().includes(searchLower)
    );
  });

  // Actions bundle for Kanban cards
  const columnActions: ColumnActions = useMemo(() => ({
    onVerDetalles: handleVerDetalles,
    onEditar: handleEditarTarea,
    onRegistrarTrabajo: handleRegistrarTrabajo,
    onCambiarEstado: handleCambiarEstado,
    onEliminar: handleEliminarTarea,
  }), []);

  // Renderizar
  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Labores</h1>
        <p className="text-gray-600 mt-1">
          Administra tareas y registra trabajo diario del personal
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

      {/* Tabs */}
      <Tabs value={tabActivo} onValueChange={setTabActivo}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="kanban" className="flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Tablero Kanban
          </TabsTrigger>
          <TabsTrigger value="reportes" className="flex items-center gap-2">
            <FileBarChart className="h-4 w-4" />
            Reportes
          </TabsTrigger>
        </TabsList>

        {/* Tab: Tablero Kanban */}
        <TabsContent value="kanban">
          <KanbanBoard
            tareasFiltradas={tareasFiltradas}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            actions={columnActions}
            onNuevaTarea={handleNuevaTarea}
            onOpenCatalogo={() => setShowCatalogoDialog(true)}
            loading={loading}
          />
        </TabsContent>

        {/* Tab: Reportes */}
        <TabsContent value="reportes">
          <ReportesView
            tareas={tareas}
            empleados={empleados}
            contratistas={contratistas}
            tiposTareas={tiposTareas}
          />
        </TabsContent>
      </Tabs>

      {/* Diálogos */}
      <CrearEditarTareaDialog
        open={showCrearDialog}
        onOpenChange={setShowCrearDialog}
        tarea={tareaSeleccionada}
        tiposTareas={tiposTareas}
        lotes={lotes}
        empleados={empleados}
        onSuccess={() => {
          cargarTareas();
          setShowCrearDialog(false);
          setTareaSeleccionada(null);
        }}
        onError={(message) => showAlert('error', message)}
      />

      {/* Diálogos */}
      <RegistrarTrabajoDialog
        open={showRegistroDialog}
        onOpenChange={setShowRegistroDialog}
        tarea={tareaSeleccionada}
        empleados={empleados}
        contratistas={contratistas}
        lotes={lotes}
        onSuccess={() => {
          cargarTareas();
          setShowRegistroDialog(false);
          setTareaSeleccionada(null);
        }}
        onError={(message) => showAlert('error', message)}
      />

      <CatalogoTiposDialog
        open={showCatalogoDialog}
        onOpenChange={setShowCatalogoDialog}
        onSuccess={() => {
          cargarTiposTareas();
          setShowCatalogoDialog(false);
        }}
        onError={(message) => showAlert('error', message)}
      />

      <TareaDetalleDialog
        open={showDetalleDialog}
        onOpenChange={setShowDetalleDialog}
        tarea={tareaSeleccionada}
        onEditar={handleEditarTarea}
        onEliminar={handleEliminarTarea}
      />
    </div>
  );
};

export default Labores;