# 📋 INSTRUCCIONES DE MIGRACIÓN - NORMALIZACIÓN DE UNIDADES

## 🎯 Objetivo
Normalizar todas las unidades de medida en la base de datos usando un ENUM consistente: `'Litros' | 'Kilos' | 'Unidades'`

## 📊 Tablas Afectadas
- `productos` (unidad_medida)
- `movimientos_diarios_productos` (unidad)
- `movimientos_inventario` (unidad)
- `compras` (unidad)
- `aplicaciones_productos` (producto_unidad)
- `aplicaciones_compras` (unidad)
- `aplicaciones_productos_planificado` (unidad)
- `aplicaciones_productos_real` (unidad)

## ⚠️ IMPORTANTE
**ANTES DE EJECUTAR:**
1. Hacer un backup completo de la base de datos
2. Ejecutar en un ambiente de prueba primero
3. Verificar que no haya aplicaciones en ejecución

## 🚀 Paso a Paso

### 1. Backup de la Base de Datos
```bash
# En Supabase Dashboard:
# Settings → Database → Backup
# O usar pg_dump si tienes acceso directo
```

### 2. Ejecutar Migración
```sql
-- Copiar y ejecutar el contenido de migration_unidades.sql en el SQL Editor de Supabase
```

### 3. Verificar Resultados
Al final del script de migración hay un query de verificación que muestra:
- Distribución de unidades por tabla
- Total de registros afectados

Resultado esperado:
```
tabla                               | unidad    | total
------------------------------------|-----------| -----
productos                           | Litros    | XX
productos                           | Kilos     | XX
movimientos_diarios_productos       | Litros    | XX
movimientos_diarios_productos       | Kilos     | XX
...
```

### 4. Actualizar Frontend
El código del frontend ya está actualizado para usar el nuevo ENUM:
- ✅ `types/aplicaciones.ts` - Tipo `UnidadMedida` definido
- ✅ `DailyMovementForm.tsx` - Usa `UnidadMedida`
- ✅ `DailyMovementsDashboard.tsx` - Compatible con nuevas unidades

### 5. Pruebas Post-Migración
1. **Crear nueva aplicación** y verificar que los productos muestren unidades correctamente
2. **Registrar movimiento diario** y verificar que se guarde correctamente
3. **Consultar movimientos** y verificar visualización correcta

## 🔄 Rollback (Si es necesario)
Si algo sale mal, ejecutar:
```sql
-- Copiar y ejecutar el contenido de rollback_unidades.sql
```

## 📝 Cambios en el Código

### Antes (inconsistente):
```typescript
unidad_medida: 'litros' | 'kilos' | 'unidades'  // minúsculas
unidad: 'cc' | 'L' | 'g' | 'Kg'                 // abreviaciones mixtas
```

### Después (normalizado):
```typescript
type UnidadMedida = 'Litros' | 'Kilos' | 'Unidades'  // Capitalizado consistente
```

## ✅ Ventajas del Nuevo Sistema
1. **Consistencia**: Mismo formato en toda la base de datos
2. **Type Safety**: TypeScript puede validar las unidades
3. **Simplicidad**: No hay conversiones entre diferentes formatos
4. **Mantenibilidad**: Más fácil de extender en el futuro

## 🛠️ Soporte
Si encuentras problemas:
1. Revisa los logs de Supabase
2. Ejecuta el query de verificación
3. Si es necesario, ejecuta el rollback
4. Reporta el error con detalles

## 📅 Notas de Versión
- **Versión**: 1.0
- **Fecha**: 2025-11-25
- **Autor**: Sistema Escosia Hass
- **Prioridad**: Alta (mejora la integridad de datos)
