# Expense-batch retry — dependent frontend activation

Status: draft preparation against main. Source and local synthetic validation are
complete; production migration187 is applied and verified in live ledger
`20261029183837` (2026-10-29). See [release evidence](expense-release-readiness.md).
Actual operator Chrome/Safari Web Locks capability remains unverified. Main
auto-deploys: do not mark ready or merge before operator verification and specific
frontend release authorization. The database runbook retains all trust limits and
rollback constraints. Earlier assessment records below are historical.

## Parent-review blockers and correction

Combined PR360 at6e4a882 was not ready despite green CI and the earlier review.
Two tabs could read “no pending,” overwrite different invoice/edit payloads under
one UUID, and erase a committed-but-lost response through UUID-only22xx cleanup.
Database deduplication did not establish durable browser recovery. The combined
frontend also called an unapplied RPC immediately on main merge.

The source is now split: PR360 leaves the existing frontend identical to main;
this dependent PR contains only activation, helper/types, focused tests and this
handoff. No source default-off gate, deployment-setting changes, migration
application, merge or production deployment occurs during preparation.

## Origin-wide request ownership

The helper requires native **Web Locks** (`navigator.locks.request`) and takes
one exclusive lock per origin/user. It acquires that lock **before reading the
pending entry** and holds it across write, RPC response/error processing and
synchronous confirmed draft/request cleanup. It does not implement advisory
localStorage locks, timeout stealing, unlocked cleanup or a legacy INSERT fallback.
A hung tab retains ownership until its request finishes or its browser realm
closes. Closing that realm releases the lock but preserves its durable request.

Submission captures a copy of the intended payload before waiting. After lock
acquisition, an existing request is reused without overwriting it. A waiting tab
with another UUID or changed payload is rejected locally; different edits or
uploaded invoice paths cannot replace the owner's recovery data. The matching
server PGB01 conflict, plus legacy22023, always preserves the request. New explicit SQL validation returns23514; UI also rejects whitespace-only names.
Standard22/23/40/P0001 rollback errors (excluding22023), and missing-RPC PGRST202, permit
correction only on a first attempt. Any error on an uncertain replay retains it.

All pending-request cleanup compares **UUID and exact frozen payload**, not UUID alone. Confirmed
cleanup runs inside the same lock; if account state changes, the callback declines
cleanup, or callback/storage access fails, pending recovery remains. A changed
pending payload detected after RPC success prevents form cleanup. Noncooperating
manual storage mutation is not prevented by Web Locks; it is detected and cannot
cause the helper to delete another tuple. Old deployed direct writers do not
participate and must be refreshed before activation.

Unsupported/insecure browser contexts without Web Locks fail before new pending
writes, uploads or RPC calls. No fallback writer or advisory lock is permitted.
The UI reports the browser limitation and preserves pending data; use an updated
compatible browser in the original profile/context to recover its local state.
This capability requirement must be checked for legitimate operators before
release, not guessed from user-agent strings. No provider/browser compatibility
matrix or production-device confirmation is claimed by these local tests.

## Remaining behavior and boundaries

The UI retains draft UUIDs across edit/restore/reload, freezes an uncertain batch
and exposes **Verificar lote pendiente**. Retry reuses already uploaded invoice
paths. It removes only a matching draft, before pending cleanup, including its
empty-grid autosave timer. The original shared/unowned draft key and generic
cross-tab draft editing remain the prior S4 privacy/contention risk; protected
pending requests are separate. Uploads before RPC can still leave orphan files.
No real Storage operations occurred. Stable request IDs are not user ownership.

The server still verifies expected user/current active Gerencia before replay,
uses existing expense RLS under INVOKER, and commits receipt+rows atomically.
The browser lock is not a database authorization boundary. Gerencia can still
forge its own receipt through direct INSERT; this is not an unforgeable audit log.
Income, editors/imports, Telegram, historical repairs, F1, PR324, PR356/migration186
and Faithfulness359/361 stay excluded. Preserve HTTP413 edge export, separate
denied DB export and F1 genuine-operator gaps. No production parity is asserted.

## Regression evidence and limitations

- Focused Vitest tests model a deterministic lock queue and force both payload/
  invoice variants to contend under one UUID while the owner commits and loses
  its response. They assert one sender, no overwrite and exact retained recovery.
  They also test full-tuple cleanup under deliberate external replacement,
  conflict preservation, blank-name23514 correction under the same UUID,
  replay errors, callback/account-change failure,
  unsupported locking, corruption/quota errors and malformed confirmations.
  A mocked lock queue is deterministic scheduling evidence, not a real browser.
- `scripts/tests/gastos-lote-browser.mjs` uses actual Chromium Web Locks in two
  separate same-origin pages. A controlled RPC barrier holds the owner's lock
  after a synthetic commit; the second page must appear in the native pending
  lock queue. Both contender orders use different edits/invoice paths. The owner
  loses its response; the waiter never sends/overwrites, and reload replays the
  exact original payload. It also checks actual component recovery at1280×900/
  390×844, stale-tab replay, newer-draft retention after autosave and unsupported
  locking. All external browser requests are blocked.
- **The original browser script simulates RPC/auth.** Later
  `gastos-lote-local-stack.py` and its browser companion close the local transport
  gap: nine real Auth/PostgREST groups and five real Chromium browser scenarios
  pass against an empty synthetic stack. This does not establish production
  schema/policy/trigger parity or genuine operator Chrome/Safari compatibility.
- Final local tree: 4,786 tests/219 files (29 focused helper tests included),
  no skips; typecheck/build pass; lint0 errors/907 existing warnings. The exact
  SQL dependency passed all ten PostgreSQL groups. Independent re-review reran
  29/29 helper tests with no blocker; it previously reran the native-browser
  baseline, while main reran the expanded owner/waiter/whitespace scenario.
  Exact-head CI belongs in the PR/handoff; historical combined-head greens do
  not establish this revised contract.

## Activation and rollback order

PR360 is merged and exact187 is applied in production, ledger20261029183837.
Retarget the existing draft to current main and verify exact-head CI. Confirm
operator Web Locks support before specific frontend merge/deployment approval.
Do not reapply187 or use production expense transactions as validation.

After exposure, keep RPC/receipts and all browser pending entries on rollback.
Pause affected capture before reverting to the old direct writer. Resolve the
original request/account/payload; never clear pending storage, change UUIDs,
steal locks or recapture an uncertain batch as a workaround.

## Next-session prompt

```text
Review the existing PR362 draft against current main and its exact-head checks.
Read current production receipt and local real-stack evidence in
expense-release-readiness.md. Do not reapply187: ledger20261029183837 is verified.
Confirm native Web Locks in each actual Chrome/Safari operator profile over HTTPS,
then obtain specific frontend ready/merge authorization. Preserve frozen payloads,
PGB01/legacy22023 conflicts and prior exclusions. No other remediation.
```
