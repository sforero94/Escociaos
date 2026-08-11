// hato-pesaje-foto.ts — S5 de `docs/plan_hato_ronda_agosto_2026.md`: `POST
// /make-server-1ccce916/hato/pesaje/foto`.
//
// GEMELO, adaptado, de `hato-chequeo-foto.ts`. Martha (o Fernando) imprime la
// planilla mensual de pesaje en blanco (`exportarPlanillaPesajePDF.ts`), la
// diligencia a mano semana a semana, le toma foto y la sube. Este endpoint
// LEE la foto con un modelo de visión y devuelve un DIFF por (vaca, semana)
// para revisión -- NUNCA escribe en tablas de dominio, ver `./hato-pesaje-
// commit.ts` para el paso "Aprobar".
//
// DOS DIFERENCIAS DELIBERADAS frente al chequeo (ver cabecera de
// `./importHato/ocrPesaje.ts` para el porqué):
//   - Ancla ÚNICA: el nombre impreso. Esta planilla nunca llevó chapeta
//     (D-1, 2026-08-06 -- la identidad del hato es el nombre).
//   - `anio`/`mes` son REQUERIDOS en la solicitud (no una sugerencia leída
//     del papel, a diferencia de `fecha` en el chequeo): sin ellos no hay
//     forma de resolver a qué fechas corresponde cada columna de semana
//     (`fechasPesajeMensuales`, `calculosHato.ts`, sobre
//     `hato_config.dia_pesaje_semanal`), y sin fecha `hato_pesajes_leche`
//     no tiene dónde escribir (columna NOT NULL). La planilla YA imprime la
//     fecha real de cada semana en el encabezado -- quien sube la foto solo
//     confirma el mes que está mirando, nunca transcribe una fecha.
//
// LA MISMA REGLA ARQUITECTÓNICA que `hato-chequeo-foto.ts` (CLAUDE.md):
// el OCR reemplaza ÚNICAMENTE la lectura de la grilla, nunca decide nada de
// negocio. Los litros se interpretan con `parseValorNumerico`
// (`calculos-hato.ts`), nunca un segundo parser numérico.
//
// I/O puro en este archivo: multipart, Storage, la llamada HTTP a
// OpenRouter y las consultas a Supabase. Toda la lógica (roster, cotejo del
// ancla, diff contra lo ya guardado, prompt y esquema) vive en el módulo
// puro `./importHato/ocrPesaje.ts` (copia GENERADA de
// `src/utils/importHato/ocrPesaje.ts`, ver
// docs/hato/regenerar-copias-importhato.py) y está cubierta por Vitest.
//
// NUNCA escribe en tablas de dominio. Sí guarda las fotos en Storage: la
// foto ES la capa cruda de esta ruta -- el equivalente del `*_raw` del
// chequeo.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fechasPesajeMensuales } from './calculos-hato.ts';
import {
  construirDiffPesaje,
  construirPromptOcrPesaje,
  construirRosterPesaje,
  esCandidataRosterPesaje,
  esquemaJsonOcrPesaje,
  ETAPAS_ROSTER_PESAJE,
  parsearRespuestaModeloOcrPesaje,
  procesarLecturaOcrPesaje,
  SEMANAS_PESAJE,
  type AnimalRosterPesaje,
  type LecturaOcrPesajePagina,
  type PesajeExistente,
  type SemanaPesaje,
} from './importHato/ocrPesaje.ts';

// --- Límites de entrada -----------------------------------------------------
// El hato tiene 68 vacas activas (2026-08-06); a 16 columnas por fila, la
// planilla real ocupa varias páginas (ver `exportarPlanillaPesajePDF.ts`,
// 4 páginas medidas). Mismos límites que `hato-chequeo-foto.ts`.
const MAXIMO_FOTOS = 6;
const TAMANO_MAXIMO_FOTO_BYTES = 15 * 1024 * 1024;
const TIPOS_ACEPTADOS = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo set de escritura del módulo (053), igual que chequeo/foto.

// --- Modelo de visión -------------------------------------------------------
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_VISION = 'google/gemini-3-flash-preview';
const TIMEOUT_MODELO_MS = 120_000;

// --- Storage ----------------------------------------------------------------
// Bucket privado propio (migración 086 -- patrón 072/085: RLS on, políticas
// explícitas Administrador+Gerencia, DELETE Gerencia-only). Nunca se mezcla
// con `chequeos-fotos` (otro dominio) ni con `hato-liquidaciones-fotos`.
const BUCKET_FOTOS = 'hato-pesajes-fotos';

function respuestaError(c: Context, status: 400 | 401 | 403 | 500 | 502 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth: idéntica a `hato-chequeo-foto.ts`.
// ---------------------------------------------------------------------------
async function verificarAcceso(
  c: Context,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string } | Response> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respuestaError(c, 401, 'No autorizado -- falta encabezado Authorization Bearer.');
  }
  const token = authHeader.slice(7);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return respuestaError(c, 401, 'Token inválido o expirado.');
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(c, 500, `No se pudo verificar el rol del usuario: ${usuarioError.message}`);
  }
  if (!usuario || !ROLES_PERMITIDOS.has(usuario.rol)) {
    return respuestaError(
      c,
      403,
      'Acceso restringido a Administrador o Gerencia (mismo permiso de escritura del módulo Hato Lechero).',
    );
  }

  return { userId: userData.user.id };
}

// ---------------------------------------------------------------------------
// Utilidades de I/O -- idénticas a `hato-chequeo-foto.ts` (cada handler es
// autocontenido en su propio I/O, mismo patrón que el resto de `hato-*.ts`).
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

interface FotoRecibida {
  pagina: number;
  nombre: string;
  tipo: string;
  bytes: Uint8Array;
}

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
  foto: FotoRecibida,
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
        model: MODELO_VISION,
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

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleHatoPesajeFoto(c: Context): Promise<Response> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return respuestaError(
      c,
      503,
      'La lectura por foto no está disponible: falta el secreto OPENROUTER_API_KEY en la edge function.',
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAcceso(c, supabase);
  if (acceso instanceof Response) return acceso;

  // --- 1. Leer las fotos + anio/mes (REQUERIDOS, ver cabecera) -------------
  let campoFotos: unknown;
  let anio: number;
  let mes: number;
  try {
    const body = await c.req.parseBody({ all: true });
    campoFotos = body['fotos'];

    const anioTexto = body['anio'];
    const mesTexto = body['mes'];
    anio = typeof anioTexto === 'string' ? parseInt(anioTexto, 10) : NaN;
    mes = typeof mesTexto === 'string' ? parseInt(mesTexto, 10) : NaN;
  } catch (err) {
    return respuestaError(
      c,
      400,
      `No se pudo leer el cuerpo multipart: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    return respuestaError(c, 400, "El campo 'anio' es requerido y debe ser un año válido -- la planilla no trae fecha legible por sí sola.");
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return respuestaError(c, 400, "El campo 'mes' es requerido y debe estar entre 1 y 12.");
  }

  const archivos = (Array.isArray(campoFotos) ? campoFotos : [campoFotos]).filter(
    (v): v is File => v instanceof File,
  );
  if (archivos.length === 0) {
    return respuestaError(c, 400, 'Faltan las fotos de la planilla (multipart/form-data, campo "fotos").');
  }
  if (archivos.length > MAXIMO_FOTOS) {
    return respuestaError(c, 400, `Se aceptan máximo ${MAXIMO_FOTOS} fotos por carga (llegaron ${archivos.length}).`);
  }

  const fotos: FotoRecibida[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    if (archivo.size === 0) {
      return respuestaError(c, 400, `La foto ${i + 1} ('${archivo.name}') está vacía.`);
    }
    if (archivo.size > TAMANO_MAXIMO_FOTO_BYTES) {
      return respuestaError(
        c,
        400,
        `La foto ${i + 1} ('${archivo.name}') supera el tamaño máximo de ${TAMANO_MAXIMO_FOTO_BYTES / 1024 / 1024} MB.`,
      );
    }
    const tipo = (archivo.type || '').toLowerCase();
    if (!TIPOS_ACEPTADOS.has(tipo)) {
      return respuestaError(
        c,
        400,
        `La foto ${i + 1} ('${archivo.name}') es de tipo '${archivo.type || 'desconocido'}'. Formatos aceptados: JPEG, PNG, WEBP, HEIC.`,
      );
    }
    fotos.push({
      pagina: i + 1,
      nombre: archivo.name || `pagina-${i + 1}`,
      tipo: tipo === 'image/jpg' ? 'image/jpeg' : tipo,
      bytes: new Uint8Array(await archivo.arrayBuffer()),
    });
  }

  const generadoEn = new Date().toISOString();

  // --- 2. Guardar la capa cruda ANTES de leerla -----------------------------
  const prefijoStorage = `pesaje-foto/${generadoEn.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const rutasStorage: Array<string | null> = [];
  const erroresStorage: string[] = [];
  for (const foto of fotos) {
    const ruta = `${prefijoStorage}/pagina-${foto.pagina}.${extensionDeTipo(foto.tipo, foto.nombre)}`;
    const { error } = await supabase.storage
      .from(BUCKET_FOTOS)
      .upload(ruta, foto.bytes, { contentType: foto.tipo, upsert: false });
    if (error) {
      rutasStorage.push(null);
      erroresStorage.push(`página ${foto.pagina}: ${error.message}`);
    } else {
      rutasStorage.push(ruta);
    }
  }

  // --- 3. hato_config.dia_pesaje_semanal + roster VIGENTE de la planilla ----
  const [configRes, rosterRes] = await Promise.all([
    supabase.from('hato_config').select('valor').eq('clave', 'dia_pesaje_semanal').maybeSingle(),
    // MISMO universo que exporta la planilla (`esCandidataRosterPesaje`,
    // `importHato/ocrPesaje.ts` -- una sola definición espejada acá y usada
    // igual por `useProduccionHato.fetchRosterPesaje` y por el commit). Se
    // lee de la VISTA y no de `hato_animales` porque el criterio de novillas
    // depende de `ultimo_servicio_fecha`, que solo existe en la vista.
    supabase
      .from('v_hato_estado_actual')
      .select('animal_id, nombre, etapa, estado, ultimo_servicio_fecha')
      .eq('estado', 'activa')
      .in('etapa', ETAPAS_ROSTER_PESAJE),
  ]);

  if (configRes.error) return respuestaError(c, 500, `No se pudo leer hato_config: ${configRes.error.message}`);
  const configValor = configRes.data?.valor as { iso?: unknown } | undefined;
  if (!configValor || typeof configValor.iso !== 'number' || configValor.iso < 1 || configValor.iso > 7) {
    return respuestaError(
      c,
      500,
      'hato_config.dia_pesaje_semanal no está configurado o tiene un valor inválido (migración 064) -- no se puede resolver a qué fecha corresponde cada semana.',
    );
  }
  const diaPesajeIso = configValor.iso;

  if (rosterRes.error) return respuestaError(c, 500, `No se pudo leer v_hato_estado_actual: ${rosterRes.error.message}`);
  const animalesRoster: AnimalRosterPesaje[] = (
    (rosterRes.data ?? []) as Array<{
      animal_id: string;
      nombre: string | null;
      etapa: string | null;
      estado: string | null;
      ultimo_servicio_fecha: string | null;
    }>
  )
    .filter((a) =>
      esCandidataRosterPesaje({ etapa: a.etapa, estado: a.estado, ultimoServicioFecha: a.ultimo_servicio_fecha }),
    )
    .map((a) => ({ id: a.animal_id, nombre: a.nombre ?? '' }));
  const roster = construirRosterPesaje(animalesRoster);

  if (roster.entradas.length === 0) {
    return respuestaError(
      c,
      500,
      'No hay vacas en ordeño activas con nombre en el hato: sin roster no se puede validar el ancla de ninguna fila.',
    );
  }

  const fechasArr = fechasPesajeMensuales(anio, mes, diaPesajeIso);
  const fechasPorSemana = {} as Record<SemanaPesaje, string | null>;
  for (const semana of SEMANAS_PESAJE) fechasPorSemana[semana] = fechasArr[semana - 1] ?? null;

  // --- 4. Lectura con el modelo de visión (una llamada por foto) -----------
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
    return respuestaError(
      c,
      502,
      `No se pudo leer ninguna de las fotos. ${erroresLectura.join(' | ')}${
        rutasStorage.some((r) => r !== null) ? ' Las fotos sí quedaron guardadas.' : ''
      }`,
    );
  }

  // --- 5. Anti-row-drift por nombre (lógica pura) ---------------------------
  const ocr = procesarLecturaOcrPesaje(lecturas, roster);

  // --- 6. Existentes en hato_pesajes_leche, para clasificar el diff --------
  const animalIdsLeidos = ocr.filasConfirmadas.map((f) => f.animalId);
  const fechasValidas = SEMANAS_PESAJE.map((s) => fechasPorSemana[s]).filter((f): f is string => f !== null);
  const existentes = new Map<string, Map<string, PesajeExistente>>();
  if (animalIdsLeidos.length > 0 && fechasValidas.length > 0) {
    const { data, error } = await supabase
      .from('hato_pesajes_leche')
      .select('id, animal_id, fecha, litros_am, litros_pm, litros_total')
      .in('animal_id', animalIdsLeidos)
      .in('fecha', fechasValidas);
    if (error) return respuestaError(c, 500, `No se pudo leer hato_pesajes_leche: ${error.message}`);
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

  // --- 7. Respuesta: NUNCA escribe -------------------------------------------
  return c.json({
    success: true,
    generadoEn,
    anio,
    mes,
    fechasPorSemana,
    diff,
    ocr: {
      modelo: MODELO_VISION,
      fotos: fotos.map((f, i) => ({
        pagina: f.pagina,
        nombre: f.nombre,
        tipo: f.tipo,
        bytes: f.bytes.length,
        rutaStorage: rutasStorage[i],
      })),
      almacenamiento: {
        bucket: BUCKET_FOTOS,
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
  });
}
