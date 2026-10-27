# Runbook — Corrida del viernes (drenaje del backlog)

**Cadence**: Fridays 07:00 America/New_York · **Agents**: 2–4, sized to the work ·
**Expected duration**: 20–45 min.

Friday exists for one reason: **the backlog fills faster than it drains.** Monday
and Thursday find things. Nothing was scheduled to finish them, so P2s
accumulated until the board stopped being a to-do list and became a graveyard.

**Friday drains. It never fills.** It runs no sweep, opens no investigation, and
files no new finding — with exactly two exceptions, both about itself: a finding
against the operation (§ Failure handling), and a finding it *causes* while
fixing something. If Friday ever reports "we also noticed X in the codebase",
that is a defect in how it was run.

**Since 2026-10-26 Friday has two jobs** (cycle in constitution §3): **execute**
every `Ruta = VIERNES` ficha it may touch, and **prepare** every `Ruta = FDS`
ficha (Phase 3b) so that Saturday is a pick, not a study session.

---

## What Friday may touch

Eligibility is mechanical. A finding qualifies **only** if every one of these
holds — no judgement calls, no "close enough":

| Field | Required value |
|---|---|
| `Ruta` | `VIERNES` (set by Monday or Thursday with `evals/rubrica-ruteo.md`) |
| `Severidad` | never `P0`. `P1` only if it passes rubric V8 (flag `p1`) |
| `Estado` | `Not started` |
| `Confianza` | `Alta` |
| `Clase` | `codigo` or `ddl_aditivo` |

`Requiere aprobacion` is now only a mirror of `Ruta` (constitution §5). If it is
checked on a `VIERNES` row, the row is inconsistent: do not act, set `Ruta =
FDS` with the reason, and let Saturday surface it.

`Clase = datos` and `Clase = decision` are **never** Friday's to execute — they
are always `FDS`, and Friday only prepares them (Phase 3b). A row with no
`Clase` set is not eligible either — Friday classifies it, writes the value back,
and leaves it for next week. A row with no `Ruta` is not eligible and Friday
does not route it: routing is Monday's and Thursday's. Guessing the class is how
a data surgery gets run by a robot on a Friday morning.

**Friday checks the route, it does not set it.** If a `VIERNES` ficha looks
wrong against the rubric, Friday sets `Ruta = FDS` and writes which criterion
failed — it never moves a ficha *into* `VIERNES`.

**P0 is never Friday's**, regardless of class: it carries a refutation
requirement and a decision that belong to a live exchange. A P1 is Friday's only
under rubric V8.

**Friday may edit the operation itself only in its docs and preflight checks.**
Its rules, caps, eligibility, guardrails, roster and cadence are Santiago's
(rubric V9): a ficha that touches them is `FDS`.

### Caps, per run

- **5** `codigo` PRs.
- **1** `ddl_aditivo` migration. One. Not "one per finding".

If more qualify, take the highest `Severidad × Esfuerzo⁻¹` (P2 before P3, S
before M) and **say in the report how many were left and why**. Silent
truncation is a reporting failure here exactly as it is on Monday.

> **Why `codigo` went 3 → 5 (Santiago, 2026-09-11): «this run is intended to fix
> and clean the queue, not add to it».** The eligible set ran 6 → 8 → 9 across
> three consecutive Fridays against a fixed cap of 4 total, so the drain was
> losing to the fill — which defeats the entire reason the Friday run exists
> (constitution §3: *Monday and Thursday find; Friday finishes*). The deferred
> work was not marginal: the five left on 2026-09-11 were all P2, effort S,
> `Confianza: Alta` — ready work, not open questions.
>
> **The `ddl_aditivo` cap stays at 1, and raising it later would be a different
> argument.** That one is not a throughput limit: it is the blast radius of the
> single unattended production write the operation permits, and it is what makes
> the Phase 2 gates affordable per run. The same day the code cap rose, the adversarial
> review returned `unsafe` and stopped a migration that would have put an e-mail
> where the monthly report signs a name. One migration per run is what buys that
> scrutiny.
>
> **Five, and not more, for a concrete reason**: each `codigo` agent needs its own
> worktree (Phase 0 step 2b) and runs the full suite in it. Five is what the run
> has been observed to carry inside the 90-minute deadline with the verification
> gate intact. Raise it again only with a run that finishes early, not on appetite.

---

## Phases

**Phase 0 — Boot**

Identical to Monday (constitution §4), including the **tool preflight**, the
**dead-man check** and **step 2b (one `git worktree` per agent, one `npm ci`
before dispatch)** — non-negotiable here, because every Friday agent opens a PR
and the constitution requires lint, typecheck and the suite green before it does.
A shared checkout makes that gate unrunnable, which is how it gets skipped.

Plus one Friday-specific step:

- Read the open backlog from Notion and compute the eligible set above, and the
  set of `Ruta = FDS` fichas still `Not started`. **If both are empty, say so and
  stop.** A Friday with nothing to drain is the goal state, not a failure — go
  straight to Phase 4 (aging) and Phase 6. If only the eligible set is empty, go
  to Phase 3b.

**Phase 1 — Fix (`codigo` lane)**

One agent per finding, dispatched in parallel, each with the finding's full
evidence, `bug-triage.md` or `code-quality.md` as its brief, and its memory file.

Each agent must, in this order:

1. **Reproduce the defect first.** A failing test, a query with the wrong output,
   a rendered value that disagrees with the source. If it cannot reproduce, it
   returns `no_reproducible: true` with what it tried — and the finding goes to
   `Resolucion = Obsoleto`, never quietly "fixed".
2. Write the regression test **before** the fix, and confirm it fails.
3. Fix. Confirm the test passes and `npm run lint`, `npm run typecheck` and
   `npm test` are all green.
4. Push `claude/po-viernes-<slug>` and open one PR per finding.

**Phase 2 — Prepare and apply (`ddl_aditivo` lane). At most one per run.**

> **Option A (Santiago, 2026-09-27: "no Routine writes to the database") is
> REVOKED for `ddl_aditivo` only, by Santiago on 2026-10-26.** Record, reason
> and evidence (`escociaos-po/evals/README.md`): constitution §6. Under A this
> phase stopped before the apply, because in five Fridays the unattended write
> lane applied one migration and almost every permission change made to serve
> it left a new silent defect. That lesson is why every gate below is
> mandatory, and why a denied write is still an expected outcome, never
> something to route around. **Data writes (`UPDATE`/`DELETE`/`INSERT` of
> domain rows) stay forbidden here, even when pre-approved** (rubric V4).

Only for an eligible `ddl_aditivo` ficha (`Ruta = VIERNES`):

1. **Additive by allowlist, not by denylist — in syntax and in effect.** Every
   statement must be in the "Aditivo: sí es del viernes" column of the rubric's
   V5 table (`evals/rubrica-ruteo.md`): `CREATE TABLE` · `CREATE INDEX` /
   `CREATE UNIQUE INDEX` · `ALTER TABLE … ADD COLUMN` (nullable or constant
   `DEFAULT`) · `CREATE TABLE` together with `ENABLE ROW LEVEL SECURITY` on it ·
   `COMMENT ON` · a `DO $$ … $$` block whose only effect is `RAISE EXCEPTION`
   guards. The guard hook enforces exactly this column and nothing wider: see
   below. `CREATE FUNCTION`, `CREATE TRIGGER` and `ADD CONSTRAINT` are **not**
   Friday's — the hook cannot verify their effect — so they go to `FDS` as
   `datos`. **Removed from the pre-2026-10-26
   list on purpose:** `CREATE OR REPLACE FUNCTION` over an existing function
   (PR #222: it changes behaviour), `CREATE POLICY` / `ALTER POLICY` / `GRANT`
   / `REVOKE` and `ENABLE ROW LEVEL SECURITY` (they decide who has access —
   rubric V2a, PR #182). Anything outside the column means the ficha is not
   Friday's: set `Ruta = FDS` with the failed criterion, and leave it.
2. **Guards.** `RAISE EXCEPTION` pre- and post-conditions (080/081/099 style).
   No absolute row-count literal against a table a cron writes (the 103 lesson).
3. **Rehearse it, then review it.** Run the migration through `po_sonda`
   (constitution §6): the whole file as the preparation step, a post-state
   query as the consulta. It runs against real data and rolls back. A file
   with its own `BEGIN;`/`COMMIT;` fails inside the probe: remove those two
   lines from the rehearsal copy only, never from the file. Then the
   independent adversarial review, defaulting to "unsafe", gets the SQL, the
   live schema and the rehearsal result.
4. **Numbering**: `max()` over `src/sql/migrations/` **and** the ledger, and
   sweep the open branches (root CLAUDE.md, migration 144).
5. **Open the PR** with the migration file (full write mode only: the file must
   be in a PR before anything runs — the go rule, constitution §6). Write in the
   Notion finding the apply payload: tool, `ref`, `name`, `rollback`, the
   pre-state query, the expected post-state, and the reviewer's verdict.
6. **Apply — only if gates 1–5 all passed and the reviewer said "safe".** Run
   the pre-state query; it must still match. Then apply the file **verbatim**,
   transferred by content from the PR (constitution §6, the go rule), with:
   - `mcp__Supabase_Escritura__apply_migration`, if the Phase 0 preflight
     resolved it;
   - otherwise Composio `tool_slug: SUPABASE_APPLY_A_MIGRATION`,
     `account: supabase_bitis-coward` (alias `escocia-os`), `ref:
     ywhtjwawnkeqlwxbvgup`.

   Then run the post-state query and report both. If a guard aborts, report the
   abort — do not "fix" the guard to make it pass. Never more than one apply per
   run, and no other write tool, ever.

**The guard hook is the mechanical floor under these gates** (`.claude/hooks/supabase-guard.py`,
2026-10-26). In an unattended run it allows the apply only on a Friday (America/New_York),
on the production project, for a migration-shaped `name`, once per session, and only if
every statement of the SQL is in the rubric's "sí" column. A Composio apply must also be
the only item of its call. **If the apply is denied, that is a finding about the
migration, not a tool problem**: the reason names the failing condition. Record it under
NO CORRIÓ and continue. The PR and the payload stay as they are, and Saturday lists the
migration as "preparada, no aplicada" with `ESCO-NNN aplicar`. Never edit the SQL to slip
past the hook, and never look for another tool that would let it through. The hook spends
the session's one apply **before** the call runs, so a guard that aborts also ends the
lane for that run: report the abort, do not retry.

Monday's drift check still runs: it catches Friday's applied-but-unmerged
migrations, and also migrations applied by hand without their file on `main`
(150 and 157 were found that way).

**Friday never merges anything.** Not a doc fix, not a green PR, not its own
migration. Merging is Santiago's, always.

> **The deliberate consequence**: between the apply and the merge, production runs
> a schema whose file is not on `main`. That ordering was chosen knowingly
> (2026-08-21) to buy a cycle of speed. It is **not** free — Monday polices it,
> and a migration applied but unmerged for more than 7 days is a P1 against the
> operation. Friday's report must name every migration it left in that state.

**Phase 3 — Verify and file**

- Link each PR onto its Notion row and set `Estado = In progress`.
- For an applied migration, append to `Accion recomendada`: `aplicada a
  produccion YYYY-MM-DD, PR pendiente de fusion` plus the pre/post counts.
- A finding whose defect could not be reproduced → `Estado = Done`,
  `Resolucion = Obsoleto`, `Motivo cierre` = what was tried.
- **Deploy.** Friday cannot deploy the edge function: publishing is CLI-only
  (root `CLAUDE.md`, ESCO-148) and the connector publish path is banned. A PR
  that needs a deploy carries `requiere_deploy` (constitution §5) and says, in
  its body, whether the migration goes before or after the deploy. Saturday
  turns that into the merge-and-deploy order. Open item: a deploy-on-merge
  GitHub Action is being proposed to Santiago separately (constitution §6).

**Phase 3b — Preparar FDS** (2026-10-26)

For each `Ruta = FDS` ficha still `Not started`, write what Saturday needs so
Santiago only has to pick. By `Tipo FDS` (rubric step 4):

- `decision` — options A/B/(C), the consequence of each, and a recommendation.
  Lead with evidence, recommend, don't hedge (constitution §11).
- `datos` — the draft data migration as a file in a **draft PR**
  (`claude/po-fds-<slug>`), with `-- TODO(Santiago): …` wherever a value only he
  has is missing, plus its rollback and the pre-state query. It backs up to
  `respaldos` first (constitution §6) and takes its number from the same sweep
  as Phase 2 step 4. When no `TODO` is
  left, rehearse it in `po_sonda` and write the pre- and post-state. The PR
  exists because the go rule needs a file in a PR before anything runs; it is
  never merged before the apply, and it is not a fix, so it does not count
  against the caps.
- `propuesta` — what is proposed, what it costs, and the recommendation.
- `accion_externa` — the exact steps only he can do.

Write it into the ficha (`Accion recomendada`), and leave `Estado` and `Ruta`
as they are. **Never apply any of it**: no migration, no data write, no merge.
A `datos` draft with a `TODO` is not ready to apply — Saturday asks for the
missing value instead of offering `aplicar`.

**Phase 4 — Aging pass**

The reason the board grew. For every open `P2`/`P3` untouched for **60+ days**,
the report proposes `Resolucion = Aceptado (no se arregla)` with a one-line
rationale, in `REQUIERE TU DECISIÓN`, and sets the ficha to `Ruta = FDS`,
`Tipo FDS = decision`, so it reaches the Saturday report. **Friday proposes; it never accepts on
Santiago's behalf** — "we have decided not to fix this" is a judgement about his
product, not a maintenance action.

When he does accept one, the *next* run applies it: `Estado = Done`,
`Resolucion = Aceptado (no se arregla)`, `Motivo cierre` = his reason, **and a
line in the finder's memory ledger** so no future sweep re-files it. An accepted
finding that gets re-found next month means the ledger step was skipped.

**Phase 5 — Memory commit** — as Monday. Report to
`escociaos-po/reports/YYYY-MM-DD-viernes.md`.

**Phase 6 — Notify** — the §10 summary, with these Friday-specific lines:

```
DRENADO
- <n> hallazgos → PR abierto · <n> migraciones aplicadas · <n> cerrados por obsoletos
- quedan <n> elegibles sin tocar (cap del dia)

APLICADO SIN FUSIONAR
- migracion <NNN> → PR <url> — produccion ya la corre, main todavia no la tiene

PREPARADO PARA EL FDS
- ESCO-NNN · <tipo_fds> · <listo | falta tu dato: …>

REQUIERE DEPLOY
- PR <url> → <migracion antes | despues> del deploy
```

Saturday reads this report: keep these sections exact.

---

## Self-pruning rule

If **three consecutive Fridays** find an empty eligible set and no `FDS` ficha to
prepare, the report must open
`REQUIERE TU DECISIÓN` with a recommendation to move Friday to monthly, citing
the three run ids. Same principle as Thursday's: a routine that reliably has
nothing to do should say so rather than invent work. Track the streak in
`memory/_compartida.md`.

## Failure handling

Same as Monday and Thursday, and the unattended-run rules of constitution §7 bind
hardest here: **never wait on a permission prompt, and never end without writing
the report.** A Friday that fixed three things and filed none of them has done
worse than a Friday that did nothing.
