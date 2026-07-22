// ARCHIVO: scripts/import-hato/extract.ts
// DESCRIPCIÓN: Runner de I/O de las etapas "Extract + Normalize" (plan
// docs/plan_hato_lechero_module.md §7.4, pasos 1-2). Única capa que abre los
// `.xlsx` -- toda la lógica de grilla y normalización vive en
// `src/utils/importHato/` (pura, testeada con Vitest).
//
// USO:
//   node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/extract.ts
//
// Escribe `scripts/import-hato/out/normalizado.json`, que consume
// `resolve.ts`. Ese directorio está en `.gitignore`: contiene datos reales
// del hato y NUNCA se commitea.
//
// Los `.xlsx` viven en la raíz del worktree, untracked a propósito. Este
// script SOLO los lee.
//
// ---------------------------------------------------------------------------
// Dos decisiones de lectura que NO son cosméticas:
//
// 1. `cellDates` queda en FALSE (el default). `celdas.ts` espera que una
//    fecha bien tipada llegue como SERIAL de Excel y la convierte a texto
//    `D/M/AAAA` con aritmética UTC. Si se leyera con `cellDates:true`
//    llegarían objetos `Date` construidos en la zona horaria del proceso, y
//    una fecha a medianoche puede correrse un día según dónde corra esto.
//
// 2. La grilla se arma celda por celda desde el worksheet, NO con
//    `sheet_to_json`. Motivo: las celdas de ERROR de Excel. `sheet_to_json`
//    con `raw:true` entrega el CÓDIGO NUMÉRICO del error (`#VALUE!` -> 15),
//    que es indistinguible de un dato numérico real. Y `#VALUE!` es
//    justamente el fenómeno central del corpus (doc S2 §4: siempre es
//    derivado de un `F Servicio` roto, 69 celdas, 0 huérfanas). Leyendo la
//    celda directa se conserva el texto `#VALUE!`, que es lo que
//    `parseValorNumerico` de `calculosHato.ts` sabe reconocer.
// ---------------------------------------------------------------------------

import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type * as XLSXTypes from 'xlsx';
import type { HatoConfig } from '@/utils/calculosHato';
import type { HojaCruda } from '@/utils/importHato/tipos';
import { normalizarHojas } from '@/utils/importHato/normalizar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolvePath(__dirname, '../..');
const OUT_DIR = resolvePath(__dirname, 'out');

// `xlsx@0.18.5` es CommonJS: bajo ESM el namespace que entrega
// `import * as XLSX` no expone sus funciones (`XLSX.readFile is not a
// function`). `createRequire` lo carga por la vía que la librería sí soporta.
// El `import type` de arriba conserva los tipos sin cargar nada en runtime.
const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof XLSXTypes;

/** Archivos fuera del alcance del módulo Hato Lechero, excluidos a nivel de
 * ARCHIVO (las hojas de leche se excluyen más adentro, en `clasificarHoja`).
 * `GASTOS FOV` es finanzas/Fovemsa: la matriz de P&G se homologó por
 * separado (plan §7.4). */
const ARCHIVOS_EXCLUIDOS = [/^GASTOS FOV/i];

/**
 * Espejo de los 10 valores sembrados en `hato_config` por las migraciones
 * 058 (9 claves) y 062 (`dias_espera_voluntaria_post_parto`).
 *
 * ⚠️ Esto es una COPIA de lectura, no una segunda fuente de verdad: la tabla
 * `hato_config` manda. Vive aquí y no en el módulo puro porque el módulo
 * puro no puede tener constantes de negocio (plan §7.1) -- las recibe como
 * parámetro. Un runner offline no tiene sesión de Supabase para leerlas, así
 * que las inyecta desde aquí. Si alguien edita `hato_config` en producción,
 * hay que actualizar este bloque (o darle al runner una service-role key y
 * leerlas; no se hizo para no pedir credenciales que este paso no necesita).
 */
const CONFIG: HatoConfig = {
  // gyr: agregada por decisión del dueño 2026-07-22 (migración 063 -- si esa
  // migración aún no se aplicó a producción, este espejo va un paso adelante
  // de la tabla, deliberadamente: la decisión ya está tomada).
  razas: ['jersey', 'holstein', 'normanda', 'gyr'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_espera_voluntaria_post_parto: 60,
  dias_rechequeo_due: 60,
};

/** Convierte una hoja del workbook en la matriz cruda que espera el
 * normalizador. Devuelve `unknown[][]` con `null` en las celdas vacías, el
 * valor crudo (número/texto/booleano) en las llenas, y el texto del error
 * (`'#VALUE!'`) en las celdas de error. */
function hojaAMatriz(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const rango = XLSX.utils.decode_range(ref);
  const filas: unknown[][] = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: unknown[] = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (celda === undefined || celda.v === undefined || celda.v === null) {
        fila.push(null);
        continue;
      }
      // Celda de error de Excel: conservar el TEXTO (`#VALUE!`), nunca el
      // código numérico -- ver la nota 2 de la cabecera.
      if (celda.t === 'e') {
        fila.push(celda.w ?? '#VALUE!');
        continue;
      }
      fila.push(celda.v);
    }
    filas.push(fila);
  }
  return filas;
}

function main(): void {
  // Orden determinístico: archivos alfabéticamente, hojas en el orden del
  // workbook. El dedupe (`dedupe.ts`) conserva la PRIMERA hoja que resuelve a
  // una fecha dada, así que este orden es parte del resultado -- no es un
  // detalle de presentación.
  const archivos = readdirSync(RAIZ)
    .filter((f) => f.toLowerCase().endsWith('.xlsx'))
    .filter((f) => !ARCHIVOS_EXCLUIDOS.some((re) => re.test(f)))
    .sort((a, b) => a.localeCompare(b, 'es'));

  if (archivos.length === 0) {
    console.error(`No se encontró ningún .xlsx en ${RAIZ}.`);
    console.error('Son datos reales del hato, untracked a propósito: pídeselos a Santiago.');
    process.exit(1);
  }

  const hojas: HojaCruda[] = [];
  for (const archivo of archivos) {
    const wb = XLSX.readFile(resolvePath(RAIZ, archivo), { cellDates: false });
    for (const nombreHoja of wb.SheetNames) {
      hojas.push({
        archivo: basename(archivo),
        hoja: nombreHoja,
        filas: hojaAMatriz(wb.Sheets[nombreHoja]),
      });
    }
  }

  // `generadoEn` lo inyecta el runner, nunca la lógica pura (contrato
  // docs/hato/s3-contrato-pipeline.md).
  const salida = normalizarHojas(hojas, new Date().toISOString(), CONFIG);

  mkdirSync(OUT_DIR, { recursive: true });
  const destino = resolvePath(OUT_DIR, 'normalizado.json');
  writeFileSync(destino, JSON.stringify(salida, null, 2), 'utf8');

  const conFecha = salida.hojas.filter((h) => h.chequeoFecha !== null).length;
  const duplicadas = salida.hojas.filter((h) => h.duplicadaDe !== null).length;
  const fechasUnicas = new Set(
    salida.hojas.filter((h) => h.duplicadaDe === null && h.chequeoFecha).map((h) => h.chequeoFecha),
  ).size;
  const descartadas = salida.hojas.reduce((s, h) => s + h.filasDescartadas, 0);
  const conIssues = salida.chequeos.filter((f) => f.issues.length > 0).length;

  console.log(`Archivos leídos ................ ${archivos.length}`);
  console.log(`Hojas físicas totales .......... ${hojas.length}`);
  console.log(`Hojas de chequeo ............... ${salida.hojas.length}`);
  console.log(`  ...con fecha resuelta ........ ${conFecha}`);
  console.log(`  ...marcadas duplicadas ....... ${duplicadas}`);
  console.log(`Fechas de chequeo únicas ....... ${fechasUnicas}`);
  console.log(`Filas de chequeo normalizadas .. ${salida.chequeos.length}`);
  console.log(`  ...con al menos un issue ..... ${conIssues}`);
  console.log(`Filas descartadas (fantasma) ... ${descartadas}`);
  console.log(`Filas TERNERAS ................. ${salida.terneras.length}`);
  console.log(`Filas de sub-tabla embebida .... ${salida.subtablas.length}`);
  console.log(`\nEscrito: ${destino}`);
}

main();
