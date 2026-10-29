# Expense-batch retry — bounded remediation

Status: implemented locally and queued for draft review; **not deployed**.
Base: `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc` (`main`), verified through
Composio account `github_lysis-talion` / `thinksid` on 2026-10-29 UTC.
The checkout was clean before this branch. PR354 / `c0163c6` contains the
completed S1–S5 assessment. This scope implements only its expense-batch slice,
under Santiago's subsequent overnight-work instruction and morning-review gate.
No merge, approval, auto-merge, migration application or deployment is authorized
by this draft. PR359 Faithfulness, PR356 alert work, migration186 and PR324 stay
outside the change.

## Behavior and boundaries

`GastosBatchTable` now calls `fn_fin_gastos_guardar_lote` without an individual
INSERT fallback. A draft UUID survives edits, draft restore and validation
errors; legacy drafts use their first row UUID. Two tabs holding the same draft
therefore cannot create two batches after one has confirmed. A changed payload
under an already committed UUID fails instead of creating another batch.

Before the first RPC, the browser preserves the exact request and its completed
invoice paths in a per-user localStorage entry. An uncertain response locks the
grid and exposes **Verificar lote pendiente**. Reload/retry reuses that payload,
not current blank/edited rows or another upload. The browser removes the matching
draft before removing the pending request. A late response cannot remove another
request or a different draft. Double clicks use a synchronous in-flight guard.

The RPC requires the expected browser user to equal `auth.uid()` and current
`get_user_role()` to be Gerencia. It runs as INVOKER under existing expense RLS.
One transaction inserts an immutable complete receipt and all expense rows,
including `created_by=auth.uid()`. A row validation/FK/trigger failure rolls back
the receipt and all rows. Concurrent identical requests wait on the unique UUID
and return the same committed row IDs. Another user's UUID cannot expose a receipt
or write expenses. Role loss also denies replay.

Definitive SQL rollback classes 22/23/40/P0001 release the pending entry while
retaining the draft UUID for correction. A first-call missing-RPC PGRST202 also
releases it. Network errors, malformed confirmations, auth failures and ambiguous
replays preserve it. A corrupt/full/unavailable local store prevents a new RPC.
For a conflict with an existing receipt, preserve the draft and reconcile the
original request; do not assign a fresh UUID to bypass the conflict.

Invoice upload remains outside the database transaction and otherwise unchanged.
A failure before the RPC can leave an orphan upload, as before. No real Storage
operations occurred during development or tests. Only the `GastosBatchTable`
flow has these guarantees; income, expense import/editor, Telegram, historical
records and F1 are unchanged. Old open tabs with the old direct writer remain a
rollout hazard and must be refreshed before capture.

### Deliberate trust and coverage limits

The receipt is an accidental-retry mechanism, not an unforgeable audit log.
INVOKER needs own-Gerencia INSERT on the new receipt table. A deliberately
malicious Gerencia can insert its own forged receipt directly, just as that role
already controls expense writes. It cannot insert another user's receipt,
UPDATE/DELETE a receipt, or bypass expense RLS through this RPC. The synthetic
SQL test explicitly records this limitation. No persistent access on existing
tables was changed, and no SECURITY DEFINER helper was introduced.

The existing `gastos_batch_draft` key remains shared/unowned. This scope does not
resolve the S4 shared-profile draft policy decision. Pending attempts are per-user,
and the server rejects a changed authenticated actor. Draft contents on a shared
browser retain their prior privacy limitation; do not treat UUIDs as ownership.
Deleting an Auth account cascades only its new receipts; it adds no new account
deletion blocker and does not delete expense records.

No production frontend, edge bundle or live catalog parity was reasserted.
The approved edge-source export HTTP413 gap, separately denied database-source
export, F1 genuine-operator confirmation gaps, and PR324 parked status remain.
This is code-only remediation plus isolated synthetic PostgreSQL/browser evidence.
No private calibration data, providers, production rows, probes, bot messages,
credentials, grants on existing tables or persistent access changes were used.

## Validation

- `npm test`: 4,772 passed across 219 files; no skips reported, local Node24.
  Includes 15 new helper tests for persistence ordering, user identity, lost
  response/reload, rollback correction, changed payload, unavailable/corrupt
  storage, account isolation and malformed confirmations.
- `python scripts/tests/gastos-lote-postgres.py`: 10 groups passed on disposable
  PostgreSQL17, `--network=none`, tmpfs, no ports or farm data. Tests compile the
  exact migration and exercise four concurrent sessions, authorization/actor
  changes, receipt visibility, full rollback and its explicit trust limits.
  The minimal synthetic schema models relevant finance columns/FKs/RLS; it is
  not a complete development Supabase stack or a live catalog reproduction.
- `PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs
  node scripts/tests/gastos-lote-browser.mjs`: actual component, mocked local
  auth/RPC, all external browser requests blocked. Passes lost response, locked
  inputs, reload recovery, stale second-tab replay and viewport overflow at
  1280×900 and 390×844. Browser checks do not reproduce PostgREST transport or
  genuine operator behavior. `PLAYWRIGHT_MODULE`/`CHROMIUM_PATH` select installed
  tools; the script installs nothing.
- `npm run typecheck` and `npm run build`: passed. `npm run lint`: zero errors,
  907 pre-existing warnings; Node reports existing package-module metadata warning.
- Independent read-only reviewer reran 15/15 helper tests and 10/10 PostgreSQL
  groups, reviewed source and browser scenario, and found no remaining blocker.
  It did not rerun the browser. Main agent owns all changes and commits.

The PostgreSQL image was obtained for this isolated local test. No production
connection, secrets or setup scripts were used. Required PR CI is checked on the
published exact head and recorded in the PR/handoff; local results are separate.

## Forward sequencing — separately authorized release only

1. Review the exact draft head. This PR has no code dependency on PR359 or PR356.
   Migration187 follows the existing source filename186 only; this does not
   apply186 or authorize its release. Recheck sequential-number collisions before
   release, and renumber this **unapplied** candidate if a new migration takes187.
2. Test the reviewed additive migration against an authorized development
   Supabase environment, including its actual expense types/triggers/RLS and
   PostgREST roles. Local fixture success does not replace this release gate.
3. At an authorized release, capture the live ledger, existing expense grants,
   RLS, `get_user_role` activity behavior and attribution/expense trigger baseline.
   Verify the new objects are absent. Do not reapply historical migrations.
   Existing187 objects cause an explicit precondition abort, not overwrite.
4. Apply only reviewed187 through the authorized migration workflow. Verify
   INVOKER/search_path, authenticated EXECUTE and own active-Gerencia SELECT/INSERT;
   verify no anonymous access, no receipt UPDATE/DELETE and unchanged expense
   grants/policies. Record the ledger and deployment evidence in the release.
5. Publish the frontend only after that database boundary exists. Refresh old
   tabs. If the database dependency is absent the new UI fails closed; it never
   falls back to direct INSERT. Verify the exact frontend alias/SHA separately.
   Genuine operator confirmation remains separate from synthetic test results.

## Rollback and recovery

Before any receipt exists and before exposing this client, a development rollback
can remove only the new function and table in one transaction. Never apply that
destructive cleanup once requests may have committed.

After exposure, keep the RPC, receipts and every browser pending attempt. Pause
batch capture if the client must be rolled back: restoring the old direct writer
can duplicate an uncertain request. Resolve the original UUID with its original
payload and account before recapturing anything. Do not delete receipt history,
clear browser storage, change a pending UUID, erase an account as a retry workaround,
or repair historical expense records under this scope. F1 receipts stay untouched.

If an explicit validation error persists, correct the original draft and reuse
its UUID; if it conflicts with an existing receipt or the account loses access,
Gerencia must reconcile that specific request. No generic “discard pending”
action converts uncertainty into permission to create another batch.

## Next-session prompt

```text
Review the queued draft on codex/security-expense-batch-retry, not another fix.
Read CLAUDE.md, docs/security-review/{session-guide,plan,progress}.md and
expense-batch-retry.md. Verify exact head CI and independently review the
expense-only recovery contract and unapplied migration187. Keep PR359,
PR356/migration186 and PR324 outside scope. Release requires development Supabase
validation and separate migration/frontend authorization; no merge or deploy
under the overnight queue instruction. Preserve receipts/pending attempts,
edge HTTP413, separate denied DB export and F1 operator-confirmation gaps.
Update the tracker after review. Do not automatically start another remediation.
```
