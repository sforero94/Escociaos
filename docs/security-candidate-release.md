# Security and integrity candidate release

This branch is a draft implementation and contains unapplied SQL review candidates. Passing synthetic tests is not evidence of a hosted release or complete application integrity. No script in `scripts/security/` restores production records: the PostgreSQL fixtures are synthetic and the containers have no network, host bind mounts or published ports.

## Required release sequence

1. Review the current diff, final test evidence and unresolved issues. Confirm the current database schema, trigger bodies, function ownership, grants and Storage configuration against each candidate's prerequisites. Coordinate migration numbering and ownership with other work; these files deliberately are not numbered migrations.
2. Inventory and transition **all** writers of product quantities, movement rows, purchases and reversals. Include application closure, ronda/service-role routines, imports, initial stock, catalog edits and maintenance jobs. An atomic RPC cannot guarantee integrity while other callers still perform independent stock writes. Remove bypass grants only in a compatible coordinated cutover.
3. Prepare a verified backup and reversible release with runtime-specific checks. Apply reviewed database dependencies before caller code: purchase-integrity, manual-stock-movement, Telegram binding, memory confirmation and the separately reviewed memory cleanup schedule. The active-account restrictive policies depend on the existing permissive policies/helper prerequisites. Closure replacement, unused-plan deletion, durable Hato review and invoice Storage metadata limits have separate prerequisites. Missing RPCs intentionally fail closed.
4. Run ordinary-role tests, account revocation and concurrent writes against the release environment. Check real browser Web Locks, Auth callbacks, Deno imports, Telegram private delivery, Vercel configuration, Storage policies and file-byte validation. Metadata MIME restrictions do not authenticate file bytes.
5. Obtain owner approval before merging, deploying, changing production SQL/settings/jobs or other production changes. Apply within the approved maintenance window and monitor the reviewed checks. Preserve post-release transactions and proof when reverting callers; do not drop evidence tables as a routine rollback.

Vercel configuration prepares lockfile-based installation with `npm ci` and response headers against MIME sniffing, cross-origin full-path referrer disclosure and embedding the app from another origin. The limited CSP permits the app's same-origin report frames and does not claim script-source enforcement. Verify headers on actual deployed HTML/assets and report workflows before release. These headers do not govern signed invoice responses served from a separate Storage origin.

## Proof and retention

Human operation protocols must bind the original operation owner as well as the
trusted current session. An SDK session switch between an earlier account check
and RPC transmission can otherwise execute a saved operation under the new
account. Required expected-owner arguments must equal the trusted Auth UID before
any source selection, posting, replay or cancellation. The claimed owner never
supplies privilege or attribution. Retire ownerless overloads in the coordinated
database cutover; late browser receipt rejection cannot undo a committed write.

Memory confirmation receipts are retained seven days; expired proposals and spent token/owner/hash metadata are removed by the reviewed cleanup function. Saved memories are unaffected. Hosted pg_cron execution and quiet-period deletion must be verified separately; local PostgreSQL tests do not certify scheduling.

Purchase/manual-stock request evidence and cancellation fences are a distinct prospective audit/idempotency mechanism. Their access, capacity, archival and deletion policy remain a release gate. Deleting a fence without an equivalent protection can allow historical key reuse. No historical proof is inferred from a displayed row. A failed or lost response retains the original owner/key/payload until the transactionally serialized resolution returns a verified outcome.

## Remaining acceptance gates

Atomic CSV import, scoped cattle undo and authenticated invoice-byte validation now have local implementations and focused evidence. Global stock writer coordination, prospective coupled cattle creation, complete audit access and retention, hosted runtime checks and a contained real backup recovery exercise remain unfinished. The xlsx dependency advisory remains unresolved. Recovery must use an existing protected key, verified isolation, no extra spend and cleanup; absent credentials are not replaced with invented values. Historical tests from a lost worktree do not certify this reconstructed branch.

## Prepared destructive-operation safeguards

Web treatment creation now persists the original complete animal/proposal and
one owner-bound request key before sending. Treatment and requested follow-up
commit together with exact protected proof. Full-workflow Web Locks serialize
duplicate tabs; uncertain outcomes offer original-key status, retry or explicit
cancellation. Preparing another treatment is explicit. The expected-owner server
guard rejects switched-session requests before effects. Local evidence includes
74 SDK/React cases and 91 synthetic PostgreSQL assertions plus cleanup. Telegram
creation integration, legacy writer retirement, actual schema parity and hosted
runtime remain separate prerequisites.

The Hato candidate requires a database-owned attempt and complete private Telegram review before a separate confirmation. Sender, current linked Gerencia authority, private chat and registered control-message identity are rechecked; lost responses recover the original attempt. Coupled legacy records without trustworthy provenance refuse automatic undo. Local evidence comprises 135 synthetic PostgreSQL assertions and 163 focused adapter/Telegram tests; live schema, trigger, grant and migration parity remain prerequisites.

Unused application-plan deletion now removes only a reviewed unused Calculada plan and its verified planned children, atomically archiving the original. It preserves inventory ledger, work, tasks and audit records. Plans with execution, protected proofs or unsupported references refuse deletion. Local evidence comprises 45 synthetic assertions plus cleanup and 20 SDK/React tests; the current hosted FK/trigger graph and coordinated direct-writer retirement remain prerequisites.

## Prepared invoice and Ronda boundaries

Invoice uploads validate bounded file-container bytes on the server and use an immutable request identity, per-write execution evidence and an unreadable quarantine namespace. Only a protected committed receipt permits ordinary readers or a new domain attachment reference. Cleanup preserves uncertain delayed writes, existing references and committed files. Eighty focused tests and 66 synthetic PostgreSQL assertions plus cleanup cover this candidate. Supported PDF validation is limited to single-revision classic-xref files with direct objects; unsupported/encrypted/incremental/object-stream PDFs refuse with a clear message. This validates container boundaries and does not sanitize files or certify malware safety. Hosted Storage policies, signed-token bypass, pinned Deno SDK, response headers and cleanup operation still require verification.

Ronda adjustment/capture candidates bind one completed operation to the exception identity, trusted actor, exact input and protected persisted stock/ledger/exception results. They preserve current configured worker lanes and signed-versus-magnitude ledger conventions. Local evidence is 128 synthetic assertions plus cleanup. The existing second-confirmation boolean cannot bind a changed theoretical quantity to the exact revision observed in the UI; that caller contract remains an explicit open integrity requirement. Actual schema/policy/trigger/grant parity and all-writer cutover are prerequisites.

## Recovery procedure verification

`python3 scripts/security/recovery-postgres.py` reproduces the default psql behavior using generated SQL: a failed statement can return exit status zero while earlier and later statements persist. The guarded synthetic procedure uses `-X --set=ON_ERROR_STOP=1 --single-transaction`, rejects the failed restore and rolls back roles, schema and rows. A valid generated restore commits exactly its expected state. The cached PostgreSQL container has no network, published ports, host bind mounts or host PID access; cleanup is verified.

This script accepts no backup input and reads no key or production records. Before using the guarded procedure on an actual backup, verify compatibility of every SQL file with a single transaction, the required managed schemas/extensions/Auth and Storage recovery, protected key availability, containment, archive safety and cleanup. A synthetic procedure check does not establish backup freshness, coherent recovery or the operational recovery deadline.

`scripts/security/backup-health.py --now <verified-time>` reads supplied GitHub workflow/run/artifact metadata from standard input. It requires a successful matching run, available unexpired nonempty artifact, provider digest and coherent timestamps. Run start bounds freshness conservatively; an otherwise valid artifact older than 24 hours fails the check. A recent completion whose snapshot age crosses that boundary remains unverified. The script performs no network access, download, alert or scheduled job, and metadata freshness does not prove decryption or coherent recovery. Twelve synthetic tests cover the metadata boundaries. Installing a production monitor or changing backup schedules requires separately reviewed owner approval and verified zero additional spend.
