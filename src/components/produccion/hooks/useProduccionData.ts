import { useState } from 'react';
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
  CosechaTipo,
  MetricaProduccion,
} from '../../../types/produccion';
import {
  formatCosechaCode,
  formatCosechaLabel,
  getLoteCode,
  getLoteColor,
  COSECHAS_ORDEN,
} from '../../../types/produccion';

/**
 * Hook personalizado para cargar datos de produccion/cosechas
 */
export function useProduccionData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabase();

  /**
   * Helper para aplicar filtros comunes a queries
   */
  const aplicarFiltros = (query: any, filtros: FiltrosProduccion) => {
    // Filtrar por anos
    if (filtros.anos.length > 0) {
      query = query.in('ano', filtros.anos);
    }

    // Filtrar por tipo de cosecha
    if (filtros.cosecha_tipo !== 'Ambas') {
      query = query.eq('cosecha_tipo', filtros.cosecha_tipo);
    }

    // Filtrar por lotes
    if (filtros.lote_ids.length > 0) {
      query = query.in('lote_id', filtros.lote_ids);
    }

    return query;
  };

  /**
   * Cargar KPIs del periodo
   */
  const getKPIs = async (filtros: FiltrosProduccion): Promise<KPIProduccion> => {
    try {
      setLoading(true);
      setError(null);

      // Obtener registros de produccion con datos de lote (solo registros a nivel lote)
      let query = supabase
        .from('produccion')
        .select(
          `
          kg_totales,
          arboles_registrados,
          kg_por_arbol,
          lote_id,
          lotes!inner(area_hectareas, activo)
        `
        )
        .is('sublote_id', null); // Solo registros a nivel lote para KPIs

      query = aplicarFiltros(query, filtros);
      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Calcular totales
      const produccionTotal =
        data?.reduce((sum, r) => sum + (Number(r.kg_totales) || 0), 0) || 0;
      const totalArboles =
        data?.reduce((sum, r) => sum + (r.arboles_registrados || 0), 0) || 0;
      const rendimientoPromedio =
        totalArboles > 0 ? produccionTotal / totalArboles : 0;

      // Calcular ton/ha (usando area unica por lote)
      const lotesUnicos = new Map<string, number>();
      data?.forEach((r: any) => {
        if (r.lote_id && r.lotes?.area_hectareas) {
          lotesUnicos.set(r.lote_id, Number(r.lotes.area_hectareas));
        }
      });
      const areaTotal = Array.from(lotesUnicos.values()).reduce(
        (sum, area) => sum + area,
        0
      );
      const tonPorHa = areaTotal > 0 ? produccionTotal / 1000 / areaTotal : 0;

      // Contar lotes activos
      const { count: lotesActivos } = await supabase
        .from('lotes')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true);

      // Construir descripcion del periodo
      const periodo =
        filtros.anos.length === 1
          ? `${filtros.anos[0]}`
          : filtros.anos.length > 1
            ? `${Math.min(...filtros.anos)}-${Math.max(...filtros.anos)}`
            : 'Todos los anos';

      return {
        produccion_total_kg: Math.round(produccionTotal),
        rendimiento_promedio_kg_arbol:
          Math.round(rendimientoPromedio * 100) / 100,
        ton_por_ha_promedio: Math.round(tonPorHa * 100) / 100,
        lotes_activos: lotesActivos || 0,
        periodo,
      };
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar datos para grafico de tendencias historicas (LineChart)
   * Agrupa por cosecha (P23, T23, etc.) con una linea por lote
   */
  const getTendenciasHistoricas = async (
    filtros: FiltrosProduccion
  ): Promise<TendenciaHistoricaData[]> => {
    try {
      setLoading(true);
      setError(null);

      // Obtener datos a nivel lote
      let query = supabase
        .from('produccion')
        .select(
          `
          ano,
          cosecha_tipo,
          kg_totales,
          kg_por_arbol,
          arboles_registrados,
          lotes!inner(nombre, area_hectareas)
        `
        )
        .is('sublote_id', null); // Solo registros a nivel lote

      query = aplicarFiltros(query, filtros);
      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Agrupar por cosecha y luego por lote
      const cosechaMap: Record<
        string,
        {
          ano: number;
          tipo: CosechaTipo;
          lotes: Record<string, number>;
        }
      > = {};

      data?.forEach((record: any) => {
        const cosechaCode = formatCosechaCode(record.ano, record.cosecha_tipo);

        if (!cosechaMap[cosechaCode]) {
          cosechaMap[cosechaCode] = {
            ano: record.ano,
            tipo: record.cosecha_tipo,
            lotes: {},
          };
        }

        const loteCode = getLoteCode(record.lotes?.nombre || '');

        // Calcular valor segun metrica seleccionada
        let valor = 0;
        switch (filtros.metrica) {
          case 'kg_totales':
            valor = Number(record.kg_totales) || 0;
            break;
          case 'kg_por_arbol':
            valor = Number(record.kg_por_arbol) || 0;
            break;
          case 'ton_por_ha':
            const area = Number(record.lotes?.area_hectareas) || 1;
            valor = (Number(record.kg_totales) || 0) / 1000 / area;
            break;
        }

        // Acumular si hay multiples registros para el mismo lote/cosecha
        cosechaMap[cosechaCode].lotes[loteCode] =
          (cosechaMap[cosechaCode].lotes[loteCode] || 0) + valor;
      });

      // Convertir a array ordenado por cosecha
      const tendencias: TendenciaHistoricaData[] = COSECHAS_ORDEN.filter(
        (code) => cosechaMap[code]
      ).map((cosechaCode) => {
        const cosechaData = cosechaMap[cosechaCode];
        return {
          cosecha: cosechaCode,
          cosecha_label: formatCosechaLabel(cosechaData.ano, cosechaData.tipo),
          ano: cosechaData.ano,
          tipo: cosechaData.tipo,
          ...cosechaData.lotes,
        };
      });

      return tendencias;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cargar datos a nivel sublote para ScatterChart
   */
  const getRendimientoSublotes = async (
    filtros: FiltrosProduccion
  ): Promise<RendimientoSubloteData[]> => {
    try {
      setLoading(true);
      setError(null);

      // Solo obtener registros a nivel sublote
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
          sublotes!inner(nombre, numero_sublote),
          lotes!inner(nombre, area_hectareas)
        `
        )
        .not('sublote_id', 'is', null);

      query = aplicarFiltros(query, filtros);
      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      return (
        data?.map((record: any) => {
          const loteNombre = record.lotes?.nombre || 'Desconocido';
          const area = Number(record.lotes?.area_hectareas) || 1;
          // Estimar area del sublote como area del lote / 3 (asumiendo 3 sublotes por lote)
          const areaSublote = area / 3;

          return {
            sublote_id: record.sublote_id,
            sublote_nombre: record.sublotes?.nombre || 'Desconocido',
            lote_id: record.lote_id,
            lote_nombre: loteNombre,
            lote_color: getLoteColor(loteNombre),
            kg_totales: Number(record.kg_totales) || 0,
            kg_por_arbol: Number(record.kg_por_arbol) || 0,
            ton_por_ha: (Number(record.kg_totales) || 0) / 1000 / areaSublote,
            arboles: record.arboles_registrados || 0,
            cosecha: formatCosechaCode(record.ano, record.cosecha_tipo),
          };
        }) || []
      );
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtener ranking de top sublotes
   */
  const getTopSublotes = async (
    filtros: FiltrosProduccion,
    limit: number = 10
  ): Promise<TopSubloteData[]> => {
    try {
      const sublotes = await getRendimientoSublotes(filtros);

      // Agregar valor segun metrica y ordenar
      const withValue = sublotes.map((s) => ({
        ...s,
        valor:
          filtros.metrica === 'kg_totales'
            ? s.kg_totales
            : filtros.metrica === 'kg_por_arbol'
              ? s.kg_por_arbol
              : s.ton_por_ha,
      }));

      // Ordenar descendente y limitar
      const sorted = withValue
        .sort((a, b) => b.valor - a.valor)
        .slice(0, limit);

      return sorted.map((s, i) => ({
        sublote_id: s.sublote_id,
        sublote_nombre: s.sublote_nombre,
        lote_nombre: s.lote_nombre,
        lote_color: s.lote_color,
        valor: Math.round(s.valor * 100) / 100,
        metrica: filtros.metrica,
        ranking: i + 1,
      }));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  /**
   * Cargar datos de edad vs rendimiento por lote
   */
  const getEdadRendimiento = async (
    filtros: FiltrosProduccion
  ): Promise<EdadRendimientoData[]> => {
    try {
      setLoading(true);
      setError(null);

      // Obtener datos a nivel lote con fecha_siembra
      let query = supabase
        .from('produccion')
        .select(
          `
          lote_id,
          ano,
          kg_totales,
          kg_por_arbol,
          arboles_registrados,
          lotes!inner(nombre, fecha_siembra, area_hectareas)
        `
        )
        .is('sublote_id', null);

      query = aplicarFiltros(query, filtros);
      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Agrupar por lote y calcular promedios
      const loteMap: Record<
        string,
        {
          nombre: string;
          fecha_siembra: string | null;
          area: number;
          totalKg: number;
          totalArboles: number;
          numRegistros: number;
        }
      > = {};

      data?.forEach((record: any) => {
        const loteId = record.lote_id;

        if (!loteMap[loteId]) {
          loteMap[loteId] = {
            nombre: record.lotes?.nombre || 'Desconocido',
            fecha_siembra: record.lotes?.fecha_siembra,
            area: Number(record.lotes?.area_hectareas) || 1,
            totalKg: 0,
            totalArboles: 0,
            numRegistros: 0,
          };
        }

        loteMap[loteId].totalKg += Number(record.kg_totales) || 0;
        loteMap[loteId].totalArboles += record.arboles_registrados || 0;
        loteMap[loteId].numRegistros += 1;
      });

      // Convertir a array con calculo de edad
      const currentYear = new Date().getFullYear();

      return Object.entries(loteMap)
        .filter(([, lote]) => lote.fecha_siembra) // Solo lotes con fecha de siembra
        .map(([loteId, lote]) => {
          const fechaSiembra = new Date(lote.fecha_siembra!);
          const edadAnos = currentYear - fechaSiembra.getFullYear();

          // Calcular rendimiento promedio segun metrica
          let rendimiento = 0;
          if (filtros.metrica === 'ton_por_ha') {
            rendimiento =
              lote.numRegistros > 0
                ? lote.totalKg / 1000 / lote.area / lote.numRegistros
                : 0;
          } else {
            // kg/arbol promedio
            rendimiento =
              lote.totalArboles > 0 ? lote.totalKg / lote.totalArboles : 0;
          }

          return {
            lote_id: loteId,
            lote_nombre: lote.nombre,
            lote_codigo: getLoteCode(lote.nombre),
            lote_color: getLoteColor(lote.nombre),
            edad_anos: edadAnos,
            rendimiento: Math.round(rendimiento * 100) / 100,
            arboles: Math.round(lote.totalArboles / (lote.numRegistros || 1)),
          };
        });
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtener linea de referencia para grafico de edad
   * Basado en curva tipica de rendimiento de aguacate
   */
  const getLineaReferenciaEdad = (): { edad: number; rendimiento: number }[] => {
    return [
      { edad: 2, rendimiento: 0.5 },
      { edad: 3, rendimiento: 2 },
      { edad: 4, rendimiento: 5 },
      { edad: 5, rendimiento: 8 },
      { edad: 6, rendimiento: 10 },
      { edad: 7, rendimiento: 12 },
      { edad: 8, rendimiento: 12 },
    ];
  };

  /**
   * Cargar lista de lotes para filtros
   */
  const getLotes = async (): Promise<LoteProduccion[]> => {
    try {
      const { data, error: queryError } = await supabase
        .from('lotes')
        .select('id, nombre, area_hectareas, total_arboles, fecha_siembra, activo')
        .eq('activo', true)
        .order('numero_orden', { ascending: true });

      if (queryError) throw queryError;
      return data || [];
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  /**
   * Cargar sublotes de un lote especifico
   */
  const getSublotesByLote = async (
    loteId: string
  ): Promise<SubloteProduccion[]> => {
    try {
      const { data, error: queryError } = await supabase
        .from('sublotes')
        .select('id, nombre, lote_id, numero_sublote, total_arboles')
        .eq('lote_id', loteId)
        .order('numero_sublote', { ascending: true });

      if (queryError) throw queryError;
      return data || [];
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  /**
   * Crear nuevo registro de produccion
   */
  const createProduccion = async (
    formData: ProduccionFormData
  ): Promise<Produccion> => {
    try {
      setLoading(true);
      setError(null);

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
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtener lista de registros de produccion
   */
  const getProduccionList = async (
    filtros: FiltrosProduccion
  ): Promise<Produccion[]> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('produccion')
        .select(
          `
          *,
          lotes(nombre),
          sublotes(nombre)
        `
        )
        .order('ano', { ascending: false })
        .order('cosecha_tipo', { ascending: true });

      query = aplicarFiltros(query, filtros);
      const { data, error: queryError } = await query;

      if (queryError) throw queryError;
      return data || [];
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    getKPIs,
    getTendenciasHistoricas,
    getRendimientoSublotes,
    getTopSublotes,
    getEdadRendimiento,
    getLineaReferenciaEdad,
    getLotes,
    getSublotesByLote,
    createProduccion,
    getProduccionList,
  };
}
