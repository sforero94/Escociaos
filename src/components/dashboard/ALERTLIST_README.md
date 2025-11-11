# 🚨 AlertList Component

Componente para mostrar alertas y notificaciones del sistema en el dashboard de Escocia Hass.

---

## 📦 Importación

```typescript
import { 
  AlertList, 
  AlertListHeader, 
  AlertListContainer,
  AlertEmptyState,
  type Alerta 
} from './components/dashboard';
```

---

## 🎯 Uso Básico

```tsx
const alertas: Alerta[] = [
  {
    id: 1,
    tipo: 'stock',
    mensaje: '⚠️ Stock bajo: Urea 46%',
    fecha: new Date(),
    prioridad: 'alta',
  },
  {
    id: 2,
    tipo: 'monitoreo',
    mensaje: '🔴 Phytophthora detectada en Lote B-3',
    fecha: new Date(),
    prioridad: 'alta',
  },
];

<AlertList alertas={alertas} />
```

---

## 📋 Props del Componente

### AlertList

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `alertas` | `Alerta[]` | *required* | Array de alertas a mostrar |
| `loading` | `boolean` | `false` | Estado de carga (muestra skeletons) |
| `maxAlertas` | `number` | `5` | Máximo de alertas visibles |
| `onAlertClick` | `(alerta: Alerta) => void` | `undefined` | Callback al hacer click |

---

## 🔧 Interfaz Alerta

```typescript
interface Alerta {
  /** ID único (opcional, para keys) */
  id?: string | number;
  
  /** Tipo de alerta (determina el icono) */
  tipo: 'stock' | 'vencimiento' | 'monitoreo';
  
  /** Mensaje descriptivo */
  mensaje: string;
  
  /** Fecha de la alerta (Date o string ISO) */
  fecha?: string | Date;
  
  /** Nivel de prioridad (determina el estilo) */
  prioridad: 'alta' | 'media' | 'baja';
}
```

---

## 🎨 Tipos de Alertas

### 1. Stock (AlertTriangle icon)
```tsx
{
  tipo: 'stock',
  mensaje: 'Stock bajo de Urea 46%',
  prioridad: 'alta',
}
```
**Uso:** Inventario bajo, productos faltantes, reposición necesaria

### 2. Vencimiento (Calendar icon)
```tsx
{
  tipo: 'vencimiento',
  mensaje: 'Aplicación programada para mañana',
  prioridad: 'media',
}
```
**Uso:** Aplicaciones programadas, eventos próximos, fechas límite

### 3. Monitoreo (Bug icon)
```tsx
{
  tipo: 'monitoreo',
  mensaje: 'Phytophthora detectada en Lote B-3',
  prioridad: 'alta',
}
```
**Uso:** Plagas detectadas, enfermedades, problemas en campo

---

## 🚦 Niveles de Prioridad

### Alta (Rojo)
```tsx
prioridad: 'alta'
```
- **Color:** Rojo (#DC3545)
- **Borde:** Rojo claro
- **Badge:** Fondo rojo, texto rojo oscuro
- **Barra lateral:** Roja
- **Uso:** Crítico, urgente, requiere acción inmediata

### Media (Amarillo)
```tsx
prioridad: 'media'
```
- **Color:** Amarillo (#FFC107)
- **Borde:** Amarillo claro
- **Badge:** Fondo amarillo, texto amarillo oscuro
- **Barra lateral:** Amarilla
- **Uso:** Advertencia, atención necesaria pronto

### Baja (Gris)
```tsx
prioridad: 'baja'
```
- **Color:** Gris (#6B7280)
- **Borde:** Gris claro
- **Badge:** Fondo gris, texto gris oscuro
- **Barra lateral:** Gris
- **Uso:** Informativo, no urgente

---

## 📅 Fechas Relativas

Las fechas se muestran automáticamente en formato relativo usando `formatRelativeTime()`:

```tsx
{
  fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
  // Se muestra: "hace 2 horas"
}
```

**Formatos automáticos:**
- "hace unos segundos"
- "hace 5 minutos"
- "hace 2 horas"
- "hace 1 día"
- "hace 3 días"
- "hace 2 semanas"
- "hace 1 mes"

---

## ⏳ Estados de Carga

### Con prop loading
```tsx
<AlertList 
  alertas={alertas} 
  loading={true} 
/>
```

Muestra 5 skeletons animados mientras cargan los datos.

---

## ✅ Estado Vacío

Cuando no hay alertas (`alertas.length === 0`):

```tsx
<AlertList alertas={[]} />
```

Muestra automáticamente:
- ✓ Icono CheckCircle verde
- "Todo en orden"
- "No hay alertas pendientes en este momento"

### Empty State Personalizado
```tsx
<AlertEmptyState
  titulo="Sin alertas críticas"
  descripcion="Todas las operaciones funcionan correctamente"
/>
```

---

## 🖱️ Interactividad

### Hacer alertas clickeables
```tsx
<AlertList
  alertas={alertas}
  onAlertClick={(alerta) => {
    if (alerta.tipo === 'stock') {
      navigateTo('/inventory');
    } else if (alerta.tipo === 'monitoreo') {
      navigateTo('/monitoring');
    }
  }}
/>
```

**Efectos cuando es clickeable:**
- Cursor pointer
- Hover: elevación + sombra
- Indicador visual (punto gris)

---

## 📊 Componentes Adicionales

### AlertListHeader
```tsx
<AlertListHeader 
  titulo="Alertas Recientes" 
  count={8} 
/>
```
- Muestra título + badge con contador
- Badge rojo cuando count > 0

### AlertListContainer
```tsx
<AlertListContainer>
  <AlertListHeader titulo="Alertas" count={5} />
  <AlertList alertas={alertas} />
</AlertListContainer>
```
- Wrapper con estilos del dashboard
- Glassmorphism effect
- Gradiente decorativo
- Bordes suaves

---

## 💡 Ejemplo Completo del Dashboard

```tsx
import { 
  AlertList, 
  AlertListHeader, 
  AlertListContainer,
  type Alerta 
} from './components/dashboard';

function Dashboard() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlertas();
  }, []);

  const loadAlertas = async () => {
    const supabase = getSupabase();

    // Alertas de stock bajo
    const { data: lowStock } = await supabase
      .from('productos')
      .select('nombre, cantidad_actual, stock_minimo')
      .lt('cantidad_actual', 'stock_minimo')
      .limit(3);

    const alertasStock: Alerta[] = lowStock?.map((p, i) => ({
      id: `stock-${i}`,
      tipo: 'stock',
      mensaje: `⚠️ Stock bajo: ${p.nombre}`,
      fecha: new Date(),
      prioridad: 'alta',
    })) || [];

    // Alertas de monitoreo crítico
    const { data: critical } = await supabase
      .from('monitoreos')
      .select('plaga_enfermedad_id, fecha_monitoreo')
      .eq('gravedad_texto', 'Alta')
      .limit(2);

    const alertasMonitoreo: Alerta[] = critical?.map((m, i) => ({
      id: `mon-${i}`,
      tipo: 'monitoreo',
      mensaje: `🔴 Incidencia crítica detectada`,
      fecha: new Date(m.fecha_monitoreo),
      prioridad: 'alta',
    })) || [];

    setAlertas([...alertasStock, ...alertasMonitoreo]);
    setLoading(false);
  };

  const handleAlertClick = (alerta: Alerta) => {
    if (alerta.tipo === 'stock') {
      onNavigate('inventory');
    } else if (alerta.tipo === 'monitoreo') {
      onNavigate('monitoring');
    }
  };

  return (
    <div className="space-y-8">
      {/* ... Metric Cards ... */}

      {/* Sección de Alertas */}
      <AlertListContainer>
        <AlertListHeader 
          titulo="Alertas Recientes" 
          count={alertas.length} 
        />
        <AlertList
          alertas={alertas}
          loading={loading}
          onAlertClick={handleAlertClick}
        />
      </AlertListContainer>
    </div>
  );
}
```

---

## 🎨 Diseño y Características

### Efectos Visuales
- ✅ **Cards individuales** por alerta
- ✅ **Barra lateral** de color según prioridad
- ✅ **Badge** de prioridad con color
- ✅ **Iconos** según tipo de alerta
- ✅ **Hover effects:** elevación + sombra
- ✅ **Transiciones suaves** (200ms)
- ✅ **Responsive** en móvil

### Estructura de Card
```
┌─────────────────────────────────┐
│ │ [ICONO] [Badge: Alta] hace 2h │
│ │ Mensaje de la alerta aquí     │
└─────────────────────────────────┘
  └─ Barra lateral de color
```

---

## 🔢 Límite de Alertas

Por defecto muestra **máximo 5 alertas**:

```tsx
<AlertList 
  alertas={arrayDe10Alertas} 
  maxAlertas={5}  // Solo muestra 5
/>
```

Si hay más alertas, muestra indicador:
```
"+5 alertas más"
```

### Cambiar el límite
```tsx
<AlertList 
  alertas={alertas} 
  maxAlertas={10}  // Mostrar hasta 10
/>
```

---

## 📱 Responsive

El componente es **mobile-first**:

- ✅ Funciona en pantallas desde 320px
- ✅ Stack vertical automático
- ✅ Padding adaptativo
- ✅ Texto legible en móvil
- ✅ Touch-friendly (areas grandes)

---

## 🎯 Casos de Uso

### 1. Dashboard Principal
```tsx
<AlertListContainer>
  <AlertListHeader titulo="Alertas del Sistema" count={alertas.length} />
  <AlertList alertas={alertas} onAlertClick={handleClick} />
</AlertListContainer>
```

### 2. Widget de Alertas
```tsx
<div className="widget">
  <AlertList alertas={alertasRecientes} maxAlertas={3} />
</div>
```

### 3. Notificaciones en Tiempo Real
```tsx
useEffect(() => {
  const subscription = supabase
    .channel('alertas')
    .on('INSERT', (payload) => {
      setAlertas((prev) => [payload.new, ...prev]);
    })
    .subscribe();

  return () => subscription.unsubscribe();
}, []);
```

---

## 🧪 Testing

Para probar todas las variantes:

```tsx
import { AlertListShowcase } from './components/dashboard';

// Renderizar showcase completo
<AlertListShowcase />
```

O probar individualmente:

```tsx
import { AlertListExamples } from './components/dashboard';

// Probar ejemplo específico
<AlertListExamples.BasicAlertListExample />
```

---

## 🐛 Troubleshooting

### Las fechas no se muestran correctamente
```tsx
// ❌ Mal - string sin formato
fecha: "2024-01-15"

// ✅ Bien - Date object o ISO string
fecha: new Date()
fecha: "2024-01-15T10:30:00Z"  // ISO string
```

### Los iconos no se ven
Asegúrate de importar Lucide icons:
```tsx
import { AlertTriangle, Calendar, Bug } from 'lucide-react';
```

### Las alertas no son clickeables
```tsx
// ❌ Mal - sin callback
<AlertList alertas={alertas} />

// ✅ Bien - con callback
<AlertList 
  alertas={alertas} 
  onAlertClick={(alerta) => console.log(alerta)} 
/>
```

---

## ⚡ Performance

- **Ligero:** < 3KB gzipped
- **Optimizado:** Re-renders mínimos
- **Limit built-in:** Solo renderiza alertas visibles
- **Memoizable:** Compatible con React.memo()

---

## 🎨 Paleta de Colores

Según diseño de Escocia Hass:

| Elemento | Color |
|----------|-------|
| Primary | `#73991C` (verde aguacate) |
| Success | `#73991C` |
| Warning | `#FFC107` (amarillo) |
| Error | `#DC3545` (rojo) |
| Background | `#F8FAF5` (crema suave) |

---

## 📖 Más Recursos

- **Ejemplos completos:** `/components/dashboard/AlertList.examples.tsx`
- **Showcase visual:** `/components/dashboard/AlertList.showcase.tsx`
- **Tipos TypeScript:** Incluidos en `/components/dashboard/AlertList.tsx`

---

**Componente creado para:** Sistema Escocia Hass  
**Versión:** 1.0  
**Ubicación:** `/components/dashboard/AlertList.tsx`  
**Última actualización:** Noviembre 2024
