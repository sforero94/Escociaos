// hato-produccion-quincena-foto.ts — S4 de
// `docs/plan_hato_ronda_agosto_2026.md` (D-8): `POST
// /make-server-1ccce916/hato/produccion/quincena/foto`.
//
// GEMELO, en miniatura, de `hato-chequeo-foto.ts`. Martha recibe (o
// fotografía) la liquidación quincenal de El Pomar y la sube. Este endpoint
// LEE el documento con un modelo de visión y devuelve los campos
// interpretados para que el formulario de Producción los revise/corrija
// antes de guardar -- NUNCA escribe en tablas de dominio, igual que
// `hato/chequeo/preview`. El guardado real sigue pasando por el RPC
// `fn_hato_guardar_quincena_venta` (migración 085), que calcula ICA/neto a
// partir del bruto que este endpoint (o el usuario a mano) puso en el
// formulario.
//
// LA MISMA REGLA ARQUITECTÓNICA que hato-chequeo-foto.ts (plan §5, no
// negociable):
//
//     El OCR reemplaza ÚNICAMENTE la lectura del documento, nunca decide
//     nada de negocio.
//
// El modelo transcribe 8 campos; `hato-liquidacion-pomar.ts` (copia GENERADA
// de `src/utils/hatoLiquidacionPomar.ts`) los interpreta con parsers
// deterministas. No hay un segundo parser: si el modelo lee "$ 2.000,00",
// ese string viaja intacto y lo interpreta `parseMonedaColombiana`.
//
// A diferencia del chequeo (grilla de ~35 filas, roster, anti-row-drift),
// la liquidación es UN documento de una fila -- no hace falta roster ni
// cotejo de ancla. La defensa que sí aplica, igual que en el chequeo, es
// "sin dato, nunca 0": un campo `baja`/`ilegible` entra vacío + una marca,
// jamás una adivinanza; un campo que dos fotos leen distinto tampoco se
// adjudica solo (`combinarLecturasLiquidacion`).
//
// I/O puro en este archivo: multipart, Storage, la llamada HTTP a
// OpenRouter. Toda la lógica (parsers, prompt, esquema, combinación
// multi-foto, coherencia) vive en el módulo puro
// `src/utils/hatoLiquidacionPomar.ts`, cubierta por Vitest.
//
// NUNCA escribe en tablas de dominio. Sí guarda las fotos en Storage: la
// foto ES la capa cruda de esta ruta.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CAMPOS_OCR_LIQUIDACION,
  combinarLecturasLiquidacion,
  construirPromptOcrLiquidacion,
  esquemaJsonOcrLiquidacion,
  parsearRespuestaModeloOcrLiquidacion,
  validarCoherenciaLiquidacion,
  type LecturaOcrLiquidacion,
} from './hato-liquidacion-pomar.ts';

// --- Límites de entrada -----------------------------------------------------
// El documento es UNA página. Se aceptan hasta 3 archivos para tolerar
// re-tomas (p. ej. una del título recortada y otra de la tabla), y 15MB por
// archivo -- mismo límite que hato-chequeo-foto.ts. Martha en la mayoría de
// los casos recibe el PDF de El Pomar directo (le es más fácil subirlo que
// fotografiarlo), así que además de imagen se acepta PDF -- el mismo
// documento, dos medios.
const MAXIMO_FOTOS = 3;
const TAMANO_MAXIMO_FOTO_BYTES = 15 * 1024 * 1024;
const TIPOS_ACEPTADOS = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo set de escritura del módulo (053), igual que chequeo/foto.

// --- Modelo de visión -------------------------------------------------------
// Mismo proveedor, misma variable de entorno y mismo modelo que Esco y la
// ruta de chequeo por foto. No se introduce un cliente nuevo ni un segundo
// secreto.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_VISION = 'google/gemini-3-flash-preview';
const TIMEOUT_MODELO_MS = 60_000;

// --- Storage ----------------------------------------------------------------
// Bucket privado propio (migración 085), mismo patrón que `chequeos-fotos`
// (072): la foto de la liquidación es un documento financiero, no se mezcla
// con el bucket del chequeo veterinario (otro dominio).
const BUCKET_FOTOS = 'hato-liquidaciones-fotos';

function respuestaError(c: Context, status: 400 | 401 | 403 | 500 | 502 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth: idéntica a chequeo/foto -- JWT Bearer verificado contra Supabase Auth
// y rol en el set de escritura del módulo.
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
// Utilidades de I/O
// ---------------------------------------------------------------------------

/** `Uint8Array` -> base64 por bloques -- `btoa(String.fromCharCode(...bytes))`
 * de una sola vez revienta la pila con imágenes de varios MB. */
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

/** Extrae el JSON de la respuesta del modelo tolerando que lo envuelva en un
 * bloque markdown pese al `response_format` (pasa de vez en cuando). */
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
  lectura: LecturaOcrLiquidacion;
}
interface LlamadaModeloError {
  ok: false;
  pagina: number;
  error: string;
}

/** Una llamada al modelo POR ARCHIVO -- mismo criterio que chequeo/foto: si el
 * documento viene en 2-3 archivos (título y tabla separados, o re-tomas), cada
 * uno se lee independientemente y `combinarLecturasLiquidacion` decide qué
 * hacer si divergen.
 *
 * Imagen y PDF viajan con formatos distintos según la doc de OpenRouter
 * (https://openrouter.ai/docs/features/multimodal/pdfs): la imagen sigue
 * como `image_url` con un data URL, sin cambios. El PDF va como una parte
 * `file` con `file_data` en base64 y el body de la request agrega
 * `plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }]` -- `native`
 * porque Gemini es multimodal y procesa el PDF directo (se cobra como
 * tokens de entrada, sin costo de parseo adicional). El plugin sólo se
 * agrega en la llamada del archivo que es PDF; para imágenes no viaja. */
async function leerFotoConModelo(
  foto: FotoRecibida,
  prompt: string,
  esquema: Record<string, unknown>,
  apiKey: string,
): Promise<LlamadaModeloOk | LlamadaModeloError> {
  const esPdf = foto.tipo === 'application/pdf';
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
                text: `Transcribe el archivo ${foto.pagina} del documento de liquidación.`,
              },
              esPdf
                ? { type: 'file', file: { filename: foto.nombre, file_data: dataUrl } }
                : { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        // Temperatura 0: transcribir no es una tarea creativa.
        temperature: 0,
        max_tokens: 2000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'liquidacion_pomar', strict: true, schema: esquema },
        },
        ...(esPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] } : {}),
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

    return { ok: true, lectura: parsearRespuestaModeloOcrLiquidacion(extraerJson(contenido), foto.pagina) };
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
export async function handleHatoProduccionQuincenaFoto(c: Context): Promise<Response> {
  // Sin API key no se hace NADA -- ni auth, ni Storage. Mismo patrón que
  // hato-chequeo-foto.ts / hato-alertas-tick.ts.
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

  // --- 1. Leer los archivos subidos -----------------------------------------
  // El frontend nuevo manda el campo "archivos" (ahora acepta imagen o PDF
  // por igual); se cae a "fotos" para un bundle viejo que pueda quedar
  // cacheado en el navegador de Martha durante el despliegue. Contrato
  // acordado con el agente de frontend -- no cambiar.
  let campoArchivos: unknown;
  try {
    const body = await c.req.parseBody({ all: true });
    campoArchivos = body['archivos'] ?? body['fotos'];
  } catch (err) {
    return respuestaError(
      c,
      400,
      `No se pudo leer el cuerpo multipart: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const archivos = (Array.isArray(campoArchivos) ? campoArchivos : [campoArchivos]).filter(
    (v): v is File => v instanceof File,
  );
  if (archivos.length === 0) {
    return respuestaError(c, 400, 'Falta el archivo de la liquidación (multipart/form-data, campo "archivos").');
  }
  if (archivos.length > MAXIMO_FOTOS) {
    return respuestaError(c, 400, `Se aceptan máximo ${MAXIMO_FOTOS} archivos por carga (llegaron ${archivos.length}).`);
  }

  const fotos: FotoRecibida[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    if (archivo.size === 0) {
      return respuestaError(c, 400, `El archivo ${i + 1} ('${archivo.name}') está vacío.`);
    }
    if (archivo.size > TAMANO_MAXIMO_FOTO_BYTES) {
      return respuestaError(
        c,
        400,
        `El archivo ${i + 1} ('${archivo.name}') supera el tamaño máximo de ${TAMANO_MAXIMO_FOTO_BYTES / 1024 / 1024} MB.`,
      );
    }
    const tipo = (archivo.type || '').toLowerCase();
    if (!TIPOS_ACEPTADOS.has(tipo)) {
      return respuestaError(
        c,
        400,
        `El archivo ${i + 1} ('${archivo.name}') es de tipo '${archivo.type || 'desconocido'}'. Formatos aceptados: JPEG, PNG, WEBP, HEIC, PDF.`,
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

  // --- 2. Guardar la capa cruda ANTES de leerla ----------------------------
  // La foto es la evidencia contra la cual se audita cualquier duda
  // posterior. Se guarda primero, para que exista aunque la lectura falle
  // después. Si Storage falla (p. ej. la migración 085 aún no se aplicó y el
  // bucket no existe) NO se aborta la carga -- se sigue y el fallo viaja
  // EXPLÍCITO en la respuesta, nunca en silencio.
  const prefijoStorage = `liquidacion/${generadoEn.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
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

  // --- 3. Lectura con el modelo de visión (una llamada por foto) -----------
  const prompt = construirPromptOcrLiquidacion();
  const esquema = esquemaJsonOcrLiquidacion();
  const resultados = await Promise.all(fotos.map((foto) => leerFotoConModelo(foto, prompt, esquema, apiKey)));

  const lecturas: LecturaOcrLiquidacion[] = [];
  const erroresLectura: string[] = [];
  for (const resultado of resultados) {
    if (resultado.ok) lecturas.push(resultado.lectura);
    else erroresLectura.push(`página ${resultado.pagina}: ${resultado.error}`);
  }

  if (lecturas.length === 0) {
    return respuestaError(
      c,
      502,
      `No se pudo leer ninguno de los archivos. ${erroresLectura.join(' | ')}${
        rutasStorage.some((r) => r !== null) ? ' El archivo sí quedó guardado.' : ''
      }`,
    );
  }

  // --- 4. Combinar + interpretar (lógica pura) ------------------------------
  const { resultado: documento, interpretadas } = combinarLecturasLiquidacion(lecturas);
  const avisoCoherencia = validarCoherenciaLiquidacion(documento);
  const advertencias = avisoCoherencia ? [...documento.advertencias, avisoCoherencia] : documento.advertencias;

  // --- 5. Respuesta: campos interpretados + reporte de calidad del OCR -----
  // NUNCA escribe en tablas de dominio -- el guardado real pasa por
  // fn_hato_guardar_quincena_venta (migración 085), desde el formulario, con
  // los valores que el usuario confirmó/corrigió acá.
  return c.json({
    success: true,
    generadoEn,
    documento: {
      proveedor: documento.proveedor,
      nit: documento.nit,
      mes: documento.mes,
      mesNombre: documento.mesNombre,
      quincena: documento.quincena,
      periodoInicio: documento.periodoInicio,
      periodoFin: documento.periodoFin,
      precioPromedioLitro: documento.precioPromedioLitro,
      cantidadLitros: documento.cantidadLitros,
      subtotal: documento.subtotal,
      camposNoConfiables: documento.camposNoConfiables,
    },
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
      lecturasPorFoto: interpretadas,
      camposNoConfiables: documento.camposNoConfiables,
      advertencias,
      resumen: {
        fotosRecibidas: fotos.length,
        fotosLeidas: lecturas.length,
        camposNoConfiables: documento.camposNoConfiables.length,
        campos: CAMPOS_OCR_LIQUIDACION.length,
      },
    },
  });
}
