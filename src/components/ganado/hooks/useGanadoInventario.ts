import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/utils/supabase/fetchAll';
import {
  filasConCabezas,
  construirAjustesMasivos,
  construirMovimientosCargaInicial,
} from '@/utils/calculosGanado';
import type { RepartoFila, TrasladoMultiParams, AjusteMasivoFila, CargaInicialFila } from '@/utils/calculosGanado';
import type {
  GanUbicacion,
  GanFinca,
  GanLote,
  GanPotrero,
  InventarioPotreroRow,
  MovimientoConContexto,
  GanMovimiento,
  EtapaProductiva,
} from '@/types/ganado';
import { obtenerFechaHoy } from '@/utils/fechas';

// PostgREST devuelve embeds one-to-one como objeto o array según detecte
// la constraint UNIQUE — normalizamos ambos casos.
function uno<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Un pendiente puede traer el $ de la transacción embebido (B-2, último criterio). */
export type GanMovimientoPendiente = GanMovimiento & {
  valor_total?: number | null;
  kilos_pagados?: number | null;
  cabezas_transaccion?: number | null;
};

interface FincaCruda {
  id: string;
  nombre: string;
  hectareas: number | string | null;
  activa: boolean;
  ubicacion: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
}

/** Fila cruda de `gan_potreros` con sus embeds — común a fetchInventario y su residual. */
interface PotreroCrudo {
  id: string;
  nombre: string;
  activo: boolean;
  lote_id: string | null;
  etapa: EtapaProductiva | null;
  finca: FincaCruda | FincaCruda[] | null;
  lote: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
  inventario: { novillos: number; toros: number; updated_at: string } | { novillos: number; toros: number; updated_at: string }[] | null;
}

/** Construye una `InventarioPotreroRow` a partir de la fila cruda + su último peso (o null si no se consultó). */
function construirFilaInventario(
  p: PotreroCrudo,
  finca: FincaCruda,
  ultimoPesoPorPotrero: Map<string, { peso: number; fecha: string }>
): InventarioPotreroRow {
  const ubicacion = uno(finca.ubicacion);
  const lote = uno(p.lote);
  const inv = uno(p.inventario);
  const ultimoPeso = ultimoPesoPorPotrero.get(p.id);
  return {
    potrero_id: p.id,
    potrero: p.nombre,
    finca_id: finca.id,
    finca: finca.nombre,
    ubicacion_id: ubicacion?.id || null,
    ubicacion: ubicacion?.nombre || 'Sin ubicación',
    hectareas: Number(finca.hectareas) || 0,
    lote_id: p.lote_id,
    lote: lote?.nombre || null,
    etapa: p.etapa,
    novillos: inv?.novillos || 0,
    toros: inv?.toros || 0,
    ultimo_peso_kg: ultimoPeso?.peso ?? null,
    ultimo_peso_fecha: ultimoPeso?.fecha ?? null,
    updated_at: inv?.updated_at || null,
  };
}

export function useGanadoInventario() {
  const [loading, setLoading] = useState(false);
  const supabase = getSupabase() as any;
  const { profile } = useAuth();
  // Fail closed: durante la ventana en que AuthContext no tiene perfil aún
  // (~2s), NO se pide la plata — mismo criterio que /finanzas/reportes.
  const puedeVerPlata = profile?.rol === 'Gerencia' || profile?.rol === 'Administrador';

  const fetchEstructura = useCallback(async (): Promise<{
    ubicaciones: GanUbicacion[];
    fincas: GanFinca[];
    potreros: GanPotrero[];
    lotes: GanLote[];
  }> => {
    const [ubicacionesRes, fincasRes, potrerosRes, lotesRes] = await Promise.all([
      supabase.from('gan_ubicaciones').select('id, nombre').order('nombre'),
      supabase.from('gan_fincas').select('id, nombre, ubicacion_id, hectareas, activa').order('nombre'),
      supabase.from('gan_potreros').select('id, nombre, finca_id, activo, lote_id, etapa').order('nombre'),
      supabase.from('gan_lotes').select('id, finca_id, nombre, activo').order('nombre'),
    ]);
    return {
      ubicaciones: (ubicacionesRes.data || []) as GanUbicacion[],
      fincas: (fincasRes.data || []) as GanFinca[],
      potreros: (potrerosRes.data || []) as GanPotrero[],
      lotes: (lotesRes.data || []) as GanLote[],
    };
  }, []);

  // Último peso por potrero, leído de gan_pesos_historico (§3.4 del plan):
  // gan_inventario.peso_promedio_kg es el peso del ÚLTIMO MOVIMIENTO que
  // trajo peso, no un promedio — no se lee para esto. `fetchAll` porque la
  // tabla es write-only desde 044 y puede crecer sin techo conocido.
  const fetchUltimoPesoPorPotrero = useCallback(async (): Promise<Map<string, { peso: number; fecha: string }>> => {
    const { filas } = await fetchAll<{ potrero_id: string; fecha: string; peso_promedio_kg: number | string }>((desde, hasta) =>
      supabase
        .from('gan_pesos_historico')
        .select('potrero_id, fecha, peso_promedio_kg')
        .order('fecha', { ascending: false })
        .range(desde, hasta)
    );
    const mapa = new Map<string, { peso: number; fecha: string }>();
    filas.forEach((r) => {
      // Ordenado desc: la primera fila vista por potrero es la más reciente.
      if (!mapa.has(r.potrero_id)) {
        mapa.set(r.potrero_id, { peso: Number(r.peso_promedio_kg), fecha: r.fecha });
      }
    });
    return mapa;
  }, []);

  // Inventario vivo: potreros activos de FINCA ACTIVA (B-δ corregido — ver
  // CLAUDE.md §7.1 del plan: el filtro solo es seguro después de la 099,
  // que garantiza 0 cabezas fuera de finca activa).
  const fetchInventario = useCallback(async (): Promise<InventarioPotreroRow[]> => {
    setLoading(true);
    try {
      const [potrerosRes, ultimoPesoPorPotrero] = await Promise.all([
        supabase
          .from('gan_potreros')
          .select(`
            id, nombre, activo, lote_id, etapa,
            finca:gan_fincas!inner(id, nombre, hectareas, activa, ubicacion:gan_ubicaciones(id, nombre)),
            lote:gan_lotes(id, nombre),
            inventario:gan_inventario(novillos, toros, updated_at)
          `)
          .eq('activo', true)
          .order('nombre'),
        fetchUltimoPesoPorPotrero(),
      ]);
      if (potrerosRes.error) throw potrerosRes.error;

      return ((potrerosRes.data || []) as PotreroCrudo[])
        .map((p) => ({ p, finca: uno(p.finca) }))
        .filter((x): x is { p: PotreroCrudo; finca: FincaCruda } => !!x.finca?.activa)
        .map(({ p, finca }) => construirFilaInventario(p, finca, ultimoPesoPorPotrero));
    } finally {
      setLoading(false);
    }
  }, [fetchUltimoPesoPorPotrero]);

  // Residual de B-δ: potreros activos que quedaron en una finca INACTIVA.
  // Alimenta el aviso de §7.1 — nunca desaparecen en silencio del total.
  // No se calcula el último peso acá: nada lo lee (AvisoDatosGanado y
  // cabezasFueraDeFincaActiva solo usan finca/novillos/toros).
  const fetchInventarioFincasInactivas = useCallback(async (): Promise<InventarioPotreroRow[]> => {
    const { data, error } = await supabase
      .from('gan_potreros')
      .select(`
        id, nombre, activo, lote_id, etapa,
        finca:gan_fincas!inner(id, nombre, hectareas, activa, ubicacion:gan_ubicaciones(id, nombre)),
        lote:gan_lotes(id, nombre),
        inventario:gan_inventario(novillos, toros, updated_at)
      `)
      .eq('activo', true)
      .order('nombre');
    if (error) throw error;

    const sinPesos = new Map<string, { peso: number; fecha: string }>();
    return ((data || []) as PotreroCrudo[])
      .map((p) => ({ p, finca: uno(p.finca) }))
      .filter((x): x is { p: PotreroCrudo; finca: FincaCruda } => !!x.finca && x.finca.activa === false)
      .map(({ p, finca }) => construirFilaInventario(p, finca, sinPesos));
  }, []);

  const fetchMovimientos = useCallback(async (filtros?: {
    tipo?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    fincaId?: string;
  }): Promise<MovimientoConContexto[]> => {
    setLoading(true);
    try {
      // El embed de fin_transacciones_ganado solo se pide si el rol puede
      // ver plata (R-4) — pedirlo y recibir null enseñaría la forma del
      // dato a quien no puede verlo.
      const embedTransaccion = puedeVerPlata
        ? ', transaccion:fin_transacciones_ganado(valor_total, kilos_pagados, cantidad_cabezas)'
        : '';

      const construirQuery = (desde: number, hasta: number) => {
        let q = supabase
          .from('gan_movimientos')
          .select(`
            *,
            origen:gan_potreros!gan_movimientos_potrero_origen_id_fkey(nombre, finca_id, finca:gan_fincas(nombre), lote:gan_lotes(nombre), etapa),
            destino:gan_potreros!gan_movimientos_potrero_destino_id_fkey(nombre, finca_id, finca:gan_fincas(nombre), lote:gan_lotes(nombre), etapa)${embedTransaccion}
          `)
          .neq('estado', 'descartado')
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false })
          .range(desde, hasta);
        if (filtros?.tipo) q = q.eq('tipo', filtros.tipo);
        if (filtros?.fechaDesde) q = q.gte('fecha', filtros.fechaDesde);
        if (filtros?.fechaHasta) q = q.lte('fecha', filtros.fechaHasta);
        return q;
      };

      // Historia confirmada COMPLETA (B-ζ): un .limit fijo imposibilita el
      // saldo por potrero (R-6) y esconde filas en silencio.
      const { filas } = await fetchAll<any>(construirQuery);

      let rows = filas.map((m: any) => {
        const origen = uno<any>(m.origen);
        const destino = uno<any>(m.destino);
        const transaccion = uno<any>(m.transaccion);
        return {
          ...m,
          potrero_origen: origen?.nombre || null,
          finca_origen: uno<any>(origen?.finca)?.nombre || null,
          finca_origen_id: origen?.finca_id || null,
          lote_origen: uno<any>(origen?.lote)?.nombre || null,
          etapa_origen: origen?.etapa || null,
          potrero_destino: destino?.nombre || null,
          finca_destino: uno<any>(destino?.finca)?.nombre || null,
          finca_destino_id: destino?.finca_id || null,
          lote_destino: uno<any>(destino?.lote)?.nombre || null,
          etapa_destino: destino?.etapa || null,
          valor_total: transaccion?.valor_total != null ? Number(transaccion.valor_total) : null,
          kilos_pagados: transaccion?.kilos_pagados != null ? Number(transaccion.kilos_pagados) : null,
          cabezas_transaccion: transaccion?.cantidad_cabezas != null ? Number(transaccion.cantidad_cabezas) : null,
        };
      });
      if (filtros?.fincaId) {
        rows = rows.filter((m: any) => m.finca_origen_id === filtros.fincaId || m.finca_destino_id === filtros.fincaId);
      }
      return rows as MovimientoConContexto[];
    } finally {
      setLoading(false);
    }
  }, [puedeVerPlata]);

  const fetchPendientes = useCallback(async (): Promise<GanMovimientoPendiente[]> => {
    const embedTransaccion = puedeVerPlata
      ? ', transaccion:fin_transacciones_ganado(valor_total, kilos_pagados, cantidad_cabezas)'
      : '';
    const { data, error } = await supabase
      .from('gan_movimientos')
      .select(`*${embedTransaccion}`)
      .eq('estado', 'pendiente')
      .order('fecha', { ascending: false });
    if (error) throw error;
    return ((data || []) as any[]).map((m: any) => {
      const transaccion = uno<any>(m.transaccion);
      return {
        ...m,
        valor_total: transaccion?.valor_total != null ? Number(transaccion.valor_total) : null,
        kilos_pagados: transaccion?.kilos_pagados != null ? Number(transaccion.kilos_pagados) : null,
        cabezas_transaccion: transaccion?.cantidad_cabezas != null ? Number(transaccion.cantidad_cabezas) : null,
      };
    }) as GanMovimientoPendiente[];
  }, [puedeVerPlata]);

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

  // Traslado repartido: N potreros origen → M potreros destino. Va por RPC
  // (migración 097, con grupo_id estampado internamente desde la 098) para
  // que las salidas y las entradas se apliquen en una sola transacción; con
  // inserts sueltos un potrero sin cabezas suficientes dejaba el traslado
  // aplicado a medias. El cliente NO construye las filas ni el grupo_id —
  // los dos viven solo en el RPC.
  const registrarTraslado = useCallback(async (params: TrasladoMultiParams) => {
    const { error } = await supabase.rpc('fn_ganado_registrar_traslado_multi', {
      p_fecha: params.fecha,
      p_origenes: filasConCabezas(params.origenes),
      p_destinos: filasConCabezas(params.destinos),
      p_peso_promedio_kg: params.pesoPromedioKg ?? null,
      p_notas: params.notas || null,
    });
    if (error) throw error;
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
  // finca con cabezas y registra un ajuste confirmado por finca, todos con
  // el mismo grupo_id — "conteo físico" agrupado en el log (§3.3/§6.3).
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

    const fecha = obtenerFechaHoy();
    const grupoId = crypto.randomUUID();
    const movimientos = construirMovimientosCargaInicial(conCabezas, potreroPorFinca, fecha, nota, grupoId);
    const { error: errorMovs } = await supabase.from('gan_movimientos').insert(movimientos);
    if (errorMovs) throw errorMovs;
    return movimientos.length;
  }, []);

  // Ajuste masivo: una fila por potrero modificado, todas con el mismo
  // grupo_id — se renderiza como un solo "conteo físico" desplegable en vez
  // de N filas indistinguibles de N eventos (decisión 6 del CPO). El
  // grupo_id lo pone el cliente porque es el cliente quien construye estas
  // filas (a diferencia del traslado, que las construye el RPC).
  const ajusteMasivo = useCallback(async (filas: AjusteMasivoFila[], nota: string) => {
    const fecha = obtenerFechaHoy();
    const grupoId = crypto.randomUUID();
    const movimientos = construirAjustesMasivos(filas, fecha, nota, grupoId).map((m) => ({ ...m, estado: 'confirmado' }));
    if (movimientos.length === 0) return 0;
    const { error } = await supabase.from('gan_movimientos').insert(movimientos);
    if (error) throw error;
    return movimientos.length;
  }, []);

  // Confirma el pendiente repartiendo las cabezas entre uno o varios
  // potreros. La primera fila se aplica sobre el movimiento pendiente y el
  // resto entran como movimientos hermanos de la misma transacción, todo en
  // una sola transacción de base (RPC de la migración 097). Agrupa por
  // transaccion_ganado_id, no por grupo_id — no hay nada que estampar acá.
  const confirmarPendiente = useCallback(async (params: {
    movimientoId: string;
    filas: RepartoFila[];
  }) => {
    const { error } = await supabase.rpc('fn_ganado_confirmar_pendiente_multi', {
      p_movimiento_id: params.movimientoId,
      p_filas: filasConCabezas(params.filas),
    });
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

  // El CRUD de gan_lotes y la edición de potreros viven en GanadoConfig.tsx
  // con llamadas directas a Supabase, que es el patrón de Configuración desde
  // siempre. No se duplican acá para no dejar dos caminos de escritura.

  return {
    loading,
    fetchEstructura,
    fetchInventario,
    fetchInventarioFincasInactivas,
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
