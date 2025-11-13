# 📋 Movimientos Diarios - Sistema de Registro

Sistema completo para registrar el uso diario de productos durante la ejecución de aplicaciones fitosanitarias en Escocia Hass.

## 🎯 Características

### ✅ **Vista Completa (DailyMovementsDashboard)**
- **Resumen de productos**: Visual con barras de progreso
- **Sistema de alertas**: Automático cuando se excede el 90% o 100%
- **Lista de movimientos**: Con detalles completos y opción de eliminar
- **Secciones colapsables**: Para mejor organización
- **Diseño responsive**: Mobile-first con paleta Escocia Hass

### ✅ **Formulario de Registro (DailyMovementForm)**
- Fecha del movimiento
- Selección de lote (solo lotes de la aplicación)
- Selección de producto (solo productos en mezclas)
- Cantidad utilizada con validación
- Responsable (pre-llenado con usuario actual)
- Notas opcionales
- Validaciones automáticas

### ✅ **Alertas Automáticas**
- 🔴 **Error**: Cuando se excede lo planificado (>100%)
- 🟡 **Warning**: Cerca del límite (≥90%)
- ⚠️ **Warning**: Producto usado sin planificación previa

## 📦 Instalación

### 1. Crear la tabla en Supabase

```sql
-- Ejecuta el archivo /database/movimientos_diarios.sql
-- en el SQL Editor de Supabase
```

### 2. Importar componentes

```tsx
import { DailyMovementsDashboard } from './components/aplicaciones/DailyMovementsDashboard';
import { DailyMovementForm } from './components/aplicaciones/DailyMovementForm';
```

## 🚀 Uso

### Opción 1: Dashboard Completo (Recomendado)

```tsx
import { DailyMovementsDashboard } from './components/aplicaciones/DailyMovementsDashboard';
import type { Aplicacion } from './types/aplicaciones';

function AplicacionDetail({ aplicacion }: { aplicacion: Aplicacion }) {
  const [showMovimientos, setShowMovimientos] = useState(false);

  if (showMovimientos) {
    return (
      <DailyMovementsDashboard
        aplicacion={aplicacion}
        onClose={() => setShowMovimientos(false)}
      />
    );
  }

  return (
    <div>
      <button onClick={() => setShowMovimientos(true)}>
        Ver Movimientos Diarios
      </button>
    </div>
  );
}
```

### Opción 2: Solo Formulario

```tsx
import { DailyMovementForm } from './components/aplicaciones/DailyMovementForm';

function MiComponente({ aplicacion }: { aplicacion: Aplicacion }) {
  return (
    <DailyMovementForm
      aplicacion={aplicacion}
      onSuccess={() => {
        console.log('Movimiento guardado');
        // Recargar datos, cerrar modal, etc.
      }}
      onCancel={() => {
        console.log('Cancelado');
        // Cerrar formulario
      }}
    />
  );
}
```

### Opción 3: En Modal

```tsx
import { DailyMovementsDashboard } from './components/aplicaciones/DailyMovementsDashboard';

function ModalMovimientos({ aplicacion, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6">
        <DailyMovementsDashboard
          aplicacion={aplicacion}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
```

## 📊 Estructura de Datos

### MovimientoDiario

```typescript
interface MovimientoDiario {
  id?: string;
  aplicacion_id: string;
  fecha_movimiento: string; // "2024-01-15"
  lote_id: string;
  lote_nombre: string;
  producto_id: string;
  producto_nombre: string;
  producto_unidad: 'litros' | 'kilos' | 'unidades';
  cantidad_utilizada: number;
  responsable: string;
  notas?: string;
  creado_en?: string;
  creado_por?: string;
  actualizado_en?: string;
}
```

### ResumenMovimientoDiario

```typescript
interface ResumenMovimientoDiario {
  producto_id: string;
  producto_nombre: string;
  producto_unidad: 'litros' | 'kilos' | 'unidades';
  total_utilizado: number;
  cantidad_planeada: number;
  diferencia: number;
  porcentaje_usado: number;
  excede_planeado: boolean;
}
```

## 🎨 Diseño

### Paleta de Colores
- **Primary**: `#73991C` (Verde aguacate)
- **Secondary**: `#BFD97D` (Verde claro)
- **Background**: `#F8FAF5` (Blanco verdoso)
- **Dark**: `#172E08` (Verde oscuro)
- **Brown**: `#4D240F` (Marrón)

### Estados Visuales
- **Normal** (<90%): Verde `#73991C`
- **Warning** (90-99%): Amarillo `#F59E0B`
- **Error** (≥100%): Rojo `#EF4444`

## 🔐 Seguridad (RLS)

- ✅ Todos los usuarios autenticados pueden **ver** movimientos
- ✅ Todos los usuarios autenticados pueden **crear** movimientos
- ✅ Solo el **creador** o **gerencia** pueden editar/eliminar
- ✅ Foreign keys a `aplicaciones`, `lotes`, `productos`, `auth.users`

## 📝 Validaciones

### Formulario
- ✅ Fecha obligatoria (no mayor a hoy)
- ✅ Lote obligatorio (solo de la aplicación)
- ✅ Producto obligatorio (solo en mezclas)
- ✅ Cantidad > 0 y numérica
- ✅ Responsable obligatorio
- ✅ Notas opcionales

### Alertas
- ⚠️ Si se usa ≥90% de lo planificado
- 🚨 Si se excede lo planificado
- ℹ️ Si se usa producto no planificado

## 🔄 Flujo de Trabajo

1. **Inicio de Aplicación**: Estado "En ejecución"
2. **Durante Ejecución**: 
   - Registrar movimientos diarios
   - Ver resumen en tiempo real
   - Recibir alertas si hay excesos
3. **Cierre de Aplicación**:
   - Revisar diferencias entre planeado vs real
   - Ajustar inventario
   - Cerrar aplicación

## 🎯 Próximas Mejoras

- [ ] Exportar movimientos a PDF/Excel
- [ ] Filtros por fecha, lote, producto
- [ ] Gráficos de consumo por día
- [ ] Comparación histórica
- [ ] Foto de evidencia por movimiento
- [ ] Firma digital del responsable
- [ ] Integración con clima/condiciones

## 📱 Mobile

El componente es **completamente responsive**:
- Grid adapta de 2 columnas a 1 columna
- Formulario optimizado para touch
- Botones con tamaño adecuado
- Scroll automático en listas

## 🐛 Debug

Si tienes problemas:

```tsx
// Verificar que la tabla existe
const { data, error } = await supabase
  .from('movimientos_diarios')
  .select('count');

console.log('Tabla existe:', !error);
console.log('Total registros:', data?.[0]?.count);
```

## 📞 Soporte

Creado para **Escocia Hass** - Sistema de Gestión Integral de Aguacate
Compatible con certificación **GlobalGAP**
