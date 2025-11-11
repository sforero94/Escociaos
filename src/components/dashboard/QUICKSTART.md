# ⚡ QuickStart - MetricCard

Guía de inicio rápido para usar MetricCard en 2 minutos.

---

## 📦 Paso 1: Importar

```typescript
import { MetricCard, MetricCardGrid } from './components/dashboard';
import { Package, TrendingUp, DollarSign } from 'lucide-react';
```

---

## 🚀 Paso 2: Usar (Ejemplo Básico)

```tsx
function MiDashboard() {
  return (
    <MetricCardGrid>
      <MetricCard
        title="Inventario Total"
        value="$4,250,000"
        icon={<Package className="w-6 h-6" />}
        color="green"
      />
      
      <MetricCard
        title="Producción Semanal"
        value="4.8 ton"
        icon={<TrendingUp className="w-6 h-6" />}
        trend="up"
        trendValue="+12%"
        color="green"
      />
      
      <MetricCard
        title="Ventas del Mes"
        value="$174M"
        icon={<DollarSign className="w-6 h-6" />}
        trend="down"
        trendValue="-3%"
        color="red"
      />
    </MetricCardGrid>
  );
}
```

---

## ✅ ¡Listo!

Ya tienes un dashboard funcional con 3 cards.

---

## 🎯 Props Más Comunes

```typescript
// REQUERIDAS
title: string           // "Inventario Total"
value: string | number  // "$4,250,000" o 42
icon: ReactNode         // <Package className="w-6 h-6" />

// OPCIONALES
color: "green" | "blue" | "yellow" | "red" | "gray"  // Default: "green"
trend: "up" | "down" | "neutral"                      // Opcional
trendValue: string                                     // "+12%"
subtitle: string                                       // "3 alertas pendientes"
onClick: () => void                                    // Hace la card clickeable
loading: boolean                                       // Muestra skeleton
```

---

## 🎨 Colores Rápidos

```tsx
color="green"   // ✅ Valores positivos, ingresos, éxito
color="blue"    // ℹ️ Información neutral
color="yellow"  // ⚠️ Advertencias
color="red"     // ❌ Crítico, urgente
color="gray"    // ➖ Neutral
```

---

## 📈 Tendencias Rápidas

```tsx
trend="up" trendValue="+12%"      // ⬆️ Incremento (verde)
trend="down" trendValue="-8%"     // ⬇️ Disminución (rojo)
trend="neutral" trendValue="0%"   // ➖ Sin cambios (gris)
```

---

## 💡 Con Datos Dinámicos

```tsx
function Dashboard() {
  const [data, setData] = useState({ 
    inventory: 0, 
    production: 0 
  });

  useEffect(() => {
    // Cargar datos de API
    fetchData().then(setData);
  }, []);

  return (
    <MetricCardGrid>
      <MetricCard
        title="Inventario"
        value={`$${data.inventory.toLocaleString()}`}
        icon={<Package className="w-6 h-6" />}
        loading={!data.inventory} // Skeleton mientras carga
      />
    </MetricCardGrid>
  );
}
```

---

## 🔗 Next Steps

1. 📖 Ver ejemplos completos → `MetricCard.examples.tsx`
2. 🎨 Ver todas las variantes → `MetricCard.showcase.tsx`
3. 📚 Documentación completa → `METRICCARD_README.md`

---

## 🆘 Problemas Comunes

### El icono no se ve
```tsx
// ❌ Mal
icon={<Package />}

// ✅ Bien
icon={<Package className="w-6 h-6" />}
```

### La tendencia no aparece
```tsx
// ❌ Mal (falta trendValue)
trend="up"

// ✅ Bien
trend="up"
trendValue="+12%"
```

---

**¡Disfruta usando MetricCard!** 🎉
