import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guarda del tope de 1.000 filas en el tablero de Finanzas
 * (`src/components/finanzas/hooks/useDashboardData.ts`).
 *
 * **El defecto.** `getGastosPorTrimestreMultiSerie` pedía DOS AÑOS de
 * `fin_gastos` con `.select(...)` a secas: sin `.range()`, sin `fetchAll`,
 * sin `.limit()`. PostgREST corta en 1.000 filas y NO avisa. Verificado
 * contra producción el 2026-08-20:
 *
 *   filas reales 2025-01-01 → 2026-12-31 (Confirmado): 1.760
 *   suma real:                                          $3.264.382.075,87
 *   suma entregada con el tope:                         $1.828.104.228,00
 *   faltante:                                           $1.436.277.847,87 (44,0%)
 *
 * Y como la consulta tampoco pedía un orden, el corte lo decidía el orden
 * físico del heap: las filas perdidas se repartían entre 2025 y 2026 sin
 * dejar ningún hueco visible, y podían cambiar entre una carga y otra. La
 * gráfica se veía perfectamente normal y estaba mal en $1.444M.
 *
 * El mismo defecto tenía `sumGastos`, que alimenta los KPIs: un año completo
 * ya pasa del tope (1.356 filas en 2024, 1.156 en 2025), así que "Total 2024"
 * y "Total 2025" salían cortos.
 *
 * **Por qué esta prueba no se limita a comprobar que se llama a `fetchAll`.**
 * Esa aserción demuestra que la implementación cambió, no que el error
 * existía ni que quedó corregido. Los casos de abajo montan un backend que
 * se comporta como PostgREST — nunca devuelve más de 1.000 filas por
 * llamada, respeta `.range()` — y verifican la CIFRA.
 */

const HOOK = resolve(__dirname, '../components/finanzas/hooks/useDashboardData.ts');
const fuente = readFileSync(HOOK, 'utf-8');

// --- Cifras reales de producción (2026-08-20), usadas como fixture ---
const FILAS_2A = 1760;
const TOTAL_2A = 3264382075.87;
const TOTAL_CON_TOPE = 1828104228;
const FILAS_2025 = 1156;
const TOTAL_2025 = 2071350517;

const TOPE_POSTGREST = 1000;

interface Fila {
  id: string;
  fecha: string;
  valor: number;
  negocio_id: string;
  fin_negocios: { nombre: string };
  estado: string;
}

/**
 * Reparte `total` entre `n` filas repartidas por los cuatro trimestres de
 * cada año, de forma que la suma dé exactamente `total`.
 */
function generarGastos(n: number, total: number, anios: number[]): Fila[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => {
    const anio = anios[i % anios.length];
    const mes = String((i % 12) + 1).padStart(2, '0');
    const dia = String((i % 28) + 1).padStart(2, '0');
    return {
      id: `g-${String(i).padStart(6, '0')}`,
      fecha: `${anio}-${mes}-${dia}`,
      valor: (base + (i < resto ? 1 : 0)) / 100,
      negocio_id: 'neg-1',
      fin_negocios: { nombre: 'Aguacate Hass' },
      estado: 'Confirmado',
    };
  });
}

/**
 * Backend falso con el comportamiento exacto que produjo el error: si el
 * llamante no pide `.range(...)`, devuelve las primeras 1.000 filas y calla.
 */
function crearSupabaseFalso(filas: Fila[]) {
  const llamadas: { rango: [number, number] | null; orden: string[] }[] = [];

  function builder(fuenteFilas: Fila[]) {
    let datos = fuenteFilas;
    let rango: [number, number] | null = null;
    const orden: string[] = [];

    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        datos = datos.filter((f) => (f as any)[col] === val);
        return api;
      },
      in: () => api,
      not: () => api,
      gte: (col: string, val: string) => {
        datos = datos.filter((f) => (f as any)[col] >= val);
        return api;
      },
      lte: (col: string, val: string) => {
        datos = datos.filter((f) => (f as any)[col] <= val);
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orden.push(`${col}:${opts?.ascending === false ? 'desc' : 'asc'}`);
        return api;
      },
      range: (desde: number, hasta: number) => {
        rango = [desde, hasta];
        return api;
      },
      then: (resolver: (r: { data: Fila[] | null; error: null }) => unknown) => {
        // Orden total, igual que en Postgres con ORDER BY fecha, id.
        const ordenadas = [...datos].sort((a, b) => {
          const desc = orden[0]?.endsWith(':desc');
          const cmp = a.fecha === b.fecha ? a.id.localeCompare(b.id) : a.fecha < b.fecha ? -1 : 1;
          return desc ? -cmp : cmp;
        });
        llamadas.push({ rango, orden: [...orden] });
        const desde = rango ? rango[0] : 0;
        const hastaPedido = rango ? rango[1] - rango[0] + 1 : Infinity;
        const cuantas = Math.min(hastaPedido, TOPE_POSTGREST);
        return Promise.resolve(resolver({ data: ordenadas.slice(desde, desde + cuantas), error: null }));
      },
    };
    return api;
  }

  return {
    cliente: { from: (_tabla: string) => builder(filas) },
    llamadas,
  };
}

const filasMock = vi.fn<() => Fila[]>(() => []);

vi.mock('@/utils/supabase/client', () => ({
  getSupabase: () => crearSupabaseFalso(filasMock()).cliente,
}));

const { useDashboardData } = await import('@/components/finanzas/hooks/useDashboardData');

/**
 * `useDashboardData` usa `useState`, así que hay que montarlo. Mismo
 * precedente que `climaCardFranja.test.tsx`: SSR con `renderToStaticMarkup`
 * para capturar la API del hook, sin añadir dependencias de testing.
 */
function apiDelHook() {
  let api: ReturnType<typeof useDashboardData> | null = null;
  function Sonda() {
    api = useDashboardData();
    return null;
  }
  renderToStaticMarkup(React.createElement(Sonda));
  return api!;
}

function sumarSeries(data: Record<string, number | string>[]): number {
  return data.reduce((total, fila) => {
    return (
      total +
      Object.entries(fila).reduce(
        (s, [k, v]) => (k === 'trimestre' ? s : s + (typeof v === 'number' ? v : 0)),
        0,
      )
    );
  }, 0);
}

describe('useDashboardData — tope de 1.000 filas de PostgREST', () => {
  beforeEach(() => {
    vi.useRealTimers();
    filasMock.mockReset();
  });

  // ---------------------------------------------------------------- comporta.
  it('la gráfica de gastos por trimestre suma los $3.264M reales, no los $1.828M que entrega el tope', async () => {
    // El hook consulta `${año-1}-01-01` .. `${año}-12-31`. Fijamos el reloj
    // en 2026 para reproducir exactamente la ventana de dos años del defecto.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00-05:00'));

    const filas = generarGastos(FILAS_2A, TOTAL_2A, [2025, 2026]);
    filasMock.mockReturnValue(filas);

    const { getGastosPorTrimestreMultiSerie } = apiDelHook();
    const { data } = await getGastosPorTrimestreMultiSerie({} as any);
    vi.useRealTimers();

    const total = sumarSeries(data as Record<string, number | string>[]);

    expect(total).toBeCloseTo(TOTAL_2A, 2);
    // La cifra que veía Gerencia. Si vuelve a aparecer, el tope volvió.
    expect(total).not.toBeCloseTo(TOTAL_CON_TOPE, 2);
    expect(TOTAL_2A - TOTAL_CON_TOPE).toBeGreaterThan(1_400_000_000);
  });

  it('sin paginar, ese mismo backend entrega exactamente 1.000 filas — el defecto es real, no hipotético', async () => {
    const filas = generarGastos(FILAS_2A, TOTAL_2A, [2025, 2026]);
    const { cliente } = crearSupabaseFalso(filas);
    // La consulta tal cual estaba antes del arreglo: sin `.range()`.
    const { data } = await (cliente
      .from('fin_gastos')
      .select('fecha, valor')
      .eq('estado', 'Confirmado')
      .gte('fecha', '2025-01-01')
      .lte('fecha', '2026-12-31') as any);
    expect(data).toHaveLength(TOPE_POSTGREST);
    expect(filas).toHaveLength(FILAS_2A);
  });

  it('los KPIs de gastos suman el año completo (1.156 filas de 2025), no las primeras 1.000', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00-05:00'));

    const filas = generarGastos(FILAS_2025, TOTAL_2025, [2025]);
    filasMock.mockReturnValue(filas);

    const { getKPIsGastosGeneral } = apiDelHook();
    const kpis = await getKPIsGastosGeneral({} as any);
    vi.useRealTimers();

    // `totalAnterior` = Total 2025 completo.
    expect(kpis.totalAnterior.valor).toBeCloseTo(TOTAL_2025, 2);
  });

  it('no duplica ni pierde filas al cruzar la frontera de página', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00-05:00'));

    // 2.500 filas de $1 cada una: cualquier duplicado o salto en el borde de
    // las páginas 1.000 / 2.000 se ve en el total al peso.
    const filas = generarGastos(2500, 2500, [2025, 2026]);
    filasMock.mockReturnValue(filas);

    const { getGastosPorTrimestreMultiSerie } = apiDelHook();
    const { data } = await getGastosPorTrimestreMultiSerie({} as any);
    vi.useRealTimers();

    expect(sumarSeries(data as Record<string, number | string>[])).toBeCloseTo(2500, 2);
  });

  // ---------------------------------------------------------------- estático.
  it('ninguna lectura de fin_gastos/fin_ingresos queda sin paginar', () => {
    expect(fuente).toContain("import { fetchAll } from '@/utils/supabase/fetchAll';");

    // Cada `.from('fin_gastos'|'fin_ingresos')` tiene que estar dentro de un
    // callback de `fetchAll` y terminar en `.range(rangoDesde, rangoHasta)`.
    const lecturas = [...fuente.matchAll(/\.from\('fin_(?:gastos|ingresos)'\)/g)];
    expect(lecturas.length).toBeGreaterThanOrEqual(12);
    for (const lectura of lecturas) {
      const i = lectura.index!;
      const antes = fuente.slice(Math.max(0, i - 600), i);
      const despues = fuente.slice(i, i + 1200);
      expect(antes, `sin fetchAll: ...${despues.slice(0, 80)}`).toContain('fetchAll<');
      expect(despues, `sin range: ...${despues.slice(0, 80)}`).toContain('.range(rangoDesde, rangoHasta)');
    }
  });

  it('toda consulta paginada lleva orden total (fecha + id), porque range() es un OFFSET', () => {
    // Un OFFSET sobre un resultado sin orden total no es reproducible entre
    // páginas: dos filas con la misma `fecha` pueden salir en distinto orden
    // en la página 1 y en la 2, y entonces una se duplica y otra se pierde.
    expect(fuente).toMatch(/function ordenarDeterminista[\s\S]*?\.order\('fecha'[\s\S]*?\.order\('id'/);

    const usos = [...fuente.matchAll(/\.range\(rangoDesde, rangoHasta\)/g)];
    const ordenados = [...fuente.matchAll(/ordenarDeterminista\(/g)];
    // Una definición + un uso por cada consulta paginada.
    expect(ordenados.length).toBe(usos.length + 1);
  });

  it('las consultas paginadas piden id y fecha, que es lo que el orden necesita', () => {
    const selects = [...fuente.matchAll(/\.select\('([^']*)'\)/g)]
      .map((m) => m[1])
      .filter((s) => s.includes('valor'));
    expect(selects.length).toBeGreaterThanOrEqual(12);
    for (const sel of selects) {
      expect(sel).toMatch(/\bid\b/);
      expect(sel).toMatch(/\bfecha\b/);
    }
  });
});
