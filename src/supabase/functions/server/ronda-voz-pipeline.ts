// ronda-voz-pipeline.ts — Fase 3 (Telegram, Uriel) de
// docs/brief_tecnico_verificacion_inventario.md §5/§13. El pipeline de voz
// de la ronda de inventario: descarga → STT → interpretación → preview
// (§5.2, D-T6: DOS llamadas al modelo, transcribir y después interpretar).
//
// I/O puro en este archivo: las dos llamadas HTTP a OpenRouter, nada más.
// Toda la lógica (el esquema JSON, el prompt del intérprete, el parseo
// tolerante de la respuesta, la resolución de producto/físico/vía) vive en
// el módulo puro `./rondaInventario/interpretarNota.ts` (copia GENERADA de
// `src/utils/rondaInventario/interpretarNota.ts`, ver
// docs/inventario/regenerar-copias-ronda-inventario.py) y está cubierta por
// Vitest con fixtures de respuesta del modelo
// (`src/__tests__/rondaInventarioInterpretacion.test.ts`).
//
// NO descarga el audio de Telegram (eso es `telegram/bot.ts`, reusando
// `descargarBytesTelegram` -- mismo helper que `pesajeLeche.ts:216-224`) y
// NO toca Supabase -- este archivo recibe bytes y devuelve texto/JSON, nada
// más. NUNCA escribe en `rondas_transcritos` ni en ninguna tabla de dominio.
//
// D-T6, LITERAL (§5.2 del brief técnico): "En una sola pasada el
// 'transcrito' sería un campo más que produjo la misma inferencia que
// produjo los hallazgos: si el modelo oye 'Silicio' donde dice
// 'Silicalmag', el transcrito diría 'Silicio' y el hallazgo diría 'Silicio',
// y no existiría forma de distinguir un error de audición de uno de
// interpretación." Por eso `transcribirNotaVoz` y `interpretarTranscrito`
// son DOS funciones, DOS llamadas HTTP, nunca una sola.
//
// Riesgo documentado en el brief (§5.7) que este archivo NO puede resolver
// por su cuenta: Telegram manda OGG/**Opus** y OpenRouter documenta `ogg`
// como "Ogg Vorbis" -- no está confirmado que el par funcione. Esta sesión
// NO tuvo `OPENROUTER_API_KEY` disponible (ver el spike
// `docs/inventario/spike_stt_ogg_opus.py`, que tampoco la tuvo), así que
// `transcribirNotaVoz` no se pudo ejercer contra la API real. Si al
// desplegar el par falla con un error de FORMATO específico, la
// degradación ya está diseñada (§5.7 opción 3: comando `/hallazgo`
// estructurado) pero NO implementada acá -- ver el reporte de la sesión que
// agregó este archivo.

import type { CausaRaiz } from './rondaInventario/causasRaiz.ts';
import { CAUSAS_RAIZ } from './rondaInventario/causasRaiz.ts';
import {
  construirPromptInterprete,
  esquemaJsonHallazgos,
  parsearRespuestaModelo,
  type RespuestaModeloInterprete,
} from './rondaInventario/interpretarNota.ts';

// --- Endpoints y modelos (§5.3 del brief técnico) ---------------------------
const STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Default en código, overridable por variable de entorno -- precedente
 * `ACCIONES_MODELO` (acciones-tick.ts): cambiar de modelo no debe ser un
 * despliegue. */
export function modeloSttPorDefecto(): string {
  return Deno.env.get('RONDA_STT_MODELO') || 'openai/whisper-large-v3-turbo';
}

/** Mismo id ya pinado en `hato-chequeo-foto.ts:79` y usado por Esco. */
export function modeloInterpretePorDefecto(): string {
  return Deno.env.get('RONDA_INTERPRETE_MODELO') || 'google/gemini-3-flash-preview';
}

const TIMEOUT_TRANSCRIPCION_MS = 60_000; // una nota de voz de campo, minutos, no páginas de planilla
const TIMEOUT_INTERPRETACION_MS = 60_000;

/** Extrae el JSON de la respuesta del modelo tolerando que lo envuelva en un
 * bloque markdown pese al `response_format` (pasa de vez en cuando) --
 * mismo helper que `hato-chequeo-foto.ts`/`hato-pesaje-pipeline.ts`
 * (duplicado a propósito, precedente ya establecido en este árbol: cada
 * pipeline es autocontenido). */
function extraerJson(contenido: string): unknown {
  const limpio = contenido.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(limpio);
}

// ---------------------------------------------------------------------------
// Etapa (1) — Transcripción (CA-36: la capa cruda de este flujo)
// ---------------------------------------------------------------------------

export type ResultadoTranscripcion =
  | { ok: true; texto: string }
  | { ok: false; error: string };

/**
 * `POST /api/v1/audio/transcriptions`, `multipart/form-data` (campos `file`
 * y `model`) -- la variante que evita declarar `format` a mano: el endpoint
 * infiere el tipo del `Content-Type`/nombre del archivo adjunto (mismo
 * criterio verificado por el spike `docs/inventario/spike_stt_ogg_opus.py`).
 * El resultado, si tiene éxito, ES la capa cruda (CA-36) -- se guarda
 * literal en `rondas_transcritos.transcrito`, nunca se reescribe acá ni en
 * ningún llamador.
 */
export async function transcribirNotaVoz(
  bytes: Uint8Array,
  tipo: string,
  nombreArchivo: string,
  apiKey: string,
  modelo: string = modeloSttPorDefecto(),
): Promise<ResultadoTranscripcion> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_TRANSCRIPCION_MS);

  try {
    const formData = new FormData();
    formData.append('model', modelo);
    // Copia a un `Uint8Array<ArrayBuffer>` fresco (nunca `SharedArrayBuffer`):
    // `Blob`/`BlobPart` en el lib DOM más reciente ya no acepta el tipo
    // genérico `Uint8Array<ArrayBufferLike>` que devuelve la descarga.
    formData.append('file', new Blob([new Uint8Array(bytes)], { type: tipo }), nombreArchivo);

    const respuesta = await fetch(STT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      return { ok: false, error: `el transcriptor respondió ${respuesta.status}: ${detalle.slice(0, 300)}` };
    }

    const resultado = await respuesta.json();
    // OpenRouter es compatible con el formato de OpenAI para este endpoint:
    // `{ text: "..." }`. Se lee con tolerancia (`?.`) porque un proveedor
    // de terceros puede devolver una forma ligeramente distinta -- si no hay
    // `text`, es un fallo, no un transcrito vacío disfrazado de éxito.
    const texto = typeof resultado?.text === 'string' ? resultado.text.trim() : '';
    if (texto === '') {
      return { ok: false, error: 'el transcriptor devolvió una respuesta sin texto' };
    }
    return { ok: true, texto };
  } catch (err) {
    clearTimeout(timeoutId);
    const mensaje =
      err instanceof Error && err.name === 'AbortError'
        ? `la transcripción superó el tiempo máximo (${TIMEOUT_TRANSCRIPCION_MS / 1000}s)`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: mensaje };
  }
}

// ---------------------------------------------------------------------------
// Etapa (2) — Interpretación, sobre TEXTO (D-T6)
// ---------------------------------------------------------------------------

export type ResultadoInterpretacion =
  | { ok: true; respuesta: RespuestaModeloInterprete; crudo: unknown }
  | { ok: false; error: string };

/**
 * `POST /api/v1/chat/completions`, `response_format: json_schema` (esquema
 * EXACTO de `esquemaJsonHallazgos()`), `temperature: 0`, prompt de
 * `construirPromptInterprete()`. Trabaja sobre el TRANSCRITO (texto), nunca
 * sobre audio -- es la etapa que hace posible re-interpretar una corrección
 * de Uriel sin volver a transcribir nada (§7.3: "la corrección re-interpreta
 * el TRANSCRITO ORIGINAL + el historial de correcciones acumuladas" -- el
 * llamador arma ese texto combinado y lo pasa acá tal cual, esta función no
 * sabe si está interpretando la nota original o una corrección).
 */
export async function interpretarTranscrito(
  texto: string,
  apiKey: string,
  modelo: string = modeloInterpretePorDefecto(),
  catalogoCausas: readonly CausaRaiz[] = CAUSAS_RAIZ,
): Promise<ResultadoInterpretacion> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_INTERPRETACION_MS);

  try {
    const prompt = construirPromptInterprete(catalogoCausas);
    const esquema = esquemaJsonHallazgos();

    const respuesta = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 6000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'hallazgos_ronda_inventario', strict: true, schema: esquema },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      return { ok: false, error: `el intérprete respondió ${respuesta.status}: ${detalle.slice(0, 300)}` };
    }

    const resultado = await respuesta.json();
    const contenido = resultado?.choices?.[0]?.message?.content;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      return { ok: false, error: 'el intérprete devolvió una respuesta vacía' };
    }

    const crudo = extraerJson(contenido);
    const parseada = parsearRespuestaModelo(crudo);
    return { ok: true, respuesta: parseada, crudo };
  } catch (err) {
    clearTimeout(timeoutId);
    const mensaje =
      err instanceof Error && err.name === 'AbortError'
        ? `la interpretación superó el tiempo máximo (${TIMEOUT_INTERPRETACION_MS / 1000}s)`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: mensaje };
  }
}

// ---------------------------------------------------------------------------
// Combinado — SOLO para la nota de voz inicial (transcribir + interpretar).
// Una corrección NO pasa por acá: llama a `interpretarTranscrito` directo
// con el texto combinado (transcrito + correcciones), sin transcribir de
// nuevo -- ver el comentario de `interpretarTranscrito`.
// ---------------------------------------------------------------------------

export type ResultadoPipelineVozInicial =
  | { ok: true; transcrito: string; respuesta: RespuestaModeloInterprete; crudoInterpretacion: unknown }
  | { ok: false; etapa: 'transcripcion' | 'interpretacion'; error: string; transcrito?: string };

/**
 * Etapa (1) + etapa (2) para una nota de voz nueva. Si la transcripción
 * falla, no hay nada que interpretar (`etapa: 'transcripcion'`). Si la
 * transcripción tiene éxito pero la interpretación falla, el transcrito
 * SÍ viaja en el resultado (`etapa: 'interpretacion', transcrito`) -- el
 * llamador puede (y debe) guardar la capa cruda igual: A-10/CA-37 exige que
 * lo narrado no se pierda ni siquiera si el intérprete falla del todo.
 */
export async function ejecutarPipelineVozRonda(opciones: {
  bytes: Uint8Array;
  tipo: string;
  nombreArchivo: string;
  apiKey: string;
  sttModelo?: string;
  interpreteModelo?: string;
  catalogoCausas?: readonly CausaRaiz[];
}): Promise<ResultadoPipelineVozInicial> {
  const transcripcion = await transcribirNotaVoz(
    opciones.bytes,
    opciones.tipo,
    opciones.nombreArchivo,
    opciones.apiKey,
    opciones.sttModelo,
  );
  if (!transcripcion.ok) {
    return { ok: false, etapa: 'transcripcion', error: transcripcion.error };
  }

  const interpretacion = await interpretarTranscrito(
    transcripcion.texto,
    opciones.apiKey,
    opciones.interpreteModelo,
    opciones.catalogoCausas,
  );
  if (!interpretacion.ok) {
    return { ok: false, etapa: 'interpretacion', error: interpretacion.error, transcrito: transcripcion.texto };
  }

  return {
    ok: true,
    transcrito: transcripcion.texto,
    respuesta: interpretacion.respuesta,
    crudoInterpretacion: interpretacion.crudo,
  };
}
