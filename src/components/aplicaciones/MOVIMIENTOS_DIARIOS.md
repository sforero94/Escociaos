# Registro de Movimientos Diarios

## Descripción General

El módulo de **Movimientos Diarios** permite registrar el uso diario de insumos durante el periodo de aplicación, que puede durar varios días (típicamente 3-10 días). Esta funcionalidad es esencial para mantener trazabilidad para certificaciones como GlobalGAP sin afectar el inventario inmediatamente.

## ¿Por qué es necesario?

1. **Trazabilidad diaria**: Las certificaciones GlobalGAP requieren registro detallado del uso diario de productos
2. **Aplicaciones multi-día**: Las aplicaciones no se completan en un solo día
3. **Inventario actualizado**: Otras operaciones necesitan conocer el inventario disponible
4. **Ajustes al cierre**: Permite comparar lo planeado vs. lo real al finalizar

## Características Principales

### ✅ Movimientos Provisionales

Los movimientos diarios son **provisionales**, lo que significa que:
- No afectan el inventario inmediatamente
- Se pueden ajustar o eliminar antes del cierre
- Permiten ver en tiempo real el progreso de la aplicación
- Al cerrar la aplicación, se consolidan en un movimiento de inventario final

### 📊 Seguimiento y Alertas

El sistema proporciona:
- **Resumen por producto**: Compara lo utilizado vs. lo planeado
- **Alertas automáticas**: Avisa cuando se excede lo planeado
- **Porcentaje de uso**: Muestra el progreso de cada producto
- **Visualización clara**: Barras de progreso y códigos de color

### 🔍 Validaciones

- La fecha no puede ser anterior al inicio de la aplicación
- La fecha no puede ser futura
- Se valida que los productos pertenezcan a la aplicación
- Se alerta cuando se excede la cantidad planeada

## Estructura de Componentes

```
/components/aplicaciones/
├── DailyMovements.tsx              # Contenedor principal
├── DailyMovementForm.tsx           # Formulario de registro
├── DailyMovementsList.tsx          # Lista y resumen
└── MOVIMIENTOS_DIARIOS.md          # Esta documentación

/types/
└── aplicaciones.ts                 # Interfaces TypeScript

/utils/
└── validacionMovimientosDiarios.ts # Lógica de validación
```

## Interfaces TypeScript

### MovimientoDiario

```typescript
interface MovimientoDiario {
  id?: string;
  aplicacion_id: string;
  fecha_movimiento: string;       // ISO date string
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

### ResumenMovimientosDiarios

```typescript
interface ResumenMovimientosDiarios {
  producto_id: string;
  producto_nombre: string;
  total_utilizado: number;
  cantidad_planeada: number;
  diferencia: number;
  porcentaje_usado: number;
  excede_planeado: boolean;
}
```

### AlertaMovimientoDiario

```typescript
interface AlertaMovimientoDiario {
  tipo: 'warning' | 'error' | 'info';
  producto_nombre: string;
  mensaje: string;
  porcentaje_usado: number;
}
```

## Flujo de Uso

### 1. Acceso al Módulo

Desde el listado de aplicaciones:
- Solo disponible para aplicaciones en estado **"En ejecución"**
- Botón "Ver Movimientos" o similar en cada aplicación

### 2. Registro de Movimiento

**Campos requeridos:**
- ✅ Fecha del movimiento (no futura, no anterior al inicio)
- ✅ Lote aplicado (de los lotes de la aplicación)
- ✅ Producto (de los productos planeados)
- ✅ Cantidad utilizada
- ✅ Responsable (pre-cargado con usuario actual)
- ⭕ Notas (opcional)

**Proceso:**
1. Clic en "Nuevo Movimiento"
2. Completar formulario
3. Validación automática
4. Guardar como movimiento provisional

### 3. Visualización y Seguimiento

**Resumen por producto:**
- Muestra cada producto con su progreso
- Barra de progreso visual
- Porcentaje utilizado vs. planeado
- Estado (Normal / Excedido)

**Lista de movimientos:**
- Ordenada por fecha descendente
- Agrupada por fecha y lote
- Información del responsable
- Notas adicionales

**Alertas:**
- 🔴 **Error**: Cuando se excede lo planeado (>100%)
- 🟡 **Warning**: Cuando se usa >90% de lo planeado
- 🔵 **Info**: Cuando se usa >75% de lo planeado

### 4. Gestión de Movimientos

- **Eliminar**: Solo antes del cierre de la aplicación
- **Consultar**: Disponible incluso después del cierre
- **Exportar**: Generar reportes CSV o PDF

## Reglas de Negocio

### ✅ Permitido

- Registrar múltiples movimientos del mismo producto en diferentes días
- Registrar movimientos en diferentes lotes el mismo día
- Eliminar movimientos antes del cierre
- Exceder lo planeado (con alerta)

### ❌ No Permitido

- Registrar movimientos con fecha futura
- Registrar movimientos antes del inicio de la aplicación
- Agregar movimientos después del cierre
- Editar movimientos (solo eliminar y crear nuevos)

## Tabla de Base de Datos

### movimientos_diarios

```sql
CREATE TABLE movimientos_diarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aplicacion_id UUID NOT NULL REFERENCES aplicaciones(id) ON DELETE CASCADE,
  fecha_movimiento DATE NOT NULL,
  lote_id UUID NOT NULL REFERENCES lotes(id),
  lote_nombre VARCHAR(255) NOT NULL,
  producto_id UUID NOT NULL REFERENCES productos(id),
  producto_nombre VARCHAR(255) NOT NULL,
  producto_unidad VARCHAR(50) NOT NULL,
  cantidad_utilizada DECIMAL(10,2) NOT NULL,
  responsable VARCHAR(255) NOT NULL,
  notas TEXT,
  creado_en TIMESTAMP DEFAULT NOW(),
  creado_por UUID REFERENCES usuarios(id),
  actualizado_en TIMESTAMP DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX idx_movimientos_diarios_aplicacion ON movimientos_diarios(aplicacion_id);
CREATE INDEX idx_movimientos_diarios_fecha ON movimientos_diarios(fecha_movimiento);
CREATE INDEX idx_movimientos_diarios_producto ON movimientos_diarios(producto_id);
```

## Integración con Cierre de Aplicación

Cuando se cierra una aplicación:

1. **Revisión de movimientos**: Se muestra el resumen completo
2. **Comparación**: Lo planeado vs. lo realmente utilizado
3. **Ajustes**: Posibilidad de ajustar cantidades
4. **Consolidación**: Los movimientos diarios se convierten en movimientos de inventario reales
5. **Trazabilidad**: Se mantiene el historial de movimientos diarios para auditoría

## Utilidades Disponibles

### `validacionMovimientosDiarios.ts`

```typescript
// Calcular resumen
calcularResumenMovimientos(movimientos, productosPlaneados)

// Generar alertas
generarAlertas(resumen)

// Validar nuevo movimiento
validarNuevoMovimiento(productoId, cantidad, movimientosExistentes, productosPlaneados)

// Agrupar por fecha
agruparMovimientosPorFecha(movimientos)

// Agrupar por lote
agruparMovimientosPorLote(movimientos)

// Calcular estadísticas
calcularEstadisticas(movimientos)

// Validar fecha
validarFechaMovimiento(fecha, fechaInicio, fechaCierre)

// Exportar a CSV
exportarMovimientosACSV(movimientos)

// Generar reporte de texto
generarReporteTexto(movimientos, resumen)
```

## Casos de Uso

### Caso 1: Aplicación de 5 días

**Día 1**: Se aplica Lote A con Producto X (50L)
**Día 2**: Se aplica Lote B con Producto X (45L)
**Día 3**: Se aplica Lote C con Producto X (60L) - ⚠️ Alerta: excede planeado
**Día 4**: Se completa Lote A con Producto Y (30kg)
**Día 5**: Se revisa y cierra la aplicación

### Caso 2: Corrección de error

**Problema**: Se registró 100L en lugar de 10L
**Solución**:
1. Eliminar movimiento incorrecto
2. Crear nuevo movimiento con cantidad correcta
3. Agregar nota explicativa

### Caso 3: Consulta post-cierre

**Escenario**: Auditoría GlobalGAP 3 meses después
**Acción**:
1. Acceder a la aplicación cerrada
2. Ver todos los movimientos diarios
3. Exportar reporte CSV
4. Entregar documentación

## Mejores Prácticas

1. **Registro diario**: No esperar al final para registrar todos los movimientos
2. **Notas descriptivas**: Agregar contexto cuando sea necesario
3. **Revisión periódica**: Verificar el resumen antes de cerrar
4. **Responsable correcto**: Asegurar que el nombre esté completo
5. **Fechas exactas**: Registrar la fecha real del uso

## Troubleshooting

### Problema: No puedo agregar movimientos

**Causa**: La aplicación está en estado "Calculada" o "Cerrada"
**Solución**: Solo se pueden agregar movimientos cuando está "En ejecución"

### Problema: No aparecen los productos

**Causa**: No hay productos en las mezclas de la aplicación
**Solución**: Revisar la configuración de mezclas en la calculadora

### Problema: La fecha no se guarda

**Causa**: Fecha futura o anterior al inicio
**Solución**: Usar una fecha válida dentro del rango permitido

## Próximas Mejoras

- [ ] Edición de movimientos (actualmente solo eliminar y recrear)
- [ ] Carga masiva desde CSV
- [ ] Fotos de evidencia por movimiento
- [ ] Firma digital del responsable
- [ ] Sincronización offline
- [ ] Notificaciones push cuando se excede lo planeado
- [ ] Reportes PDF automáticos
- [ ] Integración con app móvil

## Referencias

- [Calculadora de Aplicaciones](./README.md)
- [Gestión de Inventario](../inventory/README.md)
- [GlobalGAP Requirements](https://www.globalgap.org)

---

**Última actualización**: 2025-11-12
**Versión**: 1.0.0
**Autor**: Sistema Escociaos
