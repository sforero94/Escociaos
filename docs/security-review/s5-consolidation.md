# S5 — Consolidated decision and review closure

Closed 2026-10-28 (America/New_York), read-only, with explicit gaps.
Source reviewed: `9720032de31ed8ab6b7283f7bb1d22f06d3b3152`,
[PR #354](https://github.com/sforero94/Escociaos/pull/354), branch
`docs/security-review-session-plan`.

**Decision:** no new verified critical/high production candidate qualifies for
immediate remediation from S1–S4. Keep the seven medium source findings and
separate design/access/dependency risks in the backlog. No fix is approved,
implemented or released by this closure. This is not security certification.

**Next bounded decision:** consider the expense-batch retry item only, as
specified below, for a separately authorized medium-priority change. Do not
start another audit or implement that proposal merely to finish S5.

## Baseline applicability reverified

| Boundary | S5 evidence | What it establishes / does not establish |
|---|---|---|
| Review source | PR open/unmerged at start, head `9720032…`; source tree `fb553427bb0fbf5cc3ee439adf1c2bdc1d1b3864`, edge tree `eb663f17c812b844fc29cb88a5cc2b9ce382f0f1`, lockfile blob `c5a638bae41b5e5dd281e7f9a7beab3c1a6f3ba7` | These three Git IDs match F1 `e1518d09ae8f27726499b4a93dfbffbb10516b4f`. Source findings have not been silently fixed by the documentation branch. The unrelated local branch's changes are not this release. |
| Production frontend | Vercel metadata and deployment-specific aliases: `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED, F1 SHA, `escociaos.vercel.app` | Confirms routing to that source. No new HTML/assets/mobile/live workflow check. |
| Edge | Authorized account `supabase_bitis-coward` / `escocia-os`, project `ywhtjwawnkeqlwxbvgup`: `make-server-1ccce916` v279 ACTIVE, `verify_jwt=false`, reported SHA256 `60ef9ded0d685a9ab7a627f6f2ce2b5a28a0908a948e46900aaae8e25fdc155b`; entrypoint still names version 278 | Metadata is unchanged. Deployed handler source equivalence remains unverified. Edge observations remain code-only; gateway configuration alone is not a vulnerability. |
| Database ledger | Latest `20261028014545` / `185_inventario_guardado_atomico` | No later ledger entry observed. Does not prove every policy, function body, Auth setting or in-place catalog definition is unchanged. S1–S3 catalog observations retain their own dates/coverage. |
| Local execution | Supplied checkout initially clean at unrelated `5163501`; executor subsequently disconnected during S5 | No local checkout switch, fix or full local source/test reproduction. Pinned GitHub reads and remote documentation commits remain the supported route. |

Live reads in S5 were deployment/function metadata and the latest ledger only.
No business/personnel or account rows, Auth sessions, Storage, secret values,
production logs, probes or bot messages were requested. No denied source export
was retried. No migration, merge, deployment or production write occurred.

## Ranked verified source findings

All seven are **medium**, not new critical/high findings. The ranking preserves
S1's initial integrity priorities, then carries S3's qualified source results.
These labels are not replacements for existing finding IDs. Confidence is high
in the recorded source failure paths; applicability and runtime limits differ.

| Priority / finding | Workflow and realistic prerequisite | Evidence / production qualification | Smallest future boundary and decisive regression |
|---|---|---|---|
| 1. Finance batch retry | Authorized Gerencia retries an expense/income batch after a committed response is lost; new rows can duplicate amounts | [S1](s1-assessment.md), pinned batch callers plus live PK-only unique indexes. Frontend source matches production routing; no actual duplicates queried | Stable per-user operation identity and atomic batch/receipt; committed-but-lost response + reload/retry yields one batch. Proposed first slice is **expenses only**, below. |
| 2. Application-plan replacement | Authorized edit fails after deleting old relations or while rebuilding them | [S1](s1-assessment.md), parent/delete/reinsert call chain. Child-policy parity incomplete; closure RPC does not protect plan editing | One role-preserving save transaction; injected failure after deletion preserves the entire old plan. |
| 3. Daily movement capture | Authorized capture stops between parent, products and worker commits | [S1](s1-assessment.md), source plus sampled RLS/trigger/constraint evidence. No farm damage asserted | One keyed parent/children/labor transaction; each failure stage rolls back and lost response does not duplicate capture. |
| 4. Telegram labor replacement | Bound operator replaces records; later INSERT fails after DELETE committed | [S1](s1-assessment.md). **Code-only; deployed edge parity open** | One actor-checked replacement transaction; failed replacement leaves original registrations intact. `conversation.external` is not rollback. |
| 5. Dairy death event/state | Event commits but animal-state update fails | [S1](s1-assessment.md), source plus sampled live RLS/trigger metadata. Existing partial-save warning limits silent impact | Atomic event/state operation; second-write failure and retry preserve a coherent state. |
| 6. Bot module revocation during conversation | Previously authorized operator resumes after only the bot module is removed, while Telegram identity stays active | [S3](s3-assessment.md). **Code-only; deployed/plugin behavior qualified**. This is not ignored Telegram deactivation | Recheck current required module/identity at save; start/revoke-module/resume fails without removing field-identity exceptions. |
| 7. General alert claim before effect | Legitimate response closes alert, then required domain write fails; retry skips its effect | [S3](s3-assessment.md). **Code-only; deployed edge/complete trigger parity open**. Separate from atomic selected-step RPC 177 | Atomic claim + required effect; injected domain failure leaves alert eligible for retry; concurrent responders produce one effect. |

None is evidence of an anonymous writer, current unauthorized operator,
confirmed financial damage, or a reason to resume PR324. S1/S3 contain the
existing detailed failure evidence and rollout/rollback proposals. They remain
assessments, not completed remediation.

## Unconfirmed paths and separate backlog

| Classification / subject | Retained conclusion | Exact missing evidence or decision |
|---|---|---|
| Unconfirmed — inactive account creation / privileged HTTP handlers | Normal edit includes an Auth ban; role-only service-role checks and inactive creation remain inconsistent source paths. No confirmed live self-reactivation or indefinite ordinary-ban access | Deployed edge parity, provisioning hooks/configuration and controlled development Auth behavior; current TTL/session/ban validation is not established. [S2](s2-assessment.md) |
| Medium design risk — owner-only revocation | Named daily parent/report/memory owner predicates omit active-role clauses. A policy shape does not prove a usable deactivated session or damage | Owner capability intended after downgrade, usable-session conditions and controlled development regressions. Do not silently replace ownership with a role redesign. [S2](s2-assessment.md) |
| Existing medium/low access hardening | Broad authenticated reads are distinct from web module visibility; employee access is not column redaction | Audience/column decisions and unsampled child/column policies. No current personnel/account roster was queried. [S2](s2-assessment.md) |
| Medium design risk — app/bot revocation | App Auth ban does not itself revoke an independent active Telegram identity/module; field identities without app accounts are intentional | Intended cross-channel revocation rule, actual deployed checks and controlled development cases. No new privilege grant asserted. [S3](s3-assessment.md) |
| Design risk / unchecked — delivery replay, old callbacks and memory tokens | No durable webhook operation receipt inferred from persisted conversations; documented legitimate undo/button limits remain | Exact deployed plugin/crash/concurrency behavior, intended recipient revocation semantics and bounded synthetic tests. No callback forgery or successful duplicate delivery demonstrated. [S3](s3-assessment.md) |
| Known medium contextual dependency risk — SheetJS | Locked/pinned 0.18.5 readers are affected under the two primary advisories reviewed in S4. Browser parsing can precede write checks; export-only paths are distinct | Separate replacement/provenance decision and legitimate-file regressions across browser/edge/maintenance readers. Advisory severity is not proof of this application's exploit impact. No upgrade performed. [S4](s4-assessment.md) |
| Medium shared-profile design risk — drafts | Fixed form keys lack account identity; quincena intentionally keeps financial draft on cancel; hook retention semantics differ | Draft ownership/retention policy and controlled account-switch checks. Form reset effects limit claims of visible restore. Never clear all localStorage or F1 pending attempts as a shortcut. [S4](s4-assessment.md) |
| Lower-priority design risks | Cross-RPC lock order, closure payload validation, nullable labor uniqueness/daily-total concurrency, archive/resource limits and log minimization remain scoped risks | Focused development evidence or an owner decision for the named boundary; no generic hardening/redesign authorization. [S1](s1-assessment.md), [S4](s4-assessment.md) |

No row above is promoted into a verified high vulnerability by consolidation.
No historical data repair or account-policy change is authorized.

## Accepted behavior and negative results retained

- Web module fail-open/visibility is intentional and not a data boundary.
  Preserve Gerencia/Administrador cattle-finance and supplier exceptions,
  Monitor's web block, bounded author-name resolver and cron service identities.
- Documented Telegram binding is valid in source; active Telegram identity gates
  updates. Keep field identities with null app link where allowed, retained
  `ingresos`, retired `gastos`, and accepted event-undo access limits.
- Ronda explicit actors, current module/state/lock checks and already-approved
  mechanical apply remain distinct from F1 receipts. Do not refile 130's stale
  reset issue. Selected treatment step 177 has its own atomic retry behavior.
- Dairy weighing is per-cell by design. CSV opening balances are an accepted
  creation path. Draft cancellation/recovery is intentional. Missing audit
  wiring and attribution limitations are historical decisions, not new findings.
- Preserve the expected public anon credential, known logo-link exception and
  dedicated visual-verification account without printing values or querying it.
  Historical dependency exceptions do not establish every dependency is safe.

## Evidence gaps and release risks that remain open

1. **Edge parity:** full deployed edge-source export is approved, but connector
   and approved workbench attempts returned HTTP 413 /
   `ToolRouterV2_PayloadTooLarge` (4345), without source. The tool has no recorded
   pagination/filter capability. A supported capability/tool-limit resolution is
   needed; no alternate identity/endpoint or disguised export.
2. **Database source:** broader trigger/RPC body export remains separately
   unapproved after automatic review rejected sensitive production-source
   exposure. Edge approval does not authorize it. Existing metadata and prior
   permitted narrow reads remain evidence; differing literal hashes alone do
   not prove semantic drift. No new broad export is proposed by this closure.
3. **Storage/files:** live policies, objects, signing behavior and activity gates
   were not examined under the explicit restriction. Keep historical exceptions
   qualified; do not infer an IDOR or closure from an untested bucket.
4. **Auth and identity:** TTL/session invalidation, provisioning/runtime behavior,
   actual account/module distribution and complete unsampled policy/function
   behavior remain unverified. No roster assumptions from old memory.
5. **Local full lint:** S3's disconnected executor and S4's incomplete snapshot
   prevent a full exact-baseline local reproduction. S4's 705 warnings cannot
   replace S1/S2's historical 907-warning result. New CI status evidence below
   is independent; it does not create a newly measured warning/test count.
6. **F1:** only its three web flows are released. Genuine operator confirmation
   remains open after the cloud proxy CONNECT 403; no farm test transaction is
   permitted here. Refresh old tabs before capture; direct legacy writers remain
   a release risk. Preserve receipts and every unresolved attempt on rollback;
   do not restore an old writer and recapture an uncertain transaction.
7. **Configuration/coverage:** secret values, production logs, Storage data,
   Deno dependency resolution and full runtime/browser behavior were not
   inspected. This bounded review is not an all-table or all-library certificate.

## Next bounded backlog decision — expense batches only

Recommend **prioritizing**, not implementing, one slice of priority 1:
`GastosBatchTable` expense batch save and its retry identity. The income half
remains a later item. This is medium-priority integrity work requiring explicit
selection/implementation authorization; no urgent critical/high scope exists.

- Files/boundaries: `src/components/finanzas/components/GastosBatchTable.tsx`,
  the smallest expense-specific retry helper, a new sequential migration for
  one INVOKER expense-batch save/receipt boundary, and focused tests/docs.
  Confirm the next migration number at implementation; do not reserve one now.
- Contract: active Gerencia only, existing expense semantics and authorship
  preserved. One stable per-user request + payload identity, atomic batch and
  durable result, identical retry returns that result; changed payload under
  the same request is rejected. Ambiguous responses keep the pending attempt.
  No individual INSERT fallback.
- Acceptance evidence: synthetic development database tests for all-or-nothing
  validation failure, committed-but-lost response, reload/same request,
  simultaneous same request, changed payload, different user's receipt, and
  inactive/downgraded caller. One focused browser recovery check using synthetic
  data must confirm uncertain input cannot become a second batch.
- Exclusions: income, individual-record editors, file parsing, attachments,
  Storage, bot changes, role redesign, historical duplicates and the three F1
  flows. Do not import unrelated local security-branch work.
- Ordering/rollback: development validation and reviewed additive database
  dependency before frontend; exact production migration/release only in its
  separately authorized scope. Capture prior grants/policies, preserve them,
  verify new receipt access and exact released SHA. Keep RPC/receipts/pending
  requests on rollback; pause affected batch capture rather than silently
  enabling uncertain direct retries. F1 receipt state is untouched.
- Stop the proposal at this boundary if current code has materially changed or
  authorization/development validation is missing. No implementation, migration
  file, test data or PR for this proposed fix was created during S5.

## Documentation-only merge recommendation and test limits

**Recommend merging the review documentation only after the parent/reviewer
accepts its explicit gaps, refreshes the stale PR metadata and checks the final
documentation head's required checks.** No merge was executed. This recommendation
does not approve any remediation, deployment or production security claim.

The observed PR title still says S1/S2, and its body describes completed S1 plus
a next-S2 handoff and “907 existing warnings.” That is stale scope/validation
wording. Do not read it as the latest status; S1–S5 documents and the tracker
supersede it. PR title/body were **flagged, not edited**, in S5.

Suggested replacement title:
`docs(security): close S1–S5 read-only review with explicit gaps`

Suggested description for the reviewer to apply:

> Complete the bounded S1–S5 review after F1. Consolidate seven medium source
> findings, unconfirmed access/revocation paths, accepted exceptions and a
> separate dependency/privacy backlog. No new verified critical/high production
> candidate; proposed next decision is expense-batch retry only, not approved
> implementation. Preserve edge HTTP 413, separate unapproved DB export,
> Storage restrictions, identity/runtime uncertainties and F1 recovery state.
>
> Documentation only. Existing CI on 9720032 reports successful lint, typecheck
> and test steps; counts were not inspected. S3/S4 full local reproduction remains
> unavailable, and S4's 705-warning partial snapshot is not a full lint result.
> No new local runtime suite, production test, fix, merge or deployment. Review
> final-head checks before merging these documents.

Validation evidence is deliberately separated:

| Evidence | Result | Limit |
|---|---|---|
| F1 release record | 17 PostgreSQL groups, 4,646 tests/210 files, build/typecheck, desktop/mobile recovery checks recorded in PR #353 | Historical release evidence for three named flows; not a test of these backlog proposals or a live workflow pass |
| S1/S2 local lint | Historical 0 errors / 907 existing warnings | Not rerun in S3–S5; stale PR body must not make it current |
| S4 local snapshot lint | 0 errors / 705 warnings | Incomplete source snapshot; 174 source files unavailable, no complete local target pass |
| [Existing CI 40724289586](https://github.com/sforero94/Escociaos/actions/runs/40724289586), head `9720032…` | Job/step metadata independently verified success for Checkout, Node20 setup, npm-ci, Lint, Chequeo de tipos and Pruebas. Failure-notice step skipped | Existing run only; S5 did not dispatch/rerun it, install anything or read logs. No new warning count, test count, build pass, browser pass or live parity inferred. Direct generic job URL was unsupported; the dedicated Composio run/jobs metadata tools supplied these step results |
| S5 documentation checks | Relative links, source/evidence paths, fences, whitespace, credential-pattern and scope-only diff/publication checks | No application code changed. Local executor disconnected; no local runtime suite or full local lint rerun. Final commit/check outcome belongs in the close-out response |

## Closure decision prompt — do not execute automatically

```text
From PR #354 after S5 closure, review s5-consolidation.md and progress.md.
Decide whether to select only expense-batch retry as the next medium-priority
backlog item. Preserve its exclusions, acceptance tests, ordering/rollback and
all evidence/authorization gaps. No critical/high remediation is currently
established. Do not implement or release until that bounded scope is explicitly
authorized. Keep F1 receipts/pending attempts and legitimate-operator follow-up.
No PR324, redesign, production writes, business/personnel queries, probes,
Storage operations, secret values, messages, installations, merges or deployments.
```

S5 is closed with gaps. There is no automatically started S6 or remediation.
