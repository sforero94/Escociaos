import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parsearGolden, seleccionarCasos, variantesDelCaso } from '@/utils/escoEvals/golden';
import { evaluarDeterminista } from '@/utils/escoEvals/deterministico';
import { casoBase, corridaDesdeOriginalPura } from './escoEvalsFixtures';

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

// El conjunto dorado real trae datos de la finca y no está en git: si no está, la prueba se omite.
const RUTA_GOLDEN = resolve(__dirname, '../../evals/esco/golden/esco_golden_set_v2.jsonl');
describe.skipIf(!existsSync(RUTA_GOLDEN))('conjunto dorado v2 (local)', () => {
  const casos = existsSync(RUTA_GOLDEN) ? parsearGolden(readFileSync(RUTA_GOLDEN, 'utf8')) : [];
  const incluidos = seleccionarCasos(casos);

  it('tiene 59 casos, 56 incluidos y todas las referencias aprobadas', () => {
    expect(casos).toHaveLength(59);
    expect(incluidos).toHaveLength(56);
    expect(incluidos.every((c) => c.golden_status === 'aprobado')).toBe(true);
  });

  it('detecta errores de cifra y conserva las discrepancias con el veredicto humano', () => {
    const por = (id: string) => casos.find((c) => c.id === id)!;
    const pasa = (id: string) => evaluarDeterminista(por(id), corridaDesdeOriginalPura(por(id))).pasa;
    expect(pasa('ESCO-GS-015')).toBe(false); // 678/850 canecas (base: 573 de 634.7)
    expect(pasa('ESCO-GS-012')).toBe(false); // «No pude generar una respuesta»
    expect(pasa('ESCO-GS-050')).toBe(false); // negación falsa de partos
    // The historical human label is correct, but the approved rubric also
    // requires the lote comparison (239.5), which this answer omits.
    // Keep the discrepancy visible; never weaken the rubric to fit the label.
    expect(pasa('ESCO-GS-001')).toBe(false);
    expect(pasa('ESCO-GS-040')).toBe(true); // control positivo (164 / 284 / 274)
  });
});
