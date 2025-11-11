# 📐 Utilidades de Formato - Escocia Hass

Biblioteca completa de funciones para formatear datos en el sistema.

---

## 📦 Instalación

Las funciones están disponibles en `/utils/format.ts`:

```typescript
import { 
  formatCurrency, 
  formatNumber, 
  formatWeight,
  formatRelativeTime 
} from '../utils/format';
```

---

## 💰 formatCurrency

Formatea valores monetarios en pesos colombianos (COP).

### Uso
```typescript
formatCurrency(4250000)  // "$4,250,000 COP"
formatCurrency(1500000)  // "$1,500,000 COP"
formatCurrency(0)        // "$0 COP"
```

### Características
- ✅ Separador de miles con coma
- ✅ Sin decimales (redondeo automático)
- ✅ Sufijo "COP" para claridad
- ✅ Usa `Intl.NumberFormat` (nativo)

---

## 🔢 formatNumber

Formatea números con separador de miles.

### Uso
```typescript
formatNumber(1234567)        // "1,234,567"
formatNumber(1234.567, 2)    // "1,234.57"
formatNumber(100, 0)         // "100"
```

### Parámetros
- `value: number` - Valor a formatear
- `decimals: number` (opcional) - Decimales (default: 0)

### Características
- ✅ Separador de miles
- ✅ Control de decimales
- ✅ Locale colombiano

---

## ⚖️ formatWeight

Formatea pesos en kg o toneladas automáticamente.

### Uso
```typescript
formatWeight(850)      // "850 kg"
formatWeight(1000)     // "1.0 ton"
formatWeight(5400)     // "5.4 ton"
formatWeight(12500)    // "12.5 ton"
```

### Lógica
- `<= 1000 kg` → Muestra en kg (redondeado)
- `> 1000 kg` → Convierte a toneladas (1 decimal)

### Casos de Uso
```typescript
// En Dashboard - Card de Producción
formatWeight(data.weekProduction)  // "4.8 ton"

// En Cosechas
formatWeight(cosecha.kilos)        // "850 kg"
```

---

## ⏰ formatRelativeTime

Formatea fechas como tiempo relativo en español.

### Uso
```typescript
const now = new Date();
const hace5min = new Date(now - 5 * 60 * 1000);

formatRelativeTime(hace5min)  // "hace 5 minutos"
formatRelativeTime('2024-01-10')  // "hace 3 días"
```

### Rangos de Tiempo
| Diferencia | Formato |
|------------|---------|
| < 10 seg | "hace unos segundos" |
| < 60 seg | "hace X segundos" |
| < 60 min | "hace X minutos" |
| < 24 hrs | "hace X horas" |
| < 7 días | "hace X días" |
| < 4 semanas | "hace X semanas" |
| < 12 meses | "hace X meses" |
| >= 1 año | "hace X años" |

### Características
- ✅ Plurales correctos ("1 día" vs "2 días")
- ✅ Acepta `Date` o `string` ISO
- ✅ Texto en español natural

---

## 📅 formatShortDate

Fecha corta legible.

### Uso
```typescript
formatShortDate(new Date('2024-01-15'))  // "15 ene 2024"
formatShortDate('2024-06-15')            // "15 jun 2024"
```

---

## 📅 formatLongDate

Fecha larga completa.

### Uso
```typescript
formatLongDate(new Date('2024-01-15'))  // "15 de enero de 2024"
formatLongDate('2024-06-15')            // "15 de junio de 2024"
```

---

## 📊 formatPercentage

Formatea porcentajes.

### Uso
```typescript
formatPercentage(85.5)      // "85.5%"
formatPercentage(100, 0)    // "100%"
formatPercentage(33.333, 2) // "33.33%"
```

---

## 📈 formatCompact

Formatea números grandes de forma compacta.

### Uso
```typescript
formatCompact(1500)         // "1.5K"
formatCompact(2500000)      // "2.5M"
formatCompact(1500000000)   // "1.5B"
formatCompact(500)          // "500"
```

### Escalas
- **K** (Miles): >= 1,000
- **M** (Millones): >= 1,000,000
- **B** (Billones): >= 1,000,000,000

### Casos de Uso
```typescript
// Dashboard - Valores grandes
`$${formatCompact(330000000)}`  // "$330.0M"

// En vez de "$330,000,000 COP"
```

---

## 🌾 formatHectares

Formatea hectáreas con decimales.

### Uso
```typescript
formatHectares(6.5)   // "6.5 ha"
formatHectares(52)    // "52.0 ha"
```

---

## 📆 formatDateRange

Rango de fechas legible.

### Uso
```typescript
formatDateRange(
  new Date('2024-01-10'),
  new Date('2024-01-20')
)  // "10 ene - 20 ene 2024"
```

---

## ✂️ truncateText

Trunca texto largo.

### Uso
```typescript
truncateText("Este es un texto muy largo", 15)
// "Este es un t..."

truncateText("Corto", 20)
// "Corto"
```

---

## 🔤 capitalize

Capitaliza primera letra.

### Uso
```typescript
capitalize("hola mundo")  // "Hola mundo"
capitalize("HOLA MUNDO")  // "Hola mundo"
```

---

## 📞 formatPhone

Formatea teléfonos colombianos (10 dígitos).

### Uso
```typescript
formatPhone("3201234567")  // "(320) 123-4567"
formatPhone("12345")       // "12345" (sin cambio si inválido)
```

---

## 🏢 formatNIT

Formatea NIT colombiano.

### Uso
```typescript
formatNIT("900123456-7")      // "900.123.456-7"
formatNIT("9001234567")       // "900.123.456-7"
formatNIT("900.123.456-7")    // "900.123.456-7"
```

---

## 🎯 Casos de Uso en el Dashboard

### Card de Inventario
```typescript
value={`$${formatCompact(data.inventoryValue * 1000000)}`}
// "$330.0M"

subtitle={`${formatNumber(data.inventoryAlerts)} alertas`}
// "3 alertas"
```

### Card de Producción
```typescript
value={formatWeight(data.weekProduction)}
// "4.8 ton"

subtitle={`Promedio: ${formatNumber(data.avgPerTree, 3)} kg/árbol`}
// "Promedio: 0.400 kg/árbol"
```

### Card de Ventas
```typescript
value={`$${formatCompact(data.monthlySales * 1000000)}`}
// "$174.4M"

subtitle={`${formatNumber(data.activeClients)} clientes activos`}
// "6 clientes activos"
```

### Alertas
```typescript
time={formatRelativeTime(alerta.fecha)}
// "hace 2 horas"
```

---

## 🧪 Testing

Para probar todas las funciones, ejecuta en consola:

```typescript
import { testAllFormatters } from './utils/format.examples'
testAllFormatters()
```

O prueba individualmente:

```typescript
import { formatCurrency, formatWeight } from './utils/format'

console.log(formatCurrency(4250000))  // "$4,250,000 COP"
console.log(formatWeight(5400))       // "5.4 ton"
```

---

## 📖 Referencia Completa

| Función | Input | Output | Uso Principal |
|---------|-------|--------|---------------|
| `formatCurrency(n)` | `4250000` | "$4,250,000 COP" | Valores monetarios |
| `formatNumber(n, d?)` | `1234567` | "1,234,567" | Números con separador |
| `formatWeight(kg)` | `5400` | "5.4 ton" | Pesos en kg/ton |
| `formatRelativeTime(date)` | `Date` | "hace 2 horas" | Tiempo relativo |
| `formatShortDate(date)` | `Date` | "15 ene 2024" | Fechas cortas |
| `formatLongDate(date)` | `Date` | "15 de enero de 2024" | Fechas completas |
| `formatPercentage(n, d?)` | `85.5` | "85.5%" | Porcentajes |
| `formatCompact(n)` | `2500000` | "2.5M" | Números grandes |
| `formatHectares(n)` | `6.5` | "6.5 ha" | Hectáreas |
| `formatDateRange(d1, d2)` | `Date, Date` | "10 ene - 20 ene" | Rangos |
| `truncateText(s, n)` | `string, 15` | "Texto trunc..." | Textos largos |
| `capitalize(s)` | `"hola"` | "Hola" | Capitalizar |
| `formatPhone(s)` | `"3201234567"` | "(320) 123-4567" | Teléfonos |
| `formatNIT(s)` | `"9001234567"` | "900.123.456-7" | NITs |

---

## 🎨 Convenciones

### Monedas
- Siempre usar `formatCurrency()` para valores monetarios completos
- Usar `formatCompact()` para valores grandes en dashboards
- Agregar prefijo `$` manualmente con `formatCompact()`

### Pesos
- Usar `formatWeight()` para pesos de cosecha/producción
- Automático: kg para < 1 ton, toneladas para >= 1 ton
- Siempre 1 decimal en toneladas

### Fechas
- `formatRelativeTime()` para alertas y actividad reciente
- `formatShortDate()` para tablas y listas
- `formatLongDate()` para detalles y documentos

### Números
- `formatNumber()` para conteos y cantidades
- Especificar decimales solo cuando sea necesario
- 0 decimales por defecto

---

## 🚀 Performance

Todas las funciones son:
- ✅ **Eficientes** - Usan APIs nativas del navegador
- ✅ **Seguras** - Manejo de null/undefined
- ✅ **Rápidas** - Sin dependencias externas
- ✅ **Ligeras** - < 5KB total

---

## 🔄 Actualizaciones

**Versión 1.0** - Noviembre 2024
- ✅ 14 funciones de formato
- ✅ Soporte completo español
- ✅ Locale colombiano
- ✅ Documentación completa

---

**Mantenido por:** Sistema Escocia Hass  
**Ubicación:** `/utils/format.ts`  
**Ejemplos:** `/utils/format.examples.ts`
