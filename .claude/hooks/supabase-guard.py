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
  SUPABASE_BETA_RUN_SQL_QUERY only as a hypothesis probe with the exact form
  `select public.po_sonda(...)` (migration 170: runs and ALWAYS rolls back),
  account escocia-os, project ywhtjwawnkeqlwxbvgup. Everything else asks,
  every Supabase write included: decision of Santiago 2026-09-27 ("option
  A"), the Routines never write.
- GitHub MCP merge_pull_request / enable_pr_auto_merge: ask.
- Any Supabase tool not in these lists: ask.

"ask" shows the permission prompt in an attended session. In an unattended
session (a Routine) every "ask" becomes "deny": a parked prompt stalled runs
for hours until Santiago opened them.
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


def sesion_atendida():
    """True when a person can answer a prompt.

    A cloud session carries CLAUDE_CODE_SESSION_ATTENDED=1 when someone is
    watching. In a Routine nobody is: a prompt is parked until a human opens
    the session, which is how runs stalled for hours. A local CLI
    (CLAUDE_CODE_REMOTE not "true") is always attended.
    """
    import os
    if os.environ.get("CLAUDE_CODE_REMOTE", "").lower() != "true":
        return True
    return os.environ.get("CLAUDE_CODE_SESSION_ATTENDED") == "1"


def decidir(decision, motivo):
    # Nobody answers a prompt in an unattended run: deny, so the agent gets an
    # error, records it under NO CORRIÓ and keeps going instead of stalling.
    if decision == "ask" and not sesion_atendida():
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

# Consulta de prueba (migración 170): la única forma de SQL libre que pasa.
# Tras quitar literales, debe quedar exactamente una llamada a po_sonda con
# la consulta y, opcionalmente, un arreglo de pasos de preparación.
FORMA_SONDA = re.compile(
    r"^SELECT\s+(public\.)?po_sonda\s*\(\s*''\s*"
    r"(,\s*(''|ARRAY\s*\[\s*''(\s*,\s*'')*\s*\]))?\s*\)$",
    re.IGNORECASE,
)


def es_sonda(sql):
    if not isinstance(sql, str) or not sql.strip():
        return False
    limpio = quitar_comentarios_y_literales(sql).rstrip(";").strip()
    return ";" not in limpio and FORMA_SONDA.match(limpio) is not None


def cuenta_ok(item, cuentas, requerida):
    cuenta = item.get("account")
    if cuenta is None:
        return not requerida
    return str(cuenta) in cuentas


def decidir_slug_composio(item):
    slug = str(item.get("tool_slug", "")).upper()
    args = item.get("arguments") or {}

    if slug.startswith("SUPABASE_"):
        if slug in LECTURA_COMPOSIO or slug.startswith(PREFIJOS_LECTURA_COMPOSIO):
            return True, ""
        if slug == "SUPABASE_BETA_RUN_SQL_QUERY":
            query = args.get("query", args.get("sql"))
            ref = args.get("ref", args.get("project_ref"))
            if (es_sonda(query) and ref == PROYECTO_PRODUCCION
                    and cuenta_ok(item, CUENTAS_SUPABASE, requerida=True)):
                return True, ""
            return False, ("Supabase vía Composio: SQL libre fuera de po_sonda, requiere confirmación. "
                           "Para probar una hipótesis usa select public.po_sonda(...).")
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
        permitido, motivo = decidir_slug_composio(item)
        if not permitido:
            decidir("ask", motivo)
    decidir("allow", "Composio: todas las herramientas están en la política de la operación.")

if herramienta in GITHUB_PIDE:
    decidir("ask", f"GitHub: «{herramienta}» fusiona o auto-fusiona, requiere confirmación.")

sys.exit(0)
