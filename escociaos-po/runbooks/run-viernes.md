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

---

## What Friday may touch

Eligibility is mechanical. A finding qualifies **only** if every one of these
holds — no judgement calls, no "close enough":

| Field | Required value |
|---|---|
| `Severidad` | `P2 — Medio` or `P3 — Bajo` |
| `Estado` | `Not started` |
| `Confianza` | `Alta` |
| `Requiere aprobacion` | unchecked |
| `Clase` | `codigo` or `ddl_aditivo` |

`Clase = datos` and `Clase = decision` are **never** Friday's. A row with no
`Clase` set is not eligible either — Friday classifies it, writes the value back,
and leaves it for next week. Guessing the class is how a data surgery gets run by
a robot on a Friday morning.

**P0 and P1 are never Friday's**, regardless of class. They carry a refutation
requirement and a decision that belong to a live exchange.

### Caps, per run

- **3** `codigo` PRs.
- **1** `ddl_aditivo` migration. One. Not "one per finding".

If more qualify, take the highest `Severidad × Esfuerzo⁻¹` (P2 before P3, S
before M) and **say in the report how many were left and why**. Silent
truncation is a reporting failure here exactly as it is on Monday.

---

## Phases

**Phase 0 — Boot**

Identical to Monday (constitution §4), including the **tool preflight** and the
**dead-man check**, plus one Friday-specific step:

- Read the open backlog from Notion and compute the eligible set above. **If it
  is empty, say so and stop.** A Friday with nothing to drain is the goal state,
  not a failure — go straight to Phase 4 (aging) and Phase 6.

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

**Phase 2 — Migrate (`ddl_aditivo` lane)**

This is the only unattended write the operation makes anywhere. It is bounded by
five gates, and **every one must pass or the migration is not applied**:

1. **Additive by allowlist, not by denylist.** Every statement in the migration
   must begin with one of: `CREATE TABLE` · `CREATE INDEX` / `CREATE UNIQUE
   INDEX` · `CREATE OR REPLACE FUNCTION` · `CREATE TRIGGER` · `CREATE POLICY` ·
   `ALTER POLICY` · `ALTER TABLE … ADD COLUMN` · `ALTER TABLE … ADD CONSTRAINT` ·
   `ALTER TABLE … ENABLE ROW LEVEL SECURITY` · `GRANT` · `REVOKE` · `COMMENT ON`
   · a `DO $$ … $$` block whose only effect is `RAISE EXCEPTION` guards.
   Anything else — any `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, `ALTER COLUMN …
   TYPE`, `DROP POLICY` — means the change is **not** `ddl_aditivo`. Reclassify
   the finding and leave it. Do not "mostly" pass this gate.
2. **Guards.** The migration carries its own `RAISE EXCEPTION` pre- and
   post-conditions, in the style of 080/081/099. **No absolute row-count literal
   may be written into a migration that runs against a table a cron writes** —
   capture the starting count and check it against itself. That lesson cost the
   103 a whole day (see the 2026-08-20 report).
3. **Independent adversarial review.** A second agent, which did not author the
   migration, is prompted to **refute that it is safe to apply unattended** and
   defaults to "unsafe" when uncertain. It gets the SQL and the live schema, not
   the author's reasoning. Its specific job is to find the case where an
   "additive" statement is not: a `CREATE OR REPLACE FUNCTION` that changes live
   behaviour, a `REVOKE` that breaks an RLS policy that calls the function
   (§082), an `ADD CONSTRAINT` that existing rows violate.
4. **Numbering.** Next sequential number, taken as `max()` over the filenames in
   `src/sql/migrations/` **and** `supabase_migrations.schema_migrations` — the
   ledger is not authoritative and neither is a superset of the other (root
   CLAUDE.md). Never reuse, never renumber an existing file.
5. **Byte fidelity.** The SQL that runs is transferred **by content** from the
   file pushed to the branch (base64 the file, decode, apply in one atomic
   statement). Never retyped. The bytes that run must provably be the bytes in
   the PR.

Then: capture the pre-state → apply via `mcp__Supabase_Escritura__apply_migration`
→ verify the post-state with an explicit query through the **read-only**
connector → report both. **If a guard aborts, report the abort.** Never edit the
guard to make it pass.

Then push the branch and open the PR containing the migration file.

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

**Phase 4 — Aging pass**

The reason the board grew. For every open `P2`/`P3` untouched for **60+ days**,
the report proposes `Resolucion = Aceptado (no se arregla)` with a one-line
rationale, in `REQUIERE TU DECISIÓN`. **Friday proposes; it never accepts on
Santiago's behalf** — "we have decided not to fix this" is a judgement about his
product, not a maintenance action.

When he does accept one, the *next* run applies it: `Estado = Done`,
`Resolucion = Aceptado (no se arregla)`, `Motivo cierre` = his reason, **and a
line in the finder's memory ledger** so no future sweep re-files it. An accepted
finding that gets re-found next month means the ledger step was skipped.

**Phase 5 — Memory commit** — as Monday. Report to
`escociaos-po/reports/YYYY-MM-DD-viernes.md`.

**Phase 6 — Notify** — the §10 summary, with two Friday-specific lines:

```
DRENADO
- <n> hallazgos → PR abierto · <n> migraciones aplicadas · <n> cerrados por obsoletos
- quedan <n> elegibles sin tocar (cap del dia)

APLICADO SIN FUSIONAR
- migracion <NNN> → PR <url> — produccion ya la corre, main todavia no la tiene
```

---

## Self-pruning rule

If **three consecutive Fridays** find an empty eligible set, the report must open
`REQUIERE TU DECISIÓN` with a recommendation to move Friday to monthly, citing
the three run ids. Same principle as Thursday's: a routine that reliably has
nothing to do should say so rather than invent work. Track the streak in
`memory/_compartida.md`.

## Failure handling

Same as Monday and Thursday, and the unattended-run rules of constitution §7 bind
hardest here: **never wait on a permission prompt, and never end without writing
the report.** A Friday that fixed three things and filed none of them has done
worse than a Friday that did nothing.
