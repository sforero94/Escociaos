# Draft359: validate offline evaluation inputs

Existing branch `codex/esco-faithfulness-eval-input`, integrated with main `2a8671a1af027815cadac5d6f39009558fc0a6cc`.
Original reviewed implementation head: `9de2be29a90a37760d0ce81ed8052eda38ad1bed`.
The four adapter/test blobs remain identical; only integration and shared tracker state change in this refresh.

Validate JSONL case shape, explicit evidence dates, selection controls and synthetic text variants before future evaluation.
Malformed inputs fail closed; empty selections, unknown tool status and unavailable historical evidence remain explicit.
No filesystem, environment, provider, private fixture or deployed-runtime access. Labels/adjudication and measurementv1.1 remain intact.

Scope stays seven files: two adapter modules, two synthetic test files and three tracker documents.
Preserve all security362, release-control and PO changes from main. No dependency on queued runner/transports.
Complete local tests/types/lint/build, independent review and exact-head CI are required for this refreshed candidate.
Actual head and final check receipts are recorded in the PR/handoff after commit, not inferred from historical counts.

Remain draft. Specific approval is required before ready/merge. No deployment, production write or provider calibration.
Next integration order:359 →361 →363 →364 →366; reconcile/retest each, never merge the offline integration-base branch.
Rollback is a normal source revert with no schema or traffic change.

Business one-liner: Rejects malformed evaluation cases before offline scoring can produce misleading results.
