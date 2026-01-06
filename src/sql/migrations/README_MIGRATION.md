# Contractor Support Migration Guide

This migration adds support for tracking external contractors (Jornal and Contrato) alongside regular employees.

## What's Included

- New `contratistas` table for storing contractor information
- Modified `registros_trabajo` table with `contratista_id` foreign key
- Database constraints ensuring each work record belongs to either an employee OR contractor
- Indexes for performance optimization

## How to Run the Migration

### Method 1: Supabase Dashboard (Recommended)

1. Open your browser and go to: https://ywhtjwawnkeqlwxbvgup.supabase.co
2. Log in to your Supabase project
3. Navigate to: **SQL Editor** (left sidebar)
4. Click **"New Query"**
5. Copy the entire contents of `add_contractor_support.sql`
6. Paste into the SQL editor
7. Click **"Run"** (or press Ctrl/Cmd + Enter)
8. Verify success (should see "Success. No rows returned")

### Method 2: Supabase CLI (If installed)

```bash
supabase db push src/sql/migrations/add_contractor_support.sql
```

### Method 3: Node.js Script (Advanced)

1. Add your service role key to `.env.local`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
   (Find it in Supabase Dashboard > Settings > API > service_role)

2. Run the migration script:
   ```bash
   node src/sql/migrations/run_migration.js
   ```

## Verification

After running the migration, verify it worked by running these queries in the SQL Editor:

```sql
-- Check contratistas table exists
SELECT * FROM contratistas LIMIT 1;

-- Check contratista_id column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'registros_trabajo' AND column_name = 'contratista_id';

-- Check constraint exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'registros_trabajo' AND constraint_name = 'check_worker_type';
```

## What to Test After Migration

1. **Create a Contractor**
   - Navigate to `/contratistas` in the app
   - Click "Nuevo Contratista"
   - Fill in name, tipo_contrato (Jornal or Contrato), tarifa_jornal
   - Save successfully

2. **Register Work with Contractor**
   - Go to `/labores`
   - Click "Registrar Trabajo" on any task
   - In Step 2, switch to "Contratistas" tab
   - Select a contractor
   - Complete registration with contractor work

3. **View Reports**
   - Go to "Reportes" tab in Labores
   - Verify contractor work shows with tipo_contrato badge
   - Check cost aggregations include contractor costs

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Remove all changes
DROP TRIGGER IF EXISTS set_updated_at ON contratistas;
DROP INDEX IF EXISTS idx_contratistas_estado;
DROP INDEX IF EXISTS idx_contratistas_tipo;
DROP INDEX IF EXISTS idx_contratistas_nombre;
DROP INDEX IF EXISTS idx_registros_trabajo_contratista;
ALTER TABLE registros_trabajo DROP CONSTRAINT IF EXISTS check_worker_type;
ALTER TABLE registros_trabajo DROP COLUMN IF EXISTS contratista_id;
DROP TABLE IF EXISTS contratistas;
```

## Support

If you encounter any issues during migration:

1. Check the Supabase logs for detailed error messages
2. Ensure you have sufficient database permissions
3. Verify the migration script is complete (no partial copy)
4. Review the error message for specific table/column conflicts
