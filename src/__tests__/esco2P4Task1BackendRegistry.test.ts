import { describe, expect, it } from 'vitest';
import { herramientasPlanificador, validarPlan } from '../utils/esco2/registro.ts';
import { validarEstado } from '../utils/esco2/estado.ts';

const llamada = (argumentos: object) => ({ nombre: 'consultar_monitoreo', argumentos: JSON.stringify(argumentos) });
const id = 'ca000000-0000-4000-8000-000000000001';
describe('P4-1 registro cerrado de monitoreo', () => {
  it('publica una operación por ronda e incidencia/gravedad', () => {
    expect(JSON.stringify(herramientasPlanificador())).toContain('consultar_monitoreo');
    const plan = validarPlan([llamada({ ronda_ids: [id], plagas: ['Plaga sintética'] })]);
    expect(plan.tipo).toBe('operaciones');
    if (plan.tipo !== 'operaciones') throw new Error('plan esperado');
    expect(plan.operaciones[0].tipo).toBe('monitoreo');
  });
  it.each([
    { ronda_ids: [id], metricas: ['severidad'] },
    { ronda_ids: [id], sql: 'select 1' },
    { ronda_ids: ['incorrecto'] },
    { ronda_ids: [id, id] },
    { ronda_ids: [id], rondas: ['Otra ronda'] },
    { desde: '2026-01-01' },
    { desde: '2026-02-30', hasta: '2026-03-01' },
    { ronda_ids: [id], agrupar_por: ['fecha'] },
    { ronda_ids: [id], agrupar_por: ['lote', 'lote'] },
    { seleccion_ronda: 'ultima_disponible' },
  ])('rechaza otra semántica o filtro mal formado %#', args => {
    expect(() => validarPlan([llamada(args)])).toThrow();
  });
  it('admite sin selector para que el ejecutor pida precisar, sin inventar fechas', () => {
    expect(validarPlan([llamada({})]).tipo).toBe('operaciones');
  });
  it('conserva la correspondencia de cobertura y el estado del servidor', () => {
    const pregunta = 'Incidencia de la ronda de laboratorio';
    const plan = validarPlan([llamada({ ronda_ids: [id], parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'monitoreo', disposicion: 'consultar' }] } })], { pregunta, exigirCobertura: true });
    expect(plan.tipo).toBe('operaciones');
    if (plan.tipo !== 'operaciones') throw new Error('plan esperado');
    expect(plan.operaciones[0].parte_ids).toEqual(['s1']);
    expect(validarEstado({ version: 1, plan })).toBe(true);
  });
});
