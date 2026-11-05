// Review fixes on top of P3 Tasks 4–6 (Claude Code, 2026-11-05): money format, honest
// no-execution text, closed-application warning, duplicated labels, unread task link,
// and the planner registry holding the three tools at once.
import { describe, expect, it } from 'vitest';
import { ejecutarCostosAplicacion, renderCostosAplicacion } from '@/utils/esco2/costos';
import { ejecutarFaltantesAplicacion, renderFaltantesAplicacion } from '@/utils/esco2/faltantes';
import { ejecutarLaborAplicacion, renderLaborAplicacion } from '@/utils/esco2/laborAplicacion';
import { herramientasPlanificador, validarPlan } from '@/utils/esco2/registro';
import { dineroMensaje } from '@/utils/esco2/formatoMensaje';
import type { DatosCostosAplicacion } from '@/utils/esco2/costosTipos';
import type { DatosFaltantesAplicacion } from '@/utils/esco2/faltantesTipos';
import type { DatosLaborAplicacion } from '@/utils/esco2/laborAplicacionTipos';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = id(1), P = id(2), M = id(3), T = id(4), L = id(5);
const HOY = '2026-11-05';

describe('costos: formato y caso sin ejecución', () => {
  it('formats Esco money with US separators and no COP suffix', () => {
    const d: DatosCostosAplicacion = { seleccion: 'ok', aplicacion: { id: A, nombre_aplicacion: 'Foco', estado: 'Cerrada' }, costos: { id: A, estado: 'Cerrada', costo_total_insumos: 120000.5, costo_total_mano_obra: 2500000, costo_total: 2620000.5 }, cierres: [{ id: id(9), aplicacion_id: A, fecha_cierre: '2026-11-01' }] };
    const text = renderCostosAplicacion(ejecutarCostosAplicacion({ aplicacion_id: A }, d, 'p1', HOY));
    expect(text).not.toContain('COP');
    expect(text).toContain('Insumos: aprox. $120,001');
    expect(text).toContain('mano de obra: $2.5M');
    expect(text).toMatch(/^\*\*Costo congelado al cierre\*\*/m);
  });
  it('says there is no execution yet for a Calculada application with no movements', () => {
    const aplicacion = { id: A, nombre_aplicacion: 'Enmienda', estado: 'Calculada' as const, tipo_aplicacion: 'Fertilización' };
    const d: DatosCostosAplicacion = { seleccion: 'ok', aplicacion, cantidades: { seleccion: 'ok', aplicacion, movimientos: [], productos_ejecutados: [], mezclas: [], productos_plan: [] }, precios: [] };
    const r = ejecutarCostosAplicacion({ aplicacion_id: A }, d, 'p1', HOY);
    expect(r.ejecucion?.estado).toBe('sin_filas');
    const text = renderCostosAplicacion(r);
    expect(text).toContain('Aún no hay ejecución registrada');
    expect(text).not.toMatch(/no le[ií]do/);
  });
  it('keeps the unread case distinct from no execution', () => {
    const aplicacion = { id: A, nombre_aplicacion: 'Enmienda', estado: 'Calculada' as const, tipo_aplicacion: 'Fertilización' };
    const r = ejecutarCostosAplicacion({ aplicacion_id: A }, { seleccion: 'ok', aplicacion }, 'p1', HOY);
    expect(r.ejecucion?.estado).not.toBe('sin_filas');
    expect(renderCostosAplicacion(r)).not.toContain('Aún no hay ejecución registrada');
  });
  it('labels rounded amounts above one million as approximate', () => {
    expect(dineroMensaje(1440000)).toBe('aprox. $1.4M');
    expect(dineroMensaje(2000000)).toBe('$2.0M');
    expect(dineroMensaje(999)).toBe('$999');
  });
});

describe('faltantes: aplicaciones cerradas', () => {
  const datos = (estado: 'Cerrada' | 'Calculada'): DatosFaltantesAplicacion => ({ seleccion: 'ok', aplicaciones: [{ id: A, estado, nombre_aplicacion: 'Foco' }], mezclas: [{ id: M, aplicacion_id: A }], productos_plan: [{ id: id(6), mezcla_id: M, producto_id: P, producto_nombre: 'Lannate', producto_unidad: 'Litros', cantidad_total_necesaria: 5 }], inventario: [{ id: P, nombre: 'Lannate', unidad_medida: 'Litros', cantidad_actual: 1 }] });
  it('warns that a closed plan is not a pending purchase', () => {
    const text = renderFaltantesAplicacion(ejecutarFaltantesAplicacion({ aplicacion_ids: [A], aplicaciones: [] }, datos('Cerrada'), 'p1', HOY));
    expect(text).toContain('su plan ya se ejecutó');
    expect(text).toContain('no es una compra pendiente');
  });
  it('does not add the warning for an open application', () => {
    const text = renderFaltantesAplicacion(ejecutarFaltantesAplicacion({ aplicacion_ids: [A], aplicaciones: [] }, datos('Calculada'), 'p1', HOY));
    expect(text).not.toContain('su plan ya se ejecutó');
  });
});

describe('labor: etiquetas y vínculo no leído', () => {
  const datos = (nombreTarea: string): DatosLaborAplicacion => {
    const app = { id: A, nombre_aplicacion: 'Foco la vega', tarea_id: T };
    return { seleccion: 'ok', aplicaciones: [app], aplicaciones_visibles: [app], tareas: [{ id: T, nombre: nombreTarea }], registros: [{ id: id(7), tarea_id: T, lote_id: L, fecha_trabajo: '2026-11-01', fraccion_jornal: 1, costo_jornal: 50000 }], lotes: [{ id: L, nombre: 'La Vega' }] };
  };
  it('does not repeat a task name equal to its only application', () => {
    const text = renderLaborAplicacion(ejecutarLaborAplicacion({ aplicacion_ids: [A], aplicaciones: [] }, datos('Foco la vega'), 'p1', HOY));
    expect(text).not.toContain('Foco la vega · Foco la vega');
    expect(text).toContain('Foco la vega: 1 jornal registrado');
  });
  it('keeps a different task name', () => {
    const text = renderLaborAplicacion(ejecutarLaborAplicacion({ aplicacion_ids: [A], aplicaciones: [] }, datos('Fumigación general'), 'p1', HOY));
    expect(text).toContain('Foco la vega · Fumigación general');
  });
  it('reports an unread task read as vínculo no leído, not as task unavailable', () => {
    const d = datos('Foco la vega'); d.tareas = undefined;
    const r = ejecutarLaborAplicacion({ aplicacion_ids: [A], aplicaciones: [] }, d, 'p1', HOY);
    expect(r.filas[0].estado).toBe('vinculo_no_leido');
  });
});

describe('registro: las tres herramientas conviven', () => {
  it('declares the three tools and drops the "not available yet" wording', () => {
    const tools = herramientasPlanificador() as { function: { name: string; description: string } }[];
    const nombres = tools.map(t => t.function.name);
    expect(nombres).toEqual(expect.arrayContaining(['consultar_costos_aplicacion', 'consultar_labor_aplicacion', 'consultar_faltantes_aplicacion']));
    expect(tools.map(t => t.function.description).join(' ')).not.toMatch(/aún no están disponibles/);
  });
  it('validates one plan that mixes the three operations', () => {
    const plan = validarPlan([
      { nombre: 'consultar_costos_aplicacion', argumentos: JSON.stringify({ aplicacion: 'Foco' }) },
      { nombre: 'consultar_labor_aplicacion', argumentos: JSON.stringify({ aplicaciones: ['Foco'] }) },
      { nombre: 'consultar_faltantes_aplicacion', argumentos: JSON.stringify({ aplicaciones: ['Foco'] }) },
    ]);
    expect(plan.tipo).toBe('operaciones');
    if (plan.tipo === 'operaciones') expect(plan.operaciones.map(o => o.tipo)).toEqual(['costos_aplicacion', 'labor_aplicacion', 'faltantes_aplicacion']);
  });
  it('rejects a period on the shortage tool', () => {
    expect(() => validarPlan([{ nombre: 'consultar_faltantes_aplicacion', argumentos: JSON.stringify({ aplicaciones: ['Foco'], desde: '2026-01-01', hasta: '2026-01-31' }) }])).toThrow(/faltantes/);
  });
});
