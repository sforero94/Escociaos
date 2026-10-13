# SI13 — Application closure integrity review candidate

The old transactional RPC accepts unsafe quantities and arbitrary work IDs. It can report success after suppressed or rewritten writes. Its unversioned retry cannot prove which original input committed.

This unapplied candidate introduces three public RPCs: `fn_application_closure_snapshot(uuid)`, `fn_application_close(uuid,jsonb,jsonb)` and `fn_application_closure_status(uuid,jsonb,jsonb)`. The browser has no legacy or direct-table fallback. Installation revokes ordinary, anonymous and service execution on `fn_cerrar_aplicacion(jsonb)` and all private helpers. The legacy body remains an internal transactional persistence implementation only.

## Privileged boundary

The public functions use a **whole SECURITY DEFINER boundary**, not invoker RLS enforcement. Fresh server admission requires authenticated active Administrador/Gerencia and locks the persisted profile against concurrent revocation. Persisted profile email supplies attribution. Captured policies on all fifteen read/write dependencies, actual grants, RLS state and the active-role helper establish explicit policy-equivalent admission for these operations. Installation and runtime fail on boundary drift. The sole optional addition accepted is the exact reviewed `productos.active_account_required` restrictive authenticated ALL policy from the coordinated active-account candidate. Other additions, permissive variants or expression changes refuse.

The private request table binds exact actor, key, payload and expected source snapshot. Identical completed retries return the original receipt only after fresh authorization. Changed originals refuse. Status never submits a close: it returns the committed receipt or durably cancels an absent actor/key. The identical advisory lock serializes close/status and prevents a delayed cancelled close from posting. Prospective proofs have no cascading domain foreign key; retention and deletion containment require coordinated release review.

## Original-source and result integrity

Expected is a deterministically ordered snapshot of persisted application, task, work, stock, prices, movements, lots/tree counts, worker rates and planned rows. The browser brackets its existing reads with snapshots and refuses mixed loads. Restored drafts retain their original snapshot. Close obtains bounded SHARE ROW EXCLUSIVE locks over the complete dependency set, then compares the original snapshot before writes. These broad farm-wide locks prevent inserted/deleted child-set races and need contention rehearsal.

The internal persistence body rejects canonical duplicate SKU/work UUIDs, nonfinite/negative/rounded-zero or out-of-range quantities, cross-task edits/deletes, existing IDs claimed as new rows and incoherent open-application closure children. It locks product UUIDs in order and checks stock before writes. Exact depletion remains valid. Returning rows, actual counters, deleted-row absence and final persisted proofs detect suppressed or rewritten writes and later trigger changes. Existing lifecycle/provenance/cost triggers remain authoritative.

The wrapper additionally verifies actual captured movement quantities and persisted labor, costs, jornales and tree-based totals. Read-only sources and unintended fields must remain unchanged. Exact original and actual final snapshots are stored atomically with the committed receipt. Private proof suppression, rewrite or cross-table trigger changes abort business state too.

## Browser evidence and later edits

The caller saves immutable owner/application/key/payload/expected evidence under Web Locks before RPC. Lost, malformed or unknown outcomes retain it. Explicit resolution uses exact originals; complete matching receipts verify application/closure UUIDs and actual work/product counts. Session changes cannot clear evidence or navigate. The component saves drafts before posting and resolution. If a receipt confirms an earlier payload, later unsent edits are durably saved and remain visibly unapplied.

## Verification and limitations

The standalone harness uses a cached digest-pinned PostgreSQL 17.6 image with pull never, network none, no mounts/ports, read-only root and bounded tmpfs. It uses synthetic rows and relevant captured policy/trigger definitions. Postgres only sets up faults and fixtures; public protocol tests execute as ordinary authenticated users. Cleanup is verified. Actual Supabase SDK transport tests and the actual React orchestrator exercise caller preservation and receipt behavior. See the caller checkpoint for the final current counts, commands, logs and hashes.

The captured employee null-cost trigger branch has an existing ambiguous `horas_semanales` reference under PostgreSQL defaults. This slice does not repair it. Numeric employee costs and the existing contractor null-cost branch are covered. Local PostgreSQL, SDK and React checks do not certify hosted Supabase/Auth behavior.

## Release containment

This is not a numbered migration and has not been applied. Coordinate direct writer retirement, other stock RPCs, lock order, hosted grants/policies/triggers, migration numbering, proof retention and global deletion containment before release. Recheck live metadata and test the prepared migration on an approved development instance. No production mutation, merge, deployment, spend, alerts or private catalog export is authorized here.

Containment disables affected writers while preserving reads. Rollback requires an approved replacement boundary and preserves all domain rows and prospective proofs. Do not undo business history or replay old closure payloads. Restoring the old public function restores its weaknesses and requires explicit containment review.
