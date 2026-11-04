# Esco 2.0 — local-session handoff, 2026-11-04

> Historical checkpoint, superseded by [the Astra planning handoff](handoff-2026-11-04-astra.md).
> The redeploy and real-role checks described below were later completed, and D31 was run
> independently with acceptance rejected. Preserve this note as history.

Read this update first, then `handoff-2026-11-04.md`, the Esco 2.0, migration and
edge-function rules in root `CLAUDE.md`, and the domain documents named in the earlier handoff.
This file contains only implementation status and aggregate evidence.

## Saved work

- PR #412 merged into `main` as `b075fea`: labor widening, including the fix that skips
  application rows whose `tarea_id` is NULL.
- PR #413 merged into `main` as `0596352606345e34c06900b43fe09bfa98a13371`.
  It fixes date scoring and D30 estimates when there are no registered work rows.
- The original fix branch, `codex/esco2-labor-review`, is pushed at `a56fff4`.
  Do not reapply it: its changes are already in `main` through #413.
- The handoff branch, `codex/esco2-deploy-preflight`, starts at `0596352` and adds this note.
  It contains no deployment or migration changes.

## Review and evidence

- Date scoring now uses one parser for required and extra dates, recognizes typographic range
  separators, rejects quantity ranges as dates, and derives the year from explicit calendar context.
- For category queries with no work records, the prompt, required-figures guard and deterministic
  response preserve estimates for the complete task plan (D30).
- Twelve synthetic regression tests failed before the corrections and passed afterwards.
- Full local suite: 294 files, 7,165 tests passed. Type checking passed.
  Lint: zero errors and 907 pre-existing warnings, unchanged from #412.
- PR #413 CI and Vercel checks passed before the approved merge.
- Public documentation and the #412 description no longer state the case reference values found
  during review. Earlier Git history still contains the already-published values.
- No models, production data reads or held-out evaluation were used for this review.
  No real web/JWT exercise or post-deployment behavior was verified.

## Approval boundary and next work

Santiago approved committing/pushing the fix PR and merging #413 after CI passed.
**He has not approved a deployment or migration in this chat.** The last request was to
continue in a local session. Do not interpret earlier "yes" or "approved" messages as deployment
approval.

1. **Ask for explicit approval to redeploy `esco-consultas` from the reviewed source.**
   The last recorded deployment remains v1 from `cc407600`; no deploy ran during this session.
   Use the pinned CLI command from the repository root:

   ```sh
   npx supabase@2.117.0 functions deploy esco-consultas --project-ref ywhtjwawnkeqlwxbvgup --use-api
   ```

   Confirm the source revision and a clean worktree before deployment. Keep
   `[functions.esco-consultas] verify_jwt = true`. After deployment, verify the live JWT setting
   and that anonymous `GET /functions/v1/esco-consultas/health` returns 401. Gerencia 200 and
   Administrador 403 with real sessions remain unverified.
2. Tell Santiago that the independent evaluator must rerun the same 50 scenarios (D31) against
   the updated core and report aggregates only. **The implementer must not run or inspect them.**
3. Migration 190 was written and rehearsed but not applied in this session. Its live ledger status
   was not queried here. Apply only with separate explicit approval, then update its `CLAUDE.md`
   entry against `supabase_migrations.schema_migrations`, never the SQL header.
4. Before any pilot, add a per-user spend cap or rate limit to `esco-consultas`, with pure logic
   under `src/utils/esco2/` and tests. Its deployment also needs approval.
5. After labor acceptance, start aplicaciones from `m1-dominios.md`. Ask Santiago for its milestone
   name before writing domain documents: `m4-labores.md` already uses M4 for the labor widening.

## Local setup

The cloud environment lacked `SUPABASE_ACCESS_TOKEN` and did not allow `api.supabase.com`.
Those are cloud setup limits, not evidence about the local session. Use the local CLI's existing
authentication or a securely configured token; do not paste or print credentials.
The pinned CLI package was checked as 2.117.0. In the cloud, its default state directory was
read-only; setting `SUPABASE_HOME` to a writable task directory allowed its version and deploy-help
commands to run. No deploy command ran. That workaround is unnecessary if the local home is writable.

## Rules to carry forward

- The repository is public. Golden sets, snapshots, cases, answers and keys stay in the git-ignored
  `docs/Esco 2.0/`. Commit only aggregate evidence and synthetic fixtures.
- D17: never open `docs/Esco 2.0/heldout/` or the held-out Google Sheet. Never record held-out details.
- No deploy, migration, secret change or merge without Santiago's explicit chat approval.
  Commit and push only when asked.
- Do not touch `chat.tsx`, `src/supabase/functions/server/`,
  `supabase/functions/make-server-1ccce916/` or the Telegram bot.
- Never print the OpenRouter key. Use `scripts/esco2/clave.ts` where needed.
- "Today" is Bogotá local time. Use `src/utils/esco2/fechaCalendario.ts` for calendar operations;
  never derive today with `toISOString().slice(0,10)`.
- Production data reads use the approved read-only route. Write hypotheses use
  `select public.po_sonda(...)`, which always rolls back.
- Never edit an applied migration. Check migration numbers against `main`, open branches,
  the live ledger and the `respaldos` schema before allocating a new one.
- New implementation branches start from current `main`, one PR per task.
  Git author: `thinksid <thinksid@users.noreply.github.com>`.
- Reply in Simplified Technical English, or concise Spanish with tú when Santiago writes Spanish.
  At task end, report changes, test evidence, unverified items and the next approval boundary.

## Links

- https://github.com/sforero94/Escociaos/pull/412
- https://github.com/sforero94/Escociaos/pull/413
- Notion master plan: `40d67755ed6881dba866f9775fca997e`
  (D19–D33, progress history in section 14).
- Notion task tracker data source: `40d67755-ed68-8031-b80a-000bdbf15c76`
  (E2-04, E2-05, E2-07, E2-08). This session read these records but did not update them.
