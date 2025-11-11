/**
 * EJEMPLO DE USO DEL COMPONENTE ConfirmDialog
 * ============================================
 * 
 * Este archivo muestra cómo implementar el diálogo de confirmación
 * en diferentes escenarios del sistema Escocia Hass.
 */

import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// ============================================================================
// EJEMPLO 1: Eliminar un producto (danger)
// ============================================================================
export function DeleteProductExample() {
  const [showDialog, setShowDialog] = useState(false);

  const handleDelete = () => {
    // Lógica para eliminar producto
    console.log('Producto eliminado');
    setShowDialog(false);
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)}>
        Eliminar Producto
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        title="Eliminar Producto"
        message="¿Está seguro que desea eliminar este producto? Esta acción no se puede deshacer y eliminará todos los registros relacionados."
        confirmText="Sí, Eliminar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// EJEMPLO 2: Confirmar compra (warning)
// ============================================================================
export function ConfirmPurchaseExample() {
  const [showDialog, setShowDialog] = useState(false);

  const handleConfirm = () => {
    // Lógica para guardar compra
    console.log('Compra guardada');
    setShowDialog(false);
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)}>
        Guardar Compra
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        title="Confirmar Compra"
        message="¿Desea guardar esta compra con 3 productos por un total de $7,600,000? Esto actualizará el inventario inmediatamente."
        confirmText="Sí, Guardar"
        cancelText="Revisar"
        type="warning"
        onConfirm={handleConfirm}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// EJEMPLO 3: Salida de inventario (warning)
// ============================================================================
export function InventoryWithdrawalExample() {
  const [showDialog, setShowDialog] = useState(false);

  const handleWithdrawal = () => {
    // Lógica para registrar salida
    console.log('Salida registrada');
    setShowDialog(false);
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)}>
        Registrar Salida
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        title="Registrar Salida"
        message="Va a registrar una salida de 50 kg de Fertilizante NPK. Esto reducirá el stock de 150 kg a 100 kg."
        confirmText="Confirmar Salida"
        cancelText="Cancelar"
        type="warning"
        onConfirm={handleWithdrawal}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// EJEMPLO 4: Descartar cambios (warning)
// ============================================================================
export function DiscardChangesExample() {
  const [showDialog, setShowDialog] = useState(false);

  const handleDiscard = () => {
    // Lógica para descartar cambios
    console.log('Cambios descartados');
    setShowDialog(false);
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)}>
        Cerrar sin Guardar
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        title="¿Descartar Cambios?"
        message="Tiene cambios sin guardar. Si cierra ahora, perderá toda la información ingresada."
        confirmText="Sí, Descartar"
        cancelText="Continuar Editando"
        type="warning"
        onConfirm={handleDiscard}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// EJEMPLO 5: Operación exitosa (success)
// ============================================================================
export function SuccessExample() {
  const [showDialog, setShowDialog] = useState(false);

  const handleClose = () => {
    setShowDialog(false);
    // Navegar a otra página, etc.
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)}>
        Ver Confirmación
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        title="¡Compra Registrada!"
        message="La compra se ha registrado exitosamente. El inventario ha sido actualizado con 3 productos nuevos."
        confirmText="Ver Inventario"
        cancelText="Cerrar"
        type="success"
        onConfirm={handleClose}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// EJEMPLO 6: Información importante (info)
// ============================================================================
export function InfoExample() {
  const [showDialog, setShowDialog] = useState(false);

  const handleContinue = () => {
    setShowDialog(false);
    // Continuar con la acción
  };

  return (
    <>
      <button onClick={() => setShowDialog(true)}>
        Ver Información
      </button>

      <ConfirmDialog
        isOpen={showDialog}
        title="Stock Bajo"
        message="El producto Fertilizante NPK está por debajo del stock mínimo (100 kg). Considere realizar una nueva compra pronto."
        confirmText="Entendido"
        cancelText="Crear Compra"
        type="info"
        onConfirm={handleContinue}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// EJEMPLO 7: Uso con estado condicional
// ============================================================================
export function ConditionalExample() {
  const [showDialog, setShowDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'danger' | 'warning' | 'info' | 'success'>('warning');
  const [dialogMessage, setDialogMessage] = useState('');

  const handleAction = (action: string) => {
    switch (action) {
      case 'delete':
        setDialogType('danger');
        setDialogMessage('¿Está seguro que desea eliminar?');
        break;
      case 'save':
        setDialogType('warning');
        setDialogMessage('¿Desea guardar los cambios?');
        break;
      case 'info':
        setDialogType('info');
        setDialogMessage('Esta es información importante.');
        break;
    }
    setShowDialog(true);
  };

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => handleAction('delete')}>Eliminar</button>
        <button onClick={() => handleAction('save')}>Guardar</button>
        <button onClick={() => handleAction('info')}>Info</button>
      </div>

      <ConfirmDialog
        isOpen={showDialog}
        title="Confirmar Acción"
        message={dialogMessage}
        type={dialogType}
        onConfirm={() => {
          console.log('Confirmado');
          setShowDialog(false);
        }}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}

// ============================================================================
// PROPS DISPONIBLES
// ============================================================================
/*
interface ConfirmDialogProps {
  isOpen: boolean;           // Controla si el diálogo está visible
  title: string;              // Título del diálogo
  message: string;            // Mensaje descriptivo
  confirmText?: string;       // Texto botón confirmar (default: "Confirmar")
  cancelText?: string;        // Texto botón cancelar (default: "Cancelar")
  onConfirm: () => void;      // Función al confirmar
  onCancel: () => void;       // Función al cancelar
  type?: 'danger' | 'warning' | 'info' | 'success'; // Tipo visual (default: 'warning')
}
*/

// ============================================================================
// TIPOS Y SUS COLORES
// ============================================================================
/*
DANGER (Rojo):
- Acciones destructivas
- Eliminaciones permanentes
- Operaciones críticas

WARNING (Amarillo):
- Confirmaciones importantes
- Cambios significativos
- Acciones que requieren atención

INFO (Azul):
- Notificaciones informativas
- Alertas no críticas
- Avisos generales

SUCCESS (Verde):
- Operaciones completadas
- Confirmaciones de éxito
- Mensajes positivos
*/
