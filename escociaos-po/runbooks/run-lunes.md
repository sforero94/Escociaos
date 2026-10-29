# Runbook — Corrida del lunes (barrido semanal)

**Cadence**: Mondays 07:00 America/New_York · **Agents**: 5 weekly ·
**Expected duration**: 30–60 min.

**The Monday run is the health one** (cycle of 2026-10-26, constitution §3). It
answers *how is the system doing* and *what broke*. New features and
recommendations moved to Thursday: usage-analytics weekly, feature-strategy and
code-quality off the first Monday.

Weekly roster: `data-integrity` · `security-compliance` · `infra-perf` ·
`bug-triage` · `release-changelog`.

**Where each finding goes.** A P0 is notified at once: the run's final message
and push lead with it (Phase 6). Everything else goes to the ledger with a
`Ruta`, set by `evals/rubrica-ruteo.md`: `VIERNES` if Friday can do it alone,
`FDS` if it needs Santiago.

---

## Phase 0 — Boot

1. Run id: `YYYY-MM-DD-lunes`.
2. Clone: `git clone --depth 50 https://github.com/sforero94/Escociaos.git /tmp/escociaos`.
   `npm ci` only if PRs are on the menu this run (lint/typecheck/test gate).

   **2b. One worktree per agent — do this BEFORE dispatching anyone.** Agents that
   share a single checkout cannot run the suite: installing dependencies moves the
   tree under everyone else, so the mitigation becomes *turning the tests off*, and
   a roster that cannot run the tests cannot see a red `main`. That is not
   hypothetical — it is how `main` sat red for two days across a full Thursday
   review (finding #92, 2026-09-11), and it is the read-side twin of #85.

   ```sh
   npm ci                                   # ONCE, in the main checkout, before dispatch
   for a in <agent-slugs>; do
     git worktree add -b claude/po-$a "$SCRATCH/wt/$a" origin/main
     ln -s "$PWD/node_modules" "$SCRATCH/wt/$a/node_modules"
   done
   ```

   Each agent gets its own worktree path and its own branch. **Forbid them to `cd`
   outside it, and to run `git checkout` / `switch` / `reset --hard`** — those are
   what move the tree under a sibling. The symlinked `node_modules` is what makes
   one `npm ci` serve everyone.

   Measured cost on 2026-09-11: one `npm ci` (~2 min) plus four `git worktree add`
   (seconds). In exchange, four agents ran lint, typecheck and the full suite in
   parallel without colliding, and the two-day-old red surfaced in the first five
   minutes of the run.

   Clean up with `git worktree remove --force <path>` then `git worktree prune`.
3. Read `/tmp/escociaos/CLAUDE.md` in full (technical contract), then
   `/tmp/escociaos/escociaos-po/CLAUDE.md` (this operation's constitution) if
   you have not already — the bootstrapper prompt sent you here.
4. Resolve **write mode** (constitution §7). Cloud sessions: the claude.ai
   GitHub integration is the push path; verify with the memory commit, not with
   a throwaway ref.
5. **Tool preflight** (constitution §4): resolve every tool this run depends on
   against the list in `memory/_compartida.md`. A missing or renamed tool is a
   P1 against the operation and its specialty is NO CORRIÓ.
6. **Dead-man check**: latest `Corrida` in Notion / newest file in
   `escociaos-po/reports/`. Gap > **5 days** → P1 finding against the operation.
   (Lowered from 8 on 2026-08-21: the 08-13 → 08-20 gap was exactly 7 days and
   slipped underneath the old threshold, so two dead runs produced no signal.)
   **A run that exists but filed nothing counts as a dead run** — check for a
   report file, not just for a session.
7. **Migration drift check** — Monday owns this because Friday creates it.
   For every migration in `src/sql/migrations/` recorded as applied to
   production, confirm its file is on `main`. Friday applies before merging by
   design, so a short window is expected; **more than 7 days unmerged is a P1
   against the operation.** Cross-check `supabase_migrations.schema_migrations`
   against the live catalog (`pg_proc`, `pg_trigger`, `information_schema`) —
   the ledger is not authoritative and neither list is a superset of the other.
8. Query Notion `collection://b22d2385-a812-4d4a-8094-cefa9d080f60` for every
   finding with Estado ≠ Done → the **dedupe set** (pass title + module +
   severity to every agent). Also load everything with
   `Resolucion = Aceptado (no se arregla)` or `Refutado` and pass it as a
   **do-not-refile set** — an accepted finding that comes back next month means
   the ledger step was skipped.
9. Apply any `Aceptado` decisions Santiago made since the last run: `Estado =
   Done`, `Resolucion = Aceptado (no se arregla)`, `Motivo cierre` = his reason,
   **and** a line in the finder's memory ledger.

## Phase 1 — Fan out (parallel, one message)

Dispatch with `subagent_type: "general-purpose"`, each prompted with its full
brief (`.claude/agents/<name>.md`) **+ its memory file**
(`escociaos-po/memory/<name>.md`, plus `_compartida.md`) + the run context (run
id, repo path, Supabase ref `ywhtjwawnkeqlwxbvgup`, Notion data source id,
write mode, standing priorities, dedupe set):

`data-integrity` · `security-compliance` · `infra-perf` · `bug-triage`.

`release-changelog` runs **last**, after everything else, so it can close out
PRs opened this run.

## Phase 2 — Adversarial verification

For every **P0 and P1**: dispatch an independent verifier prompted to *refute*
the finding, defaulting to refuted when uncertain. Give it the evidence and the
repo, not the finder's reasoning. Kill refuted findings **and ledger them in the
finder's memory file**. Downgrade to `confianza: Media` anything it can neither
confirm nor refute.

**No P0 or P1 reaches Notion without surviving this.**

## Phase 3 — Consolidate

Merge overlapping findings across agents (Data Integrity ↔ Bug Triage ↔ Infra
collide most). Update existing Notion rows rather than duplicating. Cap at 12
new findings; if more survive, keep the highest severity × confianza and
**state how many were dropped**.

## Phase 4 — Route, no PRs (since 2026-10-26)

**Monday opens no PRs.** It files and routes; Friday executes (constitution §3).
A `VIERNES` finding found on Monday waits four days for Friday, on purpose: one
day does the work, with its worktrees, caps and gates, and the board is never
half-fixed by two runs at once.

**Set `Clase` and `Ruta` on every finding filed this run** (constitution §5),
`Tipo FDS` too when the route is `FDS`. Apply `evals/rubrica-ruteo.md` step by
step; do not restate or shortcut it. A finding whose fix mixes classes is split
into one ficha per part (rubric R5) before filing. `Ruta` is what makes a
finding eligible for the Friday drain, and an unrouted one just waits. Monday
is where the backlog's throughput is decided.

**First Monday after `Ruta` exists in Notion:** route every open row filed
before 2026-10-26 the same way, and write `Ruta`/`Tipo FDS` back.

## Phase 5 — File and remember

- Notion row per finding (constitution §5, Estado = `Not started`).
- Apply validated `memoria_deltas` to `escociaos-po/memory/` and write the run
  report to `escociaos-po/reports/YYYY-MM-DD-lunes.md`; commit both together
  directly to `main` — **only** those paths (constitution §6/§8).

## Phase 5b — Bot Log

The last write of the run, after the memory commit is pushed: one new Bot Log
row for `YYYY-MM-DD-lunes`, through the official Notion connector (constitution
§4 Phase 5b). `Siguiente paso` names what Thursday or Friday picks up. If the
write fails, its text goes in the final message under `NO CORRIÓ` as
`Bot Log — sin guardar`.

## Phase 6 — Notify

End the session with the §10 summary — the Routine's push + email carries the
final message. **If a P0 was filed, it leads**, above the executive summary
(constitution §10). Then the Spanish executive summary. Decisions for Santiago
are no longer asked here: they go to the ledger as `FDS` and reach him in the
Saturday report.

---

## Monday-specific emphasis

- **Hato Lechero rollout** gets the deepest health look: correctness, capture
  errors, correction rates. Adoption and friction moved to Thursday with
  usage-analytics (2026-10-26).
- **Week-over-week deltas** on every priority module, against the baselines in
  each agent's memory file — Monday is the only run that establishes the health
  trend.
- On first Mondays, Release & Changelog adds the cadence signal: commits/week,
  fix-vs-feature ratio, merge-to-deploy lag.

## Failure handling

Never let one agent's failure kill the run. If an agent errors or a tool is
unavailable, record it under **NO CORRIÓ** with the reason and continue. A
partial sweep honestly labelled is useful; a partial sweep presented as complete
is not.
