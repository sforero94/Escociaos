# Expense-batch retry — database prerequisite (PR360)

Status: additive candidate, **not applied and not released**. Base `main` remains
`6a2dd50bea966f733d6ef42b15bf1346ca77d6dc`, verified through Composio account
`github_lysis-talion` / `thinksid` on 2026-10-29 UTC. Migration187 is the next
source filename after186; the live ledger is not reasserted by this code check.

## Split after independent review

The earlier combined PR360 head `6e4a882` is superseded. Parent review found:

1. Browser tabs could race between pending reads/writes and a UUID-only cleanup
   could erase another tab's exact frozen recovery payload after a conflict.
2. A combined merge would activate an unapplied RPC in the auto-deployed main
   frontend, causing an expense-capture outage before migration187 was applied.

PR360 now contains **database migration, synthetic PostgreSQL tests and docs
only**. Its final diff leaves all files under `src/components`, `src/utils`,
`src/types` and browser/unit tests identical to current main. No UI calls the new
RPC from this PR, and merging its source does not apply the SQL. The existing
expense frontend remains unchanged, including its original retry defect until
separate activation. The dependent draft on `codex/security-expense-batch-frontend`
contains the corrected browser serialization/activation; review it only after
this prerequisite. This is a source split, not a default-off activation switch.

## Database contract

Migration187 creates `fin_gastos_lotes` and INVOKER
`fn_fin_gastos_guardar_lote(uuid,uuid,jsonb)`. The expected browser actor must
match `auth.uid()`, and current `get_user_role()` must be active Gerencia **before
any receipt replay**. Existing expense RLS and grants stay unchanged. One
transaction inserts the immutable complete receipt and all expense rows,
including `created_by=auth.uid()`. A row validation, FK or trigger failure rolls
back both. Concurrent identical UUID/payload requests wait for the original
commit and return its exact row IDs. A different user cannot read the receipt.

A changed payload for an existing UUID raises dedicated SQLSTATE **PGB01**;
it must never be treated as proof that an earlier request did not commit.
New explicit input/row validation uses23514 so first-attempt correction cannot
be confused with legacy22023 payload conflicts; casts/FKs keep standard codes. No receipt UPDATE or
DELETE grant is added. The frontend must preserve an ambiguous request, own it
across tabs before reading/writing/sending, and compare its complete identity
(UUID + exact payload) before cleanup. SQL alone cannot serialize browser storage.

The INVOKER receipt is an accidental-retry mechanism, not an unforgeable audit
log: Gerencia can deliberately INSERT its own forged receipt through the table
API, as that role already controls expense writes. It cannot forge another
user's receipt, UPDATE/DELETE a receipt, or use this RPC to bypass expense RLS.
Deleting an Auth account cascades only its new receipts, adding no new deletion
blocker or expense-record deletion. This trust limit has a synthetic test.

## Tests and evidence limits

`python scripts/tests/gastos-lote-postgres.py` runs the exact migration against
PostgreSQL17 in a disposable container with `--network=none`, tmpfs, no ports,
secrets or farm data. Ten groups cover compilation, lost response/reload,
concurrent repeats, PGB01 conflicts, explicit23514 validation, cross-user isolation, inactive/downgraded/
anonymous/switched actors, validation/FK/injected-row rollback, immutable grants
and the own-INSERT/account-deletion trust limits. This minimal synthetic schema
is **not** a complete Supabase/PostgREST stack or live catalog reproduction.
DB-only final-tree local checks: 4,757 Vitest tests across218 files, no skips;
typecheck/build pass; lint0 errors/907 existing warnings. Independent re-review
confirmed the five-file scope and preserved SQL guarantees. Exact-head CI is
recorded in the PR/handoff; earlier combined-head counts are historical only.

No production records, Storage, provider calls, calibration data, probes, bot
messages, credentials or deployment commands were used. Existing repository
integrations may create PR previews; no production release is performed.

## Review and release order

1. Review this DB-only draft first. Check current main for a migration-number
   collision before release. Reconfirm the final diff contains no frontend
   activation. PR359/361 Faithfulness, PR356/migration186 and PR324 remain outside
   scope;187 has no code dependency on their work.
2. Validate the exact reviewed migration in an **authorized development Supabase**
   environment with actual expense columns, triggers, RLS, PostgREST roles and
   RPC error transport. The isolated fixture does not satisfy this release gate.
3. A separately authorized database release must capture the live ledger,
   existing expense grants/RLS, activity-aware role helper and attribution
   baseline. Confirm new objects absent, apply only reviewed187 through the
   authorized migration workflow, then verify the ledger, INVOKER/search_path,
   authenticated execution, own active-Gerencia SELECT/INSERT, anonymous denial,
   no receipt UPDATE/DELETE and unchanged expense policies. Do not reapply186.
4. **Only after development validation and authorized DB application plus
   postconditions**, review/merge the dependent frontend activation. An ordinary
   main merge auto-deploys that frontend, so “merge now, migrate later” is unsafe.
   Retarget/rebase its draft after this prerequisite merges; verify CI again.
   Do not change provider deployment settings as a shortcut.
5. Verify exact frontend alias/SHA and refresh old tabs. Genuine operator
   confirmation remains separate from synthetic test results.

This scope prepares drafts only: no merge, approval, auto-merge, migration
application or production deployment. No essential business-semantic decision
blocks preparation; development validation and release authorization stay pending.

## Rollback and retained boundaries

Before any receipt exists and before exposing the new client, development cleanup
can remove only the new function and table transactionally. After exposure,
retain RPC, receipts and every pending browser attempt. Pause expense-batch
capture before restoring the old writer; an uncertain request must not be
recaptured under a fresh UUID. Do not delete receipts, clear browser storage or
erase accounts as a retry workaround. F1 receipt/pending state is untouched.

Income, individual expense editors/imports, invoices/Storage semantics, Telegram,
historical duplicates and ownership redesign stay excluded. The legacy shared
unowned draft remains the S4 privacy risk. Preserve approved edge export HTTP413,
separately denied database-source export, F1 genuine-operator confirmation gaps,
PR324 parked status and all original review qualifications. No new live parity
claim follows from these source changes.

## Next-session prompt

```text
Review DB-only PR360 and its dependent frontend draft, in that order.
Read CLAUDE.md, docs/security-review/{session-guide,plan,progress}.md and
expense-batch-retry.md. Verify both exact heads, independent review and CI.
Do not merge activation until development Supabase validation and separately
authorized migration187 application/postconditions complete. Preserve Web Locks
ownership, exact frozen-payload recovery, PGB01 conflict retention and all prior
scope exclusions. No merge, migration or deployment under the overnight queue
instruction. Do not start another remediation. Update the tracker at close-out.
```
