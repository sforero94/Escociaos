# Security review — progress tracker

Updated: 2026-10-28 (America/New_York). This is the session queue and handoff
record, not a claim of current production state. Read [the plan](plan.md) and
[the session guide](session-guide.md) before changing a status.

## Queue

| Scope | Status | Recorded result / required next action | Evidence and gap |
|---|---|---|---|
| F1 — three web inventory save flows | Deployed; live workflow confirmation open | Atomic manual movement, purchase batch and purchase reversal; durable browser retry recovery. Keep receipts and pending attempts. | [PR #353](https://github.com/sforero94/Escociaos/pull/353), [runbook](../runbook_inventario_f1.md). Live UI check blocked by cloud proxy CONNECT 403; no farm transaction used as a test. |
| S1 — remaining writes and F1 boundaries | Assessed with gaps — read-only | Writer matrix and five medium integrity defects recorded; no new verified critical/high candidate or remediation. | [S1 assessment](s1-assessment.md). Frontend/F1 ledger reverified; backend v279 source parity and broader DB body comparisons remain open after export rejections. |
| S2 — active accounts, role isolation and exposure | Next — read-only assessment | Complete endpoint/RLS/RPC access matrix and revocation analysis, including owner-only daily movement UPDATE/DELETE. | `usuarios.tsx` and importer activity leads need full Auth/revocation and backend-parity verification. Current account roster is unchecked; historical counts are not current evidence. |
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

| S1 — finance batch retry | Verified source integrity defect; medium | Pinned batch capture links and live PK-only unique indexes in [S1](s1-assessment.md) | Gerencia retries after a committed INSERT response is lost; duplicate expense/income batch | High for source path; no actual duplicate data queried | Stable operation key and transactional receipt; lost-response/reload regression | Assessed; backlog only; no implementation/release; additive rollout and receipt-preserving rollback proposed |
| S1 — application plan replacement | Verified source integrity defect; medium | Pinned editor deletes/reinserts and boundary matrix in [S1](s1-assessment.md) | Authorized plan edit interrupted after deletes or during inserts; partial saved plan | High for source path; child-policy parity incomplete | One role-preserving save transaction; fail-after-delete rollback regression | Assessed; backlog only; no implementation/release |
| S1 — daily movement capture | Verified source integrity defect; medium | Pinned capture, live parent/child RLS, trigger metadata and PK-only index in [S1](s1-assessment.md) | Authorized operator interrupted between parent/product/worker commits | High for source path; no farm-data damage asserted | Atomic keyed capture; failure-stage and lost-response regressions | Assessed; backlog only; no implementation/release |
| S1 — Telegram labor replacement | Verified code integrity defect; medium; production applicability unconfirmed | Pinned `jornal.ts` DELETE then INSERT in [S1](s1-assessment.md); deployed source export rejected | Bound labor operator replaces registrations and second request fails | High for repository code; backend parity open | Single replacement RPC with actor/request checks; failing INSERT preserves originals | Assessed code-only; backlog only; no implementation/release |
| S1 — dairy death event/state | Verified source integrity defect; medium | Pinned hook and live G/A RLS/trigger metadata in [S1](s1-assessment.md) | Event commits but animal-status update fails; hook warns and asks manual correction | High for source path; partial-save warning limits impact | Atomic event/state operation; second-write failure and retry regressions | Assessed; backlog only; no implementation/release |

Keep an unconfirmed path in its scope notes with its missing evidence. Do not
assign it a verified severity. Add medium/low hardening and redesign below,
separate from immediate remediation candidates.

## Separate backlog

No new backlog item is approved by this document. Add only evidence-backed
items from S1–S5 with priority, reason for deferral, acceptance criteria and links.
A redesign remains deferred unless the user explicitly selects it.

S1 proposes the five medium items above for later prioritization, in that order;
none is approved for implementation. [S1](s1-assessment.md) records a smallest
fix, focused regression and rollout/rollback boundary for each. Additional design
risks: cross-RPC lock ordering, closure payload validation and labor daily-total
concurrency/nullable uniqueness. These need bounded evidence or an owner decision;
do not promote them to verified high findings. CSV opening balances remain a
previously documented design choice. No historical data repair is authorized.

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

### 2026-10-28 — S1 assessed with gaps (read-only)

- Source: `3fd28b988163d15f4711efd5e303eda54cbdadde`, branch
  `docs/security-review-session-plan`, [PR #354](https://github.com/sforero94/Escociaos/pull/354).
  Application/backend source trees match F1 `e1518d0…`; isolated clean branch
  used. PR324 and unrelated work were not touched.
- Outcome: [writer/boundary matrix and assessment](s1-assessment.md), five medium
  integrity results, explicit negative results/accepted behavior and unchecked
  paths. No verified new critical/high issue; queue remains S1 → S2.
- Frontend reverified by Vercel metadata/alias list: `e1518d0…`,
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED,
  `escociaos.vercel.app`. No new live browser or operator workflow confirmation.
- Backend: LIST_FUNCTIONS reports v279 ACTIVE, verify_jwt=false; prior hash
  unchanged, entrypoint directory still v278. Source parity remains unverified.
- Catalog: 185 ledger unchanged (`20261028014545`); 14 sampled tables' RLS,
  active-role helpers, receipt/domain grants, nine RPC/trigger metadata entries,
  eighteen enabled domain triggers and selected constraints/indexes inspected.
  Local literal-body MD5 matched F1, quincena save (085) and treatment (140).
  Other literal hashes differ; semantic drift is not established.
- Automatic approval review blocked full deployed edge-source export, citing
  sensitive implementation/embedded-secret exposure through connector/workbench;
  separately blocked broad trigger/RPC body export as sensitive production source.
  No denied source was returned. Metadata-only reads proceeded successfully.
  Full body comparisons require explicit applicable approval; do not reroute.
- Checks: repository lint passed with 907 existing warnings and zero errors;
  source/tree identity and local body hashes checked nonmutatingly. Documentation
  links, pinned line references, fence balance and `git diff --check` checked.
  No new runtime tests: no application code changed; F1 release evidence reused.
  No installations, suite/replay loops, production UI tests or mobile retest.
- Changes: tracker and S1 evidence document only. No business-data queries,
  production writes, migrations, merges, deployments, Storage operations, exploit
  probes, account changes or bot messages. No remediation implemented/deployed.
- Publication: commit on PR #354's branch; resulting commit/publication outcome
  reported in the session response. This file does not claim availability on main.
- Next: S2 only. Trace user-management deactivation through Auth ban/revocation,
  current handlers/helpers and owner-only daily movement policies; complete the
  read/write/exposure matrix. Full backend parity is a gap, not a prerequisite for
  independent read-only source assessment. Next prompt below.

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
Continue the Escocia OS security review from PR #354,
branch docs/security-review-session-plan (S1 assessment committed after 3fd28b9).
Read CLAUDE.md, docs/security-review/plan.md,
docs/security-review/session-guide.md, docs/security-review/progress.md and
docs/security-review/s1-assessment.md, plus relevant module instructions/skills.
Start only S2 — active accounts, role isolation and data exposure — as a bounded
READ-ONLY assessment. S1 is assessed with gaps; five medium integrity defects
are deferred, no new critical/high finding or remediation was approved.
First verify current code/deployment/catalog baseline. Last observed frontend:
e1518d09ae8f27726499b4a93dfbffbb10516b4f; edge metadata v279, source parity open.
Start with usuarios.tsx deactivation/Auth banning and session revocation, then
trace active-role enforcement, owner-only daily movement UPDATE/DELETE and
cross-role finance/personnel/export access through handlers, RLS and RPCs.
Do not infer current account roles/counts from historical memory. No business-data
or personnel-row queries. Full deployed edge/DB source exports were rejected by
automatic approval review; keep those comparisons pending unless specifically
approved. Independent repository and permitted metadata assessment can proceed.
Preserve F1 receipts/pending attempts and its open live operator-confirmation gap.
No production writes, live probes, Storage operations, new credentials,
installations, PR324 work or redesign. Do not start fixes or S3 automatically.
Update and commit the tracker, report evidence/checks/gaps and release state,
then conclude with a copy-ready prompt for S3.
```
