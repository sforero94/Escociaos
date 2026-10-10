# Security and integrity candidate release

This branch is a draft implementation and contains unapplied SQL review candidates. Passing synthetic tests is not evidence of a hosted release or complete application integrity. No script in `scripts/security/` restores production records: the PostgreSQL fixtures are synthetic and the containers have no network, host bind mounts or published ports.

## Required release sequence

1. Review the current diff, final test evidence and unresolved issues. Confirm the current database schema, trigger bodies, function ownership, grants and Storage configuration against each candidate's prerequisites. Coordinate migration numbering and ownership with other work; these files deliberately are not numbered migrations.
2. Inventory and transition **all** writers of product quantities, movement rows, purchases and reversals. Include application closure, ronda/service-role routines, imports, initial stock, catalog edits and maintenance jobs. An atomic RPC cannot guarantee integrity while other callers still perform independent stock writes. Remove bypass grants only in a compatible coordinated cutover.
3. Prepare a verified backup and reversible release with runtime-specific checks. Apply reviewed database dependencies before caller code: purchase-integrity, manual-stock-movement, Telegram binding, memory confirmation and the separately reviewed memory cleanup schedule. The active-account restrictive policies depend on the existing permissive policies/helper prerequisites. Closure replacement and invoice Storage metadata limits have separate prerequisites. Missing RPCs intentionally fail closed.
4. Run ordinary-role tests, account revocation and concurrent writes against the release environment. Check real browser Web Locks, Auth callbacks, Deno imports, Telegram private delivery, Vercel configuration, Storage policies and file-byte validation. Metadata MIME restrictions do not authenticate file bytes.
5. Obtain owner approval before merging, deploying, changing production SQL/settings/jobs or other production changes. Apply within the approved maintenance window and monitor the reviewed checks. Preserve post-release transactions and proof when reverting callers; do not drop evidence tables as a routine rollback.

## Proof and retention

Memory confirmation receipts are retained seven days; expired proposals and spent token/owner/hash metadata are removed by the reviewed cleanup function. Saved memories are unaffected. Hosted pg_cron execution and quiet-period deletion must be verified separately; local PostgreSQL tests do not certify scheduling.

Purchase/manual-stock request evidence and cancellation fences are a distinct prospective audit/idempotency mechanism. Their access, capacity, archival and deletion policy remain a release gate. Deleting a fence without an equivalent protection can allow historical key reuse. No historical proof is inferred from a displayed row. A failed or lost response retains the original owner/key/payload until the transactionally serialized resolution returns a verified outcome.

## Remaining acceptance gates

Global stock writer coordination, whole-import atomicity, cattle undo transactions, complete audit access and retention, authenticated upload bytes, hosted runtime checks and a contained real backup recovery exercise remain unfinished. The xlsx dependency advisory remains unresolved. Recovery must use an existing protected key, verified isolation, no extra spend and cleanup; absent credentials are not replaced with invented values. Historical tests from a lost worktree do not certify this reconstructed branch.
