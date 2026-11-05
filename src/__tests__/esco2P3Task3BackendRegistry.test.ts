import { describe, expect, it } from 'vitest';
import { herramientasPlanificador, validarPlan } from '@/utils/esco2/registro';
import { validarEstado } from '@/utils/esco2/estado';
const A = '00000000-0000-4000-8000-000000000001';
const tool = (args: object) => ({ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify(args) });
describe('Task 3 closed quantity operation', () => {
  it('registers a singular application selector with execution-only optional dates and stores its correct operation', () => {
    expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_cantidades_aplicacion');
    const p = validarPlan([tool({ aplicacion_id: A })]);
    expect(p.tipo).toBe('operaciones');
    if (p.tipo !== 'operaciones') throw new Error('expected operations');
    expect(p.operaciones[0]).toEqual({ tipo: 'cantidades_aplicacion', consulta: { aplicacion_id: A } });
    expect(validarEstado({ version: 1, plan: p })).toBe(true);
  });
  it.each([{}, { aplicacion_id: A, aplicacion: 'Alfa' }, { aplicacion_id: 'not-uuid' }, { aplicacion: '' }, { aplicacion_id: A, desde: '2026-11-01' }, { aplicacion_id: A, desde: '2026-11-03', hasta: '2026-11-01' }, { aplicacion_id: A, desde: '2026-02-30', hasta: '2026-12-01' }, { aplicacion_id: A, lote_id: A }, { aplicacion_id: A, sql: 'select 1' }])('rejects undeclared shape %#', args => expect(() => validarPlan([tool(args)])).toThrow());
  it('accepts a text selector and an inclusive execution interval', () => {
    const p = validarPlan([tool({ aplicacion: '2026-004', desde: '2026-11-01', hasta: '2026-11-03' })]);
    expect(p.tipo).toBe('operaciones');
  });
});
