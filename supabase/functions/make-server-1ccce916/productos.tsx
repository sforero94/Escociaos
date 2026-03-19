import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Alternar el estado activo de un producto
 */
export async function toggleProductoActivo(data: { productoId: number; activo: boolean }) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { productoId, activo } = data;

    if (!productoId) {
      return { success: false, error: 'El ID del producto es requerido' };
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
      return { success: false, error: error.message };
    }

    return { 
      success: true, 
      message: `Producto ${activo ? 'activado' : 'desactivado'} exitosamente`,
      producto 
    };
  } catch (error: any) {
    console.error('Error inesperado al actualizar estado del producto:', error);
    return { success: false, error: error.message || 'Error inesperado al actualizar el producto' };
  }
}
