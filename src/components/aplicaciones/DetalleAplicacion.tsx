import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Edit,
  CheckCircle,
  Calendar,
  Droplet,
  Package,
  MapPin,
  Target,
  TrendingUp,
  ShoppingCart,
  FileText,
  DollarSign,
  Users,
  BarChart2,
  Play,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/components/ui/utils';
import { EstadoAplicacionBadge } from './shared/EstadoAplicacionBadge';
import { generarPDFListaCompras } from '../../utils/generarPDFListaCompras';
import { generarPDFReporteCierre } from '../../utils/generarPDFReporteCierre';
import { fetchDatosReporteCierre } from '../../utils/fetchDatosReporteCierre';
import type { Aplicacion, ListaCompras } from '../../types/aplicaciones';
import { toast } from 'sonner';
import { formatearNumero, formatearMoneda } from '../../utils/format';

interface DetalleAplicacionProps {
  aplicacion: Aplicacion;
  onClose: () => void;
  onEditar: () => void;
  onRegistrarMovimientos: () => void;
  onCerrarAplicacion: () => void;
  onIniciarEjecucion?: () => void;
}

interface ResumenInsumo {
  nombre: string;
  unidad: string;
  planeado: number;
  aplicado: number;
}

/** Marco de sub-sección compartido dentro del diálogo: icono + título + cuerpo con padding.
 * Local a este archivo — no se promueve a `shared/` porque solo lo usan las 3 secciones de
 * abajo (Información General, Resumen de Canecas/Bultos, Resumen de Cierre). La sección de
 * productos NO lo usa: `Table` ya trae su propio borde/redondeo y anidarla aquí dibujaría un
 * borde dentro de otro borde. */
function SeccionDetalle({
  icon: Icon,
  titulo,
  children,
}: {
  icon: LucideIcon;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-3">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-medium text-foreground">{titulo}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function DetalleAplicacion({
  aplicacion,
  onClose,
  onEditar,
  onRegistrarMovimientos,
  onCerrarAplicacion,
  onIniciarEjecucion,
}: DetalleAplicacionProps) {
  const navigate = useNavigate();
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [resumenInsumos, setResumenInsumos] = useState<ResumenInsumo[]>([]);
  const [canecasPlaneadas, setCanecasPlaneadas] = useState(0);
  const [canecasAplicadas, setCanecasAplicadas] = useState(0);
  const [lotes, setLotes] = useState<string[]>([]);
  const [lotesData, setLotesData] = useState<Array<{id: string, nombre: string}>>([]);
  const [selectedLote, setSelectedLote] = useState<string | null>(null);
  const [blancoBiologico, setBlancoBiologico] = useState<string>('');
  const [fechaFinEstimada, setFechaFinEstimada] = useState<string>('');
  const [descargandoPDF, setDescargandoPDF] = useState(false);
  const [generandoReporte, setGenerandoReporte] = useState(false);
  const [datosCompletos, setDatosCompletos] = useState<any>(null);

  useEffect(() => {
    cargarDatos();
  }, [aplicacion.id, selectedLote]);

  const cargarDatos = async () => {
    setLoading(true);
    try {

      // 1. Cargar aplicación completa
      const { data: appData, error: appError } = await supabase
        .from('aplicaciones')
        .select(`
          *,
          aplicaciones_lotes (
            lote_id,
            lotes (
              id,
              nombre,
              total_arboles,
              arboles_grandes,
              arboles_medianos,
              arboles_pequenos,
              arboles_clonales
            )
          ),
          aplicaciones_mezclas (id)
        `)
        .eq('id', aplicacion.id)
        .single();

      if (appError) {
        console.error('Failed to load aplicacion details:', appError);
      }


      // Store full app data for closure summary
      setDatosCompletos(appData);

      // Extraer lotes con IDs
      const lotesConId = appData?.aplicaciones_lotes?.map(
        (al: any) => ({id: al.lotes?.id || '', nombre: al.lotes?.nombre || 'Sin nombre'})
      ) || [];
      setLotesData(lotesConId);
      const lotesNombres = lotesConId.map(l => l.nombre);
      setLotes(lotesNombres);

      // Extraer fecha fin estimada
      setFechaFinEstimada(appData?.fecha_fin_planeada || '');

      // Extraer blanco biológico
      if (appData?.blanco_biologico) {
        try {
          const bb = JSON.parse(appData.blanco_biologico);
          if (Array.isArray(bb) && bb.length > 0) {
            const { data: plagas } = await supabase
              .from('plagas_enfermedades_catalogo')
              .select('nombre')
              .in('id', bb);

            setBlancoBiologico(plagas?.map(p => p.nombre).join(', ') || 'No especificado');
          } else {
            setBlancoBiologico('No especificado');
          }
        } catch {
          setBlancoBiologico('No especificado');
        }
      } else {
        setBlancoBiologico('No especificado');
      }

      // 2. Cargar canecas/bultos planeados (filtrar por lote si está seleccionado)
      const esFertilizacion = aplicacion.tipo_aplicacion === 'Fertilización';
      const campoUnidad = esFertilizacion ? 'numero_bultos' : 'numero_canecas';

      let calculosQuery = supabase
        .from('aplicaciones_calculos')
        .select(`${campoUnidad}, lote_id`)
        .eq('aplicacion_id', aplicacion.id);

      if (selectedLote) {
        calculosQuery = calculosQuery.eq('lote_id', selectedLote);
      }

      const { data: calculos, error: errorCalculos } = await calculosQuery;

      if (errorCalculos) {
        console.error('Error loading planeadas:', errorCalculos);
      }

      let totalCanecasPlaneadas = calculos?.reduce(
        (sum: number, calc: any) => sum + (calc[campoUnidad] || 0),
        0
      ) || 0;

      // Fallback: when aplicaciones_calculos is empty, compute from mezcla dosis × tree sizes
      if (totalCanecasPlaneadas === 0 && (appData?.aplicaciones_mezclas?.length ?? 0) > 0) {
        const mezIds = (appData?.aplicaciones_mezclas || []).map((m: any) => m.id).filter(Boolean);
        if (mezIds.length > 0) {
          const { data: prodsDosis } = await supabase
            .from('aplicaciones_productos')
            .select('mezcla_id, dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales')
            .in('mezcla_id', mezIds);

          if (prodsDosis && prodsDosis.length > 0) {
            const dosisPerMezcla = new Map<string, { grandes: number; medianos: number; pequenos: number; clonales: number }>();
            for (const p of prodsDosis) {
              const entry = dosisPerMezcla.get(p.mezcla_id) || { grandes: 0, medianos: 0, pequenos: 0, clonales: 0 };
              entry.grandes += Number(p.dosis_grandes) || 0;
              entry.medianos += Number(p.dosis_medianos) || 0;
              entry.pequenos += Number(p.dosis_pequenos) || 0;
              entry.clonales += Number(p.dosis_clonales) || 0;
              dosisPerMezcla.set(p.mezcla_id, entry);
            }

            const appLotes = (appData?.aplicaciones_lotes || []).filter((al: any) =>
              !selectedLote || al.lote_id === selectedLote
            );
            let totalBultos = 0;
            for (const al of appLotes) {
              const lote = (al as any).lotes;
              if (!lote) continue;
              let loteKg = 0;
              for (const [, d] of dosisPerMezcla) {
                loteKg += (lote.arboles_grandes || 0) * d.grandes / 1000;
                loteKg += (lote.arboles_medianos || 0) * d.medianos / 1000;
                loteKg += (lote.arboles_pequenos || 0) * d.pequenos / 1000;
                loteKg += (lote.arboles_clonales || 0) * d.clonales / 1000;
              }
              totalBultos += loteKg / 50;
            }
            totalCanecasPlaneadas = Math.round(totalBultos * 10) / 10;
          }
        }
      }

      setCanecasPlaneadas(totalCanecasPlaneadas);

      // 3. Cargar canecas/bultos aplicados (filtrar por lote si está seleccionado)
      let movimientosQuery = supabase
        .from('movimientos_diarios')
        .select(`${campoUnidad}, lote_id`)
        .eq('aplicacion_id', aplicacion.id);

      if (selectedLote) {
        movimientosQuery = movimientosQuery.eq('lote_id', selectedLote);
      }

      const { data: movimientosDiarios, error: errorMovimientos } = await movimientosQuery;

      if (errorMovimientos) {
        console.error('Error loading aplicadas:', errorMovimientos);
      }

      const totalCanecasAplicadas = movimientosDiarios?.reduce(
        (sum: number, mov: any) => sum + (mov[campoUnidad] || 0),
        0
      ) || 0;
      setCanecasAplicadas(totalCanecasAplicadas);

      // 4. Cargar productos planeados
      const { data: mezclas, error: errorMezclas } = await supabase
        .from('aplicaciones_mezclas')
        .select('id')
        .eq('aplicacion_id', aplicacion.id);

      if (errorMezclas) {
        console.error('Failed to load mezclas for aplicacion:', errorMezclas);
      }

      let productosPlaneados = null;

      if (mezclas && mezclas.length > 0) {
        const mezclasIds = mezclas.map(m => m.id);

        const result = await supabase
          .from('aplicaciones_productos')
          .select('producto_id, producto_nombre, producto_unidad, cantidad_total_necesaria, mezcla_id, dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales')
          .in('mezcla_id', mezclasIds);

        productosPlaneados = result.data;

        // When aplicaciones_calculos is empty, recompute per-product planned quantities
        // from dosis × trees (cantidad_total_necesaria may be stale/wrong)
        if (totalCanecasPlaneadas > 0 && productosPlaneados && productosPlaneados.length > 0) {
          const appLotes = appData?.aplicaciones_lotes || [];
          const hasCalcData = calculos && calculos.length > 0;
          if (!hasCalcData) {
            // Override cantidad_total_necesaria with dosis × trees calculation
            const filteredLotes = appLotes.filter((al: any) => !selectedLote || al.lote_id === selectedLote);
            productosPlaneados = productosPlaneados.map((prod: any) => {
              let totalKg = 0;
              for (const al of filteredLotes) {
                const lote = (al as any).lotes;
                if (!lote) continue;
                totalKg += (lote.arboles_grandes || 0) * (Number(prod.dosis_grandes) || 0) / 1000;
                totalKg += (lote.arboles_medianos || 0) * (Number(prod.dosis_medianos) || 0) / 1000;
                totalKg += (lote.arboles_pequenos || 0) * (Number(prod.dosis_pequenos) || 0) / 1000;
                totalKg += (lote.arboles_clonales || 0) * (Number(prod.dosis_clonales) || 0) / 1000;
              }
              return { ...prod, cantidad_total_necesaria: Math.round(totalKg * 100) / 100 };
            });
          }
        }

        if (result.error) {
          console.error('Failed to load planned products for mezcla:', result.error);
        }
      }

      // 5. Cargar productos aplicados (de movimientos_diarios_productos, filtrar por lote si está seleccionado)
      let movimientosProductosQuery = supabase
        .from('movimientos_diarios')
        .select('id, lote_id')
        .eq('aplicacion_id', aplicacion.id);

      if (selectedLote) {
        movimientosProductosQuery = movimientosProductosQuery.eq('lote_id', selectedLote);
      }

      const { data: movimientos } = await movimientosProductosQuery;

      let productosAplicados: any[] = [];

      if (movimientos && movimientos.length > 0) {
        const movimientoIds = movimientos.map(m => m.id);

        const { data, error } = await supabase
          .from('movimientos_diarios_productos')
          .select('producto_id, producto_nombre, cantidad_utilizada, unidad')
          .in('movimiento_diario_id', movimientoIds);

        if (!error) {
          productosAplicados = data || [];
        }
      }

      // 6. Consolidar insumos
      const insumosMap = new Map<string, ResumenInsumo>();

      // Agregar planeados
      productosPlaneados?.forEach((prod) => {
        const key = prod.producto_id;
        if (!insumosMap.has(key)) {
          insumosMap.set(key, {
            nombre: prod.producto_nombre,
            unidad: prod.producto_unidad,
            planeado: 0,
            aplicado: 0,
          });
        }
        const insumo = insumosMap.get(key)!;
        insumo.planeado += prod.cantidad_total_necesaria || 0;
      });

      // Agregar aplicados (convirtiendo a unidad base si es necesario)
      productosAplicados?.forEach((prod) => {
        const key = prod.producto_id;

        // Convertir a unidad base (L o Kg)
        let cantidadEnUnidadBase = prod.cantidad_utilizada;
        if (prod.unidad === 'cc') {
          cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
        } else if (prod.unidad === 'g') {
          cantidadEnUnidadBase = prod.cantidad_utilizada / 1000;
        }

        if (!insumosMap.has(key)) {
          // Si no existe en planeados, crear entrada
          insumosMap.set(key, {
            nombre: prod.producto_nombre,
            unidad: prod.unidad === 'cc' || prod.unidad === 'L' ? 'Litros' : 'Kilos',
            planeado: 0,
            aplicado: 0,
          });
        }
        const insumo = insumosMap.get(key)!;
        insumo.aplicado += cantidadEnUnidadBase;
      });

      const insumos = Array.from(insumosMap.values());
      setResumenInsumos(insumos);

    } catch (err) {
      console.error('Failed to load aplicacion detail data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = (fecha: string | null) => {
    if (!fecha) return '-';
    // Extraer año, mes, día directamente del string para evitar problemas de zona horaria
    const [year, month, day] = fecha.split('T')[0].split('-');

    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const mesNombre = meses[parseInt(month) - 1];

    return `${parseInt(day)} de ${mesNombre} de ${year}`;
  };

  const getTipoIcon = () => {
    if (aplicacion.tipo_aplicacion === 'Fumigación') return <Droplet className="size-[18px]" aria-hidden="true" />;
    if (aplicacion.tipo_aplicacion === 'Fertilización') return <Package className="size-[18px]" aria-hidden="true" />;
    return <Target className="size-[18px]" aria-hidden="true" />;
  };

  const getTipoNombre = () => {
    if (aplicacion.tipo_aplicacion === 'Fumigación') return 'Fumigación';
    if (aplicacion.tipo_aplicacion === 'Fertilización') return 'Fertilización';
    return 'Drench';
  };

  /**
   * Descargar lista de compras en PDF
   */
  const descargarListaCompras = async () => {
    setDescargandoPDF(true);
    try {
      // Cargar lista de compras desde BD
      const { data: compras, error } = await supabase
        .from('aplicaciones_compras')
        .select('*')
        .eq('aplicacion_id', aplicacion.id);

      if (error) throw error;

      if (!compras || compras.length === 0) {
        toast.error('No hay lista de compras para exportar');
        return;
      }

      // Construir objeto lista
      const lista: ListaCompras = {
        items: compras.map((c) => ({
          producto_id: c.producto_id,
          producto_nombre: c.producto_nombre,
          producto_categoria: (c as any).producto_categoria ?? '',
          unidad: c.unidad,
          inventario_actual: c.inventario_actual,
          cantidad_necesaria: c.cantidad_necesaria,
          cantidad_faltante: c.cantidad_faltante,
          unidades_a_comprar: c.unidades_a_comprar,
          presentacion_comercial: c.presentacion_comercial ?? '',
          costo_estimado: c.costo_estimado ?? undefined,
          alerta: (c.alerta as 'sin_precio' | 'sin_stock' | 'normal') ?? undefined,
        })),
        costo_total_estimado: compras.reduce((sum, c) => sum + (c.costo_estimado || 0), 0),
        productos_sin_precio: compras.filter(c => !c.costo_estimado || c.costo_estimado === 0).length,
        productos_sin_stock: compras.filter(c => c.cantidad_faltante > 0).length,
      };

      // ESTO ES LO MISMO QUE exportarPDF() de PasoListaCompras
      const configuracion = {
        nombre: aplicacion.nombre_aplicacion ?? '',
        tipo_aplicacion: aplicacion.tipo_aplicacion,
        fecha_inicio: aplicacion.fecha_inicio ?? '',
      };

      const datosEmpresa = {
        nombre: 'Escocia Hass',
        nit: '900.XXX.XXX-X',
        direccion: 'Dirección del cultivo',
        telefono: '+57 XXX XXX XXXX',
        email: 'contacto@escocia-hass.com',
      };

      await generarPDFListaCompras(lista, configuracion as any, datosEmpresa);

    } catch (error: any) {
      toast.error('Error al generar el PDF');
    } finally {
      setDescargandoPDF(false);
    }
  };

  const descargarReporteCierre = async () => {
    setGenerandoReporte(true);
    try {
      const datos = await fetchDatosReporteCierre(aplicacion.id);
      await generarPDFReporteCierre(datos);
    } catch (error: any) {
      toast.error('Error al generar el reporte de cierre: ' + (error?.message || 'Error desconocido'));
    } finally {
      setGenerandoReporte(false);
    }
  };

  const diferenciaCanecas = canecasAplicadas - canecasPlaneadas;
  const porcentajeAplicado = canecasPlaneadas > 0 ? (canecasAplicadas / canecasPlaneadas) * 100 : 0;
  const progresoPct = canecasPlaneadas > 0 ? Math.min((canecasAplicadas / canecasPlaneadas) * 100, 100) : 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {getTipoIcon()}
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate">{aplicacion.nombre_aplicacion}</DialogTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">{getTipoNombre()}</p>
              </div>
            </div>
            <EstadoAplicacionBadge estado={aplicacion.estado} className="shrink-0" />
          </div>
          <DialogDescription className="sr-only">
            Detalle de la aplicación {aplicacion.nombre_aplicacion}: información general,
            resumen de canecas o bultos, productos y — si está cerrada — resumen de cierre.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner className="size-8 text-primary" />
            </div>
          ) : (
            <>
              {/* Información General */}
              <SeccionDetalle icon={Calendar} titulo="Información General">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Fecha Inicio (Planeada)</p>
                    <p className="text-sm text-foreground">{formatearFecha(aplicacion.fecha_inicio_planeada ?? null)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Fecha Fin (Planeada)</p>
                    <p className="text-sm text-foreground">{formatearFecha(fechaFinEstimada)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Fecha Inicio (Real)</p>
                    <p className="text-sm text-foreground">{formatearFecha(aplicacion.fecha_inicio_ejecucion ?? null)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Fecha Fin (Real)</p>
                    <p className="text-sm text-foreground">
                      {aplicacion.fecha_cierre ? formatearFecha(aplicacion.fecha_cierre) : (
                        <span className="text-warning-foreground">En progreso</span>
                      )}
                    </p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <p className="text-xs text-muted-foreground">Propósito</p>
                    <p className="text-sm text-foreground">{aplicacion.proposito || 'No especificado'}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Target className="size-3" aria-hidden="true" />
                      Blanco Biológico
                    </p>
                    <p className="text-sm text-foreground">{blancoBiologico}</p>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" aria-hidden="true" />
                      Lotes {selectedLote && <span className="font-medium text-primary">(filtrado)</span>}
                    </p>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={selectedLote ?? 'todos'}
                      onValueChange={(value) => setSelectedLote(!value || value === 'todos' ? null : value)}
                      className="h-auto flex-wrap justify-start"
                      aria-label="Filtrar por lote"
                    >
                      <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
                      {lotesData.map((lote) => (
                        <ToggleGroupItem key={lote.id} value={lote.id}>
                          {lote.nombre}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
              </SeccionDetalle>

              {/* Resumen de Canecas/Bultos */}
              <SeccionDetalle
                icon={aplicacion.tipo_aplicacion === 'Fertilización' ? Package : Droplet}
                titulo={aplicacion.tipo_aplicacion === 'Fertilización' ? 'Resumen de Bultos' : 'Resumen de Canecas'}
              >
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-muted p-4 text-center">
                    <p className="mb-1 text-xs text-muted-foreground">Planeado</p>
                    <p className="text-xl font-semibold tabular-nums text-foreground">
                      {formatearNumero(canecasPlaneadas, 1)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary/5 p-4 text-center">
                    <p className="mb-1 text-xs text-muted-foreground">Aplicado</p>
                    <p className="text-xl font-semibold tabular-nums text-primary">
                      {formatearNumero(canecasAplicadas, 1)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ({canecasPlaneadas > 0 ? formatearNumero(porcentajeAplicado, 0) : 0}%)
                    </p>
                  </div>
                  <div
                    className={cn(
                      'rounded-xl p-4 text-center',
                      diferenciaCanecas > 0
                        ? 'bg-destructive/10'
                        : diferenciaCanecas < 0
                          ? 'bg-warning/15'
                          : 'bg-muted',
                    )}
                  >
                    <p className="mb-1 text-xs text-muted-foreground">Diferencia</p>
                    <p
                      className={cn(
                        'text-xl font-semibold tabular-nums',
                        diferenciaCanecas > 0
                          ? 'text-destructive'
                          : diferenciaCanecas < 0
                            ? 'text-warning-foreground'
                            : 'text-foreground',
                      )}
                    >
                      {diferenciaCanecas > 0 ? '+' : ''}
                      {formatearNumero(diferenciaCanecas, 1)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ({canecasPlaneadas > 0 ? formatearNumero((diferenciaCanecas / canecasPlaneadas) * 100, 0) : 0}%)
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progreso</span>
                    <span className="text-foreground">
                      {canecasPlaneadas > 0 ? formatearNumero(porcentajeAplicado, 0) : 0}%
                    </span>
                  </div>
                  <Progress value={progresoPct} />
                </div>
              </SeccionDetalle>

              {/* Resumen de Productos — Table ya trae su propio borde/redondeo; no se anida en
                  SeccionDetalle para no dibujar un borde dentro de otro borde. */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Package className="size-4 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-medium text-foreground">Resumen de Productos</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Planeado</TableHead>
                      <TableHead className="text-right">Aplicado</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumenInsumos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="whitespace-normal py-8 text-center">
                          <Package className="mx-auto mb-2 size-8 text-primary/20" aria-hidden="true" />
                          <p className="text-sm text-muted-foreground">No hay productos registrados</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      resumenInsumos.map((insumo, index) => {
                        const diferencia = insumo.aplicado - insumo.planeado;
                        const porcentaje = insumo.planeado > 0 ? (insumo.aplicado / insumo.planeado) * 100 : 0;

                        return (
                          <TableRow key={index}>
                            <TableCell className="whitespace-normal">
                              <div className="text-sm text-foreground">{insumo.nombre}</div>
                              <div className="text-xs text-muted-foreground">{insumo.unidad}</div>
                            </TableCell>
                            <TableCell className="text-right">{formatearNumero(insumo.planeado, 2)}</TableCell>
                            <TableCell className="text-right">
                              <div className="text-primary">{formatearNumero(insumo.aplicado, 2)}</div>
                              <div className="text-xs text-muted-foreground">{formatearNumero(porcentaje, 0)}%</div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm',
                                  diferencia > 0.1
                                    ? 'bg-destructive/10 text-destructive'
                                    : diferencia < -0.1
                                      ? 'bg-warning/15 text-warning-foreground'
                                      : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {diferencia > 0 && <TrendingUp className="size-3" aria-hidden="true" />}
                                {diferencia > 0 ? '+' : ''}
                                {formatearNumero(diferencia, 2)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Resumen de Cierre (solo para apps cerradas) */}
              {aplicacion.estado === 'Cerrada' && datosCompletos && (
                <SeccionDetalle icon={DollarSign} titulo="Resumen de Cierre">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-muted p-3 text-center">
                      <p className="mb-1 text-xs text-muted-foreground">Insumos</p>
                      <p className="text-base font-semibold text-foreground">
                        {formatearMoneda(datosCompletos.costo_total_insumos || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted p-3 text-center">
                      <p className="mb-1 text-xs text-muted-foreground">Mano de Obra</p>
                      <p className="text-base font-semibold text-foreground">
                        {formatearMoneda(datosCompletos.costo_total_mano_obra || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-primary/5 p-3 text-center">
                      <p className="mb-1 text-xs text-primary">Costo Total</p>
                      <p className="text-base font-bold text-foreground">
                        {formatearMoneda(datosCompletos.costo_total || 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted p-3 text-center">
                      <p className="mb-1 text-xs text-muted-foreground">Costo / Árbol</p>
                      <p className="text-base font-semibold text-foreground">
                        {formatearMoneda(datosCompletos.costo_por_arbol || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Labor info */}
                  {(datosCompletos.jornales_utilizados > 0 || datosCompletos.valor_jornal > 0) && (
                    <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4">
                      {datosCompletos.jornales_utilizados > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="size-4 text-primary" aria-hidden="true" />
                          <span className="text-muted-foreground">Jornales:</span>
                          <span className="font-medium text-foreground">{datosCompletos.jornales_utilizados}</span>
                        </div>
                      )}
                      {datosCompletos.valor_jornal > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="size-4 text-primary" aria-hidden="true" />
                          <span className="text-muted-foreground">Valor jornal:</span>
                          <span className="font-medium text-foreground">{formatearMoneda(datosCompletos.valor_jornal)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Observations */}
                  {datosCompletos.observaciones_cierre && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="mb-1 text-xs text-muted-foreground">Observaciones de cierre</p>
                      <p className="rounded-lg bg-muted p-3 text-sm italic text-foreground">
                        {datosCompletos.observaciones_cierre}
                      </p>
                    </div>
                  )}
                </SeccionDetalle>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          {/* Botón de lista de compras a la izquierda */}
          <Button onClick={descargarListaCompras} variant="outline" disabled={descargandoPDF}>
            <ShoppingCart className="size-4" aria-hidden="true" />
            Ver Lista de Compras
          </Button>

          {/* Botones de acción a la derecha */}
          <div className="flex flex-wrap items-center gap-3">
            {aplicacion.estado === 'Cerrada' ? (
              <>
                <Button
                  onClick={() => {
                    onClose();
                    navigate(`/aplicaciones/${aplicacion.id}/reporte`);
                  }}
                  variant="outline"
                  className="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                >
                  <BarChart2 className="size-4" aria-hidden="true" />
                  Ver Reporte Completo
                </Button>

                <Button onClick={descargarReporteCierre} disabled={generandoReporte}>
                  {generandoReporte ? <Spinner className="size-4" /> : <FileText className="size-4" aria-hidden="true" />}
                  {generandoReporte ? 'Generando...' : 'Exportar PDF'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={onEditar}
                  disabled={(aplicacion.estado as string) !== 'Calculada'}
                  variant="outline"
                  className="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                >
                  <Edit className="size-4" aria-hidden="true" />
                  Editar
                </Button>

                {(aplicacion.estado as string) === 'Calculada' && onIniciarEjecucion ? (
                  <Button onClick={onIniciarEjecucion}>
                    <Play className="size-4" aria-hidden="true" />
                    Iniciar Ejecución
                  </Button>
                ) : (
                  <Button
                    onClick={onRegistrarMovimientos}
                    disabled={(aplicacion.estado as string) !== 'En ejecución'}
                    variant="outline"
                    className="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                  >
                    <ClipboardList className="size-4" aria-hidden="true" />
                    Registrar Movimientos
                  </Button>
                )}

                <Button
                  onClick={onCerrarAplicacion}
                  disabled={(aplicacion.estado as string) !== 'En ejecución'}
                >
                  <CheckCircle className="size-4" aria-hidden="true" />
                  Cerrar Aplicación
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
