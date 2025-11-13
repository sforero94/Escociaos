# 🚨 INSTRUCCIÓN CRÍTICA - VALIDACIÓN DE ESQUEMA DE DATOS

## ⚠️ REGLA OBLIGATORIA

**ANTES de modificar cualquier código que interactúe con la base de datos, DEBES:**

1. **ABRIR Y REVISAR** el archivo `/supabase_tablas.md`
2. **VERIFICAR** los nombres exactos de:
   - Tablas
   - Columnas/campos
   - Tipos de datos
   - Valores de ENUMs (con mayúsculas, tildes, y formato exacto)
   - Constraints y relaciones
3. **COMPARAR** con el código TypeScript en `/types/*.ts`
4. **CORREGIR** cualquier discrepancia

---

## 📋 CHECKLIST OBLIGATORIO

Antes de escribir código que use la base de datos:

- [ ] He leído la sección correspondiente de `/supabase_tablas.md`
- [ ] He verificado los nombres de campos en la documentación
- [ ] He verificado los valores de ENUMs (mayúsculas, tildes)
- [ ] He revisado el archivo TypeScript type en `/types/`
- [ ] Los nombres en mi código coinciden EXACTAMENTE con la BD
- [ ] Las comparaciones de strings usan los valores exactos del ENUM

---

## ⚡ ERRORES COMUNES A EVITAR

### ❌ MAL:
```typescript
// Campo incorrecto
aplicacion.tipo  // ❌ NO EXISTE EN BD

// Valor incorrecto
if (aplicacion.tipo_aplicacion === 'fertilizacion')  // ❌ minúscula sin tilde

// Type incorrecto
interface Aplicacion {
  tipo: string;  // ❌ campo no existe en BD
}
```

### ✅ BIEN:
```typescript
// Campo correcto según BD
aplicacion.tipo_aplicacion  // ✅ existe en tabla aplicaciones

// Valor correcto según ENUM
if (aplicacion.tipo_aplicacion === 'Fertilización')  // ✅ mayúscula con tilde

// Type correcto
interface Aplicacion {
  tipo_aplicacion: 'Fumigación' | 'Fertilización' | 'Drench';  // ✅ coincide con BD
}
```

---

## 🔍 CAMPOS CRÍTICOS DE USO FRECUENTE

### Tabla: `aplicaciones`
- ✅ `tipo_aplicacion` (NO `tipo`)
- ✅ Valores: `'Fumigación' | 'Fertilización' | 'Drench'`

### Tabla: `movimientos_diarios`
- ✅ `numero_canecas` (existe)
- ⚠️ `numero_bultos` (VERIFICAR si existe - no está en doc original)
- ✅ `condiciones_meteorologicas` (puede ser null)

### Tabla: `productos`
- ✅ `unidad_medida` (NO `unidad`)
- ✅ Valores: `'litros' | 'kilos' | 'unidades'`

---

## 🎯 PROCESO DE DESARROLLO

1. **Recibir tarea que involucre BD**
2. **PARAR** ✋
3. **ABRIR** `/supabase_tablas.md`
4. **LEER** la sección de la tabla involucrada
5. **VERIFICAR** tipos en `/types/*.ts`
6. **ESCRIBIR** código con nombres exactos
7. **VALIDAR** que las comparaciones usen valores exactos del ENUM

---

## 🚀 ACTUALIZACIÓN DE ESTA INSTRUCCIÓN

Si encuentras una discrepancia entre el código y la documentación:

1. La documentación (`/supabase_tablas.md`) es la **FUENTE DE VERDAD**
2. Corrige primero los types en `/types/*.ts`
3. Luego corrige todos los componentes que usen ese type
4. Usa búsqueda global para encontrar todas las referencias

---

**ESTA INSTRUCCIÓN ES OBLIGATORIA Y NO NEGOCIABLE.**

La calidad del sistema depende de que cada línea de código que interactúe con la base de datos use los nombres y valores EXACTOS documentados.
