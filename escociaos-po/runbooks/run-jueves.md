# Runbook — Corrida del jueves (pulso operativo)

**Cadence**: Thursdays 07:00 America/New_York · **Agents**: 4 ·
**Expected duration**: 15–30 min.

Thursday exists so a problem that starts Monday afternoon does not sit until the
following Monday. It should usually be quiet. **A short Thursday report is the
goal, not a failure** — padding it trains Santiago to stop reading it.

Roster: `data-integrity` (72h scope) · `infra-perf` · `bug-triage` ·
`release-changelog`. Security & Compliance runs Mondays only — advisors and RLS
do not change twice a week.

---

## Phases

Same protocol as Monday (constitution §4) with these narrowings:

**Phase 0** — identical boot (clone, contracts, write mode, dead-man check,
dedupe set). Run id `YYYY-MM-DD-jueves`.

**Phase 1** — 4 agents, each explicitly scoped to **what changed since Monday**:

- `data-integrity` — **the last 72 hours of writes only**, not a full sweep.
  New chequeos, pesajes, movimientos, gastos: orphans, duplicates, impossible
  values.
- `infra-perf` — deploys since Monday, new runtime-error signatures, the clima
  cron's last 3 days, edge-function errors.
- `bug-triage` — new error signatures; anything Monday filed as P0/P1 that is
  still open gets a status check, not a re-investigation.
- `release-changelog` — what shipped since Monday; close findings whose PRs
  merged and deployed.

**Phase 2–6** — identical: refute every P0/P1, consolidate (cap **5** new
findings on Thursdays), act only in full write mode, file + memory commit,
notify with the §10 summary.

---

## Self-pruning rule

If this is the **third consecutive Thursday with zero new findings**, the
report's `REQUIERE TU DECISIÓN` section must open with a recommendation to
cancel the Thursday routine, with the three quiet run ids as evidence. Track
the streak in `memory/_compartida.md`.

## Failure handling

Same as Monday: one agent failing never kills the run; label it under
**NO CORRIÓ** and continue.
