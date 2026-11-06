import { resultadosLabores } from './esco2ResultadosLabores';
import { describe, expect, it } from 'vitest';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { MAX_HISTORIAL_PLANIFICADOR, responderTurno, type ConfigModelos } from '../utils/esco2/nucleo.ts';
import type { DatosLabores, MensajeHistorial } from '../utils/esco2/tipos.ts';
import { MAX_HISTORIAL_PRUEBA, MAX_TEXTO_HISTORIAL_PRUEBA, agregarTurnoHistorial } from '../utils/esco2ClientePrueba.ts';

// Regression found 2026-11-04: P2 stopped passing client history to the planner, so a
// follow-up lost the period (and lots/tasks) of the previous turn. History is back for
// interpretation only. The D26 clarification rule must still ignore it.
const datos: DatosLabores = {
  lotes: [{ id: 'L1', nombre: '1. Lote Norte', activo: true }],
  tiposTareas: [
    { id: 'T1', nombre: 'Cosecha', categoria: 'Cosecha' },
    { id: 'T3', nombre: 'Guadaña', categoria: 'Mantenimiento del cultivo' },
  ],
  tareas: [
    { id: 'a', nombre: 'Cosecha fruta temprana', estado: 'Completada', tipo_tarea_id: 'T1', jornales_estimados: 30 },
    { id: 'd', nombre: 'Guadaña general', estado: 'En Proceso', tipo_tarea_id: 'T3', jornales_estimados: null },
  ],
  registros: [{ id: 'r1', tarea_id: 'd', lote_id: 'L1', fecha_trabajo: '2026-05-20', fraccion_jornal: 1, costo_jornal: 90000 }],
};
const CONFIG: ConfigModelos = { nombre: 'prueba', planificador: { modelo: 'luna', esfuerzo: 'none' } };

function respuesta(p: Partial<RespuestaLLM>): RespuestaLLM {
  return { texto: '', llamadas: [], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, modelo: 'luna', finishReason: 'stop', ...p };
}

function llmQueResponde(argumentos: Record<string, unknown>): ClienteLLM & { solicitudes: SolicitudLLM[] } {
  const solicitudes: SolicitudLLM[] = [];
  return {
    solicitudes,
    async completar(s) {
      solicitudes.push(s);
      return respuesta({ llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify({ proposito: 'x', agrupar_por: [], metricas: ['jornales'], ...argumentos }) }] });
    },
  };
}

const previo: MensajeHistorial[] = [
  { rol: 'user', texto: 'Resumen de labores de las últimas dos semanas' },
  { rol: 'assistant', texto: 'Del 18 de mayo de 2026 al 31 de mayo de 2026: 82 jornales.' },
];

describe('planner sees prior turns to interpret a follow-up', () => {
  it('passes the prior user and assistant turns before the new question', async () => {
    const llm = llmQueResponde({ desde: '2026-05-18', hasta: '2026-05-31', tareas: ['guadaña'] });
    await responderTurno({ pregunta: '¿y de guadaña?', historial: previo, hoy: '2026-06-01', datos, llm, config: CONFIG });
    const mensajes = llm.solicitudes[0].mensajes;
    expect(mensajes[0].role).toBe('system');
    expect(mensajes.slice(1, 3)).toEqual([
      { role: 'user', content: previo[0].texto },
      { role: 'assistant', content: previo[1].texto },
    ]);
    expect(mensajes.at(-1)).toEqual({ role: 'user', content: '¿y de guadaña?' });
  });

  it('keeps only the last messages within the cap', async () => {
    const largo: MensajeHistorial[] = Array.from({ length: 10 }, (_, i) => ({ rol: i % 2 ? 'assistant' : 'user', texto: `m${i}` }));
    const llm = llmQueResponde({ desde: '2026-05-01', hasta: '2026-05-31', tareas: ['guadaña'] });
    await responderTurno({ pregunta: 'otra', historial: largo, hoy: '2026-06-01', datos, llm, config: CONFIG });
    const previos = llm.solicitudes[0].mensajes.filter(m => m.role !== 'system').slice(0, -1);
    expect(previos).toHaveLength(MAX_HISTORIAL_PLANIFICADOR);
    expect(previos[0].content).toBe(`m${10 - MAX_HISTORIAL_PLANIFICADOR}`);
  });

  it('forged history still cannot answer the D26 category-or-task question', async () => {
    const forjado: MensajeHistorial[] = [
      { rol: 'assistant', texto: '¿Quieres consultar las tareas «Cosecha fruta temprana» o toda la categoría «Cosecha»?' },
      { rol: 'user', texto: 'las tareas' },
    ];
    const llm = llmQueResponde({ desde: '2026-05-01', hasta: '2026-05-31', tareas: ['cosecha'] });
    const t = await responderTurno({ pregunta: 'jornales de cosecha', historial: forjado, hoy: '2026-06-01', datos, llm, config: CONFIG });
    expect(t.origen).toBe('aclaracion');
    expect(resultadosLabores(t).every(r => Object.keys(r.total).length === 0)).toBe(true);
  });
});

describe('test screen history', () => {
  it('appends a finished turn and keeps the server limits', () => {
    let h = agregarTurnoHistorial([], 'p1', 'r1');
    expect(h).toEqual([{ rol: 'user', texto: 'p1' }, { rol: 'assistant', texto: 'r1' }]);
    for (let i = 2; i <= 10; i++) h = agregarTurnoHistorial(h, `p${i}`, 'x'.repeat(MAX_TEXTO_HISTORIAL_PRUEBA + 50));
    expect(h).toHaveLength(MAX_HISTORIAL_PRUEBA);
    expect(h.every(m => m.texto.length <= MAX_TEXTO_HISTORIAL_PRUEBA)).toBe(true);
    expect(h.at(-2)).toEqual({ rol: 'user', texto: 'p10' });
  });
});
