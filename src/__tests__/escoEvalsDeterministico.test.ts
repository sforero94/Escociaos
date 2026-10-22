import { describe, it, expect } from 'vitest';
import { anclaEncontrada, esAnclaFuerte, evaluarDeterminista } from '@/utils/escoEvals/deterministico';
import { casoBase, corridaBase, herramienta } from './escoEvalsFixtures';

const falla = (r: ReturnType<typeof evaluarDeterminista>, id: string) =>
  r.chequeos.find((c) => c.id === id || c.id.startsWith(id))?.ok === false;

describe('esAnclaFuerte', () => {
  it('fechas, decimales y enteros grandes son fuertes; enteros pequeños no', () => {
    expect(esAnclaFuerte({ claim: 'f', value: '2026-08-12' })).toBe(true);
    expect(esAnclaFuerte({ claim: 'd', value: 0.25 })).toBe(true);
    expect(esAnclaFuerte({ claim: 'g', value: 20672 })).toBe(true);
    expect(esAnclaFuerte({ claim: 'p', value: 4 })).toBe(false);
    expect(esAnclaFuerte({ claim: 'c', value: 0 })).toBe(false);
  });
});

describe('evaluarDeterminista', () => {
  it('«No pude generar una respuesta» falla el chequeo respondio', () => {
    const r = evaluarDeterminista(casoBase(), corridaBase('No pude generar una respuesta.'));
    expect(r.pasa).toBe(false);
    expect(falla(r, 'respondio')).toBe(true);
  });

  it('exige las herramientas requeridas y al menos una de las alternativas', () => {
    const caso = casoBase({ expected_behavior: { tools_must_include: ['get_climate_data'], tools_any_of: ['a', 'b'], tools_forbidden: [], max_tool_calls: null } });
    expect(evaluarDeterminista(caso, corridaBase('ok', [herramienta('get_climate_data')])).pasa).toBe(false);
    expect(evaluarDeterminista(caso, corridaBase('ok', [herramienta('get_climate_data'), herramienta('b')])).pasa).toBe(true);
  });

  it('una herramienta prohibida hace fallar', () => {
    const caso = casoBase({ expected_behavior: { tools_must_include: [], tools_any_of: [], tools_forbidden: ['web_search_agronomic'], max_tool_calls: null } });
    expect(falla(evaluarDeterminista(caso, corridaBase('ok', [herramienta('web_search_agronomic')])), 'herramientas_prohibidas')).toBe(true);
  });

  it('max_tool_calls = 0 reprueba un saludo que consultó la base', () => {
    const caso = casoBase({ expected_behavior: { tools_must_include: [], tools_any_of: [], tools_forbidden: [], max_tool_calls: 0 } });
    expect(falla(evaluarDeterminista(caso, corridaBase('¡Hola!', [herramienta('get_weekly_overview')])), 'max_llamadas')).toBe(true);
    expect(evaluarDeterminista(caso, corridaBase('¡Hola!')).pasa).toBe(true);
  });

  it('should_clarify omite las herramientas esperadas pero no las prohibidas', () => {
    const caso = casoBase({ expected_behavior: { tools_must_include: ['x', 'y'], tools_any_of: [], tools_forbidden: ['z'], max_tool_calls: null, should_clarify: true } });
    expect(evaluarDeterminista(caso, corridaBase('¿Qué definición prefieres?')).pasa).toBe(true);
    expect(evaluarDeterminista(caso, corridaBase('...', [herramienta('z')])).pasa).toBe(false);
  });

  it('una escritura bloqueada hace fallar', () => {
    const r = evaluarDeterminista(casoBase(), corridaBase('Hecho', [], { escriturasBloqueadas: ['POST /rest/v1/esco_memorias'] }));
    expect(falla(r, 'sin_escrituras')).toBe(true);
  });

  it('las anclas fuertes son duras; las débiles solo se reportan', () => {
    const caso = casoBase({
      numeric_anchors: [
        { claim: 'fecha', value: '2026-08-12' },
        { claim: 'dias', value: 4, tol: 1 },
      ],
    });
    const mal = evaluarDeterminista(caso, corridaBase('No llueve desde el 1 de julio, hace 47 días'));
    expect(mal.pasa).toBe(false);
    expect(falla(mal, 'ancla:fecha')).toBe(true);
    const sinDebil = evaluarDeterminista(casoBase({ numeric_anchors: [{ claim: 'dias', value: 4, tol: 1 }] }), corridaBase('hace 47 días'));
    expect(sinDebil.pasa).toBe(true); // ancla débil fallida: no hace fallar
    expect(sinDebil.chequeos.find((c) => c.id === 'ancla:dias')?.ok).toBe(false);
  });

  it('acepta cifras en formato colombiano dentro de la tolerancia', () => {
    const ancla = { claim: 'costo', value: 9262976, tol: 50000 };
    expect(anclaEncontrada(ancla, 'invertimos $9.230.000 en mano de obra')).toBe(true);
    expect(anclaEncontrada(ancla, 'invertimos $9.004.209')).toBe(false);
  });

  it('suma los turnos: un ancla puede aparecer en cualquiera', () => {
    const caso = casoBase({ numeric_anchors: [{ claim: 'x', value: 87.25, tol: 0.5 }] });
    const corrida = corridaBase('primero', [], {});
    corrida.turnos.push({ pregunta: 'y', respuesta: 'son 87.25 jornales', herramientas: [] });
    expect(evaluarDeterminista(caso, corrida).pasa).toBe(true);
  });
});
