import { useState, useCallback } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import type {
  LoteProduccion,
  SubloteProduccion,
  CosechaTipo,
} from '../../../types/produccion';

// ============================================================================
// TYPES
// ============================================================================

/** A row in the grid — maps to one produccion record (existing or new). */
export interface GridRow {
  /** Existing record id for UPDATE path; undefined for INSERT path. */
  id?: string;
  lote_id: string;
  lote_nombre: string;
  sublote_id: string | null;
  sublote_nombre: string | null;
  /** Prefilled tree count; editable. */
  arboles: number | '';
  kg_exportacion: number | '';
  kg_nacional: number | '';
  /** When both breakdown fields are filled, this is auto-computed from them;
   *  otherwise it is directly editable. */
  kg_totales: number | '';
}

/** Historic kg/árbol range for outlier detection. */
export interface HistoricoStats {
  lote_id: string;
  min_kg_arbol: number;
  max_kg_arbol: number;
  avg_kg_arbol: number;
  /** true when there are <2 historic records (stats unreliable). */
  escasos: boolean;
}

/** Save payload handed back to callers. */
export interface CapturaSaveResult {
  inserted: number;
  updated: number;
}

/** Raw existing produccion row as returned from Supabase (before migration 046 types land). */
interface RawExistingRow {
  id: string;
  lote_id: string;
  sublote_id: string | null;
  kg_totales: number;
  arboles_registrados: number;
  kg_exportacion?: number | null;
  kg_nacional?: number | null;
}

/** Raw historic row for stats calculation. */
interface RawHistoricoRow {
  lote_id: string;
  sublote_id: string | null;
  kg_totales: number;
  arboles_registrados: number;
  kg_por_arbol: number | null;
}

/** Raw sublote row from DB (numero_sublote is nullable in DB). */
interface RawSubloteRow {
  id: string;
  nombre: string;
  lote_id: string;
  numero_sublote: number | null;
  total_arboles: number | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function computedKgTotales(row: GridRow): number | null {
  if (row.kg_exportacion !== '' && row.kg_nacional !== '') {
    return Number(row.kg_exportacion) + Number(row.kg_nacional);
  }
  return null;
}

/** Returns the effective kg_totales value for a row (computed or manual). */
export function effectiveKgTotales(row: GridRow): number | '' {
  const computed = computedKgTotales(row);
  if (computed !== null) return computed;
  return row.kg_totales;
}

/** Returns kg/árbol for a row if both kg_totales and arboles are set. */
export function kgPorArbol(row: GridRow): number | null {
  const kg = effectiveKgTotales(row);
  const arb = row.arboles;
  if (kg !== '' && arb !== '' && Number(arb) > 0) {
    return Number(kg) / Number(arb);
  }
  return null;
}

/** True when the row has at least arboles and kg_totales (or breakdown). */
export function rowHasData(row: GridRow): boolean {
  const kg = effectiveKgTotales(row);
  return row.arboles !== '' && Number(row.arboles) > 0 && kg !== '' && Number(kg) > 0;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCapturaCosecha() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabase();

  /**
   * Load all active lotes with their sublotes.
   * Returns lotes and a flat sublotes map keyed by lote_id.
   */
  const loadLotesConSublotes = useCallback(async (): Promise<{
    lotes: LoteProduccion[];
    sublotesByLote: Record<string, SubloteProduccion[]>;
  }> => {
    setLoading(true);
    setError(null);
    try {
      const { data: lotesData, error: lotesError } = await supabase
        .from('lotes')
        .select('id, nombre, area_hectareas, total_arboles, fecha_siembra, activo')
        .eq('activo', true)
        .order('numero_orden', { ascending: true });

      if (lotesError) throw lotesError;
      const lotes = (lotesData ?? []) as unknown as LoteProduccion[];

      const loteIds = lotes.map((l) => l.id);
      const sublotesByLote: Record<string, SubloteProduccion[]> = {};

      if (loteIds.length > 0) {
        const { data: sublotesData, error: subError } = await supabase
          .from('sublotes')
          .select('id, nombre, lote_id, numero_sublote, total_arboles')
          .in('lote_id', loteIds)
          .order('numero_sublote', { ascending: true });

        if (subError) throw subError;

        (sublotesData ?? []).forEach((s: unknown) => {
          const row = s as RawSubloteRow;
          if (!sublotesByLote[row.lote_id]) sublotesByLote[row.lote_id] = [];
          // Coerce to SubloteProduccion; numero_sublote defaults to 0 if null
          sublotesByLote[row.lote_id].push({
            id: row.id,
            nombre: row.nombre,
            lote_id: row.lote_id,
            numero_sublote: row.numero_sublote ?? 0,
            total_arboles: row.total_arboles,
          });
        });
      }

      return { lotes, sublotesByLote };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  /**
   * Load existing produccion records for a specific cosecha.
   * Returns a map keyed by `${lote_id}__${sublote_id ?? 'null'}` for quick lookup.
   *
   * Note: kg_exportacion/kg_nacional columns are added by migration 046.
   * We cast to unknown first to avoid Supabase generated-type errors when the
   * migration has not been applied to the local type snapshot yet.
   */
  const loadExistingCosecha = useCallback(async (
    ano: number,
    cosecha_tipo: CosechaTipo
  ): Promise<Map<string, RawExistingRow>> => {
    setLoading(true);
    setError(null);
    try {
      // Cast to unknown so we can select columns not yet in the TS snapshot.
      const { data, error: qErr } = await (supabase
        .from('produccion')
        .select('id, lote_id, sublote_id, kg_totales, arboles_registrados, kg_exportacion, kg_nacional')
        .eq('ano', ano)
        .eq('cosecha_tipo', cosecha_tipo) as unknown as Promise<{ data: unknown[] | null; error: unknown }>);

      if (qErr) throw qErr;

      const map = new Map<string, RawExistingRow>();

      (data ?? []).forEach((item: unknown) => {
        const r = item as RawExistingRow;
        const key = `${r.lote_id}__${r.sublote_id ?? 'null'}`;
        map.set(key, {
          id: r.id,
          lote_id: r.lote_id,
          sublote_id: r.sublote_id,
          kg_totales: Number(r.kg_totales),
          arboles_registrados: Number(r.arboles_registrados),
          kg_exportacion: r.kg_exportacion != null ? Number(r.kg_exportacion) : null,
          kg_nacional: r.kg_nacional != null ? Number(r.kg_nacional) : null,
        });
      });

      return map;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  /**
   * Load historic kg/árbol stats per lote across all cosechas EXCEPT the
   * currently selected (ano, tipo) to give context for outlier detection.
   */
  const loadHistoricoStats = useCallback(async (
    excludeAno: number,
    excludeTipo: CosechaTipo,
    loteIds: string[]
  ): Promise<Map<string, HistoricoStats>> => {
    if (loteIds.length === 0) return new Map();

    try {
      const { data, error: qErr } = await supabase
        .from('produccion')
        .select('lote_id, sublote_id, kg_totales, arboles_registrados, kg_por_arbol')
        .in('lote_id', loteIds)
        .or(`ano.neq.${excludeAno},cosecha_tipo.neq.${excludeTipo}`);

      if (qErr) throw qErr;

      // Group by lote_id
      const byLote: Record<string, number[]> = {};

      (data ?? []).forEach((item: unknown) => {
        const r = item as RawHistoricoRow;
        // Use kg_por_arbol (generated column) when present; recompute otherwise.
        let kpA = r.kg_por_arbol != null ? Number(r.kg_por_arbol) : 0;
        if (!kpA && r.arboles_registrados > 0) {
          kpA = Number(r.kg_totales) / r.arboles_registrados;
        }
        if (kpA > 0) {
          if (!byLote[r.lote_id]) byLote[r.lote_id] = [];
          byLote[r.lote_id].push(kpA);
        }
      });

      const result = new Map<string, HistoricoStats>();

      loteIds.forEach((loteId) => {
        const vals = byLote[loteId] ?? [];
        if (vals.length === 0) {
          result.set(loteId, {
            lote_id: loteId,
            min_kg_arbol: 0,
            max_kg_arbol: 0,
            avg_kg_arbol: 0,
            escasos: true,
          });
        } else {
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          result.set(loteId, {
            lote_id: loteId,
            min_kg_arbol: min,
            max_kg_arbol: max,
            avg_kg_arbol: avg,
            escasos: vals.length < 2,
          });
        }
      });

      return result;
    } catch (err: unknown) {
      // Non-fatal: return empty map so outlier check is skipped
      console.error('Error loading historic stats:', err);
      return new Map();
    }
  }, [supabase]);

  /**
   * Build the initial grid rows from lotes + sublotes + existing cosecha data.
   *
   * Logic for row granularity:
   *  - If a lote has sublotes defined:
   *    - If existing records for this cosecha are at LOTE level for that lote
   *      → show the single lote-level row (prefilled) instead of sublote rows.
   *    - Otherwise → one row per sublote.
   *  - Lotes without sublotes → single lote-level row.
   */
  const buildGridRows = useCallback((
    lotes: LoteProduccion[],
    sublotesByLote: Record<string, SubloteProduccion[]>,
    existingMap: Map<string, RawExistingRow>
  ): GridRow[] => {
    const rows: GridRow[] = [];

    lotes.forEach((lote) => {
      const sublotes = sublotesByLote[lote.id] ?? [];
      const hasSublotes = sublotes.length > 0;

      // Check if existing data for this lote is at lote-level (sublote_id = null)
      const loteKey = `${lote.id}__null`;
      const existingLoteRecord = existingMap.get(loteKey);

      if (hasSublotes && !existingLoteRecord) {
        // Show one row per sublote
        sublotes.forEach((sublote) => {
          const subKey = `${lote.id}__${sublote.id}`;
          const existing = existingMap.get(subKey);
          rows.push({
            id: existing?.id,
            lote_id: lote.id,
            lote_nombre: lote.nombre,
            sublote_id: sublote.id,
            sublote_nombre: sublote.nombre,
            arboles: existing?.arboles_registrados ?? sublote.total_arboles ?? '',
            kg_exportacion: existing?.kg_exportacion != null ? existing.kg_exportacion : '',
            kg_nacional: existing?.kg_nacional != null ? existing.kg_nacional : '',
            kg_totales: existing?.kg_totales ?? '',
          });
        });
      } else {
        // Lote without sublotes, OR existing data is at lote-level
        rows.push({
          id: existingLoteRecord?.id,
          lote_id: lote.id,
          lote_nombre: lote.nombre,
          sublote_id: null,
          sublote_nombre: null,
          arboles: existingLoteRecord?.arboles_registrados ?? lote.total_arboles ?? '',
          kg_exportacion: existingLoteRecord?.kg_exportacion != null
            ? existingLoteRecord.kg_exportacion
            : '',
          kg_nacional: existingLoteRecord?.kg_nacional != null
            ? existingLoteRecord.kg_nacional
            : '',
          kg_totales: existingLoteRecord?.kg_totales ?? '',
        });
      }
    });

    return rows;
  }, []);

  /**
   * Detect outlier rows based on historic kg/árbol stats.
   * Returns list of flagged row indices with descriptions.
   */
  const detectOutliers = useCallback((
    rows: GridRow[],
    historicoMap: Map<string, HistoricoStats>
  ): Array<{
    rowIndex: number;
    lote_nombre: string;
    sublote_nombre: string | null;
    kg_totales: number;
    kgPorArbol: number;
    historico: HistoricoStats;
    descripcion: string;
  }> => {
    const flagged: Array<{
      rowIndex: number;
      lote_nombre: string;
      sublote_nombre: string | null;
      kg_totales: number;
      kgPorArbol: number;
      historico: HistoricoStats;
      descripcion: string;
    }> = [];

    rows.forEach((row, idx) => {
      if (!rowHasData(row)) return;

      const kpa = kgPorArbol(row);
      if (kpa === null) return;

      const stats = historicoMap.get(row.lote_id);
      const kg = Number(effectiveKgTotales(row));

      // No historic data at all — flag very extreme values only
      if (!stats || stats.escasos) {
        if (kpa > 30) {
          flagged.push({
            rowIndex: idx,
            lote_nombre: row.lote_nombre,
            sublote_nombre: row.sublote_nombre,
            kg_totales: kg,
            kgPorArbol: kpa,
            historico: stats ?? { lote_id: row.lote_id, min_kg_arbol: 0, max_kg_arbol: 0, avg_kg_arbol: 0, escasos: true },
            descripcion: `${kpa.toFixed(2)} kg/árbol (valor extremo sin histórico de referencia)`,
          });
        } else if (kpa < 0.05 && kpa > 0) {
          flagged.push({
            rowIndex: idx,
            lote_nombre: row.lote_nombre,
            sublote_nombre: row.sublote_nombre,
            kg_totales: kg,
            kgPorArbol: kpa,
            historico: stats ?? { lote_id: row.lote_id, min_kg_arbol: 0, max_kg_arbol: 0, avg_kg_arbol: 0, escasos: true },
            descripcion: `${kpa.toFixed(2)} kg/árbol (valor sospechosamente bajo sin histórico)`,
          });
        }
        return;
      }

      const { min_kg_arbol, max_kg_arbol } = stats;
      const historicoRange = max_kg_arbol - min_kg_arbol;

      // Flag if value is more than 2× the historic max
      if (max_kg_arbol > 0 && kpa > max_kg_arbol * 2) {
        const rangeStr = `histórico del lote: ${min_kg_arbol.toFixed(1)}–${max_kg_arbol.toFixed(1)} kg/árbol`;
        flagged.push({
          rowIndex: idx,
          lote_nombre: row.lote_nombre,
          sublote_nombre: row.sublote_nombre,
          kg_totales: kg,
          kgPorArbol: kpa,
          historico: stats,
          descripcion: `${kpa.toFixed(2)} kg/árbol es más del doble del máximo histórico (${rangeStr})`,
        });
        return;
      }

      // Flag if historic max < 1 and value > 5 (likely entry error: missing digit)
      if (max_kg_arbol < 1 && max_kg_arbol > 0 && kpa > 5) {
        flagged.push({
          rowIndex: idx,
          lote_nombre: row.lote_nombre,
          sublote_nombre: row.sublote_nombre,
          kg_totales: kg,
          kgPorArbol: kpa,
          historico: stats,
          descripcion: `${kpa.toFixed(2)} kg/árbol es muy alto vs histórico (máx ${max_kg_arbol.toFixed(2)} kg/árbol)`,
        });
        return;
      }

      // Flag if value is less than 40% of historic min (when min > 1)
      if (min_kg_arbol > 1 && kpa < min_kg_arbol * 0.4 && kpa > 0) {
        const rangeStr = `histórico del lote: ${min_kg_arbol.toFixed(1)}–${max_kg_arbol.toFixed(1)} kg/árbol`;
        flagged.push({
          rowIndex: idx,
          lote_nombre: row.lote_nombre,
          sublote_nombre: row.sublote_nombre,
          kg_totales: kg,
          kgPorArbol: kpa,
          historico: stats,
          descripcion: `${kpa.toFixed(2)} kg/árbol está muy por debajo del mínimo histórico (${rangeStr})`,
        });
        return;
      }

      // Deviation-based outlier: > 3× the historic range from avg (only when range > 0.5)
      if (historicoRange > 0.5 && stats.avg_kg_arbol > 0) {
        const deviation = Math.abs(kpa - stats.avg_kg_arbol);
        if (deviation > historicoRange * 3) {
          flagged.push({
            rowIndex: idx,
            lote_nombre: row.lote_nombre,
            sublote_nombre: row.sublote_nombre,
            kg_totales: kg,
            kgPorArbol: kpa,
            historico: stats,
            descripcion: `${kpa.toFixed(2)} kg/árbol se desvía mucho del promedio histórico (${stats.avg_kg_arbol.toFixed(1)} kg/árbol, rango ${min_kg_arbol.toFixed(1)}–${max_kg_arbol.toFixed(1)})`,
          });
        }
      }
    });

    return flagged;
  }, []);

  /**
   * Save grid rows:
   * - Rows with existing `id` → UPDATE
   * - New rows with data → INSERT
   * - Empty rows (no kg_totales or arboles) → skip
   *
   * Does NOT use PostgREST upsert/onConflict to avoid NULL-key constraint issues.
   * Only sends kg_exportacion/kg_nacional when they have values (graceful if
   * migration 046 has not been applied yet).
   */
  const saveRows = useCallback(async (
    rows: GridRow[],
    ano: number,
    cosecha_tipo: CosechaTipo
  ): Promise<CapturaSaveResult> => {
    setLoading(true);
    setError(null);

    const toUpdate: GridRow[] = [];
    const toInsert: GridRow[] = [];

    rows.forEach((row) => {
      if (!rowHasData(row)) return; // skip empty rows
      if (row.id) {
        toUpdate.push(row);
      } else {
        toInsert.push(row);
      }
    });

    try {
      // Process updates one by one for clear per-row error messages
      for (const row of toUpdate) {
        const kgTotales = effectiveKgTotales(row);
        // Build payload with only known columns first
        const payload: {
          kg_totales: number;
          arboles_registrados: number;
          kg_exportacion?: number;
          kg_nacional?: number;
        } = {
          kg_totales: Number(kgTotales),
          arboles_registrados: Number(row.arboles),
        };
        if (row.kg_exportacion !== '') payload.kg_exportacion = Number(row.kg_exportacion);
        if (row.kg_nacional !== '') payload.kg_nacional = Number(row.kg_nacional);

        const { error: updateErr } = await (supabase
          .from('produccion')
          .update(payload as unknown as Record<string, unknown>)
          .eq('id', row.id!) as unknown as Promise<{ error: unknown }>);

        if (updateErr) throw updateErr;
      }

      // Batch inserts
      if (toInsert.length > 0) {
        const insertPayload = toInsert.map((row) => {
          const kgTotales = effectiveKgTotales(row);
          const record: {
            lote_id: string;
            sublote_id: string | null;
            ano: number;
            cosecha_tipo: CosechaTipo;
            kg_totales: number;
            arboles_registrados: number;
            kg_exportacion?: number;
            kg_nacional?: number;
          } = {
            lote_id: row.lote_id,
            sublote_id: row.sublote_id,
            ano,
            cosecha_tipo,
            kg_totales: Number(kgTotales),
            arboles_registrados: Number(row.arboles),
          };
          if (row.kg_exportacion !== '') record.kg_exportacion = Number(row.kg_exportacion);
          if (row.kg_nacional !== '') record.kg_nacional = Number(row.kg_nacional);
          return record;
        });

        const { error: insertErr } = await (supabase
          .from('produccion')
          .insert(insertPayload as unknown as Parameters<ReturnType<typeof supabase.from>['insert']>[0]) as unknown as Promise<{ error: unknown }>);

        if (insertErr) throw insertErr;
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  return {
    loading,
    error,
    loadLotesConSublotes,
    loadExistingCosecha,
    loadHistoricoStats,
    buildGridRows,
    detectOutliers,
    saveRows,
    // Re-export pure helpers for use in the component
    effectiveKgTotales,
    kgPorArbol,
    rowHasData,
  };
}
