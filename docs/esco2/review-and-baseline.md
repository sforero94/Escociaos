# Independent B review and baseline reconciliation

2026-11-03. Reviewed revision: `ca7f9cc5f2206bde82751b20d50ca2445a980538`. Reviewer: separate read-only subagent `/root/review_b_boundary`, explicitly authorized by coordination for parallel independent work. The reviewer inspected only this repository preparation and synthetic tests, with no provider, private dataset, credential or production access. The review is independent of the author within this session; it is not M6 acceptance or independent product security certification.

## Findings and disposition

| Finding in reviewed prototype | Reproduction | Correction and regression |
| --- | --- | --- |
| P2: caller dictionary could change after validation | second profile callback changes `desde` to 1900-01-01; emitted range exceeds 366 days | private deep snapshot is validated and consumed; argument-mutation test |
| P2: global operation schema/source had mutable aliases | callback substitutes `usuarios` / `salario` for source/projection; model schema returns mutable alias | immutable serialized per-instance contract/hash, local contract snapshot; defensive model-schema copy; registry-mutation and schema-alias tests |
| P2: malformed authority fields relied on truthiness | `activo="false"` and `permite_sin_lote="false"` accepted | exact boolean/type checks and frozen string-ID scope; malformed-authority tests |
| Output boundary absent | fake port returns salary field unchanged | keep artifact an emitter only; discard port output and return frozen request; output-propagation regression. Actual data-result validation remains unimplemented and gated. |

All findings are synthetic/internal defects in the preparation probe, not demonstrated remote vulnerabilities or production failures. The new adversarial tests failed before the fixes. After fixes, author and reviewer each ran 4 registry + 15 boundary cases successfully. Reviewer found no remaining blocker **for this synthetic request emitter**. No claim about a production reader follows.

## Exact baseline comparison

Initial base: `a635a05e7f6c466dd75b140658850ef2e5091a1e`.
Target supplied by coordination: `43c3e887e503b8cd8c064cddc7085dfb4880d2f6`.

The target object was initially absent locally. Read-only GitHub comparison then public Git fetch obtained this exact target without interactive authentication, credential helpers or custom auth headers. No current/live production state was read. Both methods agree that initial base is the merge base: target is 5 commits ahead, 0 behind.

Commits between bases:

- `b52421e`: requested-operation / validated-user-scope repair.
- `1a6d2f3`: merge PR #405.
- `4a702cf`: supervised request-contract release workflow/scripts.
- `2d699c7`: merge PR #406.
- `43c3e887`: deployment-drift state update.

[Exact comparison](https://github.com/sforero94/Escociaos/compare/a635a05e7f6c466dd75b140658850ef2e5091a1e...43c3e887e503b8cd8c064cddc7085dfb4880d2f6) changes 40 paths. The preparation at ca7f9cc changes 8 paths, all under `docs/esco2/` and `analysis/esco2-design/`; intersection is empty. No direct path conflict. This is compatibility evidence, not permission to integrate product changes.

| Main changes | Effect on B preparation |
| --- | --- |
| New `escoContratoLabor.ts` and changed operation/dispatcher interfaces, mirrored in both old server trees | Reuse candidates must be qualified at target revision, never copied from old base. New registry remains independent and does not import these modules. |
| Application/reference/context/turn handling changes and related regression tests | Historical context/selection behavior differs; no assumption that an a635a05 test result characterizes target main. New structured context still requires its own proof. |
| Release scripts/workflow, docs and drift-state receipt | Historical artifacts only. Do not execute or restart release jobs. A receipt alone is not current health/acceptance. |
| Sync script adds old labor contract to mirrored-tree list | New query source remains a single tree; do not wire it into legacy sync or imports. |

Confirmed unchanged across the exact bases: root `CLAUDE.md`, `package.json`, `supabase/config.toml`, drift workflow/checker, `escoHechosTrabajo.ts` and Telegram bot. Thus the documented old JWT/health expectations, null-lot qualification candidate and Telegram→chat dependency remain relevant at the target. No legacy code was repaired or retested as an acceptance campaign.

## Remaining tests and gates

| Evidence absent | Why the local suite does not supply it |
| --- | --- |
| JWT signature/issuer/audience/expiry and real server identity | fake session lookup only; no token/provider |
| Actual active-Gerencia policy, row/column/table grants and RLS | fake authorities and spy requests, not database execution |
| Role/owner/scope revocation within read transaction | callback rechecks still have a gap before the read; database transactional enforcement needed |
| Data-result envelope/minimization/numeric traceability | emitter discards outputs; no model-visible facts/composer |
| Pagination/row-byte/time limits and source consistency | no data adapter, rows or transport |
| Safe external error mapping, cancellation and telemetry retention | no HTTP handler, error-response boundary or persistent sink |
| Authenticated web flow and Telegram capture regressions | no product wiring or deployment |
| Real snapshot isolation/retention, independent references | E2-18 blocked; private sources remain untouched |

Continue only independent local design and synthetic cases. M1/E2-18, E2-06, E2-13 and explicit M2/M2.5 scope/budget/route decisions remain required. Do not infer that the standard A tool's failure accepts B. The reviewed probe can support future implementation review, not replace it.
