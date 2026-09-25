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
- Composio: every slug must be a known read (SUPABASE_RUN_READ_ONLY_QUERY,
  SUPABASE_LIST_*, SUPABASE_GET_*); anything else asks. Calls that are not
  only Supabase get no decision (normal permission flow).
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
    slugs = [str(i.get("tool_slug", "")).upper() for i in items if isinstance(i, dict)]
    if not slugs or not all(s.startswith("SUPABASE_") for s in slugs):
        sys.exit(0)  # not only Supabase: normal permission flow
    if all(s in LECTURA_COMPOSIO or s.startswith(PREFIJOS_LECTURA_COMPOSIO) for s in slugs):
        decidir("allow", "Supabase vía Composio: sólo lecturas.")
    decidir("ask", "Supabase vía Composio: incluye una herramienta que escribe, requiere confirmación.")

sys.exit(0)
