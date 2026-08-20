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
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']);

function respuestaError(c: Context, status: 401 | 403 | 500, body: Record<string, unknown>) {
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
    .select('rol')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(c, 500, { error: `No se pudo verificar el rol del usuario: ${usuarioError.message}` });
  }
  if (!usuario || !ROLES_PERMITIDOS.has(usuario.rol as string)) {
    return respuestaError(c, 403, {
      error: 'Acceso restringido a Administrador o Gerencia (mismo permiso de escritura que la RLS de productos).',
    });
  }

  return { userId: userData.user.id };
}

/**
 * Alternar el estado activo de un producto.
 *
 * Recibe el Context completo de Hono (no sólo el body) porque el gate
 * necesita leer el encabezado Authorization -- mismo cambio de firma que
 * hizo `usuarios.tsx`.
 */
export async function toggleProductoActivo(c: Context): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const acceso = await verificarAcceso(c, supabase);
  if (acceso instanceof Response) return acceso;

  try {
    const body = await c.req.json();
    const { productoId, activo } = body ?? {};

    if (!productoId) {
      return c.json({ success: false, error: 'El ID del producto es requerido' }, 400);
    }

    // Actualizar el estado activo del producto
    const { data: producto, error } = await supabase
      .from('productos')
      .update({ activo })
      .eq('id', productoId)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar estado del producto:', error);
      return c.json({ success: false, error: error.message }, 500);
    }

    return c.json({
      success: true,
      message: `Producto ${activo ? 'activado' : 'desactivado'} exitosamente`,
      producto
    });
  } catch (error: any) {
    console.error('Error inesperado al actualizar estado del producto:', error);
    return c.json({
      success: false,
      error: error.message || 'Error inesperado al actualizar el producto'
    }, 500);
  }
}
