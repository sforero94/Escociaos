# Escocia OS security and data integrity — V2 final scope

Protect farm operational logs, financial records and conversations across the React web app, Telegram/Esco, Supabase, Vercel and daily encrypted backup workflow. All users belong to Escocia. No incident was reported. The owner needs prioritized issues, requirements, an implementation plan, and autonomous preparation of reviewable fixes/releases.

## Requirements and acceptance

1. Authorization is enforced by trusted current active identities at every boundary. Check ordinary-role RLS and Storage as well as service-role paths; UI visibility is not enforcement. Owner-bound conversations, drafts, proposals and receipts survive retries without cross-user disclosure. Group responses must preserve private histories and sensitive output limits.
2. Mutations preserve invariants under concurrent edits, retries, lost responses, stale drafts, revocation, suppressed writes and mid-transaction faults. Database transactions coordinate stock, ledger, expenses and protected provenance; stable actor-bound retry keys prevent repeated posting. Original observed revisions refuse stale corrections. Preserve linked expenses for management review.
3. Audit is transactional and trusted; record actor, origin and before/after values. Do not trust client actor IDs or silently repair historical records.
4. Attachments validate format/size and current-object references, avoid stale signed URL previews and enforce ordinary-reader access. Client MIME metadata is not actual-byte enforcement.
5. Recovery preserves <=24h coherent work and restores service by08:00 America/Bogota next working day Mon–Sat. Verify encrypted backup freshness, protected key, isolated no-cost restore, integration containment and cleanup. A successful backup job is not restore proof.
6. Prepare release artifacts with exact dependencies, migration numbering reservation, tests, containment and rollback preserving post-release records. Production changes always require approval.

## Adversarial verification gates

Test inactive/missing/ambiguous profiles, cross-user IDs, forwarded/replayed callbacks, concurrent role changes, stale original versions, duplicate/canonical UUID lines, precision rounding, direct writer bypass, partial batch failures, database trigger suppression, response-loss retry and reference replacement. Hosted Auth/Storage/RLS/Deno and deployed-version parity require separate evidence. Unknown key, deadline or historical provenance cannot be fabricated.

## Implementation order

1. Recover/persist prior work; rebase only through isolated branch and preserve source conflicts.
2. Reconstruct identity, draft, attachment, input and configuration guards; actual handler/hooks tests.
3. Coordinate database stock/cattle/financial transactions and trusted audit with all writers; integrate compatible stable retry callers. Do not deploy isolated SQL fragments while bypass writers remain.
4. Enforce Telegram group isolation, atomic binding and single-use memory receipts; reader-authorized monitoring links and server upload enforcement.
5. Verify ordinary-role/runtime coverage, recovery and exact release graph. Prepare concrete approvals only after artifacts are reviewable.

Owner decisions: docs/security-integrity/owner-decisions.md. Historical results from October9 do not certify the reset October10 worktree. Execution status records what is present and newly verified.
