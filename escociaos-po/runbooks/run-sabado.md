# Runbook — Corrida del sábado (reporte de decisiones)

**Cadence**: Saturdays 08:00 America/New_York · proposed cron `0 13 * * 6` UTC
(winter time, from 1 November 2026; on Saturday 31 October, still EDT, that cron
fires at 09:00 ET) · **Agents**: none · **Trigger**:
`trig_01G7S43qgN2uiCKDEp1LZfKg` (created 2026-10-27; first fire 2026-10-31).

Created 2026-10-26, decision of Santiago (cycle in constitution §3). Monday and
Thursday find, Friday executes and prepares; **Saturday asks.** It turns the
ledger and Friday's report into one report Santiago can answer from his phone,
one line per item. The answers are executed by a separate session he opens
himself: `runbooks/respuesta-sabado.md`.

**Saturday never does work.** It runs no sweep, dispatches no agent, opens no
PR, merges nothing, deploys nothing, calls no Supabase tool and writes nothing
to the database. Its only writes are the Notion report page, the memory
commit and its Bot Log row (constitution §4 Phase 5b). It files no finding, except one against the operation itself (§
Failure handling).

> **Why a Routine report plus a reply session, and not a Routine-spawned
> session (Santiago, 2026-10-26).** Santiago cannot see Routine sessions on his
> phone, so a Routine cannot be where he answers. No documented way exists for
> a Routine to open an ordinary cloud session for him. A local scheduler
> (`claude --cloud` from his computer) was rejected because his computer is not
> always on. So the Routine writes the report and hands him a ready-to-paste
> prompt; he opens the session.

---

## Phases

**Phase 0 — Boot**

- Run id `YYYY-MM-DD-sabado`. Clone (`git clone --depth 50
  https://github.com/sforero94/Escociaos.git`); no `npm ci`, no worktrees —
  nothing is built or tested.
- Read the root `CLAUDE.md`, the constitution and `evals/rubrica-ruteo.md`.
- Write mode (constitution §7): verify the push path with the memory commit.
- Tool preflight (constitution §4), narrowed to what Saturday uses: the official
  Notion connector (step 2b) and Composio `github` (reads). Record the
  `ATTENDED=` line.
- **Friday check**: the latest `reports/YYYY-MM-DD-viernes.md` must be from the
  day before. If it is missing, say so on the first line of the report: the
  Saturday report is then built from the ledger alone, and Friday's absence is
  a P1 against the operation.

**Phase 1 — Gather (read only)**

- From Friday's report: `APLICADO SIN FUSIONAR`, `PREPARADO PARA EL FDS`,
  `REQUIERE DEPLOY`, and `DRENADO` (`run-viernes.md` Phase 6).
- From Notion (Mantenimiento, filtered — never unfiltered, see
  `memory/_compartida.md`): every open ficha with `Ruta = FDS`, and every
  `In progress` ficha with a PR.
- From GitHub: every open `claude/po-*` PR — checks state, mergeability, and the
  `requiere_deploy` line in its body.

**Phase 2 — Build the report (in Spanish, constitution §9)**

Three sections, in this order. Each item ends with the exact reply token.
An empty section says `Nada esta semana.`

1. **PRs para fusionar** — each PR: number, `ESCO-NNN`, the finding in one
   line (`Resumen (ES)`), checks state, and migration state (`aplicada`,
   `preparada, no aplicada` with the reason, or `sin migración`). For every
   `requiere_deploy` PR, the **merge-and-deploy order**, as each PR body states
   it (migration before or after `npx supabase functions deploy
   make-server-1ccce916`, which Santiago runs: no session deploys,
   constitution §6). If two PRs need conflicting orders, say so and recommend
   one. Token: `fusionar #N #M …`. A migration `preparada, no aplicada` also
   gets `ESCO-NNN aplicar`.
2. **Decisiones para ti** — each `FDS` ficha of `Tipo FDS` `decision`, `datos`
   or `accion_externa`, as Friday prepared it (`run-viernes.md` Phase 3b):
   - `decision`: options A/B/(C), the consequence of each, and the
     recommendation. Token: `ESCO-NNN A`.
   - `datos`: what the migration changes, rows touched, pre-state, post-state
     from the `po_sonda` rehearsal. Token: `ESCO-NNN aplicar`. **Only if its
     file has no `TODO` left and the rehearsal ran.** Otherwise ask for the
     missing value; it is not offered as `aplicar` this week.
   - `accion_externa`: the steps only he can do. No token.
   A ficha Friday did not prepare is listed as `sin preparar`, with the reason.
3. **Propuestas / recomendaciones** — each `Tipo FDS = propuesta` from
   Thursday: what, why, cost, recommendation. Token: `ESCO-NNN si` /
   `ESCO-NNN no`.

**Phase 3 — Publish**

- **Notion**: one new page with the full report, through the official Notion
  connector, `notion-create-pages`, parent
  `{"type": "page_id", "page_id": "40667755-ed68-814f-b676-f9e28be7d2f3"}` (the
  "Escocia OS — Reportes del sábado" page, created 2026-10-26 next to the
  Mantenimiento database), title `Reporte del sábado YYYY-MM-DD`, and the whole
  report in the page `content`, so that it is one call. No other parent and no
  other Notion page (constitution §6). If the call is denied or fails, record it
  under NO CORRIÓ and continue: the file and the push still carry everything.
- **File**: `escociaos-po/reports/YYYY-MM-DD-sabado.md`, in the memory commit,
  after the pre-commit check (constitution §4 Phase 5). Allowed paths only.
- **Bot Log** — the last write: one new row for `YYYY-MM-DD-sabado`
  (constitution §4 Phase 5b), `Estado = Espera a Santiago` whenever the report
  has an item for him, `Necesito de Santiago = Responder el reporte del sábado
  (sesión nueva)`, and the Notion page plus the report file in `Enlaces`. The
  reply session closes this same row.

**Phase 4 — Notify**

Everything the run did stays visible in the Routine's own thread. The final
message — the push — is short and uses exactly this:

```
Escocia OS — sábado <YYYY-MM-DD> · reporte de decisiones
<n> PRs para fusionar · <n> decisiones · <n> propuestas
Notion: <url | sin página: ver NO CORRIÓ>

Para responder, abre una sesión NUEVA de Claude Code en la nube (no respondas
aquí), pega el bloque y escribe tus líneas debajo:

Respuesta al reporte del sábado <YYYY-MM-DD>. Repo sforero94/Escociaos.
Lee escociaos-po/runbooks/respuesta-sabado.md y síguelo.
Reporte: escociaos-po/reports/<YYYY-MM-DD>-sabado.md · Notion: <url>
Mis respuestas, una por línea:

Ejemplos: ESCO-170 A · ESCO-171 aplicar · ESCO-172 si · fusionar #343 #344

NO CORRIÓ
- <tool | step> — <reason>
```

---

## Failure handling

The unattended-run rules of constitution §7 apply: **never wait on a permission
prompt, and never end without writing the report.** A Saturday that cannot
reach Notion still writes the file and the push (Notion-degraded mode). A
Saturday that cannot push still ends with the full report in its final message,
because that message is what reaches Santiago.
