import { perfilAplicacionActivo } from './perfilAplicacionActivo.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { parseCsvProducts, CsvValidationError, validateCsvReceipt, validateCsvStatus } from './csv-product-import.ts';
import { Context } from 'npm:hono';

// ---------------------------------------------------------------------------
// Auth: la importación masiva usa un RPC atómico bajo el JWT humano. Mismo permiso de escritura que la RLS de
// esa tabla (política "Gerencia acceso total" + "Administrador escritura
// productos"), y mismo patrón `verificarAcceso` que `usuarios.tsx` /
// `hato-chequeo-commit.ts` (Bearer JWT -> auth.getUser -> rol en
// `usuarios`), repetido en vez de importado por el mismo motivo: cada
// endpoint de este árbol es autocontenido en su propio I/O.
//
// Antes de este gate la ruta corría sin leer el encabezado Authorization:
// cualquiera en internet que supiera la URL podía insertar filas
// arbitrarias en el catálogo de productos (la edge function corre con
// verify_jwt=false, que no se puede activar porque el webhook de Telegram y
// los pg_cron dependen de que siga en false).
// ---------------------------------------------------------------------------
const ROLES_PERMITIDOS = ['Administrador', 'Gerencia'];

function respuestaError(c: Context, status: 400 | 401 | 403 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

async function verificarAcceso(
  c: Context,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string; token: string } | Response> {
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

  return { userId: userData.user.id, token };
}

// Only the verified human JWT reaches the write RPC. The service client above
// performs identity/profile reads; there is no service-role table-write fallback.
export async function handleImportarProductos(c: Context): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const apiKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const acceso = await verificarAcceso(c, createClient(url, apiKey));
  if (acceso instanceof Response) return acceso;
  try {
    const body = await c.req.json();
    if (!body || typeof body.csvData !== 'string' || !body.csvData.trim())
      return respuestaError(c,400,{error:'No se proporcionó datos CSV'});
    const payload = parseCsvProducts(body.csvData);
    if (typeof body.requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestKey)
      || !['import','resolve'].includes(body.action)) return respuestaError(c,400,{error:'Identidad de importación inválida'});
    const human = createClient(url,apiKey,{
      global:{headers:{Authorization:`Bearer ${acceso.token}`}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data,error} = await human.rpc(body.action === 'import' ? 'fn_csv_product_import' : 'fn_csv_product_import_status',
      {p_request_key:body.requestKey,p_payload:payload});
    if (error) return respuestaError(c,500,{error:error.message});
    if (body.action === 'resolve') {
      await validateCsvStatus(data,acceso.userId,body.requestKey,payload);
      return c.json(data);
    }
    return c.json(await validateCsvReceipt(data,acceso.userId,body.requestKey,payload));
  } catch (error: unknown) {
    if(error instanceof CsvValidationError) return c.json({success:false,message:error.message,errores:error.errores,total:error.total,importados:0},400);
    return respuestaError(c,500,{error:error instanceof Error ? error.message : 'Error al procesar la solicitud'});
  }
}
