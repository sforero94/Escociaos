import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Crear un nuevo usuario en auth y en la tabla usuarios
 */
export async function crearUsuario(body: any) {
  try {
    const { email, password, nombre_completo, rol, activo } = body;

    // Validaciones
    if (!email || !password || !nombre_completo || !rol) {
      return {
        success: false,
        error: 'Email, contraseña, nombre completo y rol son obligatorios'
      };
    }

    if (password.length < 6) {
      return {
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres'
      };
    }

    // Validar rol
    const rolesValidos = ['Administrador', 'Verificador', 'Gerencia'];
    if (!rolesValidos.includes(rol)) {
      return {
        success: false,
        error: 'Rol no válido'
      };
    }

    // Crear cliente Supabase con service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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
      return {
        success: false,
        error: `Error creando usuario: ${authError.message}`
      };
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
      });

    if (dbError) {
      console.error('Error insertando usuario en tabla:', dbError);

      // Si falla la inserción en la tabla, eliminar el usuario de auth
      await supabase.auth.admin.deleteUser(authData.user.id);

      return {
        success: false,
        error: `Error registrando usuario: ${dbError.message}`
      };
    }

    return {
      success: true,
      data: {
        id: authData.user.id,
        email,
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
      }
    };

  } catch (error: any) {
    console.error('Error en crearUsuario:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    };
  }
}

/**
 * Editar un usuario existente
 */
export async function editarUsuario(body: any) {
  try {
    const { id, email, password, nombre_completo, rol, activo } = body;

    // Validaciones
    if (!id || !email || !nombre_completo || !rol) {
      return {
        success: false,
        error: 'ID, email, nombre completo y rol son obligatorios'
      };
    }

    // Validar rol
    const rolesValidos = ['Administrador', 'Verificador', 'Gerencia'];
    if (!rolesValidos.includes(rol)) {
      return {
        success: false,
        error: 'Rol no válido'
      };
    }

    // Crear cliente Supabase con service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Actualizar usuario en auth.users (solo si hay password)
    if (password) {
      if (password.length < 6) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 6 caracteres'
        };
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
        return {
          success: false,
          error: `Error actualizando contraseña: ${authError.message}`
        };
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
        return {
          success: false,
          error: `Error actualizando usuario: ${authError.message}`
        };
      }
    }

    // Actualizar en tabla usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .update({
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
      })
      .eq('id', id);

    if (dbError) {
      console.error('Error actualizando usuario en tabla:', dbError);
      return {
        success: false,
        error: `Error actualizando datos: ${dbError.message}`
      };
    }

    return {
      success: true,
      data: {
        id,
        email,
        nombre_completo,
        rol,
        activo: activo !== undefined ? activo : true,
      }
    };

  } catch (error: any) {
    console.error('Error en editarUsuario:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    };
  }
}

/**
 * Eliminar un usuario (de auth y de la tabla)
 */
export async function eliminarUsuario(body: any) {
  try {
    const { id } = body;

    if (!id) {
      return {
        success: false,
        error: 'ID de usuario es obligatorio'
      };
    }

    // Crear cliente Supabase con service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Eliminar de tabla usuarios primero
    const { error: dbError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.error('Error eliminando usuario de tabla:', dbError);
      return {
        success: false,
        error: `Error eliminando registro: ${dbError.message}`
      };
    }

    // Eliminar de auth.users
    const { error: authError } = await supabase.auth.admin.deleteUser(id);

    if (authError) {
      console.error('Error eliminando usuario de auth:', authError);
      return {
        success: false,
        error: `Error eliminando usuario: ${authError.message}`
      };
    }

    return {
      success: true,
      message: 'Usuario eliminado exitosamente'
    };

  } catch (error: any) {
    console.error('Error en eliminarUsuario:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    };
  }
}