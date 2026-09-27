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

function decision(
  tool_name: string,
  tool_input: unknown,
  opciones: { desatendida?: boolean } = {},
): string | null {
  const env = {
    ...process.env,
    CLAUDE_PROJECT_DIR: raiz,
    CLAUDE_CODE_REMOTE: 'true',
    CLAUDE_CODE_SESSION_ATTENDED: opciones.desatendida ? '' : '1',
  };
  const salida = execFileSync('python3', [script], {
    input: JSON.stringify({ tool_name, tool_input, cwd: raiz }),
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

  describe('po_sonda (migración 170): consultas de prueba sin permiso', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
    const sql = (query: string, extra: Record<string, unknown> = {}) => ({
      tools: [
        {
          tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY',
          account: 'escocia-os',
          arguments: { ref: 'ywhtjwawnkeqlwxbvgup', query, ...extra },
        },
      ],
    });

    it.each([
      "select public.po_sonda($a$select count(*) from monitoreos$a$)",
      "SELECT po_sonda($a$insert into t values (1) returning *$a$, ARRAY[$b$set local role authenticated$b$, $b$select set_config('request.jwt.claims','{}',true)$b$])",
      "select public.po_sonda('explain analyze select 1');",
    ])('la forma exacta de la sonda pasa: %s', (q) => {
      expect(decision(composio, sql(q))).toBe('allow');
    });

    it.each([
      'delete from productos',
      "select public.po_sonda('select 1'); delete from productos",
      "select public.po_sonda('select 1'), (select count(*) from productos)",
      "select other_fn('x')",
      "select public.po_sonda('select 1') from productos",
    ])('SQL libre fuera de la sonda pide permiso: %s', (q) => {
      expect(decision(composio, sql(q))).toBe('ask');
    });

    it('la sonda exige la cuenta escocia-os y el proyecto de producción', () => {
      const sinCuenta = sql("select po_sonda('select 1')");
      delete (sinCuenta.tools[0] as { account?: string }).account;
      expect(decision(composio, sinCuenta)).toBe('ask');
      expect(decision(composio, sql("select po_sonda('select 1')", { ref: 'abcdefghijklmnopqrst' }))).toBe('ask');
    });

    it('SUPABASE_APPLY_A_MIGRATION siempre pide permiso (opción A: las Routines no escriben)', () => {
      const q = 'ALTER TABLE public.t ADD COLUMN c text;';
      expect(
        decision(composio, {
          tools: [{ tool_slug: 'SUPABASE_APPLY_A_MIGRATION', account: 'escocia-os', arguments: { ref: 'ywhtjwawnkeqlwxbvgup', query: q, name: 'x' } }],
        }),
      ).toBe('ask');
    });
  });

  describe('sesión desatendida (Routine): nunca pregunta, deniega', () => {
    const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';

    it('lo que pediría permiso se deniega, para que la corrida no quede en espera', () => {
      const escritura = { tools: [{ tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY', arguments: { query: 'delete from productos' } }] };
      expect(decision(composio, escritura, { desatendida: true })).toBe('deny');
      expect(decision('mcp__Supabase_Escritura__apply_migration', { query: 'select 1' }, { desatendida: true })).toBe('deny');
      expect(decision('mcp__github__merge_pull_request', {}, { desatendida: true })).toBe('deny');
    });

    it('lo permitido sigue pasando', () => {
      const lectura = { tools: [{ tool_slug: 'SUPABASE_RUN_READ_ONLY_QUERY', arguments: { query: 'select 1' } }] };
      expect(decision(composio, lectura, { desatendida: true })).toBe('allow');
    });

    it('una CLI local se considera atendida', () => {
      const salida = execFileSync('python3', [script], {
        input: JSON.stringify({ tool_name: 'mcp__Supabase__apply_migration', tool_input: {} }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_CODE_REMOTE: '', CLAUDE_CODE_SESSION_ATTENDED: '' },
      }).trim();
      expect(JSON.parse(salida).hookSpecificOutput.permissionDecision).toBe('ask');
    });
  });

  it('herramientas ajenas a Supabase no reciben decisión', () => {
    expect(decision('mcp__github__list_issues', {})).toBeNull();
  });
});
