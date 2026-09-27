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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '../..');
const script = resolve(raiz, '.claude/hooks/supabase-guard.py');

function decision(
  tool_name: string,
  tool_input: unknown,
  opciones: { fecha?: string; cwd?: string } = {},
): string | null {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: opciones.cwd ?? raiz };
  if (opciones.fecha) env.SUPABASE_GUARD_FECHA = opciones.fecha;
  else delete env.SUPABASE_GUARD_FECHA;
  const salida = execFileSync('python3', [script], {
    input: JSON.stringify({ tool_name, tool_input, cwd: opciones.cwd ?? raiz }),
    encoding: 'utf8',
    env,
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
  });

  it('Composio: una escritura mezclada con Notion no se cuela (cada elemento se decide)', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
    expect(
      decision(composio, {
        tools: [
          { tool_slug: 'NOTION_FETCH_DATABASE', arguments: {} },
          { tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY', arguments: { query: 'delete from productos' } },
        ],
      }),
    ).toBe('ask');
  });

  it('Composio: Notion en la base Mantenimiento pasa; fuera de ella o borrar pide permiso', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_FETCH_DATABASE', account: 'thinksid', arguments: {} }] })).toBe('allow');
    expect(
      decision(composio, {
        tools: [{ tool_slug: 'NOTION_INSERT_ROW_DATABASE', account: 'thinksid', arguments: { database_id: 'c52d9258-fed7-466d-8e70-0fa92980d3df' } }],
      }),
    ).toBe('allow');
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_UPDATE_ROW_DATABASE', arguments: { row_id: 'x' } }] })).toBe('allow');
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_INSERT_ROW_DATABASE', arguments: { database_id: 'otra' } }] })).toBe('ask');
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_ARCHIVE_NOTION_PAGE', arguments: {} }] })).toBe('ask');
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_FETCH_DATABASE', account: 'otra', arguments: {} }] })).toBe('ask');
  });

  it('Composio: Vercel sólo VERCEL_GET_*; GitHub lee, abre PR y comenta, nunca fusiona', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
    expect(decision(composio, { tools: [{ tool_slug: 'VERCEL_GET_DEPLOYMENTS', account: 'vercel_tetric-hash', arguments: {} }] })).toBe('allow');
    expect(decision(composio, { tools: [{ tool_slug: 'VERCEL_CREATE_DEPLOYMENT', arguments: {} }] })).toBe('ask');
    expect(decision(composio, { tools: [{ tool_slug: 'GITHUB_CREATE_A_PULL_REQUEST', arguments: {} }] })).toBe('allow');
    expect(decision(composio, { tools: [{ tool_slug: 'GITHUB_MERGE_A_PULL_REQUEST', arguments: {} }] })).toBe('ask');
    expect(decision(composio, { tools: [{ tool_slug: 'GMAIL_SEND_EMAIL', arguments: {} }] })).toBe('ask');
    expect(decision('mcp__github__merge_pull_request', {})).toBe('ask');
  });

  describe('SUPABASE_APPLY_A_MIGRATION (carril ddl_aditivo del viernes)', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
    const VIERNES = '2026-10-02';
    const JUEVES = '2026-10-01';
    let dir = '';
    const aditivo = [
      '-- guarda',
      "DO $$ BEGIN IF (SELECT count(*) FROM t) < 0 THEN RAISE EXCEPTION 'x'; END IF; END $$;",
      'ALTER TABLE public.t ADD COLUMN c text;',
      'REVOKE INSERT, UPDATE, DELETE ON public.t FROM anon;',
      "COMMENT ON COLUMN public.t.c IS 'no DROP aqui';",
    ].join('\n');
    const destructivo = 'UPDATE public.t SET c = null;';

    const llamada = (query: string, extra: Record<string, unknown> = {}) => ({
      tools: [
        {
          tool_slug: 'SUPABASE_APPLY_A_MIGRATION',
          account: 'supabase_bitis-coward',
          arguments: { ref: 'ywhtjwawnkeqlwxbvgup', name: 'x', query, rollback: '', ...extra },
        },
      ],
    });

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'guard-'));
      mkdirSync(join(dir, 'src/sql/migrations'), { recursive: true });
      writeFileSync(join(dir, 'src/sql/migrations/999_aditiva.sql'), aditivo + '\n');
      writeFileSync(join(dir, 'src/sql/migrations/998_destructiva.sql'), destructivo + '\n');
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('viernes + fichero del repo + aditiva: pasa sin prompt', () => {
      expect(decision(composio, llamada(aditivo), { fecha: VIERNES, cwd: dir })).toBe('allow');
    });
    it('fuera del viernes pide permiso (lunes y jueves no escriben)', () => {
      expect(decision(composio, llamada(aditivo), { fecha: JUEVES, cwd: dir })).toBe('ask');
    });
    it('SQL que no es byte a byte un fichero pide permiso', () => {
      expect(decision(composio, llamada(aditivo + '\nselect 1;'), { fecha: VIERNES, cwd: dir })).toBe('ask');
    });
    it('una migración no aditiva pide permiso aunque sea un fichero', () => {
      expect(decision(composio, llamada(destructivo), { fecha: VIERNES, cwd: dir })).toBe('ask');
    });
    it('otro proyecto u otra cuenta pide permiso', () => {
      expect(decision(composio, llamada(aditivo, { ref: 'otro' }), { fecha: VIERNES, cwd: dir })).toBe('ask');
      const sinCuenta = llamada(aditivo);
      delete (sinCuenta.tools[0] as { account?: string }).account;
      expect(decision(composio, sinCuenta, { fecha: VIERNES, cwd: dir })).toBe('ask');
    });
    it('un DO que escribe no es una guarda', () => {
      const q = 'DO $$ BEGIN DELETE FROM t; END $$;';
      writeFileSync(join(dir, 'src/sql/migrations/997_do.sql'), q);
      expect(decision(composio, llamada(q), { fecha: VIERNES, cwd: dir })).toBe('ask');
    });
    it('el conector viejo Supabase_Escritura sigue pidiendo permiso', () => {
      expect(decision('mcp__Supabase_Escritura__apply_migration', { query: aditivo }, { fecha: VIERNES, cwd: dir })).toBe('ask');
    });
  });

  it('herramientas ajenas a Supabase no reciben decisión', () => {
    expect(decision('mcp__github__list_issues', {})).toBeNull();
  });
});
