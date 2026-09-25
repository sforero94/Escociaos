/**
 * Guarda del hook `.claude/hooks/supabase-guard.py` (ESCO-130).
 *
 * La primera versión decidía con una regex sobre el texto de la llamada:
 * pedía permiso para un SELECT que contenía la palabra DELETE y dejaba pasar
 * `UPDATE productos SET cantidad_actual = 0`. Además sólo miraba el conector
 * `Supabase_Routines`. Estas pruebas corren el script real con eventos
 * sintéticos y fijan la decisión por NOMBRE de herramienta.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '../..');
const script = resolve(raiz, '.claude/hooks/supabase-guard.py');

function decision(tool_name: string, tool_input: unknown): string | null {
  const salida = execFileSync('python3', [script], {
    input: JSON.stringify({ tool_name, tool_input }),
    encoding: 'utf8',
  }).trim();
  if (!salida) return null;
  return JSON.parse(salida).hookSpecificOutput.permissionDecision;
}

describe('supabase-guard.py', () => {
  it('cubre todos los conectores de Supabase, no sólo Supabase_Routines', () => {
    for (const conector of ['Supabase', 'Supabase_Routines', 'Supabase_Escritura']) {
      expect(decision(`mcp__${conector}__apply_migration`, { name: 'x', query: 'select 1' })).toBe('ask');
      expect(decision(`mcp__${conector}__list_tables`, {})).toBe('allow');
    }
  });

  it('el matcher de settings.json alcanza a todos los conectores de Supabase', () => {
    const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'));
    const matcher = new RegExp(`^(?:${settings.hooks.PreToolUse[0].matcher})$`);
    expect(matcher.test('mcp__Supabase_Escritura__apply_migration')).toBe(true);
    expect(matcher.test('mcp__Supabase_Routines__execute_sql')).toBe(true);
    expect(matcher.test('mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL')).toBe(true);
  });

  it('un SELECT que menciona DELETE en un literal es lectura', () => {
    const q = "select policyname from pg_policies where cmd in ('DELETE','ALL')";
    expect(decision('mcp__Supabase_Routines__execute_sql', { query: q })).toBe('allow');
  });

  it.each([
    'UPDATE productos SET cantidad_actual = 0',
    "select cron.alter_job(3, active := false)",
    'ALTER POLICY p ON t USING (true)',
    'select 1; delete from productos',
    'with x as (delete from productos returning *) select * from x',
    "select net.http_post('https://x')",
    'insert into t values (1)',
  ])('execute_sql que puede escribir pide permiso: %s', (q) => {
    expect(decision('mcp__Supabase_Routines__execute_sql', { query: q })).toBe('ask');
  });

  it('una herramienta de Supabase no clasificada pide permiso (falla cerrado)', () => {
    expect(decision('mcp__Supabase_Routines__herramienta_nueva', {})).toBe('ask');
  });

  it('Composio: sólo lecturas pasan; una escritura pide permiso', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
    expect(decision(composio, { tools: [{ tool_slug: 'SUPABASE_RUN_READ_ONLY_QUERY', arguments: { query: "select 'DELETE'" } }] })).toBe('allow');
    expect(decision(composio, { tools: [{ tool_slug: 'SUPABASE_APPLY_A_MIGRATION' }] })).toBe('ask');
    expect(decision(composio, { tools: [{ tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY' }] })).toBe('ask');
    // No es sólo Supabase: sin decisión, flujo normal
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_FETCH_DATABASE' }] })).toBeNull();
  });

  it('herramientas ajenas a Supabase no reciben decisión', () => {
    expect(decision('mcp__github__list_issues', {})).toBeNull();
  });
});
