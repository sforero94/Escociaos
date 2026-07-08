// ARCHIVO: components/monitoreo/hooks/usePriorizacionMonitoreo.ts
// DESCRIPCIÓN: Capa de datos (fetch) para P2 de docs/PLAN_PRIORIZACION_MONITOREO.md.
// Consulta Supabase, da forma a los datos crudos según los tipos de entrada de
// `priorizarMonitoreo` (src/utils/priorizacionMonitoreo.ts) y delega TODO el cálculo
// de ranking a ese módulo puro -- este hook no reimplementa ninguna lógica de
// priorización, sólo obtiene y da forma a los datos.
//
// Decisiones documentadas (ver §7 P2 del diseño):
// - Ventana de historial de `monitoreos`: últimos LOOKBACK_MONITOREOS_DIAS (~6 meses).
//   Suficiente para capturar >=2 rondas por (sublote, plaga) en la cadencia habitual
//   de monitoreo de esta finca, sin traer todo el histórico de ~1.5 años.
// - Ventana de `movimientos_diarios` (fecha de última fumigación por lote):
//   últimos LOOKBACK_FUMIGACIONES_DIAS (~2 años) -- generosa a propósito, ya que
//   subestimar "días desde la última fumigación" (mostrando null cuando sí hubo
//   una fumigación más antigua) sería peor que traer algunas filas de más; la
//   tabla sólo tiene lote_id + fecha, así que el costo de traer más es bajo.
// - `pest_seasonal_profile` y `pest_umbral_economico` se traen completos (875 y 10
//   filas respectivamente) -- son tablas de referencia pequeñas, no vale la pena
//   filtrarlas.
// - El pooling del complejo de ácaros NO se hace aquí: cada fila de `monitoreos`
//   se agrupa por (sublote_id, plaga_enfermedad_id) individual, tal como exige el
//   módulo puro (ver comentario en HistorialSublotePlaga). `priorizarMonitoreo`
//   hace el pooling internamente usando `pest_umbral_economico.grupo_key`.
// - `fecha_monitoreo` se pasa TAL CUAL viene de la fila de `monitoreos` (string,
//   sin reformatear) -- crítico para que las observaciones de una misma ronda
//   (mismo `ronda_id`) compartan el mismo string de fecha y así el pooling por
//   MAX de la ronda funcione correctamente (ver instrucciones del diseño).

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { priorizarMonitoreo } from '@/utils/priorizacionMonitoreo';
import type {
  HistorialSublotePlaga,
  UmbralEconomico,
  PerfilEstacional,
  EventoFumigacion,
  PriorizacionEntry,
} from '@/utils/priorizacionMonitoreo';

const LOOKBACK_MONITOREOS_DIAS = 200; // ~6.5 meses
const LOOKBACK_FUMIGACIONES_DIAS = 730; // ~2 años

// PostgREST devuelve embeds N:1 como objeto o, en algunos casos, como array de
// un elemento -- normalizamos ambos casos (mismo patrón que useGanadoInventario.ts).
function uno<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function fechaHaceNDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().split('T')[0];
}

interface MonitoreoRawRow {
  fecha_monitoreo: string;
  lote_id: string;
  sublote_id: string | null;
  plaga_enfermedad_id: string;
  arboles_monitoreados: number;
  arboles_afectados: number;
  incidencia: number;
  lotes: { nombre: string } | { nombre: string }[] | null;
  sublotes: { nombre: string } | { nombre: string }[] | null;
  plagas_enfermedades_catalogo: { nombre: string } | { nombre: string }[] | null;
}

/** Agrupa filas crudas de `monitoreos` en historiales por (sublote, plaga individual).
 * No agrupa el complejo de ácaros -- eso lo hace `priorizarMonitoreo` internamente. */
function agruparHistoriales(rows: MonitoreoRawRow[]): HistorialSublotePlaga[] {
  const grupos = new Map<string, HistorialSublotePlaga>();

  for (const row of rows) {
    if (!row.sublote_id) continue; // el ranking es a nivel sublote (ver §3 del diseño)

    const key = `${row.sublote_id}|${row.plaga_enfermedad_id}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      const lote = uno(row.lotes);
      const sublote = uno(row.sublotes);
      const plaga = uno(row.plagas_enfermedades_catalogo);
      grupo = {
        sublote_id: row.sublote_id,
        sublote_nombre: sublote?.nombre,
        lote_id: row.lote_id,
        lote_nombre: lote?.nombre,
        pest_id: row.plaga_enfermedad_id,
        pest_nombre: plaga?.nombre,
        rondas: [],
      };
      grupos.set(key, grupo);
    }

    grupo.rondas.push({
      // NUNCA reformatear: debe coincidir exactamente con el valor de la fila
      // para que observaciones de la misma ronda (mismo ronda_id) compartan
      // el mismo string de fecha y el pooling del complejo de ácaros funcione.
      fecha_monitoreo: row.fecha_monitoreo,
      incidencia: Number(row.incidencia) || 0,
      arboles_monitoreados: row.arboles_monitoreados,
      arboles_afectados: row.arboles_afectados,
    });
  }

  return Array.from(grupos.values());
}

export interface UsePriorizacionMonitoreoReturn {
  loading: boolean;
  error: string | null;
  /** Ejecuta el fetch completo + llama a `priorizarMonitoreo`. Devuelve la lista
   * ya ordenada (ver `bracket` en PriorizacionEntry para el criterio de orden). */
  cargarPriorizacion: () => Promise<PriorizacionEntry[]>;
}

export function usePriorizacionMonitoreo(): UsePriorizacionMonitoreoReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarPriorizacion = useCallback(async (): Promise<PriorizacionEntry[]> => {
    const supabase = getSupabase() as any;
    setLoading(true);
    setError(null);

    try {
      const [monitoreosRes, umbralesRes, perfilesRes, movimientosRes] = await Promise.all([
        supabase
          .from('monitoreos')
          .select(
            'fecha_monitoreo, lote_id, sublote_id, plaga_enfermedad_id, arboles_monitoreados, arboles_afectados, incidencia, lotes(nombre), sublotes(nombre), plagas_enfermedades_catalogo(nombre)'
          )
          .gte('fecha_monitoreo', fechaHaceNDias(LOOKBACK_MONITOREOS_DIAS))
          .order('fecha_monitoreo', { ascending: true }),
        supabase
          .from('pest_umbral_economico')
          .select('pest_id, grupo_key, umbral_pct, source_label'),
        supabase
          .from('pest_seasonal_profile')
          .select('pest_id, lote_id, week_of_year, historical_tier, n_years_observed'),
        supabase
          .from('movimientos_diarios')
          .select('lote_id, fecha_movimiento')
          .not('lote_id', 'is', null)
          .gte('fecha_movimiento', fechaHaceNDias(LOOKBACK_FUMIGACIONES_DIAS)),
      ]);

      if (monitoreosRes.error) throw new Error(`Monitoreos: ${monitoreosRes.error.message}`);
      if (umbralesRes.error) throw new Error(`Umbral económico: ${umbralesRes.error.message}`);
      if (perfilesRes.error) throw new Error(`Perfil estacional: ${perfilesRes.error.message}`);
      if (movimientosRes.error) throw new Error(`Movimientos diarios: ${movimientosRes.error.message}`);

      const historiales = agruparHistoriales((monitoreosRes.data ?? []) as MonitoreoRawRow[]);

      const umbrales: UmbralEconomico[] = ((umbralesRes.data ?? []) as any[]).map((u) => ({
        pest_id: u.pest_id,
        grupo_key: u.grupo_key,
        umbral_pct: Number(u.umbral_pct),
        source_label: u.source_label,
      }));

      const perfilesEstacionales: PerfilEstacional[] = ((perfilesRes.data ?? []) as any[]).map((p) => ({
        pest_id: p.pest_id,
        lote_id: p.lote_id,
        week_of_year: p.week_of_year,
        historical_tier: p.historical_tier,
        n_years_observed: p.n_years_observed,
      }));

      const ultimasFumigaciones: EventoFumigacion[] = ((movimientosRes.data ?? []) as any[]).map((m) => ({
        lote_id: m.lote_id,
        fecha: m.fecha_movimiento,
      }));

      return priorizarMonitoreo({
        historiales,
        umbrales,
        perfilesEstacionales,
        ultimasFumigaciones,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, cargarPriorizacion };
}
