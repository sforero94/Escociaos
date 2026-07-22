// ARCHIVO: scripts/import-hato/load.ts
// DESCRIPCIÓN: Runner de I/O de la etapa "Load" (plan
// docs/plan_hato_lechero_module.md §7.4, paso 4). Carga a Supabase el
// registro de animales YA REVISADO por Martha (`animales.csv`, editado a
// mano si hizo falta reasignar algún número) más los chequeos/eventos
// crudos que produjo Extract+Normalize (`normalizado.json`).
//
// >>> ESCRITO PERO NUNCA EJECUTADO EN ESTA SESIÓN (instrucción explícita). <<<
// Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en el entorno (NUNCA
// la anon key -- este script escribe en tablas cuya RLS exige rol
// Administrador/Gerencia, y corre fuera de una sesión de usuario autenticado).
//
// USO (cuando corresponda ejecutarlo):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx scripts/import-hato/load.ts
//
// ============================================================================
// Por qué se rehúsa a correr
// ============================================================================
// Antes de escribir una sola fila, este script:
//   1. Relee `animales.csv` y ABORTA si encuentra CUALQUIER fila con
//      `bloqueado_por_colision=true` -- eso significa que Martha todavía no
//      adjudicó al menos una colisión de chapeta vigente (resolution-report.md
//      sección 1). Cargar de todas formas violaría el UNIQUE(numero) de
//      `hato_animales` en el mejor caso, o insertaría una identidad
//      arbitraria en el peor.
//   2. Verifica que no queden `numero` duplicados entre las filas restantes
//      (defensivo -- (1) ya debería garantizarlo, pero un CSV editado a mano
//      puede introducir un duplicado nuevo).
//
// ============================================================================
// Idempotencia
// ============================================================================
// Una re-corrida limpia PRIMERO todo lo que trajo una corrida anterior de
// este mismo import, en el orden que exigen las FK (`hato_eventos` y
// `hato_chequeo_vacas` referencian `hato_animales` sin ON DELETE CASCADE --
// migración 053 -- así que hay que borrar de abajo hacia arriba):
//   1. DELETE hato_eventos     WHERE animal_id IN (animales de este import)
//   2. DELETE hato_chequeos    WHERE fuente = 'importacion'  (cascada -> chequeo_vacas)
//   3. DELETE hato_animales    WHERE origen = 'importacion_historica'
// Solo entonces se insertan las filas frescas. `hato_toros` NO se limpia --
// es un catálogo compartido con la captura en vivo (Épica G4); sembrar ahí
// usa `SELECT primero, INSERT si no existe` (ver `obtenerOCrearToro`), nunca
// un DELETE.
//
// ============================================================================
// Por qué NO se usa `.upsert()` de PostgREST en ningún punto de este archivo
// ============================================================================
// Lección de `CapturaCosechaGrid` (ver CLAUDE.md, sección Producción) y de
// la migración 052 (`fin_parametros`): un UNIQUE sobre una columna NULLABLE
// (`hato_animales.numero`, migración 053) o sobre un índice de EXPRESIÓN
// (`hato_toros_nombre_unique` es `UNIQUE (lower(nombre))`, no una columna
// simple) no se puede resolver de forma confiable con `on_conflict` de
// PostgREST. Este script SIEMPRE hace SELECT-primero (o DELETE-primero) y
// luego INSERT plano -- nunca upsert.
//
// ============================================================================
// "Transaccional" -- limitación real, documentada en vez de prometida en falso
// ============================================================================
// El plan §7.4 pide que Load sea transaccional. Un script de Node contra
// PostgREST (`@supabase/supabase-js`) NO tiene una transacción real
// multi-sentencia -- cada `.insert()`/`.delete()` es su propia llamada HTTP.
// La atomicidad de verdad requeriría una función SECURITY DEFINER en SQL que
// envuelva todo el import en un solo `BEGIN/COMMIT` (precedente:
// `fn_cleanup_compra_dependencies()`, migración 039) -- eso es una migración
// nueva, decisión del CTO, fuera del alcance de S3 Resolve+Verify. Lo que
// ESTE script sí garantiza es que una corrida parcial (ej. la conexión se
// cae a mitad de `hato_chequeo_vacas`) es SEGURA DE REINTENTAR: el paso de
// limpieza de arriba deja la base como si el import nunca hubiera corrido,
// así que basta con volver a ejecutar el script completo.

import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { descomponerSX, parseSX, type EventoDerivado } from '../../src/utils/calculosHato';
import type { SalidaNormalizado, FilaChequeoNormalizada } from '../../src/utils/importHato/tipos';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(__dirname, 'out');

// Cliente SIN el tipo `Database` generado (src/types/database.ts todavía no
// incluye las tablas hato_* -- no se regenera a mano en este script, eso es
// un paso de tooling aparte). Es intencional: este es un script de I/O de
// una sola corrida, no código de la app.
function crearClienteServiceRole() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno -- este script NUNCA debe correr con la anon key.');
  }
  return createClient(url, key);
}

interface FilaAnimalCsv {
  numero: string;
  nombre: string;
  etapa_presunta: string;
  origen: string;
  estado_presunto: string;
  fecha_estado_presunta: string;
  fecha_nacimiento: string;
  fecha_nacimiento_confianza: string;
  madre_raw: string;
  confianza: string;
  bloqueado_por_colision: string;
  nombres_obsoletos: string;
  notas: string;
}

function leerAnimalesCsv(ruta: string): FilaAnimalCsv[] {
  const texto = readFileSync(ruta, 'utf-8');
  const { data, errors } = Papa.parse<FilaAnimalCsv>(texto, { header: true, skipEmptyLines: true });
  if (errors.length > 0) {
    throw new Error(`animales.csv tiene errores de formato: ${JSON.stringify(errors)}`);
  }
  return data;
}

function vacio(valor: string | undefined): string | null {
  return valor && valor.trim() !== '' ? valor : null;
}

/** Mapea `etapa_presunta` (heurística de Resolve: 'vaca'|'cria') al vocabulario
 * real de `hato_animales.etapa` (CHECK: ternera|novilla|vaca|toro, migración
 * 053). Resolve no puede distinguir ternera de novilla sin las reglas de edad
 * de `hato_config` (fuera de su alcance) -- 'cria' se carga como 'ternera'
 * por default, seguro de corregir después a mano o desde la UI. */
function mapearEtapa(etapaPresunta: string): 'ternera' | 'vaca' {
  return etapaPresunta === 'vaca' ? 'vaca' : 'ternera';
}

// ============================================================================
// Paso 0: guardas -- Load se rehúsa a correr si hay colisiones sin resolver
// ============================================================================

function verificarSinBloqueos(filas: FilaAnimalCsv[]): void {
  const bloqueadas = filas.filter((f) => f.bloqueado_por_colision === 'true');
  if (bloqueadas.length > 0) {
    const numeros = [...new Set(bloqueadas.map((f) => f.numero))].join(', ');
    throw new Error(
      `Load rechaza correr: ${bloqueadas.length} fila(s) de animales.csv siguen marcadas bloqueado_por_colision=true ` +
        `(numero(s): ${numeros}). Resuelve la sección 1 de resolution-report.md (Martha adjudica cada par) y edita ` +
        `animales.csv a mano antes de reintentar.`,
    );
  }

  const noBloqueadas = filas.filter((f) => f.bloqueado_por_colision !== 'true');
  const porNumero = new Map<string, number>();
  for (const f of noBloqueadas) {
    porNumero.set(f.numero, (porNumero.get(f.numero) ?? 0) + 1);
  }
  const duplicados = [...porNumero.entries()].filter(([, n]) => n > 1).map(([numero]) => numero);
  if (duplicados.length > 0) {
    throw new Error(
      `Load rechaza correr: animales.csv tiene numero(s) duplicado(s) fuera de una colisión marcada (${duplicados.join(
        ', ',
      )}) -- probablemente una edición manual introdujo el duplicado. Corrige el CSV antes de reintentar.`,
    );
  }
}

// ============================================================================
// Paso 1: limpieza idempotente (orden inverso de FK -- ver comentario de cabecera)
// ============================================================================

async function limpiarCorridaAnterior(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { data: animalesPrevios, error: errAnimales } = await supabase
    .from('hato_animales')
    .select('id')
    .eq('origen', 'importacion_historica');
  if (errAnimales) throw errAnimales;

  const idsPrevios = (animalesPrevios ?? []).map((a) => a.id as string);

  if (idsPrevios.length > 0) {
    const { error: errEventos } = await supabase.from('hato_eventos').delete().in('animal_id', idsPrevios);
    if (errEventos) throw errEventos;
  }

  // Cascada: borrar hato_chequeos con fuente='importacion' arrastra sus
  // hato_chequeo_vacas (ON DELETE CASCADE, migración 053).
  const { error: errChequeos } = await supabase.from('hato_chequeos').delete().eq('fuente', 'importacion');
  if (errChequeos) throw errChequeos;

  if (idsPrevios.length > 0) {
    const { error: errAnimalesDelete } = await supabase.from('hato_animales').delete().eq('origen', 'importacion_historica');
    if (errAnimalesDelete) throw errAnimalesDelete;
  }

  console.log(`Limpieza: ${idsPrevios.length} animal(es) de una corrida anterior eliminados junto con sus chequeos/eventos.`);
}

// ============================================================================
// Paso 2: hato_toros -- SELECT primero, INSERT si no existe (nunca upsert:
// el índice único es sobre lower(nombre), una expresión que PostgREST
// on_conflict no puede referenciar -- ver comentario de cabecera).
// ============================================================================

async function obtenerOCrearToro(
  supabase: ReturnType<typeof createClient>,
  nombre: string,
  cache: Map<string, string>,
): Promise<string> {
  const clave = nombre.trim().toLowerCase();
  if (cache.has(clave)) return cache.get(clave)!;

  const { data: existente, error: errSelect } = await supabase
    .from('hato_toros')
    .select('id')
    .ilike('nombre', nombre.trim())
    .maybeSingle();
  if (errSelect) throw errSelect;
  if (existente) {
    cache.set(clave, existente.id as string);
    return existente.id as string;
  }

  const { data: creado, error: errInsert } = await supabase
    .from('hato_toros')
    .insert({ nombre: nombre.trim(), origen: 'importacion_historica' })
    .select('id')
    .single();
  if (errInsert) throw errInsert;
  cache.set(clave, creado.id as string);
  return creado.id as string;
}

// ============================================================================
// Paso 3: hato_animales -- INSERT plano (la tabla quedó limpia en el paso 1)
// ============================================================================

async function cargarAnimales(
  supabase: ReturnType<typeof createClient>,
  filas: FilaAnimalCsv[],
): Promise<Map<number, string>> {
  const numeroAId = new Map<number, string>();
  const CHUNK = 200;
  for (let i = 0; i < filas.length; i += CHUNK) {
    const lote = filas.slice(i, i + CHUNK).map((f) => ({
      numero: Number(f.numero),
      nombre: vacio(f.nombre),
      etapa: mapearEtapa(f.etapa_presunta),
      estado: f.estado_presunto === 'vendida' ? 'vendida' : 'activa',
      fecha_estado: vacio(f.fecha_estado_presunta),
      fecha_nacimiento: vacio(f.fecha_nacimiento),
      fecha_nacimiento_confianza: f.fecha_nacimiento_confianza || 'desconocida',
      origen: 'importacion_historica',
      confianza: f.confianza || 'media',
      notas: [vacio(f.madre_raw) ? `Madre (crudo): ${f.madre_raw}` : null, vacio(f.notas)].filter(Boolean).join(' | ') || null,
      import_meta: { nombres_obsoletos: f.nombres_obsoletos ? f.nombres_obsoletos.split(' | ') : [] },
    }));
    const { data, error } = await supabase.from('hato_animales').insert(lote).select('id, numero');
    if (error) throw error;
    for (const fila of data ?? []) {
      if (fila.numero !== null) numeroAId.set(fila.numero as number, fila.id as string);
    }
  }
  console.log(`hato_animales: ${numeroAId.size} animales cargados.`);
  return numeroAId;
}

// ============================================================================
// Paso 4: hato_chequeos + hato_chequeo_vacas
// ============================================================================

function claveLectura(fila: FilaChequeoNormalizada): string {
  return fila.chequeoFecha ?? `SIN_FECHA::${fila.archivo}::${fila.hoja}`;
}

async function cargarChequeos(
  supabase: ReturnType<typeof createClient>,
  chequeos: FilaChequeoNormalizada[],
  numeroAId: Map<number, string>,
): Promise<Map<string, string>> {
  const lecturas = new Map<string, { fecha: string | null; archivo: string; hoja: string }>();
  for (const fila of chequeos) {
    const clave = claveLectura(fila);
    if (!lecturas.has(clave)) lecturas.set(clave, { fecha: fila.chequeoFecha, archivo: fila.archivo, hoja: fila.hoja });
  }

  const claveAChequeoId = new Map<string, string>();
  for (const [clave, lectura] of lecturas) {
    if (lectura.fecha === null) {
      console.warn(`Lectura sin fecha resuelta (${lectura.archivo} :: ${lectura.hoja}) -- se omite, no se puede cargar hato_chequeos.fecha (NOT NULL).`);
      continue;
    }
    const { data, error } = await supabase
      .from('hato_chequeos')
      .insert({ fecha: lectura.fecha, fuente: 'importacion', sheet_ref: `${lectura.archivo}::${lectura.hoja}`, estado: 'cerrado' })
      .select('id')
      .single();
    if (error) throw error;
    claveAChequeoId.set(clave, data.id as string);
  }
  console.log(`hato_chequeos: ${claveAChequeoId.size} lecturas cargadas.`);

  const chequeoVacaId = new Map<FilaChequeoNormalizada, string>();
  const CHUNK = 200;
  for (let i = 0; i < chequeos.length; i += CHUNK) {
    const lote = chequeos.slice(i, i + CHUNK);
    const filasInsertables = lote
      .map((fila) => {
        if (fila.numero === null) return null; // sin numero -> no hay animal_id, no se puede cargar (queda solo en el reporte)
        const animalId = numeroAId.get(fila.numero);
        const chequeoId = claveAChequeoId.get(claveLectura(fila));
        if (!animalId || !chequeoId) return null; // animal bloqueado/no resuelto, o lectura sin fecha
        return { fila, animalId, chequeoId };
      })
      .filter((x): x is { fila: FilaChequeoNormalizada; animalId: string; chequeoId: string } => x !== null);

    if (filasInsertables.length === 0) continue;

    const { data, error } = await supabase
      .from('hato_chequeo_vacas')
      .insert(
        filasInsertables.map(({ fila, animalId, chequeoId }) => ({
          chequeo_id: chequeoId,
          animal_id: animalId,
          pl_raw: fila.raw.pl,
          np_raw: fila.raw.np,
          ultima_cria_raw: fila.raw.ultimaCria,
          sx_raw: fila.raw.sx,
          fecha_servicio_raw: fila.raw.fechaServicio,
          toro_raw: fila.raw.toro,
          tp_raw: fila.raw.tp,
          estado_raw: fila.raw.estado,
          secar_raw: fila.raw.secar,
          pp_raw: fila.raw.pp,
          ttto_raw: fila.raw.ttto,
          pl: fila.pl,
          num_partos: fila.numPartos,
          fecha_servicio: fila.fechasServicio.at(-1) ?? null, // el servicio VIGENTE es el último de la lista (V7)
          toro: fila.toroNombre,
          tipo_servicio: fila.tipoServicio,
          fecha_secar: fila.fechaSecar,
          fecha_probable_parto: fila.fechaProbableParto,
          estado: fila.estado?.tipo === 'vacio' || fila.estado?.tipo === undefined ? null : fila.estado?.tipo,
          normalizacion_issues: fila.issues.length > 0 ? fila.issues : null,
        })),
      )
      .select('id');
    if (error) throw error;
    (data ?? []).forEach((row, idx) => chequeoVacaId.set(filasInsertables[idx].fila, row.id as string));
  }
  console.log(`hato_chequeo_vacas: ${chequeoVacaId.size} filas cargadas.`);

  // Se devuelve indexado por clave estable (archivo::hoja::fila) porque un
  // Map con objeto como llave no sobrevive al reordenamiento entre chunks --
  // se reconstruye aquí para el paso de eventos.
  const porClaveFila = new Map<string, string>();
  for (const [fila, id] of chequeoVacaId) {
    porClaveFila.set(`${fila.archivo}::${fila.hoja}::${fila.fila}`, id);
  }
  return porClaveFila;
}

// ============================================================================
// Paso 5: hato_eventos -- descompone SX con el MISMO parser que la captura en
// vivo (calculosHato.ts, plan §7.4 -- "un solo parser para importación y
// captura").
// ============================================================================

async function cargarEventos(
  supabase: ReturnType<typeof createClient>,
  chequeos: FilaChequeoNormalizada[],
  numeroAId: Map<number, string>,
  chequeoVacaIdPorClave: Map<string, string>,
  toroCache: Map<string, string>,
): Promise<void> {
  const eventosInsertables: Array<Record<string, unknown>> = [];

  for (const fila of chequeos) {
    if (fila.numero === null) continue;
    const animalId = numeroAId.get(fila.numero);
    if (!animalId) continue; // bloqueado por colisión, no resuelto -- no se generan eventos
    const chequeoVacaId = chequeoVacaIdPorClave.get(`${fila.archivo}::${fila.hoja}::${fila.fila}`);

    const sxResuelto = fila.raw.sx !== null ? parseSX(fila.raw.sx) : null;
    if (!sxResuelto || fila.chequeoFecha === null) continue;

    const { eventos } = descomponerSX({
      chequeoFecha: fila.chequeoFecha,
      sx: sxResuelto,
      fechasServicio: fila.fechasServicio,
      toroNombre: fila.toroNombre ?? undefined,
      tipoServicio: fila.tipoServicio ?? undefined,
      // `huboPartoConfirmado` deliberadamente undefined -- este runner no
      // tiene forma de saberlo; `descomponerSX` ya deja un issue explícito
      // para ese caso (ver calculosHato.ts), consistente con la regla de
      // nunca resolver una ambigüedad en silencio.
    });

    for (const evento of eventos as EventoDerivado[]) {
      let toroId: string | null = null;
      if (evento.toro_nombre) {
        const clave = evento.toro_nombre.trim().toLowerCase();
        toroId = toroCache.get(clave) ?? null; // solo reusa un toro YA sembrado -- nunca crea uno nuevo aquí
      }
      eventosInsertables.push({
        animal_id: animalId,
        tipo: evento.tipo,
        fecha: evento.fecha,
        fecha_confianza: evento.fecha_confianza,
        tipo_servicio: evento.tipo_servicio ?? null,
        toro_id: toroId,
        cria_destino: evento.cria_destino ?? null,
        sx_raw: evento.sx_raw ?? null,
        chequeo_vaca_id: chequeoVacaId ?? null,
        fuente: 'importacion',
        datos: evento.datos ?? null,
      });
    }
  }

  const CHUNK = 200;
  for (let i = 0; i < eventosInsertables.length; i += CHUNK) {
    const { error } = await supabase.from('hato_eventos').insert(eventosInsertables.slice(i, i + CHUNK));
    if (error) throw error;
  }
  console.log(`hato_eventos: ${eventosInsertables.length} eventos cargados.`);
}

// ============================================================================
// Orquestador
// ============================================================================

async function main(): Promise<void> {
  const rutaCsv = process.argv[2] ?? resolvePath(OUT_DIR, 'animales.csv');
  const rutaJson = process.argv[3] ?? resolvePath(OUT_DIR, 'normalizado.json');

  const filasCsv = leerAnimalesCsv(rutaCsv);
  verificarSinBloqueos(filasCsv);

  const entrada = JSON.parse(readFileSync(rutaJson, 'utf-8')) as SalidaNormalizado;

  const supabase = crearClienteServiceRole();

  await limpiarCorridaAnterior(supabase);

  // Catálogo de toros: solo se siembran nombres que YA pasaron el filtro de
  // "no sospechoso" en el reporte -- este script NO decide solo, lee la
  // lista ya sembrada/confirmada en `hato_toros` más lo que traiga
  // `toroNombre` normalizado en cada fila (nunca el crudo íntegro sin filtrar).
  const toroCache = new Map<string, string>();
  const nombresToro = new Set(
    entrada.chequeos.map((f) => f.toroNombre?.trim()).filter((n): n is string => !!n && n.length > 0),
  );
  for (const nombre of nombresToro) {
    await obtenerOCrearToro(supabase, nombre, toroCache);
  }
  console.log(`hato_toros: ${toroCache.size} toros sembrados/reutilizados.`);

  const numeroAId = await cargarAnimales(supabase, filasCsv.filter((f) => f.bloqueado_por_colision !== 'true'));
  const chequeoVacaIdPorClave = await cargarChequeos(supabase, entrada.chequeos, numeroAId);
  await cargarEventos(supabase, entrada.chequeos, numeroAId, chequeoVacaIdPorClave, toroCache);

  console.log('--- Load: completo ---');
  console.log('Corre scripts/import-hato/verify.ts a continuación.');
}

main().catch((err) => {
  console.error('Load abortado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
