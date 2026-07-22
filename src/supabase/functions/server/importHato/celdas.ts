// ARCHIVO: src/supabase/functions/server/importHato/celdas.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/celdas.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/celdas.ts
// DESCRIPCIÓN: Helpers de más bajo nivel para el normalizador de importación
// histórica del Hato Lechero (S3, ver docs/hato/s3-contrato-pipeline.md).
//
// Puro, cero I/O, cero import de `xlsx` -- opera solo sobre los valores ya
// extraídos por el runner (`scripts/import-hato/extract.ts`).
//
// Por qué existe este archivo en vez de reusar `calculosHato.ts` para esto:
// los parsers de `calculosHato.ts` (`parseFechasServicio`, etc.) esperan
// recibir la fecha como TEXTO tal como aparecería visualmente en la planilla
// (ej. '20/04/2026'), porque ese es el formato en que Martha escribe fechas
// rotas/múltiples (que Excel nunca puede tipar como fecha real, así que
// llegan como celda de texto). Pero una fecha BIEN tipada en Excel (la
// mayoría) se lee desde `xlsx` como un NÚMERO SERIAL (días desde 1899-12-30),
// no como texto -- y el `.w` (texto formateado) que expone la librería
// `xlsx` no sirve como puente: se comprobó contra las planillas reales que
// usa formato M/D/AA (EE.UU.), no D/M/AAAA como escribe Martha, así que
// usarlo intercambiaría día y mes en silencio. Esta función hace la
// conversión serial -> texto D/M/AAAA de forma determinística y sin
// ambigüedad de huso horario (aritmética con `Date.UTC`, nunca hora local),
// para que el resultado pueda alimentar los parsers de texto de
// `calculosHato.ts` sin modificarlos.

/** Época de Excel: el serial 0 es 1899-12-30. No corrige el bug histórico de
 * Excel del 29-feb-1900 inexistente (serial 60) porque ninguna fecha real de
 * este hato cae siquiera cerca de 1900. */
const EPOCA_EXCEL_UTC = Date.UTC(1899, 11, 30);

/** Convierte un serial de fecha de Excel (número de días desde 1899-12-30,
 * como lo entrega `xlsx` con `cellDates:false`) a texto `D/M/AAAA` -- el
 * mismo formato en que aparecen las fechas escritas a mano en las planillas
 * (evidencia: doc S2 §3/§4, todos los ejemplos son día-mes-año). Aritmética
 * puramente UTC, nunca toca la zona horaria del proceso que corre esto. */
export function convertirSerialFechaATexto(serial: number): string {
  const ms = EPOCA_EXCEL_UTC + Math.round(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/** Convierte cualquier valor crudo de celda a texto plano, SIN interpretar
 * fechas (`5` sigue siendo `'5'`, no una fecha serial). Vacío/null/undefined
 * -> `null` (nunca `''` silenciosa que se confunda con "0 caracteres es un
 * valor real"). Espejo minimalista del helper privado de `calculosHato.ts`
 * (`convertirRawATexto`), reexpuesto aquí porque el nivel de grilla también
 * lo necesita y ese helper no está exportado. */
export function valorCeldaATexto(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t === '' ? null : t;
  }
  return String(raw).trim() || null;
}

/** Convierte una celda que se sabe DE FORMA POSICIONAL "con forma de fecha"
 * (F Servicio, Ultima Cria, SECAR crudo, PP crudo, TP crudo, F Nacimiento de
 * TERNERAS) a texto. Si la celda es un número finito, se asume serial de
 * Excel y se convierte vía `convertirSerialFechaATexto`; si ya es texto
 * (caso de las fechas rotas/múltiples de Martha, que Excel nunca pudo tipar
 * como fecha), se conserva tal cual. Nunca decide "esto es una fecha" por
 * inspección de contenido -- eso lo decide el LLAMADOR según qué columna
 * lógica está leyendo (raw.tp nunca se interpreta pero igual se textifica
 * así para que sea legible en el reporte de revisión). */
export function valorFechaATexto(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return convertirSerialFechaATexto(raw);
  }
  return valorCeldaATexto(raw);
}

/** `true` si el valor crudo de una celda debe tratarse como "vacío" a
 * efectos del filtro de fila-fantasma (§2.7) y de fila-repetida-de-
 * encabezado: null/undefined, o texto que solo tiene espacios. Un `0`
 * numérico NO es vacío (es un dato real, ej. PL=0). */
export function esVacio(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  return false;
}
