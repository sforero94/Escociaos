import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  Droplet,
  Leaf,
  Calendar,
  MapPin,
  MoreVertical,
  Play,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  AlertCircle,
  ClipboardList,
  FileText,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { IniciarEjecucionModal } from './IniciarEjecucionModal';
import { DetalleAplicacion } from './DetalleAplicacion';
import type { Aplicacion, TipoAplicacion, EstadoAplicacion } from '../../types/aplicaciones';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { KPICard } from './shared/KPICard';
import { EstadoAplicacionBadge } from './shared/EstadoAplicacionBadge';
import { formatearNumero, formatShortDate } from '@/utils/format';
import { cn } from '@/components/ui/utils';

const TIPOS_LABELS: Record<TipoAplicacion, string> = {
  'Fumigación': 'Fumigación',
  'Fertilización': 'Fertilización',
  'Drench': 'Drench',
};

export function AplicacionesList() {
  const navigate = useNavigate();
  const supabase = getSupabase();

  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoAplicacion | 'todos'>('todos');
  const [filtroEstado, setFiltroEstado] = useState<EstadoAplicacion | 'todos'>('todos');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [iniciarEjecucionId, setIniciarEjecucionId] = useState<string | null>(null);
  const [aplicacionDetalle, setAplicacionDetalle] = useState<Aplicacion | null>(null);

  useEffect(() => {
    loadAplicaciones();
  }, []);

  const loadAplicaciones = async () => {
    try {
      setIsLoading(true);
      setLoadError(false);

      const { data, error } = await supabase
        .from('aplicaciones')
        .select(`
          id,
          codigo_aplicacion,
          nombre_aplicacion,
          tipo_aplicacion,
          proposito,
          blanco_biologico,
          fecha_inicio_planeada,
          fecha_fin_planeada,
          fecha_recomendacion,
          fecha_inicio_ejecucion,
          fecha_fin_ejecucion,
          fecha_cierre,
          agronomo_responsable,
          estado,
          created_at,
          updated_at,
          aplicaciones_lotes (
            lote_id,
            lotes (
              nombre
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Mapear datos de BD al formato de la interfaz
      const aplicacionesMapeadas: Aplicacion[] = [];

      (data || []).forEach((row: any) => {
        try {
          // Extraer lotes seleccionados
          const lotesSeleccionados = (row.aplicaciones_lotes || []).map((al: any) => ({
            lote_id: al.lote_id,
            nombre: al.lotes?.nombre || 'Lote sin nombre',
            sublotes_ids: [],
            area_hectareas: 0,
            conteo_arboles: {
              grandes: 0,
              medianos: 0,
              pequenos: 0,
              clonales: 0,
              total: 0,
            },
          }));

          // Parsear blanco_biologico de forma segura
          let blancoBiologico: string[] = [];
          if (row.blanco_biologico) {
            try {
              // Intentar parsear como JSON
              blancoBiologico = JSON.parse(row.blanco_biologico);
              // Si no es array, convertirlo a array
              if (!Array.isArray(blancoBiologico)) {
                blancoBiologico = [];
              }
            } catch (e) {
              // Si falla el parse, es texto plano - dejarlo como array vacío
              blancoBiologico = [];
            }
          }

          aplicacionesMapeadas.push({
            id: row.id,
            nombre_aplicacion: row.nombre_aplicacion || 'Sin nombre',
            tipo_aplicacion: row.tipo_aplicacion as TipoAplicacion,
            fecha_inicio_planeada: row.fecha_inicio_planeada,
            fecha_fin_planeada: row.fecha_fin_planeada,
            fecha_recomendacion: row.fecha_recomendacion,
            fecha_inicio_ejecucion: row.fecha_inicio_ejecucion,
            fecha_fin_ejecucion: row.fecha_fin_ejecucion,
            fecha_cierre: row.fecha_cierre,
            estado: row.estado as EstadoAplicacion,
            proposito: row.proposito,
            agronomo_responsable: row.agronomo_responsable,
            created_at: row.created_at,
            updated_at: row.updated_at,
            fecha_inicio: row.fecha_recomendacion || row.created_at,
            configuracion: {
              nombre: row.nombre_aplicacion || 'Sin nombre',
              tipo_aplicacion: row.tipo_aplicacion as TipoAplicacion,
              fecha_inicio_planeada: row.fecha_recomendacion || row.created_at,
              proposito: row.proposito,
              agronomo_responsable: row.agronomo_responsable,
              blanco_biologico: blancoBiologico,
              lotes_seleccionados: lotesSeleccionados,
            },
            mezclas: [],
            calculos: [],
            lista_compras: {
              items: [],
              costo_total_estimado: 0,
              productos_sin_precio: 0,
              productos_sin_stock: 0,
            },
            creado_en: row.created_at,
            creado_por: '',
            actualizado_en: row.updated_at,
          });
        } catch (rowError) {
          // Continuar con el siguiente registro
        }
      });

      setAplicaciones(aplicacionesMapeadas);
    } catch (err) {
      console.error('Failed to load aplicaciones list:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar aplicaciones
  const aplicacionesFiltradas = aplicaciones.filter((app) => {
    const matchSearch =
      searchQuery === '' ||
      app.nombre_aplicacion?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.proposito?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchTipo = filtroTipo === 'todos' || app.tipo_aplicacion === filtroTipo;
    const matchEstado = filtroEstado === 'todos' || app.estado === filtroEstado;

    return matchSearch && matchTipo && matchEstado;
  });

  const hayFiltrosActivos = searchQuery !== '' || filtroTipo !== 'todos' || filtroEstado !== 'todos';

  // Estadísticas
  const stats = {
    total: aplicaciones.length,
    planificadas: aplicaciones.filter((a) => a.estado === 'Calculada').length,
    en_ejecucion: aplicaciones.filter((a) => a.estado === 'En ejecución').length,
    cerradas: aplicaciones.filter((a) => a.estado === 'Cerrada').length,
  };

  const aplicacionAEliminar = aplicaciones.find((a) => a.id === eliminando) ?? null;

  /**
   * ELIMINAR APLICACIÓN
   */
  const handleEliminar = async (aplicacionId: string) => {
    try {
      // 1. Verificar y eliminar movimientos de inventario primero
      const { data: movimientos, error: errorCheckMovimientos } = await supabase
        .from('movimientos_inventario')
        .select('id')
        .eq('aplicacion_id', aplicacionId);

      if (errorCheckMovimientos) {
        throw errorCheckMovimientos;
      }

      if (movimientos && movimientos.length > 0) {
        const { error: errorDeleteMovimientos } = await supabase
          .from('movimientos_inventario')
          .delete()
          .eq('aplicacion_id', aplicacionId);

        if (errorDeleteMovimientos) {
          throw errorDeleteMovimientos;
        }
      } else {
        /* no inventory movements to delete — proceed */
      }

      // 2. Eliminar relaciones con lotes
      const { error: errorLotes } = await supabase
        .from('aplicaciones_lotes')
        .delete()
        .eq('aplicacion_id', aplicacionId);

      if (errorLotes) {
        throw errorLotes;
      }

      // 3. Obtener IDs de mezclas
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacionId);

      if (errorMezclas) {
        throw errorMezclas;
      }

      // 4. Eliminar productos de las mezclas
      if (mezclas && mezclas.length > 0) {
        const mezclaIds = mezclas.map(m => m.id);

        const { error: errorProductosMezcla } = await supabase
          .from('aplicaciones_productos')
          .delete()
          .in('mezcla_id', mezclaIds);

        if (errorProductosMezcla) {
          throw errorProductosMezcla;
        }

        // 5. Eliminar mezclas
        const { error: errorDeleteMezclas } = await supabase
          .from('aplicaciones_mezclas')
          .delete()
          .in('id', mezclaIds);

        if (errorDeleteMezclas) {
          throw errorDeleteMezclas;
        }
      }

      // 6. Eliminar cálculos
      const { error: errorCalculos } = await supabase
        .from('aplicaciones_calculos')
        .delete()
        .eq('aplicacion_id', aplicacionId);

      if (errorCalculos) {
        throw errorCalculos;
      }

      // 7. Eliminar lista de compras
      const { error: errorCompras } = await supabase
        .from('aplicaciones_compras')
        .delete()
        .eq('aplicacion_id', aplicacionId);

      if (errorCompras) {
        throw errorCompras;
      }

      // 8. Finalmente, eliminar la aplicación
      const { error: errorAplicacion } = await supabase
        .from('aplicaciones')
        .delete()
        .eq('id', aplicacionId);

      if (errorAplicacion) {
        throw errorAplicacion;
      }

      // Actualizar lista local
      setAplicaciones(aplicaciones.filter(a => a.id !== aplicacionId));
      setEliminando(null);

      toast.success('Aplicación eliminada exitosamente');
    } catch (error) {
      toast.error('Error al eliminar la aplicación. Por favor intenta nuevamente.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground mb-2">Aplicaciones Fitosanitarias</h1>
          <p className="text-brand-brown/70">
            Gestiona fumigaciones, fertilizaciones y aplicaciones del cultivo
          </p>
        </div>

        <Button onClick={() => navigate('/aplicaciones/calculadora')} className="w-full sm:w-auto">
          <Plus className="size-4" aria-hidden="true" />
          Nueva Aplicación
        </Button>
      </div>

      {/* Estadísticas — solo "En Ejecución" lleva el acento olivo: es el único
          estado que pide acción hoy (misma jerarquía que EstadoAplicacionBadge). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          titulo="Total"
          valor={formatearNumero(stats.total, 0)}
          icon={Calendar}
          tono="neutro"
          comparaciones={[]}
        />
        <KPICard
          titulo="Planificadas"
          valor={formatearNumero(stats.planificadas, 0)}
          icon={Clock}
          tono="neutro"
          comparaciones={[]}
        />
        <KPICard
          titulo="En Ejecución"
          valor={formatearNumero(stats.en_ejecucion, 0)}
          icon={Play}
          tono="primary"
          comparaciones={[]}
        />
        <KPICard
          titulo="Cerradas"
          valor={formatearNumero(stats.cerradas, 0)}
          icon={CheckCircle2}
          tono="neutro"
          comparaciones={[]}
        />
      </div>

      {/* Filtros y búsqueda */}
      <Card className="p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              placeholder="Buscar aplicación..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Toggle de filtros — solo móvil: los filtros de abajo se colapsan detrás de
              este botón para no competir por ancho con el buscador. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltrosAbiertos((prev) => !prev)}
            className="sm:hidden justify-between"
            aria-expanded={filtrosAbiertos}
          >
            <span className="flex items-center gap-2">
              <Filter className="size-4" aria-hidden="true" />
              Filtros
            </span>
            <ChevronDown
              className={cn('size-4 transition-transform', filtrosAbiertos && 'rotate-180')}
              aria-hidden="true"
            />
          </Button>

          <div
            className={cn(
              'flex flex-col gap-3 sm:flex sm:flex-row',
              !filtrosAbiertos && 'hidden sm:flex',
            )}
          >
            <ToggleGroup
              type="single"
              variant="outline"
              value={filtroEstado}
              onValueChange={(value) => {
                if (value) setFiltroEstado(value as EstadoAplicacion | 'todos');
              }}
              aria-label="Filtrar por estado"
              className="w-full sm:w-auto"
            >
              {/* px-3 + sm:flex-none: ToggleGroupItem trae `min-w-0 flex-1` con `px-2` en el
                  primitivo, así que en escritorio los 4 se reparten el ancho por igual y
                  "En Ejecución" (el más largo) se desborda de su caja y se pega visualmente al
                  vecino. En móvil el grupo sí es de ancho completo y el reparto igual es correcto,
                  por eso el override solo aplica desde sm. */}
              <ToggleGroupItem value="todos" className="px-3 sm:flex-none">Todos</ToggleGroupItem>
              <ToggleGroupItem value="Calculada" className="px-3 sm:flex-none">Planificada</ToggleGroupItem>
              <ToggleGroupItem value="En ejecución" className="px-3 sm:flex-none">En Ejecución</ToggleGroupItem>
              <ToggleGroupItem value="Cerrada" className="px-3 sm:flex-none">Cerrada</ToggleGroupItem>
            </ToggleGroup>

            <Select
              value={filtroTipo}
              onValueChange={(value) => setFiltroTipo(value as TipoAplicacion | 'todos')}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="Fumigación">Fumigación</SelectItem>
                <SelectItem value="Fertilización">Fertilización</SelectItem>
                <SelectItem value="Drench">Drench</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista de aplicaciones */}
      <Card className="overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="size-11 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
                <AlertCircle aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No se pudieron cargar las aplicaciones</EmptyTitle>
              <EmptyDescription>
                Revisa tu conexión e intenta de nuevo. Si el problema persiste, contacta a soporte.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={loadAplicaciones}>
                Reintentar
              </Button>
            </EmptyContent>
          </Empty>
        ) : aplicacionesFiltradas.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {hayFiltrosActivos ? <Search aria-hidden="true" /> : <Droplet aria-hidden="true" />}
              </EmptyMedia>
              <EmptyTitle>
                {hayFiltrosActivos ? 'No se encontraron aplicaciones' : 'No hay aplicaciones registradas'}
              </EmptyTitle>
              <EmptyDescription>
                {hayFiltrosActivos
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'Comienza creando tu primera aplicación'}
              </EmptyDescription>
            </EmptyHeader>
            {!hayFiltrosActivos && (
              <EmptyContent>
                <Button onClick={() => navigate('/aplicaciones/calculadora')}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nueva Aplicación
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {aplicacionesFiltradas.map((aplicacion) => {
              const TipoIcon = aplicacion.tipo_aplicacion === 'Fumigación' ? Droplet : Leaf;
              const nombre = aplicacion.nombre_aplicacion ?? 'Sin nombre';
              const fechaMostrar =
                aplicacion.fecha_inicio ?? aplicacion.fecha_inicio_planeada ?? aplicacion.created_at ?? null;

              return (
                <div
                  key={aplicacion.id}
                  className="p-4 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => setAplicacionDetalle(aplicacion)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {/* Icono */}
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <TipoIcon className="size-5" aria-hidden="true" />
                      </div>

                      {/* Información */}
                      <div className="flex-1 min-w-0">
                        {/* Trunca a 1 línea en escritorio; envuelve a 2 en móvil (mismo patrón
                            que `.gasto-nombre` en Gastos/Ingresos: `truncate` + `max-sm:*`). */}
                        <h3
                          title={nombre}
                          className="text-foreground text-sm sm:text-base font-medium mb-1.5 truncate max-sm:whitespace-normal max-sm:line-clamp-2"
                        >
                          {nombre}
                        </h3>

                        {/* Badge de estado — solo en móvil, bajo el título. En escritorio
                            vive en el cluster de acciones (ver fix 1 del mockup: badge +
                            botón + ⋮ comparten un solo ancla vertical). */}
                        <div className="sm:hidden mb-1.5">
                          <EstadoAplicacionBadge estado={aplicacion.estado} />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brand-brown/70">
                          <span className="flex items-center gap-1.5">
                            <TipoIcon className="size-3.5" aria-hidden="true" />
                            {TIPOS_LABELS[aplicacion.tipo_aplicacion]}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="size-3.5" aria-hidden="true" />
                            {fechaMostrar ? formatShortDate(fechaMostrar) : '—'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5" aria-hidden="true" />
                            {aplicacion.configuracion?.lotes_seleccionados?.length ?? 0} lotes
                          </span>
                        </div>

                        {aplicacion.proposito && (
                          <p className="text-sm text-brand-brown/70 mt-1.5 truncate">
                            {aplicacion.proposito}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Cluster de acciones — escritorio (≥640px): badge + botón principal + ⋮,
                        un solo grupo flex (align-items:center, self-center sobre la fila) para
                        que se centre igual sin importar cuántas líneas ocupe el título ni si
                        hay descripción. */}
                    <div className="hidden sm:flex items-center gap-3 self-center flex-shrink-0">
                      <EstadoAplicacionBadge estado={aplicacion.estado} />

                      {aplicacion.estado === 'Calculada' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIniciarEjecucionId(aplicacion.id);
                          }}
                        >
                          <Play className="size-4" aria-hidden="true" />
                          <span className="hidden lg:inline">Iniciar Ejecución</span>
                        </Button>
                      )}

                      {aplicacion.estado === 'En ejecución' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/aplicaciones/${aplicacion.id}/movimientos`);
                          }}
                        >
                          <ClipboardList className="size-4" aria-hidden="true" />
                          <span className="hidden lg:inline">Registrar Movimientos</span>
                        </Button>
                      )}

                      {aplicacion.estado === 'Cerrada' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/aplicaciones/${aplicacion.id}/reporte`);
                          }}
                        >
                          <FileText className="size-4" aria-hidden="true" />
                          <span className="hidden lg:inline">Ver Reporte</span>
                        </Button>
                      )}

                      {/* Menú de 3 puntos (Radix) — solo Editar y Eliminar; la acción
                          principal ya vive fuera, como botón visible en escritorio. */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="border-none text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                              aria-label={`Más acciones para "${nombre}"`}
                            >
                              <MoreVertical className="size-5" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/aplicaciones/calculadora/${aplicacion.id}`)}
                            >
                              <Edit2 className="size-4" aria-hidden="true" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setEliminando(aplicacion.id)}>
                              <Trash2 className="size-4" aria-hidden="true" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Acciones — móvil (<640px): decisión del dueño tras la tercera
                        vuelta, "esconde todas las acciones detrás de los 3 puntos". Un
                        único ⋮ de 44px reemplaza tanto el botón principal como el menú
                        Editar/Eliminar; la condición por estado se conserva idéntica,
                        solo cambia dónde se muestra cada acción. */}
                    <div className="sm:hidden flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="border-none text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                            aria-label={`Más acciones para "${nombre}"`}
                          >
                            <MoreVertical className="size-5" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {aplicacion.estado === 'Calculada' && (
                            <DropdownMenuItem onClick={() => setIniciarEjecucionId(aplicacion.id)}>
                              <Play className="size-4" aria-hidden="true" />
                              Iniciar Ejecución
                            </DropdownMenuItem>
                          )}

                          {aplicacion.estado === 'En ejecución' && (
                            <DropdownMenuItem
                              onClick={() => navigate(`/aplicaciones/${aplicacion.id}/movimientos`)}
                            >
                              <ClipboardList className="size-4" aria-hidden="true" />
                              Registrar Movimientos
                            </DropdownMenuItem>
                          )}

                          {aplicacion.estado === 'Cerrada' && (
                            <DropdownMenuItem onClick={() => navigate(`/aplicaciones/${aplicacion.id}/reporte`)}>
                              <FileText className="size-4" aria-hidden="true" />
                              Ver Reporte
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() => navigate(`/aplicaciones/calculadora/${aplicacion.id}`)}
                          >
                            <Edit2 className="size-4" aria-hidden="true" />
                            Editar
                          </DropdownMenuItem>

                          <DropdownMenuItem variant="destructive" onClick={() => setEliminando(aplicacion.id)}>
                            <Trash2 className="size-4" aria-hidden="true" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Confirmación de eliminación — AlertDialog (ConfirmDialog ya lo envuelve), nunca un
          <div fixed inset-0> a mano: foco atrapado, cierre con Escape, accesible por defecto. */}
      <ConfirmDialog
        open={!!eliminando}
        onOpenChange={(open) => {
          if (!open) setEliminando(null);
        }}
        title="Eliminar Aplicación"
        description={`¿Deseas eliminar «${aplicacionAEliminar?.nombre_aplicacion ?? 'esta aplicación'}»? Se eliminarán todos los datos asociados: mezclas, cálculos y relaciones con lotes. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (eliminando) handleEliminar(eliminando);
        }}
        destructive
      />

      {/* Modal de iniciar ejecución */}
      {iniciarEjecucionId && (
        <IniciarEjecucionModal
          aplicacion={aplicaciones.find(a => a.id === iniciarEjecucionId)!}
          onClose={() => setIniciarEjecucionId(null)}
          onSuccess={() => {
            setIniciarEjecucionId(null);
            loadAplicaciones();
          }}
        />
      )}

      {/* Modal de detalle de aplicación */}
      {aplicacionDetalle && (
        <DetalleAplicacion
          aplicacion={aplicacionDetalle}
          onClose={() => setAplicacionDetalle(null)}
          onEditar={() => {
            setAplicacionDetalle(null);
            navigate(`/aplicaciones/calculadora/${aplicacionDetalle.id}`);
          }}
          onRegistrarMovimientos={() => {
            setAplicacionDetalle(null);
            navigate(`/aplicaciones/${aplicacionDetalle.id}/movimientos`);
          }}
          onCerrarAplicacion={() => {
            setAplicacionDetalle(null);
            navigate(`/aplicaciones/${aplicacionDetalle.id}/cierre`);
          }}
          onIniciarEjecucion={() => {
            setAplicacionDetalle(null);
            setIniciarEjecucionId(aplicacionDetalle.id);
          }}
        />
      )}
    </div>
  );
}
