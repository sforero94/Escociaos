import { perfilAplicacionActivo } from './perfilAplicacionActivo.ts';
import { Context } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Auth: cambiar `productos.activo` es una escritura sobre el catálogo que
// alimenta los selectores de Aplicaciones e Inventario para TODOS los
// usuarios -- el mismo permiso de escritura que la RLS de `productos`
// (política "Gerencia acceso total" + "Administrador actualiza productos").
// Mismo patrón `verificarAcceso` que `usuarios.tsx` y
// `hato-chequeo-commit.ts` (Bearer JWT -> auth.getUser -> rol en
// `usuarios`), repetido en vez de importado por el mismo motivo: cada
// endpoint de este árbol es autocontenido en su propio I/O.
//
// Antes de este gate la ruta corría con el service role y SIN leer el
// encabezado Authorization: cualquiera en internet que supiera la URL podía
// ocultar productos del inventario (la edge function corre con
// verify_jwt=false, que no se puede activar porque el webhook de Telegram y
// los pg_cron dependen de que siga en false).
// ---------------------------------------------------------------------------
const ROLES_PERMITIDOS = ['Administrador', 'Gerencia'];

function respuestaError(c: Context, status: 401 | 403 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

async function verificarAcceso(
  c: Context,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string; token:string } | Response> {
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
  if (!perfilAplicacionActivo(usuario ? [usuario] : [], userData.user.id, ROLES_PERMITIDOS)) {
    return respuestaError(c, 403, {
      error: 'Acceso restringido a Administrador o Gerencia (mismo permiso de escritura que la RLS de productos).',
    });
  }

  return { userId: userData.user.id,token };
}

const canonical=(value:unknown)=>JSON.stringify(value,(_k,item:unknown)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function validateReceipt(data:unknown,actor:string,key:string,payload:Record<string,unknown>) {
 const fail=():never=>{throw new Error('Activación no verificable. Conserve el intento pendiente.');};
 const original=payload.original as Record<string,unknown>;const fields=payload.fields as {activo:boolean};
 if(!object(data)||Object.keys(data).sort().join('|')!=='actor|audit|movement_id|opening|payload|product|request_key'||data.actor!==actor||data.request_key!==key||canonical(data.payload)!==canonical(payload)
  ||data.movement_id!==null||data.opening!==null||!object(data.product)||data.product.id!==payload.product_id||data.product.activo!==fields.activo||data.product.updated_by!==actor
  ||Object.keys(data.product).sort().join('|')!==Object.keys(original).sort().join('|')||typeof data.product.updated_at!=='string'||!Number.isFinite(Date.parse(data.product.updated_at)))return fail();
 const product=data.product;
 if(Object.keys(original).some(k=>!['activo','updated_at','updated_by'].includes(k)&&canonical(product[k])!==canonical(original[k])))return fail();
 if(!object(data.audit)||Object.keys(data.audit).sort().join('|')!=='actor|after_row|before_row|created_at|mode|origin|product_id|request_key'||data.audit.actor!==actor||data.audit.request_key!==key
  ||data.audit.product_id!==payload.product_id||data.audit.mode!=='activation'||data.audit.origin!=='catalog_rpc'||data.audit.created_at!==product.updated_at
  ||canonical(data.audit.before_row)!==canonical(original)||canonical(data.audit.after_row)!==canonical(product))return fail();
 return data;
}
// Service role performs Auth/profile reads only; all mutation/status RPCs use human JWT.
export async function toggleProductoActivo(c: Context): Promise<Response> {
 const url=Deno.env.get('SUPABASE_URL')!;const apiKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const acceso=await verificarAcceso(c,createClient(url,apiKey));if(acceso instanceof Response)return acceso;
 try {
  const body=await c.req.json();
  if(!object(body)||Object.keys(body).sort().join('|')!=='action|activo|original|productoId|requestKey'||!uuid(body.productoId)||!uuid(body.requestKey)||typeof body.activo!=='boolean'
   ||!['post','resolve'].includes(String(body.action))||!object(body.original)||body.original.id!==body.productoId||![true,false,null].includes(body.original.activo as boolean|null))
   return c.json({success:false,error:'La activación requiere el producto original completo, clave estable, acción y estado booleano.'},400);
  const payload={mode:'activation',product_id:body.productoId,original:body.original,fields:{activo:body.activo}};
  const human=createClient(url,apiKey,{global:{headers:{Authorization:`Bearer ${acceso.token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await human.rpc(body.action==='post'?'fn_product_catalog_post':'fn_product_catalog_status',{p_request_key:body.requestKey,p_payload:payload,p_expected_owner:acceso.userId});
  if(error)return respuestaError(c,500,{error:error.message});
  if(body.action==='resolve') {
   if(!object(data)||Object.keys(data).sort().join('|')!=='actor|committed|payload|request_key|result'||data.actor!==acceso.userId||data.request_key!==body.requestKey
    ||canonical(data.payload)!==canonical(payload)||typeof data.committed!=='boolean'||(!data.committed&&data.result!==null))throw new Error('Resolución de activación no verificable. Conserve el intento pendiente.');
   if(data.committed)validateReceipt(data.result,acceso.userId,body.requestKey,payload);
   return c.json(data);
  }
  return c.json(validateReceipt(data,acceso.userId,body.requestKey,payload));
 }catch(error:unknown){return respuestaError(c,500,{error:error instanceof Error?error.message:'Error al cambiar el estado del producto'});}
}
