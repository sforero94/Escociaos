# 🏷️ REFERENCIA RÁPIDA DE ENUMS - SUPABASE

**Sistema:** Escocia Hass  
**Última actualización:** 2024-11-13  
**Propósito:** Referencia rápida de todos los valores de ENUM del sistema

---

## ⚠️ IMPORTANTE

- Los ENUMs son **case-sensitive** (sensibles a mayúsculas/minúsculas)
- Usar EXACTAMENTE como se muestran aquí
- NO inventar valores, solo usar los definidos
- Consultar `/supabase_tablas.md` para más detalles

---

## 📋 TODOS LOS ENUMS DEL SISTEMA

### 1️⃣ `tipo_aplicacion`

```sql
'Fumigación'
'Fertilización'
'Drench'
```

**Uso:** Tabla `aplicaciones`, campo `tipo_aplicacion`

**Ejemplo:**
```typescript
await supabase
  .from('aplicaciones')
  .insert({ tipo_aplicacion: 'Fumigación' });
```

---

### 2️⃣ `estado_aplicacion`

```sql
'Calculada'
'En ejecución'
'Cerrada'
```

**Uso:** Tabla `aplicaciones`, campo `estado`

**Flujo:**
```
Calculada → En ejecución → Cerrada
```

**Ejemplo:**
```typescript
await supabase
  .from('aplicaciones')
  .update({ estado: 'En ejecución' })
  .eq('id', aplicacionId);
```

---

### 3️⃣ `categoria_producto`

```sql
'Fertilizante'
'Fungicida'
'Insecticida'
'Acaricida'
'Herbicida'
'Biocontrolador'
'Coadyuvante'
'Herramienta'
'Equipo'
'Otros'
```

**Uso:** Tabla `productos`, campo `categoria`

**Ejemplo:**
```typescript
await supabase
  .from('productos')
  .insert({ 
    nombre: 'Producto A',
    categoria: 'Fungicida'
  });
```

---

### 4️⃣ `grupo_producto`

```sql
'Agroinsumos'
'Herramientas'
'Maquinaria y equipo'
```

**Uso:** Tabla `productos`, campo `grupo`

**Ejemplo:**
```typescript
await supabase
  .from('productos')
  .insert({ 
    nombre: 'Bomba de espalda',
    grupo: 'Herramientas'
  });
```

---

### 5️⃣ `tipo_aplicacion_producto`

```sql
'Foliar'
'Edáfico'
'Drench'
```

**Uso:** Tabla `productos`, campo `tipo_aplicacion`

**Ejemplo:**
```typescript
await supabase
  .from('productos')
  .insert({ 
    nombre: 'Fertilizante NPK',
    tipo_aplicacion: 'Edáfico'
  });
```

---

### 6️⃣ `estado_fisico`

```sql
'Liquido'
'Sólido'
```

**Uso:** Tabla `productos`, campo `estado_fisico`

**Ejemplo:**
```typescript
await supabase
  .from('productos')
  .insert({ 
    nombre: 'Fungicida X',
    estado_fisico: 'Liquido'
  });
```

---

### 7️⃣ `estado_producto`

```sql
'OK'
'Sin existencias'
'Vencido'
'Perdido'
```

**Uso:** Tabla `productos`, campo `estado`

**Ejemplo:**
```typescript
await supabase
  .from('productos')
  .update({ estado: 'Sin existencias' })
  .eq('cantidad_actual', 0);
```

---

### 8️⃣ `tipo_movimiento` ⭐ CRÍTICO

```sql
'Entrada'
'Salida por Aplicación'
'Salida Otros'
'Ajuste'
```

**Uso:** Tabla `movimientos_inventario`, campo `tipo_movimiento`

**Cuándo usar cada uno:**

| Valor | Cuándo Usar | Ejemplo |
|-------|-------------|---------|
| `'Entrada'` | Compras, ingresos | Nueva compra de producto |
| `'Salida por Aplicación'` | Salidas por aplicaciones fitosanitarias | Al cerrar una aplicación ✅ |
| `'Salida Otros'` | Otras salidas no relacionadas con aplicaciones | Pérdida, daño, donación |
| `'Ajuste'` | Correcciones de inventario | Verificaciones físicas |

**Ejemplo - Cierre de Aplicación:**
```typescript
await supabase
  .from('movimientos_inventario')
  .insert({
    fecha_movimiento: new Date(),
    producto_id: productoId,
    tipo_movimiento: 'Salida por Aplicación', // ✅ CORRECTO
    cantidad: 5.0,
    unidad: 'L',
    aplicacion_id: aplicacionId,
    observaciones: 'Cierre de aplicación: APP-001'
  });
```

**❌ INCORRECTO:**
```typescript
tipo_movimiento: 'Salida' // ❌ NO EXISTE EN ENUM
tipo_movimiento: 'salida por aplicación' // ❌ Minúsculas
tipo_movimiento: 'Salida Por Aplicación' // ❌ Mayúsculas incorrectas
```

---

### 9️⃣ `estado_verificacion`

```sql
'En proceso'
'Completada'
'Pendiente Aprobación'
'Aprobada'
'Rechazada'
```

**Uso:** Tabla `verificaciones_inventario`, campo `estado`

**Flujo:**
```
En proceso → Completada → Pendiente Aprobación → Aprobada/Rechazada
```

**Ejemplo:**
```typescript
await supabase
  .from('verificaciones_inventario')
  .update({ estado: 'Completada' })
  .eq('id', verificacionId);
```

---

### 🔟 `gravedad_texto`

```sql
'Baja'
'Media'
'Alta'
```

**Uso:** Tabla `monitoreos`, campo `gravedad_texto`

**Ejemplo:**
```typescript
await supabase
  .from('monitoreos')
  .insert({ 
    gravedad_texto: 'Alta',
    gravedad_numerica: 3
  });
```

**Correlación:**
```
Baja → gravedad_numerica: 1
Media → gravedad_numerica: 2
Alta → gravedad_numerica: 3
```

---

### 1️⃣1️⃣ `rol_usuario`

```sql
'Administrador'
'Verificador'
'Gerencia'
```

**Uso:** Tabla `usuarios`, campo `rol`

**Permisos:**
- **Administrador:** Acceso completo al sistema
- **Verificador:** Realizar verificaciones de inventario
- **Gerencia:** Autorizar aplicaciones y ajustes importantes

**Ejemplo:**
```typescript
await supabase
  .from('usuarios')
  .insert({ 
    email: 'usuario@example.com',
    rol: 'Administrador'
  });
```

---

### 1️⃣2️⃣ `condiciones_meteorologicas`

```sql
'soleadas'
'nubladas'
'lluvia suave'
'lluvia fuerte'
```

**Uso:** Puede usarse en tablas de aplicaciones o monitoreos para registrar condiciones climáticas

**Nota:** Todos en minúsculas

**Ejemplo:**
```typescript
// En observaciones o campo específico
condiciones: 'soleadas'
```

---

## 🎯 ERRORES COMUNES Y CÓMO EVITARLOS

### ❌ Error #1: Mayúsculas/Minúsculas Incorrectas

```typescript
// ❌ INCORRECTO
tipo_movimiento: 'entrada'  // Debe ser 'Entrada'
estado_aplicacion: 'CERRADA'  // Debe ser 'Cerrada'
categoria: 'fungicida'  // Debe ser 'Fungicida'

// ✅ CORRECTO
tipo_movimiento: 'Entrada'
estado_aplicacion: 'Cerrada'
categoria: 'Fungicida'
```

### ❌ Error #2: Valores Inventados

```typescript
// ❌ INCORRECTO
tipo_movimiento: 'Salida'  // NO EXISTE
estado_producto: 'Bajo Stock'  // NO EXISTE (es 'Sin existencias')
categoria: 'Pesticida'  // NO EXISTE

// ✅ CORRECTO
tipo_movimiento: 'Salida por Aplicación'
estado_producto: 'Sin existencias'
categoria: 'Fungicida'
```

### ❌ Error #3: Acentos Mal Colocados

```typescript
// ❌ INCORRECTO
tipo_aplicacion: 'Fumigacion'  // Falta acento
tipo_aplicacion: 'Fertilizacion'  // Falta acento
estado_aplicacion: 'En ejecucion'  // Falta acento

// ✅ CORRECTO
tipo_aplicacion: 'Fumigación'
tipo_aplicacion: 'Fertilización'
estado_aplicacion: 'En ejecución'
```

---

## 🔍 VALIDACIÓN RÁPIDA

### Verificar si un valor es válido (SQL)

```sql
-- Ver todos los valores posibles de un ENUM
SELECT enumlabel 
FROM pg_enum 
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
WHERE pg_type.typname = 'tipo_movimiento';

-- Resultado:
-- 'Entrada'
-- 'Salida por Aplicación'
-- 'Salida Otros'
-- 'Ajuste'
```

### Filtrar por ENUM (TypeScript)

```typescript
// Búsqueda case-sensitive exacta
const { data } = await supabase
  .from('aplicaciones')
  .select('*')
  .eq('estado', 'En ejecución');  // ✅ EXACTO

// Para búsquedas múltiples
const { data } = await supabase
  .from('productos')
  .select('*')
  .in('categoria', ['Fungicida', 'Insecticida', 'Herbicida']);
```

---

## 📊 TABLA RESUMEN

| ENUM | Tabla Principal | Campo | Valores |
|------|----------------|-------|---------|
| `tipo_aplicacion` | `aplicaciones` | `tipo_aplicacion` | Fumigación, Fertilización, Drench |
| `estado_aplicacion` | `aplicaciones` | `estado` | Calculada, En ejecución, Cerrada |
| `categoria_producto` | `productos` | `categoria` | 10 categorías |
| `grupo_producto` | `productos` | `grupo` | Agroinsumos, Herramientas, Maquinaria y equipo |
| `tipo_aplicacion_producto` | `productos` | `tipo_aplicacion` | Foliar, Edáfico, Drench |
| `estado_fisico` | `productos` | `estado_fisico` | Liquido, Sólido |
| `estado_producto` | `productos` | `estado` | OK, Sin existencias, Vencido, Perdido |
| `tipo_movimiento` | `movimientos_inventario` | `tipo_movimiento` | Entrada, Salida por Aplicación, Salida Otros, Ajuste |
| `estado_verificacion` | `verificaciones_inventario` | `estado` | 5 estados |
| `gravedad_texto` | `monitoreos` | `gravedad_texto` | Baja, Media, Alta |
| `rol_usuario` | `usuarios` | `rol` | Administrador, Verificador, Gerencia |
| `condiciones_meteorologicas` | - | - | soleadas, nubladas, lluvia suave, lluvia fuerte |

---

## 🚨 CHECKLIST ANTES DE INSERTAR

Antes de hacer cualquier INSERT/UPDATE con ENUMs:

- [ ] ¿El valor está escrito EXACTAMENTE como aparece en este documento?
- [ ] ¿Las mayúsculas y minúsculas coinciden?
- [ ] ¿Los acentos están correctos?
- [ ] ¿Los espacios están en el lugar correcto? (ej: "Salida por Aplicación")
- [ ] ¿No estoy inventando un valor nuevo?

---

## 📚 RECURSOS ADICIONALES

- **Documentación completa:** `/supabase_tablas.md`
- **Errores corregidos:** `/ERRORES_CORREGIDOS.md`
- **Queries de verificación:** `/QUERIES_VERIFICACION.sql`

---

**Última actualización:** 2024-11-13  
**Versión:** 1.0  
**Mantenido por:** Sistema Escocia Hass

---

🎯 **¡Usa este archivo como referencia rápida al escribir código!**
