# Propuesta — el guard hook vigila el conector oficial de Notion

**Estado: APLICADA el 2026-10-30** (rama `claude/hook-notion-oficial`). Santiago aprobó
la edición en una sesión en vivo con el modo «Accept edits». Este documento queda como
registro; no vuelvas a correr el script. Escrita 2026-10-29. Las rutinas de Escocia OS pasaron
de Composio al conector oficial de Notion (decisión de Santiago, 2026-10-29). Hoy ese
conector solo lo limita la allowlist de cada rutina (`permitted_tools`). Esta propuesta
agrega la segunda capa en el hook.

**Por qué no está aplicada.** La sesión que la escribió no pudo editar
`.claude/hooks/supabase-guard.py` ni `.claude/settings.json`: los dos están protegidos
contra auto-modificación (regla `permissions.deny` y el clasificador de auto mode). Es
lo correcto. Aplicarla exige la aprobación de Santiago en una sesión en vivo.

## Qué hace

Solo en una sesión **desatendida** (una Routine). En una sesión en vivo el hook no opina
sobre Notion, así que el trabajo interactivo (memorias, otros proyectos) no cambia.

| Tool | Decisión |
|---|---|
| `notion-search`, `notion-fetch`, `notion-query-data-sources`, otras lecturas | allow |
| `notion-create-pages` con padre Mantenimiento | allow |
| `notion-create-pages` con padre Bot Log y `Frente = Escocia OS` en cada página | allow |
| `notion-create-pages` con padre la página «Reportes del sábado» | allow |
| `notion-create-pages` en borrador, con plantilla, como skill o con otro padre | deny |
| `notion-update-page` con `update_properties` o `insert_content` al final | allow |
| `notion-update-page` con `replace_content`, `update_content`, `apply_template`, `allow_deleting_content` o `is_skill` | deny |
| Cualquier otro `notion-*` (borrar, mover, duplicar, compartir, comentar…) | deny |

Límite aceptado: el hook no ve el padre de una página existente, así que
`notion-update-page` no se acota por base. Es el mismo límite que ya tenía
`NOTION_UPDATE_ROW_DATABASE` por Composio.

## Cómo aplicarla (sesión en vivo, con tu OK)

1. En `.claude/settings.json`, en el `matcher` del `PreToolUse`, agrega
   `|mcp__.*[Nn][Oo][Tt][Ii][Oo][Nn].*__notion-.*` antes de `|mcp__github__(…)`.
2. Corre el script de abajo: `python3 parche.py .claude/hooks/supabase-guard.py`.
3. Agrega tests en `src/__tests__/supabaseGuardHook.test.ts` para cada fila de la tabla,
   en sesión atendida (sin opinión) y desatendida, y corre
   `npx vitest run src/__tests__/supabaseGuardHook.test.ts`.
4. Cambia en `escociaos-po/CLAUDE.md` §6 «not yet active» por la fecha de activación.

```python
import re, sys
p = sys.argv[1]
s = open(p).read()

def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)

rep('''REPORTES_SABADO = "40667755ed68814fb676f9e28be7d2f3"
''', '''REPORTES_SABADO = "40667755ed68814fb676f9e28be7d2f3"
# Notion oficial (2026-10-29): bases donde una Routine desatendida puede crear filas.
# Cada base se acepta por su id de base o por el id de su data source.
NOTION_MANTENIMIENTO = {"c52d9258fed7466d8e700fa92980d3df", "b22d2385a8124d4a8094cefa9d080f60"}
NOTION_BOT_LOG = {"40767755ed6880d4b4dac623ce5687de", "40767755ed68801e8339000bd8a8a652"}
NOTION_MCP_LECTURA = {
    "notion-search", "notion-fetch", "notion-query-data-sources",
    "notion-query-multiple-data-sources", "notion-get-users", "notion-get-self",
    "notion-get-comments", "notion-get-async-task", "notion-get-tool-access",
}
PREFIJO_NOTION = re.compile(r"^mcp__(?P<servidor>(?:(?!__).)+)__(?P<tool>notion-.+)$", re.DOTALL)
''')

rep('''def decidir_slug_composio(item):''', '''def _tool_de_notion(herramienta):
    """Tool name of the official Notion MCP (`mcp__<server with notion>__notion-*`), or None."""
    m = PREFIJO_NOTION.match(herramienta or "")
    if not m:
        return None
    servidor = m.group("servidor").lower()
    if "notion" not in servidor or "composio" in servidor:
        return None
    return m.group("tool")


def _id_padre_notion(padre):
    """(kind, normalized id) of a create-pages parent, or None if it is not one clean id."""
    if not isinstance(padre, dict):
        return None
    claves = [k for k in ("page_id", "database_id", "data_source_id") if k in padre]
    if len(claves) != 1 or set(padre) - {"type", claves[0]}:
        return None
    if "type" in padre and padre["type"] != claves[0]:
        return None
    valor = padre[claves[0]]
    if isinstance(valor, str) and valor.startswith("collection://"):
        valor = valor[len("collection://"):]
    ident = _normalizar_id_notion(valor)
    return (claves[0], ident) if ident else None


def decidir_notion_mcp(tool, entrada):
    """(allowed, reason) for the official Notion MCP in an unattended session."""
    if tool in NOTION_MCP_LECTURA:
        return True, "Notion: herramienta de lectura."
    if tool == "notion-create-pages":
        if set(entrada) - {"parent", "pages", "allow_async", "instructions_version"}:
            return False, "Notion: crear páginas con argumentos fuera de la política (borrador…), denegado."
        padre = _id_padre_notion(entrada.get("parent"))
        paginas = entrada.get("pages")
        if padre is None or not isinstance(paginas, list) or not paginas:
            return False, "Notion: crear páginas sin un padre único y explícito, denegado."
        if any(not isinstance(pg, dict) or pg.get("is_skill") or "template_id" in pg for pg in paginas):
            return False, "Notion: crear skills o páginas desde plantilla, denegado."
        tipo, ident = padre
        if tipo == "page_id":
            if ident == REPORTES_SABADO:
                return True, "Notion: página del reporte del sábado."
            return False, "Notion: crear páginas fuera de «Reportes del sábado», denegado."
        if ident in NOTION_MANTENIMIENTO:
            return True, "Notion: fila en la base Mantenimiento."
        if ident in NOTION_BOT_LOG:
            for pg in paginas:
                props = pg.get("properties")
                if not isinstance(props, dict) or props.get("Frente") != "Escocia OS":
                    return False, "Notion: fila del Bot Log sin Frente = «Escocia OS», denegado."
            return True, "Notion: fila del Bot Log de Escocia OS."
        return False, "Notion: crear filas fuera de Mantenimiento y Bot Log, denegado."
    if tool == "notion-update-page":
        comando = entrada.get("command")
        if comando not in ("update_properties", "insert_content"):
            return False, f"Notion: «{comando}» reescribe o borra contenido, denegado."
        if entrada.get("allow_deleting_content") or entrada.get("is_skill"):
            return False, "Notion: borrar contenido o marcar skills, denegado."
        if comando == "insert_content" and entrada.get("position") not in (None, {"type": "end"}):
            return False, "Notion: solo se agrega contenido al final de la página, denegado."
        return True, "Notion: actualizar propiedades o agregar al final."
    return False, f"Notion: «{tool}» fuera de la política de la operación, denegado."


def decidir_slug_composio(item):''')

rep('''    if herramienta.startswith("mcp__Composio__") and herramienta != "mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL":''',
'''    tool_notion = _tool_de_notion(herramienta)
    if tool_notion is not None:
        if atendida:
            return None
        permitido, motivo = decidir_notion_mcp(tool_notion, entrada if isinstance(entrada, dict) else {})
        return ("allow" if permitido else "deny"), motivo

    if herramienta.startswith("mcp__Composio__") and herramienta != "mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL":''')

open(p, "w").write(s)
print("ok")
```
