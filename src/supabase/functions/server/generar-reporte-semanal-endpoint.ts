// generar-reporte-semanal-endpoint.ts — la puerta HTTP de
// `POST /make-server-1ccce916/reportes/generar-semanal`.
//
// ¿Por qué un archivo aparte y no el gate dentro de
// `generar-reporte-semanal.tsx`? Porque ese módulo se importa DIRECTAMENTE
// desde Vitest (`src/__tests__/generarReporteSemanal.test.ts`) y por eso no
// tiene ni un solo import a nivel de módulo: `npm:hono` y
// `jsr:@supabase/supabase-js` no los puede resolver Node, y agregarlos ahí
// tumba esa suite entera. Mismo criterio de separación que ya usa el repo
// entre lógica pura y su I/O (`acciones-paquete.ts` vs
// `acciones-paquete-io.ts`, `hato-pesaje-pipeline.ts` vs
// `hato-pesaje-commit.ts`): la lógica del reporte queda intacta y
// testeable, la puerta vive acá.
//
// Auth: este endpoint es, de lejos, el más sensible de los que quedaban sin
// gate en esta edge function. No sólo gasta créditos de OpenRouter: recibe
// `instrucciones` del llamante y las concatena al prompt de un modelo que ya
// tiene en contexto 4 semanas de monitoreos/aplicaciones/registros_trabajo
// reales más los últimos resúmenes de llamadas del dueño (Notion), y
// devuelve el HTML generado a quien llamó. Sin gate era un canal de LECTURA
// anónimo que rodeaba TODAS las políticas RLS -- la edge function corre con
// verify_jwt=false y no se puede activar, porque el webhook de Telegram y
// los pg_cron dependen de que siga en false.
//
// Roles permitidos: Administrador y Gerencia -- los mismos que hoy usan la
// pantalla de Reportes (verificado contra `usuarios` en producción: no hay
// ninguna cuenta Verificador ni Monitor activa, así que nadie que pueda
// generar un reporte hoy pierde el acceso).
//
// Mismo patrón `verificarAcceso` que `usuarios.tsx` /
// `hato-chequeo-commit.ts` (Bearer JWT -> auth.getUser -> rol en
// `usuarios`), repetido en vez de importado por el mismo motivo: cada
// endpoint de este árbol es autocontenido en su propio I/O.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generarReporteSemanal } from './generar-reporte-semanal.tsx';

const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']);

function respuestaError(c: Context, status: 400 | 401 | 403 | 500, error: string) {
  return c.json({ success: false, error }, status);
}

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
  if (!usuario || !ROLES_PERMITIDOS.has(usuario.rol as string)) {
    return respuestaError(c, 403, 'Acceso restringido a Administrador o Gerencia.');
  }

  return { userId: userData.user.id };
}

/**
 * Entrada HTTP de la generación del reporte semanal. Recibe el Context
 * completo de Hono (no sólo el body) porque el gate necesita leer el
 * encabezado Authorization -- mismo cambio de forma que hizo `usuarios.tsx`.
 */
export async function handleGenerarReporteSemanal(c: Context): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAcceso(c, supabase);
  if (acceso instanceof Response) return acceso;

  try {
    const body = await c.req.json();
    const resultado = await generarReporteSemanal(body);

    if (!resultado.success) {
      return c.json(resultado, 400);
    }

    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de reporte semanal:', error);
    return respuestaError(c, 500, error.message || 'Error al generar el reporte semanal');
  }
}
