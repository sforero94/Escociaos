// Solo controles sintéticos de fábrica; no lectura de archivos ni datos privados.
import { describe, it, expect } from 'vitest';
import { parsearGolden, seleccionarCasos, variantesDelCaso } from '@/utils/escoEvals/golden';
import { casoBase } from './escoEvalsFixtures';

const linea = (c: unknown) => JSON.stringify(c);

describe('parsearGolden', () => {
  it('lee JSONL y valida la forma', () => {
    const casos = parsearGolden([linea(casoBase({ id: 'ESCO-GS-001' })), linea(casoBase({ id: 'ESCO-GS-002' }))].join('\n') + '\n');
    expect(casos.map((c) => c.id)).toEqual(['ESCO-GS-001', 'ESCO-GS-002']);
  });

  it('rechaza ids repetidos, JSON roto y campos faltantes', () => {
    expect(() => parsearGolden([linea(casoBase()), linea(casoBase())].join('\n'))).toThrow(/repetido/);
    expect(() => parsearGolden('{no es json')).toThrow(/JSON inválido/);
    expect(() => parsearGolden(linea({ ...casoBase(), must: undefined }))).toThrow(/must/);
    expect(() => parsearGolden('')).toThrow(/vacío/);
  });

  it('rejects malformed nested data and impossible dates before any API call', () => {
    for (const patch of [
      { tags: [null] }, { include_in_golden: 'yes' }, { golden_status: 'pendiente' },
      { as_of_bogota: '2026-02-30 10:00' }, { as_of_bogota: '2026-08-16 25:00' },
      { numeric_anchors: [{ claim: 'x', value: 5, tol: -1 }] },
      { prior_context: [null] }, { original: { runs: [], answer_primary: null } },
    ]) expect(() => parsearGolden(linea({ ...casoBase(), ...patch }))).toThrow();
  });
});

describe('seleccionarCasos', () => {
  const casos = [
    casoBase({ id: 'ESCO-GS-001', key: 'A01', domain: 'aplicaciones', tags: ['x'] }),
    casoBase({ id: 'ESCO-GS-002', key: 'C01', domain: 'clima', tags: ['y'] }),
    casoBase({ id: 'ESCO-GS-003', key: 'C02', domain: 'clima', include_in_golden: false }),
  ];
  it('excluye por defecto los que no van en el conjunto dorado', () => {
    expect(seleccionarCasos(casos).map((c) => c.id)).toEqual(['ESCO-GS-001', 'ESCO-GS-002']);
    expect(seleccionarCasos(casos, { incluirExcluidos: true })).toHaveLength(3);
  });
  it('filtra por id o clave, dominio, etiqueta y límite', () => {
    expect(seleccionarCasos(casos, { ids: ['c01'] }).map((c) => c.id)).toEqual(['ESCO-GS-002']);
    expect(seleccionarCasos(casos, { ids: ['ESCO-GS-001'] })).toHaveLength(1);
    expect(seleccionarCasos(casos, { dominios: ['clima'] })).toHaveLength(1);
    expect(seleccionarCasos(casos, { etiquetas: ['x'] })).toHaveLength(1);
    expect(seleccionarCasos(casos, { limite: 1 })).toHaveLength(1);
  });
});

describe('variantesDelCaso', () => {
  it('la principal siempre; las paráfrasis solo si se piden', () => {
    const c = casoBase({ paraphrases: ['≈ otra forma'] });
    expect(variantesDelCaso(c, false)).toHaveLength(1);
    expect(variantesDelCaso(c, true)[1]).toEqual({ nombre: 'parafrasis_1', pregunta: 'otra forma' });
  });
});
