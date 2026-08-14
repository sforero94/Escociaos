// ARCHIVO: __tests__/importHatoOcrPesajeCorreccion.test.ts
// DESCRIPCIÓN: N12 de `docs/plan_hato_telegram_estados_agosto_2026.md` --
// decisión D-C: corrección de la lectura de pesaje en lenguaje natural.
// `ocrPesajeCorreccion.ts` es puro: no llama al modelo ni toca Supabase.
//
// Lo que estos tests protegen, en orden de importancia:
//   1. Un nombre que no ancla a UNA vaca del roster NUNCA se aplica -- se
//      reporta como no entendido (mismo criterio que el ancla por foto).
//   2. Una semana/AM-PM/valor que el texto no especifica NUNCA se adivina --
//      también va a "no entendida", no se aplica a medias.
//   3. "Sin dato" limpia la celda a null, nunca a 0.
//   4. Aplicar correcciones sobre el diff es en memoria, nunca escribe nada.

import { describe, it, expect } from 'vitest';
import {
  aplicarCorreccionesADiff,
  construirPromptCorreccionPesaje,
  esquemaJsonCorreccionPesaje,
  interpretarCorreccionPesaje,
  parsearRespuestaModeloCorreccionPesaje,
  type CorreccionPesajeAplicable,
  type ItemCorreccionModeloPesaje,
} from '@/utils/importHato/ocrPesajeCorreccion';
import { construirRosterPesaje, type AnimalRosterPesaje, type CeldaDiffPesaje, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';

const ROSTER_BASE: AnimalRosterPesaje[] = [
  { id: 'uuid-monza', nombre: 'MONZA' },
  { id: 'uuid-bonita', nombre: 'BONITA' },
  { id: 'uuid-camila', nombre: 'CAMILA' },
];
const ROSTER = construirRosterPesaje(ROSTER_BASE);

const FECHAS_5_SEMANAS: Record<SemanaPesaje, string | null> = {
  1: '2026-08-05',
  2: '2026-08-12',
  3: '2026-08-19',
  4: '2026-08-26',
  5: null,
};

function item(parcial: Partial<ItemCorreccionModeloPesaje> & { nombreMencionado: string }): ItemCorreccionModeloPesaje {
  return {
    semana: null,
    subcelda: null,
    sinDato: false,
    valorTexto: null,
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// 1. parsearRespuestaModeloCorreccionPesaje -- tolerancia de forma
// ---------------------------------------------------------------------------

describe('parsearRespuestaModeloCorreccionPesaje', () => {
  it('parsea una respuesta bien formada', () => {
    const bruto = {
      items: [
        { nombre_mencionado: 'MONZA', semana: 2, subcelda: 'am', sin_dato: false, valor_texto: '6.5' },
      ],
    };
    const { items, avisos } = parsearRespuestaModeloCorreccionPesaje(bruto);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      nombreMencionado: 'MONZA',
      semana: 2,
      subcelda: 'am',
      sinDato: false,
      valorTexto: '6.5',
    });
    expect(avisos).toEqual([]);
  });

  it('lanza si "items" no es un arreglo -- no hay nada que rescatar', () => {
    expect(() => parsearRespuestaModeloCorreccionPesaje({})).toThrow(/items/);
  });

  it('lanza si la respuesta no es un objeto', () => {
    expect(() => parsearRespuestaModeloCorreccionPesaje(null)).toThrow();
    expect(() => parsearRespuestaModeloCorreccionPesaje('texto')).toThrow();
  });

  it('un ítem mal formado no aborta el resto -- queda vacío con aviso', () => {
    const bruto = { items: [null, { nombre_mencionado: 'CAMILA', semana: 1, subcelda: 'pm', sin_dato: false, valor_texto: '5' }] };
    const { items, avisos } = parsearRespuestaModeloCorreccionPesaje(bruto);
    expect(items).toHaveLength(2);
    expect(items[0].nombreMencionado).toBe('');
    expect(avisos.some((a) => a.includes('ítem 1'))).toBe(true);
  });

  it('semana ausente/no numérica se lee como null, nunca 0', () => {
    const bruto = { items: [{ nombre_mencionado: 'BONITA', semana: null, subcelda: null, sin_dato: true, valor_texto: null }] };
    const { items } = parsearRespuestaModeloCorreccionPesaje(bruto);
    expect(items[0].semana).toBeNull();
  });

  it('sin_dato=true fuerza valorTexto a null aunque el modelo mande algo', () => {
    const bruto = { items: [{ nombre_mencionado: 'BONITA', semana: 2, subcelda: 'ambos', sin_dato: true, valor_texto: '6' }] };
    const { items } = parsearRespuestaModeloCorreccionPesaje(bruto);
    expect(items[0].valorTexto).toBeNull();
  });

  it('subcelda no reconocida se lee como null, nunca se adivina', () => {
    const bruto = { items: [{ nombre_mencionado: 'MONZA', semana: 1, subcelda: 'mediodia', sin_dato: false, valor_texto: '5' }] };
    const { items } = parsearRespuestaModeloCorreccionPesaje(bruto);
    expect(items[0].subcelda).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. interpretarCorreccionPesaje -- las tres anclas (vaca, semana, valor)
// ---------------------------------------------------------------------------

describe('interpretarCorreccionPesaje', () => {
  it('caso feliz: vaca + semana + AM + valor -> aplicable', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'MONZA', semana: 2, subcelda: 'am', valorTexto: '6.5' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(noEntendidas).toHaveLength(0);
    expect(aplicables).toEqual([
      { animalId: 'uuid-monza', nombre: 'MONZA', semana: 2, fecha: '2026-08-12', subcelda: 'am', valor: 6.5 },
    ]);
  });

  it('"no se pesó" sin AM/PM limpia AMBAS sub-celdas a null, nunca 0', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'BONITA', semana: 3, sinDato: true })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(noEntendidas).toHaveLength(0);
    expect(aplicables).toHaveLength(2);
    expect(aplicables.map((a) => a.subcelda).sort()).toEqual(['am', 'pm']);
    expect(aplicables.every((a) => a.valor === null)).toBe(true);
  });

  it('nombre que no ancla a NINGUNA vaca del roster -> no entendida, nunca se adivina', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'MOROCHA', semana: 1, subcelda: 'am', valorTexto: '7' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(0);
    expect(noEntendidas).toHaveLength(1);
    expect(noEntendidas[0].nombreMencionado).toBe('MOROCHA');
  });

  it('semana ausente -> no entendida, NUNCA se adivina cuál semana', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'BONITA', sinDato: true })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(0);
    expect(noEntendidas).toHaveLength(1);
    expect(noEntendidas[0].detalle).toMatch(/semana/);
  });

  it('semana fuera de 1-5 -> no entendida', () => {
    const { noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'MONZA', semana: 7, subcelda: 'am', valorTexto: '6' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(noEntendidas).toHaveLength(1);
  });

  it('semana válida pero sin ocurrencia real ese mes (fecha null) -> no entendida', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'MONZA', semana: 5, subcelda: 'am', valorTexto: '6' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(0);
    expect(noEntendidas).toHaveLength(1);
    expect(noEntendidas[0].detalle).toMatch(/no existe/);
  });

  it('valor con AM/PM sin especificar y sin sin_dato -> no entendida, no se escribe en ambas a ciegas', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'CAMILA', semana: 1, valorTexto: '6' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(0);
    expect(noEntendidas).toHaveLength(1);
    expect(noEntendidas[0].detalle).toMatch(/AM, PM o ambos/);
  });

  it('valor no interpretable como número -> no entendida', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'CAMILA', semana: 1, subcelda: 'pm', valorTexto: 'no sé' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(0);
    expect(noEntendidas).toHaveLength(1);
  });

  it('acepta fracciones manuscritas en el valor, igual que la lectura por foto', () => {
    const { aplicables } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'MONZA', semana: 2, subcelda: 'am', valorTexto: '6 1/2' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables[0].valor).toBe(6.5);
  });

  it('una frase con varias correcciones produce varios ítems, cada uno evaluado por separado', () => {
    const { aplicables, noEntendidas } = interpretarCorreccionPesaje(
      [
        item({ nombreMencionado: 'MONZA', semana: 2, subcelda: 'am', valorTexto: '6.5' }),
        item({ nombreMencionado: 'BONITA', sinDato: true }), // sin semana -- no entendida
      ],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(1);
    expect(noEntendidas).toHaveLength(1);
  });

  it('nombre a una letra de diferencia se resuelve igual que en la foto (mismo cotejo)', () => {
    const { aplicables } = interpretarCorreccionPesaje(
      [item({ nombreMencionado: 'MONSA', semana: 2, subcelda: 'pm', valorTexto: '7' })],
      ROSTER,
      FECHAS_5_SEMANAS,
    );
    expect(aplicables).toHaveLength(1);
    expect(aplicables[0].animalId).toBe('uuid-monza');
  });
});

// ---------------------------------------------------------------------------
// 3. aplicarCorreccionesADiff -- en memoria, nunca escribe nada
// ---------------------------------------------------------------------------

function celdaDiff(parcial: Partial<CeldaDiffPesaje> & { animalId: string; semana: SemanaPesaje }): CeldaDiffPesaje {
  return {
    nombre: 'X',
    fecha: '2026-08-12',
    litrosAm: null,
    litrosPm: null,
    litrosTotal: null,
    soloUnOrdeno: false,
    existenteId: null,
    clasificacion: 'sin_dato',
    noConfiable: false,
    ...parcial,
  };
}

describe('aplicarCorreccionesADiff', () => {
  it('sin correcciones, devuelve una copia idéntica del diff', () => {
    const diff = [celdaDiff({ animalId: 'uuid-monza', semana: 2, litrosAm: 6, litrosPm: 7, litrosTotal: 13, clasificacion: 'nuevo' })];
    const resultado = aplicarCorreccionesADiff(diff, []);
    expect(resultado).toEqual(diff);
    expect(resultado).not.toBe(diff); // copia, no la misma referencia
  });

  it('corrige AM de una celda existente y recalcula el total', () => {
    const diff = [celdaDiff({ animalId: 'uuid-monza', semana: 2, litrosAm: 6, litrosPm: 7, litrosTotal: 13, clasificacion: 'nuevo' })];
    const correccion: CorreccionPesajeAplicable = { animalId: 'uuid-monza', nombre: 'MONZA', semana: 2, fecha: '2026-08-12', subcelda: 'am', valor: 6.5 };
    const resultado = aplicarCorreccionesADiff(diff, [correccion]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].litrosAm).toBe(6.5);
    expect(resultado[0].litrosPm).toBe(7);
    expect(resultado[0].litrosTotal).toBe(13.5);
  });

  it('"sin dato" en ambas sub-celdas deja litrosTotal en null, nunca 0', () => {
    const diff = [celdaDiff({ animalId: 'uuid-bonita', semana: 3, litrosAm: 5, litrosPm: 5, litrosTotal: 10, existenteId: 'x1', clasificacion: 'cambio' })];
    const correcciones: CorreccionPesajeAplicable[] = [
      { animalId: 'uuid-bonita', nombre: 'BONITA', semana: 3, fecha: '2026-08-19', subcelda: 'am', valor: null },
      { animalId: 'uuid-bonita', nombre: 'BONITA', semana: 3, fecha: '2026-08-19', subcelda: 'pm', valor: null },
    ];
    const resultado = aplicarCorreccionesADiff(diff, correcciones);
    expect(resultado[0].litrosAm).toBeNull();
    expect(resultado[0].litrosPm).toBeNull();
    expect(resultado[0].litrosTotal).toBeNull();
    expect(resultado[0].clasificacion).toBe('sin_dato');
  });

  it('una corrección de una celda que NO estaba en el diff se agrega, nunca se descarta', () => {
    const diff = [celdaDiff({ animalId: 'uuid-monza', semana: 2, litrosAm: 6, litrosPm: 7, litrosTotal: 13 })];
    const correccion: CorreccionPesajeAplicable = { animalId: 'uuid-camila', nombre: 'CAMILA', semana: 1, fecha: '2026-08-05', subcelda: 'pm', valor: 5 };
    const resultado = aplicarCorreccionesADiff(diff, [correccion]);
    expect(resultado).toHaveLength(2);
    const nueva = resultado.find((c) => c.animalId === 'uuid-camila')!;
    expect(nueva.litrosPm).toBe(5);
    expect(nueva.litrosTotal).toBe(5);
    expect(nueva.clasificacion).toBe('nuevo');
  });

  it('una celda corregida con id existente se reclasifica como cambio, no sin_cambio (nunca se compara contra el valor viejo perdido)', () => {
    const diff = [celdaDiff({ animalId: 'uuid-monza', semana: 2, litrosAm: 6, litrosPm: 7, litrosTotal: 13, existenteId: 'p-1', clasificacion: 'sin_cambio' })];
    const correccion: CorreccionPesajeAplicable = { animalId: 'uuid-monza', nombre: 'MONZA', semana: 2, fecha: '2026-08-12', subcelda: 'am', valor: 6.5 };
    const resultado = aplicarCorreccionesADiff(diff, [correccion]);
    expect(resultado[0].clasificacion).toBe('cambio');
  });

  it('una corrección deja noConfiable en false -- un humano ya lo confirmó', () => {
    const diff = [celdaDiff({ animalId: 'uuid-monza', semana: 2, litrosAm: 6, litrosPm: 7, litrosTotal: 13, noConfiable: true })];
    const correccion: CorreccionPesajeAplicable = { animalId: 'uuid-monza', nombre: 'MONZA', semana: 2, fecha: '2026-08-12', subcelda: 'pm', valor: 8 };
    const resultado = aplicarCorreccionesADiff(diff, [correccion]);
    expect(resultado[0].noConfiable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Esquema JSON y prompt
// ---------------------------------------------------------------------------

describe('esquemaJsonCorreccionPesaje', () => {
  it('exige los 5 campos por ítem, sin roster de nombres embebido', () => {
    const esquema = esquemaJsonCorreccionPesaje() as any;
    const propsItem = esquema.properties.items.items.properties;
    expect(Object.keys(propsItem).sort()).toEqual(['nombre_mencionado', 'semana', 'sin_dato', 'subcelda', 'valor_texto']);
    expect(esquema.properties.items.items.required.sort()).toEqual(
      ['nombre_mencionado', 'semana', 'sin_dato', 'subcelda', 'valor_texto'].sort(),
    );
  });
});

describe('construirPromptCorreccionPesaje', () => {
  it('no recibe roster como parámetro -- no puede embeber una lista real de vacas', () => {
    // La firma no toma argumentos: es estructuralmente imposible que el
    // prompt cambie según el hato vigente. Esa es la garantía real (no un
    // grep de nombres, que solo probaría que estos ejemplos en particular
    // no colisionan con estos fixtures en particular).
    expect(construirPromptCorreccionPesaje.length).toBe(0);
  });

  it('instruye a no adivinar semana/valor cuando el texto no los da', () => {
    const prompt = construirPromptCorreccionPesaje();
    expect(prompt).toMatch(/NUNCA inventes/);
  });
});
