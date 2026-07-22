// ARCHIVO: src/supabase/functions/server/importHato/terneras.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/terneras.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/terneras.ts
// DESCRIPCIÓN: Normaliza una hoja física TERNERAS. Esquema único confirmado
// en las 7 hojas físicas (doc QA §3): `(índice, #, NOMBRE, F NACIMIENTO,
// PADRE, MADRE)`; columnas 7-15 sobrantes son padding vacío. `nombre=NULL`
// es válido ("cría recién nacida, aún sin bautizar"), nunca motivo para
// descartar la fila. `PADRE` mezcla raza y nombre de toro -- se preserva
// verbatim, sin interpretar (pregunta abierta para el dueño, doc QA §3).
// Puro, cero I/O.

import type { ParseIssue } from '../calculos-hato.ts';
import { parseFechasServicio, parseValorNumerico } from '../calculos-hato.ts';
import type { HojaCruda, FilaTerneraNormalizada, ConfianzaFecha } from './tipos.ts';
import { valorCeldaATexto, valorFechaATexto, esVacio } from './celdas.ts';

function normalizarEncabezado(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().replace(/\s+/g, ' ').toUpperCase();
}

/** `F NACIMIENT` (sin la O final) aparece truncado en al menos una hoja real
 * -- se matchea por prefijo, no por igualdad exacta. */
function esEncabezadoFechaNacimiento(norm: string): boolean {
  return norm.startsWith('F NACIMIENT');
}

interface ColmapTerneras {
  numero: number | null;
  nombre: number | null;
  fechaNacimiento: number | null;
  padre: number | null;
  madre: number | null;
}

function localizarEncabezadoTerneras(filas: unknown[][]): number | null {
  for (let i = 0; i < Math.min(5, filas.length); i++) {
    const fila = filas[i];
    let anclas = 0;
    for (const c of fila) {
      const norm = normalizarEncabezado(c);
      if (norm === '#' || norm === 'NOMBRE') anclas++;
    }
    if (anclas >= 2) return i;
  }
  return null;
}

function construirColmapTerneras(filaEncabezado: unknown[]): ColmapTerneras {
  const colmap: ColmapTerneras = { numero: null, nombre: null, fechaNacimiento: null, padre: null, madre: null };
  for (let c = 0; c < filaEncabezado.length; c++) {
    const norm = normalizarEncabezado(filaEncabezado[c]);
    if (norm === '#' && colmap.numero === null) colmap.numero = c;
    else if (norm === 'NOMBRE' && colmap.nombre === null) colmap.nombre = c;
    else if (esEncabezadoFechaNacimiento(norm) && colmap.fechaNacimiento === null) colmap.fechaNacimiento = c;
    else if (norm === 'PADRE' && colmap.padre === null) colmap.padre = c;
    else if (norm === 'MADRE' && colmap.madre === null) colmap.madre = c;
  }
  return colmap;
}

function celda(fila: unknown[], idx: number | null): unknown {
  return idx === null ? null : fila[idx];
}

/** Reusa `parseFechasServicio` (extracción de fecha desde texto, ya probada
 * contra 80 casos verbatim) para F NACIMIENTO -- no es una segunda
 * implementación del parser de fechas, es el mismo parser aplicado a una
 * celda que solo puede traer 0 o 1 fecha real (a diferencia de F Servicio,
 * que soporta hasta 3 -- V7). Si trae más de una, se toma la primera y se
 * deja un issue explícito; nunca se descarta la fila por esto. */
function resolverFechaNacimiento(rawCelda: unknown): { fecha: string | null; confianza: ConfianzaFecha; issues: ParseIssue[] } {
  const texto = valorFechaATexto(rawCelda);
  if (texto === null) return { fecha: null, confianza: 'desconocida', issues: [] };
  const res = parseFechasServicio(texto);
  if (res.fechas.length === 0) {
    return { fecha: null, confianza: 'desconocida', issues: res.issues };
  }
  if (res.fechas.length > 1) {
    return {
      fecha: res.fechas[0],
      confianza: 'aproximada',
      issues: [...res.issues, { crudo: texto, motivo: 'celda de F NACIMIENTO trae más de una fecha, se tomó la primera' }],
    };
  }
  return { fecha: res.fechas[0], confianza: res.issues.length > 0 ? 'aproximada' : 'exacta', issues: res.issues };
}

/** `true` si la fila no trae absolutamente ningún dato en las 5 columnas
 * mapeadas -- fila en blanco intercalada (ej. `HISTORICO TERNERAS`, filas
 * pares vacías entre cada animal real). Un `numero` sin `nombre` (cría sin
 * bautizar) NO es vacía -- solo lo es cuando NINGÚN campo tiene contenido. */
function filaTerneraVacia(fila: unknown[], colmap: ColmapTerneras): boolean {
  for (const idx of [colmap.numero, colmap.nombre, colmap.fechaNacimiento, colmap.padre, colmap.madre]) {
    if (idx === null) continue;
    if (!esVacio(fila[idx])) return false;
  }
  return true;
}

/** Procesa una hoja física TERNERAS. Si no se puede ubicar un encabezado
 * reconocible en la ventana de búsqueda, devuelve `[]` sin lanzar -- no hay
 * evidencia en el corpus de una hoja TERNERAS sin encabezado, pero
 * "no reconocible" nunca debe tumbar el pipeline completo. */
export function procesarHojaTerneras(hoja: HojaCruda): FilaTerneraNormalizada[] {
  const filaEncabezadoIdx = localizarEncabezadoTerneras(hoja.filas);
  if (filaEncabezadoIdx === null) return [];

  const colmap = construirColmapTerneras(hoja.filas[filaEncabezadoIdx]);
  const resultado: FilaTerneraNormalizada[] = [];

  for (let i = filaEncabezadoIdx + 1; i < hoja.filas.length; i++) {
    const filaFisica = hoja.filas[i];
    if (filaTerneraVacia(filaFisica, colmap)) continue;

    const numeroRes = parseValorNumerico(celda(filaFisica, colmap.numero));
    const nacimiento = resolverFechaNacimiento(celda(filaFisica, colmap.fechaNacimiento));

    const issues: ParseIssue[] = [
      ...numeroRes.issues.map((iss) => ({ ...iss, motivo: `[numero] ${iss.motivo}` })),
      ...nacimiento.issues.map((iss) => ({ ...iss, motivo: `[F NACIMIENTO] ${iss.motivo}` })),
    ];

    resultado.push({
      archivo: hoja.archivo,
      hoja: hoja.hoja,
      fila: i + 1,
      numero: numeroRes.valor,
      nombre: valorCeldaATexto(celda(filaFisica, colmap.nombre)),
      fechaNacimiento: nacimiento.fecha,
      fechaNacimientoConfianza: nacimiento.confianza,
      padreRaw: valorCeldaATexto(celda(filaFisica, colmap.padre)),
      madreRaw: valorCeldaATexto(celda(filaFisica, colmap.madre)),
      issues,
    });
  }

  return resultado;
}
