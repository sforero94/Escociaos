import { describe, expect, it } from 'vitest';
import { herramientasPlanificador, validarPlan } from '@/utils/esco2/registro';
const app = (a: object = {}) => ({ nombre: 'consultar_aplicaciones', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-04', base_fecha: 'fecha_movimiento', ...a }) });
const labor = { nombre: 'consultar_labores', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-04', agrupar_por: [], metricas: ['jornales'] }) };
describe('P3 Task 2 closed registry units', () => {
  it('advertises the new operation and retains ordered mixed obligations', () => {
    expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_aplicaciones');
    const p = validarPlan([app(), labor, app({ base_fecha: 'sin_precisar' })]);
    expect(p.tipo).toBe('operaciones');
    if (p.tipo !== 'operaciones') throw new Error('expected mixed plan');
    expect(p.operaciones.map(o => o.tipo)).toEqual(['aplicaciones', 'labores', 'aplicaciones']);
  });
  it('preserves the existing labor-only plan shape', () => expect(validarPlan([labor]).tipo).toBe('consultas'));
  it.each([
    { base_fecha: 'created_at' }, { base_fecha: undefined }, { base_fecha: 'fecha_movimiento', sql: 'select 1' },
    { aplicacion_ids: ['not-a-uuid'] }, { estados: ['Planificada'] }, { hasta: '2026-02-30' },
    { desde: '2026-12-01' }, { metricas: ['costo_total'] },
  ])('rejects unregistered semantics %#', a => expect(() => validarPlan([app(a)])).toThrow());
  it('enforces the combined four-operation limit', () => expect(() => validarPlan([app(), labor, app(), labor, app()])).toThrow());
});
