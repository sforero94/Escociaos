#!/usr/bin/env python3
"""PreToolUse guard for Supabase tools (and the Notion page of the Saturday run).

Decision of Santiago, 2026-09-24 (PR #288), rewritten 2026-09-25 (ESCO-130).

The first version decided with a regex over the tool name plus the whole JSON
input. That failed in both directions: it asked for a read-only SELECT that
contained the word DELETE, and it allowed `UPDATE productos SET
cantidad_actual = 0`. It also only matched the connector name
`Supabase_Routines`, while the scheduled runs see `Supabase_Escritura`.

This version decides by the TOOL NAME first, with an allowlist, and fails
closed:

- Read tools (list_*, get_*, search_docs, query_logs, ...): allow.
- Tools that change the project (apply_migration, deploy_edge_function,
  branch and project operations): ask.
- execute_sql: allow only ONE read statement (SELECT / WITH / EXPLAIN without
  ANALYZE / SHOW / TABLE / VALUES), decided on the SQL tokenizer (never on
  regexes over raw text, which a quote or comment could spoof): no INTO, no
  FOR UPDATE/SHARE, no write keyword, and only functions of an explicit
  read-only list (any other call, public.* included, asks).
- Composio (rewritten 2026-09-27): EVERY item of the call is checked, also
  when toolkits are mixed, against the policy of the maintenance operation:
  Supabase reads; Notion on the Mantenimiento database (account thinksid);
  Vercel VERCEL_GET_* only; GitHub reads, open PR, comment (never merge);
  SUPABASE_BETA_RUN_SQL_QUERY only as a hypothesis probe with the exact form
  `select public.po_sonda(...)` (migration 170: runs and ALWAYS rolls back),
  account escocia-os, project ywhtjwawnkeqlwxbvgup. Everything else asks.
- GitHub MCP merge_pull_request / enable_pr_auto_merge: ask.
- Composio meta tools (matcher `mcp__Composio__.*`): the workbench and the
  remote bash can call ANY slug from code and the hook cannot see inside, so
  they always ask; SEARCH_TOOLS, GET_TOOL_SCHEMAS and MANAGE_CONNECTIONS with
  action=list are reads; any other meta tool asks.
- Any Supabase tool not in these lists: ask.
- Fail closed: ANY exception while reading or deciding (deep JSON, bad UTF-8,
  a bug of ours) and any stdin over 256 KB is an ask, never silence.

"ask" shows the permission prompt in an attended session. In an unattended
session (a Routine) every "ask" becomes "deny": a parked prompt stalled runs
for hours until Santiago opened them.

TWO EXCEPTIONS, decided by Santiago on 2026-10-26 (the "option A" of
2026-09-27, "the Routines never write", is revoked for `ddl_aditivo` ONLY):

1. FRIDAY ADDITIVE APPLY. The unattended Friday Routine may apply ONE
   migration, and only when ALL of these hold (`evaluar_apply_viernes`):
   the session is unattended; today is Friday in America/New_York; the tool
   is `apply_migration` (MCP) or a Composio call whose only item is
   SUPABASE_APPLY_A_MIGRATION with an explicit allowed account; the project
   is production; the name is `NNN_snake_case`; it is the first apply of the
   session (a marker file is written BEFORE answering allow, so a failed
   apply also spends it); and the SQL passes `es_ddl_aditivo`. An attended
   session keeps "ask": Santiago is present and answers the prompt, which is
   how the Saturday reply session applies data migrations. Any other day,
   any other shape: deny, with the failing condition in the reason (the
   runbook records it under NO CORRIÓ). A Composio `rollback` argument is
   denied (its semantics are undocumented; the rollback lives in the PR and
   the ficha); `idempotency_key` is accepted.

   `es_ddl_aditivo` is an ALLOWLIST over a real SQL tokenizer, never a
   denylist over raw text. It is deliberately STRICTER than the rubric
   (`escociaos-po/evals/rubrica-ruteo.md`, "Qué cuenta como aditivo (V5)"):
   the rubric tells the agent what to propose, this is the mechanical floor
   under production, which has no staging. It refuses what the hook cannot
   verify by looking at the SQL alone: CREATE FUNCTION (EXECUTE-able by
   PUBLIC), CREATE TRIGGER (a BEFORE trigger can rewrite every future write),
   ADD CONSTRAINT (even NOT VALID blocks new writes), a UNIQUE index on a
   table that already exists (blocks writes that violate it), and CREATE
   TABLE IF NOT EXISTS (the mandatory ENABLE RLS / REVOKE would then land on
   a table that may already be live). Those go to the Saturday reply, with
   Santiago present. Other structural rules: objects live only in `public` or
   `respaldos` (exact, case-sensitive: `"Public"` is another schema; the one
   cross-schema reference allowed is REFERENCES auth.users); BEGIN only first
   and COMMIT/END only last (a mid-file COMMIT breaks atomicity); every CREATE
   TABLE is followed IMMEDIATELY by its ENABLE ROW LEVEL SECURITY, so nothing
   can abort between them whether or not the API wraps the file in a
   transaction; COMMENT … IS NULL (it erases a comment) is rejected.

RESIDUAL RISK, accepted and documented: this guard is a file in the repo and
`.claude/settings.json` denies Edit/Write on it, but a Bash tool can still
write any file, including this hook and the marker directory under
tempfile.gettempdir() (deleting a marker resets the once-per-session limit).
The hook cannot see Bash; it is the floor under the Supabase and Composio
tools, not a sandbox. The `permissions.deny` rules cover Edit and Write only
(in the relative and the repo-root `/` forms, for settings.json and
settings.local.json); Bash is NOT covered.

KNOWN, OUT OF SCOPE (follow-ups, not forgotten):
- The `SUPABASE_GET_*` / `SUPABASE_LIST_*` / `VERCEL_GET_*` prefix allows trust
  every slug that starts that way; they need an explicit slug inventory.
- `po_sonda` always rolls back, but non-transactional functions (sequences,
  notifications, advisory locks) are not undone by a rollback. Refusing them
  belongs to the refusal list inside migration 170 itself.

2. SATURDAY NOTION PAGE. Composio NOTION_CREATE_NOTION_PAGE is allowed only
   with an explicit allowed account and a parent that is exactly the
   "Reportes del sábado" page. Not day-restricted.
"""
import sys  # builtin: safe to import before the path is cleaned

# Self-protection against module shadowing. `python3 script.py` puts the
# script's directory first in sys.path, so a json.py or hashlib.py planted
# next to it (Write is denied, Bash is not) would replace the standard library
# and the hook would die silently. settings.json also runs it with `-I`; this
# is the second layer, and it runs BEFORE any non-builtin import.
if __name__ == "__main__" and not sys.flags.isolated:
    _dir_script = sys.argv[0].rpartition("/")[0] if sys.argv and sys.argv[0] else ""
    _recorte = 0 if getattr(sys.flags, "safe_path", False) else 1
    sys.path[:] = [p for p in sys.path[_recorte:] if p not in ("", _dir_script)]

import datetime
import hashlib
import json
import os
import re
import tempfile
from collections import namedtuple

# Every MCP connector whose SERVER name contains "supabase", any case
# (Supabase, Supabase_Routines, Supabase_Escritura, claude_ai_Supabase, ...).
PREFIJO_SUPABASE = re.compile(r"^mcp__(?P<servidor>(?:(?!__).)+)__(?P<tool>.+)$", re.DOTALL)


def _tool_de_supabase(herramienta):
    """The tool name when `herramienta` belongs to a Supabase connector, else None."""
    m = PREFIJO_SUPABASE.match(herramienta)
    if m is None or "supabase" not in m.group("servidor").lower():
        return None
    return m.group("tool")

LECTURA = {
    "list_tables", "list_extensions", "list_migrations", "list_edge_functions",
    "list_branches", "list_projects", "list_organizations", "list_storage_buckets",
    "get_advisors", "get_edge_function", "get_project_url", "get_publishable_keys",
    "get_anon_key", "get_project", "get_organization", "get_logs", "get_cost",
    "get_storage_config", "search_docs", "query_logs", "generate_typescript_types",
}

ESCRITURA = {
    "apply_migration", "deploy_edge_function", "create_branch", "delete_branch",
    "merge_branch", "reset_branch", "rebase_branch", "create_project",
    "pause_project", "restore_project", "confirm_cost", "update_storage_config",
}

LECTURA_COMPOSIO = {"SUPABASE_RUN_READ_ONLY_QUERY"}
PREFIJOS_LECTURA_COMPOSIO = ("SUPABASE_LIST_", "SUPABASE_GET_")

def sesion_atendida():
    """True when a person can answer a prompt.

    A cloud session carries CLAUDE_CODE_SESSION_ATTENDED=1 when someone is
    watching. In a Routine nobody is: a prompt is parked until a human opens
    the session, which is how runs stalled for hours. A local CLI
    (CLAUDE_CODE_REMOTE not "true") is always attended.
    """
    if os.environ.get("CLAUDE_CODE_REMOTE", "").lower() != "true":
        return True
    return os.environ.get("CLAUDE_CODE_SESSION_ATTENDED") == "1"


def emitir(decision, motivo, atendida):
    """Prints the hook answer. Pure apart from stdout; the caller exits."""
    # Nobody answers a prompt in an unattended run: deny, so the agent gets an
    # error, records it under NO CORRIÓ and keeps going instead of stalling.
    if decision == "ask" and not atendida:
        decision = "deny"
        motivo = (motivo + " Sesión desatendida: denegado en vez de preguntar. "
                  "Anótalo bajo NO CORRIÓ y sigue.")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": motivo,
        }
    }))


# ---------------------------------------------------------------------------
# Composio (2026-09-27): política de la operación de mantenimiento por slug.
#
# La Routine deja COMPOSIO_MULTI_EXECUTE_TOOL en always_allow, y esa capa sólo
# ve el nombre desnudo. Este hook es la única capa que ve el tool_slug, así que
# decide cada elemento de la llamada, también cuando se mezclan toolkits.
# Todo lo que no está en la lista pide permiso (falla cerrado).
# ---------------------------------------------------------------------------
PROYECTO_PRODUCCION = "ywhtjwawnkeqlwxbvgup"
CUENTAS_SUPABASE = {"supabase_bitis-coward", "escocia-os"}
CUENTAS_NOTION = {"notion_awork-knit", "thinksid"}
CUENTAS_VERCEL = {"vercel_tetric-hash", "escocia"}
DB_MANTENIMIENTO = "c52d9258fed7466d8e700fa92980d3df"
# Página «Reportes del sábado» (decisión 2026-10-26): padre de la página de reporte.
REPORTES_SABADO = "40667755ed68814fb676f9e28be7d2f3"

NOTION_PERMITIDOS = {
    "NOTION_SEARCH_NOTION_PAGE", "NOTION_FETCH_DATABASE",
    "NOTION_QUERY_DATABASE_WITH_FILTER", "NOTION_QUERY_DATABASE",
    "NOTION_FETCH_ROW", "NOTION_FETCH_DATA", "NOTION_GET_PAGE_PROPERTY_ACTION",
    "NOTION_RETRIEVE_DATABASE_PROPERTY", "NOTION_FETCH_BLOCK_CONTENTS",
    "NOTION_INSERT_ROW_DATABASE", "NOTION_UPDATE_ROW_DATABASE",
}
PREFIJOS_GITHUB_LECTURA = ("GITHUB_GET_", "GITHUB_LIST_", "GITHUB_SEARCH_")
GITHUB_PERMITIDOS = {
    "GITHUB_CREATE_A_PULL_REQUEST", "GITHUB_CREATE_AN_ISSUE_COMMENT",
    "GITHUB_CREATE_A_REVIEW_COMMENT_FOR_A_PULL_REQUEST",
    "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST",
}
GITHUB_PIDE = {
    "mcp__github__merge_pull_request", "mcp__github__enable_pr_auto_merge",
}

def cuenta_ok(item, cuentas, requerida):
    cuenta = item.get("account")
    if cuenta is None:
        return not requerida
    return str(cuenta) in cuentas


# ===========================================================================
# Tokenizador de SQL (PostgreSQL) y validador de DDL aditivo.
#
# No hay regex apiladas sobre el texto crudo: el SQL se parte primero en
# tokens (comentarios, cadenas, identificadores entrecomillados y dollar
# quotes quedan como UN token), y la gramática se comprueba sobre los tokens.
# Todo lo que no se reconoce se rechaza.
# ===========================================================================
class SqlInvalido(Exception):
    """El texto no se puede tokenizar de forma segura."""


class NoAditivo(Exception):
    """Una sentencia no está en la lista permitida."""


Tok = namedtuple("Tok", "kind val raw")
# kinds: word (val = mayúsculas ASCII, raw = como se escribió), qident (val
# exacto), string, estring, dollar (val = cuerpo), number, op, punct.

_ESPACIOS = " \t\n\r\f"
_MAYUS = str.maketrans("abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
_MINUS = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
_RE_PALABRA = re.compile("[A-Za-z_\u0080-\U0010ffff][A-Za-z0-9_$\u0080-\U0010ffff]*")
_RE_NUMERO = re.compile(r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
_RE_DOLLAR = re.compile("\\$(?:[A-Za-z_\u0080-\U0010ffff][A-Za-z0-9_\u0080-\U0010ffff]*)?\\$")
_RE_U_AMP = re.compile("[ \t\n\r\f]*&[ \t\n\r\f]*['\"]")
_OPERADORES = set("+-*/<>=~!@#%^&|?")
_MAX_SQL = 200_000


def _mayus(s):
    # ASCII only: Python's str.upper() would map 'ı' to 'I' and 'ſ' to 'S',
    # which PostgreSQL does not.
    return s.translate(_MAYUS)


def _minus(s):
    return s.translate(_MINUS)


def _saltar_comentario_bloque(sql, i):
    """sql[i:i+2] == '/*'. Nested, like PostgreSQL. Returns the index after it."""
    n = len(sql)
    nivel = 1
    j = i + 2
    while j < n:
        if sql.startswith("/*", j):
            nivel += 1
            j += 2
        elif sql.startswith("*/", j):
            nivel -= 1
            j += 2
            if nivel == 0:
                return j
        else:
            j += 1
    raise SqlInvalido("comentario /* */ sin cerrar")


def _saltar_espacios_y_comentarios(sql, i):
    n = len(sql)
    while i < n:
        c = sql[i]
        if c in _ESPACIOS:
            i += 1
        elif sql.startswith("--", i):
            m = re.compile("[\n\r]").search(sql, i)
            i = n if m is None else m.end()
        elif sql.startswith("/*", i):
            i = _saltar_comentario_bloque(sql, i)
        else:
            break
    return i


def _leer_cadena(sql, i, con_escapes):
    """sql[i] == "'". Returns (contenido, índice siguiente).

    Adjacent literals separated by whitespace/comments are merged into one
    token. That is how PostgreSQL continues a string across a newline, and a
    continuation of an E'' string stays in escape mode, so it is read the
    same way here.
    """
    n = len(sql)
    partes = []
    while True:
        i += 1
        buf = []
        while True:
            if i >= n:
                raise SqlInvalido("cadena sin cerrar")
            ch = sql[i]
            if con_escapes and ch == "\\":
                if i + 1 >= n:
                    raise SqlInvalido("cadena sin cerrar")
                buf.append(sql[i:i + 2])
                i += 2
                continue
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append("''")
                    i += 2
                    continue
                i += 1
                break
            buf.append(ch)
            i += 1
        partes.append("".join(buf))
        j = _saltar_espacios_y_comentarios(sql, i)
        if j > i and j < n and sql[j] == "'":
            i = j
            continue
        return "".join(partes), i


def tokenizar(sql):
    if "\x00" in sql:
        raise SqlInvalido("byte NUL en el SQL")
    n = len(sql)
    toks = []
    i = 0
    while i < n:
        c = sql[i]
        if c in _ESPACIOS:
            i += 1
            continue
        if sql.startswith("--", i) or sql.startswith("/*", i):
            i = _saltar_espacios_y_comentarios(sql, i)
            continue
        nxt = sql[i + 1] if i + 1 < n else ""
        if c in "eE" and nxt == "'":
            contenido, i = _leer_cadena(sql, i + 1, True)
            toks.append(Tok("estring", contenido, contenido))
            continue
        if c in "bBxXnN" and nxt == "'":
            contenido, i = _leer_cadena(sql, i + 1, False)
            toks.append(Tok("string", contenido, contenido))
            continue
        if c in "uU" and _RE_U_AMP.match(sql, i + 1):
            raise SqlInvalido("cadena o identificador U& (escapes Unicode)")
        if c == "'":
            contenido, i = _leer_cadena(sql, i, False)
            toks.append(Tok("string", contenido, contenido))
            continue
        if c == '"':
            j = i + 1
            buf = []
            while True:
                if j >= n:
                    raise SqlInvalido("identificador entrecomillado sin cerrar")
                if sql[j] == '"':
                    if j + 1 < n and sql[j + 1] == '"':
                        buf.append('"')
                        j += 2
                        continue
                    j += 1
                    break
                buf.append(sql[j])
                j += 1
            nombre = "".join(buf)
            if nombre == "":
                raise SqlInvalido("identificador entrecomillado vacío")
            toks.append(Tok("qident", nombre, nombre))
            i = j
            continue
        if c == "$":
            m = _RE_DOLLAR.match(sql, i)
            if m is None:
                raise SqlInvalido("«$» fuera de un dollar quote (¿parámetro $n?)")
            etiqueta = m.group(0)
            fin = sql.find(etiqueta, m.end())
            if fin < 0:
                raise SqlInvalido("dollar quote %s sin cerrar" % etiqueta)
            toks.append(Tok("dollar", sql[m.end():fin], etiqueta))
            i = fin + len(etiqueta)
            continue
        if c in "0123456789" or (c == "." and nxt != "" and nxt in "0123456789"):
            m = _RE_NUMERO.match(sql, i)
            toks.append(Tok("number", m.group(0), m.group(0)))
            i = m.end()
            continue
        m = _RE_PALABRA.match(sql, i)
        if m is not None:
            raw = m.group(0)
            if raw in ("u", "U") and _RE_U_AMP.match(sql, m.end()):
                raise SqlInvalido("cadena o identificador U& (escapes Unicode)")
            toks.append(Tok("word", _mayus(raw), raw))
            i = m.end()
            continue
        if sql.startswith("::", i):
            toks.append(Tok("punct", "::", "::"))
            i += 2
            continue
        if sql.startswith(":=", i):
            toks.append(Tok("op", ":=", ":="))
            i += 2
            continue
        if c in "(),;.[]:":
            toks.append(Tok("punct", c, c))
            i += 1
            continue
        if c in _OPERADORES:
            j = i
            while j < n and sql[j] in _OPERADORES:
                if sql.startswith("--", j) or sql.startswith("/*", j):
                    break
                j += 1
            toks.append(Tok("op", sql[i:j], sql[i:j]))
            i = j
            continue
        raise SqlInvalido("carácter no reconocido %r" % c)
    return toks


# ---------------------------------------------------------------------------
# Listas del validador
# ---------------------------------------------------------------------------
ESQUEMAS_PERMITIDOS = ("public", "respaldos")
ESQUEMAS_PROHIBIDOS = {
    "auth", "storage", "cron", "net", "vault", "extensions", "pg_catalog",
    "information_schema", "supabase_migrations", "supabase_functions",
    "realtime", "graphql", "graphql_public", "pgsodium", "pgsodium_masks",
}
# Esquemas que un DO no puede ni leer (se puede leer pg_catalog/information_schema:
# es lo que hacen las guardas de las migraciones).
ESQUEMAS_PROHIBIDOS_LECTURA_DO = ESQUEMAS_PROHIBIDOS - {"pg_catalog", "information_schema"}
# Where secrets live (GUCs, role settings, server options, password hashes, keys).
# A read, a DO's RAISE or a TABLE/VALUES form over any of them leaks a secret.
# Exact match on the folded identifier, a `pg_catalog.` prefix included.
NOMBRES_SECRETOS = {
    "pg_settings", "pg_db_role_setting", "pg_foreign_server", "pg_foreign_data_wrapper",
    "pg_user_mappings", "pg_user_mapping", "pg_authid", "pg_shadow", "pg_file_settings",
    "pg_hba_file_rules", "pg_ident_file_mappings", "rolpassword",
    "pg_roles",  # exposes rolconfig
    "pg_stat_statements", "pg_stat_activity",  # carry query text
}
ESQUEMAS_SECRETOS = {"auth", "vault", "pgsodium", "pgsodium_masks", "net", "supabase_functions", "cron",
                     "supabase_migrations"}


def _toca_secretos(toks, i):
    """True if toks[i] names a secret-bearing catalog/column or a secret-bearing schema (schema.x)."""
    nombre = _nombre(toks[i])
    if nombre in NOMBRES_SECRETOS:
        return True
    return nombre in ESQUEMAS_SECRETOS and i + 1 < len(toks) and _es_punct(toks[i + 1], ".")

PALABRAS_PROHIBIDAS_DO = set(
    "INSERT UPDATE DELETE MERGE TRUNCATE DROP ALTER CREATE GRANT REVOKE COMMENT "
    "EXECUTE PERFORM CALL COPY VACUUM REINDEX CLUSTER LOCK REFRESH COMMIT ROLLBACK "
    "SAVEPOINT SET RESET LISTEN NOTIFY IMPORT LOAD SECURITY "
    # Not in the brief, same reasoning (anything that is not a read):
    "DO ANALYZE ANALYSE DISCARD PREPARE DEALLOCATE REASSIGN CHECKPOINT "
    "PG_AUTHID PG_SHADOW PG_USER_MAPPINGS PG_LARGEOBJECT".split()
)
FUNCIONES_PROHIBIDAS_DO = re.compile(
    r"^(?:set_config|nextval|setval|pg_advisory\w*|pg_terminate_backend|"
    r"pg_cancel_backend|pg_sleep\w*|lo_\w*|pg_read_\w*|pg_write\w*|pg_file_\w*|"
    r"dblink\w*|pg_notify)$"
)
# Palabras que pueden ir pegadas a «(» sin ser una llamada a función.
PALABRAS_ANTES_DE_PARENTESIS = set(
    "IN NOT AND OR ANY ALL SOME KEY UNIQUE CHECK DEFAULT INCLUDE WHEN THEN ELSE "
    "CASE IS LIKE ILIKE BETWEEN ARRAY ROW CAST EXTRACT WITH USING WHERE ON FROM "
    "JOIN SELECT AS EXISTS IF ELSIF ELSEIF VALUES LIMIT OFFSET BY HAVING UNION "
    "INTERSECT EXCEPT LOOP WHILE INTO OVER FILTER DISTINCT FOR ASSERT RETURN "
    "NULL TRUE FALSE LATERAL GROUP WITHIN".split()
)
TIPOS_CON_PARENTESIS = set(
    "VARCHAR CHAR CHARACTER VARYING NUMERIC DECIMAL TIMESTAMP TIMESTAMPTZ TIME "
    "TIMETZ INTERVAL BIT VARBIT FLOAT".split()
)
FUNCIONES_TABLA = {
    "gen_random_uuid", "uuid_generate_v4", "now", "timezone", "lower", "upper", "btrim", "length",
    "char_length", "coalesce", "nullif", "greatest", "least", "abs", "round",
    "array_length", "cardinality", "jsonb_typeof", "jsonb_array_length",
}
FUNCIONES_INDICE = {
    "lower", "upper", "btrim", "length", "char_length", "coalesce", "nullif",
    "abs", "to_tsvector",
}
FUNCIONES_CALIFICADAS_TABLA = {("auth", "uid"), ("extensions", "uuid_generate_v4")}
# Funciones de sólo lectura que un bloque DO puede llamar. Cualquier otra
# (incluidas las del esquema public, que pueden escribir) se rechaza.
FUNCIONES_DO = {
    "count", "sum", "min", "max", "avg", "bool_and", "bool_or", "every",
    "array_agg", "string_agg", "coalesce", "nullif", "greatest", "least",
    "lower", "upper", "btrim", "ltrim", "rtrim", "trim", "length", "char_length",
    "octet_length", "substr", "substring", "position", "replace", "format",
    "concat", "concat_ws", "left", "right", "abs", "round", "ceil", "ceiling",
    "floor", "trunc", "now", "to_char", "date_trunc", "array_length",
    "cardinality", "unnest", "array_position", "jsonb_typeof",
    "jsonb_array_length", "quote_ident", "quote_literal", "pg_typeof", "md5", "to_jsonb",
    "to_regclass", "to_regproc", "to_regprocedure", "to_regtype",
    "to_regnamespace", "to_regrole", "to_regoper", "to_regoperator",
    "to_regcollation", "col_description", "obj_description",
    "has_table_privilege", "has_column_privilege", "has_schema_privilege",
    "has_function_privilege", "has_sequence_privilege", "has_any_column_privilege",
    "pg_get_constraintdef", "pg_get_indexdef", "pg_get_expr", "pg_get_viewdef",
    "pg_get_functiondef", "pg_table_is_visible", "pg_relation_size",
    "pg_total_relation_size", "pg_table_size", "pg_indexes_size",
    "generate_series",
}
TIPOS_SERIAL = {"SERIAL", "BIGSERIAL", "SMALLSERIAL", "SERIAL2", "SERIAL4", "SERIAL8"}
METODOS_INDICE = {"btree", "hash", "gin", "gist", "brin", "spgist"}
ROLES_REVOCABLES = {"anon", "authenticated", "public"}
CLASES_COMENTARIO = (("TABLE",), ("COLUMN",), ("INDEX",), ("VIEW",), ("MATERIALIZED", "VIEW"))
# Palabras que cierran un tipo después de «::» dentro de un DEFAULT.
SUFIJOS_TIPO = {"VARYING", "PRECISION", "WITH", "WITHOUT", "TIME", "ZONE"}
# Lo único que puede seguir a un DEFAULT literal en un ADD COLUMN.
SIGUEN_A_UN_DEFAULT = ("NOT", "NULL", "REFERENCES", "COLLATE")


# ---------------------------------------------------------------------------
# Auxiliares de gramática
# ---------------------------------------------------------------------------
def _es_palabra(t, *vals):
    return t.kind == "word" and t.val in vals


def _es_punct(t, c):
    return t.kind == "punct" and t.val == c


def _es_nombre(t):
    return t.kind in ("word", "qident")


def _nombre(t):
    return _minus(t.raw) if t.kind == "word" else t.val


def _describir(sentencia):
    partes = [t.val for t in sentencia[:3] if t.kind == "word"]
    return " ".join(partes) if partes else "(sin palabra clave)"


def _verificar_balance(sentencia):
    pila = []
    pares = {")": "(", "]": "["}
    for t in sentencia:
        if t.kind != "punct":
            continue
        if t.val in "([":
            pila.append(t.val)
        elif t.val in ")]":
            if not pila or pila.pop() != pares[t.val]:
                raise NoAditivo("paréntesis o corchetes sin balancear")
    if pila:
        raise NoAditivo("paréntesis o corchetes sin balancear")


def _cierre(toks, i):
    """toks[i] is '(' . Returns the index of its matching ')'."""
    nivel = 0
    for j in range(i, len(toks)):
        t = toks[j]
        if t.kind == "punct":
            if t.val in "([":
                nivel += 1
            elif t.val in ")]":
                nivel -= 1
                if nivel == 0:
                    return j
    raise NoAditivo("paréntesis sin cerrar")


def _dividir_comas(toks):
    """Splits on top-level commas (outside any () or [])."""
    grupos = [[]]
    nivel = 0
    for t in toks:
        if t.kind == "punct":
            if t.val in "([":
                nivel += 1
            elif t.val in ")]":
                nivel -= 1
            elif t.val == "," and nivel == 0:
                grupos.append([])
                continue
        grupos[-1].append(t)
    return grupos


def _leer_nombre(toks, i, max_partes=2):
    """Reads a dotted name. Returns (partes, índice siguiente)."""
    partes = []
    while True:
        if i >= len(toks) or not _es_nombre(toks[i]):
            raise NoAditivo("se esperaba un nombre")
        partes.append(_nombre(toks[i]))
        i += 1
        if i < len(toks) and _es_punct(toks[i], "."):
            i += 1
            continue
        break
    if len(partes) > max_partes:
        raise NoAditivo("nombre con demasiadas partes")
    return partes, i


def _revisar_esquema(esquema):
    """Allowlist: what a migration creates or alters lives in public or respaldos.

    The comparison is EXACT: `"Public"` (quoted, capital P) is another schema
    in PostgreSQL, not public. Unquoted names were already folded to lowercase.
    """
    if esquema not in ESQUEMAS_PERMITIDOS:
        raise NoAditivo("esquema «%s» fuera de public/respaldos" % esquema)


def _tabla(partes):
    """('public', 'x') for ['x'] or ['public', 'x']. Checks the schema."""
    esquema = partes[0] if len(partes) == 2 else "public"
    _revisar_esquema(esquema)
    return (esquema, partes[-1])


def _leer_tabla(toks, i):
    partes, i = _leer_nombre(toks, i, 2)
    return _tabla(partes), i


def _llamada_permitida(toks, i, funciones, calificadas=frozenset()):
    """toks[i] is a name followed by '('. Is it something other than a call?"""
    t = toks[i]
    califica = None
    if i >= 2 and _es_punct(toks[i - 1], ".") and _es_nombre(toks[i - 2]):
        if i >= 4 and _es_punct(toks[i - 3], "."):
            return False
        califica = _nombre(toks[i - 2])
    nombre = _nombre(t)
    if califica is None and t.kind == "word":
        if t.val in PALABRAS_ANTES_DE_PARENTESIS or t.val in TIPOS_CON_PARENTESIS:
            return True
    if califica is None and i >= 1 and _es_palabra(toks[i - 1], "AS"):
        return True  # alias con lista de columnas: «… AS e(id, nombre)»
    if califica is None or califica == "pg_catalog":
        if nombre in funciones:
            return True
    return (califica, nombre) in calificadas


TIPOS_SIMPLES = set(
    "SMALLINT INT INTEGER BIGINT INT2 INT4 INT8 SERIAL BIGSERIAL SMALLSERIAL SERIAL2 SERIAL4 "
    "SERIAL8 REAL FLOAT FLOAT4 FLOAT8 NUMERIC DECIMAL BOOLEAN BOOL TEXT VARCHAR BPCHAR DATE "
    "TIMETZ TIMESTAMPTZ UUID JSONB JSON BYTEA INET CIDR MACADDR MONEY INTERVAL".split()
)


def _modificador_numerico(toks, i):
    """If toks[i] is '(' read «( n [, n] )» and return the index after it."""
    if i < len(toks) and _es_punct(toks[i], "("):
        cierre = _cierre(toks, i)
        interior = toks[i + 1:cierre]
        if not interior or any(not (x.kind == "number" or _es_punct(x, ",")) for x in interior):
            raise NoAditivo("modificador de tipo no numérico")
        return cierre + 1
    return i


def _tipo_permitido(toks, i):
    """Allowlist of BUILT-IN types. Returns the index after the type.

    A schema-qualified type, a quoted one, or any unknown bare name (which
    would resolve to the row type of a table: `a lotes`, `a auth.users`)
    ties that table to this one and blocks future ALTERs.
    """
    if i >= len(toks) or toks[i].kind != "word":
        raise NoAditivo("tipo de columna ausente, entrecomillado o calificado")
    v = toks[i].val
    j = i + 1
    if v in TIPOS_SIMPLES:
        j = _modificador_numerico(toks, j)
    elif v == "DOUBLE" and j < len(toks) and _es_palabra(toks[j], "PRECISION"):
        j += 1
    elif v in ("CHARACTER", "CHAR", "BIT"):
        if j < len(toks) and _es_palabra(toks[j], "VARYING"):
            j += 1
        j = _modificador_numerico(toks, j)
    elif v in ("TIMESTAMP", "TIME"):
        j = _modificador_numerico(toks, j)
        if (j + 2 < len(toks) and _es_palabra(toks[j], "WITH", "WITHOUT")
                and _es_palabra(toks[j + 1], "TIME") and _es_palabra(toks[j + 2], "ZONE")):
            j += 3
    else:
        raise NoAditivo("tipo «%s» fuera de la lista de tipos nativos permitidos" % toks[i].raw)
    while j < len(toks):  # array forms: [] , [3] , ARRAY , ARRAY[3]
        if _es_punct(toks[j], "["):
            cierre = _cierre(toks, j)
            if any(x.kind != "number" for x in toks[j + 1:cierre]):
                raise NoAditivo("dimensión de arreglo no numérica")
            j = cierre + 1
        elif _es_palabra(toks[j], "ARRAY") and not (j + 1 < len(toks) and _es_punct(toks[j + 1], "(")):
            j += 1
        else:
            break
    return j


# A keyword that may legitimately sit right before a string literal. Any OTHER
# name right before a literal is a typed literal («regclass 'public.lotes'»,
# «public.un_dominio '1'») and must be a native type: it would otherwise pin an
# existing object through a dependency. Unknown keyword => rejected (fail closed).
PALABRAS_ANTES_DE_LITERAL = set(
    "DEFAULT IS NOT AND OR WHEN THEN ELSE SELECT IN ANY ALL SOME TO ESCAPE BETWEEN "
    "EXCEPTION NOTICE WARNING INFO LOG DEBUG RAISE SQLSTATE USING AS ON WHERE FROM WHILE "
    "IF ELSIF ELSEIF CASE RETURN INTO LIMIT OFFSET HAVING BY VALUES DISTINCT SIMILAR LIKE "
    "ILIKE ZONE NULL TRUE FALSE EXISTS UNION INTERSECT EXCEPT MESSAGE DETAIL HINT COLUMN "
    "CONSTRAINT TABLE SCHEMA DATATYPE STRICT ASSERT OVER FILTER".split()
)


def _revisar_literales_tipados(toks):
    """Every «name 'literal'» must be a native type (see _tipo_permitido)."""
    for i, t in enumerate(toks):
        if i == 0 or t.kind not in ("string", "estring", "dollar"):
            continue
        previo = toks[i - 1]
        if previo.kind in ("op", "number", "string", "estring", "dollar"):
            continue
        if previo.kind == "punct" and previo.val not in (")", "]"):
            continue
        for k in range(max(0, i - 8), i):
            try:
                if _tipo_permitido(toks, k) == i:
                    break
            except NoAditivo:
                pass
        else:
            if previo.kind == "word" and previo.val in PALABRAS_ANTES_DE_LITERAL:
                continue
            raise NoAditivo("literal tipado «tipo '…'» con un tipo fuera de la lista nativa (reg*, dominios, tipos propios)")


def _leer_literal_default(toks, i):
    """DEFAULT must be a constant literal, optionally cast. Returns the index after it."""
    if i >= len(toks):
        raise NoAditivo("DEFAULT sin valor")
    t = toks[i]
    if t.kind == "op" and t.val in ("+", "-"):
        i += 1
        if i >= len(toks) or toks[i].kind != "number":
            raise NoAditivo("DEFAULT no es un literal constante")
        t = toks[i]
    if t.kind in ("number", "string", "estring") or _es_palabra(t, "TRUE", "FALSE", "NULL"):
        i += 1
    elif t.kind == "word":
        # Typed literal: date '2026-01-01', timestamp with time zone '…', interval '1 day'.
        try:
            j = _tipo_permitido(toks, i)
        except NoAditivo:
            j = -1
        if 0 < j < len(toks) and toks[j].kind in ("string", "estring"):
            i = j + 1
        else:
            raise NoAditivo("DEFAULT no es un literal constante (función, palabra clave o identificador)")
    else:
        raise NoAditivo("DEFAULT no es un literal constante (función, palabra clave o identificador)")
    while i < len(toks) and _es_punct(toks[i], "::"):
        i = _tipo_permitido(toks, i + 1)
    return i


def _escanear(toks, ctx):
    """Scans column/constraint/index tokens. ctx: 'tabla' | 'add_columna' | 'indice'.

    Rejects functions that are not in the context's list, subqueries,
    GENERATED, FK actions other than RESTRICT/NO ACTION, references to
    forbidden schemas and, for ADD COLUMN, anything but a literal default.
    """
    _revisar_literales_tipados(toks)
    funciones = FUNCIONES_INDICE if ctx == "indice" else FUNCIONES_TABLA
    calificadas = FUNCIONES_CALIFICADAS_TABLA if ctx == "tabla" else frozenset()
    if ctx == "add_columna":
        funciones = frozenset()
        calificadas = frozenset()
    con_default = False
    no_nulo = False
    n = len(toks)
    i = 0
    while i < n:
        t = toks[i]
        if t.kind == "word":
            v = t.val
            if v == "GENERATED" and ctx == "tabla":
                # Only an identity column of a NEW table; a stored expression is rejected.
                largo = 0
                if (i + 3 < n and _es_palabra(toks[i + 1], "ALWAYS")
                        and _es_palabra(toks[i + 2], "AS") and _es_palabra(toks[i + 3], "IDENTITY")):
                    largo = 4
                elif (i + 4 < n and _es_palabra(toks[i + 1], "BY") and _es_palabra(toks[i + 2], "DEFAULT")
                        and _es_palabra(toks[i + 3], "AS") and _es_palabra(toks[i + 4], "IDENTITY")):
                    largo = 5
                if largo:
                    if i + largo < n and _es_punct(toks[i + largo], "("):
                        raise NoAditivo("opciones de IDENTITY (SEQUENCE NAME…) no están permitidas: pueden crear la secuencia en otro esquema")
                    i += largo
                    continue
                raise NoAditivo("GENERATED distinto de «ALWAYS|BY DEFAULT AS IDENTITY» no está permitido")
            if v in ("SELECT", "GENERATED"):
                raise NoAditivo("«%s» no está permitido" % v)
            if ctx == "add_columna":
                if v in ("PRIMARY", "UNIQUE", "CHECK", "CONSTRAINT", "EXCLUDE", "AS"):
                    raise NoAditivo("ADD COLUMN con «%s» no está permitido" % v)
                if v in TIPOS_SERIAL:
                    raise NoAditivo("ADD COLUMN de tipo serial fabrica un valor por cada fila existente")
                if v == "NOT" and i + 1 < n and _es_palabra(toks[i + 1], "NULL"):
                    no_nulo = True
                if v == "DEFAULT":
                    con_default = True
                    i = _leer_literal_default(toks, i + 1)
                    if i < n and not _es_palabra(toks[i], *SIGUEN_A_UN_DEFAULT):
                        raise NoAditivo("DEFAULT seguido de una expresión (operador, concatenación…), no de un literal solo")
                    continue
            if v == "AS":  # CAST(x AS type)
                i = _tipo_permitido(toks, i + 1)
                continue
            if v == "REFERENCES":
                partes, j = _leer_nombre(toks, i + 1, 2)
                if partes != ["auth", "users"]:  # the one cross-schema reference allowed
                    _tabla(partes)
                i = j
                continue
            if v == "ON" and i + 1 < n and _es_palabra(toks[i + 1], "DELETE", "UPDATE"):
                accion = toks[i + 2:i + 4]
                ok = (len(accion) >= 1 and _es_palabra(accion[0], "RESTRICT")) or (
                    len(accion) >= 2 and _es_palabra(accion[0], "NO")
                    and _es_palabra(accion[1], "ACTION"))
                if not ok:
                    raise NoAditivo("ON DELETE/UPDATE distinto de RESTRICT o NO ACTION altera otras tablas")
        if _es_punct(t, "::"):
            i = _tipo_permitido(toks, i + 1)
            continue
        if _es_nombre(t) and i + 1 < n and _es_punct(toks[i + 1], "("):
            if not _llamada_permitida(toks, i, funciones, calificadas):
                raise NoAditivo("llamada a «%s(…)» fuera de la lista permitida" % _nombre(t))
        i += 1
    if no_nulo and not con_default:
        raise NoAditivo("ADD COLUMN … NOT NULL sin DEFAULT")


# ---------------------------------------------------------------------------
# Sentencias
# ---------------------------------------------------------------------------
class _Estado(object):
    def __init__(self):
        self.creadas = []      # tablas creadas en el archivo, en orden
        self.con_rls = set()
        self.pendiente_rls = None   # tabla recién creada que exige su ENABLE RLS en la sentencia siguiente
        self.rls_cumplido = None    # tabla cuyo ENABLE RLS acaba de aparecer
        self.indice = 0             # número (desde 1) de la sentencia en curso
        self.total = 0              # sentencias del archivo


def _crear_tabla(s, est):
    i = 2
    if i < len(s) and _es_palabra(s[i], "IF"):
        raise NoAditivo("CREATE TABLE IF NOT EXISTS: el ENABLE RLS y el REVOKE obligatorios caerían sobre una tabla que quizá ya está viva")
    tabla, i = _leer_tabla(s, i)
    if i >= len(s) or not _es_punct(s[i], "("):
        raise NoAditivo("CREATE TABLE sin lista de columnas (AS, OF, PARTITION OF no están permitidos)")
    cierre = _cierre(s, i)
    if cierre != len(s) - 1:
        raise NoAditivo("CREATE TABLE con cláusulas después de la lista (PARTITION, INHERITS, WITH, TABLESPACE no están permitidos)")
    elementos = _dividir_comas(s[i + 1:cierre])
    for el in elementos:
        if not el:
            raise NoAditivo("CREATE TABLE con un elemento vacío")
        primero = el[0]
        if _es_palabra(primero, "LIKE"):
            raise NoAditivo("CREATE TABLE … LIKE no está permitido")
        if _es_palabra(primero, "CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "EXCLUDE"):
            k = 0
            if _es_palabra(primero, "CONSTRAINT"):
                k = 2
            if k >= len(el) or not _es_palabra(el[k], "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"):
                raise NoAditivo("restricción de tabla no reconocida")
            _escanear(el[k:], "tabla")
            continue
        if not _es_nombre(primero) or len(el) < 2:
            raise NoAditivo("definición de columna no reconocida")
        j = _tipo_permitido(el, 1)
        _escanear(el[j:], "tabla")
    est.creadas.append(tabla)
    est.pendiente_rls = tabla


def _crear_indice(s, est):
    i = 1
    unico = False
    if _es_palabra(s[i], "UNIQUE"):
        unico = True
        i += 1
    if i >= len(s) or not _es_palabra(s[i], "INDEX"):
        raise NoAditivo("CREATE no aditivo")
    i += 1
    if i < len(s) and _es_palabra(s[i], "CONCURRENTLY"):
        i += 1
    if i + 2 < len(s) and _es_palabra(s[i], "IF") and _es_palabra(s[i + 1], "NOT") and _es_palabra(s[i + 2], "EXISTS"):
        i += 3
    if i < len(s) and not _es_palabra(s[i], "ON"):
        if not _es_nombre(s[i]):
            raise NoAditivo("nombre de índice no reconocido")
        i += 1
        if i < len(s) and _es_punct(s[i], "."):
            raise NoAditivo("el nombre del índice no puede llevar esquema")
    if i >= len(s) or not _es_palabra(s[i], "ON"):
        raise NoAditivo("CREATE INDEX sin ON")
    i += 1
    if i < len(s) and _es_palabra(s[i], "ONLY"):
        i += 1
    tabla, i = _leer_tabla(s, i)
    if unico and tabla not in est.creadas:
        raise NoAditivo("CREATE UNIQUE INDEX sobre una tabla que ya existe: bloquearía escrituras que hoy se aceptan")
    if i + 1 < len(s) and _es_palabra(s[i], "USING"):
        if not _es_nombre(s[i + 1]) or _nombre(s[i + 1]) not in METODOS_INDICE:
            raise NoAditivo("método de índice fuera de btree/hash/gin/gist/brin/spgist")
        i += 2
    if i >= len(s) or not _es_punct(s[i], "("):
        raise NoAditivo("CREATE INDEX sin lista de columnas")
    cierre = _cierre(s, i)
    _escanear(s[i + 1:cierre], "indice")
    i = cierre + 1
    if i < len(s) and _es_palabra(s[i], "INCLUDE"):
        if i + 1 >= len(s) or not _es_punct(s[i + 1], "("):
            raise NoAditivo("INCLUDE sin lista")
        cierre = _cierre(s, i + 1)
        _escanear(s[i + 2:cierre], "indice")
        i = cierre + 1
    if i < len(s):
        if not _es_palabra(s[i], "WHERE"):
            raise NoAditivo("CREATE INDEX con cláusula «%s» no permitida (WITH, TABLESPACE, NULLS)" % s[i].val)
        _escanear(s[i + 1:], "indice")


def _clausula_add_columna(c):
    if not c or not _es_palabra(c[0], "ADD"):
        raise NoAditivo("ALTER TABLE con una acción que no es ADD COLUMN")
    i = 1
    if i < len(c) and _es_palabra(c[i], "COLUMN"):
        i += 1
    if i < len(c) and _es_palabra(c[i], "CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "EXCLUDE"):
        raise NoAditivo("ADD CONSTRAINT no está permitido (ni siquiera NOT VALID: bloquea escrituras nuevas)")
    if i + 2 < len(c) and _es_palabra(c[i], "IF") and _es_palabra(c[i + 1], "NOT") and _es_palabra(c[i + 2], "EXISTS"):
        i += 3
    if i >= len(c) or not _es_nombre(c[i]):
        raise NoAditivo("ADD COLUMN sin nombre de columna")
    i += 1
    if i >= len(c):
        raise NoAditivo("ADD COLUMN sin tipo")
    if c[i].kind == "word" and c[i].val in TIPOS_SERIAL:
        raise NoAditivo("ADD COLUMN de tipo serial fabrica un valor por cada fila existente")
    j = _tipo_permitido(c, i)
    _escanear(c[j:], "add_columna")


def _alter_tabla(s, est):
    i = 2
    for _ in range(2):
        if i < len(s) and _es_palabra(s[i], "ONLY"):
            i += 1
        elif i + 1 < len(s) and _es_palabra(s[i], "IF") and _es_palabra(s[i + 1], "EXISTS"):
            i += 2
    tabla, i = _leer_tabla(s, i)
    resto = s[i:]
    if not resto:
        raise NoAditivo("ALTER TABLE sin acción")
    if _es_palabra(resto[0], "ENABLE"):
        if len(resto) == 4 and _es_palabra(resto[1], "ROW") and _es_palabra(resto[2], "LEVEL") and _es_palabra(resto[3], "SECURITY"):
            if tabla not in est.creadas:
                raise NoAditivo("ENABLE ROW LEVEL SECURITY sobre una tabla que no se crea en este archivo")
            est.con_rls.add(tabla)
            est.rls_cumplido = tabla
            return
        raise NoAditivo("ALTER TABLE … ENABLE distinto de ROW LEVEL SECURITY")
    if _es_palabra(resto[0], "ADD"):
        for clausula in _dividir_comas(resto):
            _clausula_add_columna(clausula)
        return
    raise NoAditivo("ALTER TABLE … %s no es aditivo" % resto[0].val)


def _revoke(s, est):
    i = 1
    if i >= len(s) or not _es_palabra(s[i], "ALL"):
        raise NoAditivo("REVOKE distinto de REVOKE ALL")
    i += 1
    if i < len(s) and _es_palabra(s[i], "PRIVILEGES"):
        i += 1
    if i >= len(s) or not _es_palabra(s[i], "ON"):
        raise NoAditivo("REVOKE ALL sin ON")
    i += 1
    if i < len(s) and _es_palabra(s[i], "TABLE"):
        i += 1
    tabla, i = _leer_tabla(s, i)
    if tabla not in est.creadas:
        raise NoAditivo("REVOKE sobre una tabla que no se crea en este archivo (quitaría acceso a la aplicación)")
    if i >= len(s) or not _es_palabra(s[i], "FROM"):
        raise NoAditivo("REVOKE sin FROM")
    roles = _dividir_comas(s[i + 1:])
    for r in roles:
        if len(r) != 1 or not _es_nombre(r[0]) or _nombre(r[0]) not in ROLES_REVOCABLES:
            raise NoAditivo("REVOKE a un rol distinto de anon, authenticated o public")


def _comment(s, est):
    if len(s) < 2 or not _es_palabra(s[1], "ON"):
        raise NoAditivo("COMMENT sin ON")
    i = 2
    clase = None
    for candidata in CLASES_COMENTARIO:
        if all(i + k < len(s) and _es_palabra(s[i + k], p) for k, p in enumerate(candidata)):
            clase = candidata
            break
    if clase is None:
        raise NoAditivo("COMMENT ON de una clase de objeto no permitida (sólo TABLE, COLUMN, INDEX, VIEW)")
    i += len(clase)
    columna = clase == ("COLUMN",)
    partes, i = _leer_nombre(s, i, 3 if columna else 2)
    minimo = 2 if columna else 1
    if len(partes) < minimo:
        raise NoAditivo("COMMENT ON COLUMN necesita tabla.columna")
    esquema = partes[0] if len(partes) == minimo + 1 else "public"
    _revisar_esquema(esquema)
    if i >= len(s) or not _es_palabra(s[i], "IS"):
        raise NoAditivo("COMMENT sin IS")
    valor = s[i + 1:]
    if len(valor) == 1 and _es_palabra(valor[0], "NULL"):
        raise NoAditivo("COMMENT … IS NULL borra un comentario que ya existe")
    if len(valor) != 1 or valor[0].kind not in ("string", "estring", "dollar"):
        raise NoAditivo("COMMENT IS no es un literal de texto")


def _validar_cuerpo_do(cuerpo):
    try:
        toks = tokenizar(cuerpo)
    except SqlInvalido as e:
        raise NoAditivo("cuerpo del DO no tokenizable: %s" % e)
    n = len(toks)
    for i, t in enumerate(toks):
        if t.kind == "dollar":
            raise NoAditivo("dollar quote anidado dentro del DO")
        if not _es_nombre(t):
            continue
        mayus = _mayus(t.val) if t.kind == "qident" else t.val
        if mayus in PALABRAS_PROHIBIDAS_DO:
            raise NoAditivo("el DO contiene «%s», que no es lectura" % mayus)
        if _toca_secretos(toks, i):
            raise NoAditivo("el DO lee «%s», que guarda secretos" % _nombre(t))
        nombre = _nombre(t)
        sigue_punto = i + 1 < n and _es_punct(toks[i + 1], ".")
        if sigue_punto and (nombre in ESQUEMAS_PROHIBIDOS_LECTURA_DO or nombre.startswith("pg_") and nombre != "pg_catalog"):
            raise NoAditivo("el DO toca el esquema «%s»" % nombre)
        if i + 1 < n and _es_punct(toks[i + 1], "("):
            if FUNCIONES_PROHIBIDAS_DO.match(nombre):
                raise NoAditivo("el DO llama a «%s», función que escribe o bloquea" % nombre)
            if not _llamada_permitida(toks, i, FUNCIONES_DO):
                raise NoAditivo("el DO llama a «%s(…)», fuera de la lista de funciones de lectura" % nombre)
    _revisar_literales_tipados(toks)


def _do(s, est):
    i = 1

    def lenguaje(i):
        if i < len(s) and _es_palabra(s[i], "LANGUAGE"):
            if i + 1 >= len(s):
                raise NoAditivo("LANGUAGE sin nombre")
            t = s[i + 1]
            if t.kind not in ("word", "qident", "string") or _minus(t.val if t.kind != "word" else t.raw) != "plpgsql":
                raise NoAditivo("DO con un lenguaje distinto de plpgsql")
            return i + 2
        return i

    i = lenguaje(i)
    if i >= len(s) or s[i].kind != "dollar":
        raise NoAditivo("el cuerpo del DO debe ir entre dollar quotes")
    cuerpo = s[i].val
    i = lenguaje(i + 1)
    if i != len(s):
        raise NoAditivo("DO con elementos después del cuerpo")
    _validar_cuerpo_do(cuerpo)


def _literal_timeout(t):
    if t.kind == "number":
        return float(t.val) > 0
    if t.kind == "string":
        m = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*(us|ms|s|min|h|d)?\s*", t.val)
        return m is not None and float(m.group(1)) > 0
    return False


def _control(s, est):
    v = [t.val for t in s]
    kinds_ok = all(t.kind == "word" for t in s)
    if kinds_ok and v in (["BEGIN"], ["BEGIN", "TRANSACTION"], ["BEGIN", "WORK"], ["START", "TRANSACTION"]):
        if est.indice != 1:
            raise NoAditivo("BEGIN/START TRANSACTION sólo puede ser la primera sentencia")
        return
    if kinds_ok and v in (["COMMIT"], ["COMMIT", "TRANSACTION"], ["COMMIT", "WORK"],
                          ["END"], ["END", "TRANSACTION"], ["END", "WORK"]):
        if est.indice != est.total:
            raise NoAditivo("COMMIT/END sólo puede ser la última sentencia: confirmaría a medias el archivo")
        return
    if (len(s) == 5 and _es_palabra(s[0], "SET") and _es_palabra(s[1], "LOCAL")
            and s[2].kind == "word" and _minus(s[2].raw) in ("lock_timeout", "statement_timeout")
            and (_es_palabra(s[3], "TO") or (s[3].kind == "op" and s[3].val == "="))):
        if not _literal_timeout(s[4]):
            raise NoAditivo("SET LOCAL de un timeout que no es un literal positivo")
        return
    raise NoAditivo("control de transacción o SET fuera de BEGIN/COMMIT/END y SET LOCAL lock_timeout|statement_timeout")


def _clasificar(s, est):
    primero = s[0]
    if primero.kind != "word":
        raise NoAditivo("la sentencia no empieza por una palabra clave")
    v = primero.val
    if v == "CREATE":
        if len(s) < 2:
            raise NoAditivo("CREATE incompleto")
        if _es_palabra(s[1], "TABLE"):
            return _crear_tabla(s, est)
        if _es_palabra(s[1], "INDEX", "UNIQUE"):
            return _crear_indice(s, est)
        raise NoAditivo("CREATE %s no es verificable como aditivo (FUNCTION, TRIGGER, POLICY, VIEW, OR REPLACE…) y va al reporte del sábado"
                        % " ".join(t.val for t in s[1:3] if t.kind == "word"))
    if v == "ALTER":
        if len(s) < 2 or not _es_palabra(s[1], "TABLE"):
            raise NoAditivo("ALTER %s no es aditivo" % (s[1].val if len(s) > 1 else ""))
        return _alter_tabla(s, est)
    if v == "REVOKE":
        return _revoke(s, est)
    if v == "COMMENT":
        return _comment(s, est)
    if v == "DO":
        return _do(s, est)
    if v in ("BEGIN", "START", "COMMIT", "END", "SET"):
        return _control(s, est)
    raise NoAditivo("«%s» no es una sentencia aditiva permitida" % v)


def es_ddl_aditivo(sql):
    """(ok, motivo). Allowlist over tokens; any doubt is a rejection."""
    try:
        if not isinstance(sql, str) or not sql.strip():
            return False, "SQL vacío o no es texto"
        if len(sql) > _MAX_SQL:
            return False, "SQL demasiado largo para validarlo (%d caracteres)" % len(sql)
        toks = tokenizar(sql)
        sentencias = []
        actual = []
        for t in toks:
            if t.kind == "punct" and t.val == ";":
                if actual:
                    sentencias.append(actual)
                    actual = []
            else:
                actual.append(t)
        if actual:
            sentencias.append(actual)
        if not sentencias:
            return False, "SQL sin sentencias"
        est = _Estado()
        est.total = len(sentencias)
        for numero, s in enumerate(sentencias, 1):
            try:
                est.indice = numero
                esperado = est.pendiente_rls
                est.pendiente_rls = None
                est.rls_cumplido = None
                _verificar_balance(s)
                _clasificar(s, est)
                if esperado is not None and est.rls_cumplido != esperado:
                    raise NoAditivo("la tabla %s.%s debe ir seguida, en la sentencia inmediata, de su "
                                    "ALTER TABLE … ENABLE ROW LEVEL SECURITY" % esperado)
            except NoAditivo as e:
                return False, "sentencia %d (%s): %s" % (numero, _describir(s), e)
        for tabla in est.creadas:
            if tabla not in est.con_rls:
                return False, ("CREATE TABLE %s.%s sin ALTER TABLE … ENABLE ROW LEVEL SECURITY en el mismo archivo "
                               "(una tabla nueva en public hereda grants para anon: lección de la migración 081)" % tabla)
        return True, "%d sentencias aditivas" % len(sentencias)
    except SqlInvalido as e:
        return False, "SQL no analizable: %s" % e
    except Exception as e:  # fail closed on a bug of ours
        return False, "error interno al analizar el SQL (%s)" % type(e).__name__


# ---------------------------------------------------------------------------
# Compuertas de SQL de sólo lectura (execute_sql) y de la sonda (po_sonda).
# Las dos pasan por el tokenizador: un «--», «/*» o «$$» dentro de una cadena
# ya no puede esconder una sentencia, y el costo es lineal en el tamaño.
# ---------------------------------------------------------------------------
INICIO_LECTURA = {"SELECT", "WITH", "EXPLAIN", "TABLE", "VALUES"}  # SHOW reads GUCs (secrets): never
PALABRAS_QUE_ESCRIBEN = set(
    "INSERT UPDATE DELETE MERGE UPSERT TRUNCATE DROP ALTER CREATE GRANT REVOKE "
    "COMMENT VACUUM REINDEX CLUSTER COPY CALL DO LOCK REFRESH SECURITY SET RESET "
    "INTO SHARE ANALYZE ANALYSE EXECUTE PERFORM PREPARE DEALLOCATE DISCARD "
    "LISTEN NOTIFY UNLISTEN LOAD IMPORT REASSIGN CHECKPOINT PG_AUTHID PG_SHADOW".split()
)
# Funciones puras o de sólo lectura que una consulta de lectura puede llamar.
# Cualquier otra (public.*, desconocida, set_config, pg_notify, net.*, cron.*)
# vuelve a pedir permiso.
FUNCIONES_LECTURA = (FUNCIONES_DO - {"generate_series"}) | {
    "to_date", "to_timestamp", "to_number", "date_part", "age", "make_date",
    "timezone", "split_part", "string_to_array", "array_to_string", "regexp_replace",
    "regexp_match", "initcap", "reverse", "repeat", "lpad", "rpad", "starts_with",
    "json_agg", "jsonb_agg", "json_build_object", "jsonb_build_object", "to_json",
    "row_to_json", "jsonb_pretty", "jsonb_extract_path", "jsonb_extract_path_text",
    "jsonb_each", "jsonb_each_text", "jsonb_object_keys", "jsonb_array_elements",
    "jsonb_array_elements_text", "array_remove", "array_cat", "array_append",
    "row_number", "rank", "dense_rank", "lag", "lead", "first_value", "last_value",
    "ntile", "percentile_cont", "percentile_disc", "stddev", "variance", "mod",
    "power", "sqrt", "sign", "pg_size_pretty", "pg_database_size", "pg_get_triggerdef",
    "pg_get_function_arguments", "pg_get_function_result", "pg_is_in_recovery",
    "version", "current_database", "current_schema", "current_user", "session_user",
    "txid_current_snapshot", "to_tsquery", "plainto_tsquery", "to_tsvector",
}


def _una_sentencia(sql):
    """Tokens of the single statement in `sql`, or None (several, none, or untokenizable)."""
    try:
        toks = tokenizar(sql)
    except SqlInvalido:
        return None
    sentencias = []
    actual = []
    for t in toks:
        if t.kind == "punct" and t.val == ";":
            if actual:
                sentencias.append(actual)
                actual = []
        else:
            actual.append(t)
    if actual:
        sentencias.append(actual)
    return sentencias[0] if len(sentencias) == 1 else None


def sql_es_solo_lectura(sql):
    if not isinstance(sql, str) or not sql.strip() or len(sql) > _MAX_SQL:
        return False
    toks = _una_sentencia(sql)
    if not toks or toks[0].kind != "word" or toks[0].val not in INICIO_LECTURA:
        return False
    n = len(toks)
    try:
        _revisar_literales_tipados(toks)
    except NoAditivo:
        return False
    for i, t in enumerate(toks):
        if not _es_nombre(t):
            continue
        if (_mayus(t.val) if t.kind == "qident" else t.val) in PALABRAS_QUE_ESCRIBEN:
            return False
        if _toca_secretos(toks, i):
            return False
        if i + 1 < n and _es_punct(toks[i + 1], "("):
            if not _llamada_permitida(toks, i, FUNCIONES_LECTURA):
                return False
    return True


def es_sonda(sql):
    """Exactly: SELECT [public.]po_sonda( <literal> [, <literal> | ARRAY[<literal>, …]] )."""
    if not isinstance(sql, str) or not sql.strip() or len(sql) > _MAX_SQL:
        return False
    toks = _una_sentencia(sql)
    if not toks:
        return False
    es_texto = lambda t: t.kind in ("string", "estring", "dollar")  # noqa: E731
    i = 0
    if not _es_palabra(toks[i], "SELECT"):
        return False
    i += 1
    if (i + 1 < len(toks) and toks[i].kind == "word" and _minus(toks[i].raw) == "public"
            and _es_punct(toks[i + 1], ".")):
        i += 2
    if i + 1 >= len(toks) or toks[i].kind != "word" or _minus(toks[i].raw) != "po_sonda" or not _es_punct(toks[i + 1], "("):
        return False
    i += 2
    if i >= len(toks) or not es_texto(toks[i]):
        return False
    i += 1
    if i < len(toks) and _es_punct(toks[i], ","):
        i += 1
        if i < len(toks) and es_texto(toks[i]):
            i += 1
        elif i + 1 < len(toks) and _es_palabra(toks[i], "ARRAY") and _es_punct(toks[i + 1], "["):
            i += 2
            while True:
                if i >= len(toks) or not es_texto(toks[i]):
                    return False
                i += 1
                if i < len(toks) and _es_punct(toks[i], ","):
                    i += 1
                    continue
                break
            if i >= len(toks) or not _es_punct(toks[i], "]"):
                return False
            i += 1
        else:
            return False
    return i == len(toks) - 1 and _es_punct(toks[i], ")")


# ---------------------------------------------------------------------------
# Excepción del viernes: un solo apply aditivo, sesión desatendida.
# ---------------------------------------------------------------------------
NOMBRE_MIGRACION = re.compile(r"[0-9]{3}_[a-z0-9_]{3,80}")
DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
SUFIJO_NO_CORRIO = " Anótalo bajo NO CORRIÓ y sigue."


def _negar(motivo):
    return "deny", "Apply de migración denegado: " + motivo + "." + SUFIJO_NO_CORRIO


def evaluar_apply_viernes(project, name, query, hoy, atendida, session_id, marker_dir):
    """Decides ONE apply_migration. Returns (decision, motivo).

    `hoy` is today's date in America/New_York (None = could not be computed).
    All inputs arrive as parameters so tests are deterministic. The marker is
    written BEFORE answering allow, so a failed apply also spends the apply.
    """
    if atendida:
        return "ask", "Supabase: «apply_migration» cambia el proyecto, requiere confirmación."
    if not isinstance(hoy, datetime.date):
        return _negar("no pude determinar la fecha en America/New_York")
    if hoy.weekday() != 4:
        return _negar("hoy es %s %s en America/New_York y sólo se aplica los viernes" % (DIAS_ES[hoy.weekday()], hoy.isoformat()))
    if not isinstance(project, str) or project != PROYECTO_PRODUCCION:
        return _negar("el proyecto no es el de producción (%s)" % PROYECTO_PRODUCCION)
    if not isinstance(name, str) or NOMBRE_MIGRACION.fullmatch(name) is None:
        return _negar("el nombre no cumple NNN_snake_case (^[0-9]{3}_[a-z0-9_]{3,80}$)")
    if not isinstance(query, str) or not query.strip():
        return _negar("la migración no trae SQL")
    if not isinstance(session_id, str) or not session_id.strip():
        return _negar("el evento no trae session_id, no puedo limitar a un apply por sesión")
    ok, motivo = es_ddl_aditivo(query)
    if not ok:
        return _negar("el SQL no es DDL aditivo — %s" % motivo)
    try:
        os.makedirs(marker_dir, mode=0o700, exist_ok=True)
        marca = os.path.join(marker_dir, hashlib.sha256(session_id.encode("utf-8", "surrogatepass")).hexdigest())
        fd = os.open(marca, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return _negar("ya hubo un apply en esta sesión y sólo se permite uno por sesión")
    except OSError as e:
        return _negar("no pude registrar la marca de un apply por sesión (%s)" % type(e).__name__)
    try:
        os.write(fd, name.encode("ascii"))
    finally:
        os.close(fd)
    return "allow", ("Supabase: migración «%s» aditiva (%s), viernes, sesión desatendida, primer apply de la sesión."
                     % (name, motivo))


ARGUMENTOS_APPLY_MCP = {"project_id", "name", "query"}
ARGUMENTOS_APPLY_COMPOSIO = {"ref", "name", "query", "rollback", "idempotency_key"}


def _apply_mcp(entrada, hoy, atendida, session_id, marker_dir):
    if atendida:
        return evaluar_apply_viernes(None, None, None, hoy, atendida, session_id, marker_dir)
    extra = set(entrada) - ARGUMENTOS_APPLY_MCP
    if extra:
        return _negar("argumentos no reconocidos (%s)" % ", ".join(sorted(map(str, extra))))
    return evaluar_apply_viernes(entrada.get("project_id"), entrada.get("name"), entrada.get("query"),
                                 hoy, atendida, session_id, marker_dir)


def _apply_composio(item, hoy, atendida, session_id, marker_dir):
    if atendida:
        return evaluar_apply_viernes(None, None, None, hoy, atendida, session_id, marker_dir)
    if not cuenta_ok(item, CUENTAS_SUPABASE, requerida=True):
        return _negar("falta `account` o no es una cuenta de Supabase permitida")
    args = item.get("arguments")
    if not isinstance(args, dict):
        return _negar("el item no trae `arguments`")
    extra = set(args) - ARGUMENTOS_APPLY_COMPOSIO
    if extra:
        return _negar("argumentos no reconocidos (%s)" % ", ".join(sorted(map(str, extra))))
    if "rollback" in args:
        # Its semantics are undocumented ("SQL to rollback/undo this migration if
        # needed"): the Routine never sends it; the rollback lives in the PR and the ficha.
        return _negar("`rollback` presente: la Routine no lo envía (el rollback va en el PR y en la ficha)")
    if "idempotency_key" in args and not isinstance(args["idempotency_key"], str):
        return _negar("`idempotency_key` no es texto")
    return evaluar_apply_viernes(args.get("ref"), args.get("name"), args.get("query"),
                                 hoy, atendida, session_id, marker_dir)


# ---------------------------------------------------------------------------
# Excepción del sábado: crear la página del reporte en Notion.
# ---------------------------------------------------------------------------
def _normalizar_id_notion(valor):
    if not isinstance(valor, str):
        return None
    limpio = valor.replace("-", "").lower()
    return limpio if re.fullmatch(r"[0-9a-f]{32}", limpio) else None


def padre_reportes_ok(args):
    if not isinstance(args, dict):
        return False
    presentes = [k for k in ("parent_id", "parent_page_id") if k in args]
    if not presentes:
        return False
    if any(k in args for k in ("parent", "database_id", "parent_database_id", "data_source_id")):
        return False
    return {_normalizar_id_notion(args[k]) for k in presentes} == {REPORTES_SABADO}


def decidir_slug_composio(item):
    slug = str(item.get("tool_slug", "")).upper()
    args = item.get("arguments") or {}

    if slug.startswith("SUPABASE_"):
        if slug in LECTURA_COMPOSIO or slug.startswith(PREFIJOS_LECTURA_COMPOSIO):
            return True, ""
        if slug == "SUPABASE_BETA_RUN_SQL_QUERY":
            if ("query" in args and "sql" in args) or ("ref" in args and "project_ref" in args):
                return "deny", "Supabase vía Composio: `query` y `sql` (o `ref` y `project_ref`) a la vez es ambiguo; denegado."
            query = args.get("query", args.get("sql"))
            ref = args.get("ref", args.get("project_ref"))
            if (es_sonda(query) and ref == PROYECTO_PRODUCCION
                    and cuenta_ok(item, CUENTAS_SUPABASE, requerida=True)):
                return True, ""
            return False, ("Supabase vía Composio: SQL libre fuera de po_sonda, requiere confirmación. "
                           "Para probar una hipótesis usa select public.po_sonda(...).")
        if slug == "SUPABASE_APPLY_A_MIGRATION":
            return False, ("Supabase vía Composio: «SUPABASE_APPLY_A_MIGRATION» sólo se permite sola en la llamada "
                           "(un único item); en un lote con otras herramientas requiere confirmación.")
        return False, f"Supabase vía Composio: «{slug}» escribe o no está clasificado, requiere confirmación."

    if slug.startswith("NOTION_"):
        if slug == "NOTION_CREATE_NOTION_PAGE":
            if not cuenta_ok(item, CUENTAS_NOTION, requerida=True):
                return False, "Notion: crear página exige `account` explícita de thinksid, requiere confirmación."
            if not padre_reportes_ok(args):
                return False, "Notion: crear página fuera de «Reportes del sábado» (o con el padre ambiguo), requiere confirmación."
            return True, ""
        if slug not in NOTION_PERMITIDOS:
            return False, f"Notion: «{slug}» fuera de la política, requiere confirmación."
        if not cuenta_ok(item, CUENTAS_NOTION, requerida=False):
            return False, "Notion: cuenta distinta de thinksid, requiere confirmación."
        if slug == "NOTION_INSERT_ROW_DATABASE":
            db = str(args.get("database_id", "")).replace("-", "").lower()
            if db != DB_MANTENIMIENTO:
                return False, "Notion: insertar fuera de la base Mantenimiento, requiere confirmación."
        return True, ""

    if slug.startswith("VERCEL_"):
        if slug.startswith("VERCEL_GET_") and cuenta_ok(item, CUENTAS_VERCEL, requerida=False):
            return True, ""
        return False, f"Vercel: «{slug}» no es lectura VERCEL_GET_* de la cuenta escocia, requiere confirmación."

    if slug.startswith("GITHUB_"):
        if "MERGE" in slug:
            return False, f"GitHub: «{slug}» fusiona, requiere confirmación."
        if slug.startswith(PREFIJOS_GITHUB_LECTURA) or slug in GITHUB_PERMITIDOS:
            return True, ""
        return False, f"GitHub: «{slug}» fuera de la política, requiere confirmación."

    return False, f"Composio: «{slug}» fuera de la política de la operación, requiere confirmación."


def _solo_listar_conexiones(entrada):
    """Every toolkit item is {name?, action: "list"}; the only top-level keys are toolkits and session_id."""
    if set(entrada) - {"toolkits", "session_id"}:
        return False
    if "session_id" in entrada and not isinstance(entrada["session_id"], str):
        return False
    toolkits = entrada.get("toolkits")
    if not isinstance(toolkits, list) or not toolkits:
        return False
    for tk in toolkits:
        if not isinstance(tk, dict) or set(tk) - {"name", "action"}:
            return False
        if tk.get("action") != "list" or ("name" in tk and not isinstance(tk["name"], str)):
            return False
    return True


def evaluar_evento(evento, hoy, atendida, marker_dir):
    """Pure decision for one hook event: (decision, motivo), or None = no opinion."""
    herramienta = evento.get("tool_name", "") or ""
    entrada = evento.get("tool_input", {}) or {}
    if not isinstance(entrada, dict):
        entrada = {}
    session_id = evento.get("session_id")

    tool = _tool_de_supabase(herramienta)
    if tool is not None:
        if tool in LECTURA:
            return "allow", "Supabase: herramienta de lectura."
        if tool == "apply_migration":
            return _apply_mcp(entrada, hoy, atendida, session_id, marker_dir)
        if tool in ESCRITURA:
            return "ask", f"Supabase: «{tool}» cambia el proyecto, requiere confirmación."
        if tool == "execute_sql":
            if sql_es_solo_lectura(entrada.get("query")):
                return "allow", "Supabase: una sola sentencia de lectura."
            return "ask", "Supabase: execute_sql con una sentencia que puede escribir, requiere confirmación."
        return "ask", f"Supabase: herramienta «{tool}» no clasificada, requiere confirmación."

    if herramienta.startswith("mcp__Composio__") and herramienta != "mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL":
        # Meta tools. The workbench and the remote bash can call ANY slug from
        # code, and the hook cannot see inside them: always ask.
        nombre = herramienta[len("mcp__Composio__"):]
        if nombre in ("COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS"):
            return "allow", "Composio: búsqueda de herramientas o de esquemas (sólo lectura)."
        if nombre == "COMPOSIO_MANAGE_CONNECTIONS":
            if _solo_listar_conexiones(entrada):
                return "allow", "Composio: listar conexiones (sólo lectura)."
            return "ask", "Composio: «COMPOSIO_MANAGE_CONNECTIONS» que no es sólo listar, requiere confirmación."
        if nombre in ("COMPOSIO_REMOTE_WORKBENCH", "COMPOSIO_REMOTE_BASH_TOOL"):
            return "ask", f"Composio: «{nombre}» puede llamar cualquier herramienta desde código y el guard no lo ve, requiere confirmación."
        return "ask", f"Composio: «{nombre}» fuera de la política de la operación, requiere confirmación."

    if herramienta == "mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL":
        items = entrada.get("tools") or []
        if not items:
            return "ask", "Composio: llamada sin herramientas, requiere confirmación."
        if (len(items) == 1 and isinstance(items[0], dict)
                and str(items[0].get("tool_slug", "")).upper() == "SUPABASE_APPLY_A_MIGRATION"):
            return _apply_composio(items[0], hoy, atendida, session_id, marker_dir)
        for item in items:
            if not isinstance(item, dict):
                return "ask", "Composio: elemento no reconocido, requiere confirmación."
            permitido, motivo = decidir_slug_composio(item)
            if permitido == "deny":
                return "deny", motivo
            if permitido is not True:
                return "ask", motivo
        return "allow", "Composio: todas las herramientas están en la política de la operación."

    if herramienta in GITHUB_PIDE:
        return "ask", f"GitHub: «{herramienta}» fusiona o auto-fusiona, requiere confirmación."

    return None


def _hoy_nueva_york():
    """Today's date in America/New_York, or None if it cannot be computed (fail closed)."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo("America/New_York")).date()
    except Exception:
        return None


MAX_ENTRADA = 256 * 1024


def main():
    """Fail closed: ANY exception, including reading and parsing stdin, is an ask
    (a deny when unattended). Silence would let an always_allow tool run unfiltered."""
    atendida = False  # if we cannot tell, assume nobody can answer
    try:
        atendida = sesion_atendida()
        crudo = sys.stdin.buffer.read(MAX_ENTRADA + 1)
        if len(crudo) > MAX_ENTRADA:
            resultado = ("ask", "Guard: la entrada supera %d KB, requiere confirmación." % (MAX_ENTRADA // 1024))
        else:
            evento = json.loads(crudo.decode("utf-8"))
            if not isinstance(evento, dict):
                raise ValueError("el evento no es un objeto")
            marker_dir = os.path.join(tempfile.gettempdir(), "escocia-po-guard")
            resultado = evaluar_evento(evento, _hoy_nueva_york(), atendida, marker_dir)
    except Exception as e:  # RecursionError, MemoryError, UnicodeDecodeError, a bug of ours…
        resultado = ("ask", "Guard: error interno al evaluar la llamada (%s), requiere confirmación." % type(e).__name__)
    if resultado is not None:
        emitir(resultado[0], resultado[1], atendida)
    sys.exit(0)


if __name__ == "__main__":
    main()
