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
// El adaptador conserva fechas como seriales de Excel (normaliza 1904 a
// 1900 con aritmética UTC), el texto de errores como #VALUE! y la geometría
// completa con null en huecos. No convierte errores a códigos numéricos.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../../src/utils/spreadsheet/index.ts';
import type { HatoConfig } from '@/utils/calculosHato';
import type { HojaCruda } from '@/utils/importHato/tipos';
import { normalizarHojas } from '@/utils/importHato/normalizar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolvePath(__dirname, '../..');
const OUT_DIR = resolvePath(__dirname, 'out');

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
  // gyr: agregada por decisión del dueño 2026-07-22 (migración 064 -- si esa
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

async function main(): Promise<void> {
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
    const wb = await readXlsx(readFileSync(resolvePath(RAIZ, archivo)), { filename: archivo });
    for (const sheet of wb.sheets) {
      hojas.push({ archivo: basename(archivo), hoja: sheet.name, filas: sheet.rows });
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

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; });
