// ESCO-180 (opción B de Santiago, 2026-11-14): Esco SQL calcula el P&G con el motor oficial.
//
// Tres garantías:
//   1. consultar_pyg corre construirPyG (el motor de /finanzas/reportes) y, sobre las mismas
//      filas crudas, da los mismos totales que el Esco clásico (get_pyg_flujo_caja).
//   2. El loop ofrece consultar_pyg solo cuando hay ejecutor, y el prompt prohíbe calcular
//      utilidad como ingresos − gastos en los dos casos.
//   3. El ejecutor pagina (PostgREST corta en 1.000 filas sin avisar) y filtra el hato.
import { describe, expect, it, vi } from 'vitest';
import { construirResumenPyG, construirPeriodos as periodosClasico, type DatosReportes } from '../supabase/functions/server/reportes-financieros';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { responderPregunta } from '../utils/escoSql/loop.ts';
import { construirPrompt, reglaPyG } from '../utils/escoSql/prompt.ts';
import { armarDatosPyG, calcularPyG, filasPyG, leerArgumentosPyG, type FilasCrudasPyG } from '../utils/escoSql/pyg.ts';
import { ejecutorPygSupabase, type ClienteTablas } from '../../supabase/functions/esco-consultas/manejadorSql.ts';

// ── Fixture: filas como las devuelve PostgREST ───────────────────────────────

const N = { agua: 'n-agua', gana: 'n-gana', hato: 'n-hato', ofi: 'n-ofi' };
const CRUDAS: FilasCrudasPyG = {
  negocios: [
    { id: N.agua, nombre: 'Aguacate Hass' },
    { id: N.gana, nombre: 'Ganado' },
    { id: N.hato, nombre: 'Hato Lechero' },
    { id: N.ofi, nombre: 'Oficina Central' },
  ],
  categoriasGastos: [
    { id: 'cg1', nombre: 'Mano de Obra y Asistencia Técnica', tipo_costo: 'directo' },
    { id: 'cg2', nombre: 'Alimentos y Fertilizantes', tipo_costo: 'directo' },
    { id: 'cg3', nombre: 'Gastos Generales', tipo_costo: 'indirecto' },
  ],
  conceptos: [{ id: 'cc-override', tipo_costo: 'directo' }, { id: 'cc-normal', tipo_costo: null }],
  categoriasIngresos: [{ id: 'ci1', nombre: 'Exportación' }, { id: 'ci2', nombre: 'Venta de Ganado' }, { id: 'ci3', nombre: 'Venta Leche' }],
  gastos: [
    { id: 'g1', fecha: '2026-02-15', negocio_id: N.agua, valor: '225619144', estado: 'Confirmado', categoria_id: 'cg1', concepto_id: 'cc-normal' },
    { id: 'g2', fecha: '2026-06-10', negocio_id: N.agua, valor: 7000000, estado: 'Confirmado', categoria_id: 'cg3', concepto_id: 'cc-override' },
    { id: 'g3', fecha: '2026-02-20', negocio_id: N.agua, valor: 9999999, estado: 'Pendiente', categoria_id: 'cg1', concepto_id: 'cc-normal' },
    { id: 'g4', fecha: '2025-09-15', negocio_id: N.agua, valor: 30000000, estado: 'Confirmado', categoria_id: 'cg1', concepto_id: 'cc-normal' },
    { id: 'g5', fecha: '2026-10-20', negocio_id: N.gana, valor: 38891076, estado: 'Confirmado', categoria_id: 'cg2', concepto_id: 'cc-normal' },
    { id: 'g6', fecha: '2026-02-16', negocio_id: N.hato, valor: 53100543, estado: 'Confirmado', categoria_id: 'cg2', concepto_id: 'cc-normal' },
    { id: 'g7', fecha: '2026-02-20', negocio_id: N.ofi, valor: 192141343, estado: 'Confirmado', categoria_id: 'cg3', concepto_id: 'cc-normal' },
  ],
  ingresos: [
    { id: 'i1', fecha: '2026-02-10', negocio_id: N.agua, valor: 40000000, categoria_id: 'ci1', cosecha: 'Traviesa 2026', cantidad: '12000' },
    { id: 'i2', fecha: '2025-11-20', negocio_id: N.agua, valor: 15574000, categoria_id: 'ci1', cosecha: 'Principal 2026', cantidad: 5200 },
    { id: 'i3', fecha: '2026-01-15', negocio_id: N.hato, valor: 24760243, categoria_id: 'ci3', cosecha: null, cantidad: 18500 },
  ],
  // El caso que motivó ESCO-180: compra de ganado es inventario; solo las cabezas vendidas cuestan.
  ganado: [
    { id: 't1', fecha: '2026-01-10', tipo: 'compra', cantidad_cabezas: 60, kilos_pagados: 24000, valor_total: 180000000, es_hato: false },
    { id: 't2', fecha: '2026-10-05', tipo: 'compra', cantidad_cabezas: 26, kilos_pagados: 9000, valor_total: 96757500, es_hato: false },
    { id: 't3', fecha: '2026-10-14', tipo: 'venta', cantidad_cabezas: 35, kilos_pagados: 16000, valor_total: 177850100, es_hato: false },
  ],
  parametros: [{ id: 'p1', clave: 'saldo_inicial_caja', anio: null, valor: '12000000' }],
};

/** Los mismos hechos con la forma que arma el Esco clásico (execPygFlujoCaja de chat.tsx). */
function comoClasico(): DatosReportes {
  const d = armarDatosPyG(2026, CRUDAS);
  return {
    anio: 2026,
    negocios: d.negocios,
    ingresos: d.ingresos,
    gastos: d.gastos.map(({ concepto_id: _c, concepto_nombre: _n, ...g }) => g),
    ganado: d.ganado,
    parametros: d.parametros.map(({ negocio_id: _n, ...p }) => p),
  };
}

describe('ESCO-180 — consultar_pyg = Esco clásico = /finanzas/reportes', () => {
  for (const vista of ['global', 'aguacate', 'ganado', 'hato'] as const) {
    it(`vista ${vista}, trimestres`, () => {
      const esco = calcularPyG({ vista, anio: 2026, modo: 'trimestres' }, CRUDAS);
      const pantalla = construirResumenPyG(comoClasico(), periodosClasico(2026, 'trimestres'), vista, 'trimestres');
      expect(esco.totales.ingresos).toEqual(pantalla.totales.ingresos);
      expect(esco.totales.costos_directos).toEqual(pantalla.totales.costos_directos);
      expect(esco.totales.margen_contribucion).toEqual(pantalla.totales.margen_contribucion);
      expect(esco.totales.gastos_indirectos).toEqual(pantalla.totales.gastos_indirectos);
      expect(esco.totales.utilidad_operativa).toEqual(pantalla.totales.utilidad_operativa);
    });
  }

  it('aguacate por cosecha', () => {
    const esco = calcularPyG({ vista: 'aguacate', anio: 2026, modo: 'cosecha' }, CRUDAS);
    const pantalla = construirResumenPyG(comoClasico(), periodosClasico(2026, 'cosecha'), 'aguacate', 'cosecha');
    expect(esco.totales.utilidad_operativa).toEqual(pantalla.totales.utilidad_operativa);
  });

  it('Ganado: la utilidad NO es ingresos − gastos (descuenta el costo de las cabezas vendidas)', () => {
    const r = calcularPyG({ vista: 'ganado', anio: 2026, modo: 'trimestres' }, CRUDAS);
    const anio = r.totales.utilidad_operativa.length - 1;
    const ingresosMenosGastos = 177850100 - 38891076;
    expect(r.totales.ingresos[anio]).toBe(177850100);
    expect(r.totales.utilidad_operativa[anio]).toBeLessThan(ingresosMenosGastos);
    // 35 cabezas al promedio ponderado (276.757.500 / 86 cabezas) entran como costo directo.
    expect(r.totales.costos_directos[anio]).toBeGreaterThan(38891076 + 100_000_000);
    expect(r.lineas.some((l) => l.etiqueta === 'Costo de venta de ganado')).toBe(true);
  });

  it('el hato y los movimientos que no son compra/venta no entran al costeo de la ceba', () => {
    const d = armarDatosPyG(2026, { ...CRUDAS, ganado: [...CRUDAS.ganado, { id: 'h', fecha: '2026-03-01', tipo: 'venta', cantidad_cabezas: 2, valor_total: 5, es_hato: true }, { id: 'm', fecha: '2026-03-02', tipo: 'muerte', cantidad_cabezas: 1, valor_total: 0, es_hato: false }] });
    expect(d.ganado.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('filasPyG da una fila por línea con una columna por período', () => {
    const r = calcularPyG({ vista: 'ganado', anio: 2026, modo: 'trimestres' }, CRUDAS);
    const filas = filasPyG(r);
    const utilidad = filas.find((f) => f.concepto === 'UTILIDAD OPERATIVA');
    expect(utilidad).toBeDefined();
    // Las líneas del motor vienen redondeadas a pesos (redondearPesos); `totales` no.
    for (const [i, p] of r.periodos.entries()) expect(utilidad![p.key]).toBe(Math.round(r.totales.utilidad_operativa[i]));
    expect(filas.some((f) => f.tipo === 'seccion')).toBe(false);
  });
});

describe('ESCO-180 — argumentos', () => {
  it('acepta vista y año; el modo cosecha solo vale en aguacate', () => {
    expect(leerArgumentosPyG('{"vista":"ganado","anio":2026}')).toEqual({ vista: 'ganado', anio: 2026, modo: 'trimestres' });
    expect(leerArgumentosPyG('{"vista":"ganado","anio":2026,"modo":"cosecha"}')?.modo).toBe('trimestres');
    expect(leerArgumentosPyG('{"vista":"aguacate","anio":2026,"modo":"cosecha"}')?.modo).toBe('cosecha');
  });
  it('rechaza lo que no sirve', () => {
    for (const a of ['', 'x', '{"vista":"caballos","anio":2026}', '{"vista":"ganado"}', '{"vista":"ganado","anio":1990}', '{"vista":"ganado","anio":2026.5}']) {
      expect(leerArgumentosPyG(a)).toBeNull();
    }
  });
});

// ── Loop ─────────────────────────────────────────────────────────────────────

const USO = { entrada: 10, salida: 5, razonamiento: 0, costoUsd: 0.001 };
const llamada = (nombre: string, args: unknown): RespuestaLLM => ({ texto: '', llamadas: [{ nombre, argumentos: JSON.stringify(args) }], uso: USO, ms: 1, modelo: 'm', finishReason: 'tool_calls' });
const texto = (t: string): RespuestaLLM => ({ texto: t, llamadas: [], uso: USO, ms: 1, modelo: 'm', finishReason: 'stop' });
function modelo(...respuestas: RespuestaLLM[]) {
  const solicitudes: SolicitudLLM[] = [];
  const llm: ClienteLLM = { async completar(s) { solicitudes.push(structuredClone(s)); const r = respuestas.shift(); if (!r) throw new Error('sin respuestas'); return r; } };
  return { llm, solicitudes };
}
const nombres = (s: SolicitudLLM) => ((s.herramientas ?? []) as { function: { name: string } }[]).map((h) => h.function.name);

describe('ESCO-180 — loop y prompt', () => {
  it('con ejecutor ofrece consultar_pyg, lo corre y el resultado sirve para visuales', async () => {
    const { llm, solicitudes } = modelo(
      llamada('consultar_pyg', { vista: 'ganado', anio: 2026 }),
      llamada('mostrar_visual', { tipo: 'tabla', consulta: 1, titulo: 'P&G Ganado', columnas: [{ columna: 'concepto', etiqueta: 'Concepto', formato: 'texto' }] }),
      texto('La utilidad operativa de Ganado en 2026 es menor que ingresos menos gastos.'),
    );
    const ejecutarPyg = vi.fn(async (a: Parameters<typeof calcularPyG>[0]) => calcularPyG(a, CRUDAS));
    const ejecutarSql = vi.fn();
    const r = await responderPregunta({ pregunta: 'PyG de ganado 2026', llm, ejecutarSql, ejecutarPyg, hoy: '2026-11-14' });
    expect(nombres(solicitudes[0])).toEqual(['consultar_sql', 'consultar_pyg', 'mostrar_visual']);
    expect(ejecutarPyg).toHaveBeenCalledWith({ vista: 'ganado', anio: 2026, modo: 'trimestres' });
    expect(ejecutarSql).not.toHaveBeenCalled();
    expect(r.consultas).toHaveLength(1);
    expect(r.consultas[0].sql).toContain('consultar_pyg');
    expect(r.consultas[0].error).toBeNull();
    expect(r.bloques).toHaveLength(1);
    const tool = solicitudes[1].mensajes.find((m) => m.role === 'tool');
    expect(String(tool?.content)).toContain('P&G oficial de Ganado 2026');
    expect(String(tool?.content)).toContain('Costo de venta de ganado');
  });

  it('sin ejecutor no ofrece consultar_pyg y una llamada a ella no se ejecuta', async () => {
    const { llm, solicitudes } = modelo(llamada('consultar_pyg', { vista: 'ganado', anio: 2026 }), texto('El P&G está en /finanzas/reportes.'));
    const r = await responderPregunta({ pregunta: 'PyG', llm, ejecutarSql: vi.fn(), hoy: '2026-11-14' });
    expect(nombres(solicitudes[0])).toEqual(['consultar_sql', 'mostrar_visual']);
    expect(r.consultas).toHaveLength(0);
  });

  it('un error del P&G llega al modelo con la instrucción de no restar gastos de ingresos', async () => {
    const { llm, solicitudes } = modelo(llamada('consultar_pyg', { vista: 'global', anio: 2026 }), texto('No pude obtener el P&G.'));
    const r = await responderPregunta({ pregunta: 'utilidad', llm, ejecutarSql: vi.fn(), ejecutarPyg: async () => { throw new Error('fin_gastos excede 50000 filas'); }, hoy: '2026-11-14' });
    expect(r.consultas[0].error).toContain('excede');
    const tool = solicitudes[1].mensajes.find((m) => m.role === 'tool');
    expect(String(tool?.content)).toContain('No calcules la utilidad restando gastos de ingresos');
  });

  it('el prompt prohíbe PyG = ingresos − gastos con y sin la herramienta', () => {
    const con = construirPrompt('2026-11-14', { pyg: true });
    const sin = construirPrompt('2026-11-14');
    for (const p of [con, sin]) {
      expect(p).toContain('NUNCA se calculan restando v_esco_gastos de v_esco_ingresos');
      expect(p).toContain('la compra de ganado es inventario');
      expect(p).toContain('no le des la razón');
    }
    expect(con).toContain('usa consultar_pyg');
    expect(con).toContain('tres herramientas');
    expect(sin).toContain('/finanzas/reportes');
    expect(sin).not.toContain('usa consultar_pyg');
    expect(reglaPyG(true).startsWith('15. ')).toBe(true);
  });
});

// ── Ejecutor ─────────────────────────────────────────────────────────────────

/** Cliente simulado que imita los filtros y el corte de 1.000 filas de PostgREST. */
function clienteSimulado(tablas: Record<string, Record<string, unknown>[]>) {
  const llamadas: { tabla: string; filtros: string[]; rango: [number, number] }[] = [];
  const cliente: ClienteTablas = {
    from(tabla) {
      return {
        select() {
          const filtros: string[] = [];
          let rango: [number, number] = [0, 999];
          let filtro = (_f: Record<string, unknown>) => true;
          const q = {
            eq(c: string, v: unknown) { filtros.push(`${c}=eq.${String(v)}`); const prev = filtro; filtro = (f) => prev(f) && f[c] === v; return q; },
            gte(c: string, v: unknown) { filtros.push(`${c}=gte.${String(v)}`); const prev = filtro; filtro = (f) => prev(f) && String(f[c]) >= String(v); return q; },
            lte(c: string, v: unknown) { filtros.push(`${c}=lte.${String(v)}`); const prev = filtro; filtro = (f) => prev(f) && String(f[c]) <= String(v); return q; },
            order() { return q; },
            range(a: number, b: number) { rango = [a, b]; return q; },
            then(res: (v: { data: unknown; error: null }) => unknown) {
              llamadas.push({ tabla, filtros, rango });
              const todas = (tablas[tabla] ?? []).filter(filtro);
              return Promise.resolve({ data: todas.slice(rango[0], Math.min(rango[1] + 1, rango[0] + 1000)), error: null }).then(res);
            },
          };
          return q as never;
        },
      };
    },
  };
  return { cliente, llamadas };
}

describe('ESCO-180 — ejecutor con el JWT del usuario', () => {
  it('pagina más allá de 1.000 filas, filtra el hato y acota los gastos a dos años', async () => {
    const muchos = Array.from({ length: 2300 }, (_, i) => ({ id: `gx${String(i).padStart(5, '0')}`, fecha: '2026-03-01', negocio_id: N.agua, valor: 1, estado: 'Confirmado', categoria_id: 'cg3', concepto_id: 'cc-normal' }));
    const { cliente, llamadas } = clienteSimulado({
      fin_negocios: CRUDAS.negocios,
      fin_categorias_gastos: CRUDAS.categoriasGastos,
      fin_conceptos_gastos: CRUDAS.conceptos,
      fin_categorias_ingresos: CRUDAS.categoriasIngresos,
      fin_gastos: [...CRUDAS.gastos, ...muchos, { id: 'viejo', fecha: '2023-05-01', negocio_id: N.agua, valor: 999, estado: 'Confirmado', categoria_id: 'cg3', concepto_id: 'cc-normal' }],
      fin_ingresos: CRUDAS.ingresos,
      fin_transacciones_ganado: [...CRUDAS.ganado, { id: 'h', fecha: '2026-03-01', tipo: 'venta', cantidad_cabezas: 2, valor_total: 5, es_hato: true }],
      fin_parametros: CRUDAS.parametros,
    });
    const r = await ejecutorPygSupabase(cliente)({ vista: 'aguacate', anio: 2026, modo: 'trimestres' });
    const gastos = llamadas.filter((l) => l.tabla === 'fin_gastos');
    expect(gastos.length).toBe(3);
    expect(gastos[0].filtros).toEqual(['fecha=gte.2025-01-01', 'fecha=lte.2026-12-31']);
    expect(llamadas.find((l) => l.tabla === 'fin_transacciones_ganado')?.filtros).toEqual(['es_hato=eq.false']);
    // Los 2.300 gastos de 1 peso se cuentan todos: el corte de 1.000 no se comió ninguno.
    const esperado = calcularPyG({ vista: 'aguacate', anio: 2026, modo: 'trimestres' }, { ...CRUDAS, gastos: [...CRUDAS.gastos, ...muchos] });
    expect(r.totales.gastos_indirectos).toEqual(esperado.totales.gastos_indirectos);
  });
});
