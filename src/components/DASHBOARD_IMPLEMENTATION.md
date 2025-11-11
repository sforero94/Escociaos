# 📊 Dashboard Implementation - Escocia Hass

Documentación completa de la implementación del Dashboard con datos reales de Supabase.

---

## 🎯 Overview

El Dashboard muestra 6 métricas principales + alertas en tiempo real, todas conectadas a Supabase con manejo robusto de errores y auto-refresh cada 5 minutos.

---

## 📈 Métricas Implementadas

### 1. **INVENTARIO** - Valor Total
```sql
SELECT SUM(cantidad_actual * precio_unitario) FROM productos WHERE activo = true
```

**Calcula:**
- Valor total del inventario en COP
- Número de productos con stock bajo (cantidad_actual <= stock_minimo)

**Muestra:**
```tsx
Valor: $330,000,000 COP (formateado)
Subtitle: "3 productos con stock bajo"
Color: Verde (normal) | Amarillo (hay alertas)
```

**Error Handling:**
- Si falla → muestra "--"
- No rompe otras métricas

---

### 2. **APLICACIONES** - En Ejecución
```sql
SELECT COUNT(*) FROM aplicaciones WHERE estado = 'En ejecución'
```

**Calcula:**
- Número de aplicaciones activas
- Próxima aplicación programada

**Muestra:**
```tsx
Valor: "5 activas"
Subtitle: "Próxima: Fertilización foliar"
Color: Verde
```

**Query adicional:**
```sql
SELECT nombre_aplicacion, fecha_aplicacion 
FROM aplicaciones 
WHERE estado = 'Programada'
ORDER BY fecha_aplicacion ASC
LIMIT 1
```

---

### 3. **MONITOREO** - Críticos (7 días)
```sql
SELECT COUNT(*) FROM monitoreos 
WHERE gravedad_texto = 'Alta' 
AND fecha_monitoreo >= NOW() - INTERVAL '7 days'
```

**Calcula:**
- Monitoreos críticos de últimos 7 días
- Fecha del último monitoreo (formatRelativeTime)

**Muestra:**
```tsx
Valor: "2 críticas"
Subtitle: "Último: hace 3 horas"
Color: Rojo (hay críticos) | Verde (sin críticos)
```

---

### 4. **PRODUCCIÓN** - Semanal
```sql
SELECT SUM(kilos_cosechados) FROM cosechas
WHERE fecha_cosecha >= NOW() - INTERVAL '7 days'
```

**Calcula:**
- Total kg cosechados en últimos 7 días
- Promedio por árbol (total / 12,000 árboles)

**Muestra:**
```tsx
Valor: "4,800 kg"
Subtitle: "Promedio: 0.400 kg/árbol"
Color: Verde
```

---

### 5. **VENTAS** - Del Mes
```sql
SELECT SUM(valor_total), cliente_id FROM despachos
WHERE fecha_despacho >= DATE_TRUNC('month', NOW())
```

**Calcula:**
- Suma de ventas del mes actual en COP
- Clientes únicos activos este mes

**Muestra:**
```tsx
Valor: "$174,370,000"
Subtitle: "6 clientes activos"
Color: Azul
```

**Implementación:**
```typescript
// Primer día del mes actual
const primerDiaMes = new Date();
primerDiaMes.setDate(1);
const primerDiaMesISO = primerDiaMes.toISOString().split('T')[0];
```

---

### 6. **LOTES** - Activos
```sql
SELECT COUNT(*) FROM lotes WHERE activo = true
```

**Calcula:**
- Número de lotes activos
- Lote más grande (por hectáreas)

**Muestra:**
```tsx
Valor: "8"
Subtitle: "Más grande: A-1 (6.5 ha)"
Color: Gris
```

---

## 🚨 Alertas Implementadas

El sistema muestra **máximo 5 alertas** ordenadas por fecha (más recientes primero).

### 1. **Stock Bajo**
```sql
SELECT nombre, cantidad_actual, stock_minimo, fecha_actualizacion
FROM productos 
WHERE activo = true
ORDER BY fecha_actualizacion DESC
```

**Filtro en JavaScript:**
```typescript
const productosBajos = stockBajo
  .filter((p) => p.cantidad_actual <= p.stock_minimo)
  .slice(0, 3); // Máximo 3
```

**Alerta generada:**
```typescript
{
  tipo: 'stock',
  mensaje: '⚠️ Stock bajo: Urea 46% - Solo 50 unidades',
  fecha: fecha_actualizacion,
  prioridad: 'alta',
}
```

**Por qué filtro en JS:**
- Supabase no permite comparación directa entre columnas
- Necesitamos comparar `cantidad_actual` vs `stock_minimo`

---

### 2. **Productos por Vencer** (30 días)
```sql
SELECT nombre, fecha_vencimiento 
FROM productos 
WHERE fecha_vencimiento <= NOW() + INTERVAL '30 days'
AND fecha_vencimiento > NOW()
ORDER BY fecha_vencimiento ASC 
LIMIT 2
```

**Alerta generada:**
```typescript
{
  tipo: 'vencimiento',
  mensaje: '📅 Próximo a vencer: Fungicida Ridomil',
  fecha: fecha_vencimiento,
  prioridad: 'media',
}
```

---

### 3. **Monitoreos Críticos Recientes**
```sql
SELECT m.id, m.fecha_monitoreo, m.gravedad_texto,
       l.nombre as lote_nombre,
       p.nombre as plaga_nombre
FROM monitoreos m
JOIN lotes l ON m.lote_id = l.id
JOIN plagas_enfermedades_catalogo p ON m.plaga_enfermedad_id = p.id
WHERE m.gravedad_texto = 'Alta'
ORDER BY m.fecha_monitoreo DESC
LIMIT 2
```

**Alerta generada:**
```typescript
{
  tipo: 'monitoreo',
  mensaje: '🔴 Phytophthora: Nivel crítico en Lote B-3',
  fecha: fecha_monitoreo,
  prioridad: 'alta',
}
```

---

## 🔄 Ejecución en Paralelo

Todas las queries se ejecutan en **paralelo** usando `Promise.allSettled`:

```typescript
const results = await Promise.allSettled([
  loadInventarioMetrics(supabase),
  loadAplicacionesMetrics(supabase),
  loadMonitoreosMetrics(supabase),
  loadProduccionMetrics(supabase),
  loadVentasMetrics(supabase),
  loadLotesMetrics(supabase),
]);
```

**Ventajas:**
- ✅ Más rápido (paralelo vs secuencial)
- ✅ Si una falla, las demás continúan
- ✅ Manejo individual de errores
- ✅ UX mejorada (parcial > completo)

---

## 🛡️ Manejo de Errores

### Error Individual por Métrica
```typescript
const newErrors: Record<string, boolean> = {
  inventario: inventarioResult.status === 'rejected',
  aplicaciones: aplicacionesResult.status === 'rejected',
  // ... etc
};
```

### Valores por Defecto
```typescript
const inventario = inventarioResult.status === 'fulfilled' 
  ? inventarioResult.value 
  : { valorTotal: 0, alertas: 0 }; // Default si falla
```

### Placeholder en UI
```typescript
const getValueOrPlaceholder = (metricKey, value, formatter) => {
  if (errors[metricKey]) return '--';  // Muestra "--"
  return formatter ? formatter(value) : value;
};
```

**Resultado:**
- Si falla "inventario" → muestra "--" pero todo lo demás funciona
- Usuario ve qué datos no están disponibles
- No rompe toda la aplicación

---

## 🎨 Formato de Valores

Todos los valores usan las utilidades de `/utils/format.ts`:

### Moneda (COP)
```typescript
formatCurrency(330000000)
// → "$330,000,000"
```

### Números
```typescript
formatNumber(4250)        // → "4,250"
formatNumber(0.400, 3)    // → "0.400"
```

### Peso (kg)
```typescript
formatWeight(4800)
// → "4,800 kg"
```

### Compacto (millones)
```typescript
formatCompact(330000000)
// → "$330.0M"
```

### Tiempo Relativo
```typescript
formatRelativeTime("2024-11-11T10:30:00Z")
// → "hace 2 horas"
```

---

## ⏱️ Auto-Refresh

El dashboard se actualiza automáticamente:

```typescript
useEffect(() => {
  loadDashboardData();
  
  // Auto-refresh cada 5 minutos (300,000 ms)
  const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
  
  return () => clearInterval(interval); // Cleanup
}, []);
```

**Configurable:**
- Cambiar `5 * 60 * 1000` por tiempo deseado
- Deshabilitar: eliminar el `setInterval`

---

## 🎯 Navegación Contextual

### Desde Métricas
```typescript
<MetricCard
  title="INVENTARIO"
  value="$330M"
  onClick={() => onNavigate('inventory')}
/>
```

### Desde Alertas
```typescript
const handleAlertClick = (alerta: Alerta) => {
  if (alerta.tipo === 'stock') onNavigate('inventory');
  if (alerta.tipo === 'monitoreo') onNavigate('monitoring');
  if (alerta.tipo === 'vencimiento') onNavigate('inventory');
};
```

---

## 📊 Estructura de Datos

### DashboardMetrics
```typescript
interface DashboardMetrics {
  // Valores principales
  inventarioValor: number;
  aplicacionesActivas: number;
  monitoreosCriticos: number;
  produccionSemanal: number;
  ventasMes: number;
  lotesActivos: number;
  
  // Datos para subtítulos
  inventarioAlertas: number;
  proximaAplicacion: string;
  ultimoMonitoreo: string;
  promedioArbol: number;
  clientesActivos: number;
  loteTopNombre: string;
}
```

### Alerta
```typescript
interface Alerta {
  id?: string | number;
  tipo: 'stock' | 'vencimiento' | 'monitoreo';
  mensaje: string;
  fecha?: string;
  prioridad: 'alta' | 'media' | 'baja';
}
```

---

## 🎨 Paleta de Colores

### Verde Principal (`#73991C`)
- Inventario (normal)
- Aplicaciones
- Producción
- Monitoreo (sin críticos)

### Rojo Alertas (`#ef4444`)
- Monitoreo (con críticos)
- Alertas de prioridad alta

### Amarillo Warning (`#f59e0b`)
- Inventario (con alertas)
- Alertas de prioridad media

### Azul Info (`#3b82f6`)
- Ventas

### Gris Neutro (`#6b7280`)
- Lotes
- Alertas de prioridad baja

---

## 🚀 Optimizaciones Implementadas

### 1. Queries Eficientes
```typescript
// Solo campos necesarios
.select('cantidad_actual, precio_unitario, stock_minimo')

// Filtros en la query
.eq('activo', true)
.gte('fecha_monitoreo', hace7Dias)

// Límites para evitar over-fetching
.limit(5)
```

### 2. Cálculos en Cliente
```typescript
// Suma de valores
const total = data?.reduce((sum, item) => sum + item.value, 0) || 0;

// Set para valores únicos
const uniqueClients = new Set(data?.map(d => d.cliente_id)).size;
```

### 3. Manejo de Nulos
```typescript
// Valores por defecto
(p.cantidad_actual || 0) * (p.precio_unitario || 0)

// maybeSingle() en vez de single()
.maybeSingle(); // No falla si no hay resultados
```

---

## 🧪 Testing Manual

### Verificar Cada Métrica

1. **Inventario:**
   ```sql
   -- En Supabase SQL Editor
   SELECT SUM(cantidad_actual * precio_unitario) FROM productos WHERE activo = true;
   ```

2. **Aplicaciones:**
   ```sql
   SELECT COUNT(*) FROM aplicaciones WHERE estado = 'En ejecución';
   ```

3. **Monitoreo:**
   ```sql
   SELECT COUNT(*) FROM monitoreos 
   WHERE gravedad_texto = 'Alta' 
   AND fecha_monitoreo >= CURRENT_DATE - INTERVAL '7 days';
   ```

4. **Producción:**
   ```sql
   SELECT SUM(kilos_cosechados) FROM cosechas
   WHERE fecha_cosecha >= CURRENT_DATE - INTERVAL '7 days';
   ```

5. **Ventas:**
   ```sql
   SELECT SUM(valor_total) FROM despachos
   WHERE fecha_despacho >= DATE_TRUNC('month', CURRENT_DATE);
   ```

6. **Lotes:**
   ```sql
   SELECT COUNT(*) FROM lotes WHERE activo = true;
   ```

---

## 🐛 Troubleshooting

### Problema: Métrica muestra "--"
**Causa:** Error en la query de esa métrica

**Solución:**
1. Abrir consola del navegador (F12)
2. Buscar mensaje de error: `❌ Error cargando [métrica]:`
3. Verificar nombres de columnas en Supabase
4. Revisar política RLS de la tabla

---

### Problema: Alertas no aparecen
**Causa:** No hay datos o error en queries de alertas

**Solución:**
1. Verificar que hay productos con stock bajo
2. Verificar que hay monitoreos críticos
3. Revisar joins: `lotes` y `plagas_enfermedades_catalogo`

---

### Problema: Fechas incorrectas
**Causa:** Zona horaria o formato de fecha

**Solución:**
```typescript
// Siempre usar ISO string para queries
const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0]; // Solo fecha YYYY-MM-DD
```

---

## 📝 Logs de Consola

El dashboard registra todos los errores:

```
✅ Dashboard cargado exitosamente
❌ Error cargando inventario: [error]
⚠️ Error obteniendo próxima aplicación: [error]
```

Para debugging adicional, agregar:
```typescript
console.log('📊 Métricas cargadas:', metrics);
console.log('🚨 Alertas cargadas:', alertas);
```

---

## 🎯 Próximas Mejoras

1. **Cache de datos** - Evitar queries repetidas
2. **Real-time con Supabase Realtime** - Push de actualizaciones
3. **Métricas históricas** - Gráficos de tendencias
4. **Exportar datos** - CSV o PDF
5. **Filtros por fecha** - Rango personalizable

---

**Dashboard completamente funcional con datos reales de Supabase** ✅

- 6 métricas principales ✅
- 3 tipos de alertas ✅
- Manejo robusto de errores ✅
- Auto-refresh cada 5 min ✅
- Queries optimizadas ✅
- UI moderna con MetricCard y AlertList ✅
