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
import type { AlcanceItem, HallazgoParaConfirmar, ProductoFueraDeAlcance } from '../rondaInventario/resolverHallazgos.ts';
import type { CasoExcepcion, CasoProponer, CasoSantiago } from '../rondaInventario/resolucion.ts';
import { buscarCausaRaiz } from '../rondaInventario/causasRaiz.ts';

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

/** "Hoy" en Bogotá, 'AAAA-MM-DD' -- MISMO criterio que `primerDiaMesBogota()`
 * de arriba y que `hoyBogota()` de `pesajeLeche.ts`/`eventoHato.ts`: nunca
 * `new Date().toISOString().slice(0, 10)` a secas (la trampa "hoy" del
 * CLAUDE.md raíz -- de 19:00 a medianoche en Bogotá esa expresión ya da
 * mañana). Fase 4 (§13 de la tarea de esta sesión) la necesita para
 * `fecha_movimiento` cuando Santiago aplica un ajuste aprobado el mismo día
 * (`fn_ronda_aplicar_ajuste`, migración 126) -- ese RPC exige la fecha, nunca
 * la infiere. */
export function hoyBogota(): string {
  const ahora = new Date();
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

/** MISMA conversión que `hoyBogota()`, pero para un instante ARBITRARIO
 * (no "ahora") -- Fase 5 (§8/§13 de la tarea de esta sesión) la necesita
 * para convertir `rondas_inventario.abierta_en`/`cerrada_en` (TIMESTAMPTZ)
 * a la fecha de calendario Bogotá que usa el resto del módulo (R-13: nunca
 * UTC). `iso` puede venir con cualquier offset -- `new Date(iso)` ya lo
 * normaliza a UTC antes de restar las 5 horas de Bogotá. */
export function fechaBogotaDe(iso: string): string {
  const instante = new Date(iso);
  const bogota = new Date(instante.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}

/** Nombre de un período en español ("septiembre 2026") a partir de su
 * `periodo` 'AAAA-MM-01' -- un solo dueño para que `bot.ts` (mensajes de
 * `/ronda`, `cierreRonda.ts`) y el tick (`ronda-inventario-tick.ts`, Fase 5)
 * nunca lo formateen de dos formas distintas. Vivía como función local
 * dentro de `bot.ts` hasta que el tick también lo necesitó. */
const MESES_RONDA = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function nombrePeriodoRonda(periodoIso: string): string {
  const [anio, mes] = periodoIso.split('-');
  return `${MESES_RONDA[Number(mes) - 1] ?? mes} ${anio}`;
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
 * los estados intermedios. Usado para clasificar el resumen de `/ronda` y,
 * desde Fase 5, para filtrar "excepciones sin desenlace terminal" del
 * bloque de excepciones vencidas (P-2/M-4, §8.1) -- exportada para que el
 * tick no vuelva a escribir esta lista de cuatro strings por su cuenta. */
export const ESTADOS_TERMINALES: readonly EstadoExcepcionInventario[] = [
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

export interface AlcanceRondaConCategoriaRow extends AlcanceRondaRow {
  categoria: string;
}

/** MISMA consulta que `obtenerAlcanceRonda`, con `productos.categoria`
 * embebido -- función APARTE (no se agrega el campo a la de arriba) para no
 * tocar la forma de retorno de la que ya usan `resolverHallazgos.ts` y
 * `/existencias`. `categoria` no se congela en `rondas_inventario_alcance`
 * (R-5 es sobre la CANTIDAD, no sobre la taxonomía del producto) -- se lee
 * en vivo de `productos` vía el `producto_id` del snapshot, mismo criterio
 * que ya usa `resolverNombreActor`/`fn_ronda_actor_nombre` para no congelar
 * datos que no son la medición que R-5 protege. Pedido de Santiago
 * probando en vivo (2026-08-28): el `.md` del alcance agrupado por
 * categoría, para que refleje cómo está organizada la bodega. */
export async function obtenerAlcanceRondaConCategoria(
  supabase: SupabaseClient,
  rondaId: string,
): Promise<AlcanceRondaConCategoriaRow[]> {
  const { data, error } = await supabase
    .from('rondas_inventario_alcance')
    .select('producto_id, cantidad_teorica, unidad, nombre_producto, producto:productos(categoria)')
    .eq('ronda_id', rondaId)
    .order('nombre_producto', { ascending: true });
  if (error) {
    console.error('[ronda] obtenerAlcanceRondaConCategoria error:', error.message);
    return [];
  }
  return ((data ?? []) as Array<AlcanceRondaRow & { producto: { categoria: string } | { categoria: string }[] | null }>).map((fila) => {
    const producto = Array.isArray(fila.producto) ? fila.producto[0] : fila.producto;
    return {
      producto_id: fila.producto_id,
      cantidad_teorica: fila.cantidad_teorica,
      unidad: fila.unidad,
      nombre_producto: fila.nombre_producto,
      categoria: producto?.categoria ?? 'Otros',
    };
  });
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

/** CA-4 (hallazgo real de Santiago probando en vivo, 2026-08-28): "los
 * productos en cero no entran solos; Uriel puede reportar uno igual si lo
 * encuentra". Candidatos para el fallback de `resolverProducto` cuando un
 * hallazgo no matchea nada del alcance congelado -- productos que SÍ existen
 * en el catálogo pero con `cantidad_actual <= 0` (por eso `fn_ronda_abrir`
 * nunca los congeló, esa función sólo selecciona `> 0`). Deliberadamente
 * SIN filtro de `activo`: CA-4 no lo pide, y el hallazgo real de Santiago
 * (15-15-15) era justamente un producto inactivo. ~150 filas hoy -- se trae
 * completo, sin paginar, porque `resolverProducto` sólo hace coincidencia
 * exacta normalizada (D-T7), no una búsqueda que se beneficie de acotar
 * server-side. */
export async function obtenerProductosFueraDeAlcance(supabase: SupabaseClient): Promise<ProductoFueraDeAlcance[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, unidad_medida')
    .lte('cantidad_actual', 0);
  if (error) {
    console.error('[ronda] obtenerProductosFueraDeAlcance error:', error.message);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; nombre: string; unidad_medida: string }>).map((p) => ({
    productoId: p.id,
    nombre: p.nombre,
    unidad: p.unidad_medida,
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

// ---------------------------------------------------------------------------
// Fase 4 (Telegram, David y Santiago) — §7.2/§13 del brief técnico. Cierra
// el ciclo de una excepción: David confirma/explica y captura con respaldo
// (B-1/B-2, `/explicar`), David o Uriel proponen el ajuste (B-5, `/proponer`),
// Santiago aprueba o desestima y lo aplica (B-6/B-7, `/aprobar`).
// ---------------------------------------------------------------------------

interface ProductoEmbebido {
  nombre: string;
  unidad_medida: string;
}

/** Todas las columnas de `rondas_excepciones` que necesita ALGÚN paso de
 * Fase 4, con el producto embebido — un solo tipo y un solo `select` para
 * `/explicar`, `/proponer`, `/aprobar` y la conversación `excepcionDavid`, en
 * vez de tres formas casi iguales de la misma fila (cada call site usa sólo
 * los campos que le tocan). */
export interface ExcepcionDetalleRonda {
  id: string;
  ronda_id: string;
  producto_id: string;
  estado: EstadoExcepcionInventario;
  cantidad_fisica: number;
  teorico_conteo: number;
  observacion_uriel: string | null;
  explicacion_citada: string | null;
  explicacion_david: string | null;
  causa_sugerida: string | null;
  propuesta_causa: string | null;
  propuesta_nota: string | null;
  propuesta_por_usuario: string | null;
  propuesta_por_telegram: string | null;
  producto: ProductoEmbebido | null;
}

const SELECT_EXCEPCION_DETALLE =
  'id, ronda_id, producto_id, estado, cantidad_fisica, teorico_conteo, observacion_uriel, ' +
  'explicacion_citada, explicacion_david, causa_sugerida, propuesta_causa, propuesta_nota, ' +
  'propuesta_por_usuario, propuesta_por_telegram, producto:productos(nombre, unidad_medida)';

/** Una excepción por id, con el producto embebido — lo que la conversación
 * `excepcionDavid` y cada paso de `/proponer`/`/aprobar` necesitan para
 * re-leer el estado ANTES de mostrar el siguiente botón (una excepción puede
 * haber cambiado de estado entre dos toques — p. ej. otra corrida de
 * `/explicar` la resolvió, o Santiago ya decidió —, y el `RAISE EXCEPTION`
 * del RPC correspondiente es la autoridad final, pero mostrar el mensaje
 * correcto de una vez es mejor experiencia que un error genérico). */
export async function obtenerExcepcionDetalle(
  supabase: SupabaseClient,
  excepcionId: string,
): Promise<ExcepcionDetalleRonda | null> {
  const { data, error } = await supabase
    .from('rondas_excepciones')
    .select(SELECT_EXCEPCION_DETALLE)
    .eq('id', excepcionId)
    .maybeSingle();
  if (error) {
    console.error('[ronda] obtenerExcepcionDetalle error:', error.message);
    return null;
  }
  return (data as unknown as ExcepcionDetalleRonda | null) ?? null;
}

/** `ExcepcionDetalleRonda` (snake_case, columnas de la tabla) ->
 * `CasoExcepcion` (camelCase, lo que `resolucion.ts` espera) — el mapeo que
 * TODOS los pasos de Fase 4 necesitan para renderizar el caso base. */
export function excepcionComoCaso(excepcion: ExcepcionDetalleRonda): CasoExcepcion {
  return {
    productoNombre: excepcion.producto?.nombre ?? '(producto sin nombre)',
    unidad: excepcion.producto?.unidad_medida ?? null,
    fisico: excepcion.cantidad_fisica,
    teorico: excepcion.teorico_conteo,
    observacionUriel: excepcion.observacion_uriel,
  };
}

/** `ExcepcionDetalleRonda` -> `CasoProponer` — agrega la explicación de
 * David y la etiqueta de la causa que sugirió el intérprete (si la hubo;
 * D-T8/CA-34: nunca vinculante, sólo pista). */
export function excepcionComoCasoProponer(excepcion: ExcepcionDetalleRonda): CasoProponer {
  return {
    ...excepcionComoCaso(excepcion),
    explicacionDavid: excepcion.explicacion_david,
    causaSugeridaEtiqueta: excepcion.causa_sugerida
      ? (buscarCausaRaiz(excepcion.causa_sugerida)?.etiqueta ?? excepcion.causa_sugerida)
      : null,
  };
}

/** `ExcepcionDetalleRonda` -> `CasoSantiago` — agrega la explicación de
 * David, la causa PROPUESTA (no la sugerida por el intérprete: la que David
 * o Uriel eligieron al proponer) y su nota. `propuestoPor` viaja aparte
 * porque resolverlo es async (`resolverNombreActor`, más abajo) — no puede
 * vivir en este mapeo síncrono. */
export function excepcionComoCasoSantiago(excepcion: ExcepcionDetalleRonda, propuestoPor: string): CasoSantiago {
  return {
    ...excepcionComoCaso(excepcion),
    explicacionDavid: excepcion.explicacion_david,
    propuestaCausaEtiqueta: excepcion.propuesta_causa
      ? (buscarCausaRaiz(excepcion.propuesta_causa)?.etiqueta ?? excepcion.propuesta_causa)
      : '(sin causa)',
    propuestaNota: excepcion.propuesta_nota,
    propuestoPor,
  };
}

/** Nombre legible de quien propuso/decidió/etc, vía `fn_ronda_actor_nombre`
 * (migración 126) — el MISMO `COALESCE` (telegram_usuarios.nombre_display ->
 * usuarios.nombre_completo/email -> 'Ronda de inventario') que ya usan los
 * RPC de captura y aplicación al escribir `movimientos_inventario.responsable`.
 * Se llama por RPC en vez de reimplementar el `COALESCE` acá, para que esa
 * regla tenga un solo dueño (mismo criterio D-T2 del catálogo de causas). */
export async function resolverNombreActor(
  supabase: SupabaseClient,
  usuarioId: string | null,
  telegramId: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('fn_ronda_actor_nombre', {
    p_usuario: usuarioId,
    p_telegram: telegramId,
  });
  if (error) {
    console.error('[ronda] resolverNombreActor error:', error.message);
    return 'alguien del sistema';
  }
  return (data as string | null) ?? 'alguien del sistema';
}

/** El MISMO vínculo `telegram_usuarios.usuario_id -> usuarios.rol` que la
 * guarda de Gerencia de `fn_ronda_decidir_ajuste` (migración 126, §6.1 del
 * brief técnico, literal — nunca `es_usuario_gerencia()`, que con
 * `service_role` da falso siempre). El RPC ya la protege — esto es sólo para
 * no mostrarle a un usuario de Telegram con `inventario_aprobacion` pero sin
 * vínculo de Gerencia una lista de ajustes que después no va a poder
 * decidir, lo que le devolvería un error de permisos en vez de la
 * explicación clara de "no tienes acceso" que ya usan los demás módulos. */
export async function esUsuarioTelegramGerencia(
  supabase: SupabaseClient,
  telegramUsuarioId: string,
): Promise<boolean> {
  const { data: tgUser, error: errorTg } = await supabase
    .from('telegram_usuarios')
    .select('usuario_id')
    .eq('id', telegramUsuarioId)
    .maybeSingle();
  if (errorTg) {
    console.error('[ronda] esUsuarioTelegramGerencia (telegram_usuarios) error:', errorTg.message);
    return false;
  }
  if (!tgUser?.usuario_id) return false;

  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', tgUser.usuario_id)
    .maybeSingle();
  if (errorUsuario) {
    console.error('[ronda] esUsuarioTelegramGerencia (usuarios) error:', errorUsuario.message);
    return false;
  }
  return usuario?.rol === 'Gerencia';
}

/** `/explicar` (B-1): excepciones que todavía no pasaron por David —
 * `reportada` (sin cita del audio) o `explicacion_precargada` (con cita, sin
 * confirmar/corregir todavía, CA-38). */
export async function obtenerExcepcionesPendientesDavid(supabase: SupabaseClient): Promise<ExcepcionDetalleRonda[]> {
  const { data, error } = await supabase
    .from('rondas_excepciones')
    .select(SELECT_EXCEPCION_DETALLE)
    .in('estado', ['reportada', 'explicacion_precargada'])
    .order('reportada_en', { ascending: true });
  if (error) {
    console.error('[ronda] obtenerExcepcionesPendientesDavid error:', error.message);
    return [];
  }
  return (data as unknown as ExcepcionDetalleRonda[]) ?? [];
}

/** `/proponer` (B-5): excepciones ya `explicada` por David (CA-38 exige ese
 * paso antes de poder proponer, `fn_ronda_proponer_ajuste` lo vuelve a
 * exigir) y sin ajuste propuesto todavía — el estado ya lo garantiza: en
 * cuanto se propone, pasa a `ajuste_propuesto` y deja de aparecer acá. */
export async function obtenerExcepcionesParaProponer(supabase: SupabaseClient): Promise<ExcepcionDetalleRonda[]> {
  const { data, error } = await supabase
    .from('rondas_excepciones')
    .select(SELECT_EXCEPCION_DETALLE)
    .eq('estado', 'explicada')
    .order('explicacion_david_en', { ascending: true });
  if (error) {
    console.error('[ronda] obtenerExcepcionesParaProponer error:', error.message);
    return [];
  }
  return (data as unknown as ExcepcionDetalleRonda[]) ?? [];
}

/** `/aprobar` (B-6): excepciones con un ajuste propuesto, esperando la
 * decisión de Santiago. */
export async function obtenerExcepcionesPropuestasParaSantiago(supabase: SupabaseClient): Promise<ExcepcionDetalleRonda[]> {
  const { data, error } = await supabase
    .from('rondas_excepciones')
    .select(SELECT_EXCEPCION_DETALLE)
    .eq('estado', 'ajuste_propuesto')
    .order('propuesta_en', { ascending: true });
  if (error) {
    console.error('[ronda] obtenerExcepcionesPropuestasParaSantiago error:', error.message);
    return [];
  }
  return (data as unknown as ExcepcionDetalleRonda[]) ?? [];
}
