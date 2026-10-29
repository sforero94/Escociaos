# Draft: compose an offline synthetic evaluator

Target: `codex/esco-faithfulness-offline-base` at `158720fed6ceb461efd34746760db520c557d2a3`.
Head: `codex/esco-faithfulness-eval-replay`.

Connect reviewed date/history/fixture helpers to deterministic scoring and measurement v1.1 using declarative synthetic tool requests and answers. This makes a complete in-memory evaluation receipt without providers, credentials, private fixtures or production-loop imports. Both finalizers run; broken replay is inconclusive and missing scenarios remain explicit. Semantic judge/review and usage remain unavailable, quality_measured=false. Scripted plumbing is not calibration.

The base integrates exact #359/#361/#363 heads solely to expose a bounded incremental diff. No code conflict/edit, only tracker-doc conflicts. Review/merge order: #359 → #361 → #363 → this PR. Do not merge the integration branch itself. After dependencies land, reconcile docs, integrate current main without force push, retarget and rerun all gates/CI.

Hashes establish canonical manifest/script/prompt consistency only. Network proof is limited to the offline import graph and synthetic fetch-denial controls, not a sandbox/general HTTP or actual-loop guarantee. Unknown/error/truncated evidence stays opaque. Measurement v1.1/labels/adjudication preserved.

Final SHA, tests, independent findings and CI will be in the publication handoff. Rollback: revert incremental offline files. Remaining: actual-loop/closed-transport integration, scenario review, authorized calibration/live QA. No merges, providers, source-pack/private fixture reads, runtime/deployment/migration/production actions here.

Morning-paper one-liner: Connects offline evaluation inputs, replay evidence and scoring into a repeatable synthetic test run without contacting the production agent.
