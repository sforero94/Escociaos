import { useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type {
  Presupuesto,
  PresupuestoRow,
  PresupuestoCategoriaRow,
  PresupuestoData,
} from '@/types/finanzas';

// ── Quarter helpers (exported for testing) ─────────────────────

const QUARTER_MONTHS: Record<number, [number, number, number, number]> = {
  1: [1, 1, 3, 31],
  2: [4, 1, 6, 30],
  3: [7, 1, 9, 30],
  4: [10, 1, 12, 31],
};

export function getQuarterRange(anio: number, q: number): { desde: string; hasta: string } {
  const [startM, startD, endM, endD] = QUARTER_MONTHS[q];
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    desde: `${anio}-${pad(startM)}-${pad(startD)}`,
    hasta: `${anio}-${pad(endM)}-${pad(endD)}`,
  };
}

// ── Pure data builder (exported for testing) ───────────────────

interface RawBudget {
  id: string;
  concepto_id: string;
  categoria_id: string;
  monto_anual: number;
  is_principal: boolean;
  fin_categorias_gastos: { nombre: string };
  fin_conceptos_gastos: { nombre: string };
}

interface ActualAggregate {
  concepto_id: string;
  categoria_id: string;
  total: number;
}

interface ConceptoCatalogEntry {
  id: string;
  categoria_id: string;
  nombre: string;
  fin_categorias_gastos: { nombre: string };
}

function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export function buildPresupuestoData(
  budgets: RawBudget[],
  actualsQ: ActualAggregate[],
  actualsQAnterior: ActualAggregate[],
  actualsAnioAnterior: ActualAggregate[],
  conceptoCatalog: ConceptoCatalogEntry[],
): PresupuestoData {
  // Build maps for fast lookup
  const actualQMap = new Map(actualsQ.map((a) => [a.concepto_id, a.total]));
  const actualQAntMap = new Map(actualsQAnterior.map((a) => [a.concepto_id, a.total]));
  const actualAnioAntMap = new Map(actualsAnioAnterior.map((a) => [a.concepto_id, a.total]));

  // Map concepto_id → PresupuestoRow
  const rowMap = new Map<string, PresupuestoRow>();

  // 1. Budgeted conceptos
  for (const b of budgets) {
    const trimestral = b.monto_anual / 4;
    const aq = actualQMap.get(b.concepto_id) ?? 0;
    const aqAnt = actualQAntMap.get(b.concepto_id) ?? 0;
    const aAnioAnt = actualAnioAntMap.get(b.concepto_id) ?? 0;

    rowMap.set(b.concepto_id, {
      categoria_id: b.categoria_id,
      categoria_nombre: b.fin_categorias_gastos.nombre,
      concepto_id: b.concepto_id,
      concepto_nombre: b.fin_conceptos_gastos.nombre,
      is_principal: b.is_principal,
      presupuesto_id: b.id,
      monto_anual: b.monto_anual,
      monto_trimestral: trimestral,
      pct_presupuesto: 0, // computed after totals
      actual_q: aq,
      pct_actual: 0, // computed after totals
      ejecucion_vs_q: trimestral > 0 ? Math.round((aq / trimestral) * 100) : null,
      ejecucion_vs_anio: b.monto_anual > 0 ? Math.round((aq / b.monto_anual) * 100) : null,
      actual_q_anterior: aqAnt,
      variacion_yoy: variacion(aq, aqAnt),
      actual_anio_anterior: aAnioAnt,
    });
  }

  // 2. Unbudgeted conceptos with actuals
  const allActualConceptos = new Set([
    ...actualsQ.map((a) => a.concepto_id),
    ...actualsQAnterior.map((a) => a.concepto_id),
    ...actualsAnioAnterior.map((a) => a.concepto_id),
  ]);

  for (const conceptoId of allActualConceptos) {
    if (rowMap.has(conceptoId)) continue;

    // Look up concepto in catalog
    const catalogEntry = conceptoCatalog.find((c) => c.id === conceptoId);
    if (!catalogEntry) continue;

    // Also check actuals for categoria_id
    const actualEntry =
      actualsQ.find((a) => a.concepto_id === conceptoId) ??
      actualsQAnterior.find((a) => a.concepto_id === conceptoId) ??
      actualsAnioAnterior.find((a) => a.concepto_id === conceptoId);

    const catId = catalogEntry.categoria_id ?? actualEntry?.categoria_id ?? '';
    const aq = actualQMap.get(conceptoId) ?? 0;
    const aqAnt = actualQAntMap.get(conceptoId) ?? 0;
    const aAnioAnt = actualAnioAntMap.get(conceptoId) ?? 0;

    rowMap.set(conceptoId, {
      categoria_id: catId,
      categoria_nombre: catalogEntry.fin_categorias_gastos.nombre,
      concepto_id: conceptoId,
      concepto_nombre: catalogEntry.nombre,
      is_principal: false,
      monto_anual: 0,
      monto_trimestral: 0,
      pct_presupuesto: 0,
      actual_q: aq,
      pct_actual: 0,
      ejecucion_vs_q: null,
      ejecucion_vs_anio: null,
      actual_q_anterior: aqAnt,
      variacion_yoy: variacion(aq, aqAnt),
      actual_anio_anterior: aAnioAnt,
    });
  }

  // 3. Compute grand totals
  const allRows = Array.from(rowMap.values());
  const totalBudget = allRows.reduce((s, r) => s + r.monto_anual, 0);
  const totalActual = allRows.reduce((s, r) => s + r.actual_q, 0);

  // 4. Compute percentages
  for (const r of allRows) {
    r.pct_presupuesto = totalBudget > 0 ? (r.monto_anual / totalBudget) * 100 : 0;
    r.pct_actual = totalActual > 0 ? (r.actual_q / totalActual) * 100 : 0;
  }

  // 5. Group by categoria
  const catMap = new Map<string, PresupuestoRow[]>();
  for (const r of allRows) {
    const key = r.categoria_id;
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key)!.push(r);
  }

  const categorias: PresupuestoCategoriaRow[] = [];
  for (const [catId, conceptos] of catMap) {
    // Sort: principal first, then alphabetically
    conceptos.sort((a, b) => {
      if (a.is_principal !== b.is_principal) return a.is_principal ? -1 : 1;
      return a.concepto_nombre.localeCompare(b.concepto_nombre);
    });

    const catAnual = conceptos.reduce((s, r) => s + r.monto_anual, 0);
    const catTrimestral = conceptos.reduce((s, r) => s + r.monto_trimestral, 0);
    const catActualQ = conceptos.reduce((s, r) => s + r.actual_q, 0);
    const catActualQAnt = conceptos.reduce((s, r) => s + r.actual_q_anterior, 0);
    const catActualAnioAnt = conceptos.reduce((s, r) => s + r.actual_anio_anterior, 0);

    categorias.push({
      categoria_id: catId,
      categoria_nombre: conceptos[0].categoria_nombre,
      conceptos,
      monto_anual: catAnual,
      monto_trimestral: catTrimestral,
      actual_q: catActualQ,
      pct_presupuesto: totalBudget > 0 ? (catAnual / totalBudget) * 100 : 0,
      pct_actual: totalActual > 0 ? (catActualQ / totalActual) * 100 : 0,
      ejecucion_vs_q: catTrimestral > 0 ? Math.round((catActualQ / catTrimestral) * 100) : null,
      ejecucion_vs_anio: catAnual > 0 ? Math.round((catActualQ / catAnual) * 100) : null,
      actual_q_anterior: catActualQAnt,
      variacion_yoy: variacion(catActualQ, catActualQAnt),
      actual_anio_anterior: catActualAnioAnt,
    });
  }

  // Sort categories alphabetically
  categorias.sort((a, b) => a.categoria_nombre.localeCompare(b.categoria_nombre));

  // Grand totals
  const totalTrimestral = totalBudget / 4;
  const totalActualQAnt = allRows.reduce((s, r) => s + r.actual_q_anterior, 0);
  const totalActualAnioAnt = allRows.reduce((s, r) => s + r.actual_anio_anterior, 0);

  return {
    categorias,
    totals: {
      monto_anual: totalBudget,
      monto_trimestral: totalTrimestral,
      actual_q: totalActual,
      ejecucion_vs_q: totalTrimestral > 0 ? Math.round((totalActual / totalTrimestral) * 100) : null,
      ejecucion_vs_anio: totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : null,
      actual_q_anterior: totalActualQAnt,
      variacion_yoy: variacion(totalActual, totalActualQAnt),
      actual_anio_anterior: totalActualAnioAnt,
    },
  };
}

// ── Supabase data fetcher ──────────────────────────────────────

async function aggregateGastos(
  negocioId: string,
  desde: string,
  hasta: string,
): Promise<ActualAggregate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('fin_gastos')
    .select('concepto_id, categoria_id, valor')
    .eq('negocio_id', negocioId)
    .eq('estado', 'Confirmado')
    .gte('fecha', desde)
    .lte('fecha', hasta);

  if (error || !data) return [];

  // Aggregate by concepto
  const map = new Map<string, ActualAggregate>();
  for (const row of data as Array<{ concepto_id: string; categoria_id: string; valor: number }>) {
    const existing = map.get(row.concepto_id);
    if (existing) {
      existing.total += Number(row.valor);
    } else {
      map.set(row.concepto_id, {
        concepto_id: row.concepto_id,
        categoria_id: row.categoria_id,
        total: Number(row.valor),
      });
    }
  }
  return Array.from(map.values());
}

// ── Main hook ──────────────────────────────────────────────────

export function usePresupuestoData() {
  const [loading, setLoading] = useState(false);

  async function fetchPresupuesto(
    anio: number,
    trimestre: number,
    negocioId: string,
  ): Promise<PresupuestoData> {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const qRange = getQuarterRange(anio, trimestre);
      const qAntRange = getQuarterRange(anio - 1, trimestre);
      const anioAntRange = { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` };

      // Parallel queries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fin_presupuestos not yet in generated DB types
      const sb = supabase as any;
      const [budgetsRes, actualsQ, actualsQAnt, actualsAnioAnt, conceptosRes] = await Promise.all([
        sb
          .from('fin_presupuestos')
          .select('id, concepto_id, categoria_id, monto_anual, is_principal, fin_categorias_gastos(nombre), fin_conceptos_gastos(nombre)')
          .eq('anio', anio)
          .eq('negocio_id', negocioId),
        aggregateGastos(negocioId, qRange.desde, qRange.hasta),
        aggregateGastos(negocioId, qAntRange.desde, qAntRange.hasta),
        aggregateGastos(negocioId, anioAntRange.desde, anioAntRange.hasta),
        supabase
          .from('fin_conceptos_gastos')
          .select('id, categoria_id, nombre, fin_categorias_gastos(nombre)')
          .eq('activo', true),
      ]);

      const budgets = (budgetsRes.data ?? []) as unknown as RawBudget[];
      const conceptoCatalog = (conceptosRes.data ?? []) as unknown as ConceptoCatalogEntry[];

      return buildPresupuestoData(budgets, actualsQ, actualsQAnt, actualsAnioAnt, conceptoCatalog);
    } finally {
      setLoading(false);
    }
  }

  async function upsertPresupuesto(data: {
    anio: number;
    negocio_id: string;
    categoria_id: string;
    concepto_id: string;
    monto_anual: number;
    is_principal?: boolean;
  }): Promise<Presupuesto | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fin_presupuestos not yet in generated DB types
    const supabase = getSupabase() as any;
    const { data: result, error } = await supabase
      .from('fin_presupuestos')
      .upsert(
        {
          anio: data.anio,
          negocio_id: data.negocio_id,
          categoria_id: data.categoria_id,
          concepto_id: data.concepto_id,
          monto_anual: data.monto_anual,
          is_principal: data.is_principal ?? false,
        },
        { onConflict: 'anio,negocio_id,concepto_id' },
      )
      .select();

    if (error) {
      console.error('Error upserting presupuesto:', error);
      return null;
    }
    return (result as unknown as Presupuesto[])?.[0] ?? null;
  }

  return { loading, fetchPresupuesto, upsertPresupuesto };
}
