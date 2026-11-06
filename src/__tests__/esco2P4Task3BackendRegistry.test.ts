import { describe, expect, it } from 'vitest';
import { herramientasPlanificador, validarPlan } from '../utils/esco2/registro.ts';
import { validarEstado } from '../utils/esco2/estado.ts';
const base = { desde: '2026-10-01', hasta: '2026-10-03', variables: ['lluvia_total_mm'] };
const llamada = (args: object) => ({ nombre: 'consultar_clima', argumentos: JSON.stringify(args) });
describe('P4-3 registro cerrado clima', () => {
  it('registra el histórico diario y serializa el estado con cobertura', () => {
    expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_clima');
    const pregunta = 'Lluvia observada del período';
    const plan = validarPlan([llamada({ ...base, parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'clima', disposicion: 'consultar' }] } })], { pregunta, exigirCobertura: true });
    expect(plan.tipo).toBe('operaciones');
    if (plan.tipo !== 'operaciones') throw new Error('plan');
    expect(validarEstado({ version: 1, plan })).toBe(true);
  });
  it.each([{ ...base, tabla: 'clima_lecturas' }, { ...base, rpc: 'rollup' }, { ...base, variables: ['pronostico'] }, { ...base, variables: ['lluvia_total_mm', 'lluvia_total_mm'] }, { ...base, variables: [] }, { ...base, station_id: '' }, { ...base, desde: '2026-02-30' }, { desde: base.desde }, { ...base, variables: null }])('rechaza consulta no registrada %#', args => {
    expect(() => validarPlan([llamada(args)])).toThrow();
  });
});
