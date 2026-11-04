# Esco 2.0: handoff for a fresh local Astra architecture review

Date: 2026-11-04 (America/New_York). Start here. This is public, aggregate-only evidence.
Santiago requested publication of the current public work to `main` and a fresh local
session on Astra to propose a plan. The next assignment is diagnosis and planning.

## Reading order

1. This handoff, then `d31-result-2026-11-04.md`, including its source and comparison limits.
2. Root `CLAUDE.md`: Esco 2.0, migrations, deployment, calendar and safety rules.
3. `m2-diseno.md`, `m3-funcion.md`, `m3-rls.md`, `m4-labores.md`, `m1-dominios.md`.
   These explain earlier designs; their historical status labels do not override this handoff.
4. Current tracked core, source adapter, closed registry, prompts, composer, numeric guard,
   handler, and synthetic tests. Inspect the actual contracts across those boundaries.
5. Notion PRD `40d67755ed68803e8c37e928d0b31860`, master plan
   `40d67755ed6881dba866f9775fca997e`, and tracker data source
   `40d67755-ed68-8031-b80a-000bdbf15c76`. Prefer current decisions and dated evidence over
   stale status summaries. Bot Log task is BL-64.

Do not read either independent evaluator's session logs. Do not open private evaluation
inputs, cases, references, answers, per-case reviews or traces. The previous public
`d31-aggregate-2026-11-04.md` is a superseded preflight, not the completed result.

## Verified current state

- PR #412 merged as `b075feac`; PR #413 merged as
  `0596352606345e34c06900b43fe09bfa98a13371`. Do not reapply their changes.
- `esco-consultas` was redeployed with explicit approval as **v2**, from clean `30fb26e5`
  whose deployable source was identical to `05963526`. Live metadata was `ACTIVE`,
  `verify_jwt = true`; anonymous health returned **401**.
- Real sessions were exercised against v2 in the ChatGPT browser: active **Gerencia 200**
  with a composed answer; **Administrador 403** with the function's Gerencia-only message.
  These were access/execution checks, not independent numerical certification.
- The production web chat still calls the legacy `make-server-1ccce916/chat/message`.
  Deploying v2 did not connect the production chat to it. Legacy function remained v295;
  Telegram was not changed.
- `/esco2-prueba` is a **development-only** diagnostic screen. It reuses login, sends the
  current session JWT directly to v2, displays actual HTTP and outcome, and clears results
  across account changes. Logout is scoped to the local session. No automatic model calls.
  The entire screen/route/client is excluded from the production build.
- The browser helper is `src/utils/esco2ClientePrueba.ts`, outside `src/utils/esco2/` so
  publishing frontend diagnostics does not falsely signal backend deployment drift.
- Migration 190 is recorded as written/rehearsed. This session did not apply it or query
  its live ledger. Any application needs separate approval and ledger verification.
- There is no per-user spending cap/rate limit in the function. This remains a pilot gate.

## D31: execution complete, acceptance rejected

The final run used a new local evaluator without this implementation conversation, after
explicit approval for all-five-domain question transmission through the existing OpenRouter
route. The initial blocked preflight is excluded from the measurements.

- Same **50 frozen scenarios**, two configurations, three repetitions: **300/300 attempts**,
  **324/324 turns**, all reviewed; **403 provider calls** with known costs and no provider
  errors, truncations or retries.
- Evaluated core/harness: `05963526`; tracked source and immutable inputs matched before
  and after. No core, prompt, reference or rubric tuning during the run.

| Configuration | Full-set full rubric | Full rubric on answerable attempts | Critical attempts, full set |
|---|---:|---:|---:|
| Luna, reasoning none | 10/150 (6.7%) | 6/135 (4.4%) | 10 |
| Sol, reasoning low | 16/150 (10.7%) | 13/135 (9.6%) | 13 |

Paired labor subset only: Luna full rubric **11/30 → 9/30**, critical attempts **9 → 8**;
Sol **12/30 → 16/30**, critical attempts **3 → 9**. The historical executed baseline covered
only 10 labor scenarios, not all 50. Automatic scorer versions differ, so their numerical
before/after differences are descriptive, not a same-scorer causal estimate.

There were **208/300 pure unsupported refusals**. They remain coverage failures for
in-scope product questions. The unchanged historical execution snapshot lacks scheduling/
real-date and application-association fields available in independent reference material.
This run therefore cannot isolate model behavior from source-integration limitations.
Do not send reference values into the execution input to conceal this mismatch.

Additional observed provider spend: **USD 0.494003265**, within the explicit **USD 0.7718**
allowance. Combined held-out ledger: **USD 0.722163440** of USD 1. This is observed local
receipt accounting, not a new provider-billing reconciliation or an approval for another run.
Raw evidence was preserved outside `build/` by the evaluator, private and git-ignored;
**78/78 copied hashes matched**. Implementers must not inspect that directory.

The existing product criterion is at least 90% complete/correct on answerable questions,
essentials passing, zero critical failures, and inconclusive references preventing closure.
The measured results do not meet it. Access checks and unit-test totals do not override it.

## Astra assignment

Santiago's hypothesis is that Esco 2.0 is structurally wrong. Challenge that hypothesis as
well as the current design. Produce a source-backed diagnosis and a concrete plan before
implementation. The aggregate results warrant review; they do not establish that every
component should be discarded.

Separate at least four questions:

1. **Source and integration contract:** what each operation can actually read, field
   availability, NULL versus unknown versus verified absence, completeness, historical
   snapshots versus live readers, and independent reference provenance.
2. **Planning and execution semantics:** entity/cohort resolution, dates, grouping/ranking,
   reconciliation, exclusions, estimates, multi-part questions and follow-up state.
3. **Answer evidence:** whether a number belonging somewhere in the evidence is sufficient
   to support the specific claim made, and how sets, scope, associations and omissions are
   validated outside the model.
4. **Coverage and acceptance:** implemented labor capabilities versus five-domain product
   scope; meaningful end-to-end tests and how to evaluate against execution-complete data
   without training on the held-out or changing its immutable references.

Compare a bounded repair of the existing architecture, a redesign of its contracts/
orchestration, and a broader replacement if justified. State what survives and why, trade-offs,
source evidence, uncertainties, failure risks and the smallest discriminating experiment.
Do not assume that a larger model, more prompt rules, a new framework or another rewrite
will resolve the measured defects.

Deliver `docs/esco2/astra-recovery-plan-2026-11-04.md`: recommendation, alternatives,
diagram of the proposed flow, phased tasks/dependencies, validation gates, effort assumptions,
rollback/isolation requirements, budget and explicit decisions Santiago must make. Distinguish
facts, hypotheses and proposed changes. A plan is not approval to implement or release it.

## Boundaries and publication

- Repository is public. Golden sets, snapshots, scenarios, answers, keys and raw traces stay
  private and ignored. **D17 remains binding for Astra:** aggregate evidence and synthetic
  fixtures only; never open `docs/Esco 2.0/heldout/` or its Google Sheet.
- No deployment, migration, secret change, new production read, paid model campaign or pilot
  is authorized by the architecture-planning request. Any such action needs its own scope.
- Do not touch `chat.tsx`, either legacy server tree or Telegram. Preserve field capture.
- Calendar operations use Bogotá time and the shared calendar utility; do not infer today
  from a UTC ISO date slice.
- Never print keys or tokens. Production reads, if later approved, use the approved read-only
  Composio route with explicit `escocia-os` account. Do not weaken caller-JWT/RLS gates.
- New implementation branches start from current `main`, one PR per task. Do not edit an
  applied migration. Git author: `thinksid <thinksid@users.noreply.github.com>`.
- This publication packages the access diagnostic, aggregate reports, documentation and
  handoff. It does not deploy a new backend or apply a migration. A push to `main` triggers
  the repository's normal CI/Vercel integration; inspect its resulting status separately.
- The handoff/publication commit is the commit introducing this file. Verify the remote
  `main` tip when starting Astra; do not assume an unpublished local commit reached GitHub.

## Validation completed before publication

After moving the helper outside the backend watch path, validation passed: **296 files,
7,190 tests**, typecheck and production build. Lint had **0 errors and 907 existing warnings**.
Production JavaScript contains none of the local route, screen label or direct test-client
endpoint markers. The earlier real Gerencia/Administrador browser checks exercised the same
request behavior; the relocation changed its module path, not its endpoint or authorization.
Independent publication QA found no remaining blockers and confirmed the 12-file public
allowlist. No backend-watch source was changed. Final remote publication/CI evidence belongs
in BL-64 and the originating chat; check the remote tip rather than assuming it. No private
material is included in this handoff.
