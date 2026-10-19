import {photoBrowserRequest} from './hatoPhotoBrowserServer.ts';
import { perfilAplicacionActivo } from './perfilAplicacionActivo.ts';
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
} from './hato-pesaje-pipeline.ts';

const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo set de escritura del módulo (053), igual que chequeo/foto.

function respuestaError(c: Context, status: 400 | 401 | 403 | 422 | 500 | 502 | 503, error: string) {
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
    .select('id,rol,activo')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(c, 500, `No se pudo verificar el rol del usuario: ${usuarioError.message}`);
  }
  if (!perfilAplicacionActivo(usuario ? [usuario] : [], userData.user.id, [...ROLES_PERMITIDOS])) {
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
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const acceso=await verificarAcceso(c,supabase);if(acceso instanceof Response)return acceso;
 return photoBrowserRequest(c.req.raw,acceso.userId,supabase,async verified=>{
  const apiKey=Deno.env.get('OPENROUTER_API_KEY');if(!apiKey)return {ok:false,status:500,error:'La lectura por foto no está disponible.'};
  return ejecutarPipelinePesajeFoto({supabase,apiKey,anio:verified.original.intent!.year,mes:verified.original.intent!.month,origen:'web',createdBy:acceso.userId,protectedCapture:{id:verified.original.requestKey,prefix:String(verified.original.receipt!.capture&& (verified.original.receipt!.capture as Record<string,unknown>).storage_prefijo),paths:verified.original.paths!},fotos:verified.photos.map(p=>({pagina:p.file.page,nombre:`pagina-${p.file.page}.${p.file.extension}`,tipo:p.file.mime,bytes:p.bytes}))});
 });
}
