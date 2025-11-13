# ✅ VALIDACIÓN DE BLANCO BIOLÓGICO VERIFICADA

**Fecha:** 2024-11-13  
**Estado:** ✅ CONFIRMADO Y CORREGIDO

---

## 🎯 VALIDACIÓN IMPLEMENTADA

### Reglas de Validación

```typescript
// En PasoConfiguracion.tsx - función validar()

// ✅ SOLO para fumigación
if (formData.tipo === 'fumigacion') {
  // Validar blanco biológico solo en fumigación
  if (!formData.blanco_biologico || formData.blanco_biologico.length === 0) {
    nuevosErrores.blanco_biologico = 
      'Debes seleccionar al menos un blanco biológico para fumigaciones';
  }

  // Validar calibración y canecas
  formData.lotes_seleccionados?.forEach((lote) => {
    if (!lote.calibracion_litros_arbol || lote.calibracion_litros_arbol <= 0) {
      nuevosErrores[`lote_${lote.lote_id}`] = 'Falta calibración';
    }
    if (!lote.tamano_caneca) {
      nuevosErrores[`lote_${lote.lote_id}`] = 'Falta tamaño de caneca';
    }
  });
}

// ✅ Para fertilización y drench: NO se valida blanco biológico
```

---

## 📋 COMPORTAMIENTO POR TIPO DE APLICACIÓN

### 1. FUMIGACIÓN

**Campo visible:** ✅ Sí  
**Validación obligatoria:** ✅ Sí  
**Mensaje de error:** "Debes seleccionar al menos un blanco biológico para fumigaciones"

**Otros campos obligatorios:**
- ✅ Calibración (L/árbol)
- ✅ Tamaño de caneca

---

### 2. FERTILIZACIÓN

**Campo visible:** ❌ No (oculto)  
**Validación obligatoria:** ❌ No  
**Mensaje de error:** -ninguno-

**Campos obligatorios:**
- ✅ Nombre de aplicación
- ✅ Fecha de inicio
- ✅ Al menos un lote

**Campos NO requeridos:**
- ❌ Blanco biológico (oculto)
- ❌ Calibración (no aplica)
- ❌ Tamaño de caneca (no aplica)

---

### 3. DRENCH

**Campo visible:** ❌ No (oculto)  
**Validación obligatoria:** ❌ No  
**Mensaje de error:** -ninguno-

**Comportamiento igual a fertilización**

---

## 🧪 CASOS DE PRUEBA

### ✅ Test Case 1: Fumigación sin Blanco Biológico

```
Pasos:
1. Crear aplicación tipo "Fumigación"
2. Completar nombre, fecha, lote
3. NO seleccionar blanco biológico
4. Intentar avanzar

Resultado Esperado:
❌ Debe mostrar error: "Debes seleccionar al menos un blanco biológico para fumigaciones"
✅ NO debe permitir avanzar
```

---

### ✅ Test Case 2: Fumigación con Blanco Biológico

```
Pasos:
1. Crear aplicación tipo "Fumigación"
2. Completar nombre, fecha, lote
3. ✅ Seleccionar al menos un blanco biológico (ej: Trips)
4. Configurar calibración y caneca
5. Intentar avanzar

Resultado Esperado:
✅ NO debe mostrar error de blanco biológico
✅ Debe permitir avanzar al siguiente paso
```

---

### ✅ Test Case 3: Fertilización sin Blanco Biológico

```
Pasos:
1. Crear aplicación tipo "Fertilización"
2. Completar nombre, fecha, lote
3. Campo blanco biológico NO está visible
4. Intentar avanzar

Resultado Esperado:
✅ NO debe mostrar error de blanco biológico
✅ Debe permitir avanzar al siguiente paso
✅ Campo blanco_biologico queda vacío/undefined
```

---

### ✅ Test Case 4: Cambio de Tipo (Fumigación → Fertilización)

```
Pasos:
1. Crear aplicación tipo "Fumigación"
2. Seleccionar blanco biológico (ej: Trips)
3. Cambiar tipo a "Fertilización"
4. Campo blanco biológico desaparece
5. Intentar avanzar

Resultado Esperado:
✅ Campo oculto
✅ NO debe mostrar error de blanco biológico
✅ Valor previamente seleccionado se mantiene en memoria
✅ Debe permitir avanzar
```

---

### ✅ Test Case 5: Cambio de Tipo (Fertilización → Fumigación)

```
Pasos:
1. Crear aplicación tipo "Fertilización"
2. Completar datos básicos (sin blanco biológico)
3. Cambiar tipo a "Fumigación"
4. Campo blanco biológico aparece vacío
5. Intentar avanzar sin seleccionar

Resultado Esperado:
✅ Campo visible y vacío
❌ Debe mostrar error: "Debes seleccionar al menos un blanco biológico para fumigaciones"
✅ NO debe permitir avanzar hasta seleccionar al menos uno
```

---

## 📊 MATRIZ DE VALIDACIONES

| Tipo | Campo Visible | Obligatorio | Error si vacío | Puede avanzar |
|------|---------------|-------------|----------------|---------------|
| **Fumigación** | ✅ Sí | ✅ Sí | ✅ Sí | ❌ No |
| **Fertilización** | ❌ No | ❌ No | ❌ No | ✅ Sí |
| **Drench** | ❌ No | ❌ No | ❌ No | ✅ Sí |

---

## 🔍 CÓDIGO RELEVANTE

### Renderizado Condicional (Línea 444)

```tsx
{/* Blancos Biológicos - Solo para fumigación */}
{formData.tipo === 'fumigacion' && (
  <div className="md:col-span-2">
    <label className="block text-sm text-[#4D240F] mb-2">
      Blancos Biológicos (Plagas/Enfermedades) *
    </label>
    {/* ... resto del componente ... */}
  </div>
)}
```

### Validación Condicional (Línea 269)

```tsx
// Validaciones específicas de fumigación
if (formData.tipo === 'fumigacion') {
  // Validar blanco biológico solo en fumigación
  if (!formData.blanco_biologico || formData.blanco_biologico.length === 0) {
    nuevosErrores.blanco_biologico = 
      'Debes seleccionar al menos un blanco biológico para fumigaciones';
  }
  // ... otras validaciones de fumigación ...
}
```

### Mensaje de Error (Línea 544)

```tsx
{errores.blanco_biologico && (
  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
    <AlertCircle className="w-4 h-4" />
    {errores.blanco_biologico}
  </p>
)}
```

---

## ✅ CHECKLIST DE VERIFICACIÓN

- [x] Campo solo visible en fumigación
- [x] Campo oculto en fertilización
- [x] Campo oculto en drench
- [x] Validación solo activa en fumigación
- [x] Validación NO activa en fertilización
- [x] Validación NO activa en drench
- [x] Mensaje de error específico
- [x] Permite avanzar en fertilización sin blanco biológico
- [x] NO permite avanzar en fumigación sin blanco biológico
- [x] Estado se mantiene al cambiar tipo

---

## 🎯 CONCLUSIÓN

✅ **VALIDACIÓN CORRECTA:**
- Blanco biológico SOLO es obligatorio para fumigaciones
- Fertilizaciones y drench NO requieren blanco biológico
- Campo se oculta automáticamente cuando no es necesario
- Validación se aplica condicionalmente según el tipo

---

**Estado:** ✅ VERIFICADO Y FUNCIONANDO CORRECTAMENTE  
**Archivo:** `/components/aplicaciones/PasoConfiguracion.tsx`  
**Líneas modificadas:** 269-279, 444-551

---

🎉 **¡Listo para continuar con los puntos 3 y 5!**
