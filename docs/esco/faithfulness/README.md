# Esco faithfulness: incremental implementation

Status: planned; implementation has not started. This directory is the source of truth for work across sessions.

## Start a new session

1. Read [SESSION.md](SESSION.md) and [PROGRESS.md](PROGRESS.md).
2. Read the selected task in [PLAN.md](PLAN.md), its dependencies, and linked decisions in [DECISIONS.md](DECISIONS.md).
3. Inspect the current code and Git state. Implement one task or a documented slice; do not assume this document proves current runtime behavior.
4. Finish with tests, a commit, and an updated progress entry. Leave an exact next action if the task is unfinished.

Copy this prompt into a new chat:

> Continue Esco faithfulness work on branch `codex/esco-faithfulness-plan`. Read `docs/esco/faithfulness/SESSION.md`, `PROGRESS.md`, and the selected task in `PLAN.md`. Select the next ready task unless I specify an ID. Complete one session-sized task, run its checks, and update the progress and handoff records before committing. Preserve unrelated work. Do not enable production telemetry, paid schedules, migrations, or rollout solely because they appear in the plan. Ask only for a decision that blocks the selected task; continue independent work when possible.

The branch name remains stable as work proceeds. A session may use a task branch based on this branch, but must record the branch/PR and reconcile its status when integrated. Never start from `main` without the accumulated work.

## Documents

- [PLAN.md](PLAN.md): phases, individual tasks, dependencies, acceptance criteria, and verification.
- [PROGRESS.md](PROGRESS.md): current task, completed work, blockers, and append-only session history.
- [DECISIONS.md](DECISIONS.md): accepted scope, implementation defaults, and owner decisions that gate production work.
- [BASELINE.md](BASELINE.md): sanitized evaluation findings and source map; no private farm records.
- [SESSION.md](SESSION.md): session entry/exit procedure, validation, and handoff template.

## Delivery checkpoints

| Checkpoint | Tasks | Reviewable result |
|---|---|---|
| A: reliable measurement | P0-01–P0-03 | Reviewed measurement contract and first frozen fixtures |
| B: offline candidate | P1-01–P3-03 | Evidence controls, targeted domain fixes, reproducible comparison |
| C: online observation | P4-01–P5-04 | Versioned traces, bounded judging, feedback and review, disabled until activation decisions |
| D: production decision | P6-01–P6-03 | Measured pilot, rollout/rollback evidence, expanded benchmark |

Checkpoint B can ship independently of C after review. Owner decisions about online retention or cost must not block local evidence/tool fixes.

No GitHub issue number, production deployment, live migration, schedule, or monitoring activation is established by this plan. If an issue is created later, link this directory and task IDs rather than duplicating its status.
