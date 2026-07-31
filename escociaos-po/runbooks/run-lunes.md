# Runbook — Corrida del lunes (barrido semanal)

**Cadence**: Mondays 07:00 America/New_York · **Agents**: 6 weekly, **8 on the
first Monday of the month** · **Expected duration**: 30–60 min.

The Monday run is the strategic one. It answers *how is the system doing* and
*what should this week be about*, not just *what broke*.

Weekly roster: `data-integrity` · `security-compliance` · `infra-perf` ·
`bug-triage` · `usage-analytics` · `release-changelog`.
First Monday of the month adds: `feature-strategy` · `code-quality`.

---

## Phase 0 — Boot

1. Run id: `YYYY-MM-DD-lunes`.
2. Clone: `git clone --depth 50 https://github.com/sforero94/Escociaos.git /tmp/escociaos`.
   `npm ci` only if PRs are on the menu this run (lint/typecheck/test gate).
3. Read `/tmp/escociaos/CLAUDE.md` in full (technical contract), then
   `/tmp/escociaos/escociaos-po/CLAUDE.md` (this operation's constitution) if
   you have not already — the bootstrapper prompt sent you here.
4. Resolve **write mode** (constitution §7). Cloud sessions: the claude.ai
   GitHub integration is the push path; verify with the memory commit, not with
   a throwaway ref.
5. **Dead-man check**: latest `Corrida` in Notion / newest file in
   `escociaos-po/reports/`. Gap > 8 days → P1 finding against the operation.
6. Query Notion `collection://b22d2385-a812-4d4a-8094-cefa9d080f60` for every
   finding with Estado ≠ Done → the **dedupe set** (pass title + module +
   severity to every agent).

## Phase 1 — Fan out (parallel, one message)

Dispatch with `subagent_type: "general-purpose"`, each prompted with its full
brief (`.claude/agents/<name>.md`) **+ its memory file**
(`escociaos-po/memory/<name>.md`, plus `_compartida.md`) + the run context (run
id, repo path, Supabase ref `ywhtjwawnkeqlwxbvgup`, Notion data source id,
write mode, standing priorities, dedupe set):

`data-integrity` · `security-compliance` · `infra-perf` · `bug-triage` ·
`usage-analytics` — then, on first Mondays, `feature-strategy` after Usage
Analytics returns (it needs those numbers) alongside `code-quality`.

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

## Phase 4 — Act (full write mode only)

Bug Triage: up to 5 PRs. Code Quality (first Mondays): up to 2. One finding per
PR, all checks green, branch `claude/po-<especialidad>-<slug>`. Nothing marked
`requiere_aprobacion` becomes a PR.

## Phase 5 — File and remember

- Notion row per finding (constitution §5, Estado = `Not started`).
- Apply validated `memoria_deltas` to `escociaos-po/memory/` and write the run
  report to `escociaos-po/reports/YYYY-MM-DD-lunes.md`; commit both together
  directly to `main` — **only** those paths (constitution §6/§8).

## Phase 6 — Notify

End the session with the §10 summary — the Routine's push + email carries the
final message. Lead with the Spanish executive summary and the decisions
Santiago owns this week.

---

## Monday-specific emphasis

- **Hato Lechero rollout** gets the deepest look: adoption, capture friction,
  correction rates, what is left to finish the module.
- **Week-over-week deltas** on every priority module, against the baselines in
  each agent's memory file — Monday is the only run that establishes trend.
- **Feature Strategy** (first Mondays) publishes at most 3 proposals, and is
  expected to recommend *finishing* over *starting* most weeks.
- On first Mondays, Release & Changelog adds the cadence signal: commits/week,
  fix-vs-feature ratio, merge-to-deploy lag.

## Failure handling

Never let one agent's failure kill the run. If an agent errors or a tool is
unavailable, record it under **NO CORRIÓ** with the reason and continue. A
partial sweep honestly labelled is useful; a partial sweep presented as complete
is not.
