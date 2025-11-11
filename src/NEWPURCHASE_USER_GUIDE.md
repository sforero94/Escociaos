# 📖 NewPurchase.tsx - Guía de Usuario

## 🎯 Casos de Uso Prácticos

### Caso 1: Compra Simple de 1 Producto
**Escenario:** Compra de 50 kg de Fertilizante NPK

#### Pasos:
1. Usuario ingresa a "Nueva Compra"
2. Completa datos generales:
   - Proveedor: "AgroSupply Colombia"
   - Factura: "F-2025-001"
   - Fecha: (hoy por defecto)
3. En la búsqueda escribe: "fertil"
4. Aparece filtrado: "1 producto(s) encontrado(s)"
5. Selecciona "Fertilizante NPK 15-15-15" en el primer producto
6. Precio se auto-completa: $45,000
7. Ingresa cantidad: 50
8. Ingresa lote: "L2025-NPK-001"
9. Marca checkbox "PG" ✓
10. Click en "Registrar Compra"
11. Aparece diálogo:
    ```
    ¿Confirma el registro de compra con 1 producto(s)
    por un valor total de $2,250,000?
    
    Proveedor: AgroSupply Colombia
    Factura: F-2025-001
    ```
12. Click en "Sí, Registrar Compra"
13. Toast: "💾 Guardando compra..."
14. Toast: "✅ Compra registrada exitosamente: 1 producto(s) - Factura F-2025-001"
15. Toast: "📊 Inventario actualizado automáticamente"
16. Redirige a Movimientos después de 2 seg

**Panel de Resumen muestra:**
- Proveedor: AgroSupply Colombia
- Factura: F-2025-001
- Fecha: 11/01/2025
- Productos: **1**
- Total: **$2,250,000**
- Lista:
  - 1. Fertilizante NPK 15-15-15 ✓ PG
    - Cantidad: 50 kg
    - Precio: $45,000
    - Subtotal: $2,250,000

---

### Caso 2: Compra Múltiple de 5 Productos
**Escenario:** Compra mensual de insumos variados

#### Productos:
1. Fertilizante NPK - 100 kg - $45,000/kg
2. Fungicida Propineb - 20 L - $85,000/L
3. Insecticida Lambda - 10 L - $120,000/L
4. Adherente Agrícola - 5 L - $35,000/L
5. Cal Agrícola - 200 kg - $800/kg

#### Pasos:
1. Completa datos generales:
   - Proveedor: "Insumos Del Campo SAS"
   - Factura: "IDC-2025-0156"
2. Producto 1:
   - Busca: "fertil" → Selecciona NPK
   - Cantidad: 100
   - Precio: $45,000 (auto)
   - Lote: "L2025-NPK-002"
   - Marca PG ✓
3. Click "➕ Agregar Producto"
4. Toast: "➕ Producto agregado a la lista"
5. Producto 2:
   - Busca: "fungi" → Selecciona Propineb
   - Cantidad: 20
   - Precio: $85,000
   - Fecha vencimiento: 2026-12-31
   - Marca PG ✓
6. Repite para productos 3, 4, 5
7. Panel de resumen muestra:
   - Productos: **5**
   - Total: **$7,460,000**
8. Click "Registrar Compra"
9. Diálogo muestra resumen completo
10. Confirma y guarda

**Validación en Panel:**
- ✅ Todos tienen ✓ PG
- ✅ Total calculado correctamente
- ✅ Lista completa visible con scroll

---

### Caso 3: Error - Falta Checkbox PG
**Escenario:** Usuario olvida marcar "PG" en el producto 3

#### Pasos:
1. Agrega 4 productos
2. Marca PG en productos 1, 2, 4
3. **NO** marca PG en producto 3
4. Click "Registrar Compra"
5. **Toast ERROR aparece:**
   ```
   ❌ Producto 3: Debe marcar "Permitido por Gerencia" (PG)
   ```
6. Usuario identifica fácilmente cuál es el problema
7. Marca checkbox PG en producto 3
8. Click "Registrar Compra" nuevamente
9. Ahora sí valida correctamente

**Sin el nuevo sistema:**
- ❌ Mensaje genérico: "Todos los productos deben tener marcado..."
- ❌ Usuario tiene que revisar los 4 productos manualmente

**Con el nuevo sistema:**
- ✅ Mensaje específico: "Producto 3: Debe marcar..."
- ✅ Usuario va directo al producto 3

---

### Caso 4: Búsqueda Rápida
**Escenario:** Usuario necesita encontrar producto en lista de 50+

#### Sin Búsqueda (Antes):
```
Select con 50+ productos:
- Abono Orgánico
- Adherente Agrícola
- ...
- (scroll manual)
- ...
- Fertilizante NPK  ← Difícil de encontrar
```
**Tiempo:** ~30 segundos

#### Con Búsqueda (Ahora):
```
Input: "fertil" [Enter]
Select filtrado:
- Fertilizante NPK
- Fertilizante Urea
- Fertilizante Triple 15
```
**Tiempo:** ~3 segundos

**Mejora:** 10x más rápido

---

### Caso 5: Prevención de Errores
**Escenario:** Usuario intenta acciones inválidas

#### 5a. Agregar más de 20 productos
```
Usuario: Click en "➕ Agregar Producto" (producto #21)
Sistema: Toast Warning
⚠️ Máximo 20 productos por compra
Acción: Bloqueada
```

#### 5b. Eliminar el último producto
```
Usuario: Click en icono 🗑️ del único producto
Sistema: Toast Warning
⚠️ Debe mantener al menos un producto
Acción: Bloqueada
```

#### 5c. Guardar sin proveedor
```
Usuario: Click "Registrar Compra"
Sistema: Toast Error
❌ El proveedor es obligatorio
Acción: Bloqueada
```

**Ventajas:**
- ✅ Previene errores antes de llegar a BD
- ✅ Mensajes claros y accionables
- ✅ No intrusivo (toast, no modal)

---

### Caso 6: Confirmación Inteligente
**Escenario:** Usuario revisa antes de guardar

#### Diálogo muestra:
```
Confirmar Registro de Compra

¿Confirma el registro de compra con 3 producto(s)
por un valor total de $5,420,000?

Proveedor: AgroSupply Colombia
Factura: F-2025-001

[Sí, Registrar Compra] [Cancelar]
```

#### Usuario detecta error:
- Ve que el total está muy alto
- Click en "Cancelar"
- Revisa precios de productos
- Corrige el precio del producto 2
- Intenta nuevamente
- Ahora el total es correcto: $3,420,000
- Confirma y guarda

**Sin confirmación:**
- ❌ Guardado inmediato con error
- ❌ Hay que crear movimiento correctivo
- ❌ Trazabilidad complicada

**Con confirmación:**
- ✅ Detecta error antes de guardar
- ✅ Corrige en el mismo flujo
- ✅ No hay movimientos incorrectos

---

## 🎨 Interfaz Visual

### Panel de Resumen - Estados

#### Estado Inicial (Sin datos)
```
┌─────────────────────────┐
│  📊 Resumen de Compra   │
├─────────────────────────┤
│  Proveedor: -           │
│  Factura: -             │
│  Fecha: 11/01/2025      │
├─────────────────────────┤
│  Productos en Compra    │
│         1               │
├─────────────────────────┤
│  Valor Total            │
│    $ 0                  │
├─────────────────────────┤
│  📦                     │
│  Seleccione productos   │
└─────────────────────────┘
```

#### Con 1 Producto Completo
```
┌─────────────────────────┐
│  📊 Resumen de Compra   │
├─────────────────────────┤
│  Proveedor: AgroSupply  │
│  Factura: F-001         │
│  Fecha: 11/01/2025      │
├─────────────────────────┤
│  Productos en Compra    │
│         1               │
├─────────────────────────┤
│  Valor Total            │
│    $ 2,250,000          │
├─────────────────────────┤
│  Productos Selec.:      │
│  ┌───────────────────┐  │
│  │ 1. Fertilizante   │  │
│  │    NPK 15-15-15   │  │
│  │    ✓ PG           │  │
│  │    50 kg          │  │
│  │    $45,000/kg     │  │
│  │    $2,250,000     │  │
│  └───────────────────┘  │
├─────────────────────────┤
│  ℹ️ GlobalGAP: Todos... │
└─────────────────────────┘
```

#### Con 5 Productos (Scroll)
```
┌─────────────────────────┐
│  📊 Resumen de Compra   │
├─────────────────────────┤
│  ...info general...     │
├─────────────────────────┤
│  Productos en Compra    │
│         5               │
├─────────────────────────┤
│  Valor Total            │
│    $ 7,460,000          │
├─────────────────────────┤
│  Productos Selec.:      │
│  ┌───────────────────┐  │
│  │ 1. Fertilizante ▲ │  │
│  │ 2. Fungicida      │  │
│  │ 3. Insecticida    │  │  ← Scroll
│  │ 4. Adherente      │  │
│  │ 5. Cal Agrícola ▼ │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

---

## 📱 Uso en Móvil

### Mobile (375px) - Flujo Completo

#### Paso 1: Datos Generales
```
┌──────────────────────┐
│  Nueva Compra        │
├──────────────────────┤
│  Fecha: [2025-01-11] │
│                      │
│  Proveedor:          │
│  [AgroSupply      ]  │
│                      │
│  Factura:            │
│  [F-001           ]  │
└──────────────────────┘
        ↓ Scroll
```

#### Paso 2: Búsqueda
```
┌──────────────────────┐
│  🔍 [Buscar prod...] │
│  2 productos encontr │
└──────────────────────┘
        ↓
```

#### Paso 3: Productos (Apilados)
```
┌──────────────────────┐
│  Productos (2)       │
│  [➕ Agregar]        │
├──────────────────────┤
│  ▼ Producto 1        │
│  [Fertilizante NPK▼] │
│  Cantidad: [50]      │
│  Precio: [45000]     │
│  Subtotal: $2,250,000│
│  Lote: [L2025-001]   │
│  ☑️ PG  🗑️           │
├──────────────────────┤
│  ▼ Producto 2        │
│  ...                 │
└──────────────────────┘
        ↓ Scroll
```

#### Paso 4: Total y Botones
```
┌──────────────────────┐
│  Total: $4,500,000   │
├──────────────────────┤
│  [Cancelar]          │
│  [Registrar Compra]  │
└──────────────────────┘
        ↓ Scroll
```

#### Paso 5: Resumen (Debajo)
```
┌──────────────────────┐
│  📊 Resumen          │
│  Proveedor: AgroSup. │
│  Factura: F-001      │
│  Productos: 2        │
│  Total: $4,500,000   │
└──────────────────────┘
```

**Ventajas Mobile:**
- ✅ Todo accesible con scroll
- ✅ Campos grandes (fácil de tocar)
- ✅ Resumen visible al final
- ✅ Botones del tamaño correcto

---

## 🔔 Notificaciones Toast - Ejemplos Reales

### Success (Verde)
```
┌────────────────────────────────────┐
│ ✅  Compra registrada exitosamente:│
│     3 producto(s) - Factura F-001  │  [×]
└────────────────────────────────────┘
```

### Error (Rojo)
```
┌────────────────────────────────────┐
│ ❌  Producto 2: Debe marcar        │
│     "Permitido por Gerencia" (PG)  │  [×]
└────────────────────────────────────┘
```

### Warning (Amarillo)
```
┌────────────────────────────────────┐
│ ⚠️  Máximo 20 productos por compra │  [×]
└────────────────────────────────────┘
```

### Info (Azul)
```
┌────────────────────────────────────┐
│ ℹ️  📊 Inventario actualizado      │
│     automáticamente                │  [×]
└────────────────────────────────────┘
```

**Posición:** Esquina superior derecha
**Duración:** 5 segundos (auto-cierre)
**Acción:** Click en [×] para cerrar manual

---

## 🎓 Tips para Usuarios

### ✅ Mejores Prácticas

1. **Usa la Búsqueda**
   - Escribe 3-4 letras del producto
   - Es case-insensitive
   - Filtra en tiempo real

2. **Revisa el Panel de Resumen**
   - Verifica que todos tengan ✓ PG
   - Confirma el total antes de guardar
   - Revisa la lista de productos

3. **Aprovecha el Auto-Completado**
   - El precio se llena automáticamente
   - Puedes editarlo si es necesario
   - Se basa en el precio del producto

4. **Usa Campos de Trazabilidad**
   - Lote: Ayuda a rastrear origen
   - Vencimiento: Importante para rotación
   - Ambos opcionales pero recomendados

5. **Confirma Antes de Guardar**
   - Lee el diálogo de confirmación
   - Verifica proveedor y factura
   - Confirma el total

### ⚠️ Errores Comunes

#### Error 1: Olvidar marcar PG
**Síntoma:** Toast rojo "Producto X: Debe marcar PG"
**Solución:** Marca el checkbox "PG" en ese producto

#### Error 2: Producto sin cantidad
**Síntoma:** Toast rojo "Producto X: La cantidad debe ser mayor a 0"
**Solución:** Ingresa una cantidad válida (> 0)

#### Error 3: Búsqueda sin resultados
**Síntoma:** "0 producto(s) encontrado(s)"
**Solución:** Verifica el nombre o limpia la búsqueda

#### Error 4: Intenta eliminar último producto
**Síntoma:** Toast amarillo "Debe mantener al menos un producto"
**Solución:** No puedes eliminar el último, agrega otro primero

#### Error 5: Intenta agregar producto #21
**Síntoma:** Toast amarillo "Máximo 20 productos por compra"
**Solución:** Divide en 2 compras o elimina productos innecesarios

---

## 📊 Flujo Completo - Diagrama

```
┌─────────────────────────────────────────────────────────────┐
│                    INICIAR COMPRA                           │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 1: Datos Generales                                    │
│  - Proveedor                                                │
│  - Factura                                                  │
│  - Fecha                                                    │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 2: Búsqueda (Opcional)                                │
│  - Escribir nombre producto                                 │
│  - Ver productos filtrados                                  │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 3: Agregar Productos                                  │
│  ┌─────────────────────────────────────────────────┐        │
│  │  Por cada producto:                             │        │
│  │  1. Seleccionar producto                        │        │
│  │  2. Verificar precio (auto-completado)          │        │
│  │  3. Ingresar cantidad                           │        │
│  │  4. [Opcional] Lote y vencimiento               │        │
│  │  5. Marcar checkbox PG ✓                        │        │
│  └─────────────────────────────────────────────────┘        │
│  - Click "➕ Agregar Producto" si necesitas más             │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 4: Revisar en Panel de Resumen                        │
│  ✓ Todos los productos tienen PG                            │
│  ✓ Total es correcto                                        │
│  ✓ Proveedor y factura correctos                            │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 5: Click "Registrar Compra"                           │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
                   ¿Validación OK?
                        ├─── NO ──→ Toast Error → Corregir
                        ↓ SÍ
┌─────────────────────────────────────────────────────────────┐
│  PASO 6: Diálogo de Confirmación                            │
│  - Leer resumen                                             │
│  - Verificar datos                                          │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
              ¿Confirmar o Cancelar?
                        ├─── Cancelar ──→ Volver a editar
                        ↓ Confirmar
┌─────────────────────────────────────────────────────────────┐
│  PASO 7: Guardando...                                       │
│  - Toast: "💾 Guardando compra..."                          │
│  - Insertar en BD (compras + detalles)                      │
│  - Actualizar inventario                                    │
│  - Registrar movimientos                                    │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
                    ¿Error?
                        ├─── SÍ ──→ Toast Error + Rollback
                        ↓ NO
┌─────────────────────────────────────────────────────────────┐
│  PASO 8: ¡Éxito!                                            │
│  - Toast: "✅ Compra registrada exitosamente"               │
│  - Toast: "📊 Inventario actualizado"                       │
│  - Mostrar vista de éxito (2 seg)                           │
│  - Redirigir a Movimientos                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🆘 Soporte

### Preguntas Frecuentes

**P: ¿Puedo editar una compra después de guardarla?**
R: No, las compras son inmutables para mantener trazabilidad. Si hay error, crea un movimiento correctivo.

**P: ¿Qué significa "PG"?**
R: "Permitido por Gerencia" - Es un requisito de certificación GlobalGAP.

**P: ¿Por qué máximo 20 productos?**
R: Es un límite razonable para mantener performance y usabilidad. Para más productos, crea múltiples compras.

**P: ¿Puedo cancelar después de confirmar?**
R: No, una vez que confirmas en el diálogo, el guardado es irreversible.

**P: ¿Qué pasa si cierro el navegador mientras guarda?**
R: El proceso se interrumpe. Verifica en Movimientos si se guardó. Si no, vuelve a crear.

**P: ¿Los toast se pueden desactivar?**
R: No, son parte integral del feedback del sistema.

---

**Última actualización:** 2025-01-11  
**Versión:** 2.0  
**Autor:** Escocia Hass Dev Team
