import { describe, expect, it, vi } from 'vitest';
import { responderTurno, type ConfigModelos } from '@/utils/esco2/nucleo';
import type { ClienteLLM, RespuestaLLM } from '@/utils/esco2/llm';
import type { ConsultaLabores, DatosLabores } from '@/utils/esco2/tipos';
import { renderMensaje } from '@/utils/esco2/mensajes';

const config: ConfigModelos = {
  nombre: 'synthetic', planificador: { modelo: 'synthetic', esfuerzo: 'none' },
  compositor: { modelo: 'never', esfuerzo: 'none' },
};
const datos: DatosLabores = {
  lotes: [{ id: 'l1', nombre: 'Norte', activo: true }],
  tiposTareas: [{ id: 'tt', nombre: 'Recolección', categoria: 'Cosecha' }],
  tareas: [{ id: 't1', nombre: 'Cosecha puntual', tipo_tarea_id: 'tt', estado: 'Completada', jornales_estimados: 2 }],
  registros: [{ id: 'r1', tarea_id: 't1', lote_id: 'l1', fecha_trabajo: '2026-11-01', fraccion_jornal: 0.75, costo_jornal: 150 }],
};
const consulta: ConsultaLabores = {
  proposito: 'synthetic', desde: '2026-11-01', hasta: '2026-11-04',
  lotes: [], tareas: [], categorias: [], sin_lote: 'incluir', agrupar_por: [],
  metricas: ['jornales', 'costo'], incluir_estado_tarea: false, limite: null,
};
function respuesta(argumentos: object = consulta): RespuestaLLM {
  return {
    modelo: 'synthetic', texto: '', llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify(argumentos) }],
    uso: { entrada: 2, salida: 1, razonamiento: 0, costoUsd: 0.001 }, ms: 1, finishReason: 'stop',
  };
}
function cliente(...respuestas: (RespuestaLLM | Error)[]) {
  const completar = vi.fn<ClienteLLM['completar']>(async () => {
    const siguiente = respuestas.shift();
    if (siguiente instanceof Error) throw siguiente;
    if (!siguiente) throw new Error('unexpected extra model call');
    return siguiente;
  });
  return { completar };
}
const base = { pregunta: 'Jornales registrados', historial: [], hoy: '2026-11-04', datos, config };

describe('Task 0 planner retry units', () => {
  it('retries one invalid schema and executes the second valid plan', async () => {
    const llm = cliente(respuesta({ ...consulta, metricas: ['inventada'] }), respuesta());
    const r = await responderTurno({ ...base, llm });
    expect(r.origen).toBe('determinista');
    expect(r.resultados[0].total).toMatchObject({ jornales: 0.75, costo: 150 });
    expect(llm.completar).toHaveBeenCalledTimes(2);
    expect(r.llamadas).toHaveLength(2);
    expect(r.llamadas.reduce((s, l) => s + l.costoUsd!, 0)).toBe(0.002);
    for (const [solicitud] of llm.completar.mock.calls) {
      expect(solicitud.mensajes.some(m => m.role === 'user' && m.content === base.pregunta)).toBe(true);
      expect(solicitud.toolChoice).toBe('required');
    }
  });

  it('stops after two invalid plans without executing facts', async () => {
    const llm = cliente(respuesta({}), respuesta({}), respuesta());
    const r = await responderTurno({ ...base, llm });
    expect(r.origen).toBe('error_plan');
    expect(r.errorPlan).toBe('plan_no_valido');
    expect(r.resultados).toEqual([]);
    expect(llm.completar).toHaveBeenCalledTimes(2);
  });

  it('does not retry a transport error', async () => {
    const llm = cliente(new Error('synthetic transport failure'), respuesta());
    const r = await responderTurno({ ...base, llm });
    expect(r.origen).toBe('error_llm');
    expect(llm.completar).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid first plan at one call', async () => {
    const llm = cliente(respuesta());
    const r = await responderTurno({ ...base, llm });
    expect(r.origen).toBe('determinista');
    expect(llm.completar).toHaveBeenCalledTimes(1);
  });
});

describe('Task 0 pending clarification units', () => {
  it.each(['tarea', 'categoria', 'Categoría completa', 'Ahora consulta otra fecha'])('requires a button for free text %s', async pregunta => {
    const llm = cliente(respuesta({ ...consulta, tareas: ['cosecha'] }));
    const primero = await responderTurno({ ...base, llm });
    expect(primero.opcionesAclaracion).toHaveLength(2);
    const segundo = await responderTurno({ ...base, pregunta, estado: primero.estado, llm });
    expect(segundo.opcionesAclaracion).toEqual(primero.opcionesAclaracion);
    expect(segundo.estado).toEqual(primero.estado);
    expect(segundo.respuesta).toContain('Elige una de las dos opciones');
    expect(segundo.respuesta).toBe(renderMensaje(segundo.resultados));
    expect(segundo.resultados.every(r => Object.keys(r.total).length === 0)).toBe(true);
    expect(segundo.llamadas).toEqual([]);
    expect(llm.completar).toHaveBeenCalledTimes(1);
  });

  it('accepts only an offered choice and resumes the frozen query without planning', async () => {
    const llm = cliente(respuesta({ ...consulta, tareas: ['cosecha'] }));
    const primero = await responderTurno({ ...base, llm });
    const segundo = await responderTurno({ ...base, pregunta: 'Categoría completa', estado: primero.estado, respuestaAclaracion: 'categoria', llm });
    expect(segundo.origen).toBe('determinista');
    expect(segundo.resultados[0].total.jornales).toBe(0.75);
    expect(segundo.estado?.pendiente).toBeUndefined();
    expect(segundo.llamadas).toEqual([]);
    expect(llm.completar).toHaveBeenCalledTimes(1);
  });
});
