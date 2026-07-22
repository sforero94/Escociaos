// ARCHIVO: src/supabase/functions/server/importHato/normalizar.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/normalizar.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/normalizar.ts
// DESCRIPCIÓN: Punto de entrada de Extract+Normalize (S3, ver
// docs/hato/s3-contrato-pipeline.md). Recibe `HojaCruda[]` (una hoja cruda
// por cada hoja física de cada `.xlsx`, ya leída por el runner de I/O) y un
// timestamp inyectado por el caller, y devuelve `SalidaNormalizado` -- el
// JSON intermedio que Resolve (agente B) consume. Cero I/O, cero `xlsx`.

import type { HatoConfig } from '../calculos-hato.ts';
import type { HojaCruda, SalidaNormalizado, FilaTerneraNormalizada } from './tipos.ts';
import { clasificarHoja } from './grilla.ts';
import { procesarHojaChequeo } from './chequeos.ts';
import { procesarHojaTerneras } from './terneras.ts';
import { aplicarDedupe, type ProcesadaChequeo } from './dedupe.ts';

/**
 * Normaliza el corpus completo de hojas crudas. El orden de `hojas` importa
 * para el dedupe (`dedupe.ts`): la primera hoja que resuelve a una fecha de
 * chequeo dada es la "sobreviviente" contra la que se comparan las demás --
 * el runner lee archivos y hojas en un orden determinístico (alfabético de
 * archivo, orden del workbook dentro de cada archivo) para que una
 * re-corrida siempre produzca el mismo resultado.
 */
export function normalizarHojas(hojas: HojaCruda[], generadoEn: string, config: HatoConfig): SalidaNormalizado {
  const procesadasChequeo: ProcesadaChequeo[] = [];
  const terneras: FilaTerneraNormalizada[] = [];

  for (const hoja of hojas) {
    const tipo = clasificarHoja(hoja.archivo, hoja.hoja);
    if (tipo === 'ternera') {
      terneras.push(...procesarHojaTerneras(hoja));
    } else if (tipo === 'chequeo') {
      const { manifest, filas, subtablas } = procesarHojaChequeo(hoja, config);
      procesadasChequeo.push({ archivo: hoja.archivo, hoja: hoja.hoja, manifest, filas, subtablas });
    }
    // 'fuera_de_alcance' (hojas de leche, Hoja1/Hoja2, Flujo Caja...) se
    // ignora en silencio a propósito -- fuera del alcance de S3 (ver
    // docs/hato/s3-handoff.md §3); "no crashear" es el único requisito, y
    // como no producen ni chequeos ni terneras no hay nada que preservar.
  }

  const { hojas: hojasFinal, chequeos, subtablas } = aplicarDedupe(procesadasChequeo);

  return {
    generadoEn,
    hojas: hojasFinal,
    chequeos,
    terneras,
    subtablas,
  };
}

// Re-exports de conveniencia para tests y para el runner de I/O.
export { clasificarHoja, type TipoHoja } from './grilla.ts';
export { procesarHojaChequeo } from './chequeos.ts';
export { procesarHojaTerneras } from './terneras.ts';
export { parseToro, type ResultadoToro } from './parseToro.ts';
export { convertirSerialFechaATexto, valorCeldaATexto, valorFechaATexto } from './celdas.ts';
export { aplicarDedupe, type ProcesadaChequeo, type ResultadoDedupe } from './dedupe.ts';
