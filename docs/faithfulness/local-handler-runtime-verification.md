# Local handler and runtime verification

Scope: local verification after `de71a7e1de1e9073945dc64620f2f09ae04686f5`. No code transfer, push, PR, merge, workflow dispatch, deployment, production query or real model call. Existing security/permissions and the reliability-first selected-tool scope remain unchanged.

## Actual exported handlers, closed transport

- Web: actual `handleChatMessage`, JWT verification HTTP boundary, Gerencia lookup, conversation ownership, actual tool loop, SSE, user/assistant persistence and failures. Twenty-one synthetic handler cases cover aggregate facts, explicit supplier versus quoted example, contaminated history, source failure, unsupported terminal prose, invalid bodies and failures before/after SSE. Only the 15 ms SSE delay is accelerated; the real 55-second model deadline is scheduled and its cancellation is asserted.
- Telegram: actual `handleWebhook` and real grammY middleware/conversations engine, real installed Supabase SDK with closed REST, original identity resolver and actual tool loop. Twenty-three cases cover secret before parsing, active membership, consultas module, fresh link revocation/null/error, aggregate and counterpart projections, contaminated history/reply metadata, errors, malformed updates and no QuickChart. No write conversation is entered.
- HTTP context is a synthetic request/context facade. Hono is not installed, so neither mounted HTTP index/router nor real network server is claimed. Deno is absent; no installation was attempted. JWT cryptography, live Supabase/PostgREST, real webhook registration and Telegram delivery are untested. Installed Node libraries/transpilation are not an assertion of identical Deno resolution or binary behavior.

The handler regressions reproduced and corrected: non-object/non-string Web input throwing before storage; raw database/provider JSON errors reflected in Web output/logs; raw Telegram rejection/internal diagnostics in webhook errors/logs; and raw linked-identity lookup errors in logs. Valid queries, auth/module/link policy and business calculations are unchanged. Invalid requests return bounded 400 before Bot initialization; operational failures remain explicit 500 or SSE error without a false done/assistant persistence success. Error bodies, arbitrary exception text and provider prose are not response authority.

## Local source graph, not a native-download claim

TypeScript 5.9.3 parses all 109 runtime files without syntax errors. The static entry graph has 276 local edges (47 syntactic type edges, 229 value edges), no missing relative path, no nonliteral import/require, and all 109 files reachable including types. Syntactic value reachability is 107; **this does not prove a 107-file native download**. No bundler, Deno resolver or new capture was run.

The existing pure type proof passes on the candidate: only `importHato/tipos.ts` and `telegram/types.ts` emit empty modules, their exact pinned hashes match, and all 10/8 references satisfy the original type-only rule. No new omission is authorized. External Deno/npm/jsr dependencies remain existing source declarations; some cannot be resolved by the available Node environment, including Hono. No dependency/configuration/provider changes are made.

## Recovery and future control binding — analysis only

The previous accepted release identifies v290's Git source as `19618994fd1d27e894154408f85f43cac6e507fe`. A temporary LOCAL copy from that fixed Git object proves:

- edge tree `9decf9734cbf9adc95a365f16add6de570bc63c9`;
- complete inventory 85, fingerprint `e39c36ee3a703120cc6c767601777fac163f230474039513b08204021cc30f4e`;
- the same two exact type-only hashes and 10/8 references under TypeScript 5.9.3.

The temporary copy was removed. This is Git reproducibility evidence, not a current native capture or live metadata observation. No native fingerprint, current bundle, version or timestamp was invented from it.

Existing release-status controls are already consumed and remain unchanged: they pin candidate 19618994, rollback 48a925cc/v289, baseline v289 and 85-file proof roles. The capture helper accepts only its existing 84/85 inventories. These controls do not authorize this 109-file candidate or a v290 recovery binding. The `--source` step outputs the fixed source pin; the actual source/tree verification occurs later, after initial metadata. A future reviewed control should validate its final main/candidate tree locally before the credential step, not rely on that step's label.

Before any future activation, bind the final approved merged source/tree/fingerprint and per-role candidate109/recovery85 inventories; obtain/review current metadata and the actual fresh capture inventory. Unknown missing/extra/changed files, wrappers, symlinks, source/config drift and type-reference changes remain rejection conditions. Do not broadly allow arbitrary counts or presume compiler omissions.

Two fresh matching recovery captures, complete source/config/type reconstruction, preserved entrypoint/import-map/JWT settings, exclusive window, immediate pre-deploy metadata, ownership/version/hash checks, health and owned conditional rollback remain mandatory. Failed/uncertain source verification or competing ownership is an inspection stop, never blind retry or rollback. Recovery is source/configuration reproducibility, not an identical binary, database rollback or deletion of context receipts. No production control is modified or executed here.

Final local check receipts, new commit, manifest/category totals and current candidate fingerprint are recorded in the handoff. Publication remains on hold independently of successful local tests.

## Final local receipts

6,427 tests in 278 files pass, including 21 Web and 23 Telegram handler cases. TypeScript and production frontend build pass; ESLint reports zero errors and the same 907 existing warnings. Independent review is GO for the bounded error/validation delta and three mirror pairs. Existing 55 pesaje recovery cases pass. Deno/Hono/live integration limits above remain.

Runtime remains 109 files; the new local source fingerprint is `59d413c9e4a9a2cb1ee08d878e9641afa5b192e5a16e0850c6172cb50855f27d`. This supersedes de71a7e's source fingerprint for any future candidate binding. It is not an observed deployed bundle or download. Workflows, release controllers/proofs/pins, migrations, configuration and dependency manifests are unchanged.
