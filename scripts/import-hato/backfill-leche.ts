// ARCHIVO: scripts/import-hato/backfill-leche.ts
// DESCRIPCIÓN: Runner de I/O del backfill de pesajes de leche (D7,
// docs/hato/sesiones-b5-d7-e3.md "Session B"). Única capa que abre el
// `.xlsx` y toca Supabase -- toda la lógica de extracción/derivación/
// resolución de identidad vive en `src/utils/importHato/pesajesLeche.ts`
// (puro, testeado con Vitest, ver `src/__tests__/importHatoPesajesLeche.test.ts`).
//
// >>> ESCRITO PERO NUNCA EJECUTADO EN ESTA SESIÓN (instrucción explícita). <<<
//
// USO:
//   # Solo parsear + reporte de identidad, SIN tocar Supabase (seguro, sin
//   # credenciales, para revisar el reporte de resolución antes de decidir):
//   node --import ./scripts/import-hato/register-alias.mjs \
//     scripts/import-hato/backfill-leche.ts <ruta-xlsx> --dry-run
//
//   # Corrida real (requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, y
//   # escribe en hato_pesajes_leche -- confirmar el reporte de --dry-run
//   # primero):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs \
//     scripts/import-hato/backfill-leche.ts <ruta-xlsx>
//
// El `.xlsx` real ("PROMEDIO DE LECHE DESDE AÑO 2026.xlsx") tiene datos
// reales del hato -- gitignored, nunca se commitea (mismo trato que el
// histórico de chequeos). No vive en este worktree; pásale la ruta como
// primer argumento.
//
// ---------------------------------------------------------------------------
// Por qué NO se usa `.upsert()` de PostgREST (igual que `load.ts`)
// ---------------------------------------------------------------------------
// `hato_pesajes_leche` tiene `UNIQUE(animal_id, fecha)` sobre columnas
// simples (no una expresión), así que un upsert SÍ sería viable ahí -- pero
// se sigue el mismo patrón UPDATE-por-id-luego-INSERT que el resto del
// módulo (`load.ts`, `useProduccionHato.ts`) por consistencia, no porque
// este caso puntual lo exija.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../../src/utils/spreadsheet/index.ts';
import { createClient } from '@supabase/supabase-js';
import {
  procesarHojaLeche,
  resolverIdentidadLeche,
  generarReporteResolucionLeche,
  type ResultadoHojaLeche,
} from '../../src/utils/importHato/pesajesLeche';
import { OVERRIDES_NOMBRE_LECHE } from '../../src/utils/importHato/overridesNombreLeche';
import type { AnimalHatoActual } from '../../src/utils/importHato/diffChequeo';
import type { HojaCruda } from '../../src/utils/importHato/tipos';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(__dirname, 'out');

function resolverRutaXlsx(argRuta: string | undefined): string {
  if (argRuta) return resolvePath(process.cwd(), argRuta);
  // Fallback: busca en la raíz del repo/worktree un .xlsx que mencione LECHE
  // -- mismo criterio de descubrimiento que `extract.ts` con los archivos de
  // chequeo, pero filtrando al revés (solo el de leche, no los de chequeo).
  const raiz = resolvePath(__dirname, '../..');
  const candidato = readdirSync(raiz).find((f) => f.toLowerCase().endsWith('.xlsx') && /leche/i.test(f));
  if (!candidato) {
    console.error('No se encontró ningún .xlsx de leche en la raíz del worktree ni se pasó una ruta como argumento.');
    console.error('Uso: node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/backfill-leche.ts <ruta-xlsx> [--dry-run]');
    process.exit(1);
  }
  return resolvePath(raiz, candidato);
}

function crearClienteServiceRole() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno -- este script NUNCA debe correr con la anon key.');
  }
  return createClient(url, key);
}

async function main(): Promise<void> {
  const argRuta = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : undefined;
  const dryRun = process.argv.includes('--dry-run');
  const diaPesajeIsoArg = process.argv.find((a) => a.startsWith('--dia-pesaje-iso='));
  const diaPesajeIsoDryRun = diaPesajeIsoArg ? Number(diaPesajeIsoArg.split('=')[1]) : 3; // 3 = miércoles

  const rutaXlsx = resolverRutaXlsx(argRuta);
  console.log(`Leyendo: ${rutaXlsx}`);

  const wb = await readXlsx(readFileSync(rutaXlsx), { filename: rutaXlsx });
  const hojasCrudas: HojaCruda[] = wb.sheets.map((sheet) => ({
    archivo: rutaXlsx.split('/').pop()!,
    hoja: sheet.name,
    filas: sheet.rows,
  }));

  let diaPesajeIso = diaPesajeIsoDryRun;
  let supabase: ReturnType<typeof createClient> | null = null;

  if (!dryRun) {
    supabase = crearClienteServiceRole();
    const { data: configRow, error: errConfig } = await supabase
      .from('hato_config')
      .select('valor')
      .eq('clave', 'dia_pesaje_semanal')
      .maybeSingle();
    if (errConfig) throw errConfig;
    const valor = configRow?.valor as { iso?: unknown } | undefined;
    if (!valor || typeof valor.iso !== 'number' || valor.iso < 1 || valor.iso > 7) {
      throw new Error('hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064) -- no se puede derivar la fecha de las lecturas sin esto.');
    }
    diaPesajeIso = valor.iso;
  } else {
    console.log(`--dry-run: usando dia_pesaje_semanal=${diaPesajeIsoDryRun} por defecto (sin conexión a hato_config) -- verifica esto antes de una corrida real.`);
  }

  const hojas: ResultadoHojaLeche[] = hojasCrudas.map((h) => procesarHojaLeche(h, diaPesajeIso));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolvePath(OUT_DIR, 'pesajes-leche-normalizado.json'), JSON.stringify(hojas, null, 2), 'utf-8');

  const totalLecturasParseadas = hojas.reduce((s, h) => s + h.filas.reduce((s2, f) => s2 + f.lecturas.length, 0), 0);
  console.log(`Hojas procesadas: ${hojas.length}`);
  console.log(`Lecturas parseadas (con al menos AM o PM): ${totalLecturasParseadas}`);

  if (dryRun) {
    console.log('\n--dry-run: no se resolvió identidad contra hato_animales (requiere Supabase) ni se escribió nada.');
    console.log(`Escrito: ${resolvePath(OUT_DIR, 'pesajes-leche-normalizado.json')}`);
    return;
  }

  // supabase !== null a partir de acá (asignado arriba cuando !dryRun).
  const { data: animalesData, error: errAnimales } = await supabase!
    .from('hato_animales')
    .select('id, numero, nombre, etapa, estado')
    .eq('etapa', 'vaca')
    .eq('estado', 'activa');
  if (errAnimales) throw errAnimales;
  const animalesActivos = (animalesData ?? []) as AnimalHatoActual[];
  console.log(`Vacas activas candidatas para resolución de identidad: ${animalesActivos.length}`);

  const resultado = resolverIdentidadLeche(hojas, animalesActivos, OVERRIDES_NOMBRE_LECHE);

  const generadoEn = new Date().toISOString();
  const reporte = generarReporteResolucionLeche(resultado, generadoEn);
  const rutaReporte = resolvePath(OUT_DIR, 'pesajes-leche-reporte.md');
  writeFileSync(rutaReporte, reporte, 'utf-8');

  console.log(`Lecturas resueltas: ${resultado.resueltas.length}`);
  console.log(`Lecturas SIN resolver (no se cargan, ver reporte): ${resultado.sinResolver.length}`);
  console.log(`Escrito: ${rutaReporte}`);

  if (resultado.resueltas.length === 0) {
    console.log('\nNada que cargar (0 lecturas resueltas). Revisa el reporte antes de agregar overrides.');
    return;
  }

  // Carga idempotente: UPDATE-por-(animal_id,fecha) si ya existe, INSERT si
  // no -- nunca upsert de PostgREST (ver cabecera). Se resuelve la fila
  // existente en un solo SELECT masivo (por animal_id) para no hacer un
  // roundtrip por lectura.
  const animalIds = [...new Set(resultado.resueltas.map((r) => r.animalId))];
  const existentesPorClave = new Map<string, string>(); // `${animal_id}::${fecha}` -> id
  const CHUNK_SELECT = 100;
  for (let i = 0; i < animalIds.length; i += CHUNK_SELECT) {
    const lote = animalIds.slice(i, i + CHUNK_SELECT);
    const { data, error } = await supabase!.from('hato_pesajes_leche').select('id, animal_id, fecha').in('animal_id', lote);
    if (error) throw error;
    for (const fila of data ?? []) {
      existentesPorClave.set(`${fila.animal_id}::${fila.fecha}`, fila.id as string);
    }
  }

  let actualizados = 0;
  let insertados = 0;
  const nuevas: Array<{ animal_id: string; fecha: string; litros_am: number | null; litros_pm: number | null; litros_total: number; fuente: string }> = [];

  for (const lectura of resultado.resueltas) {
    const clave = `${lectura.animalId}::${lectura.fecha}`;
    const existenteId = existentesPorClave.get(clave);
    if (existenteId) {
      const { error } = await supabase!
        .from('hato_pesajes_leche')
        .update({ litros_am: lectura.litrosAm, litros_pm: lectura.litrosPm, litros_total: lectura.litrosTotal })
        .eq('id', existenteId);
      if (error) throw error;
      actualizados++;
    } else {
      nuevas.push({
        animal_id: lectura.animalId,
        fecha: lectura.fecha,
        litros_am: lectura.litrosAm,
        litros_pm: lectura.litrosPm,
        litros_total: lectura.litrosTotal,
        fuente: 'importacion_leche_2026',
      });
    }
  }

  const CHUNK_INSERT = 200;
  for (let i = 0; i < nuevas.length; i += CHUNK_INSERT) {
    const lote = nuevas.slice(i, i + CHUNK_INSERT);
    const { error } = await supabase!.from('hato_pesajes_leche').insert(lote);
    if (error) throw error;
    insertados += lote.length;
  }

  console.log(`hato_pesajes_leche: ${actualizados} actualizados, ${insertados} insertados.`);
  console.log('--- Backfill de leche: completo ---');
}

main().catch((err) => {
  console.error('Backfill de leche abortado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
