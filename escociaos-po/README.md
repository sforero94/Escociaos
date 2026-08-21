# escociaos-po/ — la operación de mantenimiento del Product Owner

Un equipo de agentes especialistas corre **lunes, jueves y viernes a las 7:00 am
ET** en Cloud Routines, audita la app desplegada, verifica antes de reportar,
archiva hallazgos en Notion, borrador-iza fixes como PRs y te manda un resumen
por push + email. Este folder es la única fuente de verdad de la operación.

**Lunes y jueves encuentran; el viernes termina.** El viernes drena el backlog de
P2/P3 y no abre hallazgos nuevos. Ninguna de las tres fusiona nunca: fusionar es
tuyo, siempre.

## Dónde vive cada pieza

| Pieza | Dónde | Qué controla |
|---|---|---|
| Constitución | [`CLAUDE.md`](./CLAUDE.md) | Protocolo de corrida, contrato de hallazgos, rúbrica de severidad, guardrails, modos de escritura |
| Agentes (8) | [`../.claude/agents/`](../.claude/agents/) | Un brief por especialista, en formato subagente de Claude Code — única copia |
| Runbooks | [`runbooks/`](./runbooks/) | Qué hace cada corrida programada (lunes / jueves / viernes) |
| Memoria | [`memory/`](./memory/) | Un archivo por agente + `_compartida.md`; disciplina de escritura en [`memory/README.md`](./memory/README.md) |
| Reportes | `reports/` | Un `.md` por corrida, escrito por el commit de memoria |
| Scheduling | Cloud Routines `trig_01QusLNQd3snSbrn9UwBuqmQ` (lunes) · `trig_01BnbYqstYhc1SjTfyrizYUB` (jueves) · `trig_01AbCfQPNmRh7Jq8fX8yktSe` (viernes) | Prompts bootstrapper que clonan este repo y leen este folder — casi nunca hay que editarlos. La allowlist de tools SÍ vive ahí y se pudre en silencio: ver el preflight en `CLAUDE.md` §4 |
| Hallazgos | [Notion — Escocia OS · Mantenimiento](https://app.notion.com/p/c52d9258fed7466d8e700fa92980d3df) | La base de datos que revisas |

## Cómo cambiar las prioridades

Edita la sección **§2 Standing priorities** de [`CLAUDE.md`](./CLAUDE.md) y haz
merge a `main`. La siguiente corrida las lee de ahí. Nada más que tocar.

## Cómo editar un runbook

Edita el archivo en [`runbooks/`](./runbooks/), merge a `main`. Los prompts de
las Routines no llevan copia del runbook — solo apuntan aquí — así que no hay
nada que re-sincronizar. Solo edita la Routine si cambia el **horario** (ojo al
cambio de DST del 1 de noviembre 2026: `0 11` → `0 12` UTC) o el bootstrapper
mismo.

## Cómo agregar (o retirar) un especialista

1. Crea `.claude/agents/<nombre>.md` con frontmatter `name`, `description`,
   `model` (sin `tools:` — se omite a propósito para que herede todo, porque los
   nombres de herramientas MCP cambian entre entornos).
2. Crea `memory/<nombre>.md` copiando la plantilla de secciones de cualquier
   archivo existente.
3. Agrégalo a la tabla de cadencia en `CLAUDE.md` §3 y al roster del runbook que
   le toque.
4. Para retirar: quítalo de la tabla y del runbook; deja el brief y la memoria
   en el repo (histórico barato).

## Cómo correr un dry-run manual

En una sesión normal de Claude Code sobre este repo:

> Corre el runbook del lunes en modo dry-run: no escribas en Notion, no abras
> PRs, no hagas push. Muéstrame qué habrías archivado.

## Reglas que no se negocian

Están en `CLAUDE.md` §6. Las tres que más importan: la base de datos de
producción es **solo `SELECT`**; nunca push a `main` (única excepción: el commit
de memoria, limitado a `memory/**` + `reports/**`); y cambios de lógica de
negocio son propuestas, nunca PRs.
