import { describe, expect, it, vi } from 'vitest';
import { responderTurnoDesdeFuente, type ConfigModelos } from '@/utils/esco2/nucleo';
import type { ClienteLLM } from '@/utils/esco2/llm';
import { validarEstado, type EstadoTurno } from '@/utils/esco2/estado';
import { validarPlan } from '@/utils/esco2/registro';

const config: ConfigModelos = { nombre: 'synthetic', planificador: { modelo: 'synthetic', esfuerzo: 'none' }, compositor: { modelo: 'never', esfuerzo: 'none' } };
const call = { nombre: 'consultar_aplicaciones', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-04', base_fecha: 'sin_precisar' }) };
const base = { pregunta: 'Consulta sintética', historial: [], hoy: '2026-11-04', config, fuente: { async catalogo(): Promise<never> { throw new Error('unread'); }, async registros() { return []; } } };
describe('P3 Task 2 orchestration units', () => {
  it('does not call the planner when neither source domain can be read', async () => {
    const completar = vi.fn<ClienteLLM['completar']>();
    const r = await responderTurnoDesdeFuente({ ...base, llm: { completar }, fuenteAplicaciones: { async leer() { return {}; } } });
    expect(r.origen).toBe('error_datos');
    expect(r.llamadas).toEqual([]);
    expect(completar).not.toHaveBeenCalled();
  });
  it('preserves the legacy no-planner path when no applications reader exists', async () => {
    const completar = vi.fn<ClienteLLM['completar']>();
    const r = await responderTurnoDesdeFuente({ ...base, llm: { completar } });
    expect(r.origen).toBe('error_datos');
    expect(completar).not.toHaveBeenCalled();
  });
  it('validates the registered domain of each stored operation', () => {
    const plan = validarPlan([call]);
    if (plan.tipo !== 'operaciones') throw new Error('expected operations');
    const estado: EstadoTurno = { version: 1, plan };
    expect(validarEstado(estado)).toBe(true);
    const invalid = structuredClone(estado);
    Reflect.set(invalid.plan.tipo === 'operaciones' ? invalid.plan.operaciones[0] : {}, 'tipo', 'other');
    expect(validarEstado(invalid)).toBe(false);
  });
  it('preserves the original all-recorded labor source failure disposition', async () => {
    const completar = vi.fn<ClienteLLM['completar']>(async () => ({ modelo: 'synthetic', texto: '', llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-04', metricas: ['jornales'], agrupar_por: [] }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, finishReason: 'stop' }));
    const r = await responderTurnoDesdeFuente({ ...base, llm: { completar }, fuente: { async catalogo() { return { tareas: [], lotes: [], tiposTareas: [] }; }, async registros(): Promise<never> { throw new Error('unread'); } } });
    expect(r.origen).toBe('error_datos');
    expect(r.resultados).toEqual([]);
    expect(r.respuesta).not.toMatch(/\d/);
    expect(completar).toHaveBeenCalledTimes(1);
  });
});
