import { describe, expect, it } from 'vitest';
import { datos } from '../../scripts/esco2/fixtureSintetico.ts';
import { ejecutarConsulta } from '../utils/esco2/ejecutor.ts';
import { puntuarIntento, type Ancla } from '../utils/esco2/evaluacion.ts';
import { extraerFechas } from '../utils/esco2/fechasTexto.ts';
import { evidenciaNumerica, verificarCifrasObligatorias, verificarNumeros } from '../utils/esco2/guardaNumerica.ts';
import type { ClienteLLM, RespuestaLLM } from '../utils/esco2/llm.ts';
import { renderDeterminista, responderTurno, type ResultadoTurno } from '../utils/esco2/nucleo.ts';
import type { ConsultaLabores } from '../utils/esco2/tipos.ts';

// All cases are synthetic. No model calls or production reads.
const consulta: ConsultaLabores = {
  proposito: 'Proyectos', desde: '2026-05-01', hasta: '2026-05-31',
  lotes: [], tareas: [], categorias: ['Proyectos Especiales'], sin_lote: 'incluir',
  agrupar_por: [], metricas: ['jornales'], incluir_estado_tarea: false, limite: null,
};

function turno(respuesta: string): ResultadoTurno {
  return {
    respuesta, origen: 'compositor', plan: null, errorPlan: null, ruta: null, ajustes: [],
    resultados: [], guarda: { primera: [], segunda: null }, llamadas: [], ms: 0,
  };
}

describe('labor review: exact dates use the same parser for presence and extra dates', () => {
  const ancla: Ancla = { claim: 'rango', tipo: 'conjunto', valor: ['2026-05-18', '2026-05-31'], tol: null };

  it.each(['al', 'a', 'y', '-', '–', '—'])('accepts both endpoints with separator %s', (separador) => {
    const texto = `Del 18 ${separador} 31 de mayo de 2026`;
    expect([...extraerFechas(texto, 2026)].sort()).toEqual(ancla.valor);
    expect(puntuarIntento(turno(texto), [ancla], { hoy: '2026-06-01' })).toMatchObject({ respuestaCorrecta: true, fechasDeMas: [] });
  });

  it('rejects an extra first endpoint in a typographic range', () => {
    const soloFin: Ancla = { claim: 'fin', tipo: 'fecha', valor: '2026-05-31', tol: null };
    const p = puntuarIntento(turno('Terminó el 31 de mayo. Otra labor fue del 18–31 de mayo.'), [soloFin], { hoy: '2026-06-01' });
    expect(p).toMatchObject({ respuestaCorrecta: false, fechasDeMas: ['2026-05-18'] });
  });

  it('does not treat a work quantity range as a date', () => {
    const fecha: Ancla = { claim: 'fin', tipo: 'fecha', valor: '2026-12-10', tol: null };
    expect(puntuarIntento(turno('Fueron 10-12 jornales.'), [fecha], { hoy: '2026-12-31' }).respuestaCorrecta).toBe(false);
  });

  it('keeps an explicit past year and rejects a different year', () => {
    const anterior: Ancla = { ...ancla, valor: ['2025-05-18', '2025-05-31'] };
    expect(puntuarIntento(turno('Del 18 al 31 de mayo de 2025'), [anterior], { hoy: '2026-06-01' }).respuestaCorrecta).toBe(true);
    expect(puntuarIntento(turno('Del 18 al 31 de mayo de 2024'), [anterior], { hoy: '2026-06-01' }).respuestaCorrecta).toBe(false);
  });
});

describe('labor review: D30 with no registered work', () => {
  const resultado = ejecutarConsulta(consulta, { ...datos, registros: [] }, '2026-06-01', 'p1');

  it('renders the category estimate even when there are no work rows', () => {
    expect(resultado.estado).toBe('sin_registros');
    const texto = renderDeterminista([resultado]);
    expect(texto).toContain('no hay registros de trabajo');
    expect(texto).toContain('Jornales estimados');
    expect(texto).toContain('50');
    expect(texto).toContain('plan completo');
    expect(texto).toContain('1 tarea(s) sin estimado');
    expect(verificarCifrasObligatorias(texto, [resultado])).toEqual([]);
    expect(verificarNumeros(texto, evidenciaNumerica([resultado], '2026-06-01', '')).ok).toBe(true);
  });

  it('requires the available category estimate in the composed answer', () => {
    expect(verificarCifrasObligatorias('No hay registros de trabajo en ese alcance.', [resultado])).toEqual(['jornales estimados (p1): 50']);
  });

  it('recomposes omissions and falls back to an answer with the estimate', async () => {
    const respuesta = (p: Partial<RespuestaLLM>): RespuestaLLM => ({
      texto: '', llamadas: [], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 },
      ms: 0, modelo: 'fake', finishReason: 'stop', ...p,
    });
    const llm: ClienteLLM = {
      async completar(s) {
        return s.herramientas
          ? respuesta({ llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify(consulta) }] })
          : respuesta({ texto: 'No hay registros de trabajo en ese alcance.' });
      },
    };
    const t = await responderTurno({
      pregunta: 'Jornales de proyectos especiales en mayo', historial: [], hoy: '2026-06-01',
      datos: { ...datos, registros: [] }, llm,
      config: { nombre: 'test', planificador: { modelo: 'fake', esfuerzo: 'none' }, compositor: { modelo: 'fake', esfuerzo: 'none' } },
    });
    expect(t.origen).toBe('determinista');
    expect(t.llamadas).toHaveLength(3);
    expect(t.respuesta).toContain('Jornales estimados');
    expect(t.respuesta).toContain('50');
    expect(verificarCifrasObligatorias(t.respuesta, t.resultados)).toEqual([]);
  });
});
