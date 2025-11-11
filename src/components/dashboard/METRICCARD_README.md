# 📊 MetricCard Component

Componente reutilizable para mostrar métricas y KPIs en el dashboard de Escocia Hass.

---

## 📦 Importación

```typescript
import { MetricCard, MetricCardGrid, MetricCardSkeleton } from './components/dashboard/MetricCard';
import { Package, TrendingUp, DollarSign } from 'lucide-react';
```

---

## 🎯 Uso Básico

```tsx
<MetricCard
  title="Inventario Total"
  value="$4,250,000"
  icon={<Package className="w-6 h-6" />}
  trend="up"
  trendValue="+12%"
  color="green"
/>
```

---

## 📋 Props

### Props Requeridas

| Prop | Tipo | Descripción |
|------|------|-------------|
| `title` | `string` | Título de la métrica (se muestra en mayúsculas) |
| `value` | `string \| number` | Valor principal a mostrar |
| `icon` | `ReactNode` | Icono de lucide-react |

### Props Opcionales

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `trend` | `'up' \| 'down' \| 'neutral'` | `undefined` | Dirección de la tendencia |
| `trendValue` | `string` | `undefined` | Valor de cambio (ej: "+12%") |
| `loading` | `boolean` | `false` | Muestra skeleton loader |
| `color` | `'green' \| 'blue' \| 'yellow' \| 'red' \| 'gray'` | `'green'` | Color del tema |
| `subtitle` | `string` | `undefined` | Descripción adicional |
| `onClick` | `() => void` | `undefined` | Hace la card clickeable |

---

## 🎨 Variantes de Color

### Green (Primary) - Default
```tsx
<MetricCard
  title="Inventario"
  value="$330M"
  icon={<Package className="w-6 h-6" />}
  color="green"
/>
```
**Uso:** Valores positivos, ingresos, éxito, producción

### Blue
```tsx
<MetricCard
  title="Lotes Activos"
  value="8"
  icon={<MapPin className="w-6 h-6" />}
  color="blue"
/>
```
**Uso:** Información neutral, áreas, ubicaciones, datos generales

### Yellow
```tsx
<MetricCard
  title="Alertas"
  value="3"
  icon={<Activity className="w-6 h-6" />}
  color="yellow"
/>
```
**Uso:** Advertencias, alertas moderadas, stock bajo

### Red
```tsx
<MetricCard
  title="Críticos"
  value="2"
  icon={<Activity className="w-6 h-6" />}
  color="red"
/>
```
**Uso:** Problemas críticos, errores, situaciones urgentes

### Gray
```tsx
<MetricCard
  title="Total Árboles"
  value="12,000"
  icon={<Sprout className="w-6 h-6" />}
  color="gray"
/>
```
**Uso:** Datos neutrales, conteos, información secundaria

---

## 📈 Indicadores de Tendencia

### Tendencia Positiva (Up)
```tsx
<MetricCard
  title="Ventas"
  value="$174M"
  icon={<DollarSign className="w-6 h-6" />}
  trend="up"
  trendValue="+12.5%"
  color="green"
/>
```
- ✅ Icono: Flecha arriba-derecha
- ✅ Color: Verde
- ✅ Fondo: Verde suave

### Tendencia Negativa (Down)
```tsx
<MetricCard
  title="Stock"
  value="850 kg"
  icon={<Package className="w-6 h-6" />}
  trend="down"
  trendValue="-8.2%"
  color="red"
/>
```
- ❌ Icono: Flecha abajo-derecha
- ❌ Color: Rojo
- ❌ Fondo: Rojo suave

### Sin Cambios (Neutral)
```tsx
<MetricCard
  title="Clientes"
  value="42"
  icon={<Users className="w-6 h-6" />}
  trend="neutral"
  trendValue="0%"
  color="gray"
/>
```
- ➖ Icono: Línea horizontal
- ➖ Color: Gris
- ➖ Fondo: Gris suave

---

## ⏳ Estados de Carga

### Opción 1: Prop `loading`
```tsx
<MetricCard
  title="Cargando..."
  value="--"
  icon={<Activity className="w-6 h-6" />}
  loading={true}
/>
```

### Opción 2: Componente `MetricCardSkeleton`
```tsx
{isLoading ? (
  <MetricCardSkeleton />
) : (
  <MetricCard {...props} />
)}
```

### Opción 3: Grid con Skeletons
```tsx
<MetricCardGrid>
  <MetricCardSkeleton />
  <MetricCardSkeleton />
  <MetricCardSkeleton />
</MetricCardGrid>
```

---

## 🖱️ Cards Interactivas

```tsx
<MetricCard
  title="Producción"
  value="4.8 ton"
  icon={<TrendingUp className="w-6 h-6" />}
  onClick={() => navigateTo('/produccion')}
/>
```

**Efectos al hacer clickeable:**
- ✅ Cursor pointer
- ✅ Indicador visual en hover (punto gris)
- ✅ Toda la card es clickeable

---

## 📐 Layout con MetricCardGrid

### Grid Responsive Automático
```tsx
<MetricCardGrid>
  <MetricCard {...card1Props} />
  <MetricCard {...card2Props} />
  <MetricCard {...card3Props} />
  <MetricCard {...card4Props} />
  <MetricCard {...card5Props} />
  <MetricCard {...card6Props} />
</MetricCardGrid>
```

**Columnas por breakpoint:**
- 📱 Mobile: 1 columna
- 📱 Tablet: 2 columnas
- 💻 Desktop: 3 columnas

---

## 💡 Ejemplos Reales del Dashboard

### Card de Inventario
```tsx
<MetricCard
  title="INVENTARIO"
  value={`$${formatCompact(data.inventoryValue * 1000000)}`}
  subtitle={`${formatNumber(data.inventoryAlerts)} alertas`}
  icon={<Package className="w-6 h-6" />}
  trend="up"
  trendValue="+5.2%"
  color="green"
  onClick={() => onNavigate('inventory')}
/>
```

### Card de Producción
```tsx
<MetricCard
  title="PRODUCCIÓN"
  value={formatWeight(data.weekProduction)}
  subtitle={`Promedio: ${formatNumber(data.avgPerTree, 3)} kg/árbol`}
  icon={<TrendingUp className="w-6 h-6" />}
  trend="up"
  trendValue="+12.8%"
  color="green"
  onClick={() => onNavigate('production')}
/>
```

### Card de Ventas
```tsx
<MetricCard
  title="VENTAS"
  value={`$${formatCompact(data.monthlySales * 1000000)}`}
  subtitle={`${formatNumber(data.activeClients)} clientes activos`}
  icon={<DollarSign className="w-6 h-6" />}
  trend="down"
  trendValue="-3.5%"
  color="red"
/>
```

### Card de Alertas Críticas
```tsx
<MetricCard
  title="MONITOREO"
  value={`${formatNumber(data.criticalIncidents)} Críticas`}
  subtitle={`Último: ${data.lastMonitoring}`}
  icon={<Activity className="w-6 h-6" />}
  trend="down"
  trendValue="-1"
  color={data.criticalIncidents > 0 ? 'red' : 'green'}
/>
```

---

## 🎭 Casos de Uso Avanzados

### 1. Cards Dinámicas desde API
```tsx
const metrics = await fetchMetrics();

<MetricCardGrid>
  {metrics.map((metric) => (
    <MetricCard
      key={metric.id}
      title={metric.title}
      value={metric.value}
      icon={<metric.icon className="w-6 h-6" />}
      trend={metric.trend}
      trendValue={metric.trendValue}
      color={metric.color}
    />
  ))}
</MetricCardGrid>
```

### 2. Condicionales por Valor
```tsx
<MetricCard
  title="Stock"
  value={data.stock}
  icon={<Package className="w-6 h-6" />}
  color={data.stock < 100 ? 'red' : 'green'}
  trend={data.stock < 100 ? 'down' : 'up'}
/>
```

### 3. Formato con Utilidades
```tsx
import { formatCurrency, formatWeight, formatNumber } from '../../utils/format';

<MetricCard
  title="Inventario"
  value={formatCurrency(inventoryValue)}
  icon={<Package className="w-6 h-6" />}
/>
```

---

## 🎨 Diseño y Características

### Efectos Visuales
- ✅ **Sombra suave** en estado normal
- ✅ **Sombra pronunciada** en hover
- ✅ **Elevación** al hacer hover (-translate-y)
- ✅ **Gradient overlay** en hover
- ✅ **Icono animado** (scale-110 en hover)
- ✅ **Transiciones suaves** (300ms)

### Accesibilidad
- ✅ Textos con contraste apropiado
- ✅ Tamaños de fuente legibles
- ✅ Iconos con significado claro
- ✅ Estados interactivos claros

### Responsive
- ✅ Funciona en mobile (320px+)
- ✅ Adapta padding en pantallas pequeñas
- ✅ Grid automático con MetricCardGrid

---

## 🔧 Customización Avanzada

### Cambiar Tamaño del Icono
```tsx
<MetricCard
  icon={<Package className="w-8 h-8" />}  // Más grande
  {...otherProps}
/>
```

### Agregar Subtítulo Dinámico
```tsx
<MetricCard
  subtitle={
    data.alerts > 0 
      ? `⚠️ ${data.alerts} alertas pendientes` 
      : '✅ Todo en orden'
  }
  {...otherProps}
/>
```

---

## ⚡ Performance

- **Ligero:** < 2KB gzipped
- **Sin dependencias:** Solo React y Lucide icons
- **Optimizado:** Re-renders mínimos
- **Memoizable:** Compatible con React.memo()

---

## 🐛 Troubleshooting

### El icono no se muestra
```tsx
// ❌ Mal - sin className
icon={<Package />}

// ✅ Bien - con tamaño
icon={<Package className="w-6 h-6" />}
```

### La tendencia no aparece
```tsx
// ❌ Mal - solo trend sin trendValue
trend="up"

// ✅ Bien - ambos props
trend="up"
trendValue="+12%"
```

### El skeleton no funciona
```tsx
// ❌ Mal - loading sin props requeridas
<MetricCard loading={true} />

// ✅ Bien - todas las props requeridas
<MetricCard
  title="Cargando"
  value="--"
  icon={<Package className="w-6 h-6" />}
  loading={true}
/>
```

---

## 📚 Más Ejemplos

Ver archivo completo de ejemplos:
👉 `/components/dashboard/MetricCard.examples.tsx`

Incluye:
- ✅ 12 ejemplos diferentes
- ✅ Casos de uso reales
- ✅ Integraciones con API
- ✅ Responsive patterns
- ✅ Tips y mejores prácticas

---

## 🎯 Guía de Colores por Métrica

| Métrica | Color Recomendado | Razón |
|---------|-------------------|-------|
| Inventario | `green` | Valor económico positivo |
| Producción | `green` | Resultado exitoso |
| Ventas | `blue` o `green` | Transaccional |
| Alertas | `yellow` | Advertencia |
| Críticos | `red` | Urgente |
| Lotes | `blue` | Informativo |
| Aplicaciones | `yellow` | Programado |
| Monitoreo | `red` / `yellow` | Según gravedad |
| Clientes | `gray` | Neutral |

---

**Componente creado para:** Sistema Escocia Hass  
**Versión:** 1.0  
**Ubicación:** `/components/dashboard/MetricCard.tsx`  
**Última actualización:** Noviembre 2024
