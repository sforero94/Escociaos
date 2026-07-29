// ARCHIVO: scripts/import-hato/backfill-quincenas-leche.ts
// DESCRIPCIÓN: Runner de I/O (lee un JSON local, escribe un JSON de plan)
// del backfill de quincenas históricas de venta de leche -- SOW 4 de
// `docs/plan_hato_produccion_rework.md` §5/§6. Toda la lógica de
// clasificación/derivación es pura y vive en
// `src/utils/hatoProduccionBackfill.ts` (testeada en
// `src/__tests__/hatoProduccionBackfill.test.ts`); este archivo SOLO hace
// I/O de archivos.
//
// >>> ESTE SCRIPT NUNCA ESCRIBE EN NINGUNA BASE DE DATOS. <<< No abre una
// conexión a Supabase, no importa `@supabase/supabase-js`, no tiene flag
// `--apply`. Mismo precedente y misma razón que
// `recompute-partos-cercanos.ts` (ver su cabecera): el incidente real de
// corrupción de datos con SQL ad hoc de este proyecto (documentado en
// `src/components/hato/CLAUDE.md`, "Incidente de corrupción") es la razón
// explícita del diseño JSON-in/JSON-out. Además, en esta sesión no hay
// `SUPABASE_SERVICE_ROLE_KEY` en disco -- así que aunque el diseño
// admitiera un cliente Supabase, no podría usarse. Quien ejecute la fase
// de escritura real (con acceso SQL/Supabase ya verificado, y con
// aprobación explícita del dueño -- §6 SOW 4, "Nota de ejecución": "la
// fase --apply contra producción es una operación con dueño humano; no la
// ejecuta un agente sin confirmación explícita, igual que el Load
// histórico") relee el artefacto que este script produce, vuelve a
// verificarlo contra el estado vivo (`diffContraEstadoExistente`, mismo
// módulo puro) y aplica el SELECT-luego-UPDATE/INSERT él mismo.
//
// ============================================================================
// Uso
// ============================================================================
//   node --import ./scripts/import-hato/register-alias.mjs \
//     scripts/import-hato/backfill-quincenas-leche.ts <entrada.json> [salida.json]
//
// (Se usa `node --import .../register-alias.mjs`, no `npx tsx`, porque
// `hatoProduccionBackfill.ts` importa de `@/utils/calculosHato` y
// `@/utils/hatoProduccion` vía el alias `@/` -> `src/` -- Vite/Vitest lo
// resuelven solos, un `node script.ts` plano no; `register-alias.mjs`
// es el hook que lo traduce, ver su cabecera. Mismo patrón que
// `backfill-leche.ts`.)
//
// Si se omite `salida.json`, el reporte se imprime por stdout. Si se da,
// además se escribe en disco y se imprime un resumen corto.
//
// ============================================================================
// Forma esperada de `entrada.json`
// ============================================================================
// {
//   "filasIngresoMensual": [
//     { "id": "uuid de fin_ingresos", "fecha": "2023-01-03", "cantidad": 6291 },
//     ...
//   ],
//   "pesajes": [
//     { "animal_id": "uuid de hato_animales", "fecha": "2026-03-04" },
//     ...
//   ]
// }
//
// -- `filasIngresoMensual`: TODAS las filas de `fin_ingresos` de venta de
//    leche del negocio Hato Lechero. Criterio de selección SQL (resuelto
//    por NOMBRE, nunca UUID hardcodeado -- mismo precedente que el RPC
//    `fn_hato_guardar_quincena_venta`, migración 070):
//
//      SELECT i.id, i.fecha, i.cantidad
//      FROM fin_ingresos i
//      JOIN fin_negocios n ON n.id = i.negocio_id
//      JOIN fin_categorias_ingresos c ON c.id = i.categoria_id
//      WHERE n.nombre = 'Hato Lechero' AND c.nombre ILIKE '%leche%'
//      ORDER BY i.fecha;
//
//    Verificado contra producción 2026-07-28: 44 filas. `cantidad` puede
//    venir NULL para alguna fila histórica que la migración 042 no logró
//    parsear -- inclúyela igual (con `cantidad: null`), el motor puro la
//    omite y la reporta, nunca hace falta filtrarla en el SQL.
//
// -- `pesajes`: TODA la tabla `hato_pesajes_leche` -- solo `animal_id` y
//    `fecha` hacen falta (los litros de cada pesaje son ajenos a este
//    conteo). Único insumo de `num_vacas_ordeno` que este motor usa hoy
//    (corrección del dueño, 2026-07-28 -- ver la cabecera de
//    `hatoProduccionBackfill.ts`, sección "CORRECCIÓN"):
//
//      SELECT animal_id, fecha FROM hato_pesajes_leche ORDER BY fecha;
//
//    Verificado contra producción 2026-07-28: primer pesaje 2026-03-04. El
//    motor cuenta, por cada quincena desde esa fecha en adelante, cuántos
//    `animal_id` distintos tienen al menos un pesaje dentro del rango
//    `[fecha_inicio, fecha_fin]` de esa quincena -- ese es el
//    `num_vacas_ordeno` MEDIDO que reemplaza al derivado de chequeos para
//    este backfill (el derivado de chequeos daba 35 vacas para 2026 contra
//    27-28 que confirma la correlación pesaje/factura -- `hato_eventos` no
//    tiene ningún evento `secado_real`, así que esa vía sobreestimaba
//    ~25%). Cualquier quincena ANTERIOR a 2026-03 no recibe ningún conteo
//    -- `num_vacas_ordeno`/`num_vacas_ordeno_origen` quedan `null`/`null`
//    SIEMPRE para esos periodos, sin importar qué traiga `pesajes`.
//
// >>> ESTE RUNNER YA NO PIDE `animales`/`eventos`/`chequeoVacas`/`config` <<<
// (el shape de una sesión anterior de esta misma tarea sí los pedía). El
// motor puro sigue conservando `derivarNumVacasOrdeno` -- la función que
// los consumía -- pero el orquestador (`planificarBackfillProduccionQuincenal`)
// ya no la llama, así que pedir ese dump (171 animales / 768 eventos /
// 1.479 chequeos en producción) sería trabajo del coordinador para un
// insumo que este runner no toca. Si el histórico de `secado_real` empieza
// a poblarse y esa vía se reactiva para el pre-2026-03, este es el primer
// lugar a extender de vuelta -- ver el docstring de `derivarNumVacasOrdeno`.
//
// ============================================================================
// Forma de la salida
// ============================================================================
// Ver `ReporteBackfillProduccionQuincenal` en `hatoProduccionBackfill.ts`:
//   - `filasDerivadas`: filas listas para insertar en
//     `hato_produccion_quincenal` (origen_dato='derivado_mensual').
//     `num_vacas_ordeno`/`num_vacas_ordeno_origen` = conteo medido de
//     pesajes desde 2026-03, `null`/`null` antes de esa fecha.
//   - `clasificaciones`: la clasificación asignada a CADA mes con datos,
//     con su justificación (caso, razón vs. mediana de vecinos, etc.).
//   - `paraRevisionHumana`: subconjunto de `clasificaciones` que NO se
//     decidió en automático (meses multi-fila, siempre; meses ambiguos
//     cerca del umbral) -- es el HUMAN CHECKPOINT que exige §5.3.
//   - `omitidas`: filas de `fin_ingresos` sin `cantidad`, con el motivo.
//   - `resumen`: conteos agregados para el mensaje de consola.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  planificarBackfillProduccionQuincenal,
  type EntradaBackfillProduccionQuincenal,
} from '../../src/utils/hatoProduccionBackfill';

function main(): void {
  const rutaEntrada = process.argv[2];
  const rutaSalida = process.argv[3];

  if (!rutaEntrada) {
    console.error(
      'Uso: node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/backfill-quincenas-leche.ts <entrada.json> [salida.json]',
    );
    process.exit(1);
  }

  const entrada = JSON.parse(readFileSync(rutaEntrada, 'utf-8')) as EntradaBackfillProduccionQuincenal;
  const reporte = planificarBackfillProduccionQuincenal(entrada);
  const salidaJson = JSON.stringify(reporte, null, 2);

  if (rutaSalida) {
    writeFileSync(rutaSalida, salidaJson);
    console.log(`Reporte escrito en ${rutaSalida}.`);
  } else {
    console.log(salidaJson);
  }

  console.log(
    `Meses con datos: ${reporte.resumen.totalMesesConDatos}. ` +
      `Filas derivadas propuestas: ${reporte.resumen.totalFilasDerivadas} (NO son 88 -- ` +
      `salen de la clasificación real, ver §5.2). ` +
      `Omitidas (sin cantidad): ${reporte.resumen.totalOmitidas}. ` +
      `Para revisión humana ANTES de aplicar: ${reporte.resumen.totalParaRevisionHumana}.`,
  );

  if (reporte.resumen.totalParaRevisionHumana > 0) {
    console.log(
      '\nHUMAN CHECKPOINT: hay meses que este script NO decidió en automático ' +
        '(multi-fila y/o cerca del umbral de medio mes) -- revisa `paraRevisionHumana` ' +
        'en el reporte antes de aplicar nada.',
    );
  }
}

main();
