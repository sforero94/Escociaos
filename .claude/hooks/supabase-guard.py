#!/usr/bin/env python3
"""PreToolUse guard for Supabase tools (decision of Santiago, 2026-09-24).

- Supabase reads and recoverable writes: allow without a prompt.
- Anything destructive (DELETE, DROP, TRUNCATE, cron.unschedule, delete tools):
  ask. The permission prompt sends the push notification.
- Composio calls that are not only Supabase: no decision (normal flow).
"""
import json
import re
import sys

DESTRUCTIVO = re.compile(
    r"\b(DELETE|DROP|TRUNCATE)\b|cron\.unschedule|_DELETE|DELETE_|_REMOVE|REMOVE_|PAUSE|RESTORE",
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


try:
    evento = json.load(sys.stdin)
except Exception:
    sys.exit(0)

herramienta = evento.get("tool_name", "")
entrada = evento.get("tool_input", {}) or {}

if herramienta.startswith("mcp__Supabase_Routines__"):
    texto = herramienta + " " + json.dumps(entrada, ensure_ascii=False)
    if DESTRUCTIVO.search(texto):
        decidir("ask", "Supabase: operación destructiva o irrecuperable, requiere confirmación.")
    decidir("allow", "Supabase: lectura o escritura recuperable, autorizada por Santiago.")

if herramienta == "mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL":
    items = entrada.get("tools") or []
    slugs = [str(i.get("tool_slug", "")) for i in items if isinstance(i, dict)]
    if not slugs or not all(s.upper().startswith("SUPABASE_") for s in slugs):
        sys.exit(0)  # no es sólo Supabase: flujo normal de permisos
    texto = json.dumps(items, ensure_ascii=False)
    if DESTRUCTIVO.search(texto):
        decidir("ask", "Supabase vía Composio: operación destructiva o irrecuperable, requiere confirmación.")
    decidir("allow", "Supabase vía Composio: lectura o escritura recuperable, autorizada por Santiago.")

sys.exit(0)
