import { getSupabase } from './supabase/client';

type UnidadBase = 'Litros' | 'Kilos' | 'Unidad';

export interface ProductoRealAplicado {
  loteId: string;
  productoId: string;
  productoNombre: string;
  unidadBase: UnidadBase;
  cantidadBase: number;
  precioUnitario: number;
  costoTotal: number;
}

export interface DatosRealesAplicacion {
  movimientosPorLote: Map<string, { canecas: number; bultos: number }>;
  productosPorLote: Map<string, ProductoRealAplicado[]>;
  insumosPorLote: Map<string, { cantidadTotal: number; costoTotal: number }>;
}

export interface JornalesPorLote {
  jornales: number;
  costo: number;
}

export function convertirUnidadBase(
  cantidad: number,
  unidad: string | null | undefined
): { cantidadBase: number; unidadBase: UnidadBase } {
  const unidadNormalizada = (unidad || '').trim().toLowerCase();

  if (unidadNormalizada === 'cc') {
    return { cantidadBase: cantidad / 1000, unidadBase: 'Litros' };
  }
  if (unidadNormalizada === 'l' || unidadNormalizada === 'litro' || unidadNormalizada === 'litros') {
    return { cantidadBase: cantidad, unidadBase: 'Litros' };
  }
  if (unidadNormalizada === 'g') {
    return { cantidadBase: cantidad / 1000, unidadBase: 'Kilos' };
  }
  if (unidadNormalizada === 'kg' || unidadNormalizada === 'kilo' || unidadNormalizada === 'kilos') {
    return { cantidadBase: cantidad, unidadBase: 'Kilos' };
  }

  return { cantidadBase: cantidad, unidadBase: 'Unidad' };
}

export async function fetchDatosRealesAplicacion(aplicacionId: string): Promise<DatosRealesAplicacion> {
  const supabase = getSupabase();

  const movimientosPorLote = new Map<string, { canecas: number; bultos: number }>();
  const productosPorLote = new Map<string, ProductoRealAplicado[]>();
  const insumosPorLote = new Map<string, { cantidadTotal: number; costoTotal: number }>();

  const { data: movimientos } = await supabase
    .from('movimientos_diarios')
    .select('id, lote_id, numero_canecas, numero_bultos')
    .eq('aplicacion_id', aplicacionId);

  const movLoteMap = new Map<string, string>();
  const movIds: string[] = [];

  (movimientos || []).forEach((m: any) => {
    const loteId = m.lote_id;
    if (!loteId || !m.id) return;

    if (!movimientosPorLote.has(loteId)) {
      movimientosPorLote.set(loteId, { canecas: 0, bultos: 0 });
    }

    const cur = movimientosPorLote.get(loteId)!;
    cur.canecas += Number(m.numero_canecas) || 0;
    cur.bultos += Number(m.numero_bultos) || 0;

    movLoteMap.set(m.id, loteId);
    movIds.push(m.id);
  });

  if (movIds.length === 0) {
    return { movimientosPorLote, productosPorLote, insumosPorLote };
  }

  const { data: movProductos } = await supabase
    .from('movimientos_diarios_productos')
    .select('movimiento_diario_id, producto_id, producto_nombre, cantidad_utilizada, unidad')
    .in('movimiento_diario_id', movIds);

  const productoIds = [...new Set((movProductos || []).map((p: any) => p.producto_id).filter(Boolean))];
  const precioMap = new Map<string, number>();

  if (productoIds.length > 0) {
    const { data: precios } = await supabase
      .from('productos')
      .select('id, precio_unitario')
      .in('id', productoIds);

    (precios || []).forEach((p: any) => {
      precioMap.set(p.id, Number(p.precio_unitario) || 0);
    });
  }

  const agregadoProductoLote = new Map<string, ProductoRealAplicado>();

  (movProductos || []).forEach((p: any) => {
    const movId = p.movimiento_diario_id;
    const loteId = movLoteMap.get(movId);
    if (!loteId || !p.producto_id) return;

    const cantidad = Number(p.cantidad_utilizada) || 0;
    const { cantidadBase, unidadBase } = convertirUnidadBase(cantidad, p.unidad);
    const precioUnitario = precioMap.get(p.producto_id) || 0;
    const key = `${loteId}::${p.producto_id}`;

    if (!agregadoProductoLote.has(key)) {
      agregadoProductoLote.set(key, {
        loteId,
        productoId: p.producto_id,
        productoNombre: p.producto_nombre || 'Producto',
        unidadBase,
        cantidadBase: 0,
        precioUnitario,
        costoTotal: 0,
      });
    }

    const cur = agregadoProductoLote.get(key)!;
    cur.cantidadBase += cantidadBase;
    cur.costoTotal = cur.cantidadBase * cur.precioUnitario;
  });

  agregadoProductoLote.forEach((item) => {
    if (!productosPorLote.has(item.loteId)) {
      productosPorLote.set(item.loteId, []);
    }
    productosPorLote.get(item.loteId)!.push(item);

    if (!insumosPorLote.has(item.loteId)) {
      insumosPorLote.set(item.loteId, { cantidadTotal: 0, costoTotal: 0 });
    }
    const resumen = insumosPorLote.get(item.loteId)!;
    resumen.cantidadTotal += item.cantidadBase;
    resumen.costoTotal += item.costoTotal;
  });

  return { movimientosPorLote, productosPorLote, insumosPorLote };
}

export async function fetchJornalesRealesPorLote(tareaId?: string | null): Promise<Map<string, JornalesPorLote>> {
  const resultado = new Map<string, JornalesPorLote>();
  if (!tareaId) return resultado;

  const supabase = getSupabase();
  const { data: registros } = await supabase
    .from('registros_trabajo')
    .select('lote_id, fraccion_jornal, costo_jornal')
    .eq('tarea_id', tareaId);

  (registros || []).forEach((r: any) => {
    if (!r.lote_id) return;
    if (!resultado.has(r.lote_id)) {
      resultado.set(r.lote_id, { jornales: 0, costo: 0 });
    }
    const cur = resultado.get(r.lote_id)!;
    cur.jornales += Number(r.fraccion_jornal) || 0;
    cur.costo += Number(r.costo_jornal) || 0;
  });

  return resultado;
}

