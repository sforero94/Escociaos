/**
 * GUÍA DE INTEGRACIÓN: Toast en NewPurchase.tsx
 * ==============================================
 * 
 * Este archivo muestra cómo integrar el componente Toast
 * en el formulario de Nueva Compra para mejorar la UX.
 */

import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { getSupabase } from '../../utils/supabase/client';

// ============================================================================
// PASO 1: Importar el hook useToast
// ============================================================================

export function NewPurchaseWithToast() {
  // Inicializar el hook
  const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();
  
  const [purchaseData, setPurchaseData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    numero_factura: '',
  });

  const [purchaseItems, setPurchaseItems] = useState([
    {
      id: crypto.randomUUID(),
      producto_id: '',
      cantidad: '',
      precio_unitario: '',
      lote_producto: '',
      fecha_vencimiento: '',
      permitido_gerencia: false,
    }
  ]);

  // ============================================================================
  // PASO 2: Reemplazar mensajes de error con Toast
  // ============================================================================

  const validateForm = (): boolean => {
    // Validar datos generales
    if (!purchaseData.proveedor.trim()) {
      showError('❌ El proveedor es obligatorio');
      return false;
    }

    if (!purchaseData.numero_factura.trim()) {
      showError('❌ El número de factura es obligatorio');
      return false;
    }

    // Validar que haya al menos un producto
    if (purchaseItems.length === 0) {
      showError('❌ Debe agregar al menos un producto');
      return false;
    }

    // Validar cada item
    for (let i = 0; i < purchaseItems.length; i++) {
      const item = purchaseItems[i];
      const productNum = i + 1;

      if (!item.producto_id) {
        showError(`❌ Producto ${productNum}: Debe seleccionar un producto`);
        return false;
      }

      if (!item.cantidad || parseFloat(item.cantidad) <= 0) {
        showError(`❌ Producto ${productNum}: La cantidad debe ser mayor a 0`);
        return false;
      }

      if (!item.precio_unitario || parseFloat(item.precio_unitario) <= 0) {
        showError(`❌ Producto ${productNum}: El precio debe ser mayor a 0`);
        return false;
      }

      if (!item.permitido_gerencia) {
        showWarning(`⚠️ Producto ${productNum}: Debe marcar "Permitido por Gerencia"`);
        return false;
      }
    }

    return true;
  };

  // ============================================================================
  // PASO 3: Usar Toast en operaciones exitosas
  // ============================================================================

  const handleSave = async () => {
    // Validar
    if (!validateForm()) {
      return;
    }

    try {
      showInfo('💾 Guardando compra...');
      
      const supabase = getSupabase();

      // 1. Insertar compra principal
      const { data: compra, error: compraError } = await supabase
        .from('compras')
        .insert({
          fecha: purchaseData.fecha,
          proveedor: purchaseData.proveedor,
          numero_factura: purchaseData.numero_factura,
          total: calculateTotal(),
        })
        .select()
        .single();

      if (compraError) throw compraError;

      // 2. Insertar detalles de compra
      const detalles = purchaseItems.map(item => ({
        compra_id: compra.id,
        producto_id: parseInt(item.producto_id),
        cantidad: parseFloat(item.cantidad),
        precio_unitario: parseFloat(item.precio_unitario),
        subtotal: parseFloat(item.cantidad) * parseFloat(item.precio_unitario),
        lote_producto: item.lote_producto || null,
        fecha_vencimiento: item.fecha_vencimiento || null,
        permitido_gerencia: item.permitido_gerencia,
      }));

      const { error: detallesError } = await supabase
        .from('detalles_compra')
        .insert(detalles);

      if (detallesError) throw detallesError;

      // 3. Actualizar inventario de cada producto
      for (const item of purchaseItems) {
        const { data: producto } = await supabase
          .from('productos')
          .select('cantidad_actual, stock_minimo')
          .eq('id', item.producto_id)
          .single();

        if (producto) {
          const nuevaCantidad = (producto.cantidad_actual || 0) + parseFloat(item.cantidad);
          
          await supabase
            .from('productos')
            .update({ 
              cantidad_actual: nuevaCantidad,
              precio_unitario: parseFloat(item.precio_unitario),
            })
            .eq('id', item.producto_id);

          // Registrar movimiento
          await supabase
            .from('movimientos_inventario')
            .insert({
              producto_id: parseInt(item.producto_id),
              tipo_movimiento: 'entrada',
              cantidad: parseFloat(item.cantidad),
              referencia: `Compra #${purchaseData.numero_factura}`,
            });
        }
      }

      // ✅ Mostrar éxito con detalles
      showSuccess(`✅ Compra registrada exitosamente (${purchaseItems.length} productos)`);
      showInfo(`📊 Inventario actualizado - Factura: ${purchaseData.numero_factura}`);

      // Resetear formulario después de 1 segundo
      setTimeout(() => {
        resetForm();
      }, 1000);

    } catch (err: any) {
      console.error('Error guardando compra:', err);
      showError(`❌ Error al guardar: ${err.message || 'Intente nuevamente'}`);
    }
  };

  // ============================================================================
  // PASO 4: Toast en operaciones de UI
  // ============================================================================

  const addProduct = () => {
    if (purchaseItems.length >= 20) {
      showWarning('⚠️ Máximo 20 productos por compra');
      return;
    }

    setPurchaseItems([
      ...purchaseItems,
      {
        id: crypto.randomUUID(),
        producto_id: '',
        cantidad: '',
        precio_unitario: '',
        lote_producto: '',
        fecha_vencimiento: '',
        permitido_gerencia: false,
      }
    ]);
    
    showInfo('➕ Producto agregado a la lista');
  };

  const removeProduct = (id: string) => {
    if (purchaseItems.length === 1) {
      showWarning('⚠️ Debe mantener al menos un producto');
      return;
    }
    
    setPurchaseItems(purchaseItems.filter(item => item.id !== id));
    showInfo('🗑️ Producto eliminado de la lista');
  };

  const calculateTotal = () => {
    return purchaseItems.reduce((total, item) => {
      const subtotal = (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio_unitario) || 0);
      return total + subtotal;
    }, 0);
  };

  const resetForm = () => {
    setPurchaseData({
      fecha: new Date().toISOString().split('T')[0],
      proveedor: '',
      numero_factura: '',
    });
    
    setPurchaseItems([{
      id: crypto.randomUUID(),
      producto_id: '',
      cantidad: '',
      precio_unitario: '',
      lote_producto: '',
      fecha_vencimiento: '',
      permitido_gerencia: false,
    }]);
  };

  // ============================================================================
  // PASO 5: Renderizar el ToastContainer
  // ============================================================================

  return (
    <div className="p-6">
      {/* Formulario aquí */}
      
      <div className="flex gap-3 mt-6">
        <button onClick={addProduct}>
          Agregar Producto
        </button>
        
        <button onClick={handleSave}>
          Guardar Compra
        </button>
      </div>

      {/* IMPORTANTE: Renderizar el contenedor de toasts */}
      <ToastContainer />
    </div>
  );
}

// ============================================================================
// CASOS DE USO ESPECÍFICOS PARA NEWPURCHASE
// ============================================================================

export const ToastMessages = {
  // Validaciones
  PROVEEDOR_REQUIRED: '❌ El proveedor es obligatorio',
  FACTURA_REQUIRED: '❌ El número de factura es obligatorio',
  MIN_ONE_PRODUCT: '❌ Debe agregar al menos un producto',
  PRODUCTO_REQUIRED: (num: number) => `❌ Producto ${num}: Debe seleccionar un producto`,
  CANTIDAD_INVALID: (num: number) => `❌ Producto ${num}: La cantidad debe ser mayor a 0`,
  PRECIO_INVALID: (num: number) => `❌ Producto ${num}: El precio debe ser mayor a 0`,
  GERENCIA_REQUIRED: (num: number) => `⚠️ Producto ${num}: Debe marcar "Permitido por Gerencia"`,
  
  // Operaciones
  SAVING: '💾 Guardando compra...',
  SAVE_SUCCESS: (count: number, factura: string) => 
    `✅ Compra registrada exitosamente (${count} productos) - Factura: ${factura}`,
  INVENTORY_UPDATED: '📊 Inventario actualizado automáticamente',
  PRODUCT_ADDED: '➕ Producto agregado a la lista',
  PRODUCT_REMOVED: '🗑️ Producto eliminado de la lista',
  MAX_PRODUCTS: '⚠️ Máximo 20 productos por compra',
  MIN_PRODUCTS: '⚠️ Debe mantener al menos un producto',
  
  // Errores
  SAVE_ERROR: (error: string) => `❌ Error al guardar: ${error}`,
  DB_ERROR: '❌ Error de conexión con la base de datos',
  DUPLICATE_INVOICE: (factura: string) => `⚠️ Ya existe una compra con la factura ${factura}`,
  
  // Warnings
  UNSAVED_CHANGES: '⚠️ Tiene cambios sin guardar',
  CHECK_DATA: '⚠️ Revise los datos antes de continuar',
  STOCK_UPDATED: (producto: string, cantidad: number) => 
    `📦 Stock actualizado: ${producto} (+${cantidad})`,
};

// ============================================================================
// RESUMEN DE CAMBIOS NECESARIOS EN NewPurchase.tsx
// ============================================================================
/*

1. IMPORTAR:
   import { useToast } from '../shared/Toast';

2. INICIALIZAR:
   const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();

3. REEMPLAZAR:
   - setError('mensaje') → showError('❌ mensaje')
   - setShowSuccess(true) → showSuccess('✅ mensaje')
   - console.log('warning') → showWarning('⚠️ mensaje')
   - alert('info') → showInfo('ℹ️ mensaje')

4. ELIMINAR:
   - const [error, setError] = useState('');
   - const [showSuccess, setShowSuccess] = useState(false);
   - Bloques de {error && <div>{error}</div>}
   - Bloques de {showSuccess && <div>...</div>}

5. AGREGAR AL FINAL DEL RETURN:
   <ToastContainer />

*/
