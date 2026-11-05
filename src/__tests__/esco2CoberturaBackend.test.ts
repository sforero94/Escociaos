import { describe, expect, it } from 'vitest';
import { validarPlan } from '../utils/esco2/registro.ts';
import { construirCoberturaFinal } from '../utils/esco2/cobertura.ts';
import type { ResultadoParte } from '../utils/esco2/tipos.ts';
import { responderTurno } from '../utils/esco2/nucleo.ts';
import { renderMensaje, validarMensajeFinal } from '../utils/esco2/mensajes.ts';

const A = '00000000-0000-4000-8000-000000000001';
const pregunta = 'Productos de Alfa y calibración';
const partes = [
  { id: 's1', texto: 'Productos de Alfa', capacidad: 'cantidades_aplicacion', disposicion: 'consultar' },
  { id: 's2', texto: 'calibración', capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' },
];
const llamada = (cobertura: unknown = { version: 1, partes }, parte_ids: unknown = ['s1']) => ({ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: A, cobertura, parte_ids }) });
const contexto = { pregunta, exigirCobertura: true as const };

describe('cobertura P3: validación estructural sin inferir exhaustividad', () => {
  it('conserva declaración y vínculo de la operación con su parte', () => {
    const p = validarPlan([llamada()], contexto);
    expect(p.tipo).toBe('operaciones');
    if (p.tipo !== 'operaciones') throw new Error('expected operations');
    expect(p.operaciones[0].parte_ids).toEqual(['s1']);
    expect(p.cobertura).toEqual({ version: 1, pregunta, partes });
  });

  it('rechaza falta de manifest antes de ejecutar en modo obligatorio', () => {
    expect(() => validarPlan([{ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: A }) }], contexto)).toThrow();
  });

  it.each([
    [{ ...partes[0], id: 's2' }, partes[1]],
    [partes[0], { ...partes[1], texto: 'frase inventada' }],
    [partes[0], { ...partes[1], capacidad: 'sql' }],
    [partes[0], { ...partes[1], capacidad: 'costos_aplicacion', disposicion: 'consultar' }],
    [partes[0], { ...partes[1], disposicion: 'consultar' }],
  ])('rechaza manifest incompatible %#', invalid => {
    expect(() => validarPlan([llamada({ version: 1, partes: invalid })], contexto)).toThrow();
  });

  it.each([[], ['s1', 's1'], ['s2'], ['s8'], 's1'])('rechaza binding inválido %j', ids => {
    expect(() => validarPlan([llamada(undefined, ids)], contexto)).toThrow();
  });
});

it('la cita de la solicitud no introduce anclas numéricas ni UUID del usuario en la respuesta', () => {
  const pregunta = `calibración con $987.654 para ${A} el 2026-12-31`;
  const p = validarPlan([{ nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'no publicar', cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' }] } }) }], { pregunta, exigirCobertura: true });
  const cobertura = construirCoberturaFinal(p, []);
  const texto = renderMensaje([], undefined, undefined, cobertura);
  expect(texto).toContain('calibración');
  expect(texto).not.toContain('987');
  expect(texto).not.toContain('2026');
  expect(texto).not.toContain(A);
  expect(cobertura.partes[0].texto).toBe(pregunta);
});

it.each(['$50,4M', '100.499.999', '2026-12-31', '31/12/2026', '1e7', '９９９', A, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])(
  'no publica el token del usuario %s como una cifra o identidad sustentada', token => {
    const pregunta = `calibración para ${token}`;
    const p = validarPlan([{ nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'no publicar', cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' }] } }) }], { pregunta, exigirCobertura: true });
    const cobertura = construirCoberturaFinal(p, []);
    const texto = renderMensaje([], undefined, undefined, cobertura);
    expect(texto).toContain('calibración');
    expect(texto).not.toContain(token);
    expect(cobertura.partes[0].texto).toBe(pregunta);
    expect(validarMensajeFinal(texto, [], undefined, undefined, cobertura)).toBe(true);
    expect(validarMensajeFinal(`${texto} ${token}`, [], undefined, undefined, cobertura)).toBe(false);
  },
);

it('conserva la consulta efectiva que D26 transformó antes de ejecutarla', async () => {
  const pregunta = 'Cosecha y Guadaña';
  const cobertura = { version: 1, partes: [{ id: 's1', texto: 'Cosecha', capacidad: 'labores', disposicion: 'consultar' }, { id: 's2', texto: 'Guadaña', capacidad: 'labores', disposicion: 'consultar' }] };
  const dominio = { proposito: 'jornales', desde: '2026-01-01', hasta: '2026-01-31', metricas: ['jornales'], agrupar_por: [] };
  const r = await responderTurno({ pregunta, historial: [], hoy: '2026-02-01', modoCobertura: 'obligatoria', config: { nombre: 'synthetic', planificador: { modelo: 'synthetic', esfuerzo: 'none' }, compositor: { modelo: 'never', esfuerzo: 'none' } }, datos: {
    tiposTareas: [{ id: 'tipo1', nombre: 'Recolección', categoria: 'Cosecha' }, { id: 'tipo2', nombre: 'Corte', categoria: null }],
    tareas: [{ id: 't1', nombre: 'Cosecha puntual', tipo_tarea_id: 'tipo1', estado: 'Programada', jornales_estimados: 2 }, { id: 't2', nombre: 'Guadaña', tipo_tarea_id: 'tipo2', estado: 'Programada', jornales_estimados: 2 }],
    lotes: [], registros: [{ id: 'r1', tarea_id: 't1', lote_id: null, fecha_trabajo: '2026-01-10', fraccion_jornal: 1, costo_jornal: 10 }, { id: 'r2', tarea_id: 't2', lote_id: null, fecha_trabajo: '2026-01-10', fraccion_jornal: 1, costo_jornal: 10 }],
  }, llm: { async completar() { return { texto: '', modelo: 'synthetic', llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify({ ...dominio, categorias: ['Cosecha'], cobertura, parte_ids: ['s1'] }) }, { nombre: 'consultar_labores', argumentos: JSON.stringify({ ...dominio, tareas: ['Guadaña'], parte_ids: ['s2'] }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, finishReason: 'stop' }; } } });
  expect(r.plan?.tipo).toBe('operaciones');
  if (r.plan?.tipo !== 'operaciones' || r.plan.operaciones[0].tipo !== 'labores') throw new Error('expected labor');
  expect(r.plan.operaciones[0].consulta.categorias).toEqual([]);
  expect(r.plan.operaciones[0].consulta.tareas).toEqual(['Cosecha']);
  expect(r.estado?.plan).toEqual(r.plan);
  expect(r.cobertura.partes[0].disposicion).toBe('respondida');
});

describe('cobertura P3: correspondencia laboral y fuente requerida', () => {
  const consulta = { proposito: 'costo', desde: '2026-01-01', hasta: '2026-01-31', metricas: ['costo'], agrupar_por: [], tarea_ids: ['tarea-explicita'] };
  const declarado = { version: 1, partes: [{ id: 's1', texto: 'costo', capacidad: 'labores', disposicion: 'consultar' }] };
  const plan = () => validarPlan([{ nombre: 'consultar_labores', argumentos: JSON.stringify({ ...consulta, cobertura: declarado, parte_ids: ['s1'] }) }], { pregunta: 'costo', exigirCobertura: true });
  const resultado = (): ResultadoParte => ({ id: 'p1', proposito: 'costo', estado: 'ok', alcance: { desde: '2026-01-01', hasta: '2026-01-31', hasta_recortado_a_hoy: false, lotes: 'todos', tareas: ['Labor sintética'], tarea_ids: ['tarea-explicita'], categorias: 'todas', sin_lote: 'incluir', agrupar_por: [] }, total: { jornales: 1, costo: 20 }, filas: [], no_resueltos: [], notas: [], cobertura: { registros: 1, registros_sin_lote: 0, registros_sin_costo: 0, grupos_totales: 1, grupos_mostrados: 0 } });
  it('rechaza intervalos ajenos o acortados sin corte explícito', () => {
    for (const hasta of ['2025-12-31', '2026-01-01']) {
      const r = resultado(); r.alcance.hasta = hasta;
      expect(() => construirCoberturaFinal(plan(), [r])).toThrow();
    }
  });
  it('rechaza perder una selección explícita manteniendo estado ok', () => {
    const r = resultado(); r.alcance.tarea_ids = [];
    expect(() => construirCoberturaFinal(plan(), [r])).toThrow();
  });
  it('no acredita como respondido un costo solicitado NULL aunque el motor estado sea ok', () => {
    const r = resultado(); r.total.costo = null; r.cobertura.registros_sin_costo = 1;
    expect(construirCoberturaFinal(plan(), [r]).partes[0]).toMatchObject({ disposicion: 'fuente_no_disponible', parcial: true });
  });
  it('conserva el control positivo de costo conocido', () => {
    expect(construirCoberturaFinal(plan(), [resultado()]).partes[0].disposicion).toBe('respondida');
  });
});
