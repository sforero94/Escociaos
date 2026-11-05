# P3 Task 2: application inventory, operational dates and current state

Date: 2026-11-04. Started at main `095a5c50` after review/merge of #417–#419.
Final base: main `cf1bfa77`, which adds only the separate v4 deployment record in CLAUDE.md.
The v4 deployment belongs to Claude Code's separately authorized work; this task did not deploy.

## Delivered behavior

`consultar_aplicaciones` is a closed operation for caller-visible applications within an
inclusive period. Its date basis is explicit: planned start, recorded movements or recorded
operational close. Each selected application appears once, with its current state; Calculada
is displayed as Planificada. Several movements never multiply the application count.
A future recorded date remains in its requested cohort, with a qualification rather than an
assertion that a future execution/close has happened. Administrative close time is unsupported.

The source uses fixed columns and the same verified caller-JWT client as labor. Children
are intersected with visible parent IDs. Pagination, exact counts, identity uniqueness and
required date availability are checked. Unread, recorded NULL, verified empty, no close and
unresolved identity remain distinct. Applications without a task remain in this inventory;
no labor quantity or attribution is manufactured.

Name/code resolution prefers an exact normalized match, then a unique partial match.
Ambiguous selectors request a code/name rather than expanding scope. Numeric code prefixes
are preserved. Unfiltered duplicate names remain separate by stable ID and distinguishable
in the rendered response. Unread optional names/code/state never become recorded absence.

Mixed labor/application obligations retain their original pN positions. An independent
source failure does not erase the other domain's answer. Missing date meaning uses three
exact server-owned choices; pending free text repeats them without replanning. D26 choices,
owner binding, ephemeral token limits, maximum two schema-planner attempts and #419's last-six
message interpretation remain intact. A pure recorded-labor read failure retains the prior
canonical error_datos behavior. All factual output is generated and checked deterministically.

The representation keeps legacy labor-only plans and adds one ordered closed operations
branch for application/mixed requests. It accepts no tables, SQL, arbitrary joins, expressions
or general query language. Applications are read lazily after planning and names/codes are
resolved in code. An application-source fallback permits planning if the labor catalog fails;
if both domains are unread and no pending choice exists, the turn stops without a model call.

Detailed technical choices: [runtime scope](p3-task2-runtime-scope.md).
Source authority: [approved P3 contract](p3-source-contract.md).

## Independent validation and coordinator verification

QA authored literal synthetic table/RLS populations before runtime implementation: its first
29 checks found 25 missing-capability failures and four passing authorization controls.
The independent suite grew to 55 checks for source/identity/conversation boundaries. Expected
population values were not derived by calling the executor. All network fetches were denied.

| Check | Final coordinator result |
|---|---|
| `npm test` | **7,567 passed / 320 files** |
| New backend tests included above | 37 |
| Independent QA integration checks included above | 55 |
| New Task 2 total included in the suite | 92 |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | 0 errors / 907 existing warnings |
| Production build in a temporary directory | Passed |
| Diagnostic route/screen/client markers in production bundle | Absent |
| Frozen changed-file hashes during final checks | 25/25 unchanged |
| Protected legacy/Telegram/chat/local-handoff hashes | 253/253 unchanged |
| Diff whitespace | Passed |

Checks cover all three date bases, inclusivity and Bogotá today, future dates, duplicate
labels/IDs, exact and ambiguous identity, no linked task, NULL/unread metadata, failed and
incomplete reads, >1,000 child rows, parent-hidden/permissive-child RLS, four denied caller
classes, current versus historical state, both mixed pending orders, owner changes and
independent partial results. The coordinator reran the whole suite, rather than accepting
agent summaries. Final full-run duration: 45.01 seconds locally.

Review caught broad substring identity matching, lost numeric code prefixes, wrong-date
field substitution, unread selector metadata treated as absence, and a pure labor read-error
regression. Corresponding synthetic regressions now pass. Five legacy labor test files use
a test-only narrowing helper which fails if an application result enters a labor fixture;
their expected business figures and assertions are unchanged.

This is not browser verification, production JWT cryptography/RLS certification, natural
language accuracy, or P5 acceptance. No held-out inputs or evaluator details were read.
Task 3/4 quantity/cost/shortage mutations are not claimed complete by this inventory slice.

## Spend, scope and review gate

New model calls: **0**. New provider spend: **USD 0**. No production read or write in this task.
Latest published cumulative P3 spend is USD 0.0345 of USD 0.25, recorded after #419; this task
adds nothing. No development runner or scripts/esco2/e2e-local.ts was executed.

Task 2 is ready for a PR to main with verificacion green. Merge requires review approval
from Santiago or Claude Code. No essential semantic question remains open. Task 3 quantities
and later costs, labor aggregation and shortages remain separate tasks after review/integration.
No migration, secret change, deployment, pilot, P4–P6, legacy web chat or Telegram change.
After a later merge, deployment drift is expected until Santiago separately authorizes redeploy.
