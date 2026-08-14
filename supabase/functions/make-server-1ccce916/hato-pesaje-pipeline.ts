// hato-pesaje-pipeline.ts — N11-N13 de
// `docs/plan_hato_telegram_estados_agosto_2026.md` §3 Capa 2 / §8.2.
//
// POR QUÉ EXISTE ESTE ARCHIVO: hasta esta sesión, la lectura por foto
// (`leerFotoConModelo` + el armado de roster/config/diff) vivía DENTRO del
// handler de Hono de `hato-pesaje-foto.ts`, y la escritura (revalidación +
// UPDATE-o-INSERT) vivía dentro del handler de `hato-pesaje-commit.ts` — ni
// una ni otra eran reutilizables. El bot de Telegram (`/pesaje`,
// `telegram/conversations/pesajeLeche.ts`) necesita EXACTAMENTE el mismo
// pipeline (no un segundo lector de celdas, no una segunda revalidación),
// así que este archivo extrae la orquestación a funciones puras-de-I/O
// (reciben sus dependencias por parámetro, no leen `Context` de Hono) que
// ambos consumidores llaman. `hato-pesaje-foto.ts` y `hato-pesaje-commit.ts`
// quedan como I/O puro: parsean la petición HTTP, llaman a este módulo, y
// traducen el resultado a una respuesta -- el comportamiento observable de
// esos dos endpoints NO cambia.
//
// Tres funciones, una por nodo del plan:
//   - `ejecutarPipelinePesajeFoto` (N11) -- guarda la capa cruda en Storage,
//     lee cada foto con el modelo de visión, coteja el ancla por nombre
//     (`ocrPesaje.ts`) y arma el diff contra `hato_pesajes_leche`. NUNCA
//     escribe en tablas de dominio (mismo contrato que el endpoint).
//   - `llamarModeloCorreccionPesaje` (N12) -- la ÚNICA llamada HTTP al
//     modelo para interpretar una corrección en texto libre (D-C). El
//     prompt/esquema y la VALIDACIÓN de lo que el modelo devuelve viven en
//     `./importHato/ocrPesajeCorreccion.ts` (puro, espejado, testeado desde
//     Vitest) -- acá solo se hace la llamada HTTP y se le pasa la respuesta
//     cruda a `parsearRespuestaModeloCorreccionPesaje`.
//   - `ejecutarCommitPesaje` (N13) -- la MISMA revalidación fresca que ya
//     tenía `hato-pesaje-commit.ts` (vaca sigue activa, fecha sigue siendo
//     una ocurrencia real del mes) + escritura UPDATE-por-id/INSERT, commit
//     por CELDA (una inválida no bota a las demás).
//
// Los litros se interpretan con `parseValorNumerico` (`calculos-hato.ts`),
// nunca un segundo parser. El cotejo de nombre reusa
// `resolverNombreEnRosterPesaje`/`validarAnclaFilaPesaje` de `ocrPesaje.ts`.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fechasPesajeMensuales } from './calculos-hato.ts';
import {
  construirDiffPesaje,
  construirRosterPesaje,
  esCandidataRosterPesaje,
  esquemaJsonOcrPesaje,
  construirPromptOcrPesaje,
  ETAPAS_ROSTER_PESAJE,
  parsearRespuestaModeloOcrPesaje,
  procesarLecturaOcrPesaje,
  SEMANAS_PESAJE,
  type AnimalRosterPesaje,
  type CeldaDiffPesaje,
  type FilaPesajeNoLeida,
  type LecturaOcrPesajePagina,
  type PesajeExistente,
  type SemanaPesaje,
  type VacaPesajeSinLeer,
} from './importHato/ocrPesaje.ts';
import {
  construirPromptCorreccionPesaje,
  esquemaJsonCorreccionPesaje,
  parsearRespuestaModeloCorreccionPesaje,
  type ItemCorreccionModeloPesaje,
} from './importHato/ocrPesajeCorreccion.ts';

type SupabaseAdmin = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Límites/constantes compartidos -- ÚNICA definición para que el endpoint
// HTTP y la conversación de Telegram acepten exactamente lo mismo (brief
// N11: "mismo límite y mismos tipos MIME que el endpoint").
// ---------------------------------------------------------------------------
export const MAXIMO_FOTOS_PESAJE = 6;
export const TAMANO_MAXIMO_FOTO_PESAJE_BYTES = 15 * 1024 * 1024;
export const TIPOS_ACEPTADOS_FOTO_PESAJE = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// Bucket privado propio (migración 086 -- patrón 072/085). Nunca se mezcla
// con `chequeos-fotos` (otro dominio) ni con `hato-liquidaciones-fotos`.
const BUCKET_FOTOS_PESAJE = 'hato-pesajes-fotos';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_VISION_PESAJE = 'google/gemini-3-flash-preview';
const TIMEOUT_MODELO_MS = 120_000;

// ---------------------------------------------------------------------------
// Helpers de codificación -- idénticos a los que vivían en
// `hato-pesaje-foto.ts` antes de esta extracción.
// ---------------------------------------------------------------------------

function bytesABase64(bytes: Uint8Array): string {
  const TAMANO_BLOQUE = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TAMANO_BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAMANO_BLOQUE));
  }
  return btoa(binario);
}

function extensionDeTipo(tipo: string, nombre: string): string {
  const porNombre = nombre.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (porNombre) return porNombre.toLowerCase();
  const sufijo = tipo.split('/')[1];
  return sufijo ? sufijo.toLowerCase() : 'jpg';
}

function extraerJson(contenido: string): unknown {
  const limpio = contenido.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(limpio);
}

// ---------------------------------------------------------------------------
// N11 — Pipeline de lectura por foto (preview, nunca escribe en dominio).
// ---------------------------------------------------------------------------

export interface FotoPesajeEntrada {
  /** 1-based, en el orden en que el caller recibió las fotos. */
  pagina: number;
  nombre: string;
  tipo: string;
  bytes: Uint8Array;
}

export interface PipelinePesajeFotoResultado {
  generadoEn: string;
  anio: number;
  mes: number;
  fechasPorSemana: Record<SemanaPesaje, string | null>;
  diff: CeldaDiffPesaje[];
  /** El roster que validó el ancla de esta lectura, como ARREGLO plano
   * (nunca el `RosterPesaje` con su `Map` interno): N12 lo necesita para
   * resolver el nombre de una corrección con el MISMO cotejo, pero el bot
   * de Telegram persiste el resultado de este pipeline a través de
   * `conversation.external()` -- eso pasa por el storage jsonb de
   * `telegram_conversations`, y un `Map` no sobrevive un `JSON.stringify`.
   * El caller reconstruye el `RosterPesaje` con `construirRosterPesaje`
   * (puro, determinista) cada vez que lo necesita. */
  rosterAnimales: AnimalRosterPesaje[];
  ocr: {
    modelo: string;
    fotos: Array<{ pagina: number; nombre: string; tipo: string; bytes: number; rutaStorage: string | null }>;
    almacenamiento: { bucket: string; prefijo: string; ok: boolean; errores: string[] };
    paginasNoLeidas: string[];
    filasNoLeidas: FilaPesajeNoLeida[];
    vacasSinLeer: VacaPesajeSinLeer[];
    advertencias: string[];
    resumen: {
      vacasEnRoster: number;
      fotosRecibidas: number;
      fotosLeidas: number;
      filasConfirmadas: number;
      filasNoLeidas: number;
      vacasSinLeer: number;
      celdasNoConfiables: number;
    };
  };
}

export type ResultadoPipelinePesajeFoto =
  | { ok: true; resultado: PipelinePesajeFotoResultado }
  | { ok: false; status: 500 | 502; error: string };

interface LlamadaModeloOk {
  ok: true;
  lectura: LecturaOcrPesajePagina;
}
interface LlamadaModeloError {
  ok: false;
  pagina: number;
  error: string;
}

async function leerFotoConModelo(
  foto: FotoPesajeEntrada,
  totalFotos: number,
  prompt: string,
  esquema: Record<string, unknown>,
  apiKey: string,
): Promise<LlamadaModeloOk | LlamadaModeloError> {
  const dataUrl = `data:${foto.tipo};base64,${bytesABase64(foto.bytes)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MODELO_MS);

  try {
    const respuesta = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELO_VISION_PESAJE,
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                // "foto N de M", no "página N": desde 2026-08-11 la planilla
                // cabe en UNA hoja y se fotografía por franjas, así que
                // llamarla página inducía al modelo a esperar una planilla
                // completa (con encabezados) en cada imagen.
                text: `Transcribe la foto ${foto.pagina} de ${totalFotos} de la planilla de pesaje. Puede ser una franja de la hoja, no la hoja entera. Devuelve una entrada por cada fila de vaca visible, en el orden en que aparecen.`,
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 12000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'planilla_pesaje', strict: true, schema: esquema },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      return {
        ok: false,
        pagina: foto.pagina,
        error: `el modelo de visión respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
      };
    }

    const resultado = await respuesta.json();
    const contenido = resultado?.choices?.[0]?.message?.content;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      return { ok: false, pagina: foto.pagina, error: 'el modelo de visión devolvió una respuesta vacía' };
    }

    return { ok: true, lectura: parsearRespuestaModeloOcrPesaje(extraerJson(contenido), foto.pagina) };
  } catch (err) {
    clearTimeout(timeoutId);
    const mensaje =
      err instanceof Error && err.name === 'AbortError'
        ? `la lectura superó el tiempo máximo (${TIMEOUT_MODELO_MS / 1000}s)`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, pagina: foto.pagina, error: mensaje };
  }
}

/**
 * N11: orquesta toda la ruta de lectura por foto -- guarda la capa cruda en
 * Storage ANTES de leerla, resuelve `hato_config.dia_pesaje_semanal` y el
 * roster vigente, llama al modelo (una vez por foto, en paralelo), coteja
 * el ancla por nombre y arma el diff contra `hato_pesajes_leche`. NUNCA
 * escribe en tablas de dominio -- ver `ejecutarCommitPesaje` para eso.
 *
 * Comparte esta orquestación el endpoint HTTP (`hato-pesaje-foto.ts`) y la
 * conversación de Telegram (`pesajeLeche.ts`) -- es el pipeline que pedía
 * N11 del plan, no un segundo lector de celdas ni un segundo armado de
 * roster.
 */
export async function ejecutarPipelinePesajeFoto(params: {
  supabase: SupabaseAdmin;
  apiKey: string;
  fotos: readonly FotoPesajeEntrada[];
  anio: number;
  mes: number;
}): Promise<ResultadoPipelinePesajeFoto> {
  const { supabase, apiKey, fotos, anio, mes } = params;
  const generadoEn = new Date().toISOString();

  // --- 1. Guardar la capa cruda ANTES de leerla -----------------------------
  const prefijoStorage = `pesaje-foto/${generadoEn.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const rutasStorage: Array<string | null> = [];
  const erroresStorage: string[] = [];
  for (const foto of fotos) {
    const ruta = `${prefijoStorage}/pagina-${foto.pagina}.${extensionDeTipo(foto.tipo, foto.nombre)}`;
    const { error } = await supabase.storage
      .from(BUCKET_FOTOS_PESAJE)
      .upload(ruta, foto.bytes, { contentType: foto.tipo, upsert: false });
    if (error) {
      rutasStorage.push(null);
      erroresStorage.push(`página ${foto.pagina}: ${error.message}`);
    } else {
      rutasStorage.push(ruta);
    }
  }

  // --- 2. hato_config.dia_pesaje_semanal + roster VIGENTE de la planilla ----
  const [configRes, rosterRes] = await Promise.all([
    supabase.from('hato_config').select('valor').eq('clave', 'dia_pesaje_semanal').maybeSingle(),
    supabase.from('hato_animales').select('id, nombre, etapa, estado').eq('estado', 'activa').in('etapa', ETAPAS_ROSTER_PESAJE),
  ]);

  if (configRes.error) return { ok: false, status: 500, error: `No se pudo leer hato_config: ${configRes.error.message}` };
  const configValor = configRes.data?.valor as { iso?: unknown } | undefined;
  if (!configValor || typeof configValor.iso !== 'number' || configValor.iso < 1 || configValor.iso > 7) {
    return {
      ok: false,
      status: 500,
      error: 'hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064) -- no se puede resolver a qué fecha corresponde cada semana.',
    };
  }
  const diaPesajeIso = configValor.iso;

  if (rosterRes.error) return { ok: false, status: 500, error: `No se pudo leer hato_animales: ${rosterRes.error.message}` };
  const animalesRoster: AnimalRosterPesaje[] = (
    (rosterRes.data ?? []) as Array<{ id: string; nombre: string | null; etapa: string | null; estado: string | null }>
  )
    .filter((a) => esCandidataRosterPesaje({ etapa: a.etapa, estado: a.estado }))
    .map((a) => ({ id: a.id, nombre: a.nombre ?? '' }));
  const roster = construirRosterPesaje(animalesRoster);

  if (roster.entradas.length === 0) {
    return {
      ok: false,
      status: 500,
      error: 'No hay vacas en ordeño activas con nombre en el hato: sin roster no se puede validar el ancla de ninguna fila.',
    };
  }

  const fechasArr = fechasPesajeMensuales(anio, mes, diaPesajeIso);
  const fechasPorSemana = {} as Record<SemanaPesaje, string | null>;
  for (const semana of SEMANAS_PESAJE) fechasPorSemana[semana] = fechasArr[semana - 1] ?? null;

  // --- 3. Lectura con el modelo de visión (una llamada por foto) -----------
  const prompt = construirPromptOcrPesaje();
  const esquema = esquemaJsonOcrPesaje();
  const resultados = await Promise.all(
    fotos.map((foto) => leerFotoConModelo(foto, fotos.length, prompt, esquema, apiKey)),
  );

  const lecturas: LecturaOcrPesajePagina[] = [];
  const erroresLectura: string[] = [];
  for (const resultado of resultados) {
    if (resultado.ok) lecturas.push(resultado.lectura);
    else erroresLectura.push(`página ${resultado.pagina}: ${resultado.error}`);
  }

  if (lecturas.length === 0) {
    return {
      ok: false,
      status: 502,
      error: `No se pudo leer ninguna de las fotos. ${erroresLectura.join(' | ')}${
        rutasStorage.some((r) => r !== null) ? ' Las fotos sí quedaron guardadas.' : ''
      }`,
    };
  }

  // --- 4. Anti-row-drift por nombre (lógica pura) ---------------------------
  const ocr = procesarLecturaOcrPesaje(lecturas, roster);

  // --- 5. Existentes en hato_pesajes_leche, para clasificar el diff --------
  const animalIdsLeidos = ocr.filasConfirmadas.map((f) => f.animalId);
  const fechasValidas = SEMANAS_PESAJE.map((s) => fechasPorSemana[s]).filter((f): f is string => f !== null);
  const existentes = new Map<string, Map<string, PesajeExistente>>();
  if (animalIdsLeidos.length > 0 && fechasValidas.length > 0) {
    const { data, error } = await supabase
      .from('hato_pesajes_leche')
      .select('id, animal_id, fecha, litros_am, litros_pm, litros_total')
      .in('animal_id', animalIdsLeidos)
      .in('fecha', fechasValidas);
    if (error) return { ok: false, status: 500, error: `No se pudo leer hato_pesajes_leche: ${error.message}` };
    for (const fila of (data ?? []) as Array<{ id: string; animal_id: string; fecha: string; litros_am: number | null; litros_pm: number | null; litros_total: number }>) {
      if (!existentes.has(fila.animal_id)) existentes.set(fila.animal_id, new Map());
      existentes.get(fila.animal_id)!.set(fila.fecha, {
        id: fila.id,
        litrosAm: fila.litros_am,
        litrosPm: fila.litros_pm,
        litrosTotal: fila.litros_total,
      });
    }
  }

  const diff = construirDiffPesaje(ocr.filasConfirmadas, fechasPorSemana, existentes);
  const celdasNoConfiables = ocr.filasConfirmadas.reduce((n, f) => n + f.celdasNoConfiables.length, 0);

  return {
    ok: true,
    resultado: {
      generadoEn,
      anio,
      mes,
      fechasPorSemana,
      diff,
      rosterAnimales: animalesRoster,
      ocr: {
        modelo: MODELO_VISION_PESAJE,
        fotos: fotos.map((f, i) => ({
          pagina: f.pagina,
          nombre: f.nombre,
          tipo: f.tipo,
          bytes: f.bytes.length,
          rutaStorage: rutasStorage[i],
        })),
        almacenamiento: {
          bucket: BUCKET_FOTOS_PESAJE,
          prefijo: prefijoStorage,
          ok: erroresStorage.length === 0,
          errores: erroresStorage,
        },
        paginasNoLeidas: erroresLectura,
        filasNoLeidas: ocr.filasNoLeidas,
        vacasSinLeer: ocr.vacasSinLeer,
        advertencias: ocr.advertencias,
        resumen: {
          vacasEnRoster: roster.entradas.length,
          fotosRecibidas: fotos.length,
          fotosLeidas: lecturas.length,
          filasConfirmadas: ocr.filasConfirmadas.length,
          filasNoLeidas: ocr.filasNoLeidas.length,
          vacasSinLeer: ocr.vacasSinLeer.length,
          celdasNoConfiables,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// N12 — Interpretación de una corrección en texto libre (decisión D-C).
// ---------------------------------------------------------------------------

export type ResultadoLlamadaCorreccionPesaje =
  | { ok: true; items: ItemCorreccionModeloPesaje[]; avisos: string[] }
  | { ok: false; error: string };

/**
 * N12: la ÚNICA llamada HTTP al modelo para interpretar el texto libre de
 * una corrección. El prompt y el esquema vienen de
 * `ocrPesajeCorreccion.ts` (puro, espejado) -- acá solo se hace la
 * petición y se le pasa la respuesta cruda a
 * `parsearRespuestaModeloCorreccionPesaje`, que es quien decide la forma.
 * Esta función NUNCA valida el contenido (nombre contra roster, semana
 * contra la grilla del mes): eso es `interpretarCorreccionPesaje`, pura,
 * llamada por el caller DESPUÉS de esto.
 */
export async function llamarModeloCorreccionPesaje(
  texto: string,
  apiKey: string,
): Promise<ResultadoLlamadaCorreccionPesaje> {
  const prompt = construirPromptCorreccionPesaje();
  const esquema = esquemaJsonCorreccionPesaje();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MODELO_MS);

  try {
    const respuesta = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELO_VISION_PESAJE,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 4000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'correccion_pesaje', strict: true, schema: esquema },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      return { ok: false, error: `el modelo respondió ${respuesta.status}: ${detalle.slice(0, 300)}` };
    }

    const resultado = await respuesta.json();
    const contenido = resultado?.choices?.[0]?.message?.content;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      return { ok: false, error: 'el modelo devolvió una respuesta vacía' };
    }

    const { items, avisos } = parsearRespuestaModeloCorreccionPesaje(extraerJson(contenido));
    return { ok: true, items, avisos };
  } catch (err) {
    clearTimeout(timeoutId);
    const mensaje =
      err instanceof Error && err.name === 'AbortError'
        ? `la interpretación superó el tiempo máximo (${TIMEOUT_MODELO_MS / 1000}s)`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: mensaje };
  }
}

// ---------------------------------------------------------------------------
// N13 — Commit por celda (revalidación fresca + escritura).
// ---------------------------------------------------------------------------

export interface CeldaCommitPesajeEntrada {
  animalId: string;
  fecha: string; // AAAA-MM-DD
  litrosAm: number | null;
  litrosPm: number | null;
}

export interface CeldaPesajeRechazada {
  animalId: string;
  fecha: string;
  motivo: string;
}

export type ResultadoCommitPesaje =
  | { ok: true; guardados: number; actualizados: number; creados: number; celdasRechazadas: CeldaPesajeRechazada[] }
  | { ok: false; status: 400; error: string; celdasRechazadas: CeldaPesajeRechazada[] }
  | { ok: false; status: 500; error: string };

/**
 * N13: la MISMA revalidación fresca que ya tenía `hato-pesaje-commit.ts`
 * (la vaca sigue en el roster de la planilla EN ESTE INSTANTE; la fecha
 * sigue siendo una ocurrencia real de `hato_config.dia_pesaje_semanal` para
 * `(anio, mes)` EN ESTE INSTANTE) + escritura UPDATE-por-id/INSERT (nunca
 * upsert de PostgREST). Commit por CELDA: una celda inválida se rechaza
 * sola, el resto entra -- así una vaca vendida entre la vista previa y la
 * aprobación no le cuesta a Martha/Fernando los demás pesajes.
 *
 * `createdBy` viaja EXPLÍCITO (riesgo R-6 del plan): el caller (endpoint
 * HTTP o bot de Telegram) escribe con `service_role`, donde `auth.uid()` es
 * NULL, así que sin este parámetro la autoría se perdería. `fuente` la
 * decide el caller (`'foto'` para el endpoint web, `'telegram'` para el
 * bot) -- no hay un valor por defecto acá a propósito, para que no se
 * pueda commitear sin declarar de dónde vino.
 */
export async function ejecutarCommitPesaje(params: {
  supabase: SupabaseAdmin;
  anio: number;
  mes: number;
  celdas: readonly CeldaCommitPesajeEntrada[];
  createdBy: string;
  fuente: string;
}): Promise<ResultadoCommitPesaje> {
  const { supabase, anio, mes, celdas, createdBy, fuente } = params;

  // --- 1. hato_config.dia_pesaje_semanal FRESCO -----------------------------
  const { data: configData, error: configError } = await supabase
    .from('hato_config')
    .select('valor')
    .eq('clave', 'dia_pesaje_semanal')
    .maybeSingle();
  if (configError) return { ok: false, status: 500, error: `No se pudo leer hato_config: ${configError.message}` };
  const configValor = configData?.valor as { iso?: unknown } | undefined;
  if (!configValor || typeof configValor.iso !== 'number' || configValor.iso < 1 || configValor.iso > 7) {
    return {
      ok: false,
      status: 500,
      error: 'hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064).',
    };
  }
  const fechasValidasHoy = new Set(fechasPesajeMensuales(anio, mes, configValor.iso as number));

  // --- 2. Roster FRESCO -----------------------------------------------------
  const animalIds = [...new Set(celdas.map((c) => c.animalId))];
  const { data: animalesData, error: animalesError } = await supabase
    .from('hato_animales')
    .select('id, etapa, estado')
    .in('id', animalIds)
    .in('etapa', ETAPAS_ROSTER_PESAJE);
  if (animalesError) {
    return { ok: false, status: 500, error: `No se pudo leer hato_animales: ${animalesError.message}` };
  }
  const activasAhora = new Set(
    ((animalesData ?? []) as Array<{ id: string; etapa: string | null; estado: string | null }>)
      .filter((a) => esCandidataRosterPesaje({ etapa: a.etapa, estado: a.estado }))
      .map((a) => a.id),
  );

  // --- 3. Filtrar: solo celdas cuya vaca sigue activa y cuya fecha sigue
  //    siendo una ocurrencia real del día de pesaje configurado. ------------
  const aceptadas: CeldaCommitPesajeEntrada[] = [];
  const rechazadas: CeldaPesajeRechazada[] = [];
  for (const celda of celdas) {
    if (!activasAhora.has(celda.animalId)) {
      rechazadas.push({ animalId: celda.animalId, fecha: celda.fecha, motivo: 'El animal ya no está en el roster de la planilla -- puede haberse vendido o cambiado de etapa desde la vista previa.' });
      continue;
    }
    if (!fechasValidasHoy.has(celda.fecha)) {
      rechazadas.push({ animalId: celda.animalId, fecha: celda.fecha, motivo: 'Esa fecha ya no corresponde a una semana de pesaje configurada para este mes.' });
      continue;
    }
    aceptadas.push(celda);
  }

  if (aceptadas.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Ninguna celda pasó la revalidación -- el hato cambió desde la vista previa. No se escribió nada.',
      celdasRechazadas: rechazadas,
    };
  }

  // --- 4. Existentes FRESCOS -------------------------------------------------
  const fechasEnLote = [...new Set(aceptadas.map((c) => c.fecha))];
  const { data: existentesData, error: existentesError } = await supabase
    .from('hato_pesajes_leche')
    .select('id, animal_id, fecha')
    .in('animal_id', [...new Set(aceptadas.map((c) => c.animalId))])
    .in('fecha', fechasEnLote);
  if (existentesError) return { ok: false, status: 500, error: `No se pudo leer hato_pesajes_leche: ${existentesError.message}` };
  const idExistentePorClave = new Map<string, string>();
  for (const fila of (existentesData ?? []) as Array<{ id: string; animal_id: string; fecha: string }>) {
    idExistentePorClave.set(`${fila.animal_id}|${fila.fecha}`, fila.id);
  }

  // --- 5. Escritura: UPDATE-por-id + INSERT (nunca upsert de PostgREST) ----
  let actualizados = 0;
  let creados = 0;
  const nuevasFilas: Array<{ animal_id: string; fecha: string; litros_am: number | null; litros_pm: number | null; litros_total: number; fuente: string; created_by: string }> = [];

  for (const celda of aceptadas) {
    const total = (celda.litrosAm ?? 0) + (celda.litrosPm ?? 0);
    const existenteId = idExistentePorClave.get(`${celda.animalId}|${celda.fecha}`);
    if (existenteId) {
      const { error } = await supabase
        .from('hato_pesajes_leche')
        .update({ litros_am: celda.litrosAm, litros_pm: celda.litrosPm, litros_total: total, fuente })
        .eq('id', existenteId);
      if (error) return { ok: false, status: 500, error: `No se pudo actualizar el pesaje de '${celda.animalId}' en ${celda.fecha}: ${error.message}` };
      actualizados += 1;
    } else {
      nuevasFilas.push({
        animal_id: celda.animalId,
        fecha: celda.fecha,
        litros_am: celda.litrosAm,
        litros_pm: celda.litrosPm,
        litros_total: total,
        fuente,
        created_by: createdBy,
      });
    }
  }

  if (nuevasFilas.length > 0) {
    const { error } = await supabase.from('hato_pesajes_leche').insert(nuevasFilas);
    if (error) return { ok: false, status: 500, error: `No se pudieron insertar los pesajes nuevos: ${error.message}` };
    creados = nuevasFilas.length;
  }

  return { ok: true, guardados: actualizados + creados, actualizados, creados, celdasRechazadas: rechazadas };
}
