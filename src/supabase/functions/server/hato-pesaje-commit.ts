// Retired legacy milk commit. Current callers use prepared source-bound RPCs.
// Keep the route explicit: old drafts must not be translated or reposted.
import type {Context} from 'npm:hono';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {perfilAplicacionActivo} from './perfilAplicacionActivo.ts';

const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo patrón de escritura que el resto de hato_* (migración 053).

function respuestaError(c: Context, status: 400 | 401 | 403 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

async function verificarAcceso(
  c: Context,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string } | Response> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respuestaError(c, 401, { error: 'No autorizado -- falta encabezado Authorization Bearer.' });
  }
  const token = authHeader.slice(7);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return respuestaError(c, 401, { error: 'Token inválido o expirado.' });
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('id,rol,activo')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(c, 500, { error: `No se pudo verificar el rol del usuario: ${usuarioError.message}` });
  }
  if (!perfilAplicacionActivo(usuario ? [usuario] : [], userData.user.id, [...ROLES_PERMITIDOS])) {
    return respuestaError(c, 403, {
      error: 'Acceso restringido a Administrador o Gerencia (mismo permiso de escritura del módulo Hato Lechero).',
    });
  }

  return { userId: userData.user.id };
}

export async function handleHatoPesajeCommit(c:Context):Promise<Response>{
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const acceso=await verificarAcceso(c,supabase);if(acceso instanceof Response)return acceso;
 return c.json({success:false,code:'MILK_PREPARED_CONFIRMATION_REQUIRED',error:'Este envío antiguo ya no está disponible. Abre Pesaje y revisa la confirmación protegida. Si un envío anterior quedó sin respuesta, recupera su acción original antes de intentar otro.'},410);
}
