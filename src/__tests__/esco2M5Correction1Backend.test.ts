import { describe, expect, it } from 'vitest';
import { validarPlan } from '../utils/esco2/registro.ts';

const anterior = 'Temperatura de la estación inventada entre 2024-06-10 y 2024-06-14';
const actual = 'Ahora temperatura para el período entre 2024-06-12 y 2024-06-14';
const contexto = (preguntaActual: string) => ({ pregunta: `${anterior} | ${preguntaActual}`, preguntaActual, exigirCobertura: true as const });
const parte = (id: string, texto: string) => ({ id, texto, capacidad: 'clima', disposicion: 'consultar' });
const llamada = (texto: string, desde = '2024-06-12', hasta = '2024-06-14') => ({ nombre: 'consultar_clima', argumentos: JSON.stringify({ desde, hasta, variables: ['temp_c_avg'], parte_ids: ['s1'], cobertura: { version: 1, partes: [parte('s1', texto)] } }) });

describe('corrección M5: anclas estructurales del turno, sin interpretar lenguaje general', () => {
  it('rechaza que todo el inventario cite únicamente el historial', () => {
    expect(() => validarPlan([llamada(anterior)], contexto(actual))).toThrow(/turno_actual_sin_ancla/);
  });
  it('compara las dos fechas ISO citadas del actual sin corregir argumentos', () => {
    expect(() => validarPlan([llamada(actual, '2024-06-10')], contexto(actual))).toThrow(/periodo_actual_no_coincide/);
    expect(validarPlan([llamada(actual)], contexto(actual)).tipo).toBe('operaciones');
  });
  it('deja heredar período cuando el seguimiento no expresa uno nuevo', () => {
    const preguntaActual = '¿Y la humedad?';
    expect(validarPlan([llamada(preguntaActual, '2024-06-10')], contexto(preguntaActual)).tipo).toBe('operaciones');
  });
  it('conserva citas heredadas además de una ancla del actual', () => {
    const preguntaActual = 'Repite lo anterior';
    const args = JSON.parse(llamada(anterior).argumentos);
    args.cobertura.partes.push(parte('s2', preguntaActual));
    args.parte_ids.push('s2');
    expect(validarPlan([{ nombre: 'consultar_clima', argumentos: JSON.stringify(args) }], contexto(preguntaActual)).tipo).toBe('operaciones');
  });
  it('no interpreta un intervalo escrito en palabras como un lenguaje de fechas', () => {
    const preguntaActual = 'Temperatura de junio de hace dos años';
    expect(validarPlan([llamada(preguntaActual)], contexto(preguntaActual)).tipo).toBe('operaciones');
  });
  it('no aplica al período heredado las fechas de otra parte actual', () => {
    const preguntaActual = 'Humedad entre 2024-08-01 y 2024-08-02; repite además la temperatura anterior';
    const args = JSON.parse(llamada(anterior, '2024-06-10').argumentos);
    args.cobertura.partes.push(parte('s2', 'repite además la temperatura anterior'));
    args.parte_ids.push('s2');
    expect(validarPlan([{ nombre: 'consultar_clima', argumentos: JSON.stringify(args) }], contexto(preguntaActual)).tipo).toBe('operaciones');
  });
  it('no sustituye un intervalo explícito por vida completa cuando las fechas son opcionales', () => {
    const preguntaActual = 'Productos ejecutados de Cauce desde 2024-06-12 hasta 2024-06-14';
    const args = { aplicacion: 'Cauce', parte_ids: ['s1'], cobertura: { version: 1, partes: [{ ...parte('s1', preguntaActual), capacidad: 'cantidades_aplicacion' }] } };
    expect(() => validarPlan([{ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify(args) }], contexto(preguntaActual))).toThrow(/periodo_actual_no_coincide/);
  });
  it.each(['período al 2024-06-12 y 2024-06-14', 'rango de 2024-06-12 a 2024-06-14'])('contrasta el intervalo explícito %s sin inferir otras formas', intervalo => {
    const preguntaActual = `Limita la temperatura al ${intervalo}`;
    expect(() => validarPlan([llamada(preguntaActual, '2024-06-10')], contexto(preguntaActual))).toThrow(/periodo_actual_no_coincide/);
    expect(validarPlan([llamada(preguntaActual)], contexto(preguntaActual)).tipo).toBe('operaciones');
  });
  it.each([{ rondas: ['Ronda Turmalina'] }, { ronda_ids: ['bb410000-0000-4000-8000-000000000001'] }])('conserva la ronda explícita aun si sus observaciones describen un intervalo ISO %#', selector => {
    const preguntaActual = 'Incidencia de Ronda Turmalina; observaciones desde 2024-06-12 hasta 2024-06-14';
    const args = { ...selector, parte_ids: ['s1'], cobertura: { version: 1, partes: [{ ...parte('s1', preguntaActual), capacidad: 'monitoreo' }] } };
    const plan = validarPlan([{ nombre: 'consultar_monitoreo', argumentos: JSON.stringify(args) }], contexto(preguntaActual));
    expect(plan.tipo).toBe('operaciones');
    if (plan.tipo !== 'operaciones') throw new Error('expected operations');
    expect(plan.operaciones[0].consulta).not.toHaveProperty('desde');
    expect(plan.operaciones[0].consulta).not.toHaveProperty('hasta');
  });
});
