# Security review — progress tracker

Updated: 2026-10-28 (America/New_York). This is the session queue and handoff
record, not a claim of current production state. Read [the plan](plan.md) and
[the session guide](session-guide.md) before changing a status.

## Queue

| Scope | Status | Recorded result / required next action | Evidence and gap |
|---|---|---|---|
| F1 — three web inventory save flows | Deployed; live workflow confirmation open | Atomic manual movement, purchase batch and purchase reversal; durable browser retry recovery. Keep receipts and pending attempts. | [PR #353](https://github.com/sforero94/Escociaos/pull/353), [runbook](../runbook_inventario_f1.md). Live UI check blocked by cloud proxy CONNECT 403; no farm transaction used as a test. |
| S1 — remaining writes and F1 boundaries | Assessed with gaps — read-only | Writer matrix and five medium integrity defects recorded; no new verified critical/high candidate or remediation. | [S1 assessment](s1-assessment.md). Frontend/F1 ledger reverified; backend v279 source parity is blocked by connector HTTP 413 after user-approved export; broader DB body export remains unapproved. |
| S2 — active accounts, role isolation and exposure | Assessed with gaps — read-only | Access matrix and revocation analysis complete for named surfaces; no new verified critical/high issue. | [S2 assessment](s2-assessment.md). Auth ban in edit confirmed in source; inactive creation/service-role activity path unconfirmed. Owner-only revocation and existing broad SELECT class deferred. Edge payload limit and separate DB-export boundary remain. |
| S3 — Telegram identity and privileged operations | Assessed with gaps — read-only | Identity/operation and callback/replay maps complete; two medium source results, no new verified critical/high issue. | [S3 assessment](s3-assessment.md). App/bot revocation is independent; module freshness and alert claim/effect gaps are code-only. Edge parity and separate DB-export boundary remain open. |
| S4 — secrets, files and reachable dependencies | Assessed with gaps — read-only | Locked xlsx 0.18.5 and browser/edge parser reachability verified against current primary advisories; file/secret/persistence boundaries mapped. | [S4 assessment](s4-assessment.md). Known dependency risk retained; shared-profile draft risk recorded. No new verified critical/high candidate. Live Storage and edge parity unchecked; full lint still open. |
| S5 — ranked report and remediation scopes | Closed with gaps — read-only consolidation | Seven medium source findings retained; no new verified critical/high candidate. Proposed next backlog decision: expense-batch retry only; no implementation. | [S5 consolidation](s5-consolidation.md). Documentation-only merge recommendation is conditional on reviewer acceptance, stale PR metadata refresh and final-head checks. Local full-lint/evidence gaps remain. |
| Expense-batch retry — DB prerequisite | Draft PR360, revised after parent blockers; not applied | Migration187 + PostgreSQL tests/docs only; frontend matches main. Review before dependent activation. | [DB runbook](expense-batch-retry.md); development Supabase and authorized DB application gates remain. |

The bounded S1–S5 review closed with gaps. The later overnight instruction
authorized expense-only implementation; the morning-review instruction requires
queued drafts without merge. The historical S5 close-out below remains unchanged.
The current decision and merge/test qualifications are in
[S5](s5-consolidation.md); the PR title/body still describe S1 and are stale.
Existing CI success is recorded separately from historical local lint counts.

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


| S3 — module revocation during conversation | Verified source authorization gap; medium; production applicability unconfirmed | Entry-only module checks, resumed save paths and Telegram-only resolver in [S3](s3-assessment.md) | Previously authorized operator resumes an active flow after only its bot module is removed; Telegram row remains active | High for mapped source predicates; deployed edge/plugin behavior remains open | Current module/identity check at write; development start/revoke/resume, disabled identity and field-exception regressions | Assessed code-only; backlog only; no implementation or release |
| S3 — alert claim before domain effect | Verified source integrity defect; medium; production applicability unconfirmed | Conditional claim then separate domain write with log-only error in [S3](s3-assessment.md) | Legitimate alert response; claim commits and required secado/step write fails; closed state suppresses repair by retry | High for source failure path; full deployed edge/trigger parity open | Atomic claim/effect with focused failure, retry/concurrency and already-resolved tests; additive DB-before-edge rollout | Assessed code-only; backlog only; no implementation or release |

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

S2 adds no immediate remediation candidate. [S2](s2-assessment.md) records a
medium design risk in owner-only role revocation and the existing broad-read
hardening class. Confirm intended retained owner capability before selecting a
policy change. Inactive account creation plus service-role role-only gates is an
unconfirmed production path; resolve edge parity and development Auth evidence
before assigning live severity. No account roster or real-user behavior verified.


S3 adds the two medium source items above for later prioritization; neither is
approved for implementation. [S3](s3-assessment.md) distinguishes independent
app/bot revocation (medium design risk), legitimate stale buttons, session/delivery
replay uncertainty and own-memory token expiry/replay (low-impact design risk).
Do not refile accepted event-undo/binding behavior, the retained income permission
or the retired expense flow. No new verified critical/high remediation candidate.


S4 records the known reachable SheetJS risk as medium in this internal workflow,
separate from advisory severity; no replacement or upgrade is approved.
[S4](s4-assessment.md) also records shared-profile draft persistence (medium design
risk), local log minimization and archive/input resource limits. Preserve intentional
draft recovery/cancel behavior and F1's separate receipts/pending attempts.
Live Storage authorization remains unchecked by explicit scope restriction.
No new verified critical/high candidate was added to the remediation register.


S5 selects **no immediate critical/high remediation**. The proposed next
medium-priority decision is an expense-batch-only slice of S1 finance retry:
one save/receipt boundary with synthetic lost-response/reload/role/ownership
regressions, database-before-frontend ordering and receipt-preserving rollback.
Income, attachments/Storage, individual editors, bots, historical repair and F1
are excluded. This is a concrete backlog proposal, not implementation approval.
See [S5](s5-consolidation.md). The existing seven findings and separate risks
keep their classifications; the review does not certify production security.

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

### 2026-10-28 — approved edge export follow-up (S1 only)

- User explicitly approved retrieving the full deployed edge-function source
  through connector/workbench after S1 closed at commit
  `1bb37a99cd3804ee546272e135410087a574cd28` on PR #354.
- Retrieval ran through `SUPABASE_GET_FUNCTION_BODY` using the documented
  `supabase_bitis-coward` account/project, first through multi-execute and then
  within the approved workbench to handle the oversized response. Both returned
  HTTP 413, code 4345 / `ToolRouterV2_PayloadTooLarge`; neither returned source.
  The tool schema has no pagination or field-selection argument. No source
  comparison ran, no new backend parity result was established, and no source
  was added to the repository.
- `SUPABASE_LIST_FUNCTIONS` reverified v279 ACTIVE, verify_jwt=false, same hash
  and version-278 entrypoint directory. This remains metadata, not source proof.
- The edge-source permission gap is resolved; its current blocker is the
  connector payload limit. The distinct broad database-source export rejection
  remains unresolved and unapproved. Do not treat edge approval as DB approval.
- Checks: documentation links/fences and `git diff --check`; lint passed with
  the same 907 warnings and zero errors. Documentation only; no runtime tests
  or production operations. Findings, severity and release state are unchanged.
- Next remains S2; no S2 assessment or remediation was started. Independent
  source/catalog work can proceed with the size-limit parity gap recorded.

### 2026-10-28 — S2 assessed with gaps (read-only)

- Source: `470c2d41934a40e9b23af50b91924b438b5e06d8` from PR #354;
  clean isolated branch `security-s2-assessment`. `src/` and `supabase/` match
  F1 production source `e1518d0…`. Unrelated work and PR324 were not touched.
- Outcome: [S2 access/revocation assessment](s2-assessment.md). Normal account edit
  includes an Auth ban; current-role backend checks refute cached-role-only
  escalation. No new verified critical/high issue. No remediation started.
- Inactive creation has no ban in source, while privileged handlers read role
  without activity. This remains an unconfirmed production path, requiring
  deployed source parity and development Auth/provisioning evidence. No claim of
  actual affected accounts, indefinite normal-ban access or live self-reactivation.
- Live policy revocation limit: daily-movement owner UPDATE/DELETE has no active
  role clause; report owner DELETE and memory owner ALL have related own-data
  limits. Medium design risk; no observed deactivated session or data mutation.
  Existing broad authenticated SELECT class remains deferred, not refiled.
- Frontend reverified: `e1518d09ae8f27726499b4a93dfbffbb10516b4f`,
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED and production alias
  `escociaos.vercel.app`. No live browser/operator confirmation added.
- Backend reverified: v279 ACTIVE, verify_jwt=false, same recorded hash and
  version-278 entrypoint. Approved edge-source export remains blocked by HTTP
  413 / ToolRouterV2_PayloadTooLarge (4345); no repeated export attempted.
  Separate broad database-source export remains unapproved after the earlier
  automatic-review rejection; no body export or alternate route attempted.
- Catalog: latest 185 ledger unchanged; all 13 finance tables' policies examined,
  named personnel/labor/owner/chat policies, grants/RLS for 22 relations, seven
  INVOKER view options and 18 selected/DEFINER function metadata entries checked.
  Local literal MD5 matches live role helper 137, author resolver 155 and both
  schedule helpers 175. Cleanup 082 literal differs; no behavioral drift inferred.
  Daily parent creator column and trigger metadata checked without domain rows.
- Gaps: Auth TTL/session/ban runtime behavior, provisioning hooks, current roster,
  complete live RPC/trigger bodies, unsampled child/column policies and Storage
  remain unchecked. S3 linked app/Telegram identity analysis remains next.
- Checks: documentation links/pinned line references, fence balance, scope-only
  diff and `git diff --check` passed; repository lint passed with zero errors
  and the same 907 existing warnings.
  No runtime tests or mobile retest: documentation only. No installations,
  whole-suite/replay loops or production operations.
- Publication: continue PR #354 through its existing documentation branch;
  resulting commit and publication outcome reported at close-out. The tracker
  does not claim merge or availability on main.
- Next: S3 only; start at webhook validation and linked-identity freshness before
  sensitive service-role handlers. Preserve documented binding exceptions, S1
  medium backlog, F1 receipts/pending attempts and its live confirmation gap.

### 2026-10-28 — S3 assessed with gaps (read-only)

- Source: `6bc295196237d2a9d855a406a333464e22b0fef8`, PR #354,
  branch `docs/security-review-session-plan`. Pinned Git tree reads confirm
  `src/` and `supabase/` match F1 `e1518d0…`; all 15 Telegram mirror blobs
  match. Review guidance, S1/S2, security memory and relevant module contracts read.
- Outcome: [S3 identity-to-operation/replay assessment](s3-assessment.md).
  Webhook secret gate refutes the old anonymous-spoofing lead in source.
  Active Telegram identity is checked before each resumed update; linked app
  activity/role and current bot module checks differ across operations.
  Two new medium source results: module removal during an active conversation,
  and general alert claim before required domain effect. Production applicability
  remains unconfirmed. No new verified critical/high issue or remediation.
- Independent app/bot revocation is a medium design risk, not an asserted live
  bypass. An Auth ban does not by itself establish Telegram revocation.
  Preserve field identities, binding/undo exceptions, retained income permission,
  retired expense flow, S2 uncertainties and S1's existing medium backlog.
- Frontend metadata/alias reverified: `e1518d09ae8f27726499b4a93dfbffbb10516b4f`,
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED and
  `escociaos.vercel.app`. No live browser/operator confirmation added.
- Edge metadata reverified: v279 ACTIVE, verify_jwt=false, same hash and
  version-278 entrypoint. Approved edge-source export remains blocked by
  HTTP 413 / ToolRouterV2_PayloadTooLarge (4345), with no repeated export.
  The separate broad database-source export remains unapproved after the earlier
  automatic-review rejection. No body export or alternate route attempted.
- Catalog/ledger SELECTs only: latest 185 unchanged; Telegram RLS, 15 selected
  ronda/treatment function metadata entries, selected unique indexes and
  noninternal trigger metadata. Literal hashes match 132, 147 and 177;
  140's existing match retained. Other literal differences do not prove
  semantic drift. 177's safe selected-step flow is distinct from general alerts.
- Replay dispositions: ronda state/actor/lock guards, event/straw uniqueness,
  per-cell weighing and documented undo limits retained. No durable webhook
  receipt inferred from persisted conversations or `conversation.external`.
  Delivery concurrency, exact plugin crash recovery and live recipient/account
  state remain unchecked; no duplicate data or unauthorized operator asserted.
- Execution gap: supplied local branch `5163501` lacked the requested commit
  and documents. Direct Git access failed DNS; Composio clone timed out and its
  file mount disconnected. Pinned GitHub file reads supplied the reviewed source.
  A temporary subset supported local hash checks; the local execution environment
  later disconnected. No clean full local checkout or local commit claimed.
- Checks: pinned source/tree/blob identity and local literal-body MD5 comparison;
  documentation links/line bounds, fences, whitespace, scope and credential
  checks. Lint could not run after executor disconnection; do not reuse S2's
  907-warning pass as a new result. No runtime suites, installations, mobile test,
  production UI test or live probe. Publication verification recorded at close-out.
- Changes: S3 assessment and this tracker only. No application changes,
  business/personnel queries, production writes, Storage operations, messages,
  migrations, merges, deployments, PR324 work or redesign. F1 receipts/pending
  attempts, old-tab risk and legitimate-operator confirmation remain open.
- Publication: commit with parent `6bc2951` through PR #354's existing branch;
  resulting commit/publication outcome returned in the response. No merge/main
  availability or production release is claimed.
- Next: S4 only, beginning with source/configuration file boundaries and reachable
  resolved-version/advisory triage. S4 was not started.

### 2026-10-28 — S4 assessed with gaps (read-only)

- Source: `71f4d57feedca33dccf25ff94eb1b51ba4383efb`, PR #354,
  branch `docs/security-review-session-plan`. PR open/unmerged at start.
  Git tree/blob metadata confirms `src/`, `supabase/` and lockfile still
  match F1 frontend `e1518d0…`. Root/review guidance, S1–S3, relevant
  module contracts and security exceptions read.
- Outcome: [S4 secret/file/dependency assessment](s4-assessment.md). The lockfile
  resolves production `xlsx` to 0.18.5; the dairy preview independently pins it.
  Browser expense/income/monitoring readers and authenticated G/A edge preview
  are reachable in source. Parsing can precede write-role checks. Current vendor
  and GitHub primary advisories CVE-2023-30533 / CVE-2024-22363 apply to these
  readers; export-only helpers are distinguished. Known risk retained as
  contextual medium/backlog, not a newly asserted high production exploit.
- File/source map: invoice uploads/signing, hato workbook/photo/OCR endpoints,
  Word extraction/confirm-before-persist, report/download paths, browser
  credentials, selected logs and drafts. No Storage API/catalog or object
  operations. Historical Storage exceptions remain gaps, not claimed closed.
  No secret values, logs, business/personnel rows, private files or live
  recipient/account state were read.
- Drafts: fixed form keys omit account identity; normal sign-out does not clear
  application drafts. Quincena intentionally retains a financial draft on cancel.
  Medium shared-browser-profile design risk; preserve recovery behavior.
  No actual cross-account session tested; financial form reset effects qualify
  any claim of visible restore. Hook age handling differs; no universal TTL claim.
- Frontend metadata/alias reverified: `e1518d09ae8f27726499b4a93dfbffbb10516b4f`,
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED and
  `escociaos.vercel.app`. No live UI/operator test.
- Edge metadata remains v279 ACTIVE, verify_jwt=false, same hash/version-278
  entrypoint; edge observations remain code-only. Approved source export remains
  blocked by HTTP 413 / ToolRouterV2_PayloadTooLarge (4345). Separate broad
  database-source export remains rejected/unapproved. Neither export retried
  or rerouted. Latest ledger remains 185 `20261028014545`.
- Execution: original local branch `5163501` is unrelated and unchanged.
  Existing Git blobs plus pinned GitHub file reads supplied a temporary source
  snapshot. The bulk read host closed stdout; 174 source files remain unavailable.
  `npm run lint` on the incomplete snapshot using installed local dependencies
  reported 0 errors / 705 warnings. This is a partial result, not an improvement
  over S2's 907 warnings or a full target lint pass. S3's full-lint gap remains.
- Checks: source/lock/tree identity, primary advisory review, document
  links/pinned line bounds, fence/whitespace checks, credential-pattern/scope
  checks and publication verification at close-out. No test payloads, runtime
  suite, installations, mobile test or backend calls from local scripts.
- No fixes, application changes, production writes, new credentials,
  permissions changes, Storage operations, messages, migrations, merges or
  deployments. No PR324 work or redesign. F1 receipts/pending attempts and
  legitimate-operator confirmation, S1 backlog, S2 uncertainties and S3
  identity/replay/alert gaps all carried forward.
- Publication: S4 assessment and tracker only on PR #354's existing branch;
  resulting commit/publication outcome returned at close-out. No main/production
  availability claimed.
- Next: S5 only — consolidate S1–S4, preserve classifications and exact gaps,
  and propose only minimal verified critical/high remediation if evidence supports
  one. Otherwise state that none qualifies and identify the next bounded decision.
  S5 was not started.

### 2026-10-28 — S5 consolidated and closed with gaps (read-only)

- Reviewed source: `9720032de31ed8ab6b7283f7bb1d22f06d3b3152`, PR #354,
  branch `docs/security-review-session-plan`, open/unmerged at start.
  Root/review guidance and S1–S4 evidence, exceptions and limits consolidated.
  Source/edge tree IDs and lockfile blob still match F1 `e1518d0…`.
- Outcome: [S5 ranked consolidation and decision](s5-consolidation.md).
  Seven medium source findings retained; no new verified critical/high production
  candidate, remediation approval or fix. Access/identity/dependency/privacy
  risks remain separate from verified source findings and from live exploits.
- Proposed next decision: expense-batch retry only, with scope/exclusions,
  acceptance regressions, migration/frontend ordering and rollback defined.
  It remains medium backlog requiring separate bounded authorization.
  No income expansion, attachment work, role redesign or historical repair.
- Frontend routing reverified: `e1518d09ae8f27726499b4a93dfbffbb10516b4f`,
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED and
  `escociaos.vercel.app`. No live assets/UI/operator check.
- Backend reverified: v279 ACTIVE, verify_jwt=false, same reported hash and
  version-278 entrypoint. Edge-source export remains approved but blocked by
  HTTP 413 / ToolRouterV2_PayloadTooLarge (4345); no retry or reroute.
  Separate broad database-source export remains rejected/unapproved.
  Latest ledger remains 185 `20261028014545`; other live policy/body equivalence
  is not established by that fact. Metadata/ledger reads only in S5.
- Preserved gaps: live Storage/signing/activity behavior, Auth TTL/provisioning/
  session runtime, owner-only revocation semantics, current account/module
  distribution, unsampled policies/body parity, S3 stale/replay/alert paths,
  secret/log/runtime configuration and F1 operator confirmation/old-tab risk.
  Receipts and pending attempts must survive any later rollback.
- Test qualification: existing [CI run](https://github.com/sforero94/Escociaos/actions/runs/40724289586)
  on exact `9720032…` has successful Lint, Chequeo de tipos and Pruebas steps,
  independently verified through run/jobs metadata. No logs or counts read,
  no CI rerun dispatched, and no install/test suite executed by S5.
  S1/S2's historical 907 warnings and S4's partial-snapshot 705 warnings are
  not new counts. The full exact-baseline local reproduction gap remains;
  current CI step success is separate evidence, not a fabricated local pass.
- Local execution: supplied branch initially clean at unrelated `5163501`;
  executor disconnected during S5. No local branch switch, source edit or
  full local lint. Supported pinned GitHub reads and remote commit route used.
- Documentation-only merge recommendation: after parent/reviewer accepts gaps,
  refreshes stale PR metadata and verifies final-head required checks. PR title
  still says S1/S2; body still says completed S1, next S2 and 907 warnings.
  These are flagged as historical/stale, not treated as current evidence.
  Suggested replacement metadata is in S5; actual PR title/body not edited.
- Checks: documentation links/evidence paths, fences, whitespace, scope/
  credential-pattern review, committed diff and publication verification at
  close-out. No production tests, business/personnel queries, Storage operations,
  secret values, bot messages, fixes, new credentials, installs, migrations,
  merges or deployments. No PR324 work or redesign.
- Publication: S5 consolidation and tracker only, on the existing PR branch;
  resulting commit/final-check state returned in the response. No merge or
  production release claimed. S1–S4 historical records remain intact.
- Closure: S5 is closed with gaps. No automatic next audit or implementation.
  The decision prompt below is for later explicit selection, not execution here.

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

## Decision prompt after S5 closure

S5 closes the planned review. Do not create S6 or start this proposal automatically.

```text
Continue from PR #354 after the S5 closure commit.
Read CLAUDE.md, docs/security-review/progress.md and
docs/security-review/s5-consolidation.md, with its S1–S4 evidence links.
Decide whether to select only expense-batch retry as the next medium-priority
backlog item. No new verified critical/high remediation is established.
Keep the proposal's exclusions, acceptance tests, deployment ordering and
receipt-preserving rollback. Do not implement or release until explicitly
authorized for that bounded scope.
Preserve approved edge-source HTTP 413 blockage, separately unapproved DB
export, Storage restrictions, identity/runtime uncertainties and full local
lint reproduction gap. Existing CI step success is separate from local counts.
Keep F1 receipts/pending attempts, old-tab risk and operator-confirmation gap.
No PR324, redesign, production writes, business/personnel queries, probes,
Storage operations, secret values, messages, installations, merges or deployments.
The documentation-only merge recommendation does not authorize any of those
actions. Refresh the stale PR description and verify final-head checks before
a separately authorized merge.
```


## Expense-batch implementation close-out — 2026-10-29 UTC

Main/base verified at `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc` through
Composio account `github_lysis-talion` / `thinksid`; clean local branch
`codex/security-expense-batch-retry`. This commit records the implementation;
its exact published head and CI outcome belong in the PR/handoff.

Implemented only GastosBatchTable retry identity and its additive migration187,
with types, helper, synthetic tests and [runbook](expense-batch-retry.md).
Local validation: 4,772 Vitest tests / 219 files, 10 PostgreSQL groups, 15 focused
helper tests (included in suite), desktop/mobile recovery + stale-tab replay,
typecheck/build pass; lint zero errors / 907 existing warnings, no skipped tests.
Independent reviewer reran the helper and PostgreSQL checks and found no blocker.
Full current local lint is now measured; historical S3/S4 counts retain their
original limits and do not imply production parity.

Not applied/deployed. No merge or production data access. Retain the INVOKER
own-receipt insertion trust limit and existing shared/unowned drafts. The new
request checks do not establish a general audit trail or a redesign of ownership.
Preserve F1 receipts/operator gap, edge HTTP413, separate denied DB export,
PR324, PR359, PR356 and migration186. Parent owns the Bot Log/periódico.

Next scope: review this queued expense-only draft and its release gates, not
another remediation. Copy the concrete next-session prompt from
[the runbook](expense-batch-retry.md#next-session-prompt).


## Parent-review correction — split prerequisite and activation

Parent review supersedes the combined-head “ready” conclusion for PR360 at
`6e4a882`. It found a cross-tab pending-payload race and unsafe activation of an
unapplied RPC in the auto-deployed main frontend. These were source blockers,
not red CI or production incidents. No release occurred.

The revised PR360 is DB-only: unapplied migration187, PostgreSQL fixture/runner
and docs. Its frontend matches main. Review it before the dependent draft branch
`codex/security-expense-batch-frontend`, which owns Web Locks serialization,
full-payload cleanup, adversarial concurrent-browser regressions and activation.
The database uses dedicated conflict SQLSTATE PGB01. Baseline rechecked through
Composio: main `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc`; next source number187.

Mandatory gates: development Supabase validation; separately authorized database
application/postconditions; only then frontend merge/automatic main deployment.
Neither draft applies a migration or changes deployment settings. Final heads,
new check counts and independent re-review belong in the PR/handoff. Earlier
combined-head results above remain historical, not acceptance of these fixes.
Parent owns Bot Log and the morning queue. No further remediation starts here.

DB-only close-out: 4,757 tests/218 files, ten PostgreSQL groups including explicit
PGB01 assertion, types/build pass, lint0 errors/907 existing warnings. Independent
review found no remaining DB-only blocker and verified frontend equality to main.

Follow-up review separated all explicit SQL validation into23514 while retaining
PGB01 for committed-payload conflicts. A whitespace-only name now has a distinct
rollback result; legacy22023 remains conservatively preserved by activation.


## PR360 integration preparation after PR367 — 2026-10-29

Preparation only, as authorized by the parent after PR367 merge. Current main
634580480c72b27c7ccd2d8c006af520d0ca1058 is merged into the preserved PR360
branch from29a4a757c6a34ddb27d08e02ff2ab68f434b96dc; no force push or conflict
resolution was needed. The scope against main remains exactly the five DB/test/doc
files. All frontend, unit-test and edge source files equal current main. No
migration-number collision: main still ends at186;187 is candidate-only. No live
DB query/application or production/private-data action establishes this check.

Do not mark ready, approve, merge, deploy or apply187 during this preparation.
PR362 is not started or changed; its original development-Supabase, authorized DB
application/postconditions and operator-browser gates remain. Parent owns Bot Log
and next action confirmation. Final local and exact-head checks belong below and
in the PR handoff; all earlier session results remain historical evidence.


Integrated-tree validation: 4,782 Vitest tests/218 files, no skipped tests; ten
isolated PostgreSQL17 groups pass; typecheck/build pass; lint0 errors/907 existing
warnings (local Node24). Independent read-only integration review found no blocker,
verified the five-file diff and frontend/edge equality to current main, and
confirmed SQL/test bytes unchanged from29a4a757. Exact published-head CI/Vercel
results belong in the PR/handoff; no production or Supabase validation is claimed.

Next-session prompt: review the updated draft PR360 against main6345804 and its
exact-head checks. Parent handles any next action confirmation. Do not mark ready,
approve, merge or release from this preparation; leave PR362 held and migration187
unapplied. Preserve all prior release gates and do not start another scope.
