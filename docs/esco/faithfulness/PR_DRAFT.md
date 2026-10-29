# Draft: preserve failure and truncation in saved tool summaries

Head branch `codex/esco-faithfulness-summary-safety`; independent main baseline `47d138633f03bb75deececb50516e4a17a2fd9ff`, all PO #365 changes retained.

A truncated births result could retain complete metadata and authorize an answer after losing detail; truncating a long error discarded its error key. Preserve own errors with a fixed safe marker, downgrade truncated legacy completeness, and reject context loss/errors in the births gate. Short results, complete-empty results and valid paginated aggregates without context loss remain compatible. Immediate full tool responses remain intact.

Canonical source and both generated copies synchronized. Existing main tests cover the actual loop; no dependency on #366/queued offline code or new harness. Six regressions reproduced first;76 focused and26 independent synthetic assertions passed. Final committed-head full checks and CI belong in the publication handoff. No model calibration/live QA claim.

Runtime source change, draft only. No deployment, schema/credentials/access/security settings, typed-envelope/Telegram rewrite, injection, hard-size policy, private/provider/production call or history rewrite. A retained large summary can still exceed the threshold. Merge/deployment/live-QA remain separate; coordinate alert owner readiness before any future edge release.

Independently reviewable corrective fix; offline chain #359 → #361 → #363 → #364 → #366 remains separate. Reconcile overlapping tracker docs and retest later changed heads. Do not merge the offline integration-base branch. Rollback: source revert plus synchronized mirrors; any deployed revert needs a separately authorized deployment.

Morning-paper one-liner: Prevents trimmed or failed tool evidence from appearing complete when the agent answers births questions.
