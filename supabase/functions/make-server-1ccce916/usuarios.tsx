import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Auth: la administración de usuarios (crear/editar/eliminar) es una acción
// EXCLUSIVA de Gerencia -- ver "Module Access Control" en CLAUDE.md. Mismo
// patrón que `verificarAcceso` en `hato-chequeo-commit.ts`/
// `hato-chequeo-preview.ts` (Bearer JWT -> auth.getUser -> rol en
// `usuarios`), repetido en vez de importado por el mismo motivo: cada
// endpoint de este árbol es autocontenido en su propio I/O.
// ---------------------------------------------------------------------------
const ROLES_PERMITIDOS = new Set(['Gerencia']);

function respuestaError(c: Context, status: 401 | 403 | 500, body: Record<string, unknown>) {
  return c.json({ success: false, ...body }, status);
}

async function verificarAccesoGerencia(
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
  if (!usuario || !ROLES_PERMITIDOS.has(usuario.rol)) {
    return respuestaError(c, 403, {
      error: 'Acceso restringido a Gerencia -- la administración de usuarios es una acción exclusiva de ese rol.',
    });
  }

  return { userId: userData.user.id };
}

/**
 * Crear un nuevo usuario en auth y en la tabla usuarios
 */
export async function crearUsuario(c: Context): Promise<Response> {
  // Crear cliente Supabase con service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAccesoGerencia(c, supabase);
  if (acceso instanceof Response) return acceso;

  try {
    const body = await c.req.json();
    const { email, password, nombre_completo, rol, activo, modulos_acceso } = body;

    // Validaciones
    if (!email || !password || !nombre_completo || !rol) {
      return c.json({
        success: false,
        error: 'Email, contraseña, nombre completo y rol son obligatorios'
      }, 400);
    }

    if (password.length < 6) {
      return c.json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres'
      }, 400);
    }

    // Validar rol
    const rolesValidos = ['Administrador', 'Verificador', 'Gerencia', 'Monitor'];
    if (!rolesValidos.includes(rol)) {
      return c.json({
        success: false,
        error: 'Rol no válido'
      }, 400);
    }

    // Crear usuario en auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirmar email
      user_metadata: {
        nombre_completo,
        rol,
      },
    });

    if (authError) {
      console.error('Error creando usuario en auth:', authError);
      return c.json({
        success: false,
        error: `Error creando usuario: ${authError.message}`
      }, 500);
    }

    // Insertar en tabla usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        email,
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
        modulos_acceso: Array.isArray(modulos_acceso) ? modulos_acceso : [],
      });

    if (dbError) {
      console.error('Error insertando usuario en tabla:', dbError);

      // Si falla la inserción en la tabla, eliminar el usuario de auth
      await supabase.auth.admin.deleteUser(authData.user.id);

      return c.json({
        success: false,
        error: `Error registrando usuario: ${dbError.message}`
      }, 500);
    }

    return c.json({
      success: true,
      data: {
        id: authData.user.id,
        email,
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
      }
    });

  } catch (error: any) {
    console.error('Error en crearUsuario:', error);
    return c.json({
      success: false,
      error: error.message || 'Error interno del servidor'
    }, 500);
  }
}

/**
 * Editar un usuario existente
 */
export async function editarUsuario(c: Context): Promise<Response> {
  // Crear cliente Supabase con service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAccesoGerencia(c, supabase);
  if (acceso instanceof Response) return acceso;

  try {
    const body = await c.req.json();
    const { id, email, password, nombre_completo, rol, activo, modulos_acceso } = body;

    // Validaciones
    if (!id || !email || !nombre_completo || !rol) {
      return c.json({
        success: false,
        error: 'ID, email, nombre completo y rol son obligatorios'
      }, 400);
    }

    // Validar rol
    const rolesValidos = ['Administrador', 'Verificador', 'Gerencia', 'Monitor'];
    if (!rolesValidos.includes(rol)) {
      return c.json({
        success: false,
        error: 'Rol no válido'
      }, 400);
    }

    // Actualizar usuario en auth.users (solo si hay password)
    if (password) {
      if (password.length < 6) {
        return c.json({
          success: false,
          error: 'La contraseña debe tener al menos 6 caracteres'
        }, 400);
      }

      const { error: authError } = await supabase.auth.admin.updateUserById(
        id,
        {
          password,
          user_metadata: {
            nombre_completo,
            rol,
          },
        }
      );

      if (authError) {
        console.error('Error actualizando usuario en auth:', authError);
        return c.json({
          success: false,
          error: `Error actualizando contraseña: ${authError.message}`
        }, 500);
      }
    } else {
      // Solo actualizar metadata sin cambiar password
      const { error: authError } = await supabase.auth.admin.updateUserById(
        id,
        {
          user_metadata: {
            nombre_completo,
            rol,
          },
        }
      );

      if (authError) {
        console.error('Error actualizando metadata en auth:', authError);
        return c.json({
          success: false,
          error: `Error actualizando usuario: ${authError.message}`
        }, 500);
      }
    }

    // Actualizar en tabla usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .update({
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
        modulos_acceso: Array.isArray(modulos_acceso) ? modulos_acceso : [],
      })
      .eq('id', id);

    if (dbError) {
      console.error('Error actualizando usuario en tabla:', dbError);
      return c.json({
        success: false,
        error: `Error actualizando datos: ${dbError.message}`
      }, 500);
    }

    return c.json({
      success: true,
      data: {
        id,
        email,
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
      }
    });

  } catch (error: any) {
    console.error('Error en editarUsuario:', error);
    return c.json({
      success: false,
      error: error.message || 'Error interno del servidor'
    }, 500);
  }
}

/**
 * Eliminar un usuario (de auth y de la tabla)
 */
export async function eliminarUsuario(c: Context): Promise<Response> {
  // Crear cliente Supabase con service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAccesoGerencia(c, supabase);
  if (acceso instanceof Response) return acceso;

  try {
    const body = await c.req.json();
    const { id } = body;

    if (!id) {
      return c.json({
        success: false,
        error: 'ID de usuario es obligatorio'
      }, 400);
    }

    // Eliminar de tabla usuarios primero
    const { error: dbError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.error('Error eliminando usuario de tabla:', dbError);
      return c.json({
        success: false,
        error: `Error eliminando registro: ${dbError.message}`
      }, 500);
    }

    // Eliminar de auth.users
    const { error: authError } = await supabase.auth.admin.deleteUser(id);

    if (authError) {
      console.error('Error eliminando usuario de auth:', authError);
      return c.json({
        success: false,
        error: `Error eliminando usuario: ${authError.message}`
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });

  } catch (error: any) {
    console.error('Error en eliminarUsuario:', error);
    return c.json({
      success: false,
      error: error.message || 'Error interno del servidor'
    }, 500);
  }
}
