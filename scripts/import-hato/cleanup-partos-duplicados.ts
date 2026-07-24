// ARCHIVO: scripts/import-hato/cleanup-partos-duplicados.ts
// DESCRIPCIÓN: Limpieza ÚNICA de los eventos `parto` duplicados que generó
// el bug de `descomponerSX` corregido en `src/utils/calculosHato.ts`
// (`decidirEventoParto`): antes de la corrección, un SX que describía un
// parto (OV/AV/A{n}/A+/O+ confirmado como parto/gemelar) generaba un evento
// `hato_eventos` NUEVO en CADA chequeo donde ese código seguía apareciendo,
// aunque `ultima_cria_raw` siguiera congelada en la misma fecha -- es decir,
// aunque fuera el MISMO nacimiento ya registrado. Caso real verificado:
// ALINA (numero 157), `ultima_cria_raw` = "28/1/2024" en TRES chequeos
// consecutivos (2024-03-18, 2024-05-20, 2024-08-09) -> tres eventos `parto`
// en la base para un solo nacimiento real.
//
// >>> ESCRITO PERO NUNCA EJECUTADO CON --apply EN ESTA SESIÓN (instrucción
// explícita). El modo SIN --apply (dry-run) es de solo lectura -- no
// escribe nada aunque sí se ejecute. <<<
//
// ---------------------------------------------------------------------------
// Cómo re-deriva el conjunto CORRECTO de eventos `parto`
// ---------------------------------------------------------------------------
// Reusa el MISMO motor que Load y el commit path (`descomponerSX` +
// `parseUltimaCria`, ya corregidos en `calculosHato.ts`) -- nunca un segundo
// decompositor. Para cada animal, recorre sus filas de `hato_chequeo_vacas`
// en orden CRONOLÓGICO (por la fecha de `hato_chequeos` a la que pertenece
// cada fila) llevando el mismo `Map` de "última cría conocida hasta ahora"
// que `cargarEventos` (load.ts) y `derivarEventosDeChequeo`
// (commitChequeo.ts), y para cada fila decide si un evento `parto` DEBERÍA
// existir, y con qué `fecha`/`fecha_confianza`.
//
// El link `hato_eventos.chequeo_vaca_id` (migración 053) es EXACTO: el Load
// original (y el commit path) siempre insertan como máximo un evento `parto`
// por fila de `hato_chequeo_vacas` con SX de parto, y siempre con ese
// `chequeo_vaca_id` -- así que la comparación "¿qué existe HOY en la base
// para esta fila de chequeo?" vs. "¿qué debería existir según el motor
// corregido?" se hace 1:1 por `chequeo_vaca_id`, sin ambigüedad.
//
// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------
// Reporte JSON (`scripts/import-hato/out/cleanup-partos-duplicados-report.json`,
// gitignored) + resumen por consola. Tres categorías, NUNCA una decisión
// automática de "cuál es el evento bueno" fuera de lo que el motor puede
// re-derivar con certeza:
//   - `duplicadosAEliminar`   -- eventos `parto` existentes que el motor
//     corregido dice que NO deberían existir (misma Última Cría que la fila
//     de chequeo anterior del mismo animal -- ya representados por el
//     evento superviviente de esa fila anterior).
//   - `correccionesEnSitio`   -- el evento SÍ debe existir, pero su
//     `fecha`/`fecha_confianza` actual (fecha del chequeo, 'aproximada' --
//     el bug de origen, ver CLAUDE.md) difiere de la fecha REAL derivada de
//     Última Cría ('exacta'). Se corrige UPDATE, nunca DELETE+INSERT: no
//     hay ninguna tabla que referencie `hato_eventos.id` por FK hoy
//     (verificado contra las migraciones 053/056/057/065), pero preservar
//     el `id` es de todas formas la operación menos destructiva.
//   - `sinVerificar`          -- la fila de chequeo tiene un evento `parto`
//     existente pero `ultima_cria_raw` no se pudo parsear (celda vacía o
//     rota) -- el motor corregido NO deduplica sin ese dato (mismo
//     contrato que `decidirEventoParto`), así que esta fila queda TAL CUAL
//     está, marcada para revisión humana en vez de decidir en silencio.
//
// ---------------------------------------------------------------------------
// USO
// ---------------------------------------------------------------------------
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs \
//       scripts/import-hato/cleanup-partos-duplicados.ts              # dry-run (default)
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs \
//       scripts/import-hato/cleanup-partos-duplicados.ts --apply      # escribe
//
// Requiere `SUPABASE_SERVICE_ROLE_KEY` (nunca la anon key -- mismo motivo
// que `load.ts`: RLS de escritura Administrador/Gerencia, y este script
// corre fuera de una sesión de usuario autenticado).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { descomponerSX, parseSX, parseUltimaCria } from '../../src/utils/calculosHato';

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
// Paginación -- `hato_chequeo_vacas` (1.479 filas) y `hato_eventos` superan
// el cap de 1.000 filas de PostgREST; nunca usar una sola `.select()` plana
// (mismo motivo documentado para `fetchAll` en el frontend, CLAUDE.md).
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

interface FilaChequeoVacaDb {
  id: string;
  animal_id: string;
  sx_raw: string | null;
  ultima_cria_raw: string | null;
  hato_chequeos: { fecha: string } | { fecha: string }[] | null;
}

interface FilaChequeoVaca {
  id: string;
  animalId: string;
  chequeoFecha: string;
  sxRaw: string | null;
  ultimaCriaRaw: string | null;
}

interface EventoPartoDb {
  id: string;
  animal_id: string;
  chequeo_vaca_id: string | null;
  fecha: string;
  fecha_confianza: string;
  cria_destino: string | null;
  datos: Record<string, unknown> | null;
  created_at: string;
}

function fechaDeChequeo(row: FilaChequeoVacaDb): string | null {
  const c = row.hato_chequeos;
  const fecha = Array.isArray(c) ? c[0]?.fecha : c?.fecha;
  return fecha ?? null;
}

// ============================================================================
// Re-derivación por animal, motor corregido -- mismo patrón que
// `cargarEventos` (load.ts) y `derivarEventosDeChequeo` (commitChequeo.ts).
// ============================================================================

interface DecisionFila {
  /** `undefined` si el motor corregido dice que esta fila NO debería tener
   * un evento `parto` propio (duplicado de una fila anterior). */
  parto?: { fecha: string; fecha_confianza: string };
  /** `true` si `ultima_cria_raw` de esta fila no se pudo parsear -- no hay
   * forma de verificar duplicación ni fecha real, la fila queda intacta. */
  sinVerificar: boolean;
}

function decisionesPorAnimal(filas: FilaChequeoVaca[]): Map<string, DecisionFila> {
  const ordenadas = [...filas].sort((a, b) => a.chequeoFecha.localeCompare(b.chequeoFecha));
  const decisiones = new Map<string, DecisionFila>();
  let ultimaCriaAnterior: string | null | undefined;

  for (const fila of ordenadas) {
    const ultimaCriaResuelta = parseUltimaCria(fila.ultimaCriaRaw).fecha;
    const sx = fila.sxRaw !== null ? parseSX(fila.sxRaw) : null;

    if (sx) {
      const { eventos } = descomponerSX({
        chequeoFecha: fila.chequeoFecha,
        sx,
        fechasServicio: [],
        ultimaCria: ultimaCriaResuelta,
        ultimaCriaAnterior,
      });
      const parto = eventos.find((e) => e.tipo === 'parto');
      decisiones.set(fila.id, {
        parto: parto ? { fecha: parto.fecha, fecha_confianza: parto.fecha_confianza } : undefined,
        sinVerificar: ultimaCriaResuelta === null,
      });
    } else {
      decisiones.set(fila.id, { parto: undefined, sinVerificar: ultimaCriaResuelta === null });
    }

    if (ultimaCriaResuelta !== null) ultimaCriaAnterior = ultimaCriaResuelta;
  }

  return decisiones;
}

// ============================================================================
// Comparación contra lo que existe HOY en `hato_eventos`
// ============================================================================

interface DuplicadoAEliminar {
  eventoId: string;
  animalId: string;
  chequeoVacaId: string;
  fecha: string;
  motivo: string;
}

interface CorreccionEnSitio {
  eventoId: string;
  animalId: string;
  chequeoVacaId: string;
  fechaAnterior: string;
  fechaNueva: string;
  confianzaAnterior: string;
  confianzaNueva: string;
}

interface FilaSinVerificar {
  eventoId: string;
  animalId: string;
  chequeoVacaId: string;
  motivo: string;
}

interface ReporteCleanup {
  generadoEn: string;
  totalChequeoVacas: number;
  totalEventosPartoActuales: number;
  eventosPartoSinChequeoVacaId: number;
  duplicadosAEliminar: DuplicadoAEliminar[];
  correccionesEnSitio: CorreccionEnSitio[];
  sinVerificar: FilaSinVerificar[];
  animalesAfectados: number;
  totalEventosPartoTrasLimpieza: number;
}

function construirReporte(
  filas: FilaChequeoVaca[],
  eventosParto: EventoPartoDb[],
): ReporteCleanup {
  const porAnimal = new Map<string, FilaChequeoVaca[]>();
  for (const fila of filas) {
    if (!porAnimal.has(fila.animalId)) porAnimal.set(fila.animalId, []);
    porAnimal.get(fila.animalId)!.push(fila);
  }

  const decisionesPorFila = new Map<string, DecisionFila>();
  for (const [, filasAnimal] of porAnimal) {
    for (const [filaId, decision] of decisionesPorAnimal(filasAnimal)) {
      decisionesPorFila.set(filaId, decision);
    }
  }

  const eventosPorChequeoVacaId = new Map<string, EventoPartoDb[]>();
  let sinChequeoVacaId = 0;
  for (const evento of eventosParto) {
    if (!evento.chequeo_vaca_id) {
      sinChequeoVacaId += 1;
      continue;
    }
    if (!eventosPorChequeoVacaId.has(evento.chequeo_vaca_id)) eventosPorChequeoVacaId.set(evento.chequeo_vaca_id, []);
    eventosPorChequeoVacaId.get(evento.chequeo_vaca_id)!.push(evento);
  }

  const duplicadosAEliminar: DuplicadoAEliminar[] = [];
  const correccionesEnSitio: CorreccionEnSitio[] = [];
  const sinVerificar: FilaSinVerificar[] = [];
  const animalesAfectados = new Set<string>();

  for (const [chequeoVacaId, eventosDeFila] of eventosPorChequeoVacaId) {
    const decision = decisionesPorFila.get(chequeoVacaId);
    if (!decision) continue; // fila de chequeo no encontrada (defensivo -- no debería ocurrir)

    // Superviviente determinístico si hace falta elegir entre varios: el más
    // antiguo por `created_at` (nunca al azar).
    const ordenados = [...eventosDeFila].sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (decision.sinVerificar) {
      for (const evento of ordenados) {
        sinVerificar.push({
          eventoId: evento.id,
          animalId: evento.animal_id,
          chequeoVacaId,
          motivo: "'Última Cría' de esta fila no se pudo interpretar -- no se puede verificar duplicación ni fecha real, se deja intacta para revisión manual",
        });
      }
      continue;
    }

    if (!decision.parto) {
      // El motor corregido dice que este chequeo NO debería tener un evento
      // `parto` propio (misma Última Cría que la fila anterior) -- todos los
      // eventos existentes de esta fila son duplicados.
      for (const evento of ordenados) {
        duplicadosAEliminar.push({
          eventoId: evento.id,
          animalId: evento.animal_id,
          chequeoVacaId,
          fecha: evento.fecha,
          motivo: 'Misma Última Cría que la fila de chequeo anterior del mismo animal -- nacimiento ya registrado en un evento previo.',
        });
        animalesAfectados.add(evento.animal_id);
      }
      continue;
    }

    // Debe existir exactamente UNO -- el primero (más antiguo) sobrevive con
    // fecha/confianza corregidas; cualquier extra (no debería ocurrir en
    // datos sanos) se marca como duplicado.
    const [superviviente, ...extra] = ordenados;
    if (superviviente.fecha !== decision.parto.fecha || superviviente.fecha_confianza !== decision.parto.fecha_confianza) {
      correccionesEnSitio.push({
        eventoId: superviviente.id,
        animalId: superviviente.animal_id,
        chequeoVacaId,
        fechaAnterior: superviviente.fecha,
        fechaNueva: decision.parto.fecha,
        confianzaAnterior: superviviente.fecha_confianza,
        confianzaNueva: decision.parto.fecha_confianza,
      });
      animalesAfectados.add(superviviente.animal_id);
    }
    for (const evento of extra) {
      duplicadosAEliminar.push({
        eventoId: evento.id,
        animalId: evento.animal_id,
        chequeoVacaId,
        fecha: evento.fecha,
        motivo: 'Más de un evento parto para la misma fila de chequeo (chequeo_vaca_id) -- no debería ocurrir en datos sanos, se conserva solo el más antiguo.',
      });
      animalesAfectados.add(evento.animal_id);
    }
  }

  return {
    generadoEn: new Date().toISOString(),
    totalChequeoVacas: filas.length,
    totalEventosPartoActuales: eventosParto.length,
    eventosPartoSinChequeoVacaId: sinChequeoVacaId,
    duplicadosAEliminar,
    correccionesEnSitio,
    sinVerificar,
    animalesAfectados: animalesAfectados.size,
    totalEventosPartoTrasLimpieza: eventosParto.length - duplicadosAEliminar.length,
  };
}

// ============================================================================
// Aplicación (gateada por --apply) -- UPDATE-en-sitio para correcciones,
// DELETE por id para duplicados. Nunca DELETE+INSERT: no hay ninguna FK
// hacia `hato_eventos.id` hoy (verificado contra 053/056/057/065), pero
// conservar el id es la operación menos destructiva de las dos posibles.
// ============================================================================

async function aplicarCambios(supabase: ReturnType<typeof createClient>, reporte: ReporteCleanup): Promise<void> {
  for (const c of reporte.correccionesEnSitio) {
    const { error } = await supabase
      .from('hato_eventos')
      .update({ fecha: c.fechaNueva, fecha_confianza: c.confianzaNueva })
      .eq('id', c.eventoId);
    if (error) throw new Error(`No se pudo corregir el evento ${c.eventoId}: ${error.message}`);
  }
  console.log(`Corregidos en sitio: ${reporte.correccionesEnSitio.length} evento(s).`);

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

  const filasDb = await seleccionarTodo<FilaChequeoVacaDb>(
    supabase,
    'hato_chequeo_vacas',
    'id, animal_id, sx_raw, ultima_cria_raw, hato_chequeos(fecha)',
  );
  const filas: FilaChequeoVaca[] = filasDb
    .map((f) => ({
      id: f.id,
      animalId: f.animal_id,
      chequeoFecha: fechaDeChequeo(f),
      sxRaw: f.sx_raw,
      ultimaCriaRaw: f.ultima_cria_raw,
    }))
    .filter((f): f is FilaChequeoVaca => f.chequeoFecha !== null);

  const eventosParto = await seleccionarTodo<EventoPartoDb>(
    supabase,
    'hato_eventos',
    'id, animal_id, chequeo_vaca_id, fecha, fecha_confianza, cria_destino, datos, created_at',
    (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq('tipo', 'parto'),
  );

  const reporte = construirReporte(filas, eventosParto);

  mkdirSync(OUT_DIR, { recursive: true });
  const rutaReporte = resolvePath(OUT_DIR, 'cleanup-partos-duplicados-report.json');
  writeFileSync(rutaReporte, JSON.stringify(reporte, null, 2), 'utf-8');

  console.log('--- Reporte de limpieza de partos duplicados ---');
  console.log(`hato_chequeo_vacas leídas:         ${reporte.totalChequeoVacas}`);
  console.log(`hato_eventos tipo=parto actuales:  ${reporte.totalEventosPartoActuales}`);
  console.log(`  (de los cuales sin chequeo_vaca_id, excluidos del análisis: ${reporte.eventosPartoSinChequeoVacaId})`);
  console.log(`Duplicados a eliminar:             ${reporte.duplicadosAEliminar.length}`);
  console.log(`Correcciones en sitio (fecha/confianza): ${reporte.correccionesEnSitio.length}`);
  console.log(`Filas sin verificar (Última Cría no parseable): ${reporte.sinVerificar.length}`);
  console.log(`Animales afectados:                ${reporte.animalesAfectados}`);
  console.log(`Eventos parto tras la limpieza:    ${reporte.totalEventosPartoTrasLimpieza}`);
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
  console.error('cleanup-partos-duplicados abortado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
