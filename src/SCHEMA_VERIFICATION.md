# Verificación de Schema - Movimientos Diarios

## ✅ Campos Requeridos en la Tabla `movimientos_diarios`

Asegúrate de que tu tabla `movimientos_diarios` en Supabase tenga los siguientes campos:

### Campos Principales
- ✅ `id` (uuid, primary key, default: gen_random_uuid())
- ✅ `aplicacion_id` (uuid, foreign key → aplicaciones.id)
- ✅ `fecha_movimiento` (date)
- ✅ `lote_id` (uuid, foreign key → lotes.id)
- ✅ `lote_nombre` (text)
- ✅ `producto_id` (uuid, foreign key → productos_agricolas.id)
- ✅ `producto_nombre` (text)
- ✅ `producto_categoria` (text)
- ✅ `producto_unidad` (text) - valores: 'litros', 'kilos', 'unidades'
- ✅ `cantidad_utilizada` (numeric)
- ✅ `responsable` (text)
- ✅ `notas` (text, nullable)

### Campos de Trazabilidad de Canecas (NUEVOS)
- ✅ `numero_canecas_utilizadas` (integer, nullable)
- ✅ `numero_canecas_planeadas` (integer, nullable)

### Campos de Auditoría
- ✅ `created_at` (timestamp with time zone, default: now())
- ✅ `updated_at` (timestamp with time zone, default: now())
- ✅ `created_by` (uuid, foreign key → auth.users.id, nullable)

---

## 📋 SQL para Crear los Campos Faltantes

Si necesitas agregar los campos de canecas, ejecuta este SQL en Supabase SQL Editor:

\`\`\`sql
-- Agregar campo numero_canecas_utilizadas
ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS numero_canecas_utilizadas integer;

-- Agregar campo numero_canecas_planeadas
ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS numero_canecas_planeadas integer;

-- Agregar comentarios para documentación
COMMENT ON COLUMN movimientos_diarios.numero_canecas_utilizadas IS 'Número de canecas utilizadas en este movimiento (solo fumigación)';
COMMENT ON COLUMN movimientos_diarios.numero_canecas_planeadas IS 'Número de canecas que estaban planeadas para este lote (referencia)';
\`\`\`

---

## 🔍 Verificar que Todo Esté Correcto

Puedes ejecutar esta query para verificar la estructura de la tabla:

\`\`\`sql
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'movimientos_diarios'
ORDER BY ordinal_position;
\`\`\`

---

## ✅ Campos Opcionales Recomendados

Para una trazabilidad completa según GlobalGAP, considera agregar también:

\`\`\`sql
-- Campo para almacenar el lote de producto usado (número de lote del fabricante)
ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS lote_producto text;

-- Campo para fecha de vencimiento del producto
ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS fecha_vencimiento_producto date;

-- Comentarios
COMMENT ON COLUMN movimientos_diarios.lote_producto IS 'Número de lote del fabricante del producto (trazabilidad GlobalGAP)';
COMMENT ON COLUMN movimientos_diarios.fecha_vencimiento_producto IS 'Fecha de vencimiento del producto utilizado (trazabilidad GlobalGAP)';
\`\`\`

---

## 🎯 Beneficios de la Estructura Actual

### Para Fumigación:
- ✅ Registro de cantidad de producto (litros)
- ✅ Registro de número de canecas utilizadas
- ✅ Comparación con canecas planeadas
- ✅ Cálculo automático de dosis real por caneca

### Para Fertilización:
- ✅ Registro de cantidad de producto (kilos)
- ✅ Trazabilidad por lote
- ✅ Sin campos de canecas (no aplican)

### Para Drench:
- ✅ Registro de cantidad de producto (litros)
- ✅ Trazabilidad por lote

---

## 📊 Exportación CSV Incluye:

Cuando hay datos de canecas:
- Fecha
- Lote
- Producto
- Categoría
- Cantidad
- Unidad
- **Canecas Utilizadas** ⭐
- **Canecas Planeadas** ⭐
- Responsable
- Notas
- Fecha Registro

Esto proporciona trazabilidad completa para auditorías GlobalGAP! 🎉
