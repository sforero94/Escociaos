# Runbook — Corrida del jueves (features, recomendaciones y sonda P0)

**Cadence**: Thursdays 07:00 America/New_York · **Agents**: 4, **5 on the first
Thursday of the month** · **Expected duration**:
`<<por definir: medir en las primeras corridas del ciclo 2026-10-26>>`.

**Thursday's job changed on 2026-10-26** (decision of Santiago, constitution §3).
It used to be an operational pulse; now it is the day for **new features and
recommendations**. Monday is health; Thursday looks forward. It keeps one piece
of the old pulse — a minimal P0-only probe — because the reason Thursday existed
still holds: a problem that starts on Tuesday must not sit until the following
Monday.

Roster:
- **Weekly:** `usage-analytics` · `feature-strategy` (after Usage Analytics
  returns — it needs those numbers).
- **First Thursday of the month adds:** `code-quality`.
- **P0 probe, weekly:** `infra-perf` · `data-integrity`, both scoped to "since
  Monday" and to P0-class signals only.

Security & Compliance runs Mondays only — advisors and RLS do not change twice a
week. Bug Triage and Release & Changelog left Thursday on 2026-10-26.

---

## Phases

Same protocol as Monday (constitution §4) with these narrowings:

**Phase 0** — identical boot (clone, contracts, write mode, dead-man check,
dedupe set). Run id `YYYY-MM-DD-jueves`.

> **Including step 2b: one `git worktree` per agent, `npm ci` once before dispatch.**
> This is the run that proved why. On 2026-09-10 the four agents shared a checkout,
> so `npm test` was forbidden to them — and a `main` that had been red since
> 2026-09-09 went unreported through a complete operational pulse. **Thursday must
> never again dispatch a roster that cannot run the suite.**

**Phase 1** — fan out:

- `usage-analytics` — who uses what, adoption, drop-off, dead features,
  data-capture behaviour. Hato Lechero adoption and capture friction live here
  now (they moved from Monday).
- `feature-strategy` — **at most 3 proposals**, ranked and spec'd, grounded in
  observed friction. It is expected to recommend *finishing* over *starting*
  most weeks.
- `code-quality` (first Thursday only) — dead code, duplication, test gaps,
  typing debt, dependency staleness.
- **P0 probe** — `infra-perf` and `data-integrity`, **since Monday's run only**,
  reporting **only P0-class signals**: a broken deploy, a dead cron or engine,
  impossible data written in the last 72 hours. Anything below P0 they notice is
  not this run's: they leave it for Monday. A quiet probe is the goal state.

**Phase 2** — identical: refute every P0/P1 before it is filed.

**Phase 3** — consolidate, cap **5** new findings on Thursdays.

**Phase 4 — no PRs.** Thursday files; Friday executes. Route every finding with
`evals/rubrica-ruteo.md` (constitution §5), and split mixed findings at filing
time (rubric R5):
- **A P0 from the probe** → `Ruta = P0_AHORA`. It leads the final message
  (constitution §10). Thursday files no P0 fix: the fix happens with Santiago.
- **Important items** (every feature-strategy proposal, any recommendation that
  needs his judgement) → `Ruta = FDS`, `Tipo FDS = propuesta`. He answers `si`
  or `no` on Saturday.
- **Minor items** the rubric lets Friday do alone → `Ruta = VIERNES`.

**Phase 5–6** — identical: file + memory commit, then the Bot Log row
(constitution §4 Phase 5b) as the last write, then notify with the §10 summary.

---

## Self-pruning rule

Rewritten 2026-10-26 for the new role. The old rule (three Thursdays with zero
findings → cancel) measured a pulse; a quiet pulse is now the P0 probe's job,
and a quiet probe is good news. What Thursday produces now is proposals, so it
is judged by whether they are worth Santiago's Saturday.

If this is the **third consecutive Thursday with no proposal Santiago answered
`si`** (all answered `no`, or none filed), the report's `REQUIERE TU DECISIÓN`
section must open with a recommendation to move `feature-strategy` and
`usage-analytics` to the first Thursday of the month, with the three run ids as
evidence. **The P0 probe is never part of the recommendation.** Read the answers
from Notion (`Tipo FDS = propuesta` rows of the last three `Corrida`s). Track the
streak in `memory/_compartida.md`.

## Failure handling

Same as Monday: one agent failing never kills the run; label it under
**NO CORRIÓ** and continue. If the P0 probe could not run, say so on the first
line of NO CORRIÓ: a silent probe and a dead probe must never look the same.

The unattended-run rules of constitution §7 bind here in particular: **never
wait on a permission prompt**, and **write the report before the session can end
for any reason**. The Thursday run of 2026-08-13 died on a permission prompt with
work in hand and filed nothing; the report a week later then misdiagnosed it as
the Routine never firing. It fired.
