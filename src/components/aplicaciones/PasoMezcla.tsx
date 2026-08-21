import { useState, useEffect, useMemo } from 'react';
import { Plus, X, AlertTriangle, Beaker, Trash2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Field, FieldLabel, FieldDescription } from '../ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group';
import { Checkbox } from '../ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { getSupabase } from '../../utils/supabase/client';
import { useSafeMode } from '../../contexts/SafeModeContext';
import {
  calcularFumigacion,
  calcularFertilizacion,
  calcularTotalesGlobalesProductos,
  generarListaCompras,
  validarLoteFumigacion,
} from '../../utils/calculosAplicaciones';
import { formatearNumero } from '../../utils/format';
import { cn } from '../ui/utils';
import type {
  ConfiguracionAplicacion,
  Mezcla,
  ProductoEnMezcla,
  CalculosPorLote,
  ProductoCatalogo,
  ItemListaCompras,
} from '../../types/aplicaciones';

export interface EstimadoCompra {
  items: ItemListaCompras[];
  costoTotal: number;
}

/**
 * Estado de asignación mezcla↔lotes por mezcla, keyed por `mezcla.id`. Solo tiene sentido
 * cuando hay 2+ mezclas — con una sola mezcla la asignación se hereda estructuralmente de
 * `configuracion.lotes_seleccionados` y no hay mapeo separado que perder (ver W01-calculadora-v2.md
 * §5). 'ok' es el default implícito cuando una mezcla no tiene entrada en este mapa.
 */
export type EstadoAsignacionMezcla = 'ok' | 'sin_asignar' | 'error';

interface MezclaPlanSectionProps {
  configuracion: ConfiguracionAplicacion;
  mezclas: Mezcla[];
  estadosAsignacion?: Record<string, EstadoAsignacionMezcla>;
  onUpdate: (mezclas: Mezcla[], calculos: CalculosPorLote[]) => void;
  onEstimadoChange?: (estimado: EstimadoCompra | null) => void;
  onReintentarAsignacion?: () => void;
}

/**
 * Sección "Mezcla y Productos" del Paso 1 (Plan). Antes era un paso propio con su propia
 * ceremonia de Nueva Mezcla / Confirmar Mezcla — ahora es edición directa e inline dentro
 * de la misma pantalla que los lotes (W01-calculadora-v2.md §2). El cambio de mayor
 * impacto: con una sola mezcla (el caso típico) sus lotes se heredan de
 * `configuracion.lotes_seleccionados` sin volver a preguntarlos — el picker de lotes
 * repetido solo reaparece cuando existen 2+ mezclas.
 */
export function MezclaPlanSection({
  configuracion,
  mezclas,
  estadosAsignacion,
  onUpdate,
  onEstimadoChange,
  onReintentarAsignacion,
}: MezclaPlanSectionProps) {
  const supabase = getSupabase();
  const { isSafeModeEnabled } = useSafeMode();

  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogo[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [productosInfo, setProductosInfo] = useState<Map<string, { presentacion_kg_l: number }>>(
    new Map(),
  );

  const [confirmEliminarMezclaId, setConfirmEliminarMezclaId] = useState<string | null>(null);
  const [confirmEliminarProducto, setConfirmEliminarProducto] = useState<{
    mezclaId: string;
    productoId: string;
    nombre: string;
  } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const tipo = configuracion.tipo;
  const usaDosisPorCaneca = tipo === 'fumigacion' || tipo === 'drench';

  /**
   * CARGAR CATÁLOGO DE PRODUCTOS
   * Incluye presentacion_kg_l y precio_por_presentacion (además de cantidad_actual) porque
   * el catálogo alimenta DOS cosas: el combobox de selección (stock) y el rail de Estimado
   * de Compra en vivo (necesita precio, no solo cantidad — riesgo #7 de W01-calculadora-v2.md).
   */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargandoProductos(true);
      try {
        const { data, error } = await supabase
          .from('productos')
          .select('*')
          .eq('estado', 'OK')
          .eq('activo', true)
          .eq('grupo', 'Agroinsumos')
          .order('nombre');

        if (error) throw error;

        let formateados = (data || []).map((p) => {
          const unidadCorta =
            (p.unidad_medida as string) === 'Kilos' ? 'Kg' : (p.unidad_medida as string) === 'Litros' ? 'L' : p.unidad_medida;
          return {
            id: p.id,
            nombre: p.nombre,
            categoria: p.categoria,
            grupo: p.grupo,
            unidad_medida: p.unidad_medida,
            estado_fisico: p.estado_fisico,
            presentacion_comercial:
              p.presentacion_kg_l && p.presentacion_kg_l > 0
                ? `${p.presentacion_kg_l} ${unidadCorta}`
                : `1 ${unidadCorta}`,
            ultimo_precio_unitario: p.precio_unitario || 0,
            precio_presentacion: p.precio_por_presentacion || 0,
            cantidad_actual: p.cantidad_actual || 0,
            display_nombre: `${p.nombre} (${p.categoria} · ${p.estado_fisico})`,
            permitido_gerencia: p.permitido_gerencia ?? undefined,
          };
        }) as unknown as ProductoCatalogo[];

        if (isSafeModeEnabled) {
          formateados = formateados.filter((p) => p.permitido_gerencia !== false);
        }

        if (!cancelado) setProductosCatalogo(formateados);
      } catch {
        if (!cancelado) setProductosCatalogo([]);
      } finally {
        if (!cancelado) setCargandoProductos(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tipo, isSafeModeEnabled]);

  /**
   * CARGAR presentacion_kg_l DE LOS PRODUCTOS EN USO (para fertilización)
   * Solo se refresca cuando cambia el CONJUNTO de ids de producto en las mezclas — no en
   * cada tecla de dosis — para no repetir el fetch en cada carácter escrito.
   */
  const productosIdsClave = useMemo(
    () =>
      Array.from(new Set(mezclas.flatMap((m) => m.productos.map((p) => p.producto_id)))).sort().join(','),
    [mezclas],
  );

  useEffect(() => {
    if (tipo !== 'fertilizacion' || !productosIdsClave) {
      setProductosInfo(new Map());
      return;
    }
    let cancelado = false;
    (async () => {
      const ids = productosIdsClave.split(',');
      try {
        const { data, error } = await supabase
          .from('productos')
          .select('id, presentacion_kg_l')
          .in('id', ids);
        if (error) throw error;
        const mapa = new Map<string, { presentacion_kg_l: number }>();
        (data || []).forEach((p) => {
          if (p.presentacion_kg_l) mapa.set(p.id, { presentacion_kg_l: p.presentacion_kg_l });
        });
        if (!cancelado) setProductosInfo(mapa);
      } catch {
        if (!cancelado) setProductosInfo(new Map());
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tipo, productosIdsClave]);

  /**
   * RECALCULAR (síncrono) — reemplaza al viejo `recalcularTodo` async. La única parte
   * async (presentación de productos para fertilización) ya vive en `productosInfo`
   * (arriba), cargada una vez por conjunto de productos, no en cada mutación. Esto es lo
   * que permite llamar a esta función en CADA edición de dosis sin esperar una red.
   */
  const recalcular = (mezclasParaCalcular: Mezcla[]) => {
    const nuevosCalculos: CalculosPorLote[] = [];
    const nuevosErrores: string[] = [];

    mezclasParaCalcular.forEach((mezcla) => {
      const lotesAsignados = obtenerLotesEfectivos(mezcla);
      lotesAsignados.forEach((loteId) => {
        const lote = configuracion.lotes_seleccionados.find((l) => l.lote_id === loteId);
        if (!lote) return;

        if (usaDosisPorCaneca) {
          const error = validarLoteFumigacion(lote);
          if (error) nuevosErrores.push(error);
        }

        const calculo = usaDosisPorCaneca
          ? calcularFumigacion(lote, mezcla)
          : calcularFertilizacion(lote, mezcla, productosInfo);

        nuevosCalculos.push(calculo);
      });
    });

    const mezclasActualizadas = mezclasParaCalcular.map((mezcla) => {
      const lotesAsignados = obtenerLotesEfectivos(mezcla);
      const calculosDeEstaMezcla = nuevosCalculos.filter((c) => lotesAsignados.includes(c.lote_id));

      return {
        ...mezcla,
        productos: mezcla.productos.map((productoEnMezcla) => {
          const cantidadTotal = calculosDeEstaMezcla.reduce((sum, calculo) => {
            const enCalculo = calculo.productos.find((p) => p.producto_id === productoEnMezcla.producto_id);
            return sum + (enCalculo?.cantidad_necesaria || 0);
          }, 0);
          return {
            ...productoEnMezcla,
            cantidad_total_necesaria: Math.ceil(cantidadTotal * 100) / 100,
          };
        }),
      };
    });

    setErrores(nuevosErrores);
    onUpdate(mezclasActualizadas, nuevosCalculos);

    // Estimado de Compra en vivo — mismo motor que la Lista de Compras (Paso 2), pero con el
    // catálogo ya cargado acá, así se ve el impacto sin llegar al Paso 2.
    if (onEstimadoChange) {
      if (productosCatalogo.length === 0 && mezclasActualizadas.some((m) => m.productos.length > 0)) {
        onEstimadoChange(null);
      } else {
        const necesarios = calcularTotalesGlobalesProductos(mezclasActualizadas);
        if (necesarios.length === 0) {
          onEstimadoChange(null);
        } else {
          const lista = generarListaCompras(necesarios, productosCatalogo);
          const faltantes = lista.items.filter((i) => i.cantidad_faltante > 0);
          onEstimadoChange({ items: faltantes, costoTotal: lista.costo_total_estimado });
        }
      }
    }
  };

  /** Los lotes "efectivos" de una mezcla: heredados de la selección global cuando hay una
   * sola mezcla (ver docstring del componente), o su `lotes_asignados` explícito si hay 2+. */
  const obtenerLotesEfectivos = (mezcla: Mezcla): string[] => {
    if (mezclas.length <= 1) {
      return configuracion.lotes_seleccionados.map((l) => l.lote_id);
    }
    return mezcla.lotes_asignados || [];
  };

  // Recalcular cuando cambian los lotes seleccionados arriba (Paso 1), cuando termina de
  // cargar el catálogo de productos, o cuando llega `productosInfo` (presentación para
  // fertilización) — mantiene el rail y los totales sincronizados sin que el usuario tenga
  // que tocar nada. Las mutaciones directas (crear mezcla, agregar producto, editar dosis,
  // (re)asignar lotes) llaman a `recalcular` ellas mismas — este efecto solo cubre los
  // disparadores que vienen de FUERA de esta sección.
  const configLotesClave = configuracion.lotes_seleccionados.map((l) => l.lote_id).join(',');
  useEffect(() => {
    if (mezclas.length === 0) {
      onEstimadoChange?.(null);
      return;
    }
    recalcular(mezclas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLotesClave, productosInfo, productosCatalogo, tipo]);

  /** CREAR NUEVA MEZCLA — sin ceremonia de confirmación: aparece ya en la lista, editable. */
  const crearMezcla = () => {
    const numero = mezclas.length + 1;
    const nueva: Mezcla = {
      id: crypto.randomUUID(),
      nombre: `Mezcla ${numero}`,
      numero_orden: numero,
      productos: [],
      lotes_asignados: [],
    };
    recalcular([...mezclas, nueva]);
  };

  const confirmarEliminarMezcla = () => {
    if (!confirmEliminarMezclaId) return;
    const restantes = mezclas
      .filter((m) => m.id !== confirmEliminarMezclaId)
      .map((m, i) => ({ ...m, nombre: `Mezcla ${i + 1}`, numero_orden: i + 1 }));
    setConfirmEliminarMezclaId(null);
    recalcular(restantes);
  };

  const toggleLoteAsignado = (mezclaId: string, loteId: string) => {
    const actualizadas = mezclas.map((m) => {
      if (m.id !== mezclaId) return m;
      const actuales = m.lotes_asignados || [];
      return {
        ...m,
        lotes_asignados: actuales.includes(loteId)
          ? actuales.filter((id) => id !== loteId)
          : [...actuales, loteId],
      };
    });
    recalcular(actualizadas);
  };

  const agregarProducto = (mezclaId: string, productoId: string) => {
    const producto = productosCatalogo.find((p) => p.id === productoId);
    if (!producto) return;

    const mezcla = mezclas.find((m) => m.id === mezclaId);
    if (mezcla?.productos.some((p) => p.producto_id === productoId)) {
      toast('Este producto ya está en la mezcla');
      return;
    }

    const nuevoProducto: ProductoEnMezcla = {
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      producto_categoria: producto.categoria,
      producto_unidad: producto.unidad_medida,
      cantidad_total_necesaria: 0,
      inventario_disponible: producto.cantidad_actual,
      ...(usaDosisPorCaneca
        ? {
            dosis_por_caneca: 0,
            unidad_dosis: (producto.estado_fisico === 'liquido' ? 'cc' : 'gramos') as 'cc' | 'gramos',
          }
        : {
            dosis_grandes: 0,
            dosis_medianos: 0,
            dosis_pequenos: 0,
            dosis_clonales: 0,
          }),
    };

    const actualizadas = mezclas.map((m) =>
      m.id === mezclaId ? { ...m, productos: [...m.productos, nuevoProducto] } : m,
    );
    recalcular(actualizadas);
  };

  const confirmarQuitarProducto = () => {
    if (!confirmEliminarProducto) return;
    const { mezclaId, productoId } = confirmEliminarProducto;
    const actualizadas = mezclas.map((m) =>
      m.id === mezclaId
        ? { ...m, productos: m.productos.filter((p) => p.producto_id !== productoId) }
        : m,
    );
    setConfirmEliminarProducto(null);
    recalcular(actualizadas);
  };

  const actualizarDosis = (mezclaId: string, productoId: string, campo: string, valor: number) => {
    const actualizadas = mezclas.map((m) =>
      m.id === mezclaId
        ? {
            ...m,
            productos: m.productos.map((p) => (p.producto_id === productoId ? { ...p, [campo]: valor } : p)),
          }
        : m,
    );
    recalcular(actualizadas);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-bold text-foreground">Mezcla y Productos</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mezclas.length <= 1
              ? 'La mezcla aplica automáticamente a los lotes seleccionados arriba.'
              : `${mezclas.length} mezclas — asigna qué lotes le corresponde a cada una.`}
          </p>
        </div>
        {mezclas.length === 0 && (
          <Button type="button" size="sm" onClick={crearMezcla}>
            <Plus className="w-4 h-4" />
            Nueva mezcla
          </Button>
        )}
      </div>

      {errores.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-0.5">
              {errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {mezclas.length === 0 ? (
        <div className="text-center py-10 bg-background rounded-xl border-2 border-dashed border-border">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground mx-auto mb-3">
            <Beaker className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Sin mezclas todavía</p>
          <p className="text-xs text-muted-foreground mb-4">Agrega la primera mezcla para definir productos y dosis</p>
          <Button type="button" size="sm" onClick={crearMezcla}>
            <Plus className="w-4 h-4" />
            Crear primera mezcla
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {mezclas.map((mezcla) => (
            <MezclaCard
              key={mezcla.id}
              mezcla={mezcla}
              totalMezclas={mezclas.length}
              configuracion={configuracion}
              usaDosisPorCaneca={usaDosisPorCaneca}
              estadoAsignacion={estadosAsignacion?.[mezcla.id] ?? 'ok'}
              productosCatalogo={productosCatalogo}
              cargandoProductos={cargandoProductos}
              onToggleLote={(loteId) => toggleLoteAsignado(mezcla.id, loteId)}
              onAgregarProducto={(productoId) => agregarProducto(mezcla.id, productoId)}
              onQuitarProducto={(productoId, nombre) =>
                setConfirmEliminarProducto({ mezclaId: mezcla.id, productoId, nombre })
              }
              onActualizarDosis={(productoId, campo, valor) => actualizarDosis(mezcla.id, productoId, campo, valor)}
              onEliminarMezcla={() => setConfirmEliminarMezclaId(mezcla.id)}
              onReintentarAsignacion={onReintentarAsignacion}
              onCrearNuevaMezcla={mezcla.numero_orden === Math.max(...mezclas.map((m) => m.numero_orden)) ? crearMezcla : undefined}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmEliminarMezclaId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmEliminarMezclaId(null);
        }}
        title="¿Eliminar esta mezcla?"
        description="Se perderán sus productos y dosis. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminarMezcla}
        destructive
      />

      <ConfirmDialog
        open={confirmEliminarProducto !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmEliminarProducto(null);
        }}
        title={confirmEliminarProducto ? `¿Quitar ${confirmEliminarProducto.nombre} de la mezcla?` : ''}
        confirmLabel="Quitar"
        onConfirm={confirmarQuitarProducto}
        destructive
      />
    </div>
  );
}

// ============================================================================
// TARJETA DE MEZCLA
// ============================================================================

interface MezclaCardProps {
  mezcla: Mezcla;
  totalMezclas: number;
  configuracion: ConfiguracionAplicacion;
  usaDosisPorCaneca: boolean;
  estadoAsignacion: EstadoAsignacionMezcla;
  productosCatalogo: ProductoCatalogo[];
  cargandoProductos: boolean;
  onToggleLote: (loteId: string) => void;
  onAgregarProducto: (productoId: string) => void;
  onQuitarProducto: (productoId: string, nombre: string) => void;
  onActualizarDosis: (productoId: string, campo: string, valor: number) => void;
  onEliminarMezcla: () => void;
  onReintentarAsignacion?: () => void;
  onCrearNuevaMezcla?: () => void;
}

function MezclaCard({
  mezcla,
  totalMezclas,
  configuracion,
  usaDosisPorCaneca,
  estadoAsignacion,
  productosCatalogo,
  cargandoProductos,
  onToggleLote,
  onAgregarProducto,
  onQuitarProducto,
  onActualizarDosis,
  onEliminarMezcla,
  onReintentarAsignacion,
  onCrearNuevaMezcla,
}: MezclaCardProps) {
  const [comboAbierto, setComboAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const esMezclaUnica = totalMezclas <= 1;
  const lotesAsignados = esMezclaUnica
    ? configuracion.lotes_seleccionados.map((l) => l.lote_id)
    : mezcla.lotes_asignados || [];

  const nombresLotesAsignados = lotesAsignados
    .map((id) => configuracion.lotes_seleccionados.find((l) => l.lote_id === id)?.nombre)
    .filter(Boolean)
    .join(', ');

  const productosDisponibles = productosCatalogo.filter(
    (p) => !mezcla.productos.some((mp) => mp.producto_id === p.id),
  );

  return (
    <div className="border border-border rounded-2xl p-5 bg-card">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-primary-foreground flex-shrink-0">
            <Beaker className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{mezcla.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {mezcla.productos.length} {mezcla.productos.length === 1 ? 'producto' : 'productos'}
              {esMezclaUnica ? ' · aplica a todos los lotes seleccionados' : ` · ${lotesAsignados.length} lotes asignados`}
            </p>
          </div>
        </div>
        {totalMezclas > 1 && (
          <button
            type="button"
            onClick={onEliminarMezcla}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            aria-label={`Eliminar ${mezcla.nombre}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ASIGNACIÓN DE LOTES — solo se pide de nuevo cuando hay 2+ mezclas */}
      {esMezclaUnica ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-3.5 py-3 mb-4">
          <p className="text-sm text-foreground">
            <span className="block text-[0.6875rem] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
              Lotes
            </span>
            {nombresLotesAsignados || 'Selecciona lotes arriba para que esta mezcla los herede.'}
          </p>
          {onCrearNuevaMezcla && (
            <Button type="button" variant="ghost" size="sm" onClick={onCrearNuevaMezcla}>
              <Plus className="w-3.5 h-3.5" />
              ¿Dividir en otra mezcla?
            </Button>
          )}
        </div>
      ) : (
        <div className="mb-4 space-y-3">
          {estadoAsignacion === 'error' ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                <p className="font-medium text-foreground">No se pudo cargar la asignación de lotes</p>
                <p>
                  Esta mezcla existe en la base de datos pero no se pudo confirmar a qué lotes aplica. No
                  asumas que aplica a todos ni a ninguno.
                </p>
                {onReintentarAsignacion && (
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onReintentarAsignacion}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reintentar
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          ) : lotesAsignados.length === 0 ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>
                <p className="font-medium text-foreground">Sin lotes asignados a esta mezcla</p>
                <p>Elige cuáles de los lotes seleccionados le corresponden a {mezcla.nombre}.</p>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {configuracion.lotes_seleccionados.map((lote) => {
              const seleccionado = lotesAsignados.includes(lote.lote_id);
              return (
                <label
                  key={lote.lote_id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors min-h-11',
                    seleccionado ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary',
                  )}
                >
                  <Checkbox
                    checked={seleccionado}
                    onCheckedChange={() => onToggleLote(lote.lote_id)}
                    className="mt-0.5"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-foreground">{lote.nombre}</span>
                    <span className="block text-xs text-muted-foreground">{lote.conteo_arboles.total} árboles</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* PRODUCTOS EN LA MEZCLA */}
      {mezcla.productos.length > 0 && (
        <div className="space-y-2.5 mb-4">
          {mezcla.productos.map((producto) => {
            const noPermitido = productosCatalogo.find((p) => p.id === producto.producto_id)?.permitido_gerencia === false;
            return (
              <div key={producto.producto_id} className="border border-border rounded-lg p-3.5 bg-background">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className={cn('text-sm font-bold', noPermitido ? 'text-destructive' : 'text-foreground')}>
                      {producto.producto_nombre}
                    </p>
                    <p className="text-xs text-muted-foreground">{producto.producto_categoria}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onQuitarProducto(producto.producto_id, producto.producto_nombre)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    aria-label={`Quitar ${producto.producto_nombre} de la mezcla`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {usaDosisPorCaneca ? (
                  <Field className="max-w-xs">
                    <FieldLabel htmlFor={`dosis-caneca-${producto.producto_id}`}>Dosis por caneca</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`dosis-caneca-${producto.producto_id}`}
                        type="number"
                        onWheel={(e) => e.currentTarget.blur()}
                        min={0}
                        step="0.01"
                        value={producto.dosis_por_caneca ?? ''}
                        onChange={(e) =>
                          onActualizarDosis(producto.producto_id, 'dosis_por_caneca', parseFloat(e.target.value) || 0)
                        }
                      />
                      <InputGroupAddon align="inline-end">
                        {producto.unidad_dosis === 'cc' ? 'cc' : 'g'}
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(
                      [
                        ['dosis_grandes', 'Grandes'],
                        ['dosis_medianos', 'Medianos'],
                        ['dosis_pequenos', 'Pequeños'],
                        ['dosis_clonales', 'Clonales'],
                      ] as const satisfies readonly (readonly [keyof Pick<ProductoEnMezcla, 'dosis_grandes' | 'dosis_medianos' | 'dosis_pequenos' | 'dosis_clonales'>, string])[]
                    ).map(([campo, etiqueta]) => (
                      <Field key={campo}>
                        <FieldLabel htmlFor={`${campo}-${producto.producto_id}`} className="text-xs">
                          {etiqueta}
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id={`${campo}-${producto.producto_id}`}
                            type="number"
                            onWheel={(e) => e.currentTarget.blur()}
                            min={0}
                            step="0.01"
                            value={producto[campo] ?? ''}
                            onChange={(e) => onActualizarDosis(producto.producto_id, campo, parseFloat(e.target.value) || 0)}
                          />
                          <InputGroupAddon align="inline-end">
                            {producto.producto_unidad === 'Litros' ? 'cc' : 'g'}
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    ))}
                  </div>
                )}

                <div className="flex justify-end mt-2.5 text-sm">
                  <span className="text-muted-foreground">
                    Total necesario:&nbsp;
                    <span className="font-bold text-foreground tabular-nums">
                      {formatearNumero(producto.cantidad_total_necesaria)} {producto.producto_unidad}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AGREGAR PRODUCTO — un solo combobox (Command en Popover), no buscador + <select> */}
      <div>
        <p className="text-xs font-bold text-foreground mb-1.5">Agregar producto</p>
        <Popover open={comboAbierto} onOpenChange={setComboAbierto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={cargandoProductos}
              className="w-full flex items-center gap-2 px-3 py-2.5 border border-input rounded-md text-sm text-muted-foreground hover:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              {cargandoProductos ? 'Cargando productos…' : 'Buscar producto por nombre o categoría…'}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-0 w-[--radix-popover-trigger-width]" style={{ width: 'var(--radix-popover-trigger-width)' }}>
            <Command>
              <CommandInput placeholder="Buscar producto..." value={busqueda} onValueChange={setBusqueda} />
              <CommandList>
                <CommandEmpty>Ningún producto coincide con "{busqueda}".</CommandEmpty>
                <CommandGroup>
                  {productosDisponibles.map((producto) => (
                    <CommandItem
                      key={producto.id}
                      value={producto.display_nombre}
                      onSelect={() => {
                        onAgregarProducto(producto.id);
                        setBusqueda('');
                        setComboAbierto(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{producto.display_nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {formatearNumero(producto.cantidad_actual)} {producto.unidad_medida}
                        </p>
                      </div>
                      {producto.permitido_gerencia === false && (
                        <Badge variant="destructive" className="flex-shrink-0">
                          Restringido
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <FieldDescription className="mt-1.5">
          Filtra por nombre, categoría o estado físico. Un producto ya agregado no vuelve a aparecer en la lista.
        </FieldDescription>
      </div>
    </div>
  );
}
