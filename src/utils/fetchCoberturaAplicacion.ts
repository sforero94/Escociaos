// utils/fetchCoberturaAplicacion.ts
// Lee de Supabase lo que necesita `armarCoberturaAplicacion` (ESCO-171). Solo lectura.

import { getSupabase } from './supabase/client';
import { cantidadEnUnidadBase } from './stockAplicacion';
import {
  armarCoberturaAplicacion,
  type CoberturaAplicacion,
  type FilaAlternativoPlan,
  type FilaArbolesLote,
  type FilaCalculoPlan,
  type FilaLineaPlan,
  type RegistroConsumo,
} from './coberturaAplicacion';

const vacio = (): CoberturaAplicacion => ({
  lineas: [],
  idsLineasConAlternativos: new Set(),
  productosEnLineasConAlternativos: new Set(),
});

/**
 * Cobertura de las líneas con alternativos de una aplicación. Lanza si una lectura falla:
 * quien llama decide si el aviso (no bloqueante) se omite o se muestra como «no se pudo calcular»
 * — nunca se devuelve «todo cubierto» por un error de red.
 */
export async function fetchCoberturaAplicacion(
  aplicacionId: string,
  tipoAplicacion: string,
): Promise<CoberturaAplicacion> {
  const supabase = getSupabase();

  const { data: mezclas, error: errorMezclas } = await supabase
    .from('aplicaciones_mezclas')
    .select('id')
    .eq('aplicacion_id', aplicacionId);
  if (errorMezclas) throw errorMezclas;
  const mezclaIds = (mezclas ?? []).map((m) => m.id);
  if (mezclaIds.length === 0) return vacio();

  const { data: lineasData, error: errorLineas } = await supabase
    .from('aplicaciones_productos')
    .select(
      'id, mezcla_id, producto_id, producto_nombre, cantidad_total_necesaria, dosis_por_caneca, dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales',
    )
    .in('mezcla_id', mezclaIds);
  if (errorLineas) throw errorLineas;
  const lineas = (lineasData ?? []) as FilaLineaPlan[];
  if (lineas.length === 0) return vacio();

  const { data: alternativosData, error: errorAlternativos } = await supabase
    .from('aplicaciones_productos_alternativos')
    .select(
      'aplicacion_producto_id, producto_id, dosis_por_caneca, dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales, productos ( nombre )',
    )
    .in(
      'aplicacion_producto_id',
      lineas.map((l) => l.id),
    );
  if (errorAlternativos) throw errorAlternativos;

  const alternativos: FilaAlternativoPlan[] = (alternativosData ?? []).map((a) => ({
    aplicacion_producto_id: a.aplicacion_producto_id,
    producto_id: a.producto_id,
    producto_nombre: (a.productos as { nombre: string } | null)?.nombre ?? 'Producto sin nombre',
    dosis_por_caneca: a.dosis_por_caneca,
    dosis_grandes: a.dosis_grandes,
    dosis_medianos: a.dosis_medianos,
    dosis_pequenos: a.dosis_pequenos,
    dosis_clonales: a.dosis_clonales,
  }));
  // Ninguna línea con alternativos: nada que medir y nada más que leer.
  if (alternativos.length === 0) return vacio();

  const [calculosRes, lotesRes, movimientosRes] = await Promise.all([
    supabase
      .from('aplicaciones_calculos')
      .select('mezcla_id, lote_id, numero_canecas, numero_bultos')
      .eq('aplicacion_id', aplicacionId),
    supabase
      .from('aplicaciones_lotes')
      .select('lote_id, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales')
      .eq('aplicacion_id', aplicacionId),
    supabase.from('movimientos_diarios').select('id, lote_id').eq('aplicacion_id', aplicacionId),
  ]);
  if (calculosRes.error) throw calculosRes.error;
  if (lotesRes.error) throw lotesRes.error;
  if (movimientosRes.error) throw movimientosRes.error;

  const movimientos = movimientosRes.data ?? [];
  let consumos: RegistroConsumo[] = [];
  if (movimientos.length > 0) {
    const { data: productosMov, error: errorProductosMov } = await supabase
      .from('movimientos_diarios_productos')
      .select('movimiento_diario_id, producto_id, cantidad_utilizada, unidad')
      .in(
        'movimiento_diario_id',
        movimientos.map((m) => m.id),
      );
    if (errorProductosMov) throw errorProductosMov;
    const loteDeMovimiento = new Map(movimientos.map((m) => [m.id, m.lote_id]));
    consumos = (productosMov ?? []).flatMap((p) => {
      const lote = loteDeMovimiento.get(p.movimiento_diario_id);
      return lote
        ? [{ lote_id: lote, producto_id: p.producto_id, cantidad_base: cantidadEnUnidadBase(p.cantidad_utilizada, p.unidad) }]
        : [];
    });
  }

  const idsProductos = Array.from(new Set([...lineas.map((l) => l.producto_id), ...alternativos.map((a) => a.producto_id)]));
  const { data: saldosData, error: errorSaldos } = await supabase
    .from('productos')
    .select('id, cantidad_actual')
    .in('id', idsProductos);
  if (errorSaldos) throw errorSaldos;
  const saldos = new Map<string, number | null>((saldosData ?? []).map((p) => [p.id, p.cantidad_actual]));

  return armarCoberturaAplicacion({
    tipoAplicacion,
    lineas,
    alternativos,
    calculos: (calculosRes.data ?? []) as FilaCalculoPlan[],
    arbolesPorLote: (lotesRes.data ?? []) as FilaArbolesLote[],
    saldos,
    consumos,
  });
}
