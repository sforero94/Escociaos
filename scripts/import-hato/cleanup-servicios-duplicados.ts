// ARCHIVO: scripts/import-hato/cleanup-servicios-duplicados.ts
// DESCRIPCIÓN: Limpieza ÚNICA de los eventos `servicio` duplicados que
// genera el bug de `descomponerSX` corregido en `src/utils/calculosHato.ts`
// (ver `InputDescomposicionSX.fechasServicioConocidas`): mientras el
// resultado de un servicio sigue sin confirmarse (preñez confirmada o
// re-servicio), la fuente re-copia la F Servicio VIGENTE, VERBATIM, en cada
// chequeo bimensual siguiente -- antes de la corrección, `descomponerSX`
// generaba un evento `hato_eventos` NUEVO en CADA chequeo donde esa fecha
// seguía apareciendo, aunque fuera el MISMO servicio real ya registrado.
//
// Caso real verificado en producción (SQL directo, proyecto
// ywhtjwawnkeqlwxbvgup, 2026-07-24): animal CAMILA (numero 154) con 4 filas
// DISTINTAS de `hato_chequeo_vacas` (4 visitas veterinarias distintas, cada
// una con su propio `chequeo_vaca_id`) que produjeron 4 eventos `servicio`
// fechados exactamente `2022-08-26`, con el mismo `toro_id` -- un solo
// servicio real, registrado cuatro veces. Barrido completo: 232 grupos de
// duplicados exactos (mismo animal_id/fecha/tipo_servicio/toro_id) sobre 617
// filas totales -- 385 filas son duplicados puros a eliminar (617 - 232
// supervivientes).
//
// Esto NO es el caso legítimo de V7 (varios intentos de servicio DISTINTOS
// -- servicio que no cuajó -> re-servicio -- en la MISMA celda de una sola
// fila de chequeo, que siguen siendo varios eventos propios): acá se trata
// de la MISMA fecha apareciendo en chequeos DIFERENTES (filas físicas
// distintas de `hato_chequeo_vacas`, visitas veterinarias distintas), que es
// exactamente la forma del bug ya corregido para `parto`/Última Cría (ver
// `cleanup-partos-duplicados.ts` y CLAUDE.md "Bugfix -- eventos parto
// duplicados").
//
// >>> ESCRITO PERO NUNCA EJECUTADO CON --apply EN ESTA SESIÓN (instrucción
// explícita). El modo SIN --apply (dry-run) es de solo lectura -- no
// escribe nada aunque sí se ejecute. <<<
//
// ---------------------------------------------------------------------------
// Cómo se agrupan los duplicados (regla dura: solo EXACTOS, nunca por fecha
// a secas)
// ---------------------------------------------------------------------------
// Se agrupan los eventos `hato_eventos` con `tipo = 'servicio'` por
// coincidencia EXACTA en la tupla `(animal_id, fecha, tipo_servicio,
// toro_id)`. Solo se colapsan grupos con MÁS DE UNA fila -- misma fecha,
// mismo tipo de servicio, mismo toro. Una fila con la MISMA fecha pero
// `toro_id` (o `tipo_servicio`) DISTINTO NUNCA se colapsa contra la primera
// -- eso es un conflicto informacional real (dos servicios distintos
// reportados el mismo día, o una corrección de toro entre chequeos), no un
// duplicado, y queda en el balde `conflictosToroDistinto` para revisión
// humana de Martha, nunca decidido en silencio -- misma filosofía que el
// balde `sinVerificar` de `cleanup-partos-duplicados.ts`.
//
// Para cada grupo de duplicados EXACTOS, se resuelve el orden cronológico de
// los chequeos involucrados vía `hato_eventos.chequeo_vaca_id` ->
// `hato_chequeo_vacas` -> `hato_chequeos.fecha` (el mismo link exacto que ya
// usa `cleanup-partos-duplicados.ts`), y sobrevive la fila del chequeo MÁS
// ANTIGUO -- es lo que el motor corregido produce hoy en adelante (la
// primera vez que aparece una F Servicio nueva, la emite; las siguientes
// veces que la fuente la re-copia, `fechasServicioConocidas` la filtra). Un
// evento sin `chequeo_vaca_id` resuelto (no debería ocurrir en datos sanos,
// pero se verifica) queda fuera del análisis -- no hay forma de ordenar
// cronológicamente sin ese link, así que no se decide nada sobre él.
//
// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------
// Reporte JSON (`scripts/import-hato/out/cleanup-servicios-duplicados-report.json`,
// gitignored) + resumen por consola + un `console.warn` por CADA fila que el
// modo `--apply` va a eliminar, con contexto completo (numero/nombre/fecha/
// chequeos involucrados) -- nunca una eliminación silenciosa. Dos
// categorías:
//   - `duplicadosAEliminar`      -- eventos `servicio` que son EXACTAMENTE
//     el mismo servicio (animal_id/fecha/tipo_servicio/toro_id) que otro
//     evento de un chequeo anterior del mismo animal. Se eliminan por `id`,
//     conservando el evento del chequeo MÁS ANTIGUO.
//   - `conflictosToroDistinto`   -- misma fecha, mismo animal, pero
//     `tipo_servicio`/`toro_id` DISTINTO entre los eventos -- NUNCA se
//     decide automáticamente, se deja completo para revisión humana.
//
// ---------------------------------------------------------------------------
// USO
// ---------------------------------------------------------------------------
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs \
//       scripts/import-hato/cleanup-servicios-duplicados.ts              # dry-run (default)
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs \
//       scripts/import-hato/cleanup-servicios-duplicados.ts --apply      # escribe
//
// Requiere `SUPABASE_SERVICE_ROLE_KEY` (nunca la anon key -- mismo motivo
// que `load.ts`/`cleanup-partos-duplicados.ts`: RLS de escritura
// Administrador/Gerencia, y este script corre fuera de una sesión de
// usuario autenticado).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(__dirname, 'out');

const APLICAR = process.argv.includes('--apply');

function crearClienteServiceRole() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno -- este script NUNCA debe correr con la anon key.',
    );
  }
  return createClient(url, key);
}

// ============================================================================
// Paginación -- `hato_eventos`/`hato_chequeo_vacas` pueden superar el cap de
// 1.000 filas de PostgREST; nunca usar una sola `.select()` plana (mismo
// motivo documentado para `fetchAll` en el frontend, CLAUDE.md, y ya usado
// por `cleanup-partos-duplicados.ts`).
// ============================================================================

async function seleccionarTodo<T>(
  supabase: ReturnType<typeof createClient>,
  tabla: string,
  columnas: string,
  filtro?: (q: ReturnType<ReturnType<typeof createClient>['from']>['select']) => unknown,
): Promise<T[]> {
  const PAGINA = 1000;
  const resultado: T[] = [];
  let desde = 0;
  for (;;) {
    let query = supabase.from(tabla).select(columnas).range(desde, desde + PAGINA - 1);
    if (filtro) query = filtro(query) as typeof query;
    const { data, error } = await query;
    if (error) throw new Error(`Error leyendo ${tabla}: ${error.message}`);
    resultado.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
    desde += PAGINA;
  }
  return resultado;
}

// ============================================================================
// Forma de las filas leídas
// ============================================================================

interface EventoServicioDb {
  id: string;
  animal_id: string;
  fecha: string;
  tipo_servicio: string | null;
  toro_id: string | null;
  chequeo_vaca_id: string | null;
  created_at: string;
}

interface ChequeoVacaDb {
  id: string;
  hato_chequeos: { fecha: string } | { fecha: string }[] | null;
}

interface AnimalDb {
  id: string;
  numero: number | null;
  nombre: string | null;
}

interface EventoServicio {
  id: string;
  animalId: string;
  fecha: string;
  tipoServicio: string | null;
  toroId: string | null;
  chequeoVacaId: string | null;
  /** Fecha del chequeo (`hato_chequeos.fecha`) al que pertenece la fila de
   * `hato_chequeo_vacas` que originó este evento, vía `chequeo_vaca_id`.
   * `null` si el evento no tiene `chequeo_vaca_id` resuelto -- no se puede
   * ordenar cronológicamente sin este dato, ver más abajo. */
  chequeoFecha: string | null;
  createdAt: string;
}

function fechaDeChequeoVaca(row: ChequeoVacaDb): string | null {
  const c = row.hato_chequeos;
  const fecha = Array.isArray(c) ? c[0]?.fecha : c?.fecha;
  return fecha ?? null;
}

// ============================================================================
// Agrupación y decisión -- solo EXACTOS (animal_id, fecha, tipo_servicio,
// toro_id) se colapsan; misma fecha con toro_id/tipo_servicio distinto NUNCA
// se colapsa, se reporta aparte para revisión humana.
// ============================================================================

/** Sentinel para valores NULL dentro de la clave de agrupación -- ninguna
 * fecha ISO ni ningún UUID contiene esta secuencia, así que no hay riesgo de
 * colisión con un valor real. */
const NULO = ' NULO ';

function claveExacta(e: Pick<EventoServicio, 'animalId' | 'fecha' | 'tipoServicio' | 'toroId'>): string {
  return `${e.animalId}::${e.fecha}::${e.tipoServicio ?? NULO}::${e.toroId ?? NULO}`;
}

function claveFecha(e: Pick<EventoServicio, 'animalId' | 'fecha'>): string {
  return `${e.animalId}::${e.fecha}`;
}

interface DuplicadoAEliminar {
  eventoId: string;
  animalId: string;
  numero: number | null;
  nombre: string | null;
  fecha: string;
  tipoServicio: string | null;
  toroId: string | null;
  chequeoVacaId: string;
  chequeoFecha: string;
  /** El evento que sobrevive para este mismo servicio real -- del chequeo
   * MÁS ANTIGUO del grupo. */
  sobrevivienteEventoId: string;
  sobrevivienteChequeoFecha: string;
  motivo: string;
}

interface ConflictoToroDistinto {
  animalId: string;
  numero: number | null;
  nombre: string | null;
  fecha: string;
  eventos: Array<{ eventoId: string; tipoServicio: string | null; toroId: string | null; chequeoFecha: string | null }>;
  motivo: string;
}

interface ReporteCleanupServicios {
  generadoEn: string;
  totalEventosServicioActuales: number;
  eventosServicioSinChequeoVacaId: number;
  gruposDuplicadosExactos: number;
  totalFilasEnGruposDuplicados: number;
  duplicadosAEliminar: DuplicadoAEliminar[];
  conflictosToroDistinto: ConflictoToroDistinto[];
  animalesAfectados: number;
  totalEventosServicioTrasLimpieza: number;
}

function construirReporte(eventos: EventoServicio[], animales: Map<string, AnimalDb>): ReporteCleanupServicios {
  const conChequeoResuelto = eventos.filter((e): e is EventoServicio & { chequeoFecha: string; chequeoVacaId: string } =>
    e.chequeoFecha !== null && e.chequeoVacaId !== null,
  );
  const sinChequeoVacaId = eventos.length - conChequeoResuelto.length;

  // --- Duplicados exactos -----------------------------------------------
  const gruposExactos = new Map<string, typeof conChequeoResuelto>();
  for (const evento of conChequeoResuelto) {
    const k = claveExacta(evento);
    if (!gruposExactos.has(k)) gruposExactos.set(k, []);
    gruposExactos.get(k)!.push(evento);
  }

  const duplicadosAEliminar: DuplicadoAEliminar[] = [];
  const animalesAfectados = new Set<string>();
  let gruposDuplicadosExactos = 0;
  let totalFilasEnGruposDuplicados = 0;

  for (const grupo of gruposExactos.values()) {
    if (grupo.length < 2) continue;
    gruposDuplicadosExactos += 1;
    totalFilasEnGruposDuplicados += grupo.length;

    // Orden cronológico por la fecha del chequeo que originó cada evento;
    // desempate determinístico por `created_at` (nunca al azar) si dos
    // eventos resolvieran a la MISMA fecha de chequeo.
    const ordenado = [...grupo].sort(
      (a, b) => a.chequeoFecha.localeCompare(b.chequeoFecha) || a.createdAt.localeCompare(b.createdAt),
    );
    const [superviviente, ...duplicados] = ordenado;

    for (const dup of duplicados) {
      const animal = animales.get(dup.animalId);
      duplicadosAEliminar.push({
        eventoId: dup.id,
        animalId: dup.animalId,
        numero: animal?.numero ?? null,
        nombre: animal?.nombre ?? null,
        fecha: dup.fecha,
        tipoServicio: dup.tipoServicio,
        toroId: dup.toroId,
        chequeoVacaId: dup.chequeoVacaId,
        chequeoFecha: dup.chequeoFecha,
        sobrevivienteEventoId: superviviente.id,
        sobrevivienteChequeoFecha: superviviente.chequeoFecha,
        motivo:
          `Mismo servicio (fecha=${dup.fecha}` +
          (dup.tipoServicio ? `, tipo_servicio=${dup.tipoServicio}` : '') +
          (dup.toroId ? `, toro_id=${dup.toroId}` : '') +
          `) ya registrado por el chequeo ${superviviente.chequeoFecha} -- la F Servicio se re-copió sin cambios en el chequeo ${dup.chequeoFecha}, sin que el resultado se hubiera confirmado todavía.`,
      });
      animalesAfectados.add(dup.animalId);

      console.warn(
        `[hato] Duplicado de servicio a eliminar -- animal ${animal?.numero ?? '(numero desconocido)'} ` +
          `${animal?.nombre ?? '(nombre desconocido)'} (animal_id=${dup.animalId}): evento ${dup.id} ` +
          `(fecha=${dup.fecha}, chequeo=${dup.chequeoFecha}, chequeo_vaca_id=${dup.chequeoVacaId}) ` +
          `duplica el evento ${superviviente.id} (chequeo=${superviviente.chequeoFecha}) -- se conserva el más antiguo.`,
      );
    }
  }

  // --- Conflictos: misma fecha, mismo animal, DISTINTO toro_id/tipo_servicio
  //     -- nunca se colapsan, se reportan completos para revisión humana.
  const porFecha = new Map<string, typeof conChequeoResuelto>();
  for (const evento of conChequeoResuelto) {
    const k = claveFecha(evento);
    if (!porFecha.has(k)) porFecha.set(k, []);
    porFecha.get(k)!.push(evento);
  }

  const conflictosToroDistinto: ConflictoToroDistinto[] = [];
  for (const eventosFecha of porFecha.values()) {
    const variantes = new Set(eventosFecha.map((e) => `${e.tipoServicio ?? NULO}::${e.toroId ?? NULO}`));
    if (variantes.size < 2) continue; // todos coinciden en tipo_servicio+toro_id -- ya cubierto arriba, no es un conflicto

    const [ejemplo] = eventosFecha;
    const animal = animales.get(ejemplo.animalId);
    conflictosToroDistinto.push({
      animalId: ejemplo.animalId,
      numero: animal?.numero ?? null,
      nombre: animal?.nombre ?? null,
      fecha: ejemplo.fecha,
      eventos: eventosFecha.map((e) => ({
        eventoId: e.id,
        tipoServicio: e.tipoServicio,
        toroId: e.toroId,
        chequeoFecha: e.chequeoFecha,
      })),
      motivo:
        `Misma fecha de servicio (${ejemplo.fecha}) registrada con tipo_servicio/toro_id DISTINTO entre chequeos -- ` +
        'conflicto informacional real (posible corrección de toro, o dos servicios reportados el mismo día), NO un duplicado; requiere revisión humana antes de decidir cuál dato es correcto. No se tocó nada de este grupo.',
    });

    console.warn(
      `[hato] Conflicto SIN resolver -- animal ${animal?.numero ?? '(numero desconocido)'} ` +
        `${animal?.nombre ?? '(nombre desconocido)'} (animal_id=${ejemplo.animalId}): ${eventosFecha.length} ` +
        `eventos servicio en la fecha ${ejemplo.fecha} con tipo_servicio/toro_id distintos -- revisar a mano, no se eliminó nada.`,
    );
  }

  return {
    generadoEn: new Date().toISOString(),
    totalEventosServicioActuales: eventos.length,
    eventosServicioSinChequeoVacaId: sinChequeoVacaId,
    gruposDuplicadosExactos,
    totalFilasEnGruposDuplicados,
    duplicadosAEliminar,
    conflictosToroDistinto,
    animalesAfectados: animalesAfectados.size,
    totalEventosServicioTrasLimpieza: eventos.length - duplicadosAEliminar.length,
  };
}

// ============================================================================
// Aplicación (gateada por --apply) -- DELETE por id. Nunca UPDATE: a
// diferencia de `cleanup-partos-duplicados.ts` (que corrige fecha/confianza
// del superviviente), acá los duplicados EXACTOS comparten fecha/tipo/toro
// con el superviviente por definición -- no hay ningún campo que corregir.
// ============================================================================

async function aplicarCambios(supabase: ReturnType<typeof createClient>, reporte: ReporteCleanupServicios): Promise<void> {
  const CHUNK = 200;
  const idsAEliminar = reporte.duplicadosAEliminar.map((d) => d.eventoId);
  for (let i = 0; i < idsAEliminar.length; i += CHUNK) {
    const lote = idsAEliminar.slice(i, i + CHUNK);
    const { error } = await supabase.from('hato_eventos').delete().in('id', lote);
    if (error) throw new Error(`No se pudieron eliminar duplicados: ${error.message}`);
  }
  console.log(`Eliminados: ${idsAEliminar.length} evento(s) duplicado(s).`);
}

// ============================================================================
// Orquestador
// ============================================================================

async function main(): Promise<void> {
  const supabase = crearClienteServiceRole();

  const eventosDb = await seleccionarTodo<EventoServicioDb>(
    supabase,
    'hato_eventos',
    'id, animal_id, fecha, tipo_servicio, toro_id, chequeo_vaca_id, created_at',
    (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq('tipo', 'servicio'),
  );

  const chequeoVacaIds = [...new Set(eventosDb.map((e) => e.chequeo_vaca_id).filter((id): id is string => id !== null))];
  const chequeoFechaPorId = new Map<string, string>();
  const CHUNK_IN = 200;
  for (let i = 0; i < chequeoVacaIds.length; i += CHUNK_IN) {
    const lote = chequeoVacaIds.slice(i, i + CHUNK_IN);
    const { data, error } = await supabase
      .from('hato_chequeo_vacas')
      .select('id, hato_chequeos(fecha)')
      .in('id', lote);
    if (error) throw new Error(`Error leyendo hato_chequeo_vacas: ${error.message}`);
    for (const row of (data ?? []) as ChequeoVacaDb[]) {
      const fecha = fechaDeChequeoVaca(row);
      if (fecha) chequeoFechaPorId.set(row.id, fecha);
    }
  }

  const animalIds = [...new Set(eventosDb.map((e) => e.animal_id))];
  const animales = new Map<string, AnimalDb>();
  for (let i = 0; i < animalIds.length; i += CHUNK_IN) {
    const lote = animalIds.slice(i, i + CHUNK_IN);
    const { data, error } = await supabase.from('hato_animales').select('id, numero, nombre').in('id', lote);
    if (error) throw new Error(`Error leyendo hato_animales: ${error.message}`);
    for (const row of (data ?? []) as AnimalDb[]) animales.set(row.id, row);
  }

  const eventos: EventoServicio[] = eventosDb.map((e) => ({
    id: e.id,
    animalId: e.animal_id,
    fecha: e.fecha,
    tipoServicio: e.tipo_servicio,
    toroId: e.toro_id,
    chequeoVacaId: e.chequeo_vaca_id,
    chequeoFecha: e.chequeo_vaca_id ? chequeoFechaPorId.get(e.chequeo_vaca_id) ?? null : null,
    createdAt: e.created_at,
  }));

  const reporte = construirReporte(eventos, animales);

  mkdirSync(OUT_DIR, { recursive: true });
  const rutaReporte = resolvePath(OUT_DIR, 'cleanup-servicios-duplicados-report.json');
  writeFileSync(rutaReporte, JSON.stringify(reporte, null, 2), 'utf-8');

  console.log('--- Reporte de limpieza de servicios duplicados ---');
  console.log(`hato_eventos tipo=servicio actuales:        ${reporte.totalEventosServicioActuales}`);
  console.log(`  (de los cuales sin chequeo_vaca_id resuelto, excluidos del análisis: ${reporte.eventosServicioSinChequeoVacaId})`);
  console.log(`Grupos de duplicados EXACTOS encontrados:   ${reporte.gruposDuplicadosExactos}`);
  console.log(`  (filas totales dentro de esos grupos:     ${reporte.totalFilasEnGruposDuplicados})`);
  console.log(`Duplicados a eliminar:                      ${reporte.duplicadosAEliminar.length}`);
  console.log(`Conflictos SIN resolver (toro_id distinto): ${reporte.conflictosToroDistinto.length}`);
  console.log(`Animales afectados (con algún duplicado):   ${reporte.animalesAfectados}`);
  console.log(`Eventos servicio tras la limpieza:          ${reporte.totalEventosServicioTrasLimpieza}`);
  console.log(`Reporte completo: ${rutaReporte}`);

  if (!APLICAR) {
    console.log('\nDRY-RUN -- no se escribió nada. Corré de nuevo con --apply para aplicar los cambios de arriba.');
    return;
  }

  console.log('\n--apply presente -- aplicando cambios...');
  await aplicarCambios(supabase, reporte);
  console.log('--- Limpieza: completa ---');
}

main().catch((err) => {
  console.error('cleanup-servicios-duplicados abortado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
