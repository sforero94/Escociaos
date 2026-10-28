# Session protocol

## Entry: bounded context

Read this file, `PROGRESS.md`, the selected task in `PLAN.md`, and only relevant decisions/source files. Read root `CLAUDE.md` and applicable `AGENTS.md`/nested instructions. Do not reread every historical conversation or private result to begin a task.

Run `pwd`, `git status --short --branch`, `git log -5 --oneline`, and `git worktree list`. Confirm that this checkout contains the accumulated planning branch. Preserve unrelated changes. In a managed cloud environment, follow its runtime/network instructions before service calls. Inspect credential readiness without printing secrets.

Select the earliest `ready` task whose dependencies are satisfied. Check `PROGRESS.md` for a claimed task. Mark it `in_progress` with the branch, objective, and next action. Run one session-sized task; split into `P*-*-a/b` if it cannot be verified within a session. Document why and retain the original acceptance criteria.

A `blocked` task must name the missing input, decision, or dependency. It does not block unrelated tasks. Ask the owner only when domain meaning, reviewed truth, access, spend, or rollout authorization is actually needed. Do not infer answers from elapsed time.

## Status meanings

- `ready`: dependencies satisfied; useful work can start.
- `todo`: dependent work remains.
- `in_progress`: a session owns a concrete slice.
- `blocked`: explicit external input/decision required.
- `done`: implemented, verified, committed, and evidence recorded. Local success is not a production deployment.
- `deferred`: intentionally excluded with reason and owner decision/reference.

Mark a task done only when its exit criteria pass. An isolated PR is `in_progress` until integrated, unless its integration location is explicitly recorded. Production gates may remain blocked while local preparation is done; list them separately.

## Validation

Use the focused tests named by the task. Run `npm run eval:esco:check` for harness/evaluation changes. Run relevant existing domain tests for tool calculations. Follow repository-required lint/type checks; document unrelated baseline failures instead of hiding or fixing them without scope. Documentation-only updates need link/task-reference/status consistency and `git diff --check`; no paid evaluation or mobile smoke is required for documentation alone.

Use `python scripts/sync-esco-consultas.py` when changing canonical consultation/chat sources; inspect its output and verify both edge trees. Recheck current repository deployment instructions. Local implementation is not authorization to activate production telemetry or apply a migration. Before a deployment, prepare and verify the candidate; resolve actual authorization requirements from session/repository context at that point. Do not silently deploy incomplete phases to satisfy a wrap-up convention.

Existing commands:

```sh
npm run eval:esco:check
npm run lint
npm run typecheck
npm run eval:esco
```

`eval:esco` defaults to plan mode. Original/live modes make paid provider calls unless explicitly deterministic-only. Use `evals/esco/README.md`; obtain the private dataset securely, set explicit output paths, and keep provider proxies/CA trust intact. Node 24 proxy-only environments require `NODE_USE_ENV_PROXY=1`; do not assume that flag exists on the Node version used by CI.

Future frozen replay, CI, and worker commands are deliverables of their tasks, not existing commands. Document them when implemented. Never claim a mocked model test measures real model quality.

## Exit: durable handoff

1. Record files changed, task acceptance checks, actual commands/results, and unresolved failures.
2. Update the task table and current-state block in `PROGRESS.md`.
3. Add one append-only session entry using the template below. Update `DECISIONS.md` only with attributed decisions.
4. Commit scoped work. Record the implementation commit in the progress record; a follow-up documentation commit can reference it without circular self-hashes. Include branch/PR links if applicable.
5. Record the exact next task and first command/action. Push the branch when authorized/available, or state that it is local only. Do not commit private runs, fixtures, credentials, or a `node_modules` symlink.
6. End every task-completion response with a ready-to-copy prompt for the next session, using the template below. Fill in the actual next task, branch, latest committed handoff, first action, and any blocking input/fallback from `PROGRESS.md`. Include it even when the user has not asked to start another chat. For an unfinished slice, name the remaining slice instead of implying completion. If no ready task remains, name the concrete review or owner decision needed.

### Next-session prompt template

Place this prompt at the end of the final response in a fenced text block. Resolve placeholders before sending; keep private evidence and credentials out of the prompt.

```text
Continue Esco faithfulness work in https://github.com/sforero94/Escociaos on branch `<branch>`, starting from the committed handoff at `<commit>`. Read root CLAUDE.md, applicable AGENTS.md, and docs/esco/faithfulness/SESSION.md and PROGRESS.md. Then read task `<next task ID and title>` in PLAN.md and its relevant decisions in DECISIONS.md. First action: <exact command or action>. <Known blocker and independent fallback, if any.> Complete one session-sized task or documented slice, run the required checks, update the progress and handoff records, commit, and push when available. Preserve unrelated work. Do not enable production telemetry, paid schedules, migrations, or rollout solely because they appear in the plan. End with a ready-to-copy prompt for the following session.
```

### Session entry template

```text
Session: <date and short label>
Task: <ID / slice>
Branch: <branch>; implementation commit: <hash or pending>
Start: <state inherited>
Changed: <paths and behavioral change>
Verification: <commands, pass/fail/skipped, artifact location>
Decisions: <IDs resolved, who decided, evidence>
Remaining: <unfinished acceptance criteria / explicit none>
Next: <task ID and exact first action>
Production state: <local only / migration status / deployment version and verification>
```

Private evidence locations are optional conveniences, not durable dependencies. A new machine must be able to reconstruct the task from committed code, sanitized fixtures, and authorized private artifact access. If private data is missing, use public/synthetic tests and record the missing private validation accurately.
