/**
 * Migration Runner Script
 * Run with: node src/sql/migrations/run_migration.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ywhtjwawnkeqlwxbvgup.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  console.log('\nPlease add your service role key to .env.local:');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  console.log('\nYou can find it in Supabase Dashboard > Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Running contractor support migration...\n');

  try {
    // Read migration file
    const migrationSQL = readFileSync(
      join(__dirname, 'add_contractor_support.sql'),
      'utf-8'
    );

    // Execute migration
    console.log('📝 Executing SQL migration...');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      throw error;
    }

    console.log('✅ Migration completed successfully!\n');

    // Verify tables exist
    console.log('🔍 Verifying migration...');

    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['contratistas', 'registros_trabajo']);

    if (tableError) {
      console.warn('⚠️  Could not verify tables:', tableError.message);
    } else {
      console.log('✓ Tables verified:', tables?.map(t => t.table_name).join(', '));
    }

    // Verify columns
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'registros_trabajo')
      .eq('column_name', 'contratista_id');

    if (columnError) {
      console.warn('⚠️  Could not verify columns:', columnError.message);
    } else if (columns && columns.length > 0) {
      console.log('✓ Column contratista_id added to registros_trabajo');
    }

    console.log('\n✨ Migration complete! You can now:');
    console.log('  1. Navigate to /contratistas in the app');
    console.log('  2. Create new contractors');
    console.log('  3. Register work with contractors in Labores');
    console.log('  4. View contractor work in reports\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n💡 Alternative: Run the migration manually via Supabase Dashboard');
    console.log('  1. Go to Supabase Dashboard > SQL Editor');
    console.log('  2. Copy contents of src/sql/migrations/add_contractor_support.sql');
    console.log('  3. Paste and execute the SQL\n');
    process.exit(1);
  }
}

runMigration();
