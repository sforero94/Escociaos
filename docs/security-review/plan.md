# Security review — remaining work

This is the continuation of the bounded cloud review and the F1 release. Read
[the session guide](session-guide.md), then use [the tracker](progress.md) as the
single queue. This plan records work; it does not authorize another production
change. Scope IDs below are scheduling labels, not invented finding numbers.

## Decisions to preserve

- Review the actual farm workflows used by the small internal management,
  field-administration and accounting team: spray/application, labor, pest,
  dairy, accounting and inventory. Judge exploitability in that setting.
- F1 is released: manual inventory movement, complete purchase and purchase
  reversal now use atomic saves with durable retry recovery. Do not reopen its
  implementation or treat that release as proof that all inventory writers are safe.
- Do not resume PR324 or the parked redesign. Preserve its separate local WIP;
  it is not a prerequisite or an accepted production fix.
- Recommend only minimal, verified critical/high fixes for immediate remediation.
  Put medium/low hardening and redesign into a separate backlog. No speculative
  severity, numerical breakage probabilities, or security certification.
- Assessment is read-only. No business-data queries, production writes, live
  exploit probes, Storage operations, new credentials or access changes.
  Existing authorized deployment/catalog tools are sufficient for baseline work.
- A focused, nonmutating local check may resolve one concrete uncertainty.
  Use installed tools, synthetic inputs and no backend calls. No installations,
  whole-suite/replay/profiling loops or architectural work during assessment.
- A remediation session needs an explicit scope and authorization. It must not
  silently start because an assessment found a problem. Preserve authorization
  already given for the specific work; do not repeatedly ask for it.

## Recorded baseline, not a permanent production assertion

The F1 release verified frontend SHA
`e1518d09ae8f27726499b4a93dfbffbb10516b4f`, Vercel deployment
`dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED, alias
`escociaos.vercel.app`. [PR #353](https://github.com/sforero94/Escociaos/pull/353)
is the release record. Migration 185 is recorded in the live ledger as
`20261028014545` / `185_inventario_guardado_atomico`.

The earlier review observed edge function `make-server-1ccce916`, version 278,
ACTIVE, gateway `verify_jwt=false`, reported bundle SHA256
`60ef9ded0d685a9ab7a627f6f2ce2b5a28a0908a948e46900aaae8e25fdc155b`.

Reverify frontend, backend and relevant database metadata at session start.
Main alone is not production evidence. If a deployment cannot be verified,
continue against an exact code SHA labelled **code-only** and record the gap.
Do not infer deployed backend source or live policy parity from a frontend SHA.
Gateway `verify_jwt=false` alone is not a vulnerability when handlers validate access.

## Ordered scopes

### S1 — Remaining writes and F1 boundaries

Start with the highest practical risk: unauthorized financial/inventory writes,
partial commits, duplicate transactions and lost stock updates.

- Map browser, RPC, trigger and Telegram writers for the affected domain records.
  Include spray/application closure, daily movements, labor, dairy and accounting
  as applicable. Distinguish independent writes from one database transaction.
- Check authorization at the backend/RLS boundary; a hidden button is insufficient.
- Check transaction boundaries, lock ownership, replay behavior and failure paths.
  Specifically distinguish the three F1 web flows from other writers, old open
  tabs and any path that still assigns a balance from a stale read.
- Reuse F1's tests and runbook as evidence. Do not rerun the full release suite
  just to repeat the already recorded result. Do not expand F1 into a redesign.

**Done:** a writer/boundary matrix, ranked verified findings or explicit negative
results, exact evidence and unchecked paths. Any critical/high candidate has a
smallest fix, focused regression requirements and rollback requirements.
The blocked F1 live UI check remains a separate follow-up; it does not block
read-only source review. Do not create a farm transaction to close that gap.

**Next:** S2. If a verified critical/high issue needs an urgent fix, record the
reordering and prepare its concrete remediation scope for user authorization.

### S2 — Active accounts, role isolation and data exposure

Trace frontend guards through backend handlers, RLS, RPCs and privileged helpers.
Compare the intended management/administration/accounting permissions with actual
SELECT/INSERT/UPDATE/DELETE capability. Cover cross-role reads of finance,
worker/personnel data and exports as well as writes.

The previous source lead in `usuarios.tsx` checked JWT/current role without an
explicit `usuarios.activo` check. It remains a **lead**, not an assertion of an
exploitable production vulnerability: trace Auth banning/revocation, current
activity/role enforcement, reachable handlers and backend deployment parity.
Read documented exceptions and old security memory before refiling them.

**Done:** an access matrix, current-account revocation analysis, evidence-ranked
findings or dispositions, and an explicit list of unverified live policies/handlers.
No role redesign or policy change is part of assessment.

**Next:** S3.

### S3 — Telegram identity and privileged operations

Trace webhook validation, linked identity, current activity/role/module checks,
callbacks and sensitive financial/inventory/dairy/labor handlers. Service-role
execution must be assessed with its actual caller validation, not browser RLS
assumptions. Check replay and stale callbacks where they can duplicate writes.

The previous lead contrasted `telegram_usuarios.activo` with the linked app
account's current role/activity. Verify the complete call chain and documented
binding behavior before deciding whether a gap exists.

**Done:** an identity-to-operation map, realistic prerequisites and dispositions,
plus source/deployment parity gaps. No bot messages, webhook calls or user impersonation.

**Next:** S4.

### S4 — Secrets, file access and reachable dependencies

Review secret handling, file access authorization, upload/import/export paths,
logs and browser persistence. Inspect source/configuration metadata; do not
list, fetch, upload or delete Storage objects. Never print a secret or put a
credential or exploit payload in these public documents.

Triage the recorded `xlsx ^0.18.5` parsing lead against the resolved version,
actual import/caller reachability, file provenance and a current primary advisory.
A manifest range alone is not proof of vulnerability. Use existing read-only
advisory tools or official sources; do not install packages or run payloads.
Separate runtime exposure from development-only dependency notices.

**Done:** reachable dependencies and file/secret boundaries assessed, advisory
links and prerequisites recorded, remaining unavailable configuration identified.
Do not infer a file-access vulnerability just because Storage was not probed.

**Next:** S5.

### S5 — Consolidated decision and minimal remediation scopes

Consolidate S1–S4 without restarting the review. Recheck baseline applicability
where deployments changed. Separate:

1. Verified vulnerabilities with affected workflow, severity, realistic
   prerequisites, confidence, exact evidence, smallest fix and verification test.
2. Unconfirmed paths and the exact missing evidence.
3. Design risks and medium/low backlog items.
4. Unchecked areas, deployment/configuration gaps and residual release risks.

For each verified critical/high candidate, define one bounded remediation scope:
files/boundaries, acceptance criteria, meaningful focused regressions, migration
and frontend/backend ordering, production verification and rollback. Database
changes require a new sequential migration tested in development. Never edit an
applied migration. A live ledger check, not a file header, establishes application.
No fixes, merges, migrations or deployments occur merely to finish this report.

**Done:** the ranked report, separate backlog and a concrete next remediation
prompt. If nothing qualifies for immediate remediation, say so and name the next
bounded evidence gap or backlog decision. Do not certify the system as secure.

**Next:** the first authorized remediation scope, or the explicit decision recorded
in the tracker. Do not make a pending decision look like completed remediation.

## Time and scope control

The original initial-assessment target was one working day; F1 has since shipped.
These sessions continue that work and must not reset it into another full audit.
Work one scope per session. At the first useful checkpoint, state baseline,
coverage and blockers. At one working day at the latest, deliver the current
scope's evidence and gaps instead of extending it indefinitely. Report a verified
critical/high issue promptly. A tool denial is a gap, not permission to bypass it.

Every scope ends with an updated tracker and a copy-ready next-session prompt.
See the mandatory close-out contract in [the session guide](session-guide.md).
