// ARCHIVO: src/supabase/functions/server/importHato/tipos.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/tipos.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/tipos.ts
// DESCRIPCIÓN: La frontera del pipeline de importación histórica del Hato
// Lechero (S3 del plan docs/plan_hato_lechero_module.md §7.4). Este archivo
// es el CONTRATO entre las dos mitades del pipeline:
//
//   Extract → Normalize → | Resolve | → [CHECKPOINT MARTHA] → Load → Verify
//                         ^ frontera
//
// Extract+Normalize produce `SalidaNormalizado`; Resolve lo consume. Ninguna
// de las dos mitades cambia este archivo por su cuenta -- ver
// docs/hato/s3-contrato-pipeline.md.
//
// Regla que gobierna todo el pipeline, heredada de `calculosHato.ts`: una
// celda o fila no interpretable JAMÁS se descarta. Se emite con `issues[]` y
// el crudo intacto. Un import que "limpia" datos perdiendo procedencia es
// peor que no importar.

import type { ParseIssue, ResultadoSX, TipoEstado } from '../calculos-hato.ts';

export type { ParseIssue, ResultadoSX, TipoEstado };

/** Confianza en una fecha resuelta. `exacta` = el título traía día, mes y
 * año; `aproximada` = se completó algún componente por heurística (nombre de
 * hoja, mitad de mes); `desconocida` = no se pudo resolver, la fecha es null. */
export type ConfianzaFecha = 'exacta' | 'aproximada' | 'desconocida';

/** Las tres generaciones de encabezado observadas en el corpus 2019-2026
 * (doc S2 §2), más el caso de las hojas que no traen fila de encabezado en
 * absoluto y hay que resolver por posición. */
export type GeneracionEncabezado = 1 | 2 | 3 | 'sin_encabezado';

/** Capa cruda: el valor verbatim de cada celda mapeada, tal cual venía en la
 * planilla. Sobrevive a cualquier error de normalización -- es lo que
 * permite re-procesar sin volver a abrir el Excel. */
export interface CrudoFilaChequeo {
  pl: string | null;
  np: string | null;
  ultimaCria: string | null;
  sx: string | null;
  fechaServicio: string | null;
  toro: string | null;
  /** Se conserva por trazabilidad pero NUNCA se interpreta: es una fórmula
   * `TODAY()` congelada, no un dato del chequeo (doc S2 QA §2.4). */
  tp: string | null;
  estado: string | null;
  secar: string | null;
  pp: string | null;
  ttto: string | null;
}

/** Una fila de animal en una hoja de chequeo, ya resuelta a nivel de GRILLA
 * (estructura 2D: offset de columnas, sub-tablas embebidas, filas fantasma)
 * y normalizada a nivel de CELDA (vía los parsers de `calculosHato.ts`).
 * Es la salida de Extract+Normalize y la entrada de Resolve. */
export interface FilaChequeoNormalizada {
  // --- procedencia (nunca se pierde) ---
  archivo: string;
  hoja: string;
  /** 1-indexed, como lo ve Excel. */
  fila: number;
  generacionEncabezado: GeneracionEncabezado;

  // --- identidad cruda ---
  numero: number | null;
  nombre: string | null;

  // --- fecha del chequeo (resuelta por hoja, igual para todas sus filas) ---
  chequeoFecha: string | null;
  chequeoFechaConfianza: ConfianzaFecha;

  raw: CrudoFilaChequeo;

  // --- capa normalizada (salida de calculosHato.ts) ---
  pl: number | null;
  numPartos: number | null;
  /** Puede traer 2-3 fechas: son intentos de servicio reales, todos visibles (V7). */
  fechasServicio: string[];
  sx: ResultadoSX | null;
  estado: TipoEstado | null;
  /** RE-DERIVADA desde `F Servicio`, no leída de la celda (doc S2 QA §2.2). */
  fechaSecar: string | null;
  /** RE-DERIVADA desde `F Servicio`, no leída de la celda. */
  fechaProbableParto: string | null;
  toroNombre: string | null;
  tipoServicio: 'monta' | 'inseminacion' | null;

  issues: ParseIssue[];
}

/** Una fila de las hojas TERNERAS. Esquema distinto (confirmado único a
 * través de las 7 hojas físicas: `(índice, #, NOMBRE, F NACIMIENTO, PADRE,
 * MADRE)`), tabla distinta. */
export interface FilaTerneraNormalizada {
  archivo: string;
  hoja: string;
  fila: number;
  numero: number | null;
  nombre: string | null;
  fechaNacimiento: string | null;
  fechaNacimientoConfianza: ConfianzaFecha;
  /** Incluye valores que son RAZA (jersey/holstein/normando) y no identidad
   * de toro, más `yaguen`/`fabace` -- pregunta abierta para el dueño. */
  padreRaw: string | null;
  madreRaw: string | null;
  issues: ParseIssue[];
}

/** Una fila de la sub-tabla ajena embebida al final de una hoja de chequeo
 * ("Deben entrar a servicio estas terneras", QA §2.6). Esquema propio: NO se
 * alimenta al parser de fila-de-chequeo, pero tampoco se descarta. */
export interface FilaSubtablaNormalizada {
  archivo: string;
  hoja: string;
  fila: number;
  /** Índice 1..N dentro de la sub-tabla, no una chapeta. */
  indice: number | null;
  numero: number | null;
  nombre: string | null;
  madreRaw: string | null;
  issues: ParseIssue[];
}

/** Manifiesto por hoja física escaneada. `filasDescartadas` documenta cuántas
 * filas se filtraron y por qué -- un import que descarta en silencio es
 * indistinguible de uno que perdió datos. */
export interface ManifiestoHoja {
  archivo: string;
  hoja: string;
  chequeoFecha: string | null;
  chequeoFechaConfianza: ConfianzaFecha;
  generacionEncabezado: GeneracionEncabezado;
  /** Índice 0-based de la fila de encabezado dentro de la hoja; null si no hay. */
  filaEncabezado: number | null;
  /** Offset de columnas sniffeado para hojas sin encabezado (QA §2.8). */
  offsetColumnas: number | null;
  /** Mapa columna lógica → índice físico de columna resuelto. */
  colmap: Record<string, number | null>;
  filasTotales: number;
  filasAnimal: number;
  filasDescartadas: number;
  /** Desglose de descartes por motivo, para que ningún filtro sea opaco. */
  descartesPorMotivo: Record<string, number>;
  /** Si esta hoja es un duplicado byte-a-byte de otra ya vista, aquí va la
   * clave `archivo::hoja` de la que se conservó (dedupe de las 9 hojas
   * repetidas entre dos archivos). */
  duplicadaDe: string | null;
  issues: ParseIssue[];
}

/** El JSON intermedio que Extract escribe y Resolve lee. */
export interface SalidaNormalizado {
  /** Timestamp inyectado por el caller -- NUNCA `Date.now()` dentro de lógica pura. */
  generadoEn: string;
  hojas: ManifiestoHoja[];
  chequeos: FilaChequeoNormalizada[];
  terneras: FilaTerneraNormalizada[];
  subtablas: FilaSubtablaNormalizada[];
}

/** Una hoja cruda tal como la entrega el lector de Excel: una matriz de
 * celdas sin interpretar. Es la ÚNICA entrada del normalizador, lo que lo
 * mantiene puro y testeable sin abrir un `.xlsx`. */
export interface HojaCruda {
  archivo: string;
  hoja: string;
  /** Matriz [fila][columna] de valores crudos. Fila 0 = fila 1 de Excel. */
  filas: unknown[][];
}
