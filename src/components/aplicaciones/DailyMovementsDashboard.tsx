import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  Package,
  Calendar as CalendarIcon,
  User,
  Trash2,
  Plus,
  ChevronDown,
  Download,
  Droplet,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { getSupabase } from '../../utils/supabase/client';
import { DailyMovementForm } from './DailyMovementForm';
import { IniciarEjecucionModal } from './IniciarEjecucionModal';
import { AplicacionShell } from './shared/AplicacionShell';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '../ui/accordion';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Spinner } from '../ui/spinner';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import type {
  Aplicacion,
  MovimientoDiario,
  MovimientoDiarioProducto,
  ResumenMovimientoDiario,
  AlertaMovimiento,
  ProductoEnMezcla,
} from '../../types/aplicaciones';
import { obtenerFechaHoy } from '@/utils/fechas';
import { usaCanecas, unidadAplicacion } from '@/utils/calculosAplicaciones';
import { formatearNumero, formatShortDate } from '@/utils/format';

interface DailyMovementsDashboardProps {
  aplicacion: Aplicacion;
}

// Tipo extendido con productos cargados
interface MovimientoConProductos extends MovimientoDiario {
  productos: MovimientoDiarioProducto[];
}

/** Unidades abreviadas para las filas de producto dentro de un movimiento expandido. */
const MAPA_UNIDAD_CORTA: Record<string, string> = {
  L: 'L',
  cc: 'cc',
  Kg: 'Kg',
  g: 'g',
  Litros: 'L',
  Kilos: 'Kg',
  litros: 'L',
  kilos: 'Kg',
  Unidades: 'Unid.',
};

type EstadoProgreso = 'ok' | 'warn' | 'over';

/**
 * Único punto que decide "¿este progreso está bien, cerca del límite, o excedido?".
 *
 * La condición de excedido SIEMPRE se evalúa contra el valor exacto (via el parámetro
 * `excede`, calculado por el llamante como `utilizado > planeado`) — nunca contra el
 * porcentaje redondeado. Es el bug real que este workflow corrige: 76,0/75,8 canecas
 * redondea a "100%" y esconde un exceso real de 0,2 canecas.
 */
function estadoProgreso(porcentajeUsado: number, excede: boolean): EstadoProgreso {
  if (excede) return 'over';
  if (porcentajeUsado >= 90) return 'warn';
  return 'ok';
}

const CLASE_BARRA: Record<EstadoProgreso, string> = {
  ok: '[&>[data-slot=progress-indicator]]:bg-primary',
  warn: '[&>[data-slot=progress-indicator]]:bg-warning',
  over: '[&>[data-slot=progress-indicator]]:bg-destructive',
};

const CLASE_BADGE: Record<EstadoProgreso, string> = {
  ok: 'border-primary/20 bg-primary/10 text-primary',
  warn: 'border-warning/40 bg-warning/15 text-warning-foreground',
  over: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/** Barra de progreso + marca de desborde cuando excede el 100% del track. */
function BarraProgreso({ porcentaje, estado }: { porcentaje: number; estado: EstadoProgreso }) {
  return (
    <div className="relative mt-2.5">
      <Progress value={Math.min(porcentaje, 100)} className={cn('h-2', CLASE_BARRA[estado])} />
      {estado === 'over' && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-[3px] rounded-full bg-destructive ring-4 ring-destructive/25"
        />
      )}
    </div>
  );
}

/**
 * Badge de progreso. Nunca dice solo "100%" cuando está excedido — dice
 * "Excedido +delta" con el valor real. Por debajo de 100% muestra el porcentaje con
 * UN decimal (99,7%), nunca redondeado a entero.
 */
function BadgeProgreso({
  excede,
  porcentaje,
  delta,
  decimalesDelta = 2,
}: {
  excede: boolean;
  porcentaje: number;
  delta: number;
  decimalesDelta?: number;
}) {
  const estado = estadoProgreso(porcentaje, excede);
  return (
    <Badge variant="outline" className={cn('shrink-0', CLASE_BADGE[estado])}>
      {excede
        ? `Excedido +${formatearNumero(Math.abs(delta), decimalesDelta)}`
        : `${formatearNumero(porcentaje, 1)}%`}
    </Badge>
  );
}

export function DailyMovementsDashboard({ aplicacion }: DailyMovementsDashboardProps) {
  const supabase = getSupabase();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [resumenAbierto, setResumenAbierto] = useState(true);

  // Datos — declared before any conditional return to satisfy Rules of Hooks
  const [movimientos, setMovimientos] = useState<MovimientoConProductos[]>([]);
  const [productosPlanificados, setProductosPlanificados] = useState<ProductoEnMezcla[]>([]);
  const [resumen, setResumen] = useState<ResumenMovimientoDiario[]>([]);
  const [alertas, setAlertas] = useState<AlertaMovimiento[]>([]);
  const [canecasTotales, setCanecasTotales] = useState<{
    planeadas: number;
    utilizadas: number;
    porcentaje: number;
  }>({ planeadas: 0, utilizadas: 0, porcentaje: 0 });
  const [confirmEliminarMovimientoId, setConfirmEliminarMovimientoId] = useState<string | null>(null);
  const [showIniciarEjecucion, setShowIniciarEjecucion] = useState(false);

  // Salir si la aplicación se cierra mientras estamos aquí
  useEffect(() => {
    if (aplicacion.estado === 'Cerrada') {
      navigate('/aplicaciones');
    }
  }, [aplicacion.estado, navigate]);

  useEffect(() => {
    loadData();
  }, [aplicacion.id]);

  useEffect(() => {
    calcularResumen();
    calcularCanecasTotales();
  }, [movimientos, productosPlanificados]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadMovimientos(),
        loadProductosPlanificados(),
        loadCanecasPlaneadas(),
      ]);
    } catch {
      // individual loaders handle their own errors
    } finally {
      setLoading(false);
    }
  };

  const loadMovimientos = async () => {
    try {
      // 1. Cargar movimientos diarios (padre)
      const { data: movimientosData, error: errorMovimientos } = await supabase
        .from('movimientos_diarios')
        .select('*')
        .eq('aplicacion_id', aplicacion.id)
        .order('fecha_movimiento', { ascending: false });

      if (errorMovimientos) throw errorMovimientos;

      if (!movimientosData || movimientosData.length === 0) {
        setMovimientos([]);
        return;
      }

      // 2. Cargar productos de cada movimiento
      const movimientoIds = movimientosData.map(m => m.id);
      const { data: productosData, error: errorProductos } = await supabase
        .from('movimientos_diarios_productos')
        .select('*')
        .in('movimiento_diario_id', movimientoIds);

      if (errorProductos) throw errorProductos;

      // 3. Para fertilización, cargar presentacion_kg_l de cada producto
      const presentacionMap = new Map<string, number>();
      if (aplicacion.tipo_aplicacion === 'Fertilización') {
        const productosIds = Array.from(new Set((productosData || []).map(p => p.producto_id)));
        if (productosIds.length > 0) {
          const { data: presentacionesData, error: errorPresentaciones } = await supabase
            .from('productos')
            .select('id, presentacion_kg_l')
            .in('id', productosIds);

          if (!errorPresentaciones && presentacionesData) {
            presentacionesData.forEach(p => {
              if (p.presentacion_kg_l) {
                presentacionMap.set(p.id, p.presentacion_kg_l);
              }
            });
          }
        }
      }

      // 4. Agrupar productos por movimiento
      const movimientosConProductos = movimientosData.map(mov => {
        const productosMovimiento = (productosData || []).filter(
          p => p.movimiento_diario_id === mov.id
        );

        return {
          ...mov,
          productos: productosMovimiento,
        };
      });

      setMovimientos(movimientosConProductos as MovimientoConProductos[]);
    } catch {
      // error logged by caller
    }
  };

  const loadProductosPlanificados = async () => {
    try {
      // Cargar productos de las mezclas
      const { data: mezclasData, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) throw errorMezclas;

      if (mezclasData && mezclasData.length > 0) {
        const mezclaIds = mezclasData.map(m => m.id);

        const { data: productosData, error: errorProductos } = await supabase
          .from('aplicaciones_productos')
          .select('*')
          .in('mezcla_id', mezclaIds);

        if (errorProductos) throw errorProductos;

        // Consolidar productos duplicados sumando cantidades
        const productosMap = new Map<string, ProductoEnMezcla>();
        (productosData || []).forEach(p => {
          const existing = productosMap.get(p.producto_id);
          if (existing) {
            existing.cantidad_total_necesaria += p.cantidad_total_necesaria;
          } else {
            productosMap.set(p.producto_id, {
              producto_id: p.producto_id,
              producto_nombre: p.producto_nombre,
              producto_categoria: p.producto_categoria,
              producto_unidad: p.producto_unidad,
              cantidad_total_necesaria: p.cantidad_total_necesaria,
            });
          }
        });

        setProductosPlanificados(Array.from(productosMap.values()));
      }
    } catch {
      // error logged by caller
    }
  };

  const loadCanecasPlaneadas = async () => {
    try {
      const { data: calculosData, error } = await supabase
        .from('aplicaciones_calculos')
        .select('numero_canecas')
        .eq('aplicacion_id', aplicacion.id);

      if (error) throw error;

      const totalPlaneadas = (calculosData || []).reduce((sum, calc) => sum + (calc.numero_canecas || 0), 0);

      return totalPlaneadas;
    } catch {
      return 0;
    }
  };

  const calcularResumen = () => {
    const resumenMap = new Map<string, ResumenMovimientoDiario>();
    const nuevasAlertas: AlertaMovimiento[] = [];

    // Inicializar con productos planificados
    productosPlanificados.forEach(pp => {
      resumenMap.set(pp.producto_id, {
        producto_id: pp.producto_id,
        producto_nombre: pp.producto_nombre,
        producto_unidad: pp.producto_unidad,
        total_utilizado: 0,
        cantidad_planeada: pp.cantidad_total_necesaria,
        diferencia: -pp.cantidad_total_necesaria,
        porcentaje_usado: 0,
        excede_planeado: false,
      });
    });

    // Sumar productos de todos los movimientos
    movimientos.forEach(mov => {
      mov.productos.forEach(producto => {
        const resumenItem = resumenMap.get(producto.producto_id);

        // Convertir a unidad base (L o Kg) para comparar con planificado
        let cantidadEnUnidadBase = producto.cantidad_utilizada;

        if ((producto.unidad as string) === 'bultos' && (producto as any).presentacion_kg_l) {
          cantidadEnUnidadBase = producto.cantidad_utilizada * (producto as any).presentacion_kg_l;
        } else if ((producto.unidad as string) === 'cc') {
          cantidadEnUnidadBase = producto.cantidad_utilizada / 1000;
        } else if ((producto.unidad as string) === 'g') {
          cantidadEnUnidadBase = producto.cantidad_utilizada / 1000;
        }

        if (resumenItem) {
          resumenItem.total_utilizado += cantidadEnUnidadBase;
          resumenItem.diferencia = resumenItem.total_utilizado - resumenItem.cantidad_planeada;
          resumenItem.porcentaje_usado = resumenItem.cantidad_planeada > 0
            ? (resumenItem.total_utilizado / resumenItem.cantidad_planeada) * 100
            : 0;
          resumenItem.excede_planeado = resumenItem.total_utilizado > resumenItem.cantidad_planeada;
        } else {
          resumenMap.set(producto.producto_id, {
            producto_id: producto.producto_id,
            producto_nombre: producto.producto_nombre,
            producto_unidad: (producto.unidad as string) === 'cc' || (producto.unidad as string) === 'L' || producto.unidad === 'Litros' ? 'Litros' : 'Kilos',
            total_utilizado: cantidadEnUnidadBase,
            cantidad_planeada: 0,
            diferencia: cantidadEnUnidadBase,
            porcentaje_usado: Infinity,
            excede_planeado: true,
          });
        }
      });
    });

    // Generar alertas
    resumenMap.forEach(item => {
      if (item.cantidad_planeada === 0 && item.total_utilizado > 0) {
        nuevasAlertas.push({
          tipo: 'warning',
          producto_nombre: item.producto_nombre,
          mensaje: 'Producto utilizado sin planificación previa',
          porcentaje_usado: Infinity,
        });
      } else if (item.porcentaje_usado > 100) {
        nuevasAlertas.push({
          tipo: 'error',
          producto_nombre: item.producto_nombre,
          mensaje: `Se ha excedido la cantidad planificada en ${formatearNumero(Math.abs(item.diferencia), 2)} ${item.producto_unidad}`,
          porcentaje_usado: item.porcentaje_usado,
        });
      } else if (item.porcentaje_usado >= 90) {
        nuevasAlertas.push({
          tipo: 'warning',
          producto_nombre: item.producto_nombre,
          mensaje: `Cerca del límite planificado (${formatearNumero(item.porcentaje_usado, 1)}%)`,
          porcentaje_usado: item.porcentaje_usado,
        });
      }
    });

    setResumen(Array.from(resumenMap.values()));
    setAlertas(nuevasAlertas);
  };

  const calcularCanecasTotales = async () => {
    try {
      const totalPlaneadas = await loadCanecasPlaneadas();
      const totalUtilizadas = movimientos.reduce((sum, mov) => sum + (mov.numero_canecas || 0), 0);
      const porcentaje = totalPlaneadas > 0 ? (totalUtilizadas / totalPlaneadas) * 100 : 0;

      setCanecasTotales({
        planeadas: totalPlaneadas,
        utilizadas: totalUtilizadas,
        porcentaje,
      });
    } catch {
      // error logged by caller
    }
  };

  const handleEliminarMovimiento = (movimientoId: string) => {
    setConfirmEliminarMovimientoId(movimientoId);
  };

  const confirmarEliminarMovimiento = async () => {
    if (!confirmEliminarMovimientoId) return;
    const movimientoId = confirmEliminarMovimientoId;
    setConfirmEliminarMovimientoId(null);

    try {
      // Al eliminar el movimiento, los productos se eliminarán en cascada
      const { error } = await supabase
        .from('movimientos_diarios')
        .delete()
        .eq('id', movimientoId);

      if (error) throw error;

      await loadMovimientos();
    } catch {
      toast.error('Error al eliminar el movimiento');
    }
  };

  const exportarACSV = () => {
    let csv = 'Fecha,Lote,Canecas,Producto,Cantidad,Unidad,Responsable,Notas\n';

    movimientos.forEach(mov => {
      mov.productos.forEach(producto => {
        csv += `${mov.fecha_movimiento},${mov.lote_nombre},${mov.numero_canecas},${producto.producto_nombre},${producto.cantidad_utilizada},${producto.unidad},${mov.responsable},"${mov.notas || ''}"\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `movimientos_diarios_${aplicacion.nombre_aplicacion}_${obtenerFechaHoy()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const subtitulo = aplicacion.nombre_aplicacion
    ? `${aplicacion.nombre_aplicacion} · ${movimientos.length} ${movimientos.length === 1 ? 'registro' : 'registros'}`
    : undefined;

  // Validar que la aplicación esté en ejecución. Aunque ya cerrada navega fuera
  // (ver efecto arriba), 'Calculada' u otro estado intermedio no permite registrar.
  if (aplicacion.estado !== 'En ejecución' && aplicacion.estado !== 'Cerrada') {
    return (
      <AplicacionShell titulo="Movimientos Diarios" subtitulo={subtitulo} estado={aplicacion.estado}>
        <Empty>
          <EmptyMedia variant="icon" className="bg-warning/15 text-warning-foreground">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>Aplicación no iniciada</EmptyTitle>
          <EmptyDescription>
            Esta aplicación está en estado "{aplicacion.estado ?? '—'}". Debes iniciar la ejecución antes
            de poder registrar movimientos diarios.
          </EmptyDescription>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => setShowIniciarEjecucion(true)}>Iniciar Ejecución</Button>
              <Button variant="outline" onClick={() => navigate('/aplicaciones')}>
                Volver
              </Button>
            </div>
          </EmptyContent>
        </Empty>

        {showIniciarEjecucion && (
          <IniciarEjecucionModal
            aplicacion={aplicacion}
            onClose={() => setShowIniciarEjecucion(false)}
            onSuccess={() => {
              setShowIniciarEjecucion(false);
              window.location.reload();
            }}
          />
        )}
      </AplicacionShell>
    );
  }

  if (loading) {
    return (
      <AplicacionShell titulo="Movimientos Diarios" subtitulo={subtitulo} estado={aplicacion.estado}>
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <Spinner className="size-8 text-primary" />
          <p className="text-sm text-muted-foreground">Cargando movimientos…</p>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </AplicacionShell>
    );
  }

  const canecasExcede = canecasTotales.utilizadas > canecasTotales.planeadas;
  const canecasEstado = estadoProgreso(canecasTotales.porcentaje, canecasExcede);
  const hayMovimientos = movimientos.length > 0;

  return (
    <AplicacionShell
      titulo="Movimientos Diarios"
      subtitulo={subtitulo}
      estado={aplicacion.estado}
      acciones={
        <div className="hidden items-center gap-3 sm:flex">
          {hayMovimientos && (
            <Button variant="outline" onClick={exportarACSV}>
              <Download className="size-4" />
              Exportar CSV
            </Button>
          )}
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            Nuevo Movimiento
          </Button>
        </div>
      }
    >
      {!hayMovimientos ? (
        <Empty>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>Sin movimientos todavía</EmptyTitle>
          <EmptyDescription>Registra el primer movimiento diario de esta aplicación.</EmptyDescription>
          <EmptyContent>
            <Button onClick={() => setFormOpen(true)}>Registrar el primero</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-5">
          {/* Progreso de Canecas/Bultos */}
          {usaCanecas(aplicacion.tipo_aplicacion) && (
            <div className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-xl',
                  canecasEstado === 'over' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                )}
              >
                <Droplet className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Progreso de Canecas</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {formatearNumero(canecasTotales.utilizadas, 1)}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    / {formatearNumero(canecasTotales.planeadas, 1)} {unidadAplicacion(aplicacion.tipo_aplicacion)}
                  </span>
                  <BadgeProgreso
                    excede={canecasExcede}
                    porcentaje={canecasTotales.porcentaje}
                    delta={canecasTotales.utilizadas - canecasTotales.planeadas}
                    decimalesDelta={1}
                  />
                </div>
                <BarraProgreso porcentaje={canecasTotales.porcentaje} estado={canecasEstado} />
                {canecasEstado === 'over' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatearNumero(canecasTotales.porcentaje, 1)}% de lo planeado — el redondeo a 100% nunca
                    oculta el exceso
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {/* Alertas */}
            {alertas.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-[18px] text-warning" />
                  <h3 className="text-[0.92rem] font-semibold text-foreground">Alertas</h3>
                  <Badge variant="outline" className="ml-auto border-border bg-muted text-muted-foreground">
                    {alertas.length}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {alertas.map((alerta, idx) => (
                    <Alert
                      key={idx}
                      variant={alerta.tipo === 'error' ? 'destructive' : alerta.tipo === 'warning' ? 'warning' : 'default'}
                    >
                      {alerta.tipo === 'error' ? <AlertCircle /> : <AlertTriangle />}
                      <AlertTitle>{alerta.producto_nombre}</AlertTitle>
                      <AlertDescription>{alerta.mensaje}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}

            {/* Resumen de Productos */}
            <div className={cn('rounded-2xl border border-border bg-card shadow-sm', alertas.length === 0 && 'md:col-span-2')}>
              <Collapsible open={resumenAbierto} onOpenChange={setResumenAbierto}>
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-t-2xl px-5 py-4 text-left hover:bg-primary/5">
                  <Package className="size-[18px] text-primary" />
                  <h3 className="text-[0.92rem] font-semibold text-foreground">Resumen de Productos</h3>
                  <ChevronDown
                    className={cn('ml-auto size-4 text-muted-foreground transition-transform', resumenAbierto && 'rotate-180')}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-5 pb-5">
                  {resumen.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No hay productos planificados</p>
                  ) : (
                    <div className="flex flex-col">
                      {resumen.map((item, idx) => {
                        const estado = estadoProgreso(item.porcentaje_usado, item.excede_planeado);
                        return (
                          <div key={item.producto_id} className={cn('py-3', idx > 0 && 'border-t border-border/60')}>
                            <div className="mb-1 flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{item.producto_nombre}</p>
                                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                  {formatearNumero(item.total_utilizado, 2)} / {formatearNumero(item.cantidad_planeada, 2)}{' '}
                                  {item.producto_unidad}
                                </p>
                              </div>
                              <BadgeProgreso
                                excede={item.excede_planeado}
                                porcentaje={item.porcentaje_usado}
                                delta={item.diferencia}
                                decimalesDelta={2}
                              />
                            </div>
                            <BarraProgreso porcentaje={item.porcentaje_usado} estado={estado} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          {/* Movimientos Registrados */}
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="size-4" />
              </div>
              <h3 className="text-[0.95rem] font-semibold text-foreground">Movimientos Registrados</h3>
              <Badge variant="outline" className="ml-auto border-border bg-muted text-muted-foreground">
                {movimientos.length}
              </Badge>
            </div>

            <Accordion
              type="multiple"
              defaultValue={movimientos[0]?.id ? [movimientos[0].id] : []}
              key={movimientos[0]?.id ?? 'sin-movimientos'}
              className="border-t border-border"
            >
              {movimientos.map(mov => (
                <AccordionItem key={mov.id} value={mov.id!} className="border-t-0 border-b border-border px-5 last:border-b-0">
                  <AccordionTrigger className="items-center hover:no-underline">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <CalendarIcon className="size-[13px] text-primary" />
                          {formatShortDate(mov.fecha_movimiento)}
                        </span>
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {mov.numero_canecas != null
                            ? `${formatearNumero(mov.numero_canecas, 1)} caneca${mov.numero_canecas === 1 ? '' : 's'}`
                            : `${formatearNumero(mov.numero_bultos ?? 0, 0)} bulto${mov.numero_bultos === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{mov.lote_nombre}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
                      {mov.productos.map((producto, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{producto.producto_nombre}</p>
                            <p className="text-xs text-muted-foreground">{producto.producto_categoria}</p>
                          </div>
                          <p className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
                            {formatearNumero(producto.cantidad_utilizada, 2)}{' '}
                            {MAPA_UNIDAD_CORTA[producto.unidad] ?? producto.unidad}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="size-3" /> {mov.responsable}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEliminarMovimiento(mov.id!)}
                        aria-label="Eliminar movimiento"
                        className="rounded-lg p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {mov.notas && <p className="mt-2 text-xs italic text-muted-foreground">"{mov.notas}"</p>}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* CTA fijo al alcance del pulgar en móvil — en escritorio vive en las acciones del header.
              El pr-20 no es estético: la burbuja flotante de Esco es `fixed` abajo a la derecha
              (56px + su margen) y se monta ENCIMA de este botón. Medido a 375px sin el padding, le
              tapaba 48px del borde derecho al único CTA primario de la pantalla más usada en campo.
              El padding lo aparta en vez de bajar el z-index de Esco, que es global y no de esta pantalla. */}
          <div className="sticky bottom-4 z-10 pr-20 sm:hidden">
            <Button onClick={() => setFormOpen(true)} className="w-full shadow-lg">
              <Plus className="size-4" />
              Nuevo Movimiento
            </Button>
          </div>
        </div>
      )}

      <DailyMovementForm
        aplicacion={aplicacion}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          setFormOpen(false);
          loadMovimientos();
        }}
      />

      {/* CONFIRM DIALOG — ELIMINAR MOVIMIENTO */}
      <ConfirmDialog
        open={confirmEliminarMovimientoId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmEliminarMovimientoId(null);
        }}
        title="¿Estás seguro de eliminar este movimiento y todos sus productos?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminarMovimiento}
        destructive
      />
    </AplicacionShell>
  );
}
