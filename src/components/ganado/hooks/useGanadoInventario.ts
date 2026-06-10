import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { construirMovimientosTraslado, construirAjustesMasivos, construirMovimientosCargaInicial } from '@/utils/calculosGanado';
import type { TrasladoParams, AjusteMasivoFila, CargaInicialFila } from '@/utils/calculosGanado';
import type {
  GanUbicacion,
  GanFinca,
  GanPotrero,
  InventarioPotreroRow,
  MovimientoConContexto,
  GanMovimiento,
} from '@/types/ganado';

// PostgREST devuelve embeds one-to-one como objeto o array según detecte
// la constraint UNIQUE — normalizamos ambos casos.
function uno<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function useGanadoInventario() {
  const [loading, setLoading] = useState(false);
  const supabase = getSupabase() as any;

  const fetchEstructura = useCallback(async (): Promise<{
    ubicaciones: GanUbicacion[];
    fincas: GanFinca[];
    potreros: GanPotrero[];
  }> => {
    const [ubicacionesRes, fincasRes, potrerosRes] = await Promise.all([
      supabase.from('gan_ubicaciones').select('id, nombre').order('nombre'),
      supabase.from('gan_fincas').select('id, nombre, ubicacion_id, hectareas, activa').order('nombre'),
      supabase.from('gan_potreros').select('id, nombre, finca_id, activo').order('nombre'),
    ]);
    return {
      ubicaciones: (ubicacionesRes.data || []) as GanUbicacion[],
      fincas: (fincasRes.data || []) as GanFinca[],
      potreros: (potrerosRes.data || []) as GanPotrero[],
    };
  }, []);

  const fetchInventario = useCallback(async (): Promise<InventarioPotreroRow[]> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gan_potreros')
        .select(`
          id, nombre, activo,
          finca:gan_fincas(id, nombre, hectareas, activa, ubicacion:gan_ubicaciones(id, nombre)),
          inventario:gan_inventario(novillos, toros, peso_promedio_kg, updated_at)
        `)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;

      return ((data || []) as any[])
        .map((p: any) => {
          const finca = uno<any>(p.finca);
          const ubicacion = uno<any>(finca?.ubicacion);
          const inv = uno<any>(p.inventario);
          return {
            potrero_id: p.id,
            potrero: p.nombre,
            finca_id: finca?.id || '',
            finca: finca?.nombre || 'Sin finca',
            ubicacion_id: ubicacion?.id || null,
            ubicacion: ubicacion?.nombre || 'Sin ubicación',
            hectareas: Number(finca?.hectareas) || 0,
            novillos: inv?.novillos || 0,
            toros: inv?.toros || 0,
            peso_promedio_kg: inv?.peso_promedio_kg != null ? Number(inv.peso_promedio_kg) : null,
            updated_at: inv?.updated_at || null,
          };
        })
        .filter((r: InventarioPotreroRow) => r.finca_id);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMovimientos = useCallback(async (filtros?: {
    tipo?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    fincaId?: string;
  }): Promise<MovimientoConContexto[]> => {
    setLoading(true);
    try {
      let q = supabase
        .from('gan_movimientos')
        .select(`
          *,
          origen:gan_potreros!gan_movimientos_potrero_origen_id_fkey(nombre, finca_id, finca:gan_fincas(nombre)),
          destino:gan_potreros!gan_movimientos_potrero_destino_id_fkey(nombre, finca_id, finca:gan_fincas(nombre))
        `)
        .neq('estado', 'descartado')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (filtros?.tipo) q = q.eq('tipo', filtros.tipo);
      if (filtros?.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
      if (filtros?.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);

      const { data, error } = await q;
      if (error) throw error;

      let rows = ((data || []) as any[]).map((m: any) => {
        const origen = uno<any>(m.origen);
        const destino = uno<any>(m.destino);
        return {
          ...m,
          potrero_origen: origen?.nombre || null,
          finca_origen: uno<any>(origen?.finca)?.nombre || null,
          finca_origen_id: origen?.finca_id || null,
          potrero_destino: destino?.nombre || null,
          finca_destino: uno<any>(destino?.finca)?.nombre || null,
          finca_destino_id: destino?.finca_id || null,
        };
      });
      if (filtros?.fincaId) {
        rows = rows.filter((m: any) => m.finca_origen_id === filtros.fincaId || m.finca_destino_id === filtros.fincaId);
      }
      return rows as MovimientoConContexto[];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendientes = useCallback(async (): Promise<GanMovimiento[]> => {
    const { data, error } = await supabase
      .from('gan_movimientos')
      .select('*')
      .eq('estado', 'pendiente')
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data || []) as GanMovimiento[];
  }, []);

  const countPendientes = useCallback(async (): Promise<number> => {
    const { count } = await supabase
      .from('gan_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente');
    return count || 0;
  }, []);

  const registrarMuerte = useCallback(async (params: {
    fecha: string;
    potreroId: string;
    novillos: number;
    toros: number;
    notas: string | null;
  }) => {
    const { error } = await supabase.from('gan_movimientos').insert({
      tipo: 'muerte',
      estado: 'confirmado',
      fecha: params.fecha,
      potrero_origen_id: params.potreroId,
      novillos_delta: -params.novillos,
      toros_delta: -params.toros,
      notas: params.notas,
    });
    if (error) throw error;
  }, []);

  const registrarTraslado = useCallback(async (params: TrasladoParams) => {
    const movimientos = construirMovimientosTraslado(params).map((m) => ({ ...m, estado: 'confirmado' }));
    // Salida primero: si deja el potrero en negativo, el CHECK de
    // gan_inventario rechaza la operación antes de aplicar la entrada.
    const { error: errorSalida } = await supabase.from('gan_movimientos').insert(movimientos[0]);
    if (errorSalida) throw errorSalida;
    const { error: errorEntrada } = await supabase.from('gan_movimientos').insert(movimientos[1]);
    if (errorEntrada) throw errorEntrada;
  }, []);

  const registrarAjuste = useCallback(async (params: {
    fecha: string;
    potreroId: string;
    novillosDelta: number;
    torosDelta: number;
    notas: string;
  }) => {
    const { error } = await supabase.from('gan_movimientos').insert({
      tipo: 'ajuste',
      estado: 'confirmado',
      fecha: params.fecha,
      potrero_destino_id: params.potreroId,
      novillos_delta: params.novillosDelta,
      toros_delta: params.torosDelta,
      notas: params.notas,
    });
    if (error) throw error;
  }, []);

  // Carga inicial por finca: encuentra o crea el potrero "General" de cada
  // finca con cabezas y registra un ajuste confirmado por finca.
  const cargarInventarioInicial = useCallback(async (filas: CargaInicialFila[], nota: string) => {
    const conCabezas = filas.filter((f) => f.novillos > 0 || f.toros > 0);
    if (conCabezas.length === 0) return 0;
    const fincaIds = conCabezas.map((f) => f.finca_id);

    const { data: existentes, error: errorPotreros } = await supabase
      .from('gan_potreros')
      .select('id, finca_id, nombre, activo')
      .in('finca_id', fincaIds)
      .ilike('nombre', 'general');
    if (errorPotreros) throw errorPotreros;

    const potreroPorFinca: Record<string, string> = {};
    for (const p of (existentes || []) as { id: string; finca_id: string; activo: boolean }[]) {
      potreroPorFinca[p.finca_id] = p.id;
      // Un "General" desactivado ocultaría las cabezas del dashboard
      if (!p.activo) {
        const { error } = await supabase.from('gan_potreros').update({ activo: true }).eq('id', p.id);
        if (error) throw error;
      }
    }

    for (const fincaId of fincaIds) {
      if (potreroPorFinca[fincaId]) continue;
      const { data: creado, error } = await supabase
        .from('gan_potreros')
        .insert({ nombre: 'General', finca_id: fincaId })
        .select('id')
        .single();
      if (error) throw error;
      potreroPorFinca[fincaId] = (creado as { id: string }).id;
    }

    const fecha = new Date().toISOString().split('T')[0];
    const movimientos = construirMovimientosCargaInicial(conCabezas, potreroPorFinca, fecha, nota);
    const { error: errorMovs } = await supabase.from('gan_movimientos').insert(movimientos);
    if (errorMovs) throw errorMovs;
    return movimientos.length;
  }, []);

  const ajusteMasivo = useCallback(async (filas: AjusteMasivoFila[], nota: string) => {
    const fecha = new Date().toISOString().split('T')[0];
    const movimientos = construirAjustesMasivos(filas, fecha, nota).map((m) => ({ ...m, estado: 'confirmado' }));
    if (movimientos.length === 0) return 0;
    const { error } = await supabase.from('gan_movimientos').insert(movimientos);
    if (error) throw error;
    return movimientos.length;
  }, []);

  const confirmarPendiente = useCallback(async (params: {
    movimientoId: string;
    potreroId: string;
    novillos: number;
    toros: number;
    esVenta: boolean;
  }) => {
    const signo = params.esVenta ? -1 : 1;
    const { error } = await supabase
      .from('gan_movimientos')
      .update({
        estado: 'confirmado',
        // venta sale de un potrero (origen), compra entra (destino)
        potrero_origen_id: params.esVenta ? params.potreroId : null,
        potrero_destino_id: params.esVenta ? null : params.potreroId,
        novillos_delta: signo * params.novillos,
        toros_delta: signo * params.toros,
      })
      .eq('id', params.movimientoId)
      .eq('estado', 'pendiente');
    if (error) throw error;
  }, []);

  const descartarPendiente = useCallback(async (movimientoId: string) => {
    const { error } = await supabase
      .from('gan_movimientos')
      .update({ estado: 'descartado' })
      .eq('id', movimientoId)
      .eq('estado', 'pendiente');
    if (error) throw error;
  }, []);

  return {
    loading,
    fetchEstructura,
    fetchInventario,
    fetchMovimientos,
    fetchPendientes,
    countPendientes,
    registrarMuerte,
    registrarTraslado,
    registrarAjuste,
    ajusteMasivo,
    cargarInventarioInicial,
    confirmarPendiente,
    descartarPendiente,
  };
}
