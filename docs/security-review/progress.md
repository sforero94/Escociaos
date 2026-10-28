# Security review — progress tracker

Updated: 2026-10-27 (America/New_York). This is the session queue and handoff
record, not a claim of current production state. Read [the plan](plan.md) and
[the session guide](session-guide.md) before changing a status.

## Queue

| Scope | Status | Recorded result / required next action | Evidence and gap |
|---|---|---|---|
| F1 — three web inventory save flows | Deployed; live workflow confirmation open | Atomic manual movement, purchase batch and purchase reversal; durable browser retry recovery. Keep receipts and pending attempts. | [PR #353](https://github.com/sforero94/Escociaos/pull/353), [runbook](../runbook_inventario_f1.md). Live UI check blocked by cloud proxy CONNECT 403; no farm transaction used as a test. |
| S1 — remaining writes and F1 boundaries | Next — read-only assessment | Map authorization, transactions, locking and replay across remaining financial/inventory writers and related daily workflows. | Do not infer safety for writers outside the three F1 web flows. Record exact evidence and unchecked paths. |
| S2 — active accounts, role isolation and exposure | Queued — read-only assessment | Complete endpoint/RLS/RPC access matrix and revocation analysis. | `usuarios.tsx` activity-check lead needs full Auth/revocation and backend-parity verification. It is not a verified production vulnerability. |
| S3 — Telegram identity and privileged operations | Queued — read-only assessment | Trace current linked role/activity/module checks through sensitive handlers and stale callbacks. | Linked app activity/role lead remains unconfirmed; do not refile documented binding behavior. |
| S4 — secrets, files and reachable dependencies | Queued — read-only assessment | Triage file boundaries, secret handling and reachable dependency advisories. | `xlsx` parsing lead needs resolved-version, caller and current-advisory verification. No Storage operations. |
| S5 — ranked report and remediation scopes | Queued — assessment close-out | Consolidate verified findings, gaps and separate backlog; define only minimal verified critical/high remediation candidates. | Implementation/release status stays separate from assessment. No automatic fixes. |

Scope IDs S1–S5 label this continuation queue. They do not rename F1 or assign
new finding IDs/severities to unverified leads. Reorder only with a documented
reason, such as a newly verified critical/high issue requiring an urgent decision.
A blocked scope does not block independent read-only work; keep its gap open.

## F1 release evidence

- Reviewed base: `551fcb893a532f36a3ab08281b5cd5e935142df1`.
- Production frontend SHA: `e1518d09ae8f27726499b4a93dfbffbb10516b4f`.
- Vercel deployment: `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED;
  [production alias](https://escociaos.vercel.app) confirmed through deployment
  metadata and the deployment's alias list. This was verified during release;
  reverify at the next session.
- Migration 185: live ledger `20261028014545`,
  `185_inventario_guardado_atomico`. Applied verbatim from PR #353 before the
  frontend release; catalog verified INVOKER, pinned search_path, authenticated
  EXECUTE, no anonymous EXECUTE, receipt RLS and no authenticated receipt DELETE.
  Existing policies, helpers and four inventory triggers matched their prestate.
- Validation: 17 PostgreSQL groups; 4,646 Vitest tests across 210 files on Node20;
  typecheck/build passed, lint had no errors and existing warnings. Isolated
  GoTrue/PostgREST checks covered retry, role downgrade and anonymous denial.
  Chromium desktop/mobile recovery checks passed.
- [CI run 40617100406](https://github.com/sforero94/Escociaos/actions/runs/40617100406)
  passed on the reviewed PR head. [Release notes in the PR](https://github.com/sforero94/Escociaos/pull/353)
  contain the final deployment and rollback record.
- Limitation: direct live HTML/assets/UI check was denied by the cloud proxy
  (CONNECT 403). Do not label this a failed farm workflow or claim a live UI pass.
  Refresh existing tabs before inventory capture. Confirmation may come from the
  next legitimate operator transaction; do not fabricate one for assessment.
- Rollback reference: `dpl_3D5xWNdzXZY9zLaAN6aMXBCAEwZN`,
  SHA `551fcb893a532f36a3ab08281b5cd5e935142df1`. Preserve RPC/receipts and pending
  browser attempts. The old frontend reintroduces F1; pause capture and resolve
  uncertain attempts before using it.

## Coverage gaps to carry forward

- Backend source SHA/live bundle parity was not established by the frontend
  release. The earlier backend version/hash is in [the plan](plan.md); it must
  be reverified, not asserted as current.
- F1 catalog verification covers its relevant objects; it does not establish
  parity or safety for all live RLS policies, RPCs, financial or Telegram paths.
- No business data, live exploit probes, Storage operations or production test
  transactions were used. Keep this boundary unless the user explicitly changes it.
- Five internal users and documented role exceptions affect exploitability.
  Recheck the current role model without querying personnel/business rows.
- The old PR324 redesign and its preserved local WIP remain parked. Do not make
  finishing or deploying that work a dependency of this queue.

## Findings and remediation register

F1 is the confirmed and released item above. For new results, add a row only
when the selected scope supplies evidence. Preserve existing finding IDs if
available; do not convert a lead into a finding merely to populate the register.

| Finding / scope | Classification and severity | Evidence at exact SHA / verified configuration | Workflow and realistic prerequisites | Confidence | Smallest fix and focused verification | Status / PR / release / rollback |
|---|---|---|---|---|---|---|
| F1 | Verified integrity defect; remediated for the three named web flows | PR #353 and migration/release evidence above | Authorized inventory capture; interrupted, overlapping or retried browser writes | High for tested flows; other writers unassessed here | Atomic RPC, product locks and durable request receipts; regression record above | Deployed; live operator confirmation open; preserve receipts on rollback |

Keep an unconfirmed path in its scope notes with its missing evidence. Do not
assign it a verified severity. Add medium/low hardening and redesign below,
separate from immediate remediation candidates.

## Separate backlog

No new backlog item is approved by this document. Add only evidence-backed
items from S1–S5 with priority, reason for deferral, acceptance criteria and links.
A redesign remains deferred unless the user explicitly selects it.

## Session log

### Plan and handoff committed

- Scope: preserve the remaining review plan after F1; documentation only.
- Source: F1 release/chat decisions and repository instructions at
  `e1518d09ae8f27726499b4a93dfbffbb10516b4f`.
- Change: ordered scopes, this tracker, the mandatory session close-out contract
  and a ready-to-use next prompt. No implementation or production changes.
- Checks: repository lint passed (existing warnings only); relative links, fenced
  blocks, queue IDs and release references checked; `git diff --check` passed.
  No application code changed, so no new runtime tests or production checks.
- Publication: branch `docs/security-review-session-plan`. The first GitHub tree
  upload was rejected because public disclosure was not explicit. The user then
  explicitly approved public publication ("Yes push"). This entry records that
  approval; the session close-out supplies the verified remote commit and PR.
- Next: S1. F1's live confirmation gap remains open independently.

### Template for each completed or paused scope

Copy and fill this block; do not overwrite previous session evidence.

```text
Date / scope / mode:
Outcome: assessed | blocked | deferred | ready for remediation | implemented | deployed
Code SHA / branch / PR:
Verified frontend deployment SHA / ID / alias:
Verified backend version/source metadata:
Relevant catalog / ledger evidence:
Covered paths and findings/dispositions:
Checks and results (or why no execution was needed):
Missing evidence / unchecked areas / exact blocker:
Minimal critical/high candidate / separate backlog:
Production changes actually performed (if authorized):
Release verification / rollback (if applicable):
Tracker commit or PR reference:
Next scope and first action:
Copy-ready next-session prompt:
```

A commit cannot record its own final SHA. Record the source/reviewed SHA in the
file and return the resulting commit/PR in the session response; link that result
in the next session entry. Do not loop commits to embed self-referential hashes.

## Prompt to start the next scope

```text
Continue the Escocia OS security review. Read CLAUDE.md,
docs/security-review/plan.md, docs/security-review/session-guide.md and
docs/security-review/progress.md, plus applicable module instructions and skills.
Start S1 — remaining writes and F1 boundaries — as a bounded READ-ONLY assessment.
F1 is deployed via PR #353; preserve its receipts and pending-request behavior.
First verify the exact current checkout and production deployment/catalog baseline.
If backend source or live metadata is unavailable, proceed code-only and record
that gap. Map the remaining financial/inventory writers, authorization boundaries,
transaction/lock/retry behavior, and interactions with the three F1 web flows.
Prioritize practical farm workflow risks. No business-data queries, production
writes, live probes, Storage operations, installations or PR324 redesign.
Report verified critical/high findings promptly; keep leads and backlog separate.
Use S1's completion criteria. Update and commit the tracker at scope close-out,
then conclude with a copy-ready prompt to start S2. Do not auto-start S2 or fixes.
```
