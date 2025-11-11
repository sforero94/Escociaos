/**
 * EJEMPLO DE USO DEL COMPONENTE TOAST
 * ====================================
 * 
 * Este archivo muestra cómo implementar notificaciones Toast
 * en diferentes escenarios del sistema Escocia Hass.
 */

import React from 'react';
import { useToast } from './Toast';

// ============================================================================
// EJEMPLO 1: Uso básico del hook useToast
// ============================================================================
export function BasicToastExample() {
  const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();

  return (
    <div className="p-6 space-y-4">
      <h2>Ejemplos de Toast</h2>
      
      <div className="flex gap-3">
        <button 
          onClick={() => showSuccess('¡Operación completada exitosamente!')}
          className="px-4 py-2 bg-green-500 text-white rounded-lg"
        >
          Mostrar Success
        </button>

        <button 
          onClick={() => showError('Error al procesar la solicitud')}
          className="px-4 py-2 bg-red-500 text-white rounded-lg"
        >
          Mostrar Error
        </button>

        <button 
          onClick={() => showWarning('Advertencia: Stock bajo')}
          className="px-4 py-2 bg-yellow-500 text-white rounded-lg"
        >
          Mostrar Warning
        </button>

        <button 
          onClick={() => showInfo('Información importante')}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg"
        >
          Mostrar Info
        </button>
      </div>

      {/* Contenedor de toasts */}
      <ToastContainer />
    </div>
  );
}

// ============================================================================
// EJEMPLO 2: Guardar compra con notificaciones
// ============================================================================
export function SavePurchaseWithToast() {
  const { showSuccess, showError, ToastContainer } = useToast();

  const handleSave = async () => {
    try {
      // Simulación de guardado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      showSuccess('✅ Compra registrada exitosamente con 3 productos');
    } catch (error) {
      showError('❌ Error al guardar la compra. Intente nuevamente.');
    }
  };

  return (
    <div className="p-6">
      <button 
        onClick={handleSave}
        className="px-6 py-3 bg-[#73991C] text-white rounded-lg"
      >
        Guardar Compra
      </button>

      <ToastContainer />
    </div>
  );
}

// ============================================================================
// EJEMPLO 3: Validaciones de formulario con Toast
// ============================================================================
export function FormValidationExample() {
  const { showError, showWarning, ToastContainer } = useToast();

  const validateForm = () => {
    const errors: string[] = [];
    
    // Simulación de validaciones
    if (!document.querySelector('input[name="proveedor"]')) {
      errors.push('El proveedor es obligatorio');
    }
    
    if (errors.length > 0) {
      errors.forEach(error => showError(error));
      return false;
    }

    showWarning('⚠️ Revise los datos antes de continuar');
    return true;
  };

  return (
    <div className="p-6">
      <button onClick={validateForm}>
        Validar Formulario
      </button>
      <ToastContainer />
    </div>
  );
}

// ============================================================================
// EJEMPLO 4: Operaciones de inventario con feedback
// ============================================================================
export function InventoryOperationsExample() {
  const { showSuccess, showError, showWarning, ToastContainer } = useToast();

  const operations = {
    addStock: () => {
      showSuccess('📦 Stock actualizado: +50 kg de Fertilizante NPK');
    },
    
    removeStock: () => {
      showWarning('📤 Salida registrada: -25 kg de Fertilizante NPK');
    },
    
    lowStock: () => {
      showWarning('⚠️ Stock bajo: Fertilizante NPK (10 kg restantes)');
    },
    
    deleteProduct: () => {
      showError('🗑️ Producto eliminado permanentemente');
    }
  };

  return (
    <div className="p-6 space-y-3">
      <button onClick={operations.addStock}>Agregar Stock</button>
      <button onClick={operations.removeStock}>Registrar Salida</button>
      <button onClick={operations.lowStock}>Alerta Stock Bajo</button>
      <button onClick={operations.deleteProduct}>Eliminar Producto</button>
      
      <ToastContainer />
    </div>
  );
}

// ============================================================================
// EJEMPLO 5: Toast múltiples (apilados)
// ============================================================================
export function MultipleToastsExample() {
  const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();

  const showMultiple = () => {
    showInfo('Iniciando proceso...');
    
    setTimeout(() => {
      showWarning('Validando datos...');
    }, 500);
    
    setTimeout(() => {
      showSuccess('Proceso completado exitosamente');
    }, 1000);
  };

  return (
    <div className="p-6">
      <button onClick={showMultiple}>
        Mostrar Secuencia de Toasts
      </button>
      <ToastContainer />
    </div>
  );
}

// ============================================================================
// EJEMPLO 6: Integración en componente de compras
// ============================================================================
export function PurchaseFormWithToast() {
  const { showSuccess, showError, showWarning, ToastContainer } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar campos
    const formData = new FormData(e.target as HTMLFormElement);
    const proveedor = formData.get('proveedor');

    if (!proveedor) {
      showError('❌ El proveedor es obligatorio');
      return;
    }

    try {
      // Simulación de guardado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      showSuccess('✅ Compra registrada: Factura #F-2024-1150');
      showInfo('📊 Inventario actualizado automáticamente');
      
      // Resetear formulario
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      showError('❌ Error al guardar. Verifique su conexión.');
    }
  };

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input 
          name="proveedor" 
          placeholder="Proveedor"
          className="border p-2 rounded"
        />
        
        <button 
          type="submit"
          className="px-6 py-2 bg-[#73991C] text-white rounded-lg"
        >
          Guardar Compra
        </button>
      </form>

      <ToastContainer />
    </div>
  );
}

// ============================================================================
// EJEMPLO 7: Toast con diferentes duraciones
// ============================================================================
export function CustomDurationExample() {
  const { ToastContainer } = useToast();
  const [toasts, setToasts] = React.useState<any[]>([]);

  const showCustomToast = (duration: number) => {
    const id = Date.now();
    setToasts(prev => [...prev, { 
      id, 
      message: `Este toast dura ${duration/1000} segundos`, 
      type: 'info',
      duration 
    }]);
  };

  return (
    <div className="p-6 space-y-3">
      <button onClick={() => showCustomToast(2000)}>Toast 2 seg</button>
      <button onClick={() => showCustomToast(5000)}>Toast 5 seg</button>
      <button onClick={() => showCustomToast(10000)}>Toast 10 seg</button>
      
      <ToastContainer />
    </div>
  );
}

// ============================================================================
// USO RECOMENDADO EN COMPONENTES
// ============================================================================
/*

PASO 1: Importar el hook
import { useToast } from '../components/shared/Toast';

PASO 2: Inicializar en el componente
const { showSuccess, showError, showWarning, showInfo, ToastContainer } = useToast();

PASO 3: Usar en funciones
const handleSave = () => {
  try {
    // Lógica de guardado
    showSuccess('¡Guardado exitosamente!');
  } catch (error) {
    showError('Error al guardar');
  }
};

PASO 4: Renderizar el contenedor
return (
  <div>
    {/* Tu contenido */}
    <ToastContainer />
  </div>
);

*/

// ============================================================================
// CASOS DE USO COMUNES EN ESCOCIA HASS
// ============================================================================
/*

✅ SUCCESS (Verde):
- Compra registrada exitosamente
- Producto creado/actualizado
- Movimiento de inventario guardado
- Exportación completada
- Usuario creado

❌ ERROR (Rojo):
- Error al guardar en base de datos
- Validación fallida
- Producto no encontrado
- Permisos insuficientes
- Error de conexión

⚠️ WARNING (Amarillo):
- Stock bajo detectado
- Fecha de vencimiento próxima
- Producto duplicado
- Datos incompletos (no crítico)
- Cambios sin guardar

ℹ️ INFO (Azul):
- Proceso iniciado
- Calculando totales
- Actualizando datos
- Información general
- Tips y sugerencias

*/
