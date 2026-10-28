# Security review — session guide

Read the root `CLAUDE.md`, relevant nested module instructions and applicable
`.agents`/skills before working. Then read [the plan](plan.md) and
[the progress tracker](progress.md). Use this guide for every continuation of this
review. User instructions and existing authorization take precedence.

## Start a session

1. Read the latest tracker, its evidence links and last close-out. Select the
   first unblocked scope in the recorded order. Do not ask the user to repeat
   context already in the chat or repository. Do not reconstruct finding IDs
   from memory; retain known IDs and label new work with scope IDs.
2. Confirm a clean, isolated branch/worktree from the current source. Preserve
   unrelated changes and the parked PR324 work. Read setup scripts before use;
   stop if setup would start production operations. Do not require a local
   backend, secrets or private data snapshots just to read code.
3. Record the exact checkout SHA. Verify the production alias/deployment SHA,
   relevant backend version/source metadata and live catalog/ledger where
   existing authorized read-only tools permit. The last recorded state is a
   starting reference, not today's production assertion. Record drift and its
   effect on the selected scope. Continue code-only if live parity is unavailable.
4. State the selected scope, mode (assessment or explicitly authorized
   remediation), completion criteria, coverage and exact blockers. Keep the
   original one-working-day initial assessment limit; do not restart a broad audit.

## Work within the selected scope

- Assessment: read-only code/configuration/catalog review. No business-data
  queries, production writes, live exploit probes, Storage operations, new
  credentials, permission changes, bot messages or other outreach.
- Use existing authorized tools and the documented account/project. For the
  recorded Supabase project, use account `supabase_bitis-coward` (alias
  `escocia-os`), project `ywhtjwawnkeqlwxbvgup`. Honor denial; do not retry through
  another identity, proxy or endpoint to bypass it. Record the unavailable evidence.
- Read `.claude/agents/security-compliance.md` and
  `escociaos-po/memory/security-compliance.md` for methods and documented
  exceptions; this bounded review does not require rerunning every maintenance
  sweep. Do not silently broaden into routine advisors/performance work.
- A local assessment check must be narrowly justified, nonmutating and use
  installed tools with synthetic inputs. No backend calls, installations or
  whole-suite/replay/profiling loops. Explain the specific uncertainty it resolves.
- Classify each result as verified vulnerability, unconfirmed path, design risk,
  documented acceptable behavior, or unchecked. Keep confidence separate from
  severity. Include file/line at an exact SHA or verified configuration evidence.
- Rank by realistic effect on farm operations, prerequisites and reachable
  callers. `verify_jwt=false`, a missing UI guard or an old dependency alone is
  insufficient evidence. Validate the complete boundary and applicable baseline.
- Report useful verified critical/high findings promptly. Keep medium/low
  hardening and redesign in the separate backlog. Do not implement a fix during
  an assessment session.

## If a remediation scope is authorized

Prepare the smallest reviewed change and focused regressions for the verified
problem. Respect existing permission; do not seek the same approval again.
Authorization for one fix does not authorize unrelated fixes or all future releases.

Use the repository's release rules: no direct push to main, no edits to applied
migrations, new sequential migration tested in development, exact reviewed SQL
through the migration tool, baseline/preconditions captured, postconditions and
live ledger verified. Update the migration record in the same session. Run the
checks appropriate to changed code and required CI; verify affected desktop/mobile
behavior when UI changes. Keep duplicated edge source trees synchronized if touched.

Before release, record dependency ordering and rollback. A frontend deployment
is not evidence of a backend deployment or database migration. Verify the
production alias maps to the exact released SHA. Do not create real farm records
as smoke tests without explicit authorization. Preserve retry receipts and
pending requests when rolling back F1; see [its runbook](../runbook_inventario_f1.md).

Automatic approval rejection: stop the rejected action, report its exact reason
and the missing permission/evidence. Do not reroute the action. Only retry when
materially new relevant evidence or authorization resolves the stated reason,
and after determining whether the earlier action ran.

## Mandatory scope close-out

A scope can conclude as assessed, blocked, deferred, ready for remediation,
implemented, or deployed. These statuses are not interchangeable. A bounded
assessment may conclude with a documented gap; an untested or unreleased fix
must not be called deployed.

Before ending **every scope**, including blocked/deferred scopes:

1. Update and commit [the tracker](progress.md) in the same branch/PR as the work.
   Record SHA(s), evidence, findings/dispositions, checks, coverage gaps, blockers,
   decisions and the explicit next scope. Record public links without secrets or
   exploit details; keep sensitive evidence in an already authorized private
   location. Do not create a new service or credential for evidence storage.
2. Verify the committed diff contains only this scope and no credentials or
   business data. Publish through the authorized repository workflow. If remote
   publication is blocked, preserve a local commit and record the exact blocker;
   do not claim the tracker is available on main.
3. Give the user a short, self-contained result: outcome, evidence, checks,
   limitations and release state. Distinguish implementation from production.
4. **Conclude with a copy-ready prompt to kick off the next scope.** Fill in the
   template below with real paths, scope ID, current branch/commit or PR and the
   first unresolved action. The prompt starts the next session; do not silently
   execute the next scope. If authorization is missing, make that boundary
   explicit. If the review is complete, make the next prompt the concrete
   remediation/backlog decision; never invent another audit to keep it going.

### Next-session prompt template

```text
Continue the Escocia OS security work from <branch/commit or PR>.
Read CLAUDE.md, docs/security-review/plan.md,
docs/security-review/session-guide.md and docs/security-review/progress.md,
plus relevant module instructions and skills.
Start only <NEXT_SCOPE_ID — name>, using its completion criteria.
First verify the exact current code/deployment/catalog baseline; if unavailable,
continue code-only and record the precise gap. Prior completed scope: <ID/result>.
Start with <first unresolved action>; preserve <specific constraints/blockers>.
Mode: <read-only assessment OR specifically authorized remediation>.
Do not resume PR324 or broaden into redesign. Production changes need applicable
scope-specific authorization; carry forward authorization already given.
Update and commit the tracker at close-out. Report evidence, checks and gaps.
End with a copy-ready prompt for the next scope; do not auto-start it.
```

Replace all angle-bracket fields. A blocked scope's prompt must say what can
proceed independently and which missing fact/approval must remain pending.
