// ARCHIVO: utils/importHato/normalizar.ts
// DESCRIPCIÓN: Punto de entrada de Extract+Normalize (S3, ver
// docs/hato/s3-contrato-pipeline.md). Recibe `HojaCruda[]` (una hoja cruda
// por cada hoja física de cada `.xlsx`, ya leída por el runner de I/O) y un
// timestamp inyectado por el caller, y devuelve `SalidaNormalizado` -- el
// JSON intermedio que Resolve (agente B) consume. Cero I/O, cero `xlsx`.

import type { HatoConfig } from '@/utils/calculosHato';
import type { HojaCruda, SalidaNormalizado, FilaTerneraNormalizada } from './tipos';
import { clasificarHoja } from './grilla';
import { procesarHojaChequeo } from './chequeos';
import { procesarHojaTerneras } from './terneras';
import { aplicarDedupe, type ProcesadaChequeo } from './dedupe';

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
export { clasificarHoja, type TipoHoja } from './grilla';
export { procesarHojaChequeo } from './chequeos';
export { procesarHojaTerneras } from './terneras';
export { parseToro, type ResultadoToro } from './parseToro';
export { convertirSerialFechaATexto, valorCeldaATexto, valorFechaATexto } from './celdas';
export { aplicarDedupe, type ProcesadaChequeo, type ResultadoDedupe } from './dedupe';
