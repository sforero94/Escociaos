# Aplicaciones ↔ Labores Synchronization Migration Guide

This migration suite integrates the aplicaciones (agricultural applications) and labores (labor tasks) modules to enable:
- ✅ Automatic labor task creation from aplicaciones
- ✅ Real-time worker tracking (employees AND contractors) from both modules
- ✅ Bidirectional synchronization of dates and lotes
- ✅ Prevention of duplicate work registrations

## What's Included

**8 migration files** that must be run in order:

1. **001_link_aplicaciones_tareas.sql** - Link aplicaciones → tareas (1:1 relationship)
2. **002_add_worker_tracking_movimientos.sql** - Add worker tracking table for movimientos_diarios
3. **003_add_unique_constraint_registros.sql** - Prevent duplicate work registrations
4. **004_trigger_auto_create_tarea.sql** - Auto-create tarea when aplicación is created
5. **005_trigger_sync_tarea_edit.sql** - Auto-update tarea when aplicación is edited
6. **006_trigger_auto_create_registros.sql** - Auto-sync workers to registros_trabajo
7. **007_prevent_tarea_deletion.sql** - Safety constraint to prevent linked tarea deletion
8. **008_fix_sync_lotes_on_change.sql** - Fix lote sync for existing tareas + trigger for lote changes

## ⚠️ Prerequisites

Before running these migrations, ensure:
- [x] You have the `add_contractor_support.sql` migration already applied (contratistas table exists)
- [x] You have admin access to Supabase Dashboard
- [x] You have a backup of your database (recommended)

## 🚀 How to Run (Supabase Dashboard - Recommended)

### Step 1: Open Supabase SQL Editor

1. Go to: https://ywhtjwawnkeqlwxbvgup.supabase.co
2. Log in to your Supabase project
3. Navigate to: **SQL Editor** (left sidebar)

### Step 2: Run Each Migration in Order

**IMPORTANT: Run migrations ONE AT A TIME in numerical order (001 → 008)**

For each migration file:

1. Click **"New Query"**
2. Open the migration file (e.g., `001_link_aplicaciones_tareas.sql`)
3. Copy the ENTIRE contents
4. Paste into the SQL editor
5. Click **"Run"** (or press Ctrl/Cmd + Enter)
6. **Verify success** - You should see "Success. No rows returned" or a success message
7. **Only proceed to the next migration if successful**

### Step 3: Verify Each Migration

After each migration, verify it worked:

#### After 001 (Link aplicaciones → tareas):
```sql
-- Check column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'aplicaciones' AND column_name = 'tarea_id';

-- Should return: tarea_id | uuid
```

#### After 002 (Worker tracking table):
```sql
-- Check table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'movimientos_diarios_trabajadores';

-- Check XOR constraint exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'movimientos_diarios_trabajadores'
  AND constraint_name = 'check_worker_type';
```

#### After 003 (Unique constraint):
```sql
-- Check constraint exists (Note: constraint name may include table_pkey suffix)
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'registros_trabajo'
  AND constraint_name LIKE 'registros_trabajo_unique%';
```

#### After 004, 005, 006 (Triggers):
```sql
-- Check triggers exist
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'trigger_auto_create_tarea_aplicacion',
  'trigger_sync_tarea_aplicacion',
  'trigger_auto_create_registro_trabajo'
);

-- Should return 3 rows
```

#### After 007 (Prevent deletion trigger):
```sql
-- Check trigger exists
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'trigger_prevent_linked_tarea_deletion';
```

#### After 008 (Fix lote sync):
```sql
-- Check trigger exists
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'trigger_sync_tarea_lotes_on_aplicaciones_lotes_change';

-- Verify existing tareas now have lotes synced
SELECT
  t.codigo_tarea,
  t.nombre,
  ARRAY_LENGTH(t.lote_ids, 1) as num_lotes
FROM tareas t
WHERE observaciones LIKE '%Auto-generada desde aplicación%'
  AND lote_ids IS NOT NULL;
```

## ✅ Complete Verification (After All Migrations)

Run this comprehensive verification query:

```sql
-- Check all new database objects
SELECT
  'Column' as type,
  'aplicaciones.tarea_id' as name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aplicaciones' AND column_name = 'tarea_id'
  ) THEN '✅ Exists' ELSE '❌ Missing' END as status
UNION ALL
SELECT
  'Table',
  'movimientos_diarios_trabajadores',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'movimientos_diarios_trabajadores'
  ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT
  'Constraint',
  'registros_trabajo UNIQUE constraint',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'registros_trabajo' AND constraint_name LIKE '%unique%'
  ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT
  'Trigger',
  'trigger_auto_create_tarea_aplicacion',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_auto_create_tarea_aplicacion'
  ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT
  'Trigger',
  'trigger_sync_tarea_aplicacion',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_sync_tarea_aplicacion'
  ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT
  'Trigger',
  'trigger_auto_create_registro_trabajo',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_auto_create_registro_trabajo'
  ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT
  'Trigger',
  'trigger_prevent_linked_tarea_deletion',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_prevent_linked_tarea_deletion'
  ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT
  'Trigger',
  'trigger_sync_tarea_lotes_on_aplicaciones_lotes_change',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_sync_tarea_lotes_on_aplicaciones_lotes_change'
  ) THEN '✅ Exists' ELSE '❌ Missing' END;

-- All rows should show ✅ Exists
```

## 🧪 What to Test After Migration

### 1. Auto-Create Tarea from Aplicación

1. Navigate to `/aplicaciones` in the app
2. Click "Nueva Aplicación"
3. Fill in application details (nombre, tipo, lotes, fechas)
4. **Set status to "Calculada"**
5. Save the application
6. Navigate to `/labores`
7. **Verify:** A new tarea should appear automatically with:
   - Status: "Programada"
   - Same name as aplicación
   - Same lotes and dates as aplicación
   - Observaciones: "Auto-generada desde aplicación..."

### 2. Worker Tracking from DailyMovementForm

1. Navigate to an aplicación details page
2. Click "Registrar Movimiento Diario"
3. Select lote, fecha, and products
4. **In "Selección de Personal" section:**
   - Switch between "Empleados" and "Contratistas" tabs
   - Select multiple workers
   - Assign jornal fractions (0.25, 0.5, 0.75, 1.0)
   - Add observations per worker per lote
5. Save the movement
6. Navigate to `/labores` and find the linked tarea
7. **Verify:** registros_trabajo should show all workers you selected

### 3. Sync Dates on Aplicación Edit

1. Edit an existing aplicación (that has a linked tarea)
2. Change `fecha_inicio_planeada` or `fecha_fin_planeada`
3. Save changes
4. Navigate to `/labores` and open the linked tarea
5. **Verify:** Tarea dates should match the updated aplicación dates

### 4. Prevent Linked Tarea Deletion

1. Find a tarea that was auto-generated (check observaciones)
2. Try to delete it
3. **Verify:** You should see error message in Spanish:
   > "No se puede eliminar una tarea vinculada a una aplicación. Elimine primero la aplicación."

### 5. Warning Banner on Tarea Edit

1. Open a tarea that was auto-generated
2. Click "Editar Tarea"
3. **Verify:** Yellow warning banner should appear:
   > "Tarea vinculada a aplicación"
   > "Esta tarea fue creada automáticamente desde una aplicación. Los cambios aquí NO se sincronizarán de vuelta a la aplicación."

## 🔄 Rollback Instructions

If you need to rollback these migrations (run in REVERSE order):

### Rollback 008:
```sql
DROP TRIGGER IF EXISTS trigger_sync_tarea_lotes_on_aplicaciones_lotes_change ON aplicaciones_lotes;
DROP FUNCTION IF EXISTS sync_tarea_lotes_on_aplicaciones_lotes_change();
-- Note: The one-time data sync cannot be rolled back automatically
```

### Rollback 007:
```sql
DROP TRIGGER IF EXISTS trigger_prevent_linked_tarea_deletion ON tareas;
DROP FUNCTION IF EXISTS prevent_linked_tarea_deletion();
```

### Rollback 006:
```sql
DROP TRIGGER IF EXISTS trigger_auto_create_registro_trabajo ON movimientos_diarios_trabajadores;
DROP FUNCTION IF EXISTS auto_create_registro_trabajo_from_movimiento();
```

### Rollback 005:
```sql
DROP TRIGGER IF EXISTS trigger_sync_tarea_aplicacion ON aplicaciones;
DROP FUNCTION IF EXISTS sync_tarea_on_aplicacion_edit();
```

### Rollback 004:
```sql
DROP TRIGGER IF EXISTS trigger_auto_create_tarea_aplicacion ON aplicaciones;
DROP FUNCTION IF EXISTS auto_create_tarea_for_aplicacion();
```

### Rollback 003:
```sql
ALTER TABLE registros_trabajo DROP CONSTRAINT IF EXISTS registros_trabajo_unique_key;
```

### Rollback 002:
```sql
DROP INDEX IF EXISTS idx_movimientos_trabajadores_contratista;
DROP INDEX IF EXISTS idx_movimientos_trabajadores_empleado;
DROP INDEX IF EXISTS idx_movimientos_trabajadores_movimiento;
DROP TABLE IF EXISTS movimientos_diarios_trabajadores CASCADE;
```

### Rollback 001:
```sql
DROP INDEX IF EXISTS idx_aplicaciones_tarea_unique;
DROP INDEX IF EXISTS idx_aplicaciones_tarea_id;
ALTER TABLE aplicaciones DROP COLUMN IF EXISTS tarea_id;
```

## 🐛 Troubleshooting

### Error: "column tarea_id already exists"
**Solution:** Migration 001 was already applied. Skip to migration 002.

### Error: "table movimientos_diarios_trabajadores already exists"
**Solution:** Migration 002 was already applied. Skip to migration 003.

### Error: "duplicate key value violates unique constraint"
**Solution:** You may have existing duplicate records. Run this query to find them:
```sql
SELECT tarea_id, empleado_id, lote_id, fecha_trabajo, COUNT(*)
FROM registros_trabajo
WHERE empleado_id IS NOT NULL
GROUP BY tarea_id, empleado_id, lote_id, fecha_trabajo
HAVING COUNT(*) > 1;
```
Then manually delete or merge duplicates before applying migration 003.

### Error: "trigger already exists"
**Solution:** Use `DROP TRIGGER IF EXISTS` before creating, or the trigger was already created successfully.

### Error: "function does not exist"
**Solution:** Ensure you're running migrations in order. Each trigger depends on its corresponding function being created first.

## 📚 Additional Resources

- **Plan Document:** `/Users/santiagoforero/.claude/plans/dreamy-plotting-diffie.md`
- **Shared Components:**
  - `src/components/shared/TrabajadorMultiSelect.tsx`
  - `src/components/shared/JornalFractionMatrix.tsx`
- **Shared Types:** `src/types/shared.ts`
- **Updated Forms:**
  - `src/components/aplicaciones/DailyMovementForm.tsx`
  - `src/components/labores/RegistrarTrabajoDialog.tsx`
  - `src/components/labores/CrearEditarTareaDialog.tsx`

## 🎯 Migration Checklist

- [ ] Backed up database
- [ ] Verified `contratistas` table exists (prerequisite)
- [ ] Ran migration 001 successfully
- [ ] Ran migration 002 successfully
- [ ] Ran migration 003 successfully
- [ ] Ran migration 004 successfully
- [ ] Ran migration 005 successfully
- [ ] Ran migration 006 successfully
- [ ] Ran migration 007 successfully
- [ ] Ran migration 008 successfully
- [ ] Ran complete verification query (all ✅)
- [ ] Tested auto-create tarea from aplicación
- [ ] Tested worker tracking from DailyMovementForm
- [ ] Tested date sync on aplicación edit
- [ ] Tested prevent linked tarea deletion
- [ ] Tested warning banner on tarea edit

---

**Total Estimated Time:** 15-20 minutes

**Risk Level:** Medium (includes trigger creation and data constraints)

**Recommended Time:** During low-traffic period or maintenance window
