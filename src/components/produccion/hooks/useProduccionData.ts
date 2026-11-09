import { getSupabase } from '../../../utils/supabase/client';
import type {
  FiltrosProduccion,
  KPIProduccion,
  TendenciaHistoricaData,
  RendimientoSubloteData,
  TopSubloteData,
  EdadRendimientoData,
  Produccion,
  ProduccionFormData,
  LoteProduccion,
  SubloteProduccion,
  CosechaIdentidad,
  CosechaTipo,
} from '../../../types/produccion';
import {
  formatCosechaCode,
  getLoteCode,
  getLoteColor,
} from '../../../types/produccion';
import {
  agregarCalidadPorCosecha,
  anosCampanaDeCosechas,
  calcularKgPorArbol,
  calcularTonPorHa,
  compararProduccionPorLote,
  consolidarRegistrosProduccion,
  derivarAnosMovimiento,
  derivarCosechasDisponibles,
  type RegistroEtapaLote,
  ordenarCosechas,
  resolverSeleccionCosechas,
  resumirCosecha,
  valorMetrica,
  type RegistroProduccionAgregable,
} from '@/utils/calculosProduccionAnalisis';

type RawProduccionRow = {
  sublote_id: string | null;
  lote_id: string;
  ano: number;
  cosecha_tipo: CosechaTipo;
  kg_totales: number;
  arboles_registrados: number | null;
  kg_por_arbol?: number | null;
  kg_exportacion?: number | null;
  kg_nacional?: number | null;
  lotes?: {
    nombre?: string | null;
    area_hectareas?: number | null;
    activo?: boolean | null;
    fecha_siembra?: string | null;
  } | null;
  sublotes?: {
    nombre?: string | null;
    numero_sublote?: number | null;
  } | null;
};

function toAgregable(rows: RawProduccionRow[]): RegistroProduccionAgregable[] {
  return (rows || []).map((r) => ({
    lote_id: r.lote_id,
    lote_nombre: r.lotes?.nombre ?? null,
    sublote_id: r.sublote_id,
    ano: r.ano,
    cosecha_tipo: r.cosecha_tipo,
    kg_totales: Number(r.kg_totales) || 0,
    arboles_registrados: r.arboles_registrados,
    area_hectareas:
      r.lotes?.area_hectareas != null ? Number(r.lotes.area_hectareas) : null,
    kg_exportacion: r.kg_exportacion ?? null,
    kg_nacional: r.kg_nacional ?? null,
  }));
}

/**
 * Hook personalizado para cargar datos de produccion/cosechas
 */
export function useProduccionData() {
  const supabase = getSupabase();

  const getCatalogoCosechas = async (): Promise<{
    cosechas: CosechaIdentidad[];
    anos_movimiento: number[];
  }> => {
    const { data, error } = await supabase
      .from('produccion')
      .select('ano, cosecha_tipo');

    if (error) throw error;

    const registros = (data || []).map((r) => ({
      ano: Number(r.ano),
      cosecha_tipo: r.cosecha_tipo as CosechaTipo,
    }));

    return {
      cosechas: derivarCosechasDisponibles(registros),
      // `produccion` no tiene fecha de movimiento. El año del filtro sale de
      // la fecha; sin esa columna el catálogo de años queda vacío.
      anos_movimiento: derivarAnosMovimiento([]),
    };
  };

  /**
   * Aplica filtros a la query. Filtra por identidades de cosecha resueltas
   * (año de campaña + tipo), no por año de movimiento directamente.
   */
  const aplicarFiltros = (
    query: any,
    filtros: FiltrosProduccion,
    cosechasEfectivas: CosechaIdentidad[],
  ) => {
    const anos = anosCampanaDeCosechas(cosechasEfectivas);
    if (anos.length > 0) {
      query = query.in('ano', anos);
    } else if (filtros.anos.length > 0) {
      query = query.in('ano', filtros.anos);
    }

    const tipos = Array.from(new Set(cosechasEfectivas.map((c) => c.tipo)));
    if (tipos.length === 1) {
      query = query.eq('cosecha_tipo', tipos[0]);
    } else if (filtros.cosecha_tipo !== 'Ambas' && cosechasEfectivas.length === 0) {
      query = query.eq('cosecha_tipo', filtros.cosecha_tipo);
    }

    if (filtros.lote_ids.length > 0) {
      query = query.in('lote_id', filtros.lote_ids);
    }

    return query;
  };

  const resolverCosechas = (
    disponibles: CosechaIdentidad[],
    filtros: FiltrosProduccion,
  ) => resolverSeleccionCosechas(disponibles, filtros);

  const filtrarPorCosechasEfectivas = <T extends { ano: number; cosecha_tipo: CosechaTipo }>(
    rows: T[],
    cosechas: CosechaIdentidad[],
  ): T[] => {
    if (cosechas.length === 0) return [];
    const keys = new Set(cosechas.map((c) => `${c.tipo}:${c.ano}`));
    return rows.filter((r) => keys.has(`${r.cosecha_tipo}:${r.ano}`));
  };

  const fetchRaw = async (
    filtros: FiltrosProduccion,
    cosechasEfectivas: CosechaIdentidad[],
    select: string,
  ) => {
    let query = supabase.from('produccion').select(select);
    query = aplicarFiltros(query, filtros, cosechasEfectivas);
    const { data, error } = await query;
    if (error) throw error;
    return filtrarPorCosechasEfectivas(
      (data || []) as unknown as RawProduccionRow[],
      cosechasEfectivas,
    );
  };

  const ensureCosechas = async (filtros: FiltrosProduccion) => {
    const catalogo = await getCatalogoCosechas();
    const seleccion = resolverCosechas(catalogo.cosechas, filtros);
    return { catalogo, seleccion };
  };

  const getKPIs = async (filtros: FiltrosProduccion): Promise<KPIProduccion> => {
    const { seleccion } = await ensureCosechas(filtros);
    if (seleccion.estado !== 'ok') {
      return {
        produccion_total_kg: 0,
        rendimiento_promedio_kg_arbol: null,
        ton_por_ha_promedio: null,
        lotes_activos: 0,
        periodo: seleccion.mensaje,
      };
    }

    const raw = await fetchRaw(
      filtros,
      seleccion.cosechas,
      `
          sublote_id,
          kg_totales,
          arboles_registrados,
          kg_por_arbol,
          lote_id,
          ano,
          cosecha_tipo,
          lotes!inner(area_hectareas, activo, nombre)
        `,
    );

    const data = consolidarRegistrosProduccion(toAgregable(raw));
    const resumenes = seleccion.cosechas.map((c) => resumirCosecha(data, c));
    const produccionTotal = resumenes.reduce((s, r) => s + r.produccion_kg, 0);
    const unico = resumenes.length === 1 ? resumenes[0] : null;
    const rendimientoPromedio = unico?.kg_por_arbol ?? null;
    const tonPorHa = unico?.ton_por_ha ?? null;

    const { count: lotesActivos } = await supabase
      .from('lotes')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true);

    const periodo =
      seleccion.cosechas.length === 1
        ? seleccion.cosechas[0].label
        : seleccion.cosechas.map((c) => c.label).join(' · ');

    return {
      produccion_total_kg: Math.round(produccionTotal),
      rendimiento_promedio_kg_arbol:
        rendimientoPromedio != null ? Math.round(rendimientoPromedio * 100) / 100 : null,
      ton_por_ha_promedio: tonPorHa != null ? Math.round(tonPorHa * 100) / 100 : null,
      lotes_activos: lotesActivos || 0,
      periodo,
    };
  };

  const getProduccionCalidad = async (
    filtros: FiltrosProduccion,
  ): Promise<
    {
      cosecha: string;
      cosecha_label: string;
      kg_exportacion: number;
      kg_nacional: number;
      kg_sin_desglose: number;
      kg_con_desglose: number;
      pct_exportacion: number | null;
      pct_nacional: number | null;
    }[]
  > => {
    try {
      const { seleccion } = await ensureCosechas(filtros);
      if (seleccion.estado !== 'ok') return [];

      const raw = await fetchRaw(
        filtros,
        seleccion.cosechas,
        `
          sublote_id,
          lote_id,
          ano,
          cosecha_tipo,
          kg_totales,
          kg_exportacion,
          kg_nacional,
          arboles_registrados,
          lotes!inner(nombre, area_hectareas)
        `,
      );

      return agregarCalidadPorCosecha(toAgregable(raw), seleccion.cosechas).map((p) => ({
        cosecha: p.cosecha.code,
        cosecha_label: p.cosecha.label,
        kg_exportacion: p.kg_exportacion,
        kg_nacional: p.kg_nacional,
        kg_sin_desglose: p.kg_sin_desglose,
        kg_con_desglose: p.kg_con_desglose,
        pct_exportacion: p.pct_exportacion,
        pct_nacional: p.pct_nacional,
      }));
    } catch (err: any) {
      if (
        err?.code === '42703' ||
        err?.message?.includes('kg_exportacion') ||
        err?.message?.includes('kg_nacional')
      ) {
        return [];
      }
      console.warn('getProduccionCalidad error (non-fatal):', err?.message);
      return [];
    }
  };

  const getTendenciasHistoricas = async (
    filtros: FiltrosProduccion,
  ): Promise<TendenciaHistoricaData[]> => {
    const { seleccion, catalogo } = await ensureCosechas(filtros);
    // Para evolución entre campañas usamos el catálogo completo filtrado por lotes,
    // no solo la selección puntual — en vista varias la selección YA es el eje.
    const eje =
      filtros.vista === 'varias' && seleccion.estado === 'ok'
        ? seleccion.cosechas
        : catalogo.cosechas.length > 0
          ? ordenarCosechas(catalogo.cosechas)
          : seleccion.estado === 'ok'
            ? seleccion.cosechas
            : [];

    if (eje.length === 0) return [];

    const raw = await fetchRaw(
      { ...filtros, anos_movimiento: [], cosecha_keys: eje.map((c) => c.key) },
      eje,
      `
          sublote_id,
          lote_id,
          ano,
          cosecha_tipo,
          kg_totales,
          kg_por_arbol,
          arboles_registrados,
          lotes!inner(nombre, area_hectareas)
        `,
    );

    const data = consolidarRegistrosProduccion(toAgregable(raw));
    const cosechaMap: Record<
      string,
      { ano: number; tipo: CosechaTipo; lotes: Record<string, number> }
    > = {};

    data.forEach((record) => {
      const cosechaCode = formatCosechaCode(record.ano, record.cosecha_tipo);
      if (!cosechaMap[cosechaCode]) {
        cosechaMap[cosechaCode] = {
          ano: record.ano,
          tipo: record.cosecha_tipo,
          lotes: {},
        };
      }
      const loteCode = getLoteCode(record.lote_nombre || '');
      const valor =
        valorMetrica(
          filtros.metrica,
          Number(record.kg_totales) || 0,
          record.arboles_registrados,
          record.area_hectareas,
        ) ?? 0;
      cosechaMap[cosechaCode].lotes[loteCode] =
        (cosechaMap[cosechaCode].lotes[loteCode] || 0) + valor;
    });

    return eje
      .map((c) => {
        const cosechaData = cosechaMap[c.code];
        if (!cosechaData) return null;
        return {
          cosecha: c.code,
          cosecha_label: c.label,
          ano: c.ano,
          tipo: c.tipo,
          ...cosechaData.lotes,
        } as TendenciaHistoricaData;
      })
      .filter((x): x is TendenciaHistoricaData => x != null);
  };

  const getComparacionLotes = async (filtros: FiltrosProduccion) => {
    const { seleccion } = await ensureCosechas(filtros);
    if (seleccion.estado !== 'ok') {
      return { estado: seleccion, filas: [], cosechas: [] as CosechaIdentidad[] };
    }

    const raw = await fetchRaw(
      filtros,
      seleccion.cosechas,
      `
          sublote_id,
          lote_id,
          ano,
          cosecha_tipo,
          kg_totales,
          arboles_registrados,
          lotes!inner(nombre, area_hectareas)
        `,
    );

    const filas = compararProduccionPorLote(
      toAgregable(raw),
      seleccion.cosechas,
      filtros.metrica,
    );

    return { estado: seleccion, filas, cosechas: seleccion.cosechas };
  };

  const getResumenesCosecha = async (filtros: FiltrosProduccion) => {
    const { seleccion } = await ensureCosechas(filtros);
    if (seleccion.estado !== 'ok') {
      return { estado: seleccion, resumenes: [] };
    }
    const raw = await fetchRaw(
      filtros,
      seleccion.cosechas,
      `
          sublote_id,
          lote_id,
          ano,
          cosecha_tipo,
          kg_totales,
          arboles_registrados,
          lotes!inner(nombre, area_hectareas)
        `,
    );
    const data = consolidarRegistrosProduccion(toAgregable(raw));
    return {
      estado: seleccion,
      resumenes: seleccion.cosechas.map((c) => resumirCosecha(data, c)),
    };
  };

  const getRendimientoSublotes = async (
    filtros: FiltrosProduccion,
  ): Promise<RendimientoSubloteData[]> => {
    const { seleccion } = await ensureCosechas(filtros);
    if (seleccion.estado !== 'ok') return [];

    let query = supabase
      .from('produccion')
      .select(
        `
          sublote_id,
          kg_totales,
          kg_por_arbol,
          arboles_registrados,
          ano,
          cosecha_tipo,
          lote_id,
          sublotes!inner(nombre, numero_sublote),
          lotes!inner(nombre, area_hectareas)
        `,
      )
      .not('sublote_id', 'is', null);

    query = aplicarFiltros(query, filtros, seleccion.cosechas);
    const { data, error: queryError } = await query;
    if (queryError) throw queryError;

    const filtered = filtrarPorCosechasEfectivas(
      (data || []) as RawProduccionRow[],
      seleccion.cosechas,
    );

    return filtered.map((record) => {
      const loteNombre = record.lotes?.nombre || 'Desconocido';
      const area = Number(record.lotes?.area_hectareas) || null;
      const areaSublote = area != null && area > 0 ? area / 3 : null;
      const kg = Number(record.kg_totales) || 0;
      const arboles = record.arboles_registrados;
      return {
        sublote_id: record.sublote_id!,
        sublote_nombre: record.sublotes?.nombre || 'Desconocido',
        lote_id: record.lote_id,
        lote_nombre: loteNombre,
        lote_color: getLoteColor(loteNombre),
        kg_totales: kg,
        kg_por_arbol: calcularKgPorArbol(kg, arboles) ?? 0,
        ton_por_ha: calcularTonPorHa(kg, areaSublote) ?? 0,
        arboles: arboles || 0,
        cosecha: formatCosechaCode(record.ano, record.cosecha_tipo),
      };
    });
  };

  const getTopSublotes = async (
    filtros: FiltrosProduccion,
    limit: number = 10,
  ): Promise<TopSubloteData[]> => {
    const sublotes = await getRendimientoSublotes(filtros);
    const withValue = sublotes.map((s) => ({
      ...s,
      valor:
        filtros.metrica === 'kg_totales'
          ? s.kg_totales
          : filtros.metrica === 'kg_por_arbol'
            ? s.kg_por_arbol
            : s.ton_por_ha,
    }));

    return withValue
      .sort((a, b) => b.valor - a.valor)
      .slice(0, limit)
      .map((s, i) => ({
        sublote_id: s.sublote_id,
        sublote_nombre: s.sublote_nombre,
        lote_nombre: s.lote_nombre,
        lote_color: s.lote_color,
        valor: Math.round(s.valor * 100) / 100,
        metrica: filtros.metrica,
        ranking: i + 1,
      }));
  };

  const getEdadRendimiento = async (
    filtros: FiltrosProduccion,
  ): Promise<EdadRendimientoData[]> => {
    const { seleccion } = await ensureCosechas(filtros);
    if (seleccion.estado !== 'ok') return [];

    const raw = await fetchRaw(
      filtros,
      seleccion.cosechas,
      `
          sublote_id,
          lote_id,
          ano,
          cosecha_tipo,
          kg_totales,
          kg_por_arbol,
          arboles_registrados,
          lotes!inner(nombre, fecha_siembra, area_hectareas)
        `,
    );

    const data = consolidarRegistrosProduccion(toAgregable(raw));
    const loteMap: Record<
      string,
      {
        nombre: string;
        fecha_siembra: string | null;
        area: number | null;
        totalKg: number;
        totalArboles: number;
        numRegistros: number;
        tieneArboles: boolean;
      }
    > = {};

    data.forEach((record, idx) => {
      const loteId = record.lote_id;
      const rawRow = raw[idx];
      if (!loteMap[loteId]) {
        loteMap[loteId] = {
          nombre: record.lote_nombre || 'Desconocido',
          fecha_siembra: rawRow?.lotes?.fecha_siembra ?? null,
          area: record.area_hectareas ?? null,
          totalKg: 0,
          totalArboles: 0,
          numRegistros: 0,
          tieneArboles: false,
        };
      }
      loteMap[loteId].totalKg += Number(record.kg_totales) || 0;
      if (record.arboles_registrados != null && record.arboles_registrados > 0) {
        loteMap[loteId].totalArboles += record.arboles_registrados;
        loteMap[loteId].tieneArboles = true;
      }
      loteMap[loteId].numRegistros += 1;
    });

    const currentYear = new Date().getFullYear();
    return Object.entries(loteMap)
      .filter(([, lote]) => lote.fecha_siembra)
      .map(([loteId, lote]) => {
        const fechaSiembra = new Date(lote.fecha_siembra!);
        const edadAnos = currentYear - fechaSiembra.getFullYear();
        let rendimiento = 0;
        if (filtros.metrica === 'ton_por_ha') {
          const ton = calcularTonPorHa(lote.totalKg, lote.area);
          rendimiento = ton != null && lote.numRegistros > 0 ? ton / lote.numRegistros : 0;
        } else {
          rendimiento = calcularKgPorArbol(lote.totalKg, lote.tieneArboles ? lote.totalArboles : null) ?? 0;
        }
        return {
          lote_id: loteId,
          lote_nombre: lote.nombre,
          lote_codigo: getLoteCode(lote.nombre),
          lote_color: getLoteColor(lote.nombre),
          edad_anos: edadAnos,
          rendimiento: Math.round(rendimiento * 100) / 100,
          arboles: lote.tieneArboles
            ? Math.round(lote.totalArboles / (lote.numRegistros || 1))
            : 0,
        };
      });
  };

  const getLineaReferenciaEdad = (): { edad: number; rendimiento: number }[] => [
    { edad: 2, rendimiento: 0.5 },
    { edad: 3, rendimiento: 2 },
    { edad: 4, rendimiento: 5 },
    { edad: 5, rendimiento: 8 },
    { edad: 6, rendimiento: 10 },
    { edad: 7, rendimiento: 12 },
    { edad: 8, rendimiento: 12 },
  ];

  const getLotes = async (): Promise<LoteProduccion[]> => {
    const { data, error: queryError } = await supabase
      .from('lotes')
      .select('id, nombre, area_hectareas, total_arboles, fecha_siembra, activo')
      .eq('activo', true)
      .order('numero_orden', { ascending: true });

    if (queryError) throw queryError;
    return (data || []) as unknown as LoteProduccion[];
  };

  const getSublotesByLote = async (loteId: string): Promise<SubloteProduccion[]> => {
    const { data, error: queryError } = await supabase
      .from('sublotes')
      .select('id, nombre, lote_id, numero_sublote, total_arboles')
      .eq('lote_id', loteId)
      .order('numero_sublote', { ascending: true });

    if (queryError) throw queryError;
    return (data || []) as unknown as SubloteProduccion[];
  };

  const createProduccion = async (formData: ProduccionFormData): Promise<Produccion> => {
    const { data, error: insertError } = await supabase
      .from('produccion')
      .insert([
        {
          lote_id: formData.lote_id,
          sublote_id: formData.sublote_id || null,
          ano: formData.ano,
          cosecha_tipo: formData.cosecha_tipo,
          kg_totales: formData.kg_totales,
          arboles_registrados: formData.arboles_registrados,
          observaciones: formData.observaciones,
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;
    return data as unknown as Produccion;
  };

  const getProduccionList = async (filtros: FiltrosProduccion): Promise<Produccion[]> => {
    const { seleccion } = await ensureCosechas(filtros);
    const cosechas = seleccion.estado === 'ok' ? seleccion.cosechas : [];
    let query = supabase
      .from('produccion')
      .select('*, lotes(nombre), sublotes(nombre)')
      .order('ano', { ascending: false })
      .order('cosecha_tipo', { ascending: true });

    query = aplicarFiltros(query, filtros, cosechas);
    const { data, error: queryError } = await query;
    if (queryError) throw queryError;
    return filtrarPorCosechasEfectivas(
      (data || []) as Produccion[],
      cosechas,
    ) as unknown as Produccion[];
  };

  const getEtapasLote = async (filtros: FiltrosProduccion): Promise<RegistroEtapaLote[]> => {
    const { seleccion } = await ensureCosechas(filtros);
    if (seleccion.estado !== 'ok' || seleccion.cosechas.length === 0) return [];
    const anos = anosCampanaDeCosechas(seleccion.cosechas);
    if (anos.length === 0) return [];

    // La tabla entra con la migración 193, que todavía no está aplicada.
    // El tipo generado de Supabase no la conoce.
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          in: (
            column: string,
            values: number[],
          ) => Promise<{
            data: Array<{
              ano: number;
              cosecha_tipo: string;
              lote_id: string;
              etapa: string;
              kg: number | string;
              fecha_corte: string;
            }> | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    })
      .from('produccion_etapas_lote')
      .select('ano, cosecha_tipo, lote_id, etapa, kg, fecha_corte')
      .in('ano', anos);

    if (error) {
      const mensaje = error.message ?? '';
      const faltaTabla =
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        (/produccion_etapas_lote/i.test(mensaje) &&
          /does not exist|schema cache|could not find/i.test(mensaje));
      if (faltaTabla) return [];
      throw error;
    }

    const keys = new Set(seleccion.cosechas.map((c) => c.key));
    const lotes = new Set(filtros.lote_ids);
    return (data ?? [])
      .filter((row) => keys.has(`${row.cosecha_tipo}:${row.ano}`))
      .filter((row) => lotes.size === 0 || lotes.has(row.lote_id))
      .filter((row) => row.etapa === 'clasificado' || row.etapa === 'despachado')
      .map((row) => ({
        ano: Number(row.ano),
        cosecha_tipo: row.cosecha_tipo as RegistroEtapaLote['cosecha_tipo'],
        lote_id: row.lote_id,
        etapa: row.etapa as RegistroEtapaLote['etapa'],
        kg: Number(row.kg),
        fecha_corte: String(row.fecha_corte).slice(0, 10),
      }));
  };

  return {
    getCatalogoCosechas,
    getEtapasLote,
    getKPIs,
    getTendenciasHistoricas,
    getComparacionLotes,
    getResumenesCosecha,
    getRendimientoSublotes,
    getTopSublotes,
    getEdadRendimiento,
    getLineaReferenciaEdad,
    getLotes,
    getSublotesByLote,
    createProduccion,
    getProduccionList,
    getProduccionCalidad,
    resolverSeleccionCosechas: resolverCosechas,
  };
}
