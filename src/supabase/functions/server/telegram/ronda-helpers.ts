// telegram/ronda-helpers.ts — Fase 3 (Telegram, Uriel) de
// docs/brief_tecnico_verificacion_inventario.md §13. I/O puro sobre las
// tablas `rondas_*`/`inventario_causas_raiz` (migración 125) y wiring de
// los RPC de la migración 126 -- lo que `bot.ts` y la conversación
// `cierreRonda.ts` necesitan para no repetir la misma consulta/el mismo
// mapeo dos veces.
//
// Ningún tipo acá viene de `src/types/database.ts` (generado): las tablas
// `rondas_*` son nuevas y ese archivo no las incluye (mismo hueco
// documentado en el `CLAUDE.md` raíz para `hato_*`/`gan_*`). Los campos de
// `RondaInventarioRow`/`AlcanceRondaRow`/`TranscritoRondaRow` reflejan
// LITERAL el esquema de `src/sql/migrations/125_ronda_inventario_esquema.sql`
// y el tipo espejo del lado web, `src/types/rondaInventario.ts` (Fase 6) --
// verificados campo a campo contra ese archivo para que los dos lados no
// diverjan por accidente.
//
// Este archivo NUNCA escribe `productos.cantidad_actual` ni
// `movimientos_inventario` directo -- eso sólo pasa por los RPC de la
// migración 126 (D-T4/D-T5), que `bot.ts`/`cierreRonda.ts` llaman con
// `.rpc(nombre, { payload })`. Lo que SÍ escribe acá directo (vía
// `service_role`, que bypassa RLS) es `rondas_transcritos`: no existe
// ningún RPC de "crear/actualizar transcrito" en el §6 del brief técnico —
// es la capa cruda del pipeline de voz (CA-36) y su ciclo de vida
// (`preview_pendiente` ⇄ `confirmado`/`sin_confirmar`/`descartado`) lo
// gobierna directamente el handler de Telegram, con las mismas guardas de
// actor de `fn_ronda_validar_actor` aplicadas AQUÍ a mano para las escrituras
// que no pasan por un RPC (siempre `actor_telegram_id = ctx.telegramUser.id`,
// nunca inferido de otra cosa).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { FilaPreview } from '../rondaInventario/preview.ts';
import { formatearCantidad } from '../rondaInventario/preview.ts';
import type { AlcanceItem, HallazgoParaConfirmar } from '../rondaInventario/resolverHallazgos.ts';

// ---------------------------------------------------------------------------
// "Hoy" en Bogotá — mismo criterio que `hoyBogota()` de `pesajeLeche.ts:82-86`
// (Bogotá es UTC-5 sin horario de verano; no se usa `Intl` con timezone para
// no depender de que el runtime de Deno traiga la tzdata completa).
// ---------------------------------------------------------------------------

/** Primer día del mes actual EN BOGOTÁ, 'AAAA-MM-01' — lo que
 * `fn_ronda_abrir` espera como `periodo` (§4.1 del brief técnico: "una ronda
 * = un mes"). */
export function primerDiaMesBogota(): string {
  const ahora = new Date();
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  const anio = bogota.getUTCFullYear();
  const mes = String(bogota.getUTCMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}-01`;
}

// ---------------------------------------------------------------------------
// Tipos — espejo de la migración 125, verificados contra
// `src/types/rondaInventario.ts` (Fase 6).
// ---------------------------------------------------------------------------

export type EstadoRondaInventario = 'programada' | 'en_curso' | 'cerrada' | 'omitida';

export type EstadoExcepcionInventario =
  | 'reportada'
  | 'explicacion_precargada'
  | 'explicada'
  | 'cerrada_sin_ajuste'
  | 'resuelta_con_captura'
  | 'ajuste_propuesto'
  | 'ajuste_aprobado'
  | 'ajuste_desestimado'
  | 'ajuste_aplicado';

/** Los tres desenlaces terminales (CA-10) — NUNCA se funden entre sí ni con
 * los estados intermedios. Usado para clasificar el resumen de `/ronda`. */
const ESTADOS_TERMINALES: readonly EstadoExcepcionInventario[] = [
  'cerrada_sin_ajuste',
  'resuelta_con_captura',
  'ajuste_desestimado',
  'ajuste_aplicado',
];

export interface RondaInventarioRow {
  id: string;
  periodo: string;
  estado: EstadoRondaInventario;
  es_linea_base: boolean;
  abierta_en: string | null;
  alcance_declarado: 'completo' | 'parcial' | null;
  alcance_nota: string | null;
}

export interface AlcanceRondaRow {
  producto_id: string;
  cantidad_teorica: number;
  unidad: string;
  nombre_producto: string;
}

/** Lo que se guarda en `rondas_transcritos.preview` (JSONB) — la estructura
 * completa que el handler necesita para (a) re-renderizar el preview sin
 * volver a llamar al modelo y (b) construir el payload de
 * `fn_ronda_confirmar_hallazgos` cuando Uriel toca [Confirmar]. Un preview
 * confirmable exige `paraConfirmar[i] !== null` para TODAS las filas —
 * `previewConfirmable()` (preview.ts) es la fuente de verdad de esa regla;
 * acá sólo se persiste lo que esa función ya evaluó. */
export interface PreviewGuardado {
  filas: FilaPreview[];
  paraConfirmar: Array<HallazgoParaConfirmar | null>;
  observacionesLibres: string[];
  avisos: string[];
}

export interface TranscritoRondaRow {
  id: string;
  ronda_id: string;
  transcrito: string;
  correcciones: Array<{ texto: string; en: string }>;
  preview: PreviewGuardado | null;
  intentos_preview: number;
  estado: 'preview_pendiente' | 'confirmado' | 'sin_confirmar' | 'descartado';
  actor_telegram_id: string | null;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** La ÚNICA ronda `en_curso` del sistema, si existe — el índice único
 * parcial `rondas_inventario_una_en_curso` (125) garantiza que nunca hay más
 * de una, así que no hace falta filtrar por quién la abrió (§7.2 del brief
 * técnico lo deja explícito: "o la única ronda en curso del sistema"). */
export async function obtenerRondaEnCurso(supabase: SupabaseClient): Promise<RondaInventarioRow | null> {
  const { data, error } = await supabase
    .from('rondas_inventario')
    .select('id, periodo, estado, es_linea_base, abierta_en, alcance_declarado, alcance_nota')
    .eq('estado', 'en_curso')
    .maybeSingle();
  if (error) {
    console.error('[ronda] obtenerRondaEnCurso error:', error.message);
    return null;
  }
  return (data as RondaInventarioRow | null) ?? null;
}

/** El alcance congelado completo de una ronda (R-5), ordenado por nombre —
 * lo que alimenta tanto el `.txt` de apertura como la resolución de
 * producto de cada hallazgo. */
export async function obtenerAlcanceRonda(supabase: SupabaseClient, rondaId: string): Promise<AlcanceRondaRow[]> {
  const { data, error } = await supabase
    .from('rondas_inventario_alcance')
    .select('producto_id, cantidad_teorica, unidad, nombre_producto')
    .eq('ronda_id', rondaId)
    .order('nombre_producto', { ascending: true });
  if (error) {
    console.error('[ronda] obtenerAlcanceRonda error:', error.message);
    return [];
  }
  return (data ?? []) as AlcanceRondaRow[];
}

/** A-2/R-15: cantidad y unidad, NUNCA precio. Hasta `limite` coincidencias
 * por nombre, contra el alcance CONGELADO de la ronda (no contra todo el
 * catálogo — Uriel sólo debe ver lo que puede contar hoy). */
export async function buscarExistenciasRonda(
  supabase: SupabaseClient,
  rondaId: string,
  texto: string,
  limite = 10,
): Promise<AlcanceRondaRow[]> {
  const termino = texto.trim();
  if (termino === '') return [];
  const { data, error } = await supabase
    .from('rondas_inventario_alcance')
    .select('producto_id, cantidad_teorica, unidad, nombre_producto')
    .eq('ronda_id', rondaId)
    .ilike('nombre_producto', `%${termino}%`)
    .order('nombre_producto', { ascending: true })
    .limit(limite);
  if (error) {
    console.error('[ronda] buscarExistenciasRonda error:', error.message);
    return [];
  }
  return (data ?? []) as AlcanceRondaRow[];
}

export interface ResumenExcepcionesRonda {
  total: number;
  pendientes: number;
  transcritosSinConfirmar: number;
}

/** Para el estado que `/ronda` le muestra a Uriel: cuántas excepciones lleva
 * la ronda y cuántas siguen su curso (CA-5: la ronda no espera a que se
 * resuelvan) + cuántos hallazgos narrados quedaron sin confirmar
 * (`preview_pendiente`, todavía en juego — `sin_confirmar` ya es un
 * desenlace, CA-37, y no cuenta acá como "pendiente de Uriel"). */
export async function obtenerResumenExcepcionesRonda(
  supabase: SupabaseClient,
  rondaId: string,
): Promise<ResumenExcepcionesRonda> {
  const [{ data: excepciones, error: errorExcepciones }, { count: preview, error: errorPreview }] = await Promise.all([
    supabase.from('rondas_excepciones').select('estado').eq('ronda_id', rondaId),
    supabase
      .from('rondas_transcritos')
      .select('id', { count: 'exact', head: true })
      .eq('ronda_id', rondaId)
      .eq('estado', 'preview_pendiente'),
  ]);
  if (errorExcepciones) console.error('[ronda] obtenerResumenExcepcionesRonda (excepciones) error:', errorExcepciones.message);
  if (errorPreview) console.error('[ronda] obtenerResumenExcepcionesRonda (preview) error:', errorPreview.message);

  const filas = (excepciones ?? []) as Array<{ estado: EstadoExcepcionInventario }>;
  const pendientes = filas.filter((f) => !ESTADOS_TERMINALES.includes(f.estado)).length;

  return { total: filas.length, pendientes, transcritosSinConfirmar: preview ?? 0 };
}

/** El transcrito `preview_pendiente` MÁS RECIENTE de este actor de Telegram
 * — es contra el que se aplica una corrección de texto libre o un
 * Confirmar/Descartar sin id explícito en el mensaje. Simplificación
 * deliberada y documentada (no en el brief): si Uriel manda dos notas de voz
 * seguidas antes de resolver la primera, ambas quedan `preview_pendiente`
 * pero una corrección por TEXTO sólo puede referirse a una — se asume que es
 * la más reciente, que es la que Uriel tiene fresca en la cabeza. Los
 * botones [Confirmar]/[Descartar]/[Deshacer] de CADA mensaje siguen
 * llevando su propio `transcrito_id` en el `callback_data` y no dependen de
 * esta función. */
export async function obtenerTranscritoPendienteMasReciente(
  supabase: SupabaseClient,
  telegramUsuarioId: string,
): Promise<TranscritoRondaRow | null> {
  const { data, error } = await supabase
    .from('rondas_transcritos')
    .select('id, ronda_id, transcrito, correcciones, preview, intentos_preview, estado, actor_telegram_id')
    .eq('actor_telegram_id', telegramUsuarioId)
    .eq('estado', 'preview_pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[ronda] obtenerTranscritoPendienteMasReciente error:', error.message);
    return null;
  }
  return (data as TranscritoRondaRow | null) ?? null;
}

export async function obtenerTranscritoPorId(supabase: SupabaseClient, transcritoId: string): Promise<TranscritoRondaRow | null> {
  const { data, error } = await supabase
    .from('rondas_transcritos')
    .select('id, ronda_id, transcrito, correcciones, preview, intentos_preview, estado, actor_telegram_id')
    .eq('id', transcritoId)
    .maybeSingle();
  if (error) {
    console.error('[ronda] obtenerTranscritoPorId error:', error.message);
    return null;
  }
  return (data as TranscritoRondaRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Mapeos / formato
// ---------------------------------------------------------------------------

/** `AlcanceRondaRow` (columnas snake_case de la tabla) -> `AlcanceItem`
 * (camelCase, lo que `resolverHallazgos.ts` espera). */
export function alcanceComoItems(alcance: readonly AlcanceRondaRow[]): AlcanceItem[] {
  return alcance.map((a) => ({
    productoId: a.producto_id,
    nombre: a.nombre_producto,
    cantidadTeorica: a.cantidad_teorica,
    unidad: a.unidad,
  }));
}

/** R-15/CA-13: cantidad + unidad, nunca precio — literal para la respuesta
 * de `/existencias`. */
export function renderExistenciaLinea(item: AlcanceRondaRow): string {
  return `${item.nombre_producto}: ${formatearCantidad(item.cantidad_teorica)} ${item.unidad}`;
}

/** El actor de todo RPC de este flujo (D-T4): SIEMPRE explícito en el
 * payload, nunca derivado. Para el bot, `actor_usuario_id` es SIEMPRE null —
 * quien llama es un usuario de Telegram, no una sesión de navegador. */
export function payloadActorTelegram(telegramUsuarioId: string): {
  actor_usuario_id: null;
  actor_telegram_usuario_id: string;
} {
  return { actor_usuario_id: null, actor_telegram_usuario_id: telegramUsuarioId };
}

/** Mensaje legible a partir del error que devuelve un `.rpc(...)` de este
 * módulo. Los RPC de la migración 126 ya escriben sus `RAISE EXCEPTION` en
 * español, pensados para leerse tal cual (no son mensajes de depuración) —
 * este helper sólo evita repetir el `?? 'error desconocido'` en cada call
 * site. */
export function mensajeErrorRpc(error: { message?: string } | null | undefined): string {
  return error?.message?.trim() || 'error desconocido al llamar al sistema';
}
