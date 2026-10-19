// Milk photo/OCR and text-correction I/O shared by browser and Telegram.
// Domain commits use prepared source-bound milk RPCs with original recovery;
// the old per-cell writer and HTTP commit are retired. Shared capture helpers
// remain available for the other reviewed capture types.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fechasPesajeMensuales } from './calculos-hato.ts';
import {
  cerrarCapturaFoto,
  registrarCapturaFoto,
  type OrigenCapturaFoto,
} from './hato-capturas-foto.ts';
import {
  construirDiffPesaje,
  construirRosterPesaje,
  detectarRechazoLecturaPesaje,
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
  /** Fila de `hato_capturas_foto` (migración 146) que registra ESTE
   * intento. Viaja hasta el commit, que la cierra con el desenlace real.
   * Es `null` cuando el registro falló -- la carga sigue igual, solo se
   * pierde la traza (ver `hato-capturas-foto.ts`). Es un string, no un
   * objeto, justamente para que sobreviva el `JSON.stringify` con que el
   * bot de Telegram persiste este resultado en `conversation.external()`. */
  capturaId: string | null;
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
  | { ok: false; status: 422 | 500 | 502; error: string; uncertain?: boolean };

interface LlamadaModeloOk {
  ok: true;
  lectura: LecturaOcrPesajePagina;
}
interface LlamadaModeloError {
  ok: false;
  uncertain?: boolean;
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
    const reader=respuesta.body?.getReader();if(!reader)throw Error('Respuesta del modelo vacía');const chunks:Uint8Array[]=[];let length=0;
    try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2097152){controller.abort();throw Error('Respuesta del modelo demasiado grande');}chunks.push(part.value);}}finally{reader.releaseLock();}
    const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}const rawText=new TextDecoder().decode(raw);
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = rawText;
      return {
        ok: false,
        pagina: foto.pagina,
        error: `el modelo de visión respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
        uncertain: respuesta.status>=500,
      };
    }

    const resultado = JSON.parse(rawText);
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
    return { ok: false, pagina: foto.pagina, error: mensaje, uncertain: true };
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
  /** Por dónde entró la carga (`hato_capturas_foto.origen`, migración
   * 146). El endpoint HTTP manda `'web'`; el bot de Telegram, `'telegram'`
   * -- los dos usan este MISMO pipeline, así que sin declararlo las dos
   * vías quedarían indistinguibles en el registro. */
  origen?: OrigenCapturaFoto;
  /** Trusted verified upload only: skip Storage and best-effort capture writes. */
  protectedCapture?: {id:string;prefix:string;paths:string[]};
  /** Usuario verificado que sube la foto, para `created_by`. */
  createdBy?: string | null;
}): Promise<ResultadoPipelinePesajeFoto> {
  const { supabase, apiKey, fotos, anio, mes } = params;
  const origen: OrigenCapturaFoto = params.origen ?? 'web';
  const createdBy = params.createdBy ?? null;
  const generadoEn = new Date().toISOString();

  // --- 1. Guardar la capa cruda ANTES de leerla -----------------------------
  const prefijoStorage = params.protectedCapture?.prefix ?? `pesaje-foto/${generadoEn.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const rutasStorage: Array<string | null> = [];
  const erroresStorage: string[] = [];
  if(params.protectedCapture){
    if(params.protectedCapture.paths.length!==fotos.length)throw Error('Original photo pages changed');
    rutasStorage.push(...params.protectedCapture.paths);
  }else for (const foto of fotos) {
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

  // --- 1.b Registrar el INTENTO (hallazgo ESCO-76, migración 146) ----------
  // Va acá y no más abajo a propósito: la foto ya está guardada y el modelo
  // TODAVÍA no corrió, así que un fallo del modelo -- el caso que motivó el
  // hallazgo -- queda registrado igual. Si este registro falla, `capturaId`
  // es `null` y el pipeline sigue exactamente como antes.
  const capturaId = params.protectedCapture?.id ?? await registrarCapturaFoto({
    supabase,
    tipo: 'pesaje',
    origen,
    createdBy,
    storage: { bucket: BUCKET_FOTOS_PESAJE, prefijo: prefijoStorage, rutas: rutasStorage, errores: erroresStorage },
    fotosRecibidas: fotos.length,
    modelo: MODELO_VISION_PESAJE,
    anio,
    mes,
  });

  /** Cierra la captura con un desenlace de fallo y devuelve el error tal
   * cual, para que cada `return` de error siga siendo una sola línea. */
  const fallar = async (
    status: 422 | 500 | 502,
    error: string,
    desenlace: 'ocr_fallo' | 'error',
  ): Promise<ResultadoPipelinePesajeFoto> => {
    if(!params.protectedCapture)await cerrarCapturaFoto({ supabase, capturaId, desenlace, detalle: error });
    return { ok: false, status, error };
  };

  // --- 2. hato_config.dia_pesaje_semanal + roster VIGENTE de la planilla ----
  const [configRes, rosterRes] = await Promise.all([
    supabase.from('hato_config').select('valor').eq('clave', 'dia_pesaje_semanal').maybeSingle(),
    supabase.from('hato_animales').select('id, nombre, etapa, estado').eq('estado', 'activa').in('etapa', ETAPAS_ROSTER_PESAJE),
  ]);

  if (configRes.error) return await fallar(500, `No se pudo leer hato_config: ${configRes.error.message}`, 'error');
  const configValor = configRes.data?.valor as { iso?: unknown } | undefined;
  if (!configValor || typeof configValor.iso !== 'number' || configValor.iso < 1 || configValor.iso > 7) {
    return await fallar(
      500,
      'hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064) -- no se puede resolver a qué fecha corresponde cada semana.',
      'error',
    );
  }
  const diaPesajeIso = configValor.iso;

  if (rosterRes.error) return await fallar(500, `No se pudo leer hato_animales: ${rosterRes.error.message}`, 'error');
  const animalesRoster: AnimalRosterPesaje[] = (
    (rosterRes.data ?? []) as Array<{ id: string; nombre: string | null; etapa: string | null; estado: string | null }>
  )
    .filter((a) => esCandidataRosterPesaje({ etapa: a.etapa, estado: a.estado }))
    .map((a) => ({ id: a.id, nombre: a.nombre ?? '' }));
  const roster = construirRosterPesaje(animalesRoster);

  if (roster.entradas.length === 0) {
    return await fallar(
      500,
      'No hay vacas en ordeño activas con nombre en el hato: sin roster no se puede validar el ancla de ninguna fila.',
      'error',
    );
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

  if(params.protectedCapture&&resultados.some(r=>!r.ok&&r.uncertain))return {ok:false,status:502,error:'Resultado de lectura incierto. Conserve y consulte la carga original.',uncertain:true};
  const lecturas: LecturaOcrPesajePagina[] = [];
  const erroresLectura: string[] = [];
  for (const resultado of resultados) {
    if (resultado.ok) lecturas.push(resultado.lectura);
    else erroresLectura.push(`página ${resultado.pagina}: ${resultado.error}`);
  }

  if (lecturas.length === 0) {
    return await fallar(
      502,
      `No se pudo leer ninguna de las fotos. ${erroresLectura.join(' | ')}${
        rutasStorage.some((r) => r !== null) ? ' Las fotos sí quedaron guardadas.' : ''
      }`,
      'ocr_fallo',
    );
  }

  // --- 4. Anti-row-drift por nombre (lógica pura) ---------------------------
  const ocr = procesarLecturaOcrPesaje(lecturas, roster);

  // --- 4.b Finding #40: RECHAZAR en vez de aceptar cuando ninguna fila de
  //     NINGUNA foto ancló contra el roster -- ver `detectarRechazoLecturaPesaje`
  //     (`ocrPesaje.ts`) para la regla completa. Antes de este chequeo el
  //     pipeline seguía de largo con `filasConfirmadas` vacío, devolvía
  //     `success: true` con un diff vacío, y la foto quedaba guardada en
  //     Storage sin ninguna señal accionable -- exactamente lo que pasó con
  //     la liquidación de El Pomar subida por error a esta ruta el
  //     2026-08-19. La foto SIGUE guardándose (paso 1, arriba) -- este
  //     rechazo nunca la descarta, solo evita fingir que hubo una lectura útil. ---
  const rechazo = detectarRechazoLecturaPesaje(ocr);
  if (rechazo) {
    return await fallar(
      422,
      `${rechazo.detalle}${rutasStorage.some((r) => r !== null) ? ' Las fotos sí quedaron guardadas.' : ''}`,
      'ocr_fallo',
    );
  }

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
    if (error) return await fallar(500, `No se pudo leer hato_pesajes_leche: ${error.message}`, 'error');
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

  // Celdas con algún litraje leído. Se guarda AHORA, con la fila todavía
  // `pendiente`: es el número que separa "el OCR no leyó nada" de "leyó y
  // nadie aprobó", las dos causas que hoy se ven iguales. Un 0 acá es un
  // cero MEDIDO, no un hueco -- por eso la columna es NULL hasta este punto.
  const celdasLeidasOcr = diff.filter((c) => c.litrosAm !== null || c.litrosPm !== null).length;
  if(!params.protectedCapture)await cerrarCapturaFoto({ supabase, capturaId, desenlace: 'pendiente', celdasLeidasOcr });

  return {
    ok: true,
    resultado: {
      generadoEn,
      anio,
      mes,
      capturaId,
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
// Legacy commit retirement.
// ---------------------------------------------------------------------------

// Legacy per-cell commit removed after browser/native prepared caller validation.
