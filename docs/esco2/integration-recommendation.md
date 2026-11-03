# E2-03 — bounded integration recommendation

2026-11-03. Preparation reviewed at `4f70e9247206aac10d5be9928dea5e1613057d90`. A read-only lookup of repository `main` still returned `43c3e887e503b8cd8c064cddc7085dfb4880d2f6`, the exact base already reconciled in [the review report](review-and-baseline.md). There is no newer main delta in this check. No merge, rebase, cherry-pick, PR, push or deployment was performed for this follow-up. This is a point-in-time observation, not a promise that main will remain unchanged.

## Recommendation

Keep this delivery as a **reviewable design and synthetic evidence package**. It is not an M2.5 runtime slice and must not be imported into frontend, edge functions or Telegram. A future authorized draft PR may carry only these documents and offline probes after repeatable scope checks and review. That would not by itself accept B, approve providers, create a snapshot or unlock M2.5. Do not create that PR or integrate it under this follow-up.

After M2's decisions and the specific data/provider gates are satisfied, implement the labor slice in a separate owned change with one production registry and one query-function source. Use the Python probes as reviewed requirements and regression evidence, not code to copy into Deno or a second runtime validator. Do not preserve Python and TypeScript registries as parallel product authorities.

## Concrete incompatibilities and prerequisites

| Surface at exact main | Why direct integration is unsafe/incomplete | Required resolution |
| --- | --- | --- |
| `src/utils/escoContratoLabor.ts` advertises date_from/date_to/lote_name; B probe advertises desde/hasta/lotes/grupo/metricas | Names, entity resolution and contract semantics differ; the prototype is not a drop-in tool | Freeze one M2.5 operation and derive model/validator from its production registry. Any temporary adapter must be explicit, narrow and tested for argument loss, ambiguity and scope. |
| Existing `Scope`/`Evidence` uses labor.by_lot, `ok/partial/error`, population proofs and typed facts; proposal uses labores.resumen.v1 and broader per-part result states | Renaming or flattening cannot prove equivalent coverage, no-record semantics or denial states | Approve a versioned result mapping before reuse. Preserve proof provenance, missing metrics, period meaning and unassigned groups. |
| Existing work-fact reader requires identified lot values; B proposal authorizes unassigned records separately | Keeping a compatible type does not preserve null-lot reconciliation | Qualify a new aggregate/reader contract with null groups and independent totals. No legacy repair in this delivery. |
| `escoEvals/numeros.ts` parses ambiguous numeric tokens into candidate values and supports tolerance checks | This is useful evaluation machinery, not a proof that every numeric assertion has the correct fact, unit, population or period | Qualify a dedicated runtime number/provenance check against the result envelope. Explicitly test unsupported extra numbers, swapped units/entities/periods and ambiguous separators before reuse. |
| Python probe emits/returns a fixed request; spy output is discarded | No actual source reading, result minimization, errors, pagination, timeout, cancellation or composition exists | A future reader/result boundary needs its own implementation and independent positive/negative tests. Do not connect the spy interface to a real provider. |
| Synthetic authorization supplies a lot set and unassigned flag | Production authority/schema for these scopes has not been qualified | M1/E2-13 must identify the real policy and enforce it in the read transaction. A fake profile is not evidence of user RLS. |
| New query function absent; current config/drift checks remain legacy-specific | Importing old bootstrap or adding a slug blindly violates isolation/JWT/health expectations | Separate query source and per-function config/check expectations; no legacy imports or fallback; qualify independently before deployment. |
| PR workflow runs npm lint, TypeScript and Vitest only | A green current PR workflow would not execute the Python evidence | If an evidence-only PR is later authorized, explicitly decide whether to retain Python with its own offline CI job/dependency pin or port selected requirements into normal Vitest. Never count today's PR checks as these tests. No CI edit here. |

`analysis/esco2-design/requirements-design.txt` records the tested jsonschema version. This follow-up does not install packages or add product dependencies. Python is a prototype tool, not a recommended new production service.

## Repeatable read-only scope check

```sh
python analysis/esco2-design/check_integration_scope.py --base 43c3e887e503b8cd8c064cddc7085dfb4880d2f6
python analysis/esco2-design/check_contracts.py
python analysis/esco2-design/check_direct_boundary.py
git diff 43c3e887e503b8cd8c064cddc7085dfb4880d2f6 --check
```

The first check reports exact base/head, ancestry, worktree status, tracked/untracked changed paths, symlinks and any path outside the two preparation directories. It never fetches, writes or integrates. Passing it means file-scope compatibility only. Verify remote main independently before using a new base; a local git ref is not evidence of current remote main.

## Gate ledger for the proposed labor slice

| Gate / coordinate with | Current state | Evidence required to unlock |
| --- | --- | --- |
| E2-03 / Santiago and coordination | In review | Explicit technical scope/budget, date/limit rules, route decision and agreed M2.5 time box/cutoffs |
| E2-17 / independent security review | Standard A tool incapacity documented; closure review pending | Scoped security conclusion and explicit architecture decision, without fabricated A quality/cost results |
| M1 + E2-18 / independent data/evaluation owner | Real snapshot blocked by unverified isolation/retention | Authorized target, verified isolation/access/retention and qualified references, held-out custody preserved |
| E2-06 / provider/access owner | Not verified by this session | Actual authorized OpenAI project/model/config/data handling and concrete spend cap; no inference from environment keys |
| E2-13 / security owner | Offline request checks only | User JWT and actual grants/RLS, transaction-time revocation, minimized output, safe errors and independent capture-isolation evidence |
| E2-19 / integrator and evaluator | Not started here | Authorized real labor question→planner→registry→reader→evidence→composer path against frozen references; same-case comparison and selection/cutoff evidence |

The existing 19 offline cases support only request-contract/security design. They neither measure answer quality nor supply a time/price estimate from actual execution. No protected gate is waived by the package's clean diff or independent probe review. If the snapshot remains blocked, continue only synthetic contract/evidence design and defer actual slice execution.
