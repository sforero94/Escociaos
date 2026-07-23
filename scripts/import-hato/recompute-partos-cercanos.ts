// ARCHIVO: scripts/import-hato/recompute-partos-cercanos.ts
// DESCRIPCIÓN: Runner de I/O (lee un JSON local, imprime/escribe un JSON de
// decisiones) para el colapso de partos cercanos (decisión del dueño,
// 2026-07-23 -- ver CLAUDE.md, sección Hato Lechero, y
// `src/utils/importHato/recomputarPartosCercanos.ts` para la lógica pura).
//
// >>> ESTE SCRIPT NUNCA ESCRIBE EN NINGUNA BASE DE DATOS. <<< No abre una
// conexión a Supabase, no importa `@supabase/supabase-js`, no tiene flag
// `--apply`. Un incidente real de corrupción de datos con SQL ad hoc
// anterior en este proyecto es la razón explícita de este diseño: toma un
// JSON, produce un JSON de decisiones, y se detiene ahí. Quien lo ejecuta
// (con acceso SQL directo y ya verificado) revisa la salida y aplica los
// DELETE/UPDATE él mismo.
//
// ============================================================================
// Uso
// ============================================================================
//   npx tsx scripts/import-hato/recompute-partos-cercanos.ts <entrada.json> [salida.json]
//
// Si se omite `salida.json`, el reporte se imprime por stdout.
//
// ============================================================================
// Forma esperada de `entrada.json`
// ============================================================================
// {
//   "chequeoVacas": [
//     {
//       "id": "uuid de hato_chequeo_vacas",
//       "animal_id": "uuid de hato_animales",
//       "chequeo_fecha": "2025-11-25",     // fecha de hato_chequeos, join por chequeo_id
//       "sx_raw": "OV",
//       "ultima_cria_raw": "2/12/2025"
//     },
//     ...
//   ],
//   "eventosParto": [
//     {
//       "id": "uuid de hato_eventos",
//       "animal_id": "uuid",
//       "chequeo_vaca_id": "uuid de hato_chequeo_vacas",
//       "fecha": "2025-12-02",
//       "fecha_confianza": "exacta"
//     },
//     ...
//   ]
// }
//
// `chequeoVacas` debe traer TODAS las filas HISTÓRICAS de
// `hato_chequeo_vacas` (join a `hato_chequeos` para `chequeo_fecha`) -- el
// clustering necesita el historial COMPLETO de cada animal, no solo las
// filas que ya tienen un evento parto registrado. `eventosParto` debe traer
// SOLO `hato_eventos` con `tipo='parto'`.
//
// ============================================================================
// Forma de la salida
// ============================================================================
// Ver `ReporteRecomputePartosCercanos` en `recomputarPartosCercanos.ts`:
//   - `eliminar`: filas de `hato_eventos` a borrar (duplicados colapsados).
//   - `actualizar`: la fila sobreviviente de cada cluster, con su `fecha`
//     nueva (el `id` NUNCA cambia).
//   - `advertencias`: clusters que este script NO pudo resolver con una
//     decisión segura (ver `recomputarPartosCercanos.ts` para los dos casos
//     -- nunca se inventa una decisión en su lugar).

import { readFileSync, writeFileSync } from 'node:fs';
import {
  recomputarPartosCercanos,
  type EntradaRecomputePartosCercanos,
} from '../../src/utils/importHato/recomputarPartosCercanos';

function main(): void {
  const rutaEntrada = process.argv[2];
  const rutaSalida = process.argv[3];

  if (!rutaEntrada) {
    console.error('Uso: npx tsx scripts/import-hato/recompute-partos-cercanos.ts <entrada.json> [salida.json]');
    process.exit(1);
  }

  const entrada = JSON.parse(readFileSync(rutaEntrada, 'utf-8')) as EntradaRecomputePartosCercanos;
  const reporte = recomputarPartosCercanos(entrada);
  const salidaJson = JSON.stringify(reporte, null, 2);

  if (rutaSalida) {
    writeFileSync(rutaSalida, salidaJson);
    console.log(
      `Reporte escrito en ${rutaSalida}. clustersConColapso=${reporte.clustersConColapso}, eliminar=${reporte.eliminar.length}, actualizar=${reporte.actualizar.length}, advertencias=${reporte.advertencias.length}.`,
    );
  } else {
    console.log(salidaJson);
  }
}

main();
