# 🗂️ DIAGRAMA DE RELACIONES - APLICACIONES FITOSANITARIAS

**Fecha:** 11 de Noviembre, 2025

---

## 📊 DIAGRAMA ENTIDAD-RELACIÓN

```
┌─────────────────────────┐
│     APLICACIONES        │
│ ─────────────────────── │
│ • id (PK)               │
│ • codigo_aplicacion     │
│ • nombre_aplicacion     │
│ • tipo_aplicacion       │
│ • proposito             │
│ • agronomo_responsable  │
│ • estado                │
│ • fecha_recomendacion   │
└──────────┬──────────────┘
           │
           │ 1:N (CASCADE)
           │
   ┌───────┴────────────────────────────────────────┐
   │                                                │
   │                                                │
┌──▼───────────────────┐                   ┌───────▼────────────────┐
│ APLICACIONES_LOTES   │                   │ APLICACIONES_MEZCLAS   │
│ ──────────────────── │                   │ ────────────────────── │
│ • id (PK)            │                   │ • id (PK)              │
│ • aplicacion_id (FK) │                   │ • aplicacion_id (FK)   │
│ • lote_id (FK)       │                   │ • nombre               │
│ • sublotes_ids[]     │                   │ • numero_orden         │
│ • arboles_*          │                   └───────┬────────────────┘
│ • calibracion        │                           │
│ • tamano_caneca      │                           │ 1:N (CASCADE)
└──────────────────────┘                           │
                                           ┌───────▼──────────────────────┐
                                           │ APLICACIONES_PRODUCTOS       │
┌─────────────────────────┐               │ ──────────────────────────── │
│   APLICACIONES_CALCULOS │               │ • id (PK)                    │
│ ─────────────────────── │               │ • mezcla_id (FK)             │
│ • id (PK)               │               │ • producto_id (FK)           │
│ • aplicacion_id (FK)    │               │ • dosis_por_caneca           │
│ • lote_id (FK)          │               │ • dosis_grandes/medianos/... │
│ • lote_nombre           │               │ • cantidad_total_necesaria   │
│ • litros_mezcla         │               │ • producto_nombre (snapshot) │
│ • numero_canecas        │               └──────────────────────────────┘
│ • kilos_totales         │
│ • numero_bultos         │
└─────────────────────────┘               ┌──────────────────────────────┐
                                           │  APLICACIONES_COMPRAS        │
                                           │ ──────────────────────────── │
                                           │ • id (PK)                    │
                                           │ • aplicacion_id (FK)         │
                                           │ • producto_id (FK)           │
                                           │ • inventario_actual          │
                                           │ • cantidad_necesaria         │
                                           │ • cantidad_faltante          │
                                           │ • unidades_a_comprar         │
                                           │ • costo_estimado             │
                                           │ • alerta                     │
                                           └──────────────────────────────┘

┌──────────────┐          ┌──────────────┐
│    LOTES     │          │  PRODUCTOS   │
│ ──────────── │          │ ──────────── │
│ • id (PK)    │◄────────┐│ • id (PK)    │◄────┐
│ • nombre     │ RESTRICT││ • nombre     │     │
│ • arboles_*  │         ││ • categoria  │     │
└──────────────┘         │└──────────────┘     │
                         │                     │
                         │ (Referenciados      │ (Referenciados
                         │  por FK RESTRICT)   │  por FK RESTRICT)
                         │                     │
         ┌───────────────┘                     │
         │                                     │
         │                           ┌─────────┘
         │                           │
┌────────┴─────────────┐    ┌────────┴─────────────┐
│ aplicaciones_lotes   │    │ aplicaciones_productos│
│ • lote_id (FK)       │    │ • producto_id (FK)    │
└──────────────────────┘    └───────────────────────┘
                            
┌──────────────────────┐    ┌───────────────────────┐
│ aplicaciones_calculos│    │ aplicaciones_compras  │
│ • lote_id (FK)       │    │ • producto_id (FK)    │
└──────────────────────┘    └───────────────────────┘
```

---

## 🔗 TIPOS DE RELACIONES

### **1. Relaciones CASCADE (1:N)**
Cuando eliminas la aplicación, se eliminan los registros relacionados automáticamente.

```
aplicaciones (1) ───CASCADE───> (N) aplicaciones_lotes
aplicaciones (1) ───CASCADE───> (N) aplicaciones_mezclas
aplicaciones (1) ───CASCADE───> (N) aplicaciones_calculos
aplicaciones (1) ───CASCADE───> (N) aplicaciones_compras

aplicaciones_mezclas (1) ───CASCADE───> (N) aplicaciones_productos
```

### **2. Relaciones RESTRICT (N:1)**
NO puedes eliminar un lote o producto si está siendo usado en una aplicación.

```
aplicaciones_lotes (N) ───RESTRICT───> (1) lotes
aplicaciones_calculos (N) ───RESTRICT───> (1) lotes
aplicaciones_productos (N) ───RESTRICT───> (1) productos
aplicaciones_compras (N) ───RESTRICT───> (1) productos
```

---

## 📋 EJEMPLO DE FLUJO DE DATOS

### **Caso: Fumigación contra Trips en 2 lotes**

#### **1. Registro en `aplicaciones`**
```sql
id: 123e4567-e89b-12d3-a456-426614174000
nombre_aplicacion: "Fumigación Trips Febrero"
tipo_aplicacion: "Fumigacion"
estado: "Calculada"
```

#### **2. Registros en `aplicaciones_lotes`** (2 lotes)
```sql
-- Lote A
aplicacion_id: 123e4567...
lote_id: aaa-bbb-ccc
arboles_grandes: 500
total_arboles: 1200
calibracion_litros_arbol: 2.5
tamano_caneca: 200

-- Lote B
aplicacion_id: 123e4567...
lote_id: ddd-eee-fff
arboles_grandes: 300
total_arboles: 800
calibracion_litros_arbol: 2.5
tamano_caneca: 200
```

#### **3. Registro en `aplicaciones_mezclas`** (1 mezcla)
```sql
id: mezcla-111
aplicacion_id: 123e4567...
nombre: "Mezcla 1"
numero_orden: 1
```

#### **4. Registros en `aplicaciones_productos`** (3 productos en la mezcla)
```sql
-- Insecticida
mezcla_id: mezcla-111
producto_id: prod-insecticida
dosis_por_caneca: 250 (cc)
cantidad_total_necesaria: 3.75 (L)

-- Fungicida
mezcla_id: mezcla-111
producto_id: prod-fungicida
dosis_por_caneca: 150 (cc)
cantidad_total_necesaria: 2.25 (L)

-- Coadyuvante
mezcla_id: mezcla-111
producto_id: prod-coadyuvante
dosis_por_caneca: 100 (cc)
cantidad_total_necesaria: 1.5 (L)
```

#### **5. Registros en `aplicaciones_calculos`** (2 lotes)
```sql
-- Lote A
aplicacion_id: 123e4567...
lote_id: aaa-bbb-ccc
lote_nombre: "Lote A"
total_arboles: 1200
litros_mezcla: 3000
numero_canecas: 15

-- Lote B
aplicacion_id: 123e4567...
lote_id: ddd-eee-fff
lote_nombre: "Lote B"
total_arboles: 800
litros_mezcla: 2000
numero_canecas: 10
```

#### **6. Registros en `aplicaciones_compras`** (3 productos)
```sql
-- Insecticida
aplicacion_id: 123e4567...
producto_id: prod-insecticida
inventario_actual: 2.0 (L)
cantidad_necesaria: 3.75 (L)
cantidad_faltante: 1.75 (L)
unidades_a_comprar: 2 (tarros de 1L)
costo_estimado: 150000

-- Fungicida
aplicacion_id: 123e4567...
producto_id: prod-fungicida
inventario_actual: 5.0 (L)
cantidad_necesaria: 2.25 (L)
cantidad_faltante: 0
unidades_a_comprar: 0
alerta: 'normal'

-- Coadyuvante
aplicacion_id: 123e4567...
producto_id: prod-coadyuvante
inventario_actual: 0 (L)
cantidad_necesaria: 1.5 (L)
cantidad_faltante: 1.5 (L)
unidades_a_comprar: 2 (tarros de 1L)
costo_estimado: 80000
```

---

## 🎯 QUERIES COMUNES

### **1. Ver aplicación completa con todos sus datos**
```sql
-- Aplicación base
SELECT * FROM aplicaciones WHERE id = '123e4567...';

-- Lotes incluidos
SELECT * FROM aplicaciones_lotes WHERE aplicacion_id = '123e4567...';

-- Mezclas
SELECT * FROM aplicaciones_mezclas WHERE aplicacion_id = '123e4567...';

-- Productos en las mezclas
SELECT p.* 
FROM aplicaciones_productos p
  JOIN aplicaciones_mezclas m ON p.mezcla_id = m.id
WHERE m.aplicacion_id = '123e4567...';

-- Cálculos por lote
SELECT * FROM aplicaciones_calculos WHERE aplicacion_id = '123e4567...';

-- Lista de compras
SELECT * FROM aplicaciones_compras WHERE aplicacion_id = '123e4567...';
```

### **2. Ver todas las aplicaciones de un lote**
```sql
SELECT 
  a.nombre_aplicacion,
  a.tipo_aplicacion,
  a.fecha_recomendacion,
  al.total_arboles,
  al.calibracion_litros_arbol
FROM aplicaciones a
  JOIN aplicaciones_lotes al ON a.id = al.aplicacion_id
WHERE al.lote_id = 'lote-uuid-aqui'
ORDER BY a.fecha_recomendacion DESC;
```

### **3. Ver qué productos se han usado en aplicaciones**
```sql
SELECT 
  p.nombre AS producto,
  p.categoria,
  COUNT(DISTINCT ap.mezcla_id) AS veces_usado,
  AVG(ap.dosis_por_caneca) AS dosis_promedio
FROM productos p
  JOIN aplicaciones_productos ap ON p.id = ap.producto_id
GROUP BY p.id, p.nombre, p.categoria
ORDER BY veces_usado DESC;
```

### **4. Calcular inversión total por aplicación**
```sql
SELECT 
  a.nombre_aplicacion,
  SUM(ac.costo_estimado) AS inversion_total,
  COUNT(ac.producto_id) AS productos_a_comprar
FROM aplicaciones a
  JOIN aplicaciones_compras ac ON a.id = ac.aplicacion_id
WHERE ac.cantidad_faltante > 0
GROUP BY a.id, a.nombre_aplicacion;
```

### **5. Ver alertas de compras (productos sin precio o sin stock)**
```sql
SELECT 
  a.nombre_aplicacion,
  ac.producto_nombre,
  ac.alerta,
  ac.cantidad_faltante,
  ac.unidades_a_comprar
FROM aplicaciones a
  JOIN aplicaciones_compras ac ON a.id = ac.aplicacion_id
WHERE ac.alerta IN ('sin_precio', 'sin_stock')
ORDER BY a.fecha_recomendacion DESC;
```

---

## 📊 RESUMEN DE CAMPOS CLAVE

### **Snapshots (datos históricos)**
Estos campos guardan un "snapshot" de los datos al momento de crear la aplicación:

- `aplicaciones_lotes.arboles_*` → Copia de lotes.arboles_*
- `aplicaciones_calculos.lote_nombre` → Copia de lotes.nombre
- `aplicaciones_productos.producto_nombre` → Copia de productos.nombre
- `aplicaciones_compras.inventario_actual` → Copia de productos.cantidad_actual
- `aplicaciones_compras.precio_unitario` → Copia de productos.precio_unitario

**¿Por qué snapshots?**
- Si cambias el conteo de árboles en un lote, la aplicación guardada sigue mostrando los datos originales
- Si cambias el precio de un producto, las aplicaciones anteriores no se ven afectadas

### **Campos calculados**
Estos campos se calculan en el frontend y se guardan:

- `aplicaciones_lotes.total_arboles`
- `aplicaciones_productos.cantidad_total_necesaria`
- `aplicaciones_calculos.litros_mezcla`, `numero_canecas`, `kilos_totales`, etc.
- `aplicaciones_compras.cantidad_faltante`, `unidades_a_comprar`, `costo_estimado`

---

## ✅ VENTAJAS DE ESTA ESTRUCTURA

1. ✅ **Trazabilidad completa** - Puedes ver exactamente qué se planificó
2. ✅ **Histórico preservado** - Los cambios en lotes/productos no afectan aplicaciones pasadas
3. ✅ **Queries eficientes** - Índices en todas las FK
4. ✅ **Reportes fáciles** - Puedes hacer queries complejos
5. ✅ **Integridad referencial** - No puedes eliminar lotes/productos en uso
6. ✅ **Cascada automática** - Eliminas la aplicación y se limpian todas las tablas

---

**¡Estructura de datos completa y optimizada para producción!** 🚀
