// hato-chequeo-foto.ts — Fase 3b de `docs/plan_chequeo_captura_foto.md`:
// `POST /make-server-1ccce916/hato/chequeo/foto`.
//
// GEMELO de `hato-chequeo-preview.ts`. Martha imprime la planilla (Fase 2),
// la diligencia a mano en el corral, le toma una foto por página con el
// celular y la sube. Este endpoint LEE la foto con un modelo de visión y
// devuelve EXACTAMENTE la misma forma de respuesta que la ruta `.xlsx` (más
// los campos de confianza), para que la ventana de revisión y el commit ya
// existentes funcionen sin cambios.
//
// LA REGLA ARQUITECTÓNICA (plan §5, no negociable):
//
//     El OCR reemplaza ÚNICAMENTE la lectura de la grilla, no el pipeline.
//
// `grilla.ts` convierte el `.xlsx` en una matriz de strings crudos por celda.
// Acá el modelo de visión produce ESA MISMA matriz y se la entrega al MISMO
// `normalizarHojas` y al MISMO `construirDiffChequeo`. No hay un segundo
// parser de celdas: si la foto dice `"A 206"`, ese string viaja intacto y lo
// interpreta `parseSX`, igual que si viniera del Excel.
//
// I/O puro en este archivo: multipart, Storage, la llamada HTTP a OpenRouter y
// las consultas a Supabase. Toda la lógica (roster, cotejo del ancla, armado
// de la matriz cruda, reporte de faltantes, prompt y esquema) vive en el
// módulo puro `./importHato/ocrChequeo.ts` (copia GENERADA de
// `src/utils/importHato/ocrChequeo.ts`, ver
// docs/hato/regenerar-copias-importhato.py) y está cubierta por Vitest con
// fixtures de respuestas del modelo.
//
// NUNCA escribe en tablas de dominio. Sí guarda las fotos en Storage: la foto
// ES la capa cruda de esta ruta -- el equivalente del `*_raw` del `.xlsx`.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizarHojas } from './importHato/normalizar.ts';
import { construirDiffChequeo, seleccionarUltimoChequeoPorAnimal } from './importHato/diffChequeo.ts';
import type {
  AnimalHatoActual,
  FilaChequeoVacaHistorico,
} from './importHato/diffChequeo.ts';
import type { FilaChequeoNormalizada } from './importHato/tipos.ts';
import {
  aplicarFechaChequeo,
  construirPromptOcr,
  construirRosterPlanilla,
  esquemaJsonOcr,
  parsearRespuestaModeloOcr,
  procesarLecturaOcr,
  sugerirFechaChequeo,
  type AnimalRosterPlanilla,
  type LecturaOcrPagina,
} from './importHato/ocrChequeo.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';
import { derivarEstadoReproductivo } from './calculos-hato.ts';
import {
  categorizarAnimal,
  construirUmbralesCategoriaHatoDesdeFilas,
  resolverEtapaEfectiva,
  type HatoEstadoActualRow,
} from './hato-aggregation.ts';

// --- Límites de entrada -----------------------------------------------------
// La planilla real son ~2 páginas (35 vacas, carta horizontal, Fase 2). Se
// aceptan hasta 6 fotos para tolerar re-tomas y hojas partidas, y 15MB por
// foto porque un celular moderno saca 4-8MB por imagen sin comprimir.
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
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo set de escritura del módulo (053), igual que el preview.

// --- Modelo de visión -------------------------------------------------------
// Mismo proveedor, misma variable de entorno y mismo modelo que ya usa Esco
// (`chat.tsx`): `google/gemini-3-flash-preview` acepta imágenes. No se
// introduce un cliente nuevo ni un segundo secreto.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_VISION = 'google/gemini-3-flash-preview';
const TIMEOUT_MODELO_MS = 120_000;

// --- Storage ----------------------------------------------------------------
// Bucket privado propio, patrón del bucket `facturas` (migración 039). Sus
// políticas RLS las crea la migración 072 -- si todavía no se aplicó, la
// subida falla y este endpoint lo REPORTA en la respuesta, nunca lo silencia.
const BUCKET_FOTOS = 'chequeos-fotos';

// Nombres lógicos de "archivo"/"hoja" con los que la matriz cruda entra al
// pipeline. Dos restricciones reales, no cosméticas (`clasificarHoja`,
// `grilla.ts`): ninguno puede contener 'LECHE' (mandaría la hoja a
// 'fuera_de_alcance') y la hoja no debe traer mes/año interpretables, para que
// `parseFechaChequeo` NO derive una fecha por su cuenta -- la fecha del
// chequeo la fija un humano (ver más abajo).
const ARCHIVO_LOGICO = 'planilla-chequeo-foto';
const HOJA_LOGICA = 'CHEQUEO FOTO';

function respuestaError(c: Context, status: 400 | 401 | 403 | 500 | 502 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth: idéntica al preview -- JWT Bearer verificado contra Supabase Auth y
// rol en el set de escritura del módulo. Este endpoint no escribe en tablas de
// dominio, pero expone el hato completo fila por fila y gasta tokens de un
// modelo de pago, así que se gatea igual.
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

/** `Uint8Array` -> base64 por bloques. `btoa(String.fromCharCode(...bytes))`
 * de una sola vez revienta la pila con imágenes de varios MB (el spread pasa
 * millones de argumentos), así que se trocea. */
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
  lectura: LecturaOcrPagina;
}
interface LlamadaModeloError {
  ok: false;
  pagina: number;
  error: string;
}

/** Una llamada al modelo POR FOTO, no una con todas las imágenes juntas: si el
 * modelo ve dos páginas a la vez puede mezclar filas entre ellas, que es
 * justamente el row drift que este flujo existe para evitar. Además así el
 * número de página lo pone el servidor y no puede confundirse. */
async function leerFotoConModelo(
  foto: FotoRecibida,
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
                text: `Transcribe la página ${foto.pagina} de la planilla. Devuelve una entrada por cada fila de vaca visible, en el orden en que aparecen.`,
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        // Temperatura 0: transcribir no es una tarea creativa, y cualquier
        // "creatividad" acá es exactamente un dato inventado.
        temperature: 0,
        max_tokens: 12000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'planilla_chequeo', strict: true, schema: esquema },
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

    return { ok: true, lectura: parsearRespuestaModeloOcr(extraerJson(contenido), foto.pagina) };
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
export async function handleHatoChequeoFoto(c: Context): Promise<Response> {
  // Sin API key no se hace NADA -- ni auth, ni consultas, ni Storage. Mismo
  // patrón que `hato-alertas-tick.ts` con su secreto: 503 explícito antes de
  // tocar cualquier cosa, nunca un fallback silencioso.
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

  // --- 1. Leer las fotos subidas -------------------------------------------
  let campoFotos: unknown;
  let fechaSolicitada: string | null = null;
  try {
    // `{ all: true }` para que un campo repetido (`fotos` una vez por página)
    // llegue como arreglo en vez de pisarse.
    const body = await c.req.parseBody({ all: true });
    campoFotos = body['fotos'];
    const fechaCampo = body['fecha'];
    if (typeof fechaCampo === 'string' && fechaCampo.trim() !== '') {
      fechaSolicitada = fechaCampo.trim();
    }
  } catch (err) {
    return respuestaError(
      c,
      400,
      `No se pudo leer el cuerpo multipart: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (fechaSolicitada !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fechaSolicitada)) {
    return respuestaError(c, 400, `La fecha del chequeo debe venir como AAAA-MM-DD ('${fechaSolicitada}' no lo es).`);
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

  // --- 2. Guardar la capa cruda ANTES de leerla ----------------------------
  // La foto es la evidencia contra la cual se audita cualquier duda posterior
  // (plan §5, "capa cruda"). Se guarda primero, para que exista aunque la
  // lectura falle después. Si Storage falla (p. ej. la migración 072 aún no se
  // aplicó y el bucket no existe) NO se aborta la carga -- se sigue y el fallo
  // viaja EXPLÍCITO en la respuesta, nunca en silencio.
  const prefijoStorage = `chequeo-foto/${generadoEn.replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
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

  // --- 3. Config del motor y vocabulario, leídos de la BD ------------------
  const [configRes, torosRes, rosterRes] = await Promise.all([
    supabase.from('hato_config').select('clave, valor'),
    supabase.from('hato_toros').select('nombre').order('nombre'),
    // El MISMO universo que exporta la planilla (D-A del plan): vacas adultas
    // activas de `v_hato_estado_actual`. De acá sale el roster contra el que
    // se cotejan las anclas de cada fila. `select('*')` -- ver más abajo por
    // qué se necesita la fila completa (finding #23) y no solo
    // animal_id/numero/nombre/etapa/estado.
    supabase.from('v_hato_estado_actual').select('*'),
  ]);

  if (configRes.error) return respuestaError(c, 500, `No se pudo leer hato_config: ${configRes.error.message}`);
  if (torosRes.error) return respuestaError(c, 500, `No se pudo leer hato_toros: ${torosRes.error.message}`);
  if (rosterRes.error) {
    return respuestaError(c, 500, `No se pudo leer v_hato_estado_actual: ${rosterRes.error.message}`);
  }

  let config;
  try {
    config = construirHatoConfigDesdeFilas((configRes.data ?? []) as FilaHatoConfig[]);
  } catch (err) {
    return respuestaError(c, 500, err instanceof Error ? err.message : String(err));
  }

  let umbralesCategoria;
  try {
    umbralesCategoria = construirUmbralesCategoriaHatoDesdeFilas((configRes.data ?? []) as FilaHatoConfig[]);
  } catch (err) {
    return respuestaError(c, 500, err instanceof Error ? err.message : String(err));
  }

  // Finding #23 (P2, mantenimiento 2026-08-24): el roster tiene que usar la
  // etapa EFECTIVA (calculada, D-13/migración 092), nunca `hato_animales.etapa`
  // cruda -- una novilla que ya parió es 'vaca' para el resto del sistema
  // (Tablero, Animales, Esco) apenas se registra el parto, aunque nadie haya
  // corregido a mano el campo manual. Antes de este fix esa vaca quedaba
  // fuera del roster, su próxima fila de chequeo (por foto) no cotejaba
  // contra ningún ancla válida y quedaba `no leída` sin error visible.
  // `categorizarAnimal` (`hato-aggregation.ts`) solo devuelve
  // 'hato_ordeno'/'horro' cuando `estado==='activa'` Y la etapa efectiva es
  // 'vaca' (nunca 'ternera'/'novilla'/'toro') -- exactamente la condición
  // que antes escribía `f.etapa === 'vaca' && f.estado === 'activa'`, ahora
  // con la etapa calculada. Mismo criterio que
  // `useAnimalesParaPlanillaChequeo.ts` (frontend) y `hato-chequeo-preview.ts`
  // (endpoint gemelo) -- las tres copias deben coincidir.
  const hoy = generadoEn.slice(0, 10);
  const filasRoster = (rosterRes.data ?? []) as unknown as HatoEstadoActualRow[];
  const animalesRoster: AnimalRosterPlanilla[] = filasRoster
    .filter((fila) => {
      const etapaEfectiva = resolverEtapaEfectiva(fila, umbralesCategoria, hoy);
      const derivado = derivarEstadoReproductivo({ ...fila, etapa: etapaEfectiva.etapa }, config, hoy);
      const categoria = categorizarAnimal(fila, etapaEfectiva.etapa, derivado.estado);
      return categoria === 'hato_ordeno' || categoria === 'horro';
    })
    .map((fila) => ({
      id: fila.animal_id,
      numero: fila.numero,
      nombre: fila.nombre,
    }));
  const roster = construirRosterPlanilla(animalesRoster);

  if (roster.entradas.length === 0) {
    return respuestaError(
      c,
      500,
      'No hay vacas activas con chapeta y nombre en el hato: sin roster no se puede validar el ancla de ninguna fila, y sin esa validación una lectura por foto no es confiable.',
    );
  }

  const nombresToros = ((torosRes.data ?? []) as Array<{ nombre: string | null }>)
    .map((t) => (t.nombre ?? '').trim())
    .filter((n) => n !== '');

  // --- 4. Lectura con el modelo de visión (una llamada por foto) -----------
  const prompt = construirPromptOcr({ toros: nombresToros });
  const esquema = esquemaJsonOcr();
  const resultados = await Promise.all(fotos.map((foto) => leerFotoConModelo(foto, prompt, esquema, apiKey)));

  const lecturas: LecturaOcrPagina[] = [];
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

  // --- 5. Anti-row-drift + matriz cruda (lógica pura) ----------------------
  const ocr = procesarLecturaOcr(lecturas, roster, {
    archivo: ARCHIVO_LOGICO,
    hoja: HOJA_LOGICA,
    // Título vacío a propósito: la fecha del chequeo NO se deriva de la foto.
    titulo: '',
  });

  // --- 6. Normalize: el MISMO motor que la ruta .xlsx ----------------------
  const salida = normalizarHojas([ocr.hoja], generadoEn, config);

  // La fecha del chequeo solo se fija si un HUMANO la mandó (campo `fecha` de
  // la Fase 3a). Si no, queda `null`: la foto no trae título de hoja confiable
  // y usar "hoy" en silencio sería exactamente el dato inventado que este
  // módulo prohíbe. `chequeoFechaSugerida` viaja aparte, marcada como
  // sugerencia, por si el modelo alcanzó a leer un título escrito en el papel.
  const filasNormalizadas: FilaChequeoNormalizada[] = fechaSolicitada
    ? aplicarFechaChequeo(salida.chequeos, fechaSolicitada)
    : salida.chequeos;
  const chequeoFechaSugerida = sugerirFechaChequeo(ocr.titulosLeidos);

  // --- 7. Estado actual del hato para el diff (idéntico al preview) --------
  const numerosEnHoja = [
    ...new Set(filasNormalizadas.map((f) => f.numero).filter((n): n is number => n !== null)),
  ];

  let animales: AnimalHatoActual[] = [];
  if (numerosEnHoja.length > 0) {
    // Finding #23 (P2, mantenimiento 2026-08-24, seguimiento de la primera
    // pasada de este mismo finding): esta consulta leía `hato_animales.etapa`
    // cruda -- mismo defecto ya corregido acá arriba en el paso 3 (roster) y
    // en el paso 4 de `hato-chequeo-preview.ts`. El campo en sí no gobierna
    // ningún filtro en `construirDiffChequeo` (el match es solo por
    // número), pero SÍ viaja en `AnimalHatoActual.etapa` -- ahora sale de
    // `v_hato_estado_actual` (la MISMA vista que ya arma el roster del paso
    // 3) y se calcula con `resolverEtapaEfectiva`, mismo criterio que
    // `useAnimalesParaPlanillaChequeo.ts` (frontend) y
    // `hato-chequeo-preview.ts` (endpoint gemelo, ver su paso 4) -- las tres
    // copias deben coincidir. Sin este fix, una novilla recién parida
    // viajaba como 'novilla' en el diff de la ruta de foto y como 'vaca' en
    // la ruta .xlsx -- la misma vaca descrita distinto según por dónde
    // entrara el chequeo.
    const { data, error } = await supabase
      .from('v_hato_estado_actual')
      .select('*')
      // Migración 066: `numero` solo es único entre animales `activa`. Un
      // chequeo describe el hato VIVO -- mismo filtro que el preview.
      .eq('estado', 'activa')
      .in('numero', numerosEnHoja);
    if (error) return respuestaError(c, 500, `No se pudo leer v_hato_estado_actual: ${error.message}`);
    animales = ((data ?? []) as unknown as HatoEstadoActualRow[]).map((fila) => ({
      id: fila.animal_id,
      numero: fila.numero as number,
      nombre: fila.nombre,
      etapa: resolverEtapaEfectiva(fila, umbralesCategoria, hoy).etapa,
      estado: fila.estado,
    }));
  }

  const animalIds = animales.map((a) => a.id);
  let historico: FilaChequeoVacaHistorico[] = [];
  if (animalIds.length > 0) {
    const { data, error } = await supabase
      .from('hato_chequeo_vacas')
      .select(
        'animal_id, pl, num_partos, fecha_servicio, toro, tipo_servicio, fecha_secar, fecha_probable_parto, estado, created_at, hato_chequeos(fecha)',
      )
      .in('animal_id', animalIds);
    if (error) return respuestaError(c, 500, `No se pudo leer hato_chequeo_vacas: ${error.message}`);
    historico = (data ?? []).map((fila: Record<string, unknown>) => {
      const chequeo = fila.hato_chequeos as { fecha: string } | { fecha: string }[] | null;
      const fecha = Array.isArray(chequeo) ? chequeo[0]?.fecha : chequeo?.fecha;
      return {
        animalId: fila.animal_id as string,
        chequeoFecha: fecha ?? '',
        createdAt: fila.created_at as string,
        pl: fila.pl as number | null,
        numPartos: fila.num_partos as number | null,
        fechaServicio: fila.fecha_servicio as string | null,
        toro: fila.toro as string | null,
        tipoServicio: fila.tipo_servicio as 'monta' | 'inseminacion' | null,
        fechaSecar: fila.fecha_secar as string | null,
        fechaProbableParto: fila.fecha_probable_parto as string | null,
        estado: fila.estado as FilaChequeoVacaHistorico['estado'],
      };
    });
  }

  const ultimosChequeos = seleccionarUltimoChequeoPorAnimal(historico);
  const diffChequeos = construirDiffChequeo(filasNormalizadas, animales, ultimosChequeos);

  const celdasNoConfiables = ocr.filasConfirmadas.reduce((n, f) => n + f.celdasNoConfiables.length, 0);

  // --- 8. Respuesta: misma forma que el preview + confianza ----------------
  return c.json({
    success: true,
    archivo: ARCHIVO_LOGICO,
    generadoEn,
    chequeoFecha: fechaSolicitada,
    chequeoFechaSugerida,
    hojas: salida.hojas,
    diffChequeos,
    filasNormalizadas,
    // La ruta foto solo fotografía la planilla del hato (D-A): no hay hoja
    // TERNERAS ni sub-tablas embebidas. Se devuelven vacías para que la forma
    // de la respuesta sea idéntica a la del preview y la UI no ramifique.
    terneras: salida.terneras,
    subtablas: salida.subtablas,
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
      // Páginas que el modelo no pudo leer: se dice CUÁLES, nunca se carga
      // parcial en silencio (plan §7).
      paginasNoLeidas: erroresLectura,
      filasConfirmadas: ocr.filasConfirmadas,
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
