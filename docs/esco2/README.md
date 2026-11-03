# Esco 2.0 — E2-03 / E2-17 design handoff

Date: 2026-11-03. Status: reviewable local design, **not production implementation or architecture acceptance**.
Owner for these deliverables: Codex; coordination: Dotor. Initial baseline: `a635a05`; reconciled local baseline: `43c3e887` (see review report).
Branch: `codex/esco2-e203-e217-design`; isolated worktree: `/workspace/esco2-e203-e217`.

Sources, in priority order:

- [Master plan v0.3](https://app.notion.com/p/40d67755ed6881dba866f9775fca997e).
- [PRD v0.3](https://app.notion.com/p/40d67755ed68803e8c37e928d0b31860).
- [E2-03](https://app.notion.com/p/40d67755ed6881f2aac0c34906e46234) and [E2-17](https://app.notion.com/p/40d67755ed6881eba1a3db25cafe5287).

The delegation authorizes local synthetic preparation. It does not authorize providers, real data, credentials, persistent access, production, publication or deployment. Residual v0.2 statements do not override v0.3: dairy replaces beef cattle; soil conductivity is in scope; the old engine stays frozen until M7; M2.5 precedes M3; held-out stays independent.

Deliverables:

1. [Architecture and review budget](architecture.md): contracts, isolation, permissions, limits, stage gates and tests.
2. [Comparison protocol and eligibility evidence](comparison-protocol.md): route A versus B, external control requirements and measurements.
3. [Draft operation registry](../../analysis/esco2-design/operations.json): one executable schema source for a narrow labor operation.
4. [Offline contract checks](../../analysis/esco2-design/check_contracts.py): schema, semantic boundaries and synthetic reconciliation. No network or environment credential access.
5. [Direct boundary preparation](direct-preparation.md): executable synthetic permission probe and 15 adversarial policy checks (19 checks with registry), with explicit limits and snapshot dependencies.
6. [Independent review and baseline reconciliation](review-and-baseline.md): four probe findings, corrections, remaining evidence and exact main comparison.

Run the offline check with `python analysis/esco2-design/check_contracts.py` (Python 3 and jsonschema 4.26.0 in this environment). This is a design probe. It is not a Supabase, JWT, RLS, model, planner, web or acceptance test. Nothing imports it from the application.

Current gates: the standard route A tool **fails eligibility** (see protocol v0.2 evidence); route B preparation continues, with controls **unverified against an authorized database**. E2-17 is in review for documented incapacity, and M2 remains open. M1 references/snapshot, E2-06 access/data handling, review budget and explicit architecture decision remain necessary. No production route activated.

The independent inventory received from coordination uses `main` `43c3e887`; see architecture.md for its qualification candidates. The branch now descends from that exact target after a conflict-free local rebase and unchanged range-diff. This is not a claim about any newer main or product integration readiness.

Only `docs/esco2/` and `analysis/esco2-design/` belong to this handoff. Other fronts retain their files and owners. Do not inspect private golden or held-out here. Do not start M2.5 or product wiring from this branch.
