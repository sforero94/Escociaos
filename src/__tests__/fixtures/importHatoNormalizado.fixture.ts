// ARCHIVO: __tests__/fixtures/importHatoNormalizado.fixture.ts
// DESCRIPCIÓN: Fixture sintético con la forma exacta de `SalidaNormalizado`
// (src/utils/importHato/tipos.ts) -- usado por los tests de `resolver.ts`,
// `verificar.ts` y `reporte.ts` mientras Extract+Normalize (Agente A, S3) no
// aterriza su salida real. Cubre deliberadamente los casos duros descritos
// en docs/hato/s2-matriz-qa.md y en las notas del coordinador de S3
// (docs/hato/s3-verificacion-independiente.md):
//
//   - Colisión de chapeta VIGENTE con 3 nombres, dos de ellos a distancia de
//     edición 1 (numero 175: MARGARITA / MONA / NONA -- MONA/NONA es la
//     variante de escritura real documentada por el coordinador).
//   - Colisión de chapeta VIGENTE simple (numero 162: ESMERALDA / VITROLA).
//   - Colisión HISTÓRICA que converge a un solo nombre antes de la lectura
//     más reciente (numero 43: CUÑA/MONTAÑA en 2022, solo MONTAÑA desde 2024).
//   - Un mismo nombre bajo dos números distintos (FABIOLA: numero 300 y 301).
//   - Fila sin número (nota mal capturada + comentario multi-nombre).
//   - Fila con número pero sin nombre.
//   - Renombre cría->adulta en TERNERAS (numero 166: campera -> COPITA).
//   - Numero sin nombre en TERNERAS que se nombra después (numero 187).
//   - TERNERAS: PADRE = raza (jersey/holstein) y PADRE = pregunta abierta
//     (yaguen/fabace).
//   - Cruce TERNERAS <-> chequeos (numero 201, CAMPESINA aparece en ambos).
//   - Columna `Toro` con una oración completa (no es un toro real).
//   - Sub-tabla embebida ("Deben entrar a servicio") que SÍ hace match con
//     un animal conocido (numero 190).
//   - Un animal (numero 111, PIONERA) presente en las 2 lecturas más
//     antiguas y ausente de las 2 más recientes -- cierre presunto.

import type { SalidaNormalizado, FilaChequeoNormalizada, FilaTerneraNormalizada, ManifiestoHoja } from '@/utils/importHato/tipos';

function filaChequeo(datos: {
  archivo: string;
  hoja: string;
  fila: number;
  fecha: string;
  numero: number | null;
  nombre: string | null;
  toro?: string | null;
  sx?: string | null;
  /** Lo que `parseToro.ts` (Normalize) habría resuelto para `toro` -- por
   * defecto igual al crudo (nombre real de toro), pero debe pasarse
   * explícitamente cuando `toro` NO es un nombre de toro (anotación, raza,
   * código de ESTADO...), para que `construirCatalogoToros` (que confía en
   * este campo, no en el crudo, desde D6) se comporte igual que con datos
   * reales. */
  toroNombre?: string | null;
}): FilaChequeoNormalizada {
  return {
    archivo: datos.archivo,
    hoja: datos.hoja,
    fila: datos.fila,
    generacionEncabezado: 3,
    numero: datos.numero,
    nombre: datos.nombre,
    chequeoFecha: datos.fecha,
    chequeoFechaConfianza: 'exacta',
    raw: {
      pl: null,
      np: null,
      ultimaCria: null,
      sx: datos.sx ?? null,
      fechaServicio: null,
      toro: datos.toro ?? null,
      tp: null,
      estado: null,
      secar: null,
      pp: null,
      ttto: null,
    },
    pl: null,
    numPartos: null,
    fechasServicio: [],
    sx: null,
    estado: null,
    fechaSecar: null,
    fechaProbableParto: null,
    toroNombre: datos.toroNombre !== undefined ? datos.toroNombre : (datos.toro ?? null),
    tipoServicio: null,
    issues: [],
  };
}

function filaTernera(datos: {
  archivo: string;
  hoja: string;
  fila: number;
  numero: number;
  nombre: string | null;
  fechaNacimiento: string | null;
  padreRaw: string | null;
  madreRaw: string | null;
}): FilaTerneraNormalizada {
  return {
    archivo: datos.archivo,
    hoja: datos.hoja,
    fila: datos.fila,
    numero: datos.numero,
    nombre: datos.nombre,
    fechaNacimiento: datos.fechaNacimiento,
    fechaNacimientoConfianza: 'aproximada',
    padreRaw: datos.padreRaw,
    madreRaw: datos.madreRaw,
    issues: [],
  };
}

function manifiesto(datos: {
  archivo: string;
  hoja: string;
  fecha: string | null;
  filasTotales: number;
  filasAnimal: number;
}): ManifiestoHoja {
  return {
    archivo: datos.archivo,
    hoja: datos.hoja,
    chequeoFecha: datos.fecha,
    chequeoFechaConfianza: datos.fecha ? 'exacta' : 'desconocida',
    generacionEncabezado: 3,
    filaEncabezado: 0,
    offsetColumnas: null,
    colmap: {},
    filasTotales: datos.filasTotales,
    filasAnimal: datos.filasAnimal,
    filasDescartadas: datos.filasTotales - datos.filasAnimal,
    descartesPorMotivo: {},
    duplicadaDe: null,
    issues: [],
  };
}

const ARCHIVO_2019 = 'CHEQUEO ACTUALIZADO ENERO 2020.xlsx';
const ARCHIVO_21_22 = 'chequeo 21 y 22.xlsx';
const ARCHIVO_2023 = 'CHEQUEO 2023 Y TERNERAS.xlsx';
const ARCHIVO_2024 = 'CHEQUEO VETE 2024.xlsx';
const ARCHIVO_2026 = 'CHEO VETE 2026.xlsx';

// --- R1: 2019-01-15 -----------------------------------------------------
const R1_HOJA = 'CHEQUEO_ENERO_2019';
const R1_FECHA = '2019-01-15';

// --- R2: 2022-09-10 (colisión histórica #43, converge después) ---------
const R2_HOJA = 'CHEQUEO SEP 2022';
const R2_FECHA = '2022-09-10';

// --- R3: 2024-08-09 -------------------------------------------------------
const R3_HOJA = 'CHEQUEO AGOSTO 2024';
const R3_FECHA = '2024-08-09';

// --- R4: 2026-07-15 ("hato actual", target de la Épica F1) -------------
const R4_HOJA = 'CHEQUEO JULIO 2026';
const R4_FECHA = '2026-07-15';

const chequeos: FilaChequeoNormalizada[] = [
  // R1
  filaChequeo({ archivo: ARCHIVO_2019, hoja: R1_HOJA, fila: 2, fecha: R1_FECHA, numero: 43, nombre: 'CUÑA', toro: 'Wagner' }),
  filaChequeo({
    archivo: ARCHIVO_2019,
    hoja: R1_HOJA,
    fila: 3,
    fecha: R1_FECHA,
    numero: 111,
    nombre: 'PIONERA',
    toro: 'recomendación, dar sal en comida para mejorar ovarios',
    // Anotación de texto libre, no un nombre de toro -- parseToro.ts real
    // resolvería toroNombre=null acá (ver construirCatalogoToros, D6).
    toroNombre: null,
  }),
  filaChequeo({ archivo: ARCHIVO_2019, hoja: R1_HOJA, fila: 4, fecha: R1_FECHA, numero: 500, nombre: 'CONCHA' }),
  // # sin nombre -- nota mal capturada en la columna de chapeta (evidencia real doc S2 §1).
  filaChequeo({ archivo: ARCHIVO_2019, hoja: R1_HOJA, fila: 5, fecha: R1_FECHA, numero: 770, nombre: null }),
  // Comentario multi-nombre sin # (evidencia real doc S2 §1).
  filaChequeo({ archivo: ARCHIVO_2019, hoja: R1_HOJA, fila: 6, fecha: R1_FECHA, numero: null, nombre: 'VENDIDAS CORNELIA Y COQUETA' }),

  // R2 -- #43 colisiona (CUÑA / MONTAÑA) dentro de la MISMA lectura.
  filaChequeo({ archivo: ARCHIVO_21_22, hoja: R2_HOJA, fila: 5, fecha: R2_FECHA, numero: 43, nombre: 'CUÑA', toro: 'Wagner' }),
  filaChequeo({ archivo: ARCHIVO_21_22, hoja: R2_HOJA, fila: 6, fecha: R2_FECHA, numero: 43, nombre: 'MONTAÑA', toro: 'Wagner' }),
  filaChequeo({ archivo: ARCHIVO_21_22, hoja: R2_HOJA, fila: 7, fecha: R2_FECHA, numero: 111, nombre: 'PIONERA' }),
  filaChequeo({ archivo: ARCHIVO_21_22, hoja: R2_HOJA, fila: 8, fecha: R2_FECHA, numero: 201, nombre: 'CAMPESINA' }),
  // Nombre bajo un numero -- primera aparición de FABIOLA (numero 300).
  filaChequeo({ archivo: ARCHIVO_21_22, hoja: R2_HOJA, fila: 9, fecha: R2_FECHA, numero: 300, nombre: 'FABIOLA' }),

  // R3 -- #43 ya convergió a un solo nombre (MONTAÑA) -- ya no es colisión vigente.
  filaChequeo({ archivo: ARCHIVO_2024, hoja: R3_HOJA, fila: 4, fecha: R3_FECHA, numero: 43, nombre: 'MONTAÑA' }),
  filaChequeo({ archivo: ARCHIVO_2024, hoja: R3_HOJA, fila: 5, fecha: R3_FECHA, numero: 162, nombre: 'ESMERALDA' }),
  filaChequeo({ archivo: ARCHIVO_2024, hoja: R3_HOJA, fila: 6, fecha: R3_FECHA, numero: 201, nombre: 'CAMPESINA' }),
  // FABIOLA reaparece bajo un numero DISTINTO (301) -- "nombre bajo varios números".
  filaChequeo({ archivo: ARCHIVO_2024, hoja: R3_HOJA, fila: 7, fecha: R3_FECHA, numero: 301, nombre: 'FABIOLA' }),

  // R4 -- "hato actual": #162 y #175 colisionan VIGENTE. #175 trae 3 nombres,
  // dos de ellos (MONA/NONA) a distancia de edición 1.
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 2, fecha: R4_FECHA, numero: 162, nombre: 'ESMERALDA', sx: 'A 205' }),
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 3, fecha: R4_FECHA, numero: 162, nombre: 'VITROLA' }),
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 4, fecha: R4_FECHA, numero: 175, nombre: 'MARGARITA' }),
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 5, fecha: R4_FECHA, numero: 175, nombre: 'MONA', sx: 'A212' }),
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 6, fecha: R4_FECHA, numero: 175, nombre: 'NONA' }),
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 7, fecha: R4_FECHA, numero: 43, nombre: 'MONTAÑA' }),
  filaChequeo({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fila: 8, fecha: R4_FECHA, numero: 201, nombre: 'CAMPESINA' }),
];

const terneras: FilaTerneraNormalizada[] = [
  // Renombre cría -> adulta: numero 166, 'campera' (2020, hoja antigua) -> 'COPITA' (2024, hoja reciente).
  filaTernera({
    archivo: ARCHIVO_21_22,
    hoja: 'TERNERAS',
    fila: 13,
    numero: 166,
    nombre: 'campera',
    fechaNacimiento: '2018-03-01',
    padreRaw: 'jersey',
    madreRaw: 'CUÑA',
  }),
  filaTernera({
    archivo: ARCHIVO_2024,
    hoja: 'TERNERAS',
    fila: 8,
    numero: 166,
    nombre: 'COPITA',
    fechaNacimiento: '2018-03-01',
    padreRaw: 'jersey',
    madreRaw: 'CUÑA',
  }),
  // #187: sin nombre en 2024 (cría recién nacida), nombrada en 2026.
  filaTernera({
    archivo: ARCHIVO_2024,
    hoja: 'TERNERAS',
    fila: 29,
    numero: 187,
    nombre: null,
    fechaNacimiento: '2024-05-01',
    padreRaw: 'yaguen',
    madreRaw: 'MONTAÑA',
  }),
  filaTernera({
    archivo: ARCHIVO_2026,
    hoja: 'TERNERAS',
    fila: 12,
    numero: 187,
    nombre: 'RECOCHA',
    fechaNacimiento: '2024-05-01',
    padreRaw: 'yaguen',
    madreRaw: 'MONTAÑA',
  }),
  // #190: cría cuyo PADRE trae la pregunta abierta 'fabace'. Coincide con la sub-tabla de abajo.
  filaTernera({
    archivo: ARCHIVO_2026,
    hoja: 'TERNERAS',
    fila: 13,
    numero: 190,
    nombre: 'FABIOLA JR',
    fechaNacimiento: '2026-02-10',
    padreRaw: 'fabace',
    madreRaw: 'CAMPESINA',
  }),
  // #201: CAMPESINA -- misma identidad que aparece en R2/R3/R4 de chequeos (cruce TERNERAS<->chequeo).
  filaTernera({
    archivo: ARCHIVO_2023,
    hoja: 'TERNERAS',
    fila: 10,
    numero: 201,
    nombre: 'CAMPESINA',
    fechaNacimiento: '2019-06-01',
    padreRaw: 'holstein',
    madreRaw: null,
  }),
];

const hojas: ManifiestoHoja[] = [
  manifiesto({ archivo: ARCHIVO_2019, hoja: R1_HOJA, fecha: R1_FECHA, filasTotales: 6, filasAnimal: 4 }),
  manifiesto({ archivo: ARCHIVO_21_22, hoja: R2_HOJA, fecha: R2_FECHA, filasTotales: 5, filasAnimal: 5 }),
  manifiesto({ archivo: ARCHIVO_2024, hoja: R3_HOJA, fecha: R3_FECHA, filasTotales: 4, filasAnimal: 4 }),
  manifiesto({ archivo: ARCHIVO_2026, hoja: R4_HOJA, fecha: R4_FECHA, filasTotales: 7, filasAnimal: 7 }),
  manifiesto({ archivo: ARCHIVO_21_22, hoja: 'TERNERAS', fecha: '2020-06-01', filasTotales: 1, filasAnimal: 1 }),
  manifiesto({ archivo: ARCHIVO_2024, hoja: 'TERNERAS', fecha: '2024-08-01', filasTotales: 2, filasAnimal: 2 }),
  manifiesto({ archivo: ARCHIVO_2026, hoja: 'TERNERAS', fecha: '2026-07-01', filasTotales: 2, filasAnimal: 2 }),
  manifiesto({ archivo: ARCHIVO_2023, hoja: 'TERNERAS', fecha: '2023-01-01', filasTotales: 1, filasAnimal: 1 }),
];

export const FIXTURE_NORMALIZADO: SalidaNormalizado = {
  generadoEn: '2026-07-22T00:00:00.000Z',
  hojas,
  chequeos,
  terneras,
  subtablas: [
    {
      archivo: ARCHIVO_2024,
      hoja: R3_HOJA,
      fila: 55,
      indice: 1,
      numero: 190,
      nombre: 'FABIOLA JR',
      madreRaw: 'CAMPESINA',
      issues: [],
    },
  ],
};
