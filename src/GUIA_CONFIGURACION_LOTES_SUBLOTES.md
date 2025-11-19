# 🎯 GUÍA DE USO - Configuración de Lotes y Sublotes

## 📋 RESUMEN

Has solicitado crear una funcionalidad en el módulo de **Configuración** para editar lotes y sublotes desde la UI web, evitando ejecutar scripts SQL directamente en Supabase.

✅ **IMPLEMENTADO COMPLETAMENTE**

---

## 🚀 ACCESO AL MÓDULO

### **Paso 1: Navegar a Configuración**
```
Menú lateral → Configuración (icono ⚙️)
```

### **Paso 2: Seleccionar pestaña**
- **Lotes** → Gestión de los 12 lotes del cultivo
- **Sublotes** → Gestión de sublotes agrupados por lote

---

## 📍 GESTIÓN DE LOTES

### **1. CREAR UN LOTE**

1. **Click en "Nuevo Lote"** (botón verde superior derecha)
2. **Completa el formulario:**
   - **Nombre del Lote*** (obligatorio): Ej: `"1. Piedra Paula"`
   - **Número de Orden**: 1, 2, 3... (para ordenar)
   - **Área (hectáreas)**: Ej: `5.5`
   - **Árboles Grandes**: Cantidad
   - **Árboles Medianos**: Cantidad
   - **Árboles Pequeños**: Cantidad
   - **Árboles Clonales**: Cantidad
   - **Lote activo**: Switch (ON por defecto)
3. **Click en "Guardar"**
4. ✅ Toast: "Lote creado exitosamente"

**Ejemplo de lote completo:**
```
Nombre: 1. Piedra Paula
Número de Orden: 1
Área: 4.5 hectáreas
Árboles Grandes: 850
Árboles Medianos: 320
Árboles Pequeños: 150
Árboles Clonales: 0
Activo: Sí
```

---

### **2. EDITAR UN LOTE**

1. **Click en el ícono de lápiz** (Editar) en el lote que desees editar
2. **Se abre el formulario inline** con todos los campos
3. **Modifica los campos** que necesites
4. **Click en "Guardar"** o **"Cancelar"**
5. ✅ Toast: "Lote actualizado exitosamente"

**Campos editables:**
- ✅ Nombre
- ✅ Número de orden
- ✅ Área en hectáreas
- ✅ Cantidad de árboles (grandes, medianos, pequeños, clonales)
- ✅ Estado activo/inactivo

---

### **3. ELIMINAR UN LOTE**

1. **Click en el ícono de basura** (Eliminar)
2. **Se abre un diálogo de confirmación:**
   ```
   ¿Eliminar lote?
   Estás a punto de eliminar el lote "1. Piedra Paula".
   Esta acción no se puede deshacer.
   ⚠️ Este lote tiene 1320 árboles registrados.
   ```
3. **Click en "Eliminar"** o **"Cancelar"**
4. ✅ Toast: "Lote eliminado exitosamente"

**⚠️ IMPORTANTE:**
- Si el lote tiene sublotes, aplicaciones o monitoreos asociados, **no se podrá eliminar**
- Recibirás un mensaje claro:
  ```
  ❌ No se puede eliminar el lote porque tiene registros 
     asociados (sublotes, aplicaciones, etc.)
  ```

---

### **4. REORDENAR LOTES**

1. **Usa las flechas ⬆️⬇️** al lado de cada lote
2. **El orden se actualiza inmediatamente**
3. ✅ Toast: "Orden actualizado"

**Notas:**
- Los lotes se ordenan por el campo `numero_orden`
- Las flechas se deshabilitan en los extremos (primero/último)
- Útil para mantener el orden lógico de tu cultivo

---

## 🌱 GESTIÓN DE SUBLOTES

### **1. CREAR UN SUBLOTE**

1. **Click en "Nuevo Sublote"** (botón verde superior derecha)
2. **Completa el formulario:**
   - **Lote*** (obligatorio): Selecciona del dropdown
   - **Nombre del Sublote*** (obligatorio): Ej: `"Sublote 1"`
   - **Número de Sublote**: 1, 2, 3...
   - **Árboles Grandes**: Cantidad
   - **Árboles Medianos**: Cantidad
   - **Árboles Pequeños**: Cantidad
   - **Árboles Clonales**: Cantidad
3. **Click en "Guardar"**
4. ✅ Toast: "Sublote creado exitosamente"

**Ejemplo de sublote completo:**
```
Lote: 1. Piedra Paula
Nombre: Sublote 1
Número de Sublote: 1
Árboles Grandes: 280
Árboles Medianos: 105
Árboles Pequeños: 50
Árboles Clonales: 0
```

---

### **2. VISTA AGRUPADA POR LOTE**

Los sublotes se muestran **agrupados por lote padre** con:
- ✅ **Header colapsable** por cada lote
- ✅ **Badge** con cantidad de sublotes
- ✅ **Expansión/Colapso** con un click

**Ejemplo visual:**
```
🔽 1. Piedra Paula [3 sublotes]
   ├─ Sublote 1 (Total: 435 árboles)
   ├─ Sublote 2 (Total: 442 árboles)
   └─ Sublote 3 (Total: 443 árboles)

🔽 2. Salto de Tequendama [3 sublotes]
   ├─ Sublote 1 (Total: 320 árboles)
   ├─ Sublote 2 (Total: 315 árboles)
   └─ Sublote 3 (Total: 318 árboles)
```

---

### **3. EDITAR UN SUBLOTE**

1. **Expande el lote** (click en el header)
2. **Click en el ícono de lápiz** del sublote
3. **Se abre el formulario inline**
4. **Modifica los campos** (incluyendo cambiar de lote padre)
5. **Click en "Guardar"** o **"Cancelar"**
6. ✅ Toast: "Sublote actualizado exitosamente"

**Campos editables:**
- ✅ Lote padre (puedes mover el sublote a otro lote)
- ✅ Nombre
- ✅ Número de sublote
- ✅ Cantidad de árboles (grandes, medianos, pequeños, clonales)

---

### **4. ELIMINAR UN SUBLOTE**

1. **Expande el lote**
2. **Click en el ícono de basura** del sublote
3. **Se abre un diálogo de confirmación:**
   ```
   ¿Eliminar sublote?
   Estás a punto de eliminar el sublote "Sublote 1" 
   del lote "1. Piedra Paula".
   Esta acción no se puede deshacer.
   ⚠️ Este sublote tiene 435 árboles registrados.
   ```
4. **Click en "Eliminar"** o **"Cancelar"**
5. ✅ Toast: "Sublote eliminado exitosamente"

**⚠️ IMPORTANTE:**
- Si el sublote tiene monitoreos o aplicaciones asociados, **no se podrá eliminar**
- Recibirás un mensaje claro

---

### **5. REORDENAR SUBLOTES**

1. **Expande el lote**
2. **Usa las flechas ⬆️⬇️** al lado de cada sublote
3. **El orden se actualiza dentro del lote**
4. ✅ Toast: "Orden actualizado"

**Notas:**
- Los sublotes se ordenan por `numero_sublote` **dentro de cada lote**
- El reordenamiento es independiente por lote
- No afecta el orden de sublotes de otros lotes

---

## 📊 CAMPOS CALCULADOS

### **Total de Árboles (GENERATED)**

Tanto en **lotes** como en **sublotes**, el campo `total_arboles` es calculado automáticamente por PostgreSQL:

```sql
total_arboles = arboles_grandes + arboles_medianos + 
                arboles_pequenos + arboles_clonales
```

**No necesitas calcularlo manualmente** - se actualiza automáticamente al guardar.

---

## 🎯 FLUJO RECOMENDADO PARA SETUP INICIAL

### **Opción 1: Crear todo desde la UI** (RECOMENDADO)

```
PASO 1: Crear los 12 lotes
├─ Configuración → Lotes → Nuevo Lote
├─ 1. Piedra Paula
├─ 2. Salto de Tequendama
├─ 3. Australia
├─ 4. La Vega
├─ 5. Pedregal
├─ 6. La Unión
├─ 7. El Triunfo
├─ 8. Irlanda
├─ 8. Irlanda - clonales
├─ 9. Acueducto
├─ 9. Acueducto - clonales
└─ 10. Santa Rosa

PASO 2: Crear 3 sublotes por lote
├─ Configuración → Sublotes → Nuevo Sublote
├─ Para "1. Piedra Paula":
│   ├─ Sublote 1
│   ├─ Sublote 2
│   └─ Sublote 3
├─ Para "2. Salto de Tequendama":
│   ├─ Sublote 1
│   ├─ Sublote 2
│   └─ Sublote 3
└─ ... (repetir para todos los lotes)

PASO 3: Ajustar conteos de árboles
├─ Editar cada lote con datos reales
└─ Editar cada sublote con datos reales

PASO 4: Verificar
├─ Revisar totales por lote
└─ Revisar totales por sublote
```

**Tiempo estimado:** 30-40 minutos

---

### **Opción 2: Carga masiva con CSV** (ALTERNATIVA)

Si tienes los datos en Excel:

```
PASO 1: Crear lotes desde la UI (12 lotes)
└─ Solo con nombres, sin datos de árboles

PASO 2: Crear sublotes desde la UI (36 sublotes)
└─ Solo con nombres, sin datos de árboles

PASO 3: Cargar CSV de monitoreo
└─ El sistema mapeará automáticamente
```

**Ventaja:** Los lotes y sublotes quedan creados correctamente para el mapeo CSV

---

## 🔒 SEGURIDAD Y VALIDACIÓN

### **Validaciones Implementadas:**

✅ **Nombre obligatorio** en lotes y sublotes  
✅ **Lote padre obligatorio** en sublotes  
✅ **Valores numéricos** validados en inputs  
✅ **Confirmación de eliminación** con diálogo  
✅ **Manejo de foreign keys** con mensajes claros  
✅ **Estado de loading** para prevenir doble-submit  

### **Permisos:**

- ✅ Cualquier usuario autenticado puede ver lotes/sublotes
- ✅ Solo usuarios con permisos de configuración pueden editar
- ✅ Las operaciones usan Row Level Security (RLS) de Supabase

---

## 💡 TIPS Y MEJORES PRÁCTICAS

### **1. Nomenclatura Consistente**

✅ **BUENO:**
```
Lotes:
- 1. Piedra Paula
- 2. Salto de Tequendama
- 3. Australia

Sublotes:
- Sublote 1
- Sublote 2
- Sublote 3
```

❌ **EVITAR:**
```
Lotes:
- Piedra Paula (sin número)
- Lote 2 (sin nombre)
- Lote3 (sin espacio)

Sublotes:
- Sub1 (abreviado)
- S.L. 1 (abreviado)
- Uno (en texto)
```

**Razón:** La nomenclatura consistente facilita el mapeo CSV y reduce errores.

---

### **2. Orden Lógico**

Usa el campo `numero_orden` para mantener un orden lógico:

```
1. Lotes principales primero
2. Lotes clonales después
3. Seguir orden geográfico o cronológico
```

**Ejemplo:**
```
1. Piedra Paula (orden: 1)
2. Salto de Tequendama (orden: 2)
...
8. Irlanda (orden: 8)
9. Irlanda - clonales (orden: 9)
```

---

### **3. Datos de Árboles**

- Ingresa los datos más precisos posibles
- Si no tienes datos exactos, usa 0 temporalmente
- El `total_arboles` se calcula automáticamente
- Puedes actualizar los datos posteriormente

---

### **4. Antes de Eliminar**

⚠️ Verifica que el lote/sublote no tenga:
- Monitoreos de plagas
- Aplicaciones fitosanitarias
- Registros de producción
- Otros registros asociados

Si tiene registros, considera:
- ✅ Marcar como **inactivo** en lugar de eliminar (solo lotes)
- ✅ Mover registros a otro lote/sublote primero

---

## 🔄 INTEGRACIÓN CON CARGA CSV

Una vez que hayas creado lotes y sublotes desde la UI:

### **El CSV funcionará automáticamente:**

```
CSV:
Lote: "1. Piedra Paula"
Sublote: "Sublote 1"

↓ MAPEO AUTOMÁTICO ↓

BD:
lote_id: <UUID del lote>
sublote_id: <UUID del sublote>
```

### **Ventajas:**

✅ **Nombres controlados** - Evitas typos en el CSV  
✅ **Foreign keys válidos** - Los IDs existen en la BD  
✅ **Mapeo exitoso** - 2831/2831 filas transformadas  
✅ **Sin errores** - Inserción limpia  

---

## 📈 MÉTRICAS ESPERADAS

Después del setup completo deberías tener:

| Métrica | Valor |
|---------|-------|
| **Lotes** | 12 |
| **Sublotes** | 36 (3 por lote) |
| **Total árboles** | ~5,000-6,000 (depende de tus datos) |
| **Lotes activos** | 12 (o los que uses) |
| **Tiempo de setup** | 30-40 min |

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### **❌ "No se puede eliminar el lote"**

**Causa:** Tiene sublotes u otros registros asociados

**Solución:**
1. Elimina primero los sublotes del lote
2. Elimina otros registros asociados (monitoreos, aplicaciones)
3. Intenta nuevamente
4. O marca el lote como inactivo

---

### **❌ "No puedo ver los lotes en el dropdown"**

**Causa:** No hay lotes creados

**Solución:**
1. Ve a la pestaña "Lotes"
2. Crea al menos 1 lote
3. Vuelve a la pestaña "Sublotes"
4. Ahora aparecerá en el dropdown

---

### **❌ "El total de árboles no se actualiza"**

**Causa:** Es un campo GENERATED, debería actualizarse automáticamente

**Solución:**
1. Verifica que guardaste los cambios
2. Recarga la página (F5)
3. Si persiste, revisa la consola por errores

---

### **❌ "No puedo reordenar"**

**Causa:** Estás en el primer o último elemento

**Solución:**
- Las flechas se deshabilitan en los extremos
- Usa la otra flecha o edita el `numero_orden` manualmente

---

## 🎉 LISTO PARA USAR

Con esta funcionalidad puedes:

✅ **Crear y gestionar lotes** de forma segura  
✅ **Crear y gestionar sublotes** organizados por lote  
✅ **Editar cualquier campo** sin riesgo  
✅ **Reordenar** según necesites  
✅ **Preparar la BD** para carga CSV de monitoreo  
✅ **Evitar scripts SQL** directos en Supabase  

**¿Siguiente paso?**  
Empieza a crear tus 12 lotes y 36 sublotes desde la UI. ¡Es rápido y seguro! 🚀

---

**Versión:** 1.0  
**Fecha:** 2025-11-15  
**Autor:** Sistema Escosia Hass  
**Módulo:** Configuración - Lotes y Sublotes  
