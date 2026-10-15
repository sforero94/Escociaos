# Prepared alert response callers — October15

Preparation only. No migration, deployment or production connection. Direct alert/event grants are unchanged. Requires the complete seventeen-candidate graph ending in `alert-response.sql`; callers must not deploy before their compatible RPC boundary.

The actual AlertasView and private Telegram alert callback now prepare a response before changing an alert or creating a secado event. Clinical “sí” retains the separate clinical step protocol. The browser dialog and native original message show captured animal identity, alert type, scheduled date, chosen response/date and the prospective secado effect; clinical negative responses also show the captured treatment and step. Preparation never posts. A separate confirmation is required; the native post checks that Telegram supplied the exact delivered prepared preview.

Strict shared proof validation binds canonical intent, original owner/key or private sender/chat/message, actor, source graph and receipt. The receipt must preserve the original animal, clinical graph and pre-existing events, change exactly the expected alert fields and, only for secado “sí”, add exactly one fully specified trusted-actor event. Missing/extra/altered events, arbitrary success flags, owner changes, extra fields and timestamp drift refuse. Nullable worker profiles and existing JSONB fields remain intact; negative clinical responses can preserve an already executed step.

Browser local storage reserves an owner-bound UUID before the first request, verifies storage readback and uses Web Locks across tabs. Uncertain prepares/posts, closing/remounting, peer completion and account switching retain the original attempt. Posting requires the reviewed snapshot; an explicit verified terminal result is required before clearing it. The old hook response writer refuses before domain access, without a direct-write fallback. Manual/edit/bulk remain separate writers.

Telegram creates one private anchor before preparation and retains the original action after a lost response. Recovery middleware precedes conversation replay and uses the original native action without depending on conversation/session survival. Forwarded controls refuse before RPC. A lost first prepare can only be prepared again with its saved original intent; otherwise status/cancel operate on that action. `/cancelar` verifies the server fence or committed receipt before clearing its control or exiting; a committed response is never described as undone. Broadcast/render failure after a verified commit does not repost or report a database failure. Both edge roots and the browser/edge protocol copies are byte-identical.

Reproduce the actual installed SDK proof with the local four-export replay:

```sh
python3 scripts/security/alert-response-callers-replay.py /workspace/escociaos-security-control/schema-evidence --runtime /tmp/escocia-pg17-runtime/package/native --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js --output docs/security-integrity/alert-response-callers-replay.json --private-diagnostics /tmp/escocia-alert-callers-private-diagnostics
```

The proof installs all seventeen candidates before all31combined mutations and tests browser lost-post/owner-switch plus actual native prepared-preview/sessionless/lost-response recovery. It independently compares durable audits and actual domain snapshots, verifies whole-state preservation, records source hashes and removes the local database. The transport uses the installed SDK with synthetic Auth and local private-socket PostgreSQL; hosted JWT, webhook delivery, conversation persistence and deployed parity remain unverified.

Remaining gates: manual/edit/bulk/cron and event/animal lifecycle CAS/retry/current actor, then compatible direct-writer retirement, inactive/missing-profile reader restrictions, ordinary-role/runtime/global review and real recovery. No historical repair, silent expense deletion or invented provenance is authorized.

Final validation:34aggregate native assertions with all31combined mutations;25nested installed-SDK assertions (7browser lost-post,5owner-switch,13private native recovery), source hashes current and database cleanup verified. Focused81cases and full261files/5,419App tests pass66.19s;29Python tests pass. Typecheck and lint logs: `/tmp/escocia-alert-callers-typecheck-verified.log`, `/tmp/escocia-alert-callers-lint-verified.log`; final native/App logs use `native-verified`/`tests-final` under the same prefix. The earlier driver SQL-string syntax error was fixed and its replay superseded by the final source-hashed result.

Final lint:0errors/874warnings (existing warning backlog); typecheck passes.
