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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

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

    it('SUPABASE_APPLY_A_MIGRATION pide permiso en sesión atendida (sólo el viernes desatendido aplica)', () => {
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

// ---------------------------------------------------------------------------
// Decisión de Santiago, 2026-10-26: el viernes desatendido aplica UNA migración
// aditiva, validada mecánicamente desde su SQL; el sábado crea su página.
// ---------------------------------------------------------------------------
const HARNESS = `
import importlib.util, json, sys, datetime
spec = importlib.util.spec_from_file_location("guard", ${JSON.stringify(script)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
p = json.load(sys.stdin)
def fecha(s):
    return None if s is None else datetime.date.fromisoformat(s)
if p["fn"] == "ddl":
    print(json.dumps([list(m.es_ddl_aditivo(q)) for q in p["sqls"]]))
elif p["fn"] == "apply":
    a = p["args"]
    r = m.evaluar_apply_viernes(a.get("project"), a.get("name"), a.get("query"), hoy=fecha(a.get("hoy")),
        atendida=a["atendida"], session_id=a.get("session_id"), marker_dir=a["marker_dir"])
    print(json.dumps(list(r)))
elif p["fn"] == "evento":
    r = m.evaluar_evento(p["evento"], hoy=fecha(p["hoy"]), atendida=p["atendida"], marker_dir=p["marker_dir"])
    print(json.dumps(None if r is None else list(r)))
`;

function py<T>(payload: unknown): T {
  return JSON.parse(execFileSync('python3', ['-c', HARNESS], { input: JSON.stringify(payload), encoding: 'utf8' })) as T;
}

type Veredicto = [boolean, string];
const ddl = (sqls: string[]): Veredicto[] => py<Veredicto[]>({ fn: 'ddl', sqls });
const ddl1 = (sql: string): Veredicto => ddl([sql])[0];

const VIERNES = '2026-10-30'; // viernes en America/New_York
const JUEVES = '2026-10-29';
const PROD = 'ywhtjwawnkeqlwxbvgup';
const MIGRACION_OK = "ALTER TABLE public.lotes ADD COLUMN fecha_nueva date NULL;";
const directorios: string[] = [];
const nuevoDirMarcas = () => {
  const d = mkdtempSync(join(tmpdir(), 'escocia-guard-test-'));
  directorios.push(d);
  return d;
};
afterAll(() => directorios.forEach((d) => rmSync(d, { recursive: true, force: true })));

const migracion = (numero: string) => {
  const dir = resolve(raiz, 'src/sql/migrations');
  const archivo = readdirSync(dir).find((f) => f.startsWith(`${numero}_`));
  if (!archivo) throw new Error(`no existe la migración ${numero}`);
  return readFileSync(resolve(dir, archivo), 'utf8');
};

describe('es_ddl_aditivo: corpus real del repo', () => {
  it('181 (ADD COLUMN nullable + COMMENT + DO que sólo hace RAISE) es la migración aditiva de referencia', () => {
    const [ok, motivo] = ddl1(migracion('181'));
    expect(motivo).toMatch(/sentencias aditivas/);
    expect(ok).toBe(true);
  });

  it.each([
    ['182', /DO|UPDATE/], // datos
    ['183', /CREATE OR REPLACE/],
    ['184', /CREATE OR REPLACE/],
    ['123', /DO|ALTER POLICY/], // política
    ['143', /CREATE FUNCTION/],
  ])('%s no pasa', (numero, razon) => {
    const [ok, motivo] = ddl1(migracion(numero));
    expect(ok).toBe(false);
    expect(motivo).toMatch(razon);
  });
});

describe('es_ddl_aditivo: lo que sí pasa', () => {
  it.each([
    'CREATE TABLE public.x (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), n text NOT NULL, c timestamptz DEFAULT now(), CHECK (char_length(n) > 0)); ' +
      'ALTER TABLE public.x ENABLE ROW LEVEL SECURITY; REVOKE ALL PRIVILEGES ON TABLE public.x FROM anon, authenticated, public;',
    "ALTER TABLE public.t ADD COLUMN IF NOT EXISTS c text, ADD d int NOT NULL DEFAULT 0, ADD COLUMN e jsonb DEFAULT '{}'::jsonb, ADD COLUMN f numeric(12,2) DEFAULT -1.5;",
    'ALTER TABLE ONLY IF EXISTS public.t ADD COLUMN c uuid REFERENCES public.o (id) ON DELETE RESTRICT ON UPDATE NO ACTION;',
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS i ON ONLY public.t USING btree (lower(c), d DESC) INCLUDE (e) WHERE d IS NOT NULL AND c IN ('a','b');",
    'CREATE TABLE public.y (id int, n text); ALTER TABLE public.y ENABLE ROW LEVEL SECURITY; CREATE UNIQUE INDEX y_n ON public.y (n);',
    'COMMENT ON TABLE public.t IS \'uno\'; COMMENT ON INDEX public.i IS $q$texto; con punto y coma$q$;',
    'ALTER TABLE public.t ADD COLUMN u uuid REFERENCES auth.users (id); CREATE TABLE respaldos.b (id int, u uuid REFERENCES auth.users (id)); ALTER TABLE respaldos.b ENABLE ROW LEVEL SECURITY;',
    "ALTER TABLE public.t ADD COLUMN d date DEFAULT date '2026-01-01', ADD COLUMN ts timestamptz DEFAULT timestamptz '2026-01-01 00:00:00+00' NOT NULL, ADD COLUMN i interval DEFAULT interval '1 day';",
    'CREATE TABLE public.n (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, k int GENERATED BY DEFAULT AS IDENTITY, u uuid DEFAULT gen_random_uuid(), c timestamptz DEFAULT now()); ALTER TABLE public.n ENABLE ROW LEVEL SECURITY;',
    "DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM generate_series(1, 3); IF v < 0 THEN RAISE EXCEPTION 'x'; END IF; END $$;",
    "BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout TO 30000; ALTER TABLE public.t ADD COLUMN c int; COMMIT;",
    "DO $$ BEGIN IF to_regclass('public.t') IS NULL THEN RAISE EXCEPTION 'no existe'; END IF; END $$;",
    'DO LANGUAGE plpgsql $f$ DECLARE v bigint; BEGIN SELECT count(*) INTO v FROM information_schema.columns; RAISE NOTICE \'%\', v; END $f$ LANGUAGE plpgsql;',
    '/* nota /* anidada */ ; DROP TABLE t */ ALTER TABLE "mi;tabla" ADD COLUMN c int; -- DROP TABLE t',
    "COMMENT ON TABLE public.t IS E'a\\'; DROP TABLE t; --';",
  ])('aditivo: %s', (sql) => {
    const [ok, motivo] = ddl1(sql);
    expect(motivo).toBeTruthy();
    expect(ok).toBe(true);
  });
});

describe('es_ddl_aditivo: cadenas adversarias', () => {
  const rls = (t: string) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`;
  const casos: Array<[string, string, RegExp?]> = [
    ['CREATE TABLE … AS SELECT', 'CREATE TABLE public.x AS SELECT * FROM public.lotes; ' + rls('public.x'), /lista de columnas/],
    ['segunda sentencia destructiva', 'CREATE INDEX i ON public.t (c); DROP TABLE public.t', /DROP/],
    ['DROP tras un comentario con ;', '/* ; */ DROP TABLE public.t', /DROP/],
    ['DROP tras un comentario de línea', '-- inocente\nDROP TABLE public.t', /DROP/],
    ['comentario sin cerrar', 'ALTER TABLE public.t ADD COLUMN c int /* ; ', /sin cerrar/],
    ['cadena sin cerrar', "COMMENT ON TABLE public.t IS 'abc", /sin cerrar/],
    ['identificador sin cerrar', 'ALTER TABLE "public.t ADD COLUMN c int', /sin cerrar/],
    ['una cadena estándar termina en la barra (\\\' no escapa)', "COMMENT ON TABLE public.t IS 'a\\'; DROP TABLE public.t; --'", /DROP|literal/],
    ['U& en cadena', "COMMENT ON TABLE public.t IS U&'\\0041'", /U&/],
    ['U& en identificador', 'ALTER TABLE U&"t" ADD COLUMN c int', /U&/],
    ['esquema auth', 'CREATE TABLE auth.x (id int); ' + rls('auth.x'), /auth/],
    ['esquema pg_*', 'CREATE TABLE pg_temp.x (id int); ' + rls('pg_temp.x'), /pg_temp/],
    ['ALTER TABLE en storage', 'ALTER TABLE storage.objects ADD COLUMN c int', /storage/],
    ['ADD y DROP COLUMN en una sentencia', 'ALTER TABLE public.t ADD COLUMN c int, DROP COLUMN d', /ADD COLUMN/],
    ['ALTER COLUMN', 'ALTER TABLE public.t ALTER COLUMN c SET NOT NULL', /no es aditivo|ADD COLUMN/],
    ['DEFAULT now()', 'ALTER TABLE public.t ADD COLUMN c timestamptz DEFAULT now()', /literal/],
    ['DEFAULT CURRENT_TIMESTAMP', 'ALTER TABLE public.t ADD COLUMN c timestamptz DEFAULT CURRENT_TIMESTAMP', /literal/],
    ['DEFAULT gen_random_uuid()', 'ALTER TABLE public.t ADD COLUMN c uuid DEFAULT gen_random_uuid()', /literal/],
    ['DEFAULT identificador', 'ALTER TABLE public.t ADD COLUMN c text DEFAULT otra_col', /literal/],
    ['DEFAULT concatenado', "ALTER TABLE public.t ADD COLUMN c text DEFAULT 'a' || 'b'", /expresión/],
    ['DEFAULT con operador', 'ALTER TABLE public.t ADD COLUMN c int DEFAULT 1 + 2', /expresión/],
    ['DEFAULT con paréntesis', 'ALTER TABLE public.t ADD COLUMN c int DEFAULT (1)', /literal/],
    ['NOT NULL sin DEFAULT', 'ALTER TABLE public.t ADD COLUMN c int NOT NULL', /NOT NULL/],
    ['columna generada', 'ALTER TABLE public.t ADD COLUMN c int GENERATED ALWAYS AS (1) STORED', /GENERATED/],
    ['clave primaria en ADD COLUMN', 'ALTER TABLE public.t ADD COLUMN c int PRIMARY KEY', /PRIMARY/],
    ['UNIQUE en ADD COLUMN', 'ALTER TABLE public.t ADD COLUMN c int UNIQUE', /UNIQUE/],
    ['CHECK en ADD COLUMN', 'ALTER TABLE public.t ADD COLUMN c int CHECK (c > 0)', /CHECK/],
    ['FK con ON DELETE CASCADE', 'ALTER TABLE public.t ADD COLUMN c uuid REFERENCES public.o (id) ON DELETE CASCADE', /RESTRICT/],
    ['FK con ON UPDATE SET NULL', 'ALTER TABLE public.t ADD COLUMN c uuid REFERENCES public.o (id) ON UPDATE SET NULL', /RESTRICT/],
    ['FK hacia otra tabla de auth', 'ALTER TABLE public.t ADD COLUMN c uuid REFERENCES auth.sessions (id)', /auth/],
    ['COMMENT … IS NULL borra un comentario', 'COMMENT ON TABLE public.t IS NULL', /IS NULL/],
    ['esquema fuera de la lista (extensions)', 'CREATE TABLE extensions.x (id int); ALTER TABLE extensions.x ENABLE ROW LEVEL SECURITY;', /extensions/],
    ['esquema fuera de la lista (cualquiera)', 'ALTER TABLE otro.t ADD COLUMN c int', /otro/],
    ['esquema con otra capitalización', 'ALTER TABLE "Public".t ADD COLUMN c int', /Public/],
    ['GENERATED … STORED', 'CREATE TABLE public.g (a int, b int GENERATED ALWAYS AS (a * 2) STORED); ALTER TABLE public.g ENABLE ROW LEVEL SECURITY;', /GENERATED/],
    ['IDENTITY en ADD COLUMN', 'ALTER TABLE public.t ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY', /GENERATED/],
    ['BEGIN que no es la primera sentencia', 'ALTER TABLE public.t ADD COLUMN c int; BEGIN; ALTER TABLE public.t ADD COLUMN d int; COMMIT;', /primera/],
    ['COMMIT que no es la última sentencia', 'BEGIN; ALTER TABLE public.t ADD COLUMN c int; COMMIT; ALTER TABLE public.t ADD COLUMN d int;', /última/],
    ['END a mitad del archivo', 'ALTER TABLE public.t ADD COLUMN c int; END; ALTER TABLE public.t ADD COLUMN d int;', /última/],
    ['CREATE TABLE con otra sentencia antes de su RLS', 'CREATE TABLE public.x (id int); COMMENT ON TABLE public.x IS \'hola\'; ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;', /inmediata/],
    ['dos CREATE TABLE seguidos', 'CREATE TABLE public.x (id int); CREATE TABLE public.y (id int); ALTER TABLE public.x ENABLE ROW LEVEL SECURITY; ALTER TABLE public.y ENABLE ROW LEVEL SECURITY;', /inmediata/],
    ['RLS de otra tabla justo después', 'CREATE TABLE public.x (id int); CREATE TABLE public.y (id int); ALTER TABLE public.y ENABLE ROW LEVEL SECURITY; ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;', /inmediata/],
    ['serial en ADD COLUMN', 'ALTER TABLE public.t ADD COLUMN c serial', /serial/],
    ['ADD CONSTRAINT … NOT VALID', 'ALTER TABLE public.t ADD CONSTRAINT ck CHECK (c > 0) NOT VALID', /CONSTRAINT/],
    ['bloque DO con EXECUTE', "DO $$ BEGIN EXECUTE 'drop table t'; END $$", /EXECUTE/],
    ['bloque DO con PERFORM pg_sleep', 'DO $$ BEGIN PERFORM pg_sleep(10); END $$', /PERFORM/],
    ['bloque DO con SELECT pg_sleep', 'DO $$ DECLARE v int; BEGIN SELECT pg_sleep(10) INTO v; END $$', /pg_sleep/],
    ['bloque DO con set_config', "DO $$ DECLARE v text; BEGIN SELECT set_config('request.jwt.claims', '{}', true) INTO v; END $$", /set_config/],
    ['bloque DO con schema.set_config', "DO $$ DECLARE v text; BEGIN SELECT pg_catalog.set_config('a', 'b', true) INTO v; END $$", /set_config/],
    ['bloque DO con nextval', "DO $$ DECLARE v bigint; BEGIN SELECT nextval('s') INTO v; END $$", /nextval/],
    ['bloque DO con función propia', 'DO $$ DECLARE v int; BEGIN SELECT public.fn_borra_todo() INTO v; END $$', /fn_borra_todo/],
    ['bloque DO con INSERT', 'DO $$ BEGIN INSERT INTO t VALUES (1); END $$', /INSERT/],
    ['bloque DO con CTE que escribe', 'DO $$ DECLARE v int; BEGIN WITH x AS (DELETE FROM t RETURNING 1) SELECT 1 INTO v; END $$', /DELETE/],
    ['bloque DO con SET', "DO $$ BEGIN SET search_path = x; END $$", /SET/],
    ['bloque DO que lee vault', 'DO $$ DECLARE v text; BEGIN SELECT decrypted_secret INTO v FROM vault.decrypted_secrets; END $$', /vault/],
    ['bloque DO que llama net.', "DO $$ DECLARE v bigint; BEGIN SELECT net.http_post('https://x') INTO v; END $$", /net/],
    ['bloque DO con dollar quote anidado', 'DO $a$ BEGIN RAISE NOTICE \'x\'; $b$ DROP TABLE t; $b$ END $a$', /anidado/],
    ['etiquetas de dollar quote que no cierran', 'DO $a$ BEGIN NULL; END $b$', /sin cerrar/],
    ['sentencia tras el DO', 'DO $$ BEGIN NULL; END $$; DROP TABLE t', /DROP/],
    ['DO con comillas dobles de sentencia', "DO 'BEGIN NULL; END'", /dollar/],
    ['ENABLE RLS sobre tabla ajena', 'ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY', /no se crea en este archivo/],
    ['DISABLE RLS', 'ALTER TABLE public.lotes DISABLE ROW LEVEL SECURITY', /ADD COLUMN|no es aditivo/],
    ['CREATE TABLE sin ENABLE RLS', 'CREATE TABLE public.x (id int)', /ROW LEVEL SECURITY/],
    ['CREATE TABLE IF NOT EXISTS', 'CREATE TABLE IF NOT EXISTS public.x (id int); ' + rls('public.x'), /IF NOT EXISTS/],
    ['CREATE TABLE … LIKE', 'CREATE TABLE public.x (LIKE public.lotes); ' + rls('public.x'), /LIKE/],
    ['CREATE TABLE … INHERITS', 'CREATE TABLE public.x (id int) INHERITS (public.lotes); ' + rls('public.x'), /cláusulas/],
    ['CREATE TABLE … PARTITION BY', 'CREATE TABLE public.x (id int) PARTITION BY RANGE (id); ' + rls('public.x'), /cláusulas/],
    ['CREATE UNLOGGED TABLE', 'CREATE UNLOGGED TABLE public.x (id int); ' + rls('public.x'), /UNLOGGED/],
    ['CREATE TEMP TABLE', 'CREATE TEMP TABLE x (id int)', /TEMP/],
    ['CREATE TABLE con columna generada', 'CREATE TABLE public.x (id int, d int GENERATED ALWAYS AS (id * 2) STORED); ' + rls('public.x'), /GENERATED/],
    ['CREATE TABLE con default que llama a una función propia', 'CREATE TABLE public.x (id int DEFAULT public.fn_x()); ' + rls('public.x'), /fn_x/],
    ['CREATE TABLE con FK en cascada', 'CREATE TABLE public.x (id int, l uuid REFERENCES public.lotes (id) ON DELETE CASCADE); ' + rls('public.x'), /RESTRICT/],
    ['REVOKE sobre tabla ajena', 'REVOKE ALL ON public.lotes FROM anon', /no se crea en este archivo/],
    ['REVOKE a otro rol', 'CREATE TABLE public.x (id int); ' + rls('public.x') + ' REVOKE ALL ON public.x FROM service_role', /rol distinto/],
    ['REVOKE parcial', 'CREATE TABLE public.x (id int); ' + rls('public.x') + ' REVOKE SELECT ON public.x FROM anon', /REVOKE ALL/],
    ['GRANT', 'GRANT SELECT ON public.lotes TO anon', /GRANT/],
    ['ALTER POLICY', 'ALTER POLICY p ON public.lotes USING (true)', /ALTER POLICY|no es aditivo/],
    ['CREATE POLICY', 'CREATE POLICY p ON public.lotes USING (true)', /POLICY/],
    ['CREATE OR REPLACE FUNCTION', 'CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$', /FUNCTION/],
    ['CREATE FUNCTION', 'CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$', /FUNCTION/],
    ['CREATE TRIGGER', 'CREATE TRIGGER t BEFORE INSERT ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.f()', /TRIGGER/],
    ['CREATE UNIQUE INDEX sobre tabla existente', 'CREATE UNIQUE INDEX u ON public.lotes (nombre)', /UNIQUE/],
    ['índice con función propia', 'CREATE INDEX i ON public.lotes (public.f(nombre))', /f\(/],
    ['índice con método desconocido', 'CREATE INDEX i ON public.lotes USING hnsw (v)', /método/],
    ['índice con WITH', 'CREATE INDEX i ON public.lotes (c) WITH (fillfactor = 10)', /cláusula/],
    ['índice en el esquema auth', 'CREATE INDEX i ON auth.users (email)', /auth/],
    ['COMMENT sobre función', 'COMMENT ON FUNCTION f() IS \'x\'', /clase de objeto/],
    ['COMMENT con expresión', "COMMENT ON TABLE public.t IS 'a' || 'b'", /literal/],
    ['COMMENT en el esquema vault', "COMMENT ON TABLE vault.secrets IS 'x'", /vault/],
    ['UPDATE de datos', 'UPDATE public.productos SET cantidad_actual = 0', /UPDATE/],
    ['DELETE', 'DELETE FROM public.productos', /DELETE/],
    ['INSERT', 'INSERT INTO public.productos DEFAULT VALUES', /INSERT/],
    ['TRUNCATE', 'TRUNCATE public.productos', /TRUNCATE/],
    ['DROP', 'DROP TABLE public.productos', /DROP/],
    ['SELECT suelto', 'SELECT cron.unschedule(3)', /SELECT/],
    ['ROLLBACK', 'ROLLBACK', /ROLLBACK/],
    ['SET que no es SET LOCAL timeout', 'SET search_path = x', /SET/],
    ['SET LOCAL de otra variable', "SET LOCAL role = 'postgres'", /SET/],
    ['SET LOCAL timeout en cero', "SET LOCAL statement_timeout = 0", /timeout/],
    ['SET LOCAL timeout sin literal', 'SET LOCAL lock_timeout = DEFAULT', /timeout/],
    ['byte NUL', 'ALTER TABLE public.t ADD COLUMN c int;\u0000 DROP TABLE t', /NUL/],
    ['parámetro $1', 'ALTER TABLE public.t ADD COLUMN c int DEFAULT $1', /\$/],
    ['paréntesis sin balancear', 'CREATE INDEX i ON public.t (c', /paréntesis/],
    ['vacío', '   -- nada\n', /sin sentencias|vacío/],
    ['sólo ;', ';;', /sin sentencias/],
  ];

  it.each(casos)('rechaza: %s', (_nombre, sql, razon) => {
    const [ok, motivo] = ddl1(sql);
    expect(ok).toBe(false);
    if (razon) expect(motivo).toMatch(razon);
  });

  it('todos los rechazos en un solo proceso coinciden con los de uno en uno (sin estado compartido)', () => {
    const veredictos = ddl(casos.map((c) => c[1]));
    expect(veredictos.every(([ok]) => ok === false)).toBe(true);
  });
});

describe('evaluar_apply_viernes: condiciones del apply', () => {
  const apply = (sobre: Partial<{
    project: unknown; name: unknown; query: unknown; hoy: string | null;
    atendida: boolean; session_id: unknown; marker_dir: string;
  }> = {}) =>
    py<[string, string]>({
      fn: 'apply',
      args: {
        project: PROD, name: '185_columna_nueva', query: MIGRACION_OK, hoy: VIERNES,
        atendida: false, session_id: 'sesion-1', marker_dir: nuevoDirMarcas(), ...sobre,
      },
    });

  it('viernes, desatendida, producción, nombre y SQL correctos: allow', () => {
    const dir = nuevoDirMarcas();
    const [decision, motivo] = apply({ marker_dir: dir });
    expect(decision).toBe('allow');
    expect(motivo).toMatch(/185_columna_nueva/);
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir)).toHaveLength(1); // la marca se escribió antes de responder
  });

  it('una sesión atendida conserva ask, también en viernes', () => {
    expect(apply({ atendida: true })[0]).toBe('ask');
    expect(apply({ atendida: true, hoy: JUEVES })[0]).toBe('ask');
  });

  it.each([
    ['lunes', '2026-10-26'], ['martes', '2026-10-27'], ['miércoles', '2026-10-28'],
    ['jueves', JUEVES], ['sábado', '2026-10-31'], ['domingo', '2026-11-01'],
  ])('%s se deniega, y el motivo lo dice', (_dia, hoy) => {
    const [decision, motivo] = apply({ hoy });
    expect(decision).toBe('deny');
    expect(motivo).toMatch(/viernes/);
    expect(motivo).toMatch(/NO CORRIÓ/);
  });

  it('sin fecha calculable se deniega (falla cerrado)', () => {
    const [decision, motivo] = apply({ hoy: null });
    expect(decision).toBe('deny');
    expect(motivo).toMatch(/fecha/);
  });

  it('otro proyecto, o ninguno, se deniega', () => {
    expect(apply({ project: 'abcdefghijklmnopqrst' })).toEqual(['deny', expect.stringMatching(/proyecto/)]);
    expect(apply({ project: undefined })[0]).toBe('deny');
    expect(apply({ project: 42 })[0]).toBe('deny');
  });

  it.each(['x', '18_corta', '185_Mayusculas', '185-guion', '1850_cuatro', '185_ab', '185_con espacio', '٣٤٥_arabe_indic', '185_ok\n', `185_${'a'.repeat(81)}`])(
    'nombre «%s» se deniega',
    (name) => {
      const [decision, motivo] = apply({ name });
      expect(decision).toBe('deny');
      expect(motivo).toMatch(/nombre/);
    },
  );

  it('sin nombre o sin SQL se deniega', () => {
    expect(apply({ name: undefined })[0]).toBe('deny');
    expect(apply({ query: undefined })[0]).toBe('deny');
    expect(apply({ query: '   ' })[0]).toBe('deny');
  });

  it('un SQL no aditivo se deniega con el motivo del validador', () => {
    const [decision, motivo] = apply({ query: 'UPDATE public.lotes SET activo = false' });
    expect(decision).toBe('deny');
    expect(motivo).toMatch(/no es DDL aditivo/);
    expect(motivo).toMatch(/UPDATE/);
  });

  it('un SQL rechazado no gasta el apply de la sesión', () => {
    const dir = nuevoDirMarcas();
    expect(apply({ marker_dir: dir, query: 'DROP TABLE x' })[0]).toBe('deny');
    expect(readdirSync(dir)).toHaveLength(0);
    expect(apply({ marker_dir: dir })[0]).toBe('allow');
  });

  it('el segundo apply de la misma sesión se deniega y el motivo lo dice', () => {
    const dir = nuevoDirMarcas();
    expect(apply({ marker_dir: dir, session_id: 's-uno' })[0]).toBe('allow');
    const [decision, motivo] = apply({ marker_dir: dir, session_id: 's-uno', name: '186_otra_columna' });
    expect(decision).toBe('deny');
    expect(motivo).toMatch(/un apply por sesión|ya hubo un apply/);
    // otra sesión sí puede
    expect(apply({ marker_dir: dir, session_id: 's-dos' })[0]).toBe('allow');
  });

  it('sin session_id se deniega', () => {
    expect(apply({ session_id: undefined })).toEqual(['deny', expect.stringMatching(/session_id/)]);
    expect(apply({ session_id: '' })[0]).toBe('deny');
    expect(apply({ session_id: 7 })[0]).toBe('deny');
  });

  it('un session_id hostil no sale del directorio de marcas', () => {
    const dir = nuevoDirMarcas();
    expect(apply({ marker_dir: dir, session_id: '../../../etc/passwd' })[0]).toBe('allow');
    expect(readdirSync(dir)).toHaveLength(1);
    expect(readdirSync(dir)[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('si no se puede escribir la marca se deniega (falla cerrado)', () => {
    const dir = nuevoDirMarcas();
    const archivo = join(dir, 'es-un-archivo');
    writeFileSync(archivo, 'x');
    const [decision, motivo] = apply({ marker_dir: join(archivo, 'marcas'), session_id: 'z' });
    expect(decision).toBe('deny');
    expect(motivo).toMatch(/marca/);
  });
});

describe('evaluar_evento: forma de la llamada (MCP y Composio)', () => {
  const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
  const evento = (tool_name: string, tool_input: unknown, extra: Record<string, unknown> = {}) => ({
    tool_name, tool_input, session_id: 'sesion-evento', ...extra,
  });
  const evaluar = (ev: unknown, sobre: { hoy?: string | null; atendida?: boolean; marker_dir?: string } = {}) =>
    py<[string, string] | null>({
      fn: 'evento', evento: ev, hoy: VIERNES, atendida: false, marker_dir: nuevoDirMarcas(), ...sobre,
    });
  const itemApply = (args: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    tool_slug: 'SUPABASE_APPLY_A_MIGRATION', account: 'escocia-os',
    arguments: { ref: PROD, name: '185_columna_nueva', query: MIGRACION_OK, ...args }, ...extra,
  });

  it('MCP apply_migration en viernes desatendido: allow, en todos los conectores', () => {
    for (const conector of ['Supabase', 'Supabase_Routines', 'Supabase_Escritura']) {
      const r = evaluar(evento(`mcp__${conector}__apply_migration`, { project_id: PROD, name: '185_columna_nueva', query: MIGRACION_OK }));
      expect(r?.[0]).toBe('allow');
    }
  });

  it('MCP apply_migration: jueves y atendida', () => {
    const ev = evento('mcp__Supabase_Escritura__apply_migration', { project_id: PROD, name: '185_columna_nueva', query: MIGRACION_OK });
    expect(evaluar(ev, { hoy: JUEVES })?.[0]).toBe('deny');
    expect(evaluar(ev, { atendida: true })?.[0]).toBe('ask');
  });

  it('MCP apply_migration con un argumento desconocido se deniega', () => {
    const ev = evento('mcp__Supabase__apply_migration', { project_id: PROD, name: '185_columna_nueva', query: MIGRACION_OK, extra: 1 });
    expect(evaluar(ev)).toEqual(['deny', expect.stringMatching(/argumentos no reconocidos/)]);
  });

  it('Composio apply en viernes desatendido, con cuenta explícita: allow (con idempotency_key opcional)', () => {
    expect(evaluar(evento(composio, { tools: [itemApply()] }))?.[0]).toBe('allow');
    expect(evaluar(evento(composio, { tools: [itemApply({ idempotency_key: 'abc-123' })] }))?.[0]).toBe('allow');
    expect(evaluar(evento(composio, { tools: [itemApply({ idempotency_key: 5 })] }))?.[0]).toBe('deny');
  });

  it('Composio apply con `rollback` se deniega en la ruta desatendida (semántica no documentada)', () => {
    const r = evaluar(evento(composio, { tools: [itemApply({ rollback: 'ALTER TABLE public.lotes DROP COLUMN fecha_nueva;' })] }));
    expect(r).toEqual(['deny', expect.stringMatching(/rollback/)]);
    expect(evaluar(evento(composio, { tools: [itemApply({ rollback: '' })] }))?.[0]).toBe('deny');
    expect(evaluar(evento(composio, { tools: [itemApply({ rollback: 'x' })] }), { atendida: true })?.[0]).toBe('ask');
  });

  it('Composio apply: jueves, atendida, sin cuenta, cuenta ajena, otro proyecto, argumentos extra', () => {
    const ev = (item: unknown) => evento(composio, { tools: [item] });
    expect(evaluar(ev(itemApply()), { hoy: JUEVES })?.[0]).toBe('deny');
    expect(evaluar(ev(itemApply()), { atendida: true })?.[0]).toBe('ask');
    const sinCuenta = itemApply();
    delete (sinCuenta as { account?: string }).account;
    expect(evaluar(ev(sinCuenta))).toEqual(['deny', expect.stringMatching(/account/)]);
    expect(evaluar(ev(itemApply({}, { account: 'otra-cuenta' })))?.[0]).toBe('deny');
    expect(evaluar(ev(itemApply({ ref: 'abcdefghijklmnopqrst' })))?.[0]).toBe('deny');
    expect(evaluar(ev(itemApply({ name: 'sin_numero' })))?.[0]).toBe('deny');
    expect(evaluar(ev(itemApply({ cualquiera: 'x' })))).toEqual(['deny', expect.stringMatching(/argumentos no reconocidos/)]);
    expect(evaluar(ev(itemApply({ query: "UPDATE public.lotes SET activo = false" })))?.[0]).toBe('deny');
  });

  it('Composio: un apply en lote con cualquier otro item nunca pasa', () => {
    const lectura = { tool_slug: 'SUPABASE_RUN_READ_ONLY_QUERY', arguments: { query: 'select 1' } };
    for (const tools of [[itemApply(), lectura], [lectura, itemApply()], [itemApply(), itemApply({ name: '186_otra_cosa' })]]) {
      const r = evaluar(evento(composio, { tools }));
      expect(r?.[0]).toBe('ask');
      expect(r?.[1]).toMatch(/un único item|sola/);
      expect(evaluar(evento(composio, { tools }), { atendida: false })?.[0]).not.toBe('allow');
    }
  });

  it('un segundo apply en la misma sesión (por el otro camino) se deniega', () => {
    const dir = nuevoDirMarcas();
    const mcp = evento('mcp__Supabase__apply_migration', { project_id: PROD, name: '185_columna_nueva', query: MIGRACION_OK });
    expect(evaluar(mcp, { marker_dir: dir })?.[0]).toBe('allow');
    const r = evaluar(evento(composio, { tools: [itemApply({ name: '186_otra_cosa' })] }), { marker_dir: dir });
    expect(r?.[0]).toBe('deny');
    expect(r?.[1]).toMatch(/un apply por sesión|ya hubo un apply/);
  });

  it('un evento sin session_id nunca aplica', () => {
    const ev = { tool_name: 'mcp__Supabase__apply_migration', tool_input: { project_id: PROD, name: '185_columna_nueva', query: MIGRACION_OK } };
    expect(evaluar(ev)).toEqual(['deny', expect.stringMatching(/session_id/)]);
  });

  it('el resto de las herramientas de escritura de Supabase sigue pidiendo permiso', () => {
    expect(evaluar(evento('mcp__Supabase__deploy_edge_function', {}))?.[0]).toBe('ask');
    expect(evaluar(evento('mcp__Supabase__execute_sql', { query: 'update t set a = 1' }))?.[0]).toBe('ask');
    expect(evaluar(evento(composio, { tools: [{ tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY', arguments: { query: 'delete from t' } }] }))?.[0]).toBe('ask');
  });
});

describe('hook real (stdin → stdout): lo que no depende del día', () => {
  const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
  const apply = (args: Record<string, unknown>) => ({
    tools: [{ tool_slug: 'SUPABASE_APPLY_A_MIGRATION', account: 'escocia-os', arguments: args }],
  });

  it('desatendido, con el proyecto equivocado: deny cualquier día; atendido: ask', () => {
    const malo = apply({ ref: 'abcdefghijklmnopqrst', name: '185_columna_nueva', query: 'ALTER TABLE public.lotes ADD COLUMN c int' });
    expect(decision(composio, malo, { desatendida: true })).toBe('deny');
    expect(decision(composio, malo)).toBe('ask');
  });

  it('desatendido, un apply en lote con otra herramienta: deny cualquier día', () => {
    const lote = {
      tools: [
        ...apply({ ref: PROD, name: '185_columna_nueva', query: 'ALTER TABLE public.lotes ADD COLUMN c int' }).tools,
        { tool_slug: 'SUPABASE_RUN_READ_ONLY_QUERY', arguments: { query: 'select 1' } },
      ],
    };
    expect(decision(composio, lote, { desatendida: true })).toBe('deny');
  });

  it('importar el módulo no imprime nada ni lee stdin', () => {
    const salida = execFileSync(
      'python3',
      ['-c', `import importlib.util;s=importlib.util.spec_from_file_location("g", ${JSON.stringify(script)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)`],
      { encoding: 'utf8', input: '' },
    );
    expect(salida).toBe('');
  });
});

describe('Composio: página del reporte del sábado en Notion', () => {
  const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
  const REPORTES = '40667755ed68814fb676f9e28be7d2f3';
  const REPORTES_CON_GUIONES = '40667755-ed68-814f-b676-f9e28be7d2f3';
  const pagina = (argumentos: Record<string, unknown>, extra: Record<string, unknown> = { account: 'thinksid' }) => ({
    tools: [{ tool_slug: 'NOTION_CREATE_NOTION_PAGE', arguments: { title: 'Reporte', ...argumentos }, ...extra }],
  });

  it('el padre correcto, con cuenta explícita, pasa (con y sin guiones, cualquier alias, cualquier día)', () => {
    expect(decision(composio, pagina({ parent_id: REPORTES }))).toBe('allow');
    expect(decision(composio, pagina({ parent_page_id: REPORTES }))).toBe('allow');
    expect(decision(composio, pagina({ parent_id: REPORTES_CON_GUIONES.toUpperCase() }))).toBe('allow');
    expect(decision(composio, pagina({ parent_id: REPORTES, parent_page_id: REPORTES_CON_GUIONES }))).toBe('allow');
    expect(decision(composio, pagina({ parent_id: REPORTES }, { account: 'notion_awork-knit' }))).toBe('allow');
    expect(decision(composio, pagina({ parent_id: REPORTES }), { desatendida: true })).toBe('allow');
  });

  it('otro padre, sin padre, o padre mal formado se deniega', () => {
    const otro = 'c52d9258fed7466d8e700fa92980d3df';
    expect(decision(composio, pagina({ parent_id: otro }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: otro }), { desatendida: true })).toBe('deny');
    expect(decision(composio, pagina({}))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: '' }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: null }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: 12345 }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: `${REPORTES}0` }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: `https://www.notion.so/${REPORTES}` }))).toBe('ask');
  });

  it('dos alias que no coinciden se deniegan, aunque uno sea el correcto', () => {
    const otro = 'c52d9258fed7466d8e700fa92980d3df';
    expect(decision(composio, pagina({ parent_id: REPORTES, parent_page_id: otro }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: otro, parent_page_id: REPORTES }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: REPORTES, parent_page_id: null }))).toBe('ask');
  });

  it('padre correcto pero con otro especificador de padre en los argumentos se deniega', () => {
    expect(decision(composio, pagina({ parent_id: REPORTES, database_id: 'c52d9258fed7466d8e700fa92980d3df' }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: REPORTES, parent: { database_id: 'x' } }))).toBe('ask');
  });

  it('sin cuenta explícita, o con otra cuenta, se deniega', () => {
    expect(decision(composio, pagina({ parent_id: REPORTES }, {}))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: REPORTES }, { account: 'otra' }))).toBe('ask');
    expect(decision(composio, pagina({ parent_id: REPORTES }, {}), { desatendida: true })).toBe('deny');
  });

  it('mezclada con otra herramienta fuera de la política, no se cuela', () => {
    const lote = {
      tools: [
        ...pagina({ parent_id: REPORTES }).tools,
        { tool_slug: 'NOTION_ARCHIVE_NOTION_PAGE', account: 'thinksid', arguments: {} },
      ],
    };
    expect(decision(composio, lote)).toBe('ask');
  });

  it('las demás herramientas de Notion conservan su regla', () => {
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_ARCHIVE_NOTION_PAGE', account: 'thinksid', arguments: {} }] })).toBe('ask');
    expect(decision(composio, { tools: [{ tool_slug: 'NOTION_FETCH_DATABASE', arguments: {} }] })).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// Revisión adversaria de QA (2026-10-26). Cada prueba de este bloque describe un
// comportamiento SEGURO y hoy FALLA: el hook deja pasar algo que no debe.
// ---------------------------------------------------------------------------
describe('adversarial (qa 2026-10-26)', () => {
  const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';

  describe('el hook no puede fallar abierto', () => {
    it('un JSON válido pero muy anidado (RecursionError en json.load) no sale sin decisión', () => {
      const profundo = '['.repeat(1500) + ']'.repeat(1500);
      const entrada =
        '{"tool_name":"mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL","tool_input":{"tools":' +
        '[{"tool_slug":"SUPABASE_BETA_RUN_SQL_QUERY","account":"escocia-os","arguments":{"query":"delete from productos","ref":"ywhtjwawnkeqlwxbvgup"}}],' +
        `"relleno":${profundo}}}`;
      const salida = execFileSync('python3', [script], {
        input: entrada,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_SESSION_ATTENDED: '' },
      }).trim();
      // Sin salida = «sin opinión»: la herramienta (always_allow en la Routine) correría sin filtro.
      expect(salida).not.toBe('');
      expect(JSON.parse(salida).hookSpecificOutput.permissionDecision).toBe('deny');
    });

    it('una entrada enorme no agota el timeout del hook (10 s en settings.json) por regex cuadrática', () => {
      // 15.000 aperturas de dollar quote con etiqueta distinta y ninguna de cierre: la regex
      // de quitar_comentarios_y_literales las recorre hasta el final una por una.
      const letras = 'abcdefghijklmnopqrstuvwxyz';
      const etiquetas: string[] = [];
      for (let i = 0; etiquetas.length < 15000; i++) {
        etiquetas.push(`$${letras[i % 26]}${letras[Math.floor(i / 26) % 26]}${letras[Math.floor(i / 676) % 26]}${letras[Math.floor(i / 17576) % 26]}$`);
      }
      const q = 'select ' + etiquetas.join(' ');
      const t0 = Date.now();
      decision('mcp__Supabase_Escritura__execute_sql', { query: q }, { desatendida: true });
      expect(Date.now() - t0).toBeLessThan(2000);
    }, 60000);
  });

  describe('execute_sql de «solo lectura» no se deja engañar por comentarios dentro de cadenas', () => {
    it.each([
      ["select 'x--'; delete from productos; select 'y'", 'línea -- dentro de una cadena'],
      ["select '/*'; delete from productos; select '*/'", 'bloque /* */ que cruza dos cadenas'],
      ["select '$$'; delete from productos; select '$$'", 'dollar quote que cruza dos cadenas'],
    ])('%s (%s) pide permiso', (q) => {
      expect(decision('mcp__Supabase_Escritura__execute_sql', { query: q })).toBe('ask');
      expect(decision('mcp__Supabase_Escritura__execute_sql', { query: q }, { desatendida: true })).toBe('deny');
    });

    it.each([
      ['select * into public.copia_productos from public.productos', 'SELECT … INTO crea una tabla'],
      ["select set_config('role', 'postgres', false)", 'set_config cambia el estado de la sesión'],
      ["select pg_notify('canal', 'x')", 'pg_notify emite una notificación'],
      ["select public.fn_cleanup_compra_dependencies('00000000-0000-0000-0000-000000000000')", 'una función de public que borra filas'],
    ])('%s (%s) pide permiso', (q) => {
      expect(decision('mcp__Supabase_Escritura__execute_sql', { query: q })).toBe('ask');
    });
  });

  describe('po_sonda: la forma exacta no se falsifica con comentarios dentro de cadenas', () => {
    const sonda = (query: string) => ({
      tools: [{ tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY', account: 'escocia-os', arguments: { ref: PROD, query } }],
    });

    it.each([
      "select public.po_sonda('/*') ; delete from public.productos ; select ('*/')",
      "select public.po_sonda('$$') ; delete from public.productos ; select ('$$')",
    ])('SQL libre con otra sentencia escondida pide permiso: %s', (q) => {
      expect(decision(composio, sonda(q))).toBe('ask');
      expect(decision(composio, sonda(q), { desatendida: true })).toBe('deny');
    });
  });

  describe('es_ddl_aditivo: una tabla nueva nunca queda confirmada sin RLS', () => {
    it('un COMMIT en medio del archivo confirma la tabla antes de que el ENABLE RLS (que puede no llegar) se ejecute', () => {
      const [ok] = ddl1(
        'BEGIN; CREATE TABLE public.expuesta (id int); COMMIT; ' +
          'ALTER TABLE public.no_existe ADD COLUMN c int; ' + // falla en producción: aborta antes del RLS
          'ALTER TABLE public.expuesta ENABLE ROW LEVEL SECURITY;',
      );
      expect(ok).toBe(false);
    });

    it('un DO con RAISE EXCEPTION entre el COMMIT y el ENABLE RLS tampoco', () => {
      const [ok] = ddl1(
        "CREATE TABLE public.expuesta (id int); COMMIT; DO $$ BEGIN RAISE EXCEPTION 'aborta'; END $$; " +
          'ALTER TABLE public.expuesta ENABLE ROW LEVEL SECURITY;',
      );
      expect(ok).toBe(false);
    });

    it('un esquema entrecomillado con mayúsculas ("Public") no es el esquema public', () => {
      // "Public" es otro esquema en PostgreSQL: el ENABLE RLS fallaría y la tabla de arriba quedaría sin RLS.
      const [ok] = ddl1(
        'BEGIN; CREATE TABLE public.expuesta (id int); COMMIT; ALTER TABLE "Public".expuesta ENABLE ROW LEVEL SECURITY;',
      );
      expect(ok).toBe(false);
      expect(ddl1('CREATE TABLE "Public".expuesta (id int); ALTER TABLE public.expuesta ENABLE ROW LEVEL SECURITY;')[0]).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Segunda ronda (respuesta a la revisión de QA): fallar cerrado, compuertas de SQL
// sobre el tokenizador, meta-herramientas de Composio, protección del propio guard.
// ---------------------------------------------------------------------------
describe('endurecimiento tras la revisión de QA', () => {
  const composio = 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL';
  const crudo = (entrada: string | Buffer, desatendida = true) => {
    const salida = execFileSync('python3', [script], {
      input: entrada,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_SESSION_ATTENDED: desatendida ? '' : '1' },
    }).trim();
    return salida ? (JSON.parse(salida).hookSpecificOutput.permissionDecision as string) : null;
  };

  describe('falla cerrado', () => {
    it.each([
      ['no es JSON', 'esto no es json'],
      ['vacío', ''],
      ['JSON que no es un objeto', '[1, 2, 3]'],
      ['UTF-8 inválido', Buffer.from([0x7b, 0xff, 0xfe, 0x7d])],
    ])('entrada %s: deny desatendido, ask atendido', (_n, entrada) => {
      expect(crudo(entrada as string)).toBe('deny');
      expect(crudo(entrada as string, false)).toBe('ask');
    });

    it('una entrada de más de 256 KB se rechaza sin parsearla', () => {
      const grande = JSON.stringify({ tool_name: 'mcp__github__list_issues', tool_input: { relleno: 'x'.repeat(300 * 1024) } });
      expect(crudo(grande)).toBe('deny');
      expect(crudo(grande, false)).toBe('ask');
    });

    it('una entrada cercana al tope, pero dentro de él, sigue su camino normal', () => {
      const casi = JSON.stringify({ tool_name: 'mcp__github__list_issues', tool_input: { relleno: 'x'.repeat(200 * 1024) } });
      expect(crudo(casi)).toBeNull();
    });
  });

  describe('compuertas de SQL sobre el tokenizador', () => {
    const gates = (sql: string) => {
      const t0 = Date.now();
      const r = JSON.parse(
        execFileSync(
          'python3',
          ['-c', `import importlib.util,json,sys
s=importlib.util.spec_from_file_location("g", ${JSON.stringify(script)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
q=json.load(sys.stdin)
print(json.dumps([m.sql_es_solo_lectura(q), m.es_sonda(q), list(m.es_ddl_aditivo(q))]))`],
          { input: JSON.stringify(sql), encoding: 'utf8' },
        ),
      ) as [boolean, boolean, Veredicto];
      return { lectura: r[0], sonda: r[1], ddl: r[2], ms: Date.now() - t0 };
    };

    it.each([
      ['dollar quotes sin cerrar', 'select ' + Array.from({ length: 19000 }, (_, i) => `$t${i}$`).join(' ')],
      ['cadenas y comentarios largos', "select '" + 'a'.repeat(170000) + "'"],
      ['comentarios de bloque anidados', '/*'.repeat(45000) + '*/'.repeat(45000) + ' select 1'],
      ['muchos «--»', Array.from({ length: 20000 }, () => '-- c').join('\n') + '\nselect 1'],
      ['170 KB de sentencias cortas', Array.from({ length: 17000 }, () => 'select 1;').join(' ')],
      ['170 KB de identificadores', 'select ' + Array.from({ length: 20000 }, (_, i) => `c${i}`).join(', ')],
    ])('%s: decide en menos de 1 s', (_n, sql) => {
      expect(sql.length).toBeGreaterThan(100000);
      expect(sql.length).toBeLessThan(200000);
      const { ms } = gates(sql);
      expect(ms).toBeLessThan(1000);
    }, 20000);

    it.each([
      "select count(*), max(fecha) from public.monitoreos where plaga = 'a;b'",
      "with t as (select 1 as a) select a from t",
      "select pg_get_functiondef('public.set_cosecha_aguacate'::regproc::oid), version()",
      'select a.id, b.n from public.t a, lateral (select count(*) n from public.u where u.t = a.id) b',
      "select percentile_cont(0.5) within group (order by n) from public.t",
      "select has_table_privilege('anon', 'public.lotes', 'select'), obj_description('public.lotes'::regclass)",
      "explain select * from public.lotes",
      "table public.lotes",
      "values (1), (2)",
      "select 'x--' , '/*' , '*/' , $$ ; delete $$ from public.lotes",
    ])('lectura que sí pasa: %s', (q) => {
      expect(gates(q).lectura).toBe(true);
    });

    it.each([
      ['SELECT … INTO', 'select * into public.copia from public.productos'],
      ['FOR UPDATE', 'select * from public.productos for update'],
      ['FOR SHARE', 'select * from public.productos for share'],
      ['EXPLAIN ANALYZE', 'explain analyze select 1'],
      ['EXPLAIN (ANALYZE)', 'explain (analyze true) select 1'],
      ['set_config', "select set_config('role', 'postgres', false)"],
      ['pg_notify', "select pg_notify('c', 'x')"],
      ['función de public', "select public.fn_cleanup_compra_dependencies('00000000-0000-0000-0000-000000000000')"],
      ['función de public sin esquema', "select fn_cleanup_compra_dependencies('00000000-0000-0000-0000-000000000000')"],
      ['función de public entrecomillada', 'select "fn_cleanup_compra_dependencies"(\'x\')'],
      ['nextval', "select nextval('s')"],
      ['pg_sleep', 'select pg_sleep(100)'],
      ['net.http_post', "select net.http_post('https://x')"],
      ['cron.alter_job', 'select cron.alter_job(3, active := false)'],
      ['lectura de vault', 'select * from vault.decrypted_secrets'],
      ['current_setting (GUC con secretos)', "select current_setting('app.settings.jwt_secret')"],
      ['SHOW', 'show server_version'],
      ['SHOW ALL', 'show all'],
      ['generate_series (carga sin tope)', 'select * from generate_series(1, 100000000)'],
      ['pg_settings', 'select name, setting from pg_settings'],
      ['pg_catalog.pg_settings', 'select * from pg_catalog.pg_settings'],
      ['pg_db_role_setting', 'select setconfig from pg_db_role_setting'],
      ['pg_foreign_server', 'select srvoptions from pg_foreign_server'],
      ['pg_user_mappings', 'select umoptions from pg_user_mappings'],
      ['pg_authid', 'select rolpassword from pg_authid'],
      ['pg_roles (rolconfig)', 'select rolconfig from pg_roles'],
      ['pg_stat_statements (texto de consultas)', 'select query from pg_stat_statements'],
      ['pg_stat_activity (texto de consultas)', 'select query from pg_stat_activity'],
      ['esquema supabase_migrations', 'select statements from supabase_migrations.schema_migrations'],
      ['literal tipado reg* en lectura', "select regclass 'public.lotes'"],
      ['pg_shadow', 'select passwd from pg_shadow'],
      ['rolpassword vía pg_roles', 'select rolpassword from pg_roles'],
      ['pg_file_settings', 'select * from pg_file_settings'],
      ['pg_hba_file_rules', 'select * from pg_hba_file_rules'],
      ['auth.*', 'select email from auth.users'],
      ['"auth" entrecomillado', 'select email from "auth"."users"'],
      ['pgsodium.*', 'select * from pgsodium.key'],
      ['pgsodium_masks.*', 'select * from pgsodium_masks.key'],
      ['net.*', 'select * from net._http_response'],
      ['supabase_functions.*', 'select * from supabase_functions.hooks'],
      ['cron.*', 'select jobname from cron.job'],
      ['TABLE sobre vault', 'table vault.secrets'],
      ['VALUES con subconsulta a vault', 'values ((select decrypted_secret from vault.decrypted_secrets limit 1))'],
      ['dos sentencias', 'select 1; select 2'],
      ['escritura tras un comentario', 'select 1; -- x\ndelete from public.productos'],
      ['CTE que escribe', 'with x as (delete from public.productos returning *) select * from x'],
      ['sin cerrar', "select 'abc"],
      ['NUL', 'select 1\u0000'],
      ['vacío', '   '],
      ['DO', 'do $$ begin null; end $$'],
    ])('no es lectura: %s', (_n, q) => {
      expect(gates(q).lectura).toBe(false);
    });

    it.each([
      "select public.po_sonda($a$select 1$a$)",
      "SELECT po_sonda('select 1', 'set local role anon');",
      "select public.po_sonda('a', ARRAY['b', $x$c; d$x$])",
    ])('la sonda exacta pasa: %s', (q) => {
      expect(gates(q).sonda).toBe(true);
    });

    it.each([
      "select public.po_sonda('a') from public.productos",
      "select public.po_sonda('a'), 1",
      "select public.po_sonda('a'); select 1",
      "select public.po_sonda('a', ARRAY[])",
      "select public.po_sonda('a', ARRAY['b'], 3)",
      "select public.po_sonda(lower('a'))",
      "select public.po_sonda('a' || 'b')",
      "select other.po_sonda('a')",
      "select public.po_sonda('a') where true",
      "select public.po_sonda()",
      "select public.po_sonda('/*') ; delete from public.productos ; select ('*/')",
    ])('no es la sonda: %s', (q) => {
      expect(gates(q).sonda).toBe(false);
    });
  });

  describe('SUPABASE_BETA_RUN_SQL_QUERY ambiguo', () => {
    const sonda = "select public.po_sonda('select 1')";
    const conArgs = (args: Record<string, unknown>) => ({
      tools: [{ tool_slug: 'SUPABASE_BETA_RUN_SQL_QUERY', account: 'escocia-os', arguments: args }],
    });
    it('`query` y `sql` a la vez, o `ref` y `project_ref` a la vez: deny, también atendido no pasa', () => {
      expect(decision(composio, conArgs({ ref: PROD, query: sonda }))).toBe('allow');
      expect(decision(composio, conArgs({ ref: PROD, query: sonda, sql: 'delete from productos' }))).toBe('deny');
      expect(decision(composio, conArgs({ ref: PROD, project_ref: 'otro', query: sonda }))).toBe('deny');
      expect(decision(composio, conArgs({ ref: PROD, query: sonda, sql: sonda }), { desatendida: true })).toBe('deny');
    });
  });

  describe('meta-herramientas de Composio', () => {
    const meta = (nombre: string, entrada: unknown = {}, o: { desatendida?: boolean } = {}) =>
      decision(`mcp__Composio__${nombre}`, entrada, o);

    it('el workbench y el bash remoto siempre piden permiso (deny desatendido)', () => {
      for (const n of ['COMPOSIO_REMOTE_WORKBENCH', 'COMPOSIO_REMOTE_BASH_TOOL']) {
        expect(meta(n, { code_to_execute: 'print(1)' })).toBe('ask');
        expect(meta(n, { code_to_execute: 'print(1)' }, { desatendida: true })).toBe('deny');
      }
    });

    it('buscar herramientas y leer esquemas pasan', () => {
      expect(meta('COMPOSIO_SEARCH_TOOLS', { queries: [] }, { desatendida: true })).toBe('allow');
      expect(meta('COMPOSIO_GET_TOOL_SCHEMAS', { tool_slugs: [] }, { desatendida: true })).toBe('allow');
    });

    it('COMPOSIO_MANAGE_CONNECTIONS sólo pasa si TODOS los toolkits son action: list', () => {
      const u = { desatendida: true };
      const nm = 'COMPOSIO_MANAGE_CONNECTIONS';
      expect(meta(nm, { toolkits: [{ name: 'supabase', action: 'list' }] }, u)).toBe('allow');
      expect(meta(nm, { toolkits: [{ name: 'supabase', action: 'list' }, { name: 'notion', action: 'list' }], session_id: 's1' }, u)).toBe('allow');
      expect(meta(nm, { toolkits: [{ name: 'supabase', action: 'list' }, { name: 'notion', action: 'add' }] }, u)).toBe('deny');
      expect(meta(nm, { toolkits: [{ name: 'supabase', action: 'add' }] }, u)).toBe('deny');
      expect(meta(nm, { toolkits: [{ name: 'supabase', action: 'list', extra: 1 }] }, u)).toBe('deny');
      expect(meta(nm, { toolkits: [{ action: 'list' }], otra_clave: 1 }, u)).toBe('deny');
      expect(meta(nm, { toolkits: [{ name: 'x', action: 'list' }], session_id: 5 }, u)).toBe('deny');
      expect(meta(nm, { toolkits: [] }, u)).toBe('deny');
      expect(meta(nm, { action: 'list' }, u)).toBe('deny');
      expect(meta(nm, {}, u)).toBe('deny');
    });

    it('cualquier otra herramienta de Composio pide permiso', () => {
      expect(meta('COMPOSIO_ALGO_NUEVO', {})).toBe('ask');
      expect(meta('GMAIL_SEND_EMAIL', {}, { desatendida: true })).toBe('deny');
    });
  });

  describe('settings.json protege al guard', () => {
    const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'));
    it('el matcher cubre todas las herramientas de Composio', () => {
      const matcher = new RegExp(`^(?:${settings.hooks.PreToolUse[0].matcher})$`);
      for (const n of ['COMPOSIO_REMOTE_WORKBENCH', 'COMPOSIO_REMOTE_BASH_TOOL', 'COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MULTI_EXECUTE_TOOL', 'COMPOSIO_MANAGE_CONNECTIONS']) {
        expect(matcher.test(`mcp__Composio__${n}`)).toBe(true);
      }
      expect(matcher.test('mcp__Supabase_Escritura__apply_migration')).toBe(true);
    });
    it('permissions.deny impide editar el hook y la configuración', () => {
      expect(settings.permissions.deny).toEqual(
        expect.arrayContaining([
          'Edit(.claude/hooks/**)', 'Write(.claude/hooks/**)', 'Edit(.claude/settings.json)', 'Write(.claude/settings.json)',
        ]),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Ronda 2 de la revisión adversaria de QA (2026-10-26). Igual que arriba: cada
// prueba describe el comportamiento SEGURO y hoy FALLA.
// ---------------------------------------------------------------------------
describe('adversarial ronda 2 (qa 2026-10-26)', () => {
  const rls = ' ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;';

  it('una identity no puede crear su secuencia fuera de public/respaldos (SEQUENCE NAME)', () => {
    for (const secuencia of ['auth.secuencia_ajena', 'extensions.secuencia_ajena', 'storage.secuencia_ajena']) {
      const [ok] = ddl1(`CREATE TABLE public.x (id int GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME ${secuencia}));${rls}`);
      expect(ok, secuencia).toBe(false);
    }
  });

  it.each(['auth.users', 'storage.objects', 'vault.secrets', 'public.lotes'])(
    'una columna con el tipo fila de %s no se acepta: ata esa tabla y le bloquea futuros ALTER',
    (tipo) => {
      expect(ddl1(`CREATE TABLE public.x (a ${tipo});${rls}`)[0]).toBe(false);
      expect(ddl1(`ALTER TABLE public.t ADD COLUMN c ${tipo};`)[0]).toBe(false);
    },
  );

  it.each([
    ["select current_setting('app.settings.jwt_secret')", 'GUC de base con el secreto JWT'],
    ['select setconfig from pg_db_role_setting', 'los GUC por base y por rol, incluidos los secretos'],
    ['select * from pgsodium.key', 'llaves de pgsodium'],
  ])('execute_sql de lectura no lee secretos: %s (%s)', (q) => {
    expect(decision('mcp__Supabase_Escritura__execute_sql', { query: q })).toBe('ask');
    expect(decision('mcp__Supabase_Escritura__execute_sql', { query: q }, { desatendida: true })).toBe('deny');
  });

  it('el comando del hook corre con python3 -I: un json.py o hashlib.py suelto en .claude/hooks/ no se importa', () => {
    // Con el directorio del script en sys.path, un archivo plantado con Bash (Write está denegado,
    // Bash no) sustituye un módulo de la biblioteca estándar, el hook sale en silencio y la
    // herramienta corre sin filtro.
    const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'));
    const comando: string = settings.hooks.PreToolUse[0].hooks[0].command;
    expect(comando).toMatch(/python3 -I\b/);
  });
});

// ---------------------------------------------------------------------------
// Tercera ronda: respuesta a la ronda 2 de QA (tipos, identity, secretos, sombra de
// módulos, conectores) y los falsos rechazos que arrastraba.
// ---------------------------------------------------------------------------
describe('endurecimiento tras la ronda 2 de QA', () => {
  const rls = (t = 'public.x') => ` ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`;

  describe('tipos de columna: sólo nativos', () => {
    it.each([
      'smallint', 'int', 'integer', 'bigint', 'numeric', 'numeric(12,2)', 'decimal(5)', 'real', 'double precision', 'text',
      'varchar(80)', 'character varying(20)', 'char(1)', 'boolean', 'date', 'time', 'timestamp', 'timestamptz',
      'timestamp(3) with time zone', 'time without time zone', 'uuid', 'jsonb', 'json', 'bytea', 'inet', 'interval',
      'text[]', 'int[3]', 'numeric(12,2)[]', 'text ARRAY', 'UUID',
    ])('acepta %s', (tipo) => {
      expect(ddl1(`CREATE TABLE public.x (a ${tipo});${rls()}`)[0]).toBe(true);
      expect(ddl1(`ALTER TABLE public.t ADD COLUMN c ${tipo};`)[0]).toBe(true);
    });

    it.each(['auth.users', 'public.lotes', 'lotes', 'estado_enum', '"text"', 'pg_catalog.text', 'public.text', 'unknown', 'numeric(a)', 'text[a]', 'int4range', 'vector(1536)'])(
      'rechaza %s',
      (tipo) => {
        expect(ddl1(`CREATE TABLE public.x (a ${tipo});${rls()}`)[0]).toBe(false);
        expect(ddl1(`ALTER TABLE public.t ADD COLUMN c ${tipo};`)[0]).toBe(false);
      },
    );

    it('también en los casts de un DEFAULT, un CHECK y un CAST', () => {
      expect(ddl1("ALTER TABLE public.t ADD COLUMN c text DEFAULT 'a'::auth.users")[0]).toBe(false);
      expect(ddl1("ALTER TABLE public.t ADD COLUMN c text DEFAULT 'a'::lotes")[0]).toBe(false);
      expect(ddl1("ALTER TABLE public.t ADD COLUMN c lotes_t DEFAULT lotes_t '1'")[0]).toBe(false);
      expect(ddl1(`CREATE TABLE public.x (a text CHECK (a::auth.users IS NOT NULL));${rls()}`)[0]).toBe(false);
      expect(ddl1(`CREATE TABLE public.x (a text CHECK (cast(a as lotes) IS NOT NULL));${rls()}`)[0]).toBe(false);
      expect(ddl1(`CREATE TABLE public.x (a text CHECK (a::text <> ''));${rls()}`)[0]).toBe(true);
    });
  });

  it('opciones de IDENTITY, de cualquier forma, se rechazan; la identity sin opciones pasa', () => {
    expect(ddl1(`CREATE TABLE public.x (id int GENERATED BY DEFAULT AS IDENTITY (START WITH 100));${rls()}`)[0]).toBe(false);
    expect(ddl1(`CREATE TABLE public.x (id int GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public.s));${rls()}`)[0]).toBe(false);
    expect(ddl1(`CREATE TABLE public.x (id int GENERATED ALWAYS AS IDENTITY);${rls()}`)[0]).toBe(true);
  });

  describe('el hook no se deja sustituir módulos', () => {
    const preparar = () => {
      const dir = mkdtempSync(join(tmpdir(), 'escocia-sombra-'));
      directorios.push(dir);
      const hooks = join(dir, 'hooks');
      mkdirSync(hooks);
      copyFileSync(script, join(hooks, 'supabase-guard.py'));
      for (const modulo of ['json', 'hashlib', 're', 'os', 'datetime', 'tempfile', 'collections']) {
        // Un módulo plantado que, de importarse, haría salir al hook en silencio.
        writeFileSync(join(hooks, `${modulo}.py`), 'import sys\nsys.exit(0)\n');
      }
      return join(hooks, 'supabase-guard.py');
    };
    const evento = JSON.stringify({ tool_name: 'mcp__Supabase__deploy_edge_function', tool_input: {} });
    const env = { ...process.env, CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_SESSION_ATTENDED: '' };

    it('sin -I (segunda capa): sigue decidiendo aunque haya json.py, re.py, os.py… al lado', () => {
      const copia = preparar();
      const salida = execFileSync('python3', [copia], { input: evento, encoding: 'utf8', env }).trim();
      expect(JSON.parse(salida).hookSpecificOutput.permissionDecision).toBe('deny');
    });

    it('con la ruta relativa y como directorio de trabajo, también', () => {
      const copia = preparar();
      const hooks = resolve(copia, '..');
      const salida = execFileSync('python3', ['supabase-guard.py'], { input: evento, encoding: 'utf8', env, cwd: hooks }).trim();
      expect(JSON.parse(salida).hookSpecificOutput.permissionDecision).toBe('deny');
    });

    it('con -I (el comando de settings.json) sigue decidiendo', () => {
      const copia = preparar();
      const salida = execFileSync('python3', ['-I', copia], { input: evento, encoding: 'utf8', env }).trim();
      expect(JSON.parse(salida).hookSpecificOutput.permissionDecision).toBe('deny');
    });

    it('el comando de settings.json usa -I', () => {
      const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe('python3 -I "$CLAUDE_PROJECT_DIR/.claude/hooks/supabase-guard.py"');
    });
  });

  describe('todos los conectores de Supabase', () => {
    it.each(['claude_ai_Supabase', 'Supabase', 'my_supabase_prod', 'SUPABASE_X', 'plugin_supabase_supabase'])(
      '%s: apply_migration pide permiso, list_tables pasa, y desatendido no aplica sin proyecto',
      (servidor) => {
        expect(decision(`mcp__${servidor}__apply_migration`, { name: 'x', query: 'select 1' })).toBe('ask');
        expect(decision(`mcp__${servidor}__apply_migration`, { name: 'x', query: 'select 1' }, { desatendida: true })).toBe('deny');
        expect(decision(`mcp__${servidor}__list_tables`, {})).toBe('allow');
        expect(decision(`mcp__${servidor}__execute_sql`, { query: 'delete from t' })).toBe('ask');
      },
    );

    it('un servidor sin «supabase» en el nombre no recibe decisión', () => {
      expect(decision('mcp__otro_servidor__apply_migration', {})).toBeNull();
    });

    it('el matcher de settings.json los alcanza, con cualquier capitalización', () => {
      const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'));
      const matcher = new RegExp(`^(?:${settings.hooks.PreToolUse[0].matcher})$`);
      for (const n of ['mcp__claude_ai_Supabase__apply_migration', 'mcp__Supabase__x', 'mcp__SUPABASE_X__x', 'mcp__my_supabase__x', 'mcp__Composio__COMPOSIO_SEARCH_TOOLS', 'mcp__github__merge_pull_request']) {
        expect(matcher.test(n), n).toBe(true);
      }
      expect(matcher.test('mcp__github__list_issues')).toBe(false);
    });
  });

  it('permissions.deny cubre las formas relativa y con «/», para hooks, settings.json y settings.local.json', () => {
    const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'));
    const esperado: string[] = [];
    for (const ruta of ['.claude/hooks/**', '.claude/settings.json', '.claude/settings.local.json']) {
      for (const prefijo of ['', '/']) for (const op of ['Edit', 'Write']) esperado.push(`${op}(${prefijo}${ruta})`);
    }
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(esperado));
  });
});

// ---------------------------------------------------------------------------
// Ronda 3 de la revisión adversaria de QA (2026-10-26). Igual que arriba: la
// prueba describe el comportamiento SEGURO y hoy FALLA.
// ---------------------------------------------------------------------------
describe('adversarial ronda 3 (qa 2026-10-26)', () => {
  const rls = ' ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;';

  it.each([
    ["a int DEFAULT regclass 'public.lotes'", 'DEFAULT con literal tipado regclass'],
    ["a int CHECK (regclass 'public.lotes' IS NOT NULL)", 'CHECK con literal tipado regclass'],
    ["a int CHECK (regprocedure 'public.fn_cualquiera(int)' IS NOT NULL)", 'CHECK con literal tipado regprocedure'],
    ["a int CHECK (public.un_dominio '1' IS NOT NULL)", 'literal tipado con un tipo ajeno a la lista nativa'],
  ])('un literal tipado «tipo \'texto\'» con un tipo fuera de la lista nativa ata la tabla nueva a un objeto existente: %s (%s)', (columna) => {
    expect(ddl1(`CREATE TABLE public.x (${columna});${rls}`)[0]).toBe(false);
  });

  it('el mismo literal tipado tampoco entra en el predicado de un índice', () => {
    expect(ddl1("CREATE INDEX i ON public.t (c) WHERE c = regclass 'public.lotes';")[0]).toBe(false);
  });
});

describe('literales tipados: falsos rechazos que no deben ocurrir', () => {
  it.each([
    "DO $$ BEGIN IF 1 = 2 THEN RAISE EXCEPTION 'a % b', 1; END IF; RAISE NOTICE 'ok'; RAISE WARNING 'w'; END $$;",
    "DO $$ DECLARE v timestamptz; BEGIN v := now() AT TIME ZONE 'America/Bogota'; IF v IS NULL THEN RAISE EXCEPTION 'x' USING ERRCODE = 'P0001'; END IF; END $$;",
    "DO $$ DECLARE v int; BEGIN SELECT count(*) INTO v FROM public.t WHERE c LIKE 'a%' AND d IN ('x','y') AND e = CASE WHEN f THEN 'a' ELSE 'b' END AND g > date '2026-01-01' AND h < timestamp with time zone '2026-01-01 00:00:00+00'; END $$;",
  ])('DO que pasa: %s', (sql) => {
    expect(ddl1(sql)[0]).toBe(true);
  });
});
