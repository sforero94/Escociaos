// ARCHIVO: src/supabase/functions/server/importHato/grilla.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/grilla.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el endpoint B0/V10 (`POST
// .../hato/chequeo/preview`, `hato-chequeo-preview.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `priorizacion-scouting.ts` y `calculos-hato.ts`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `../calculos-hato.ts`,
// `./xxx` -> `./xxx.ts`). `src/__tests__/importHatoParidadServidor.test.ts`
// corre este mismo script en modo `--check` y falla si alguien hand-editó
// una copia en vez de regenerarla.

// ARCHIVO: utils/importHato/grilla.ts
// DESCRIPCIÓN: Resolución de la estructura 2D de una hoja de chequeo -- lo
// que S2 dejó explícitamente fuera (ver docs/hato/s3-contrato-pipeline.md):
// localizar encabezado, mapear columna lógica -> índice físico tolerando las
// tres generaciones de encabezado (doc S2 §2), fallback posicional cuando el
// encabezado es ambiguo (doc QA §2.5), sniff de offset en hojas sin
// encabezado (QA §2.8), filtro de filas fantasma (QA §2.7) y detección de
// sub-tabla ajena embebida (QA §2.6).
//
// Puro, cero I/O. Opera sobre `unknown[][]` (una `HojaCruda.filas`).

import { esVacio } from './celdas.ts';

/** Las columnas lógicas de una fila de chequeo, en el orden en que aparecen
 * en la planilla (de izquierda a derecha) en cualquiera de las 3
 * generaciones. `numero`/`nombre` son "anclas" -- nunca ambiguas por nombre
 * en ninguna generación observada. El grupo final (tp/estado/secar/pp) SÍ
 * puede ser ambiguo (QA §2.5) y se resuelve con una regla dedicada. */
export type ColumnaLogicaChequeo =
  | 'numero'
  | 'nombre'
  | 'pl'
  | 'np'
  | 'ultimaCria'
  | 'sx'
  | 'fechaServicio'
  | 'toro'
  | 'tp'
  | 'estado'
  | 'secar'
  | 'pp'
  | 'ttto';

export type ColmapChequeo = Record<ColumnaLogicaChequeo, number | null>;

export const COLMAP_VACIO: ColmapChequeo = {
  numero: null,
  nombre: null,
  pl: null,
  np: null,
  ultimaCria: null,
  sx: null,
  fechaServicio: null,
  toro: null,
  tp: null,
  estado: null,
  secar: null,
  pp: null,
  ttto: null,
};

/** Normaliza el texto de una celda de encabezado para comparar por alias:
 * recorta, colapsa espacios internos, mayúsculas. Nunca strippea dígitos ni
 * símbolos -- necesitamos distinguir '#' de '#P2'. */
function normalizarEncabezado(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Ruido de encabezado documentado (doc S2 §2): rangos de Excel filtrados a
 * la celda por error de copiado, ej. `A3:N46A1A3:N45`, `TPI2:L28A1I2:L26`.
 * Estas columnas se ignoran EN SILENCIO (no generan issue por fila) porque
 * ya están identificadas como ruido conocido, a diferencia de una columna
 * extra genuina como `SEC REAL` de Gen1 (QA §2.10), que sí se preserva. */
function esRuidoDeRango(encabezadoNormalizado: string): boolean {
  return /[A-Z]+\d+:[A-Z]+\d+/.test(encabezadoNormalizado);
}

const ALIAS_ANCLA: Record<
  Exclude<ColumnaLogicaChequeo, 'tp' | 'estado' | 'secar' | 'pp'>,
  string[]
> = {
  numero: ['#'],
  nombre: ['NOMBRE'],
  pl: ['PL'],
  np: ['#P2'],
  ultimaCria: ['UC', 'ULTIMA CRIA'],
  sx: ['SX'],
  fechaServicio: ['F SERVICIO'],
  toro: ['T', 'TORO'],
  ttto: ['TTTO'],
};

/** Alias del grupo final, cada uno con su generación de origen documentada
 * (doc S2 §2): Gen1/Gen2 usan OBS/F Secar/F parto, Gen3 usa
 * ESTADO/SECAR/PP. */
const ALIAS_GRUPO_FINAL: Record<'tp' | 'estado' | 'secar' | 'pp', string[]> = {
  tp: ['TP'],
  estado: ['ESTADO', 'OBS'],
  secar: ['SECAR', 'F SECAR'],
  pp: ['PP', 'F PARTO'],
};

export type GeneracionEncabezado = 1 | 2 | 3 | 'sin_encabezado';

export interface ResultadoColmap {
  colmap: ColmapChequeo;
  generacion: GeneracionEncabezado;
  /** Índices de columna con encabezado real (no ruido de rango, no vacío)
   * que no se pudieron mapear a ninguna columna lógica -- ej. la columna `I`
   * (solo ene/mar 2019) y `SEC REAL`/`parto real` de Gen1 (QA §2.10). Su
   * contenido por fila se preserva vía `issues`, nunca se descarta. */
  columnasExtra: number[];
  /** Notas de resolución a nivel de hoja (ej. fallback posicional aplicado). */
  notas: string[];
}

/** Busca, dentro de la fila de encabezado, la(s) columna(s) cuyo texto
 * normalizado coincide EXACTAMENTE con alguno de los alias dados. Devuelve
 * TODOS los índices que matchean (no solo el primero) -- la ambigüedad
 * (más de un match) es justamente la señal que dispara el fallback
 * posicional del grupo final. */
function buscarColumnas(filaEncabezado: unknown[], alias: string[]): number[] {
  const encontrados: number[] = [];
  for (let c = 0; c < filaEncabezado.length; c++) {
    const norm = normalizarEncabezado(filaEncabezado[c]);
    if (norm !== '' && alias.includes(norm)) encontrados.push(c);
  }
  return encontrados;
}

/**
 * Construye el colmap de una hoja CON fila de encabezado real. Resuelve las
 * anclas por nombre (nunca ambiguas en el corpus observado); el grupo final
 * (tp/estado/secar/pp) se resuelve por nombre cuando cada alias matchea una
 * única columna, y cae a fallback POSICIONAL (orden TP, ESTADO, SECAR, PP,
 * entre `toro` y `ttto`) cuando algún alias matchea más de una columna --
 * caso real: `AGOSTI 1 2023` repite 'TP' cuatro veces (QA §2.5).
 */
export function construirColmapConEncabezado(filaEncabezado: unknown[]): ResultadoColmap {
  const colmap: ColmapChequeo = { ...COLMAP_VACIO };
  const notas: string[] = [];

  for (const rol of Object.keys(ALIAS_ANCLA) as Array<keyof typeof ALIAS_ANCLA>) {
    const matches = buscarColumnas(filaEncabezado, ALIAS_ANCLA[rol]);
    colmap[rol] = matches.length > 0 ? matches[0] : null;
    if (matches.length > 1) {
      notas.push(`columna ancla '${rol}' matcheó ${matches.length} columnas de encabezado, se usó la primera (índice ${matches[0]})`);
    }
  }

  // Grupo final: buscar cada rol solo dentro de la ventana (toro, ttto)
  // exclusive-exclusive cuando ambos anchors están resueltos; si falta
  // alguno, se usa la fila completa como ventana (mejor esfuerzo).
  const inicioVentana = colmap.toro !== null ? colmap.toro + 1 : 0;
  const finVentana = colmap.ttto !== null ? colmap.ttto : filaEncabezado.length;

  const matchesPorRol: Record<'tp' | 'estado' | 'secar' | 'pp', number[]> = {
    tp: [],
    estado: [],
    secar: [],
    pp: [],
  };
  for (const rol of Object.keys(ALIAS_GRUPO_FINAL) as Array<keyof typeof ALIAS_GRUPO_FINAL>) {
    const todos = buscarColumnas(filaEncabezado, ALIAS_GRUPO_FINAL[rol]);
    matchesPorRol[rol] = todos.filter((c) => c >= inicioVentana && c < finVentana);
  }

  const algunoAmbiguo = Object.values(matchesPorRol).some((m) => m.length > 1);
  let aliasEstadoUsado: string | null = null;

  if (algunoAmbiguo) {
    // Fallback posicional (QA §2.5): todas las columnas de la ventana que
    // matchearon CUALQUIER alias del grupo final, en orden, asignadas
    // (TP, ESTADO, SECAR, PP).
    const candidatas = [...new Set(Object.values(matchesPorRol).flat())].sort((a, b) => a - b);
    const roles: Array<'tp' | 'estado' | 'secar' | 'pp'> = ['tp', 'estado', 'secar', 'pp'];
    if (candidatas.length !== 4) {
      notas.push(
        `grupo TP/ESTADO/SECAR/PP ambiguo por nombre de encabezado y el fallback posicional encontró ${candidatas.length} columnas candidatas (se esperaban 4) -- asignación best-effort, revisar`,
      );
    } else {
      notas.push('grupo TP/ESTADO/SECAR/PP ambiguo por nombre de encabezado (encabezado repetido) -- resuelto por fallback posicional (orden TP, ESTADO, SECAR, PP)');
    }
    roles.forEach((rol, i) => {
      colmap[rol] = candidatas[i] ?? null;
    });
    aliasEstadoUsado = 'ESTADO'; // fallback posicional == forma de Gen3, sin columna extra
  } else {
    for (const rol of Object.keys(ALIAS_GRUPO_FINAL) as Array<keyof typeof ALIAS_GRUPO_FINAL>) {
      colmap[rol] = matchesPorRol[rol][0] ?? null;
    }
    if (colmap.estado !== null) {
      aliasEstadoUsado = normalizarEncabezado(filaEncabezado[colmap.estado]);
    }
  }

  // Columnas extra: con encabezado real, no ruido de rango, no asignadas a
  // ningún rol (QA §2.10: 'I', 'SEC REAL'/'parto real' de Gen1).
  const asignadas = new Set(Object.values(colmap).filter((v): v is number => v !== null));
  const columnasExtra: number[] = [];
  for (let c = 0; c < filaEncabezado.length; c++) {
    if (asignadas.has(c)) continue;
    const norm = normalizarEncabezado(filaEncabezado[c]);
    if (norm === '' || esRuidoDeRango(norm)) continue;
    columnasExtra.push(c);
  }

  // Generación: ESTADO literal -> Gen3 (o fallback posicional, tratado
  // igual que Gen3 porque su layout de 4 columnas sin extra coincide).
  // OBS + columna extra en el grupo final -> Gen1. OBS sin extra -> Gen2.
  let generacion: GeneracionEncabezado;
  if (aliasEstadoUsado === 'ESTADO') {
    generacion = 3;
  } else if (aliasEstadoUsado === 'OBS') {
    const hayExtraEnGrupoFinal = columnasExtra.some((c) => c >= inicioVentana && c < finVentana);
    generacion = hayExtraEnGrupoFinal ? 1 : 2;
  } else {
    // No se pudo resolver 'estado' en absoluto -- caso no observado en el
    // corpus real, se etiqueta como Gen2 (la forma "sin extra" más neutra)
    // y se deja constancia explícita para revisión.
    generacion = 2;
    notas.push("no se pudo determinar la generación de encabezado (columna 'estado' sin resolver) -- se asumió Gen2 por defecto, revisar");
  }

  return { colmap, generacion, columnasExtra, notas };
}

/** Ventana de filas (0-based, relativa a `filas`) donde se busca la fila de
 * encabezado: la evidencia real muestra encabezado en la fila física 2, 3 o
 * incluso 4 cuando hay una fila en blanco de por medio (`CHEQUEO JULIO
 * 2026`: título r1, blanco r2, encabezado r3). */
const VENTANA_BUSQUEDA_ENCABEZADO = 5;

/** Un mínimo de 2 anclas reconocidas en la fila basta para considerarla
 * "fila de encabezado" -- suficiente para no confundir una fila de datos
 * (que nunca tiene '#' Y 'NOMBRE' como TEXTO en sus celdas) con el
 * encabezado real, incluso cuando la fila trae ruido de rango pegado
 * (`A3:N46A1A3:N45`). */
function pareceFilaDeEncabezado(fila: unknown[]): boolean {
  let anclas = 0;
  for (let c = 0; c < fila.length; c++) {
    const norm = normalizarEncabezado(fila[c]);
    if (norm === '#' || norm === 'NOMBRE' || norm === 'SX' || norm === 'F SERVICIO' || norm === 'TORO') {
      anclas++;
    }
  }
  return anclas >= 2;
}

/** Ubica el índice 0-based de la fila de encabezado dentro de las primeras
 * `VENTANA_BUSQUEDA_ENCABEZADO` filas. `null` si la hoja no trae encabezado
 * (empieza a tirar datos directo, doc S2 §2). */
export function localizarFilaEncabezado(filas: unknown[][]): number | null {
  for (let i = 0; i < Math.min(VENTANA_BUSQUEDA_ENCABEZADO, filas.length); i++) {
    if (pareceFilaDeEncabezado(filas[i])) return i;
  }
  return null;
}

/** Extrae el texto del título de una hoja: la primera celda de texto no
 * vacía de la fila 0 (a veces está en la columna 0, a veces en la 1 --
 * `CHEQUEO DIC 21-22` trae el título en la columna 1 con la 0 en blanco). */
export function extraerTituloHoja(filas: unknown[][]): string {
  if (filas.length === 0) return '';
  const fila0 = filas[0];
  for (const celda of fila0) {
    if (typeof celda === 'string' && celda.trim() !== '') return celda.trim();
  }
  return '';
}

// ----------------------------------------------------------------------------
// Hojas sin encabezado (QA §2.8): sniff de offset de columnas.
// ----------------------------------------------------------------------------

export interface ResultadoOffsetHeaderless {
  colmap: ColmapChequeo;
  offset: number;
  confianza: 'alta' | 'baja';
  nota?: string;
}

/** Layout posicional fijo observado en las 4 hojas sin encabezado del
 * corpus (doc S2 §2, mismo orden que Gen2 -- ninguna hoja headerless usa el
 * layout Gen1/Gen3): `# | Nombre | PL | #P2 | Ultima Cria | SX | F Servicio
 * | Toro | TP | OBS | F Secar | F parto | TTTO`. `offset` es el índice
 * físico de la columna `#`. */
function colmapPosicional(offset: number): ColmapChequeo {
  return {
    numero: offset,
    nombre: offset + 1,
    pl: offset + 2,
    np: offset + 3,
    ultimaCria: offset + 4,
    sx: offset + 5,
    fechaServicio: offset + 6,
    toro: offset + 7,
    tp: offset + 8,
    estado: offset + 9,
    secar: offset + 10,
    pp: offset + 11,
    ttto: offset + 12,
  };
}

/** Cuenta, sobre las filas de datos, cuántas satisfacen "columna `k` es
 * numérica Y columna `k+1` es texto de longitud > 2" -- la firma de
 * `(#, Nombre)` (QA §2.8). Cero si `k+1` se sale del ancho de alguna fila. */
function contarCoincidenciasNumeroTexto(filasDatos: unknown[][], k: number): number {
  let n = 0;
  for (const fila of filasDatos) {
    const a = fila[k];
    const b = fila[k + 1];
    if (typeof a === 'number' && typeof b === 'string' && b.trim().length > 2) n++;
  }
  return n;
}

/**
 * Determina el offset de columnas de una hoja sin encabezado probando
 * `k=0` y `k=1` (QA §2.8). El caso `CHEQUEO DIC 21-22` (índice decorativo en
 * col0, chapeta real en col1) se resuelve solo con esta firma: col0+col1 es
 * (número, número) -- falla la prueba porque col1 no es texto -- mientras
 * que col1+col2 sí es (número, texto). No hace falta cruzar contra números
 * de chapeta ya vistos en otras hojas para desambiguar estos 4 casos reales
 * (verificado); se deja como posible refuerzo futuro si aparecieran hojas
 * más ambiguas.
 */
export function sniffearOffsetHeaderless(filasDatos: unknown[][]): ResultadoOffsetHeaderless {
  const score0 = contarCoincidenciasNumeroTexto(filasDatos, 0);
  const score1 = contarCoincidenciasNumeroTexto(filasDatos, 1);

  if (score0 === 0 && score1 === 0) {
    return {
      colmap: colmapPosicional(0),
      offset: 0,
      confianza: 'baja',
      nota: 'no se pudo sniffear el offset de columnas (ninguna combinación número+texto encontrada) -- se asumió offset=0 por defecto, revisar',
    };
  }

  const offset = score1 > score0 ? 1 : 0;
  return { colmap: colmapPosicional(offset), offset, confianza: 'alta' };
}

// ----------------------------------------------------------------------------
// Filtros de fila (QA §2.7) y detección de sub-tabla ajena (QA §2.6).
// ----------------------------------------------------------------------------

/** Columnas que SÍ cuentan para decidir si una fila está "vacía" (QA §2.7):
 * todas las mapeadas EXCEPTO `tp`, que nunca se lee ni siquiera para esto
 * (regla dura del módulo). */
const COLUMNAS_PARA_FILTRO_VACIO: ColumnaLogicaChequeo[] = [
  'numero',
  'nombre',
  'pl',
  'np',
  'ultimaCria',
  'sx',
  'fechaServicio',
  'toro',
  'estado',
  'secar',
  'pp',
  'ttto',
];

/** `true` si NINGUNA columna mapeada (salvo TP) tiene contenido -- fila
 * fantasma, se descarta sin generar issue (QA §2.7: 225 de 274 filas de
 * `CHEQUE MAYO 25` son así, solo con una columna de índice decorativo sin
 * mapear rellena). */
export function esFilaVacia(fila: unknown[], colmap: ColmapChequeo): boolean {
  for (const col of COLUMNAS_PARA_FILTRO_VACIO) {
    const idx = colmap[col];
    if (idx === null) continue;
    if (!esVacio(fila[idx])) return false;
  }
  return true;
}

/** `true` si la fila es una repetición del encabezado a mitad de hoja (doc
 * S2 §2: "el encabezado se repite a mitad de hoja") -- se detecta
 * comparando las columnas `numero`/`nombre` mapeadas contra sus alias
 * literales, nunca se parsea como fila de animal. */
export function esFilaEncabezadoRepetido(fila: unknown[], colmap: ColmapChequeo): boolean {
  if (colmap.numero === null || colmap.nombre === null) return false;
  const numeroTxt = normalizarEncabezado(fila[colmap.numero]);
  const nombreTxt = normalizarEncabezado(fila[colmap.nombre]);
  return numeroTxt === '#' && nombreTxt === 'NOMBRE';
}

/** Marcador de sub-tabla ajena embebida (QA §2.6): un título en texto libre
 * en la posición de la columna `nombre`, mencionando "entrar a servicio" o
 * "terneras" -- único ejemplo confirmado en el corpus (`CHEQUEO AGOSTO
 * 2024`, "Deben entrar a servicio estas terneras "), pero el patrón se deja
 * genérico por si Martha repite la práctica en chequeos futuros (doc
 * s2-matriz-qa.md §5, punto 7). */
export function esMarcadorSubtabla(valorNombre: unknown): boolean {
  if (typeof valorNombre !== 'string') return false;
  return /entrar\s+a\s+servicio|deben\s+entrar/i.test(valorNombre);
}

// ----------------------------------------------------------------------------
// Clasificación de hoja por nombre (chequeo / ternera / fuera de alcance).
// ----------------------------------------------------------------------------

export type TipoHoja = 'chequeo' | 'ternera' | 'fuera_de_alcance';

/**
 * Clasifica una hoja física por su ARCHIVO y su NOMBRE. El corpus real tiene
 * exactamente 3 categorías fuera de "chequeo": TERNERAS (7 hojas físicas,
 * cualquier variante de nombre que contenga "ternera"), hojas de leche
 * (fuera de alcance de S3 -- ver docs/hato/s3-handoff.md §3, "no resuelto
 * por dueño") y hojas vacías/ajenas al hato (`Hoja1`, `Hoja2`,
 * `Flujo Caja 2022-1`). `GASTOS FOV ENERO 2026 (1).xlsx` se excluye a nivel
 * de archivo en el runner, nunca llega aquí.
 *
 * Por qué recibe también `archivo`: dos de los archivos de leche
 * (`PROMEDIO DE LECHE DESDE AÑO 2026.xlsx`, `FLUJO LECHE AÑOS 23-26.xlsx`)
 * tienen hojas cuyo NOMBRE por sí solo es indistinguible de una hoja de
 * chequeo real (`MZO 2026`, `ABRIL 2026`, `2023 - 2026`...) -- solo el
 * nombre del ARCHIVO delata que son de leche. `CHEO VETE 2026.xlsx` es el
 * caso mixto: es un archivo de chequeo que además trae 3 hojas de leche
 * cuyo NOMBRE sí lleva la señal ('PROM LECHE ABR 2025', 'PROME', 'promed
 * leche jun 2025') -- por eso se comprueban ambos niveles.
 */
export function clasificarHoja(archivo: string, nombreHoja: string): TipoHoja {
  const normArchivo = archivo.trim().toUpperCase();
  if (/LECHE/.test(normArchivo)) return 'fuera_de_alcance';

  const norm = nombreHoja.trim().toUpperCase();
  if (norm.includes('TERNERA')) return 'ternera';
  if (/LECHE/.test(norm) || /^PROME$/.test(norm) || /^HOJA\d*$/.test(norm) || /^FLUJO CAJA/.test(norm)) {
    return 'fuera_de_alcance';
  }
  return 'chequeo';
}
