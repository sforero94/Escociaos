/**
 * ESCO-139 — prorrateo del gasto general por árbol-día.
 *
 * Antes: `asignarOverheadPorArboles` repartía el gasto general del AÑO entero por
 * `total_arboles` ACTUAL, y `useCostoKg` sólo leía lotes `activo = true`. Así un
 * lote erradicado en mayo cargaba gasto general de junio a diciembre, y un lote
 * ya marcado inactivo no cargaba nada ni de los meses en que sí existió.
 *
 * Ahora: peso = árboles × días activos del lote dentro del período.
 *   - fecha_erradicacion dentro del período → días hasta esa fecha (excluida)
 *   - fecha_erradicacion antes del período  → 0
 *   - activo = false sin fecha              → 0
 *   - activo sin fecha                      → período completo
 *
 * Los lotes del fixture son las 9 filas reales de `lotes` (ids, nombres y
 * `total_arboles` leídos en solo lectura el 2026-10-16). Las fechas de
 * erradicación son HIPOTÉTICAS: la columna todavía no existe en producción
 * (migración 181) y las fechas reales las confirma Santiago (migración 182).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/supabase/client', () => ({ getSupabase: vi.fn() }));

import {
  diasActivosLoteEnPeriodo,
  asignarOverheadPorArbolDia,
  calcularCostoKgAnual,
  periodoDelAno,
} from '@/utils/calculosCostoKg';
import { cargarLotesCosto } from '@/components/produccion/hooks/useCostoKg';
import type { LoteInfoCosto } from '@/types/produccion';

const P2026 = { inicio: '2026-01-01', fin: '2026-12-31' };

function lote(o: Partial<LoteInfoCosto> & { id: string }): LoteInfoCosto {
  return { nombre: o.id, total_arboles: 1000, activo: true, fecha_erradicacion: null, ...o };
}

// Filas reales de `lotes` (2026-10-16), sin fecha de erradicación (estado de hoy).
const LOTES_PROD: LoteInfoCosto[] = [
  { id: 'fffc5477-fe42-4660-8fd8-301f8d1a312b', nombre: '1. Piedra Paula', total_arboles: 1550, activo: true, fecha_erradicacion: null },
  { id: 'c3e1cf4f-5168-434e-b1f8-b630479c766e', nombre: '2. Salto de Tequendama', total_arboles: 1407, activo: true, fecha_erradicacion: null },
  { id: '5588e8c8-7519-472e-a78c-47b56216c24c', nombre: '3. Australia', total_arboles: 1584, activo: true, fecha_erradicacion: null },
  { id: 'ee810553-4108-4a6e-8494-63491954d59b', nombre: '4. La Vega', total_arboles: 1806, activo: true, fecha_erradicacion: null },
  { id: 'fa5864d0-85a7-4b6e-b222-c71417f5a6ee', nombre: '5. Pedregal', total_arboles: 0, activo: false, fecha_erradicacion: null },
  { id: 'ccdd4075-6a24-4d19-b345-e21a47e6a81e', nombre: '6. La Unión', total_arboles: 0, activo: false, fecha_erradicacion: null },
  { id: 'c1ce4ce0-76a7-4d8f-a320-36c7395613df', nombre: '8. Irlanda', total_arboles: 1206, activo: true, fecha_erradicacion: null },
  { id: '95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', nombre: '9. Acueducto', total_arboles: 3184, activo: true, fecha_erradicacion: null },
  { id: '21da24a0-a420-4446-9b91-a59e234eb603', nombre: '10. Santa Rosa', total_arboles: 7, activo: true, fecha_erradicacion: null },
];

const IRLANDA = 'c1ce4ce0-76a7-4d8f-a320-36c7395613df';
const ACUEDUCTO = '95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6';
const SANTA_ROSA = '21da24a0-a420-4446-9b91-a59e234eb603';
const PEDREGAL = 'fa5864d0-85a7-4b6e-b222-c71417f5a6ee';
const PIEDRA_PAULA = 'fffc5477-fe42-4660-8fd8-301f8d1a312b';

/** Escenario post-182 con fechas HIPOTÉTICAS: 8/9/10 erradicados el 2026-05-01. */
function lotesErradicados(): LoteInfoCosto[] {
  return LOTES_PROD.map((l) =>
    [IRLANDA, ACUEDUCTO, SANTA_ROSA].includes(l.id)
      ? { ...l, activo: false, fecha_erradicacion: '2026-05-01' }
      : l.id === PEDREGAL
        ? { ...l, fecha_erradicacion: '2026-02-15' }
        : l,
  );
}

function suma(m: Map<string, number>): number {
  return Array.from(m.values()).reduce((s, v) => s + v, 0);
}

// ---------------------------------------------------------------------------
// Los cuatro casos de la regla
// ---------------------------------------------------------------------------

describe('diasActivosLoteEnPeriodo', () => {
  it('activo sin fecha → período completo', () => {
    expect(diasActivosLoteEnPeriodo(lote({ id: 'a' }), P2026)).toBe(365);
  });

  it('fecha_erradicacion dentro del período → días hasta esa fecha (excluida)', () => {
    // ene 31 + feb 28 + mar 31 + abr 30 = 120 días antes del 1 de mayo
    expect(
      diasActivosLoteEnPeriodo(lote({ id: 'a', fecha_erradicacion: '2026-05-01' }), P2026),
    ).toBe(120);
  });

  it('fecha_erradicacion antes del período → 0', () => {
    expect(
      diasActivosLoteEnPeriodo(lote({ id: 'a', fecha_erradicacion: '2025-11-01' }), P2026),
    ).toBe(0);
  });

  it('activo = false sin fecha → 0', () => {
    expect(diasActivosLoteEnPeriodo(lote({ id: 'a', activo: false }), P2026)).toBe(0);
  });

  it('la fecha decide aunque activo = false: erradicado en 2026 sí cuenta en 2025', () => {
    const l = lote({ id: 'a', activo: false, fecha_erradicacion: '2026-05-01' });
    expect(diasActivosLoteEnPeriodo(l, { inicio: '2025-01-01', fin: '2025-12-31' })).toBe(365);
    expect(diasActivosLoteEnPeriodo(l, P2026)).toBe(120);
    expect(diasActivosLoteEnPeriodo(l, { inicio: '2027-01-01', fin: '2027-12-31' })).toBe(0);
  });

  it('erradicado el primer día del período → 0 días', () => {
    expect(
      diasActivosLoteEnPeriodo(lote({ id: 'a', fecha_erradicacion: '2026-01-01' }), P2026),
    ).toBe(0);
  });

  it('año bisiesto → 366', () => {
    expect(
      diasActivosLoteEnPeriodo(lote({ id: 'a' }), { inicio: '2028-01-01', fin: '2028-12-31' }),
    ).toBe(366);
  });

  it('lote sin campos activo/fecha (lectura degradada) → período completo', () => {
    expect(
      diasActivosLoteEnPeriodo({ id: 'a', nombre: 'a', total_arboles: 10 }, P2026),
    ).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// Asignación por árbol-día
// ---------------------------------------------------------------------------

describe('asignarOverheadPorArbolDia', () => {
  it('erradicación a mitad de año: el lote carga sólo sus días', () => {
    const lotes = [
      lote({ id: 'vivo', total_arboles: 1000 }),
      lote({ id: 'erradicado', total_arboles: 1000, fecha_erradicacion: '2026-07-02' }),
    ];
    // 2026-07-02 → 182 días antes (ene–jun = 181, +1 de julio)
    const m = asignarOverheadPorArbolDia(lotes, 547_000_000, P2026);
    // pesos 1000×365 y 1000×182 → 365/547 y 182/547
    expect(m.get('vivo')).toBeCloseTo(365_000_000);
    expect(m.get('erradicado')).toBeCloseTo(182_000_000);
  });

  it('la suma asignada es igual al gasto general del período (no se pierde ni se crea dinero)', () => {
    const m = asignarOverheadPorArbolDia(lotesErradicados(), 1_234_567_890, P2026);
    expect(suma(m)).toBeCloseTo(1_234_567_890, 2);
  });

  it('la suma se conserva aunque un lote tenga 0 árboles, y ese lote recibe 0', () => {
    const lotes = [
      lote({ id: 'cero', total_arboles: 0 }),
      lote({ id: 'cero-erradicado', total_arboles: 0, fecha_erradicacion: '2026-03-01' }),
      lote({ id: 'b', total_arboles: 700 }),
    ];
    const m = asignarOverheadPorArbolDia(lotes, 9_000_000, P2026);
    expect(m.get('cero')).toBe(0);
    expect(m.get('cero-erradicado')).toBe(0);
    expect(m.get('b')).toBeCloseTo(9_000_000);
    expect(suma(m)).toBeCloseTo(9_000_000);
  });

  it('todo lote sin peso → todos 0 (igual que la regla anterior)', () => {
    const m = asignarOverheadPorArbolDia(
      [lote({ id: 'a', activo: false }), lote({ id: 'b', total_arboles: 0 })],
      5_000_000,
      P2026,
    );
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(0);
  });

  it('sin fechas (lectura degradada, solo activos) reproduce la regla anterior', () => {
    const activos = LOTES_PROD.filter((l) => l.activo).map((l) => ({
      id: l.id,
      nombre: l.nombre,
      total_arboles: l.total_arboles,
    }));
    const m = asignarOverheadPorArbolDia(activos, 10_744_000, P2026);
    // Σ árboles activos = 10.744 → 1.000 por árbol
    expect(m.get(PIEDRA_PAULA)).toBeCloseTo(1_550_000);
    expect(m.get(ACUEDUCTO)).toBeCloseTo(3_184_000);
  });

  it('producción 2026 con 8/9/10 erradicados el 1-may: pierden la mayor parte del gasto general', () => {
    const m = asignarOverheadPorArbolDia(lotesErradicados(), 100_000_000, P2026);
    const erradicados = (m.get(IRLANDA) ?? 0) + (m.get(ACUEDUCTO) ?? 0) + (m.get(SANTA_ROSA) ?? 0);
    // Antes: 4.397 / 10.744 ≈ 40,9 %. Con 120 de 365 días: 4.397×120 / (6.347×365 + 4.397×120) ≈ 18,5 %.
    expect(erradicados / 100_000_000).toBeCloseTo(
      (4397 * 120) / (6347 * 365 + 4397 * 120),
      6,
    );
    expect(m.get(PEDREGAL)).toBe(0); // 0 árboles: límite documentado, no se inventa un conteo
  });
});

// ---------------------------------------------------------------------------
// Integración con el orquestador
// ---------------------------------------------------------------------------

describe('calcularCostoKgAnual — prorrateo por árbol-día (ESCO-139)', () => {
  it('2026: un lote erradicado a mitad de año recibe gasto general sólo por sus días', () => {
    const lotes = [
      lote({ id: 'vivo', total_arboles: 1000 }),
      lote({ id: 'erradicado', total_arboles: 1000, activo: false, fecha_erradicacion: '2026-07-02' }),
    ];
    const { costosLote, overheadFarm } = calcularCostoKgAnual(
      2026,
      lotes,
      [],
      [],
      [{ valor: 547_000_000, categoria_nombre: 'Transporte' }],
      new Map(),
    );
    const vivo = costosLote.find((c) => c.lote_id === 'vivo');
    const err = costosLote.find((c) => c.lote_id === 'erradicado');
    expect(vivo?.overhead_asignado).toBe(365_000_000);
    expect(err?.overhead_asignado).toBe(182_000_000);
    expect((vivo?.overhead_asignado ?? 0) + (err?.overhead_asignado ?? 0)).toBe(overheadFarm.total);
  });

  it('un lote inactivo que entra a la lista conserva su costo directo del año', () => {
    const lotes = [
      lote({ id: 'vivo' }),
      lote({ id: 'pedregal', total_arboles: 0, activo: false, fecha_erradicacion: '2026-02-15' }),
    ];
    const { costosLote } = calcularCostoKgAnual(
      2026,
      lotes,
      [{ lote_id: 'pedregal', costo_labor: 300_000, jornales: 3 }],
      [],
      [{ valor: 1_000_000, categoria_nombre: 'Transporte' }],
      new Map(),
    );
    const p = costosLote.find((c) => c.lote_id === 'pedregal');
    expect(p?.costo_labor).toBe(300_000);
    expect(p?.overhead_asignado).toBe(0);
  });
});

describe('periodoDelAno', () => {
  it('devuelve el año calendario completo', () => {
    expect(periodoDelAno(2026)).toEqual(P2026);
  });
});

// ---------------------------------------------------------------------------
// Lectura de lotes: degradación mientras la migración 181 no esté aplicada
// ---------------------------------------------------------------------------

interface Llamada {
  select: string;
  eqs: [string, unknown][];
}

/** Cliente falso: devuelve una respuesta por llamada, en orden, y registra la forma de cada consulta. */
function clienteFalso(respuestas: { data: unknown; error: unknown }[]) {
  const llamadas: Llamada[] = [];
  let i = 0;
  const cliente = {
    from: (tabla: string) => {
      expect(tabla).toBe('lotes');
      const llamada: Llamada = { select: '', eqs: [] };
      llamadas.push(llamada);
      const q = {
        select: (cols: string) => {
          llamada.select = cols;
          return q;
        },
        eq: (col: string, v: unknown) => {
          llamada.eqs.push([col, v]);
          return q;
        },
        order: () => Promise.resolve(respuestas[i++]),
      };
      return q;
    },
  };
  return { cliente, llamadas };
}

describe('cargarLotesCosto', () => {
  it('con la columna presente: trae fecha_erradicacion y NO filtra por activo', async () => {
    const { cliente, llamadas } = clienteFalso([
      {
        data: [
          { id: 'a', nombre: 'A', total_arboles: 100, activo: true, fecha_erradicacion: null },
          { id: 'b', nombre: 'B', total_arboles: null, activo: false, fecha_erradicacion: '2026-05-01' },
        ],
        error: null,
      },
    ]);
    const lotes = await cargarLotesCosto(cliente as never);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].select).toContain('fecha_erradicacion');
    expect(llamadas[0].eqs).toEqual([]);
    expect(lotes).toEqual([
      { id: 'a', nombre: 'A', total_arboles: 100, activo: true, fecha_erradicacion: null },
      { id: 'b', nombre: 'B', total_arboles: 0, activo: false, fecha_erradicacion: '2026-05-01' },
    ]);
  });

  it.each(['42703', 'PGRST204'])(
    'columna inexistente (%s): reintenta con la regla de hoy (activo = true, período completo)',
    async (code) => {
      const { cliente, llamadas } = clienteFalso([
        { data: null, error: { code, message: 'column lotes.fecha_erradicacion does not exist' } },
        { data: [{ id: 'a', nombre: 'A', total_arboles: 100 }], error: null },
      ]);
      const lotes = await cargarLotesCosto(cliente as never);
      expect(llamadas).toHaveLength(2);
      expect(llamadas[1].select).not.toContain('fecha_erradicacion');
      expect(llamadas[1].eqs).toEqual([['activo', true]]);
      expect(lotes).toEqual([
        { id: 'a', nombre: 'A', total_arboles: 100, activo: true, fecha_erradicacion: null },
      ]);
      expect(diasActivosLoteEnPeriodo(lotes[0], P2026)).toBe(365);
    },
  );

  it('cualquier otro error no se degrada: se propaga', async () => {
    const { cliente, llamadas } = clienteFalso([
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ]);
    await expect(cargarLotesCosto(cliente as never)).rejects.toThrow(/Lotes: permission denied/);
    expect(llamadas).toHaveLength(1);
  });

  it('si el reintento degradado también falla, se propaga', async () => {
    const { cliente } = clienteFalso([
      { data: null, error: { code: '42703', message: 'no column' } },
      { data: null, error: { code: '500', message: 'boom' } },
    ]);
    await expect(cargarLotesCosto(cliente as never)).rejects.toThrow(/Lotes: boom/);
  });
});
