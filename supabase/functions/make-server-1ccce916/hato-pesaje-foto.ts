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
// I/O puro en este archivo: multipart y la traducción del resultado del
// pipeline a una respuesta HTTP. TODA la orquestación (Storage, modelo de
// visión, roster, diff) vive en `./hato-pesaje-pipeline.ts`
// (`ejecutarPipelinePesajeFoto`, N11 de
// `docs/plan_hato_telegram_estados_agosto_2026.md`) -- extraída para que el
// bot de Telegram (`telegram/conversations/pesajeLeche.ts`) use EXACTAMENTE
// el mismo pipeline, sin cambiar el comportamiento observable de este
// endpoint. La lógica pura (roster, cotejo del ancla, diff, prompt y
// esquema) vive en `./importHato/ocrPesaje.ts` (copia GENERADA de
// `src/utils/importHato/ocrPesaje.ts`) y está cubierta por Vitest.
//
// NUNCA escribe en tablas de dominio. Sí guarda las fotos en Storage (dentro
// del pipeline): la foto ES la capa cruda de esta ruta -- el equivalente del
// `*_raw` del chequeo.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  ejecutarPipelinePesajeFoto,
  MAXIMO_FOTOS_PESAJE,
  TAMANO_MAXIMO_FOTO_PESAJE_BYTES,
  TIPOS_ACEPTADOS_FOTO_PESAJE,
  type FotoPesajeEntrada,
} from './hato-pesaje-pipeline.ts';

const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo set de escritura del módulo (053), igual que chequeo/foto.

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
  if (archivos.length > MAXIMO_FOTOS_PESAJE) {
    return respuestaError(c, 400, `Se aceptan máximo ${MAXIMO_FOTOS_PESAJE} fotos por carga (llegaron ${archivos.length}).`);
  }

  const fotos: FotoPesajeEntrada[] = [];
  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    if (archivo.size === 0) {
      return respuestaError(c, 400, `La foto ${i + 1} ('${archivo.name}') está vacía.`);
    }
    if (archivo.size > TAMANO_MAXIMO_FOTO_PESAJE_BYTES) {
      return respuestaError(
        c,
        400,
        `La foto ${i + 1} ('${archivo.name}') supera el tamaño máximo de ${TAMANO_MAXIMO_FOTO_PESAJE_BYTES / 1024 / 1024} MB.`,
      );
    }
    const tipo = (archivo.type || '').toLowerCase();
    if (!TIPOS_ACEPTADOS_FOTO_PESAJE.has(tipo)) {
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

  // --- 2. Pipeline compartido con el bot de Telegram (N11) ------------------
  const resultado = await ejecutarPipelinePesajeFoto({ supabase, apiKey, fotos, anio, mes });
  if (!resultado.ok) {
    return respuestaError(c, resultado.status, resultado.error);
  }

  // --- 3. Respuesta: NUNCA escribe -------------------------------------------
  return c.json({
    success: true,
    generadoEn: resultado.resultado.generadoEn,
    anio: resultado.resultado.anio,
    mes: resultado.resultado.mes,
    fechasPorSemana: resultado.resultado.fechasPorSemana,
    diff: resultado.resultado.diff,
    ocr: resultado.resultado.ocr,
  });
}
