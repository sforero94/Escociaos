// Esco SQL — el loop con un modelo y una base simulados.
import { describe, expect, it, vi } from 'vitest';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import {
  ErrorAccesoSql,
  ErrorSql,
  MAX_CONSULTAS,
  responderPregunta,
  textoHistorialSql,
  type ResultadoSql,
} from '../utils/escoSql/loop.ts';
import { construirPrompt, diaSemana, VISTAS_ESCO } from '../utils/escoSql/prompt.ts';

const USO = { entrada: 10, salida: 5, razonamiento: 0, costoUsd: 0.001 };

function consulta(sql: string, proposito = 'p'): RespuestaLLM {
  return { texto: '', llamadas: [{ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql, proposito }) }], uso: USO, ms: 1, modelo: 'm', finishReason: 'tool_calls' };
}
function texto(t: string): RespuestaLLM {
  return { texto: t, llamadas: [], uso: USO, ms: 1, modelo: 'm', finishReason: 'stop' };
}
/** Un modelo que responde en el orden dado y recuerda cada solicitud. */
function modelo(...respuestas: RespuestaLLM[]) {
  const solicitudes: SolicitudLLM[] = [];
  const cola = [...respuestas];
  const llm: ClienteLLM = {
    async completar(s) {
      solicitudes.push(structuredClone(s));
      const r = cola.shift();
      if (!r) throw new Error('el modelo simulado se quedó sin respuestas');
      return r;
    },
  };
  return { llm, solicitudes };
}
const ok = (filas: Record<string, unknown>[], truncado = false): ResultadoSql => ({ filas, n_filas: filas.length, truncado });
const HOY = '2026-11-08';

describe('Esco SQL — loop', () => {
  it('consulta, ve las filas y responde con ellas', async () => {
    const { llm, solicitudes } = modelo(consulta('select sum(jornales) j from v_esco_jornales'), texto('Se registraron 12,5 jornales.'));
    const ejecutarSql = vi.fn(async () => ok([{ j: 12.5 }]));
    const r = await responderPregunta({ pregunta: '¿Cuántos jornales?', llm, ejecutarSql, hoy: HOY });
    expect(r.respuesta).toBe('Se registraron 12,5 jornales.');
    expect(r.consultas).toHaveLength(1);
    expect(r.consultas[0]).toMatchObject({ n_filas: 1, truncado: false, error: null, proposito: 'p' });
    expect(r.uso).toMatchObject({ llamadas: 2, entrada: 20, salida: 10 });
    // El modelo recibió la fecha de hoy y el resultado de la consulta.
    expect(solicitudes[0].mensajes[0].content).toContain('2026-11-08');
    expect(solicitudes[1].mensajes.at(-1)?.content).toContain('"j":12.5');
    // Primera vuelta con la herramienta; no se le quita nunca el modo automático.
    expect(solicitudes[0].herramientas).toHaveLength(1);
  });

  it('muestra el error de Postgres al modelo y deja que corrija', async () => {
    const { llm, solicitudes } = modelo(consulta('select * from v_esco_jornalez'), consulta('select count(*) n from v_esco_jornales'), texto('Hay 40 registros.'));
    const ejecutarSql = vi
      .fn<(sql: string) => Promise<ResultadoSql>>()
      .mockRejectedValueOnce(new ErrorSql('relation "v_esco_jornalez" does not exist', '42P01'))
      .mockResolvedValueOnce(ok([{ n: 40 }]));
    const r = await responderPregunta({ pregunta: 'cuenta', llm, ejecutarSql, hoy: HOY });
    expect(r.consultas.map((c) => c.error)).toEqual(['relation "v_esco_jornalez" does not exist', null]);
    expect(solicitudes[1].mensajes.at(-1)?.content).toContain('Error de Postgres');
    expect(solicitudes[1].mensajes.at(-1)?.content).toContain('v_esco_jornalez');
    expect(r.respuesta).toBe('Hay 40 registros.');
  });

  it('0 filas llegan al modelo como 0 filas, y la consulta queda registrada sin error', async () => {
    const { llm, solicitudes } = modelo(consulta("select * from v_esco_gastos where fecha = '1999-01-01'"), texto('No hay gastos registrados en ese período.'));
    const r = await responderPregunta({ pregunta: 'gastos de 1999', llm, ejecutarSql: async () => ok([]), hoy: HOY });
    expect(r.consultas[0]).toMatchObject({ n_filas: 0, error: null, truncado: false });
    expect(solicitudes[1].mensajes.at(-1)?.content).toContain('0 fila(s)');
    expect(r.respuesta).toContain('No hay gastos');
  });

  it('avisa al modelo cuando el resultado viene truncado', async () => {
    const filas = Array.from({ length: 500 }, (_, i) => ({ i }));
    const { llm, solicitudes } = modelo(consulta('select i from t'), texto('Hay más de 500.'));
    const r = await responderPregunta({ pregunta: 'todo', llm, ejecutarSql: async () => ok(filas, true), hoy: HOY });
    expect(r.consultas[0]).toMatchObject({ n_filas: 500, truncado: true });
    expect(r.consultas[0].filas_muestra).toHaveLength(20);
    expect(solicitudes[1].mensajes.at(-1)?.content).toContain('TRUNCADO');
  });

  it('recorta por filas completas cuando el resultado es muy largo para el modelo', async () => {
    const filas = Array.from({ length: 400 }, (_, i) => ({ id: i, texto: 'x'.repeat(100) }));
    const { llm, solicitudes } = modelo(consulta('select 1'), texto('listo'));
    await responderPregunta({ pregunta: 'q', llm, ejecutarSql: async () => ok(filas), hoy: HOY });
    const contenido = solicitudes[1].mensajes.at(-1)!.content;
    expect(contenido).toContain('Solo ves las primeras');
    const json = contenido.slice(contenido.indexOf('\n') + 1);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it(`corta en ${MAX_CONSULTAS} consultas y pide la respuesta final sin herramientas`, async () => {
    const { llm, solicitudes } = modelo(consulta('select 1'), consulta('select 2'), consulta('select 3'), consulta('select 4'), texto('Con lo que obtuve: …'));
    const ejecutarSql = vi.fn(async () => ok([{ x: 1 }]));
    const r = await responderPregunta({ pregunta: 'mucho', llm, ejecutarSql, hoy: HOY });
    expect(ejecutarSql).toHaveBeenCalledTimes(MAX_CONSULTAS);
    expect(r.consultas).toHaveLength(MAX_CONSULTAS);
    const ultima = solicitudes.at(-1)!;
    expect(ultima.herramientas).toBeUndefined();
    expect(ultima.mensajes.at(-1)?.content).toContain('consultas permitidas');
    expect(r.respuesta).toBe('Con lo que obtuve: …');
  });

  it('si el modelo pide varias consultas a la vez, respeta el tope', async () => {
    const llamadas = Array.from({ length: 6 }, (_, i) => ({ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql: `select ${i}`, proposito: 'x' }) }));
    const { llm } = modelo({ texto: '', llamadas, uso: USO, ms: 1, modelo: 'm', finishReason: 'tool_calls' }, texto('ok'));
    const ejecutarSql = vi.fn(async () => ok([{ x: 1 }]));
    const r = await responderPregunta({ pregunta: 'q', llm, ejecutarSql, hoy: HOY });
    expect(ejecutarSql).toHaveBeenCalledTimes(MAX_CONSULTAS);
    expect(r.consultas).toHaveLength(MAX_CONSULTAS);
  });

  it('un seguimiento reutiliza el SQL del turno anterior que viaja en el historial', async () => {
    const previo = textoHistorialSql('Octubre: 100 jornales.', [{ sql: "select sum(jornales) from v_esco_jornales where fecha >= '2026-10-01' and fecha < '2026-11-01'" }]);
    const { llm, solicitudes } = modelo(consulta("select sum(jornales) from v_esco_jornales where fecha >= '2026-09-01' and fecha < '2026-10-01'"), texto('Septiembre: 90 jornales.'));
    await responderPregunta({
      pregunta: '¿y en septiembre?',
      historial: [{ rol: 'user', texto: 'jornales de octubre' }, { rol: 'assistant', texto: previo }],
      llm,
      ejecutarSql: async () => ok([{ sum: 90 }]),
      hoy: HOY,
    });
    const enviados = solicitudes[0].mensajes.map((m) => m.content);
    expect(enviados.some((c) => c.includes('[Consultas SQL que usé') && c.includes("fecha >= '2026-10-01'"))).toBe(true);
    expect(solicitudes[0].mensajes.at(-1)).toMatchObject({ role: 'user', content: '¿y en septiembre?' });
  });

  it('solo conserva los últimos 10 mensajes del historial', async () => {
    const historial = Array.from({ length: 14 }, (_, i) => ({ rol: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', texto: `m${i}` }));
    const { llm, solicitudes } = modelo(texto('hola'));
    await responderPregunta({ pregunta: 'q', historial, llm, ejecutarSql: async () => ok([]), hoy: HOY });
    const contenidos = solicitudes[0].mensajes.map((m) => m.content);
    expect(contenidos).not.toContain('m3');
    expect(contenidos).toContain('m4');
    expect(solicitudes[0].mensajes).toHaveLength(1 + 10 + 1);
  });

  it('un rechazo de acceso (42501) corta el loop sin dárselo al modelo', async () => {
    const { llm, solicitudes } = modelo(consulta('select 1'), texto('no debería llegar'));
    const ejecutarSql = async () => { throw new ErrorAccesoSql('esco_sql_lectura: solo Gerencia'); };
    await expect(responderPregunta({ pregunta: 'q', llm, ejecutarSql, hoy: HOY })).rejects.toBeInstanceOf(ErrorAccesoSql);
    expect(solicitudes).toHaveLength(1);
  });

  it('también corta un ErrorSql con código 42501', async () => {
    const { llm } = modelo(consulta('select 1'));
    const ejecutarSql = async () => { throw new ErrorSql('permission denied', '42501'); };
    await expect(responderPregunta({ pregunta: 'q', llm, ejecutarSql, hoy: HOY })).rejects.toBeInstanceOf(ErrorSql);
  });

  it('una pregunta ambigua se responde sin consultar', async () => {
    const { llm } = modelo(texto('¿De qué lote y de qué período?'));
    const ejecutarSql = vi.fn();
    const r = await responderPregunta({ pregunta: 'dame los jornales', llm, ejecutarSql, hoy: HOY });
    expect(ejecutarSql).not.toHaveBeenCalled();
    expect(r.consultas).toEqual([]);
    expect(r.respuesta).toContain('¿De qué lote');
  });

  it('argumentos inválidos no ejecutan nada y el modelo puede reintentar', async () => {
    const mala: RespuestaLLM = { texto: '', llamadas: [{ nombre: 'consultar_sql', argumentos: '{no es json' }], uso: USO, ms: 1, modelo: 'm', finishReason: 'tool_calls' };
    const { llm } = modelo(mala, consulta('select 1'), texto('listo'));
    const ejecutarSql = vi.fn(async () => ok([{ x: 1 }]));
    const r = await responderPregunta({ pregunta: 'q', llm, ejecutarSql, hoy: HOY });
    expect(ejecutarSql).toHaveBeenCalledTimes(1);
    expect(r.consultas[0].error).toBe('argumentos inválidos');
  });

  it('una respuesta final vacía devuelve un mensaje honesto, no un texto vacío', async () => {
    const { llm } = modelo(texto('   '));
    const r = await responderPregunta({ pregunta: 'q', llm, ejecutarSql: async () => ok([]), hoy: HOY });
    expect(r.respuesta).toContain('No pude armar una respuesta');
  });

  it('usa el modelo y el esfuerzo de la configuración', async () => {
    const { llm, solicitudes } = modelo(texto('hola'));
    await responderPregunta({ pregunta: 'q', llm, ejecutarSql: async () => ok([]), hoy: HOY, config: { modelo: 'otro/modelo', esfuerzo: 'low' } });
    expect(solicitudes[0]).toMatchObject({ modelo: 'otro/modelo', esfuerzo: 'low' });
  });

  it('el costo es null si algún proveedor no lo reporta', async () => {
    const sinCosto: RespuestaLLM = { ...texto('hola'), uso: { ...USO, costoUsd: null } };
    const { llm } = modelo(sinCosto);
    const r = await responderPregunta({ pregunta: 'q', llm, ejecutarSql: async () => ok([]), hoy: HOY });
    expect(r.uso.costoUsd).toBeNull();
  });
});

describe('Esco SQL — prompt', () => {
  it('lleva la fecha de hoy con su día de la semana (Bogotá, sin depender del huso del servidor)', () => {
    expect(diaSemana('2026-11-08')).toBe('domingo');
    expect(construirPrompt('2026-11-09')).toContain('lunes 2026-11-09');
  });

  it('describe cada vista y las reglas de respuesta', () => {
    const p = construirPrompt(HOY);
    for (const v of VISTAS_ESCO) expect(p).toContain(v.nombre);
    expect(p).toContain('SOLO con cifras que salieron de una consulta');
    expect(p).toContain('Nunca lo conviertas en 0');
    expect(p).toContain('$95M');
  });
});

describe('textoHistorialSql', () => {
  it('no pasa de 4000 caracteres', () => {
    const t = textoHistorialSql('r'.repeat(3900), [{ sql: 's'.repeat(3000) }]);
    expect(t.length).toBeLessThanOrEqual(4000);
    expect(textoHistorialSql('hola', [])).toBe('hola');
  });
});
