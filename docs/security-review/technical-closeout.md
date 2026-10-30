# Security technical closeout — accepted 2026-10-30

## Decision and finite scope

The owner accepted closing the technical security SOW with its recorded limits,
leaving the first legitimate use as operational follow-up. This closes the bounded
S1–S5 assessment plus the separately selected expense-batch retry remediation.
It is not a security certification, an all-writer fix or closure of parked PR324.
No additional medium finding is automatically selected for implementation.

[PR354](https://github.com/sforero94/Escociaos/pull/354) merged the completed
[S1–S5 assessment](s5-consolidation.md), dated 2026-10-28. Its historical findings,
source qualifications and restrictions remain intact. The assessment found no new
verified critical/high production candidate and retained seven medium source
findings plus separate design/dependency/access risks. Expense retry was the one
subsequently authorized slice; the income half remains unselected backlog.

## Verified release receipts

| Boundary | Terminal evidence | What remains qualified |
|---|---|---|
| F1 inventory | PR353 released migration185 and the three web flows: manual movement, complete purchase, purchase reversal | First legitimate operator confirmation remains follow-up; other inventory writers are outside this release |
| Expense DB | PR360 merged at c68c37e642ba118675326283f24b6e1d7b4b7dc2; exact187 applied, ledger 20261029183837; RLS/ACL/INVOKER and unchanged existing expense metadata verified | Keep RPC, receipts and uncertain requests on rollback; service_role retains privileged access |
| Expense frontend | PR362 approved head 2482f516ed892541d033eceb9dc9083a3756baf4; merged 2026-10-29T19:29:46Z at e3b4c40b905154b9f5abdbdadcecc100c2f47fe8; postmerge CI 40940596671 success | Owner accepted capability-based availability; actual Chrome/Safari devices are not certified |
| Expense production routing | Vercel dpl_BfknBFNZapjR5MWZWyE72yPVxkHH READY, production target, exact e3b4c40b, aliasAssigned=true for escociaos.vercel.app | This is the release-time receipt, not a fresh live-routing claim |
| Separate application invariant | PR371 source 13ef1f4ded1d0505d8d9b5b823314a65c891f2fe; exact188 applied 2026-10-30, ledger 20261030023201; trigger enabled/INVOKER and existing metadata preserved | Date-pair order only; no historical repair or general application-plan replacement atomicity claim. Frontend371 is merged; backend activation remains separate and is not established by this migration receipt |

[Expense CI](https://github.com/sforero94/Escociaos/actions/runs/40940596671),
[deployment](https://vercel.com/santiago-foreros-projects-da8a20e8/escociaos/BfknBFNZapjR5MWZWyE72yPVxkHH),
[PR362](https://github.com/sforero94/Escociaos/pull/362),
[local validation and187 receipt](expense-release-readiness.md).
Migration188 SHA256:
`4d7342094630214b32c6b04a9f67c6cc6c849f16cfa02b4b8f73a75d6ef36183`;
apply receipt log_PClidd0mquMw, postcheck log_7RPsYN4TkFPK at 02:32:12UTC.

## Release coordination snapshot — 2026-10-30

### Earlier failed attempt and reviewed repair

Before repair, parent release receipts reported backend v281 as the retained
baseline (runtime e7a5545 / edge6e9969d). PR371 frontend source was merged; its
attempted backend activation
[40992476137](https://github.com/sforero94/Escociaos/actions/runs/40992476137)
failed while retrieving a diagnostic receipt, before the Supabase-secret step or
management access. That run did not deploy a backend. PR372 was a draft control
repair at this document's initial preparation; it subsequently merged with
specific approval. Its reviewed authenticated receipt path and actions:read
permission were used by the successful run below, not activated by this closeout.
The earlier failure remains part of the release history.

### Current terminal release receipt

Parent receipts confirm backend **v282**, deployed at
`2026-10-30T04:01:08.200Z`, by
[release 41000471057](https://github.com/sforero94/Escociaos/actions/runs/41000471057),
job 123883440389, attempt 1, success, on reviewed control main
`9a0ab0695c80ede3025a7e4c3bba303e6a4fc1a0`.
Fixed runtime source: e7a5545. Reported deployed bundle SHA256:
`d595fd7375726d36aadd90fe771b8782f55f9ae2b996fb0e45f79404cd69215a`.
Authenticated diagnostic receipt verification, two v281 backup captures,
postdeploy source verification (80 downloaded /82 reconstructed files) and health
HTTP 200/status ok passed. No rollback occurred. Migration188 remains separately
applied at ledger 20261030023201. These are parent/provider release receipts, not
new production reads performed for this documentation.

PR363/364/366 are integrated: the offline Faithfulness chain is complete, not a
live accuracy certification. The separate 30-question Esco web evaluation is
beginning on v282; no evaluation result, score, accuracy or completion is claimed.
First legitimate F1/expense use and preserved security limits below remain intact.

## Acceptance limits and operational follow-up

The expense release passed 4,811 tests/219 files, types/build, independent review,
ten PostgreSQL groups, four ACL/preflight groups, nine real local Auth/PostgREST
groups and five Chromium scenarios against empty synthetic fixtures. Those checks
do not prove hosted schema/trigger/gateway parity or actual Safari/mobile behavior.
The owner explicitly accepted global activation with runtime capability gating.
Missing Web Locks blocks save visibly before request persistence/upload/RPC;
if lock acquisition fails after uploads, an attachment can remain without a saved
expense. No direct-INSERT fallback exists. Shared-profile drafts and deliberately
insertable own receipts remain recorded trust limits.

The next ordinary F1/expense transaction may supply operator confirmation; do not
create a fake farm transaction, clear pending storage, recapture an uncertain save
or collect browser versions to manufacture completion. Report any actual failure
and preserve the original account/request/payload. This follow-up does not reopen
the accepted technical SOW or authorize a new fix automatically.

## Preserved gaps and unselected work

The original assessment's edge HTTP413 limitation and separately denied broad DB
source export remain recorded; later deployment receipts do not prove complete
parity of every reviewed handler/function. Live Storage/signing, full Auth/session
revocation and unsampled policies/runtime paths remain outside the verified set.
Keep intentional CSV opening balances, documented Telegram binding/undo behavior,
draft recovery decisions and other dispositions in S1–S5; do not refile them.

Unselected work remains backlog: income retry, atomic application-plan replacement,
daily capture, Telegram labor replacement/module revocation, dairy event/state and
qualified general alert claim/effect integrity, plus dependency/access/privacy
hardening. Existing related changes are not evidence that every broader finding
was fixed. None is a requirement to expand this closeout.

PR324 and its local WIP remain parked, not a prerequisite, merged fix or part of
this acceptance. No new percentage is assigned: the original weighted estimate is
not the S1–S5 completion contract. Keep any historical estimate at its own date.

No new production query, mutation, merge, deployment, test farm transaction or Bot
Log action was performed to prepare this documentation. Parent owns integration
and the morning record; this document alone authorizes no release or cleanup.
