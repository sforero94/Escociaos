#!/usr/bin/env python3
"""PreToolUse guard for Supabase tools.

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
- execute_sql: allow only a single read statement (SELECT / WITH / EXPLAIN /
  SHOW / TABLE / VALUES) with no data-modifying keyword; anything else asks.
- Composio (rewritten 2026-09-27): EVERY item of the call is checked, also
  when toolkits are mixed, against the policy of the maintenance operation:
  Supabase reads; Notion on the Mantenimiento database (account thinksid);
  Vercel VERCEL_GET_* only; GitHub reads, open PR, comment (never merge);
  SUPABASE_APPLY_A_MIGRATION only on a Friday (America/New_York), account
  escocia-os, project ywhtjwawnkeqlwxbvgup, SQL byte-identical to a file in
  src/sql/migrations/ and strictly additive (gate 1 of run-viernes.md).
  Everything else asks, SUPABASE_BETA_RUN_SQL_QUERY included.
- GitHub MCP merge_pull_request / enable_pr_auto_merge: ask.
- Any Supabase tool not in these lists: ask.

"ask" shows the permission prompt, which sends the push notification.
"""
import json
import re
import sys

# Every MCP connector whose name starts with "Supabase" (Supabase,
# Supabase_Routines, Supabase_Escritura, ...).
PREFIJO_SUPABASE = re.compile(r"^mcp__Supabase[A-Za-z0-9_-]*__(?P<tool>.+)$")

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

INICIO_LECTURA = re.compile(r"^(SELECT|WITH|EXPLAIN|SHOW|TABLE|VALUES)\b", re.IGNORECASE)
# Keywords that make a statement write, even inside a WITH or an EXPLAIN ANALYZE.
MODIFICA = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|"
    r"COMMENT|VACUUM|REINDEX|CLUSTER|COPY|CALL|DO|LOCK|REFRESH|SECURITY|SET|RESET|"
    r"nextval|setval|pg_terminate_backend|pg_cancel_backend|cron\.\w+|net\.http_\w+|"
    r"lo_\w+|pg_read_\w+|dblink\w*)\b",
    re.IGNORECASE,
)


def decidir(decision, motivo):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": motivo,
        }
    }))
    sys.exit(0)


def quitar_comentarios_y_literales(sql):
    """Removes comments and string literals, so a word inside them does not count."""
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"\$([A-Za-z_]*)\$.*?\$\1\$", " '' ", sql, flags=re.DOTALL)
    sql = re.sub(r"'(?:[^']|'')*'", " '' ", sql)
    sql = re.sub(r'"(?:[^"]|"")*"', ' "x" ', sql)
    return sql.strip()


def sql_es_solo_lectura(sql):
    if not isinstance(sql, str) or not sql.strip():
        return False
    limpio = quitar_comentarios_y_literales(sql).rstrip(";").strip()
    if ";" in limpio:  # more than one statement
        return False
    if not INICIO_LECTURA.match(limpio):
        return False
    return MODIFICA.search(limpio) is None



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

# Compuerta 1 del runbook del viernes: cada sentencia empieza por una de éstas.
INICIO_ADITIVO = re.compile(
    r"^(CREATE\s+(UNIQUE\s+)?INDEX|CREATE\s+TABLE|CREATE\s+OR\s+REPLACE\s+FUNCTION|"
    r"CREATE\s+TRIGGER|CREATE\s+POLICY|ALTER\s+POLICY|ALTER\s+TABLE|GRANT|REVOKE|"
    r"COMMENT\s+ON|DO|BEGIN|COMMIT)\b",
    re.IGNORECASE,
)
ALTER_TABLE_ADITIVO = re.compile(
    r"^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?[\w\".]+\s+"
    r"(ADD\s+COLUMN|ADD\s+CONSTRAINT|ENABLE\s+ROW\s+LEVEL\s+SECURITY)\b",
    re.IGNORECASE,
)
NO_ADITIVO = re.compile(
    r"\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|MERGE|RENAME)\b|ALTER\s+COLUMN", re.IGNORECASE
)
# Cuerpo de un DO: sólo guardas. Nada que escriba ni SQL dinámico.
CUERPO_DO_ESCRIBE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|EXECUTE|PERFORM|"
    r"COPY|CALL)\b",
    re.IGNORECASE,
)


def entrada_cwd(evento):
    return evento.get("cwd") or ""


def es_viernes_bogota_ny():
    """Día de la corrida en America/New_York. SUPABASE_GUARD_FECHA sólo para pruebas."""
    import datetime
    import os
    forzada = os.environ.get("SUPABASE_GUARD_FECHA")
    if forzada:
        return datetime.date.fromisoformat(forzada).weekday() == 4
    try:
        from zoneinfo import ZoneInfo
        ahora = datetime.datetime.now(ZoneInfo("America/New_York"))
    except Exception:
        return False
    return ahora.weekday() == 4


def migracion_del_repo(query, cwd):
    """Compuerta 5: el SQL que corre es byte a byte un fichero de src/sql/migrations/."""
    import glob
    import os
    raices = {os.environ.get("CLAUDE_PROJECT_DIR", ""), cwd}
    objetivo = query.strip()
    for raiz in raices:
        if not raiz:
            continue
        for ruta in glob.glob(os.path.join(raiz, "src", "sql", "migrations", "[0-9][0-9][0-9]_*.sql")):
            try:
                with open(ruta, encoding="utf-8") as f:
                    if f.read().strip() == objetivo:
                        return ruta
            except OSError:
                continue
    return None


def sql_es_aditivo(sql):
    """Compuerta 1 del runbook, aplicada de forma mecánica."""
    sin_coment = re.sub(r"--[^\n]*", " ", sql)
    sin_coment = re.sub(r"/\*.*?\*/", " ", sin_coment, flags=re.DOTALL)
    for cuerpo in re.findall(r"\bDO\s+\$([A-Za-z_]*)\$(.*?)\$\1\$", sin_coment, flags=re.DOTALL | re.IGNORECASE):
        limpio = re.sub(r"'(?:[^']|'')*'", " '' ", cuerpo[1])
        if CUERPO_DO_ESCRIBE.search(limpio):
            return False
    limpio = quitar_comentarios_y_literales(sql)
    sentencias = [x.strip() for x in limpio.split(";") if x.strip()]
    if not sentencias:
        return False
    for sentencia in sentencias:
        if not INICIO_ADITIVO.match(sentencia):
            return False
        if re.match(r"^ALTER\s+TABLE\b", sentencia, re.IGNORECASE) and not ALTER_TABLE_ADITIVO.match(sentencia):
            return False
        if re.match(r"^(GRANT|REVOKE)\b", sentencia, re.IGNORECASE):
            continue  # GRANT/REVOKE nombran privilegios (UPDATE, DELETE...), no los ejecutan
        if NO_ADITIVO.search(sentencia):
            return False
    return True


def cuenta_ok(item, cuentas, requerida):
    cuenta = item.get("account")
    if cuenta is None:
        return not requerida
    return str(cuenta) in cuentas


def decidir_slug_composio(item, cwd):
    slug = str(item.get("tool_slug", "")).upper()
    args = item.get("arguments") or {}

    if slug.startswith("SUPABASE_"):
        if slug in LECTURA_COMPOSIO or slug.startswith(PREFIJOS_LECTURA_COMPOSIO):
            return True, ""
        if slug == "SUPABASE_APPLY_A_MIGRATION":
            if not es_viernes_bogota_ny():
                return False, "SUPABASE_APPLY_A_MIGRATION fuera del viernes, requiere confirmación."
            if not cuenta_ok(item, CUENTAS_SUPABASE, requerida=True):
                return False, "SUPABASE_APPLY_A_MIGRATION sin la cuenta escocia-os, requiere confirmación."
            if args.get("ref") != PROYECTO_PRODUCCION:
                return False, "SUPABASE_APPLY_A_MIGRATION contra otro proyecto, requiere confirmación."
            query = args.get("query")
            if not isinstance(query, str) or not migracion_del_repo(query, cwd):
                return False, "El SQL no es byte a byte un fichero de src/sql/migrations/, requiere confirmación."
            if not sql_es_aditivo(query):
                return False, "La migración no es estrictamente aditiva, requiere confirmación."
            return True, ""
        return False, f"Supabase vía Composio: «{slug}» escribe o no está clasificado, requiere confirmación."

    if slug.startswith("NOTION_"):
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


try:
    evento = json.load(sys.stdin)
except Exception:
    sys.exit(0)

herramienta = evento.get("tool_name", "") or ""
entrada = evento.get("tool_input", {}) or {}

coincide = PREFIJO_SUPABASE.match(herramienta)
if coincide:
    tool = coincide.group("tool")
    if tool in LECTURA:
        decidir("allow", "Supabase: herramienta de lectura.")
    if tool in ESCRITURA:
        decidir("ask", f"Supabase: «{tool}» cambia el proyecto, requiere confirmación.")
    if tool == "execute_sql":
        if sql_es_solo_lectura(entrada.get("query")):
            decidir("allow", "Supabase: una sola sentencia de lectura.")
        decidir("ask", "Supabase: execute_sql con una sentencia que puede escribir, requiere confirmación.")
    decidir("ask", f"Supabase: herramienta «{tool}» no clasificada, requiere confirmación.")

if herramienta == "mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL":
    items = entrada.get("tools") or []
    if not items:
        decidir("ask", "Composio: llamada sin herramientas, requiere confirmación.")
    for item in items:
        if not isinstance(item, dict):
            decidir("ask", "Composio: elemento no reconocido, requiere confirmación.")
        permitido, motivo = decidir_slug_composio(item, entrada_cwd(evento))
        if not permitido:
            decidir("ask", motivo)
    decidir("allow", "Composio: todas las herramientas están en la política de la operación.")

if herramienta in GITHUB_PIDE:
    decidir("ask", f"GitHub: «{herramienta}» fusiona o auto-fusiona, requiere confirmación.")

sys.exit(0)
