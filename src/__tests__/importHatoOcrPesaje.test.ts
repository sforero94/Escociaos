// ARCHIVO: __tests__/importHatoOcrPesaje.test.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- la ruta de
// carga de la planilla MENSUAL de pesaje POR FOTO. `ocrPesaje.ts` es puro:
// no llama al modelo de visión ni toca Supabase.
//
// Lo que estos tests protegen, en orden de importancia:
//   1. ANTI-ROW-DRIFT POR NOMBRE: una fila cuyo nombre impreso no cuadra
//      (únicamente) con el roster NUNCA se procesa ni se adjudica.
//   2. "SIN DATO, NUNCA 0" EN LA LECTURA: una celda `baja`/`ilegible` entra
//      vacía, jamás litros adivinados; una semana sin ningún ordeño legible
//      nunca produce `litros_total = 0`.
//   3. El diff contra lo ya guardado clasifica cada celda sin adivinar y sin
//      escribir semanas que ese mes no tiene (5ª semana en un mes de 4).

import { describe, it, expect } from 'vitest';
import {
  COLUMNAS_PESAJE_OCR,
  SEMANAS_PESAJE,
  CLASIFICACIONES_PESAJE_ESCRIBIBLES,
  claveColumnaPesaje,
  construirDiffPesaje,
  construirFilasPesajeInsertables,
  construirPromptOcrPesaje,
  construirRosterPesaje,
  esCandidataRosterPesaje,
  esquemaJsonOcrPesaje,
  ETAPAS_ROSTER_PESAJE,
  leerLitrosSemana,
  parsearRespuestaModeloOcrPesaje,
  procesarLecturaOcrPesaje,
  validarAnclaFilaPesaje,
  type AnimalRosterPesaje,
  type CeldaOcrPesaje,
  type ColumnaPesajeOcr,
  type FilaOcrPesaje,
  type FilaPesajeConfirmada,
  type PesajeExistente,
  type SemanaPesaje,
} from '@/utils/importHato/ocrPesaje';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROSTER_BASE: AnimalRosterPesaje[] = [
  { id: 'uuid-alina', nombre: 'ALINA' },
  { id: 'uuid-gallega', nombre: 'GALLEGA' },
  { id: 'uuid-camila', nombre: 'CAMILA' },
];

function celda(texto: string, confianza: CeldaOcrPesaje['confianza'] = 'alta'): CeldaOcrPesaje {
  return { texto, confianza };
}

function celdas(parcial: Partial<Record<ColumnaPesajeOcr, CeldaOcrPesaje>> = {}): Record<ColumnaPesajeOcr, CeldaOcrPesaje> {
  const salida = {} as Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
  for (const col of COLUMNAS_PESAJE_OCR) salida[col] = parcial[col] ?? celda('');
  return salida;
}

function filaOcr(datos: Partial<FilaOcrPesaje> & { nombreImpreso: string }): FilaOcrPesaje {
  return {
    pagina: datos.pagina ?? 1,
    orden: datos.orden ?? 1,
    nombreImpreso: datos.nombreImpreso,
    celdas: datos.celdas ?? celdas(),
  };
}

function celdasJson(parcial: Record<string, { texto: string; confianza: string }>) {
  const salida: Record<string, { texto: string; confianza: string }> = {};
  for (const col of COLUMNAS_PESAJE_OCR) {
    salida[col] = parcial[col] ?? { texto: '', confianza: 'alta' };
  }
  return salida;
}

const FECHAS_5_SEMANAS: Record<SemanaPesaje, string | null> = {
  1: '2026-07-01',
  2: '2026-07-08',
  3: '2026-07-15',
  4: '2026-07-22',
  5: '2026-07-29',
};

const FECHAS_4_SEMANAS: Record<SemanaPesaje, string | null> = {
  1: '2026-08-05',
  2: '2026-08-12',
  3: '2026-08-19',
  4: '2026-08-26',
  5: null, // agosto 2026 solo tiene 4 miércoles
};

// ---------------------------------------------------------------------------
// 1. Vocabulario de columnas
// ---------------------------------------------------------------------------

describe('vocabulario de columnas de pesaje', () => {
  it('son 10: 5 semanas × (AM, PM), en orden', () => {
    expect(COLUMNAS_PESAJE_OCR).toEqual([
      's1_am', 's1_pm', 's2_am', 's2_pm', 's3_am', 's3_pm', 's4_am', 's4_pm', 's5_am', 's5_pm',
    ]);
  });

  it('claveColumnaPesaje construye la clave esperada', () => {
    expect(claveColumnaPesaje(3, 'pm')).toBe('s3_pm');
  });

  it('nunca incluye una columna Total -- se deriva, nunca se transcribe', () => {
    expect(COLUMNAS_PESAJE_OCR.some((c) => c.includes('total'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. parsearRespuestaModeloOcrPesaje -- tolerancia de forma
// ---------------------------------------------------------------------------

describe('parsearRespuestaModeloOcrPesaje', () => {
  it('parsea una respuesta bien formada', () => {
    const bruto = {
      filas: [
        { nombre_impreso: 'ALINA', celdas: celdasJson({ s1_am: { texto: '7', confianza: 'alta' }, s1_pm: { texto: '8', confianza: 'alta' } }) },
      ],
    };
    const lectura = parsearRespuestaModeloOcrPesaje(bruto, 1);
    expect(lectura.pagina).toBe(1);
    expect(lectura.filas).toHaveLength(1);
    expect(lectura.filas[0].nombreImpreso).toBe('ALINA');
    expect(lectura.filas[0].celdas.s1_am).toEqual({ texto: '7', confianza: 'alta' });
    expect(lectura.avisos).toEqual([]);
  });

  it('lanza si "filas" no es un arreglo -- no hay nada que rescatar', () => {
    expect(() => parsearRespuestaModeloOcrPesaje({}, 1)).toThrow(/filas/);
  });

  it('lanza si la respuesta no es un objeto', () => {
    expect(() => parsearRespuestaModeloOcrPesaje(null, 1)).toThrow();
    expect(() => parsearRespuestaModeloOcrPesaje('texto', 1)).toThrow();
  });

  it('una fila mal formada no aborta la página -- queda como fila vacía con aviso', () => {
    const bruto = { filas: [null, { nombre_impreso: 'CAMILA', celdas: celdasJson({}) }] };
    const lectura = parsearRespuestaModeloOcrPesaje(bruto, 2);
    expect(lectura.filas).toHaveLength(2);
    expect(lectura.filas[0].nombreImpreso).toBe('');
    expect(lectura.filas[0].celdas.s1_am.confianza).toBe('ilegible');
    expect(lectura.avisos.some((a) => a.includes('fila 1'))).toBe(true);
  });

  it('una columna ausente en la respuesta se marca ilegible, nunca en blanco silencioso', () => {
    const bruto = { filas: [{ nombre_impreso: 'ALINA', celdas: {} }] };
    const lectura = parsearRespuestaModeloOcrPesaje(bruto, 1);
    for (const col of COLUMNAS_PESAJE_OCR) {
      expect(lectura.filas[0].celdas[col]).toEqual({ texto: '', confianza: 'ilegible' });
    }
  });

  it('una confianza no reconocida se degrada a ilegible con aviso, nunca se asume buena', () => {
    const bruto = { filas: [{ nombre_impreso: 'ALINA', celdas: celdasJson({ s2_pm: { texto: '9', confianza: 'segura' } }) }] };
    const lectura = parsearRespuestaModeloOcrPesaje(bruto, 1);
    // El texto crudo se conserva aunque la confianza se degrade (mismo
    // criterio que `ocrChequeo.ts`: nada se pierde en silencio) -- lo que
    // SÍ cambia es que una confianza no 'alta' nunca pasa como litros
    // (ver `leerLitrosSemana` más abajo).
    expect(lectura.filas[0].celdas.s2_pm).toEqual({ texto: '9', confianza: 'ilegible' });
    expect(lectura.avisos.some((a) => a.includes("'segura'"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Roster + ancla (anti-row-drift por nombre)
// ---------------------------------------------------------------------------

describe('construirRosterPesaje', () => {
  it('indexa por nombre normalizado', () => {
    const roster = construirRosterPesaje(ROSTER_BASE);
    expect(roster.entradas).toHaveLength(3);
    expect(roster.porNombre.get('ALINA')).toHaveLength(1);
  });

  it('descarta animales sin nombre -- sin ancla que cotejar', () => {
    const roster = construirRosterPesaje([...ROSTER_BASE, { id: 'uuid-sin-nombre', nombre: '' }]);
    expect(roster.entradas).toHaveLength(3);
  });

  it('agrupa homónimas (dos vacas activas con el mismo nombre) bajo la misma clave', () => {
    const roster = construirRosterPesaje([...ROSTER_BASE, { id: 'uuid-alina-2', nombre: 'Alina' }]);
    expect(roster.porNombre.get('ALINA')).toHaveLength(2);
  });
});

describe('validarAnclaFilaPesaje', () => {
  const roster = construirRosterPesaje(ROSTER_BASE);

  it('nombre exacto -> ancla resuelta', () => {
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: 'ALINA' }), roster);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.entrada.id).toBe('uuid-alina');
  });

  it('nombre exacto insensible a tilde/mayúscula -> ancla resuelta', () => {
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: 'gallega' }), roster);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.entrada.id).toBe('uuid-gallega');
  });

  it('nombre vacío/ilegible -> no leída', () => {
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: '' }), roster);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('nombre_ilegible');
  });

  it('nombre que no está en el roster -> no leída, nunca adjudicada', () => {
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: 'MOROCHA' }), roster);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('nombre_fuera_del_roster');
  });

  it('una letra de diferencia, único candidato cercano -> ancla resuelta con aviso', () => {
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: 'ALINE' }), roster);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.entrada.id).toBe('uuid-alina');
      expect(resultado.avisos.length).toBeGreaterThan(0);
    }
  });

  it('dos vacas activas con el MISMO nombre -> ambiguo, nunca se adjudica sola', () => {
    const rosterDuplicado = construirRosterPesaje([...ROSTER_BASE, { id: 'uuid-alina-2', nombre: 'Alina' }]);
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: 'ALINA' }), rosterDuplicado);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('nombre_ambiguo_en_roster');
  });

  it('a una letra de DOS vacas distintas -> ambiguo, no se adivina cuál', () => {
    // 'CAMILO' está a 1 letra tanto de 'CAMILA' como de otra vaca sintética 'CAMILU'.
    const rosterAmbiguo = construirRosterPesaje([...ROSTER_BASE, { id: 'uuid-camilu', nombre: 'CAMILU' }]);
    const resultado = validarAnclaFilaPesaje(filaOcr({ nombreImpreso: 'CAMILO' }), rosterAmbiguo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('nombre_ambiguo_en_roster');
  });
});

// ---------------------------------------------------------------------------
// 4. procesarLecturaOcrPesaje -- orquestador
// ---------------------------------------------------------------------------

describe('procesarLecturaOcrPesaje', () => {
  const roster = construirRosterPesaje(ROSTER_BASE);

  it('confirma las filas cuyo nombre ancla contra el roster', () => {
    const resultado = procesarLecturaOcrPesaje(
      [{ pagina: 1, filas: [filaOcr({ nombreImpreso: 'ALINA' }), filaOcr({ nombreImpreso: 'CAMILA', orden: 2 })], avisos: [] }],
      roster,
    );
    expect(resultado.filasConfirmadas).toHaveLength(2);
    expect(resultado.filasNoLeidas).toHaveLength(0);
  });

  it('una fila sin ancla queda en filasNoLeidas, con las celdas intactas (nada se pierde en silencio)', () => {
    const filaMala = filaOcr({ nombreImpreso: 'DESCONOCIDA', celdas: celdas({ s1_am: celda('7') }) });
    const resultado = procesarLecturaOcrPesaje([{ pagina: 1, filas: [filaMala], avisos: [] }], roster);
    expect(resultado.filasConfirmadas).toHaveLength(0);
    expect(resultado.filasNoLeidas).toHaveLength(1);
    expect(resultado.filasNoLeidas[0].celdas.s1_am.texto).toBe('7');
  });

  it('vacas del roster que no aparecen en ninguna foto se reportan como sin leer', () => {
    const resultado = procesarLecturaOcrPesaje([{ pagina: 1, filas: [filaOcr({ nombreImpreso: 'ALINA' })], avisos: [] }], roster);
    expect(resultado.vacasSinLeer.map((v) => v.nombre).sort()).toEqual(['CAMILA', 'GALLEGA']);
  });

  it('la misma vaca en dos fotos con la MISMA lectura conserva una sola fila', () => {
    const c = celdas({ s1_am: celda('7') });
    const resultado = procesarLecturaOcrPesaje(
      [
        { pagina: 1, filas: [filaOcr({ nombreImpreso: 'ALINA', celdas: c })], avisos: [] },
        { pagina: 2, filas: [filaOcr({ nombreImpreso: 'ALINA', celdas: c })], avisos: [] },
      ],
      roster,
    );
    expect(resultado.filasConfirmadas).toHaveLength(1);
    expect(resultado.advertencias.some((a) => a.includes('MISMA lectura'))).toBe(true);
  });

  it('la misma vaca en dos fotos con lecturas DISTINTAS no se adjudica -- ninguna de las dos entra', () => {
    const resultado = procesarLecturaOcrPesaje(
      [
        { pagina: 1, filas: [filaOcr({ nombreImpreso: 'ALINA', celdas: celdas({ s1_am: celda('7') }) })], avisos: [] },
        { pagina: 2, filas: [filaOcr({ nombreImpreso: 'ALINA', celdas: celdas({ s1_am: celda('9') }) })], avisos: [] },
      ],
      roster,
    );
    expect(resultado.filasConfirmadas).toHaveLength(0);
    expect(resultado.filasNoLeidas.filter((f) => f.motivo === 'lectura_repetida_divergente')).toHaveLength(2);
  });

  it('celdasNoConfiables lista solo las columnas por debajo de confianza alta', () => {
    const resultado = procesarLecturaOcrPesaje(
      [{ pagina: 1, filas: [filaOcr({ nombreImpreso: 'ALINA', celdas: celdas({ s1_am: celda('7', 'baja'), s2_pm: celda('', 'ilegible') }) })], avisos: [] }],
      roster,
    );
    expect(resultado.filasConfirmadas[0].celdasNoConfiables.sort()).toEqual(['s1_am', 's2_pm']);
  });
});

// ---------------------------------------------------------------------------
// 5. leerLitrosSemana -- "sin dato, nunca 0"
// ---------------------------------------------------------------------------

describe('leerLitrosSemana', () => {
  function filaConfirmada(parcial: Partial<Record<ColumnaPesajeOcr, CeldaOcrPesaje>>): FilaPesajeConfirmada {
    return {
      pagina: 1,
      orden: 1,
      animalId: 'uuid-alina',
      nombre: 'ALINA',
      nombreImpreso: 'ALINA',
      celdas: celdas(parcial),
      celdasNoConfiables: [],
      avisos: [],
    };
  }

  it('lee AM y PM cuando ambos son confianza alta', () => {
    const fila = filaConfirmada({ s1_am: celda('7'), s1_pm: celda('8') });
    expect(leerLitrosSemana(fila, 1)).toEqual({ litrosAm: 7, litrosPm: 8 });
  });

  it('acepta coma decimal (mismo parser que el resto del repo)', () => {
    const fila = filaConfirmada({ s1_am: celda('7,5') });
    expect(leerLitrosSemana(fila, 1).litrosAm).toBe(7.5);
  });

  it('una celda de confianza baja/ilegible NUNCA pasa como litros -- null, no 0', () => {
    const fila = filaConfirmada({ s1_am: celda('7', 'baja'), s1_pm: celda('', 'ilegible') });
    expect(leerLitrosSemana(fila, 1)).toEqual({ litrosAm: null, litrosPm: null });
  });

  it('una celda vacía con confianza alta (genuinamente en blanco) es null, no 0', () => {
    const fila = filaConfirmada({ s1_am: celda('', 'alta') });
    expect(leerLitrosSemana(fila, 1).litrosAm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. construirDiffPesaje
// ---------------------------------------------------------------------------

describe('construirDiffPesaje', () => {
  function filaConfirmada(nombre: string, id: string, parcial: Partial<Record<ColumnaPesajeOcr, CeldaOcrPesaje>>): FilaPesajeConfirmada {
    const c = celdas(parcial);
    // Mismo cálculo que `procesarLecturaOcrPesaje`: cualquier celda por
    // debajo de confianza 'alta' entra a `celdasNoConfiables`.
    const celdasNoConfiables = COLUMNAS_PESAJE_OCR.filter((col) => c[col].confianza !== 'alta');
    return { pagina: 1, orden: 1, animalId: id, nombre, nombreImpreso: nombre, celdas: c, celdasNoConfiables, avisos: [] };
  }

  it('semana con AM y PM legibles y sin fila existente -> nuevo', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', { s1_am: celda('7'), s1_pm: celda('8') })];
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, new Map());
    const celdaS1 = diff.find((c) => c.semana === 1)!;
    expect(celdaS1.clasificacion).toBe('nuevo');
    expect(celdaS1.litrosTotal).toBe(15);
    expect(celdaS1.fecha).toBe('2026-07-01');
  });

  it('semana sin ningún ordeño legible -> sin_dato, litrosTotal null (nunca 0)', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', {})];
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, new Map());
    const celdaS1 = diff.find((c) => c.semana === 1)!;
    expect(celdaS1.clasificacion).toBe('sin_dato');
    expect(celdaS1.litrosTotal).toBeNull();
  });

  it('solo un ordeño legible -> soloUnOrdeno true, total = ese único valor', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', { s1_am: celda('7') })];
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, new Map());
    const celdaS1 = diff.find((c) => c.semana === 1)!;
    expect(celdaS1.soloUnOrdeno).toBe(true);
    expect(celdaS1.litrosTotal).toBe(7);
  });

  it('coincide exactamente con lo existente -> sin_cambio', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', { s1_am: celda('7'), s1_pm: celda('8') })];
    const existentes = new Map<string, Map<string, PesajeExistente>>([
      ['uuid-alina', new Map([['2026-07-01', { id: 'pesaje-1', litrosAm: 7, litrosPm: 8, litrosTotal: 15 }]])],
    ]);
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, existentes);
    const celdaS1 = diff.find((c) => c.semana === 1)!;
    expect(celdaS1.clasificacion).toBe('sin_cambio');
    expect(celdaS1.existenteId).toBe('pesaje-1');
  });

  it('difiere de lo existente -> cambio', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', { s1_am: celda('9'), s1_pm: celda('8') })];
    const existentes = new Map<string, Map<string, PesajeExistente>>([
      ['uuid-alina', new Map([['2026-07-01', { id: 'pesaje-1', litrosAm: 7, litrosPm: 8, litrosTotal: 15 }]])],
    ]);
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, existentes);
    const celdaS1 = diff.find((c) => c.semana === 1)!;
    expect(celdaS1.clasificacion).toBe('cambio');
  });

  it('una semana sin ocurrencia real ese mes (fecha null) no genera ninguna celda', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', { s5_am: celda('7'), s5_pm: celda('8') })];
    const diff = construirDiffPesaje(filas, FECHAS_4_SEMANAS, new Map());
    expect(diff.some((c) => c.semana === 5)).toBe(false);
    // El resto de semanas sí generan celda (aunque vacías -> sin_dato).
    expect(diff).toHaveLength(4);
  });

  it('produce 5 celdas por vaca cuando el mes tiene 5 ocurrencias', () => {
    const filas = [filaConfirmada('ALINA', 'uuid-alina', {})];
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, new Map());
    expect(diff).toHaveLength(SEMANAS_PESAJE.length);
  });

  it('noConfiable distingue "en blanco de verdad" de "el modelo no pudo leer" -- ambas dan litros null', () => {
    const filas = [
      filaConfirmada('ALINA', 'uuid-alina', { s1_am: celda('7', 'baja'), s2_am: celda('') }),
    ];
    const diff = construirDiffPesaje(filas, FECHAS_5_SEMANAS, new Map());
    const s1 = diff.find((c) => c.semana === 1)!;
    const s2 = diff.find((c) => c.semana === 2)!;
    expect(s1.litrosAm).toBeNull();
    expect(s1.noConfiable).toBe(true); // el modelo vio algo pero dudó -- hay que revisar el papel
    expect(s2.litrosAm).toBeNull();
    expect(s2.noConfiable).toBe(false); // celda genuinamente en blanco, confianza alta
  });
});

// ---------------------------------------------------------------------------
// 7. construirFilasPesajeInsertables
// ---------------------------------------------------------------------------

describe('construirFilasPesajeInsertables', () => {
  it('excluye sin_dato -- nunca escribe una vaca sin litros', () => {
    const filas = construirFilasPesajeInsertables([
      { animalId: 'a', nombre: 'A', semana: 1, fecha: '2026-07-01', litrosAm: null, litrosPm: null, litrosTotal: null, soloUnOrdeno: false, existenteId: null, clasificacion: 'sin_dato', noConfiable: false },
    ]);
    expect(filas).toHaveLength(0);
  });

  it('incluye nuevo/cambio/sin_cambio con la forma insertable correcta', () => {
    const filas = construirFilasPesajeInsertables([
      { animalId: 'a', nombre: 'A', semana: 1, fecha: '2026-07-01', litrosAm: 7, litrosPm: 8, litrosTotal: 15, soloUnOrdeno: false, existenteId: null, clasificacion: 'nuevo', noConfiable: false },
      { animalId: 'b', nombre: 'B', semana: 1, fecha: '2026-07-01', litrosAm: 6, litrosPm: null, litrosTotal: 6, soloUnOrdeno: true, existenteId: 'pesaje-b', clasificacion: 'cambio', noConfiable: false },
    ]);
    expect(filas).toEqual([
      { animal_id: 'a', fecha: '2026-07-01', litros_am: 7, litros_pm: 8, litros_total: 15, existenteId: null },
      { animal_id: 'b', fecha: '2026-07-01', litros_am: 6, litros_pm: null, litros_total: 6, existenteId: 'pesaje-b' },
    ]);
  });

  it('CLASIFICACIONES_PESAJE_ESCRIBIBLES no incluye sin_dato', () => {
    expect(CLASIFICACIONES_PESAJE_ESCRIBIBLES.has('sin_dato')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Esquema JSON y prompt
// ---------------------------------------------------------------------------

describe('esquemaJsonOcrPesaje', () => {
  it('exige las 10 columnas y nunca una columna Total', () => {
    const esquema = esquemaJsonOcrPesaje() as any;
    const propsCelda = esquema.properties.filas.items.properties.celdas;
    expect(propsCelda.required.sort()).toEqual([...COLUMNAS_PESAJE_OCR].sort());
    expect(propsCelda.properties.total).toBeUndefined();
    expect(propsCelda.additionalProperties).toBe(false);
  });

  it('no pide numero_impreso -- esta planilla no lleva chapeta', () => {
    const esquema = esquemaJsonOcrPesaje() as any;
    expect(esquema.properties.filas.items.properties.numero_impreso).toBeUndefined();
    expect(esquema.properties.filas.items.required).toEqual(['nombre_impreso', 'celdas']);
  });
});

describe('construirPromptOcrPesaje', () => {
  it('menciona que no hay chapeta y que Total no se transcribe', () => {
    const prompt = construirPromptOcrPesaje();
    expect(prompt).toMatch(/SIN número de chapeta/i);
    expect(prompt).toMatch(/no debes transcribirla/i);
  });
});

// ---------------------------------------------------------------------------
// Roster de la planilla (decisión del dueño, 2026-08-11). Una sola definición
// para el PDF, el roster del OCR y la revalidación del commit -- si estos
// tres se desalinean, una vaca impresa sale "no leída" o sus litros se
// pierden después de que Martha los aprobó.
// ---------------------------------------------------------------------------

describe('esCandidataRosterPesaje', () => {
  const base = { etapa: 'vaca', estado: 'activa', ultimoServicioFecha: null };

  it('TODA vaca activa entra -- ordeño y horro por igual', () => {
    expect(esCandidataRosterPesaje(base)).toBe(true);
    expect(esCandidataRosterPesaje({ ...base, ultimoServicioFecha: '2026-03-08' })).toBe(true);
  });

  it('una novilla entra SOLO si ya tiene servicio registrado', () => {
    expect(esCandidataRosterPesaje({ ...base, etapa: 'novilla' })).toBe(false);
    expect(esCandidataRosterPesaje({ ...base, etapa: 'novilla', ultimoServicioFecha: '2026-04-09' })).toBe(true);
  });

  it('las terneras nunca entran, ni con servicio', () => {
    expect(esCandidataRosterPesaje({ ...base, etapa: 'ternera' })).toBe(false);
    expect(esCandidataRosterPesaje({ ...base, etapa: 'ternera', ultimoServicioFecha: '2026-04-09' })).toBe(false);
  });

  it('un animal que ya no está activo nunca entra, cualquiera sea su etapa', () => {
    for (const estado of ['vendida', 'muerta', null]) {
      expect(esCandidataRosterPesaje({ ...base, estado })).toBe(false);
    }
  });

  it('etapa nula o desconocida no entra -- nunca se asume "es vaca"', () => {
    expect(esCandidataRosterPesaje({ ...base, etapa: null })).toBe(false);
    expect(esCandidataRosterPesaje({ ...base, etapa: 'toro' })).toBe(false);
  });

  it('ETAPAS_ROSTER_PESAJE cubre toda etapa que el predicado puede aceptar', () => {
    // El `.in('etapa', …)` de las consultas es un filtro ancho: si dejara
    // fuera una etapa que el predicado acepta, esa fila nunca llegaría a
    // evaluarse y desaparecería en silencio.
    for (const etapa of ['vaca', 'novilla']) {
      expect(ETAPAS_ROSTER_PESAJE).toContain(etapa);
    }
  });
});

// ---------------------------------------------------------------------------
// Fracciones manuscritas en la celda de litros (reporte del dueño,
// 2026-08-11: "el OCR no detectó el 1/2").
// ---------------------------------------------------------------------------

describe('leerLitrosSemana -- fracciones y decimales manuscritos', () => {
  function filaCon(am: string, pm: string): FilaPesajeConfirmada {
    const celdas = {} as Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
    for (const col of COLUMNAS_PESAJE_OCR) celdas[col] = { texto: '', confianza: 'alta' };
    celdas[claveColumnaPesaje(1, 'am')] = { texto: am, confianza: 'alta' };
    celdas[claveColumnaPesaje(1, 'pm')] = { texto: pm, confianza: 'alta' };
    return {
      pagina: 1,
      orden: 1,
      animalId: 'a1',
      nombre: 'ALINA',
      nombreImpreso: 'ALINA',
      celdas,
      celdasNoConfiables: [],
      avisos: [],
    };
  }

  it('"6 1/2" se lee 6,5 -- antes se descartaba la celda entera', () => {
    expect(leerLitrosSemana(filaCon('6 1/2', '5 1/2'), 1)).toEqual({ litrosAm: 6.5, litrosPm: 5.5 });
  });

  it('el símbolo ½ y el decimal sin entero también', () => {
    expect(leerLitrosSemana(filaCon('7½', '.5'), 1)).toEqual({ litrosAm: 7.5, litrosPm: 0.5 });
  });

  it('los enteros y decimales de siempre no cambian', () => {
    expect(leerLitrosSemana(filaCon('7', '6,5'), 1)).toEqual({ litrosAm: 7, litrosPm: 6.5 });
  });

  it('celda vacía sigue siendo "sin dato", nunca 0', () => {
    expect(leerLitrosSemana(filaCon('', ''), 1)).toEqual({ litrosAm: null, litrosPm: null });
  });
});

describe('construirPromptOcrPesaje -- instrucción de fracciones', () => {
  it('nombra la fracción explícitamente y prohíbe quedarse con la parte entera', () => {
    const prompt = construirPromptOcrPesaje();
    expect(prompt).toContain('1/2');
    expect(prompt).toContain('½');
    expect(prompt).toContain("'6 1/2' NO es '6'");
  });
});

describe('construirPromptOcrPesaje -- fotos parciales (planilla de una hoja, fotografiada por franjas)', () => {
  const prompt = construirPromptOcrPesaje();

  it('avisa que la foto puede ser una franja y que el encabezado puede no verse', () => {
    expect(prompt).toContain('PARTE DE LA PLANILLA');
    expect(prompt).toMatch(/encabezados.*NO aparezca/s);
  });

  it('fija el orden posicional de las 10 columnas, que es lo único que queda sin encabezado', () => {
    expect(prompt).toContain('Semana 1 AM, Semana 1 PM');
    expect(prompt).toContain('Semana 5 PM');
  });

  it('prohíbe correr valores a la izquierda cuando el encuadre corta columnas', () => {
    expect(prompt).toMatch(/NUNCA corras los valores/);
  });

  it('prohíbe inventar las filas que quedaron fuera del encuadre', () => {
    expect(prompt).toMatch(/No inventes las filas/);
  });
});
