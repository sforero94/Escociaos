# ⚡ QuickStart - AlertList

Guía de inicio rápido para usar AlertList en 2 minutos.

---

## 📦 Paso 1: Importar

```typescript
import { 
  AlertList, 
  AlertListHeader, 
  AlertListContainer,
  type Alerta 
} from './components/dashboard';
```

---

## 🚀 Paso 2: Definir Alertas

```tsx
const alertas: Alerta[] = [
  {
    tipo: 'stock',
    mensaje: '⚠️ Stock bajo: Urea 46%',
    fecha: new Date(),
    prioridad: 'alta',
  },
  {
    tipo: 'monitoreo',
    mensaje: '🔴 Phytophthora en Lote B-3',
    fecha: new Date(),
    prioridad: 'alta',
  },
  {
    tipo: 'vencimiento',
    mensaje: '📅 Aplicación programada mañana',
    fecha: new Date(),
    prioridad: 'media',
  },
];
```

---

## 🎯 Paso 3: Renderizar

```tsx
function MiDashboard() {
  return (
    <AlertListContainer>
      <AlertListHeader titulo="Alertas Recientes" count={alertas.length} />
      <AlertList alertas={alertas} />
    </AlertListContainer>
  );
}
```

---

## ✅ ¡Listo!

Ya tienes un sistema de alertas funcional.

---

## 🎨 Tipos de Alerta

```tsx
tipo: 'stock'        // 🔺 AlertTriangle - Inventario
tipo: 'vencimiento'  // 📅 Calendar - Fechas/eventos
tipo: 'monitoreo'    // 🐛 Bug - Plagas/enfermedades
```

---

## 🚦 Prioridades

```tsx
prioridad: 'alta'    // ❌ Rojo - Crítico/urgente
prioridad: 'media'   // ⚠️ Amarillo - Advertencia
prioridad: 'baja'    // ℹ️ Gris - Informativo
```

---

## 🖱️ Hacer Clickeables

```tsx
<AlertList
  alertas={alertas}
  onAlertClick={(alerta) => {
    if (alerta.tipo === 'stock') {
      navigateTo('/inventory');
    }
  }}
/>
```

---

## ⏳ Loading State

```tsx
<AlertList 
  alertas={[]} 
  loading={true}  // Muestra skeletons
/>
```

---

## ✅ Sin Alertas (Empty State)

```tsx
<AlertList 
  alertas={[]}  // Array vacío
  loading={false}
/>
// Muestra: "Todo en orden ✓"
```

---

## 📊 Con Datos de API

```tsx
function Dashboard() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cargar de Supabase
    fetchAlertas().then((data) => {
      setAlertas(data);
      setLoading(false);
    });
  }, []);

  return (
    <AlertList alertas={alertas} loading={loading} />
  );
}
```

---

## 🎯 Props Rápidas

```typescript
// REQUERIDA
alertas: Alerta[]          // Array de alertas

// OPCIONALES
loading: boolean           // Default: false
maxAlertas: number         // Default: 5
onAlertClick: (a) => void  // Callback
```

---

## 📋 Interfaz Alerta

```typescript
{
  id?: string | number,           // Opcional
  tipo: 'stock' | 'vencimiento' | 'monitoreo',
  mensaje: string,
  fecha?: Date | string,          // Opcional
  prioridad: 'alta' | 'media' | 'baja'
}
```

---

## 💡 Ejemplo Completo Real

```tsx
import { 
  AlertList, 
  AlertListContainer, 
  AlertListHeader,
  type Alerta 
} from './components/dashboard';

function Dashboard() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: '⚠️ Stock bajo: Urea 46% - Solo 50 kg',
      fecha: new Date(Date.now() - 2 * 60 * 60 * 1000), // hace 2h
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'monitoreo',
      mensaje: '🔴 Phytophthora: Nivel crítico en Lote B-3',
      fecha: new Date(Date.now() - 1 * 60 * 60 * 1000), // hace 1h
      prioridad: 'alta',
    },
    {
      id: 3,
      tipo: 'vencimiento',
      mensaje: '📅 Aplicación programada: Fertilización foliar',
      fecha: new Date(Date.now() - 30 * 60 * 1000), // hace 30min
      prioridad: 'media',
    },
  ];

  const handleClick = (alerta: Alerta) => {
    console.log('Click en:', alerta.tipo);
  };

  return (
    <div className="p-6">
      <AlertListContainer>
        <AlertListHeader 
          titulo="Alertas del Sistema" 
          count={alertas.length} 
        />
        <AlertList 
          alertas={alertas} 
          onAlertClick={handleClick}
          maxAlertas={5}
        />
      </AlertListContainer>
    </div>
  );
}
```

---

## 🔗 Next Steps

1. 📖 Ver ejemplos completos → `AlertList.examples.tsx`
2. 🎨 Ver todas las variantes → `AlertList.showcase.tsx`
3. 📚 Documentación completa → `ALERTLIST_README.md`

---

## 🆘 Problemas Comunes

### No se ven las fechas relativas
```tsx
// ❌ Mal
fecha: "2024-01-15"

// ✅ Bien
fecha: new Date()
```

### No es clickeable
```tsx
// ❌ Mal (falta callback)
<AlertList alertas={alertas} />

// ✅ Bien
<AlertList 
  alertas={alertas} 
  onAlertClick={(a) => console.log(a)} 
/>
```

---

**¡Disfruta usando AlertList!** 🎉
