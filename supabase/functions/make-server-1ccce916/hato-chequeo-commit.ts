import {perfilAplicacionActivo} from './perfilAplicacionActivo.ts';
import {Context} from 'npm:hono';
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {chequeoIntent,chequeoUuid} from './importHato/preparedChequeo.ts';
import {prepareTrustedChequeo} from './importHato/preparedChequeoRpc.ts';
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']); // mismo patrón de escritura que el resto de hato_* (migración 053), igual que preview.

function respuestaError(c: Context, status: 400 | 401 | 403 | 409 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

// ---------------------------------------------------------------------------
// Auth: idéntico a `hato-chequeo-preview.ts` -- ver ese archivo para el
// razonamiento completo. Repetido en vez de importado: cada endpoint de
// hato-* es autocontenido en su propio I/O, mismo patrón que ya usan los
// otros handlers de `src/supabase/functions/server/`.
// ---------------------------------------------------------------------------
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

/** Prepare only: no bull/header/detail/event write and no capture outcome inferred. */
export async function handleHatoChequeoCommit(c:Context):Promise<Response>{
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const acceso=await verificarAcceso(c,supabase);if(acceso instanceof Response)return acceso;
 try{
  const reader=c.req.raw.body?.getReader();if(!reader)return respuestaError(c,400,{error:'Falta la carga original.'});let bytes=0;const chunks:Uint8Array[]=[];
  while(true){const n=await reader.read();if(n.done)break;bytes+=n.value.byteLength;if(bytes>1100000){await reader.cancel();return respuestaError(c,400,{error:'Carga demasiado grande.'});}chunks.push(n.value);}
  const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  if(!body||Object.keys(body).sort().join('|')!=='intent|requestKey'||!chequeoUuid(body.requestKey))return respuestaError(c,400,{error:'Use el intento original de la revisión actual.'});
  const result=await prepareTrustedChequeo(supabase,acceso.userId,body.requestKey,chequeoIntent(body.intent));return c.json({success:true,result});
 }catch{return respuestaError(c,409,{error:'No se pudo preparar. Conserve y verifique el mismo intento original.'});}
}
