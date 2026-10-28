# S3 — Telegram identity and privileged operations

Assessed 2026-10-28 (America/New_York). Read-only assessment with gaps.
Documentation only; no fixes, migrations, production writes or release.

## Baseline and evidence limits

- Reviewed source: `6bc295196237d2a9d855a406a333464e22b0fef8`, [PR #354](https://github.com/sforero94/Escociaos/pull/354),
  branch `docs/security-review-session-plan`. PR head was verified before review.
  The `src/` and `supabase/` Git tree IDs match F1
  `e1518d09ae8f27726499b4a93dfbffbb10516b4f` exactly. All 15 Telegram
  files have identical Git blob IDs in the two edge source trees.
- Production frontend metadata and deployment-specific aliases reverified:
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED,
  SHA `e1518d09ae8f27726499b4a93dfbffbb10516b4f`,
  [escociaos.vercel.app](https://escociaos.vercel.app). No live UI or operator test.
- Supabase account `supabase_bitis-coward` / `escocia-os`, project
  `ywhtjwawnkeqlwxbvgup`: edge `make-server-1ccce916` remains v279 ACTIVE,
  `verify_jwt=false`, reported hash
  `60ef9ded0d685a9ab7a627f6f2ce2b5a28a0908a948e46900aaae8e25fdc155b`,
  entrypoint still in a version-278 directory. This is metadata, not source parity.
  All edge control-flow conclusions below are **code-only**.
- Latest live ledger remains `20261028014545` /
  `185_inventario_guardado_atomico`. Catalog SELECTs inspected Telegram RLS,
  selected unique indexes, trigger names and function ACL/security/search_path/hashes.
  No business/personnel rows, account roster, Auth users/sessions or logs were read.
- **Edge-source export is already approved** but remains blocked by connector/workbench
  HTTP 413 / `ToolRouterV2_PayloadTooLarge` (4345). No repeated oversized export.
  **Broad database-source export remains separately unapproved** after the earlier
  automatic approval rejection. No body export or alternate route was attempted.
- The supplied local checkout was `5163501` on an unrelated security branch,
  without the review documents or `6bc2951` object. Direct Git access failed DNS;
  Composio clone timed out and its file mount disconnected. Review therefore used
  immutable GitHub file/tree reads, with a temporary subset for source/hash checks.
  The local execution environment subsequently disconnected. No clean full checkout,
  local commit or current lint pass is claimed. Publication uses the exact parent
  and Git tree through the existing documentation branch; unrelated work is untouched.

## Identity-to-operation map

Source links pin the reviewed SHA. Telegram modules are an independent permission
system. `rol_bot`, `usuarios.rol`, web `modulos_acceso` and bot
`modulos_permitidos` are not interchangeable. Service-role execution bypasses
browser RLS, including when a called RPC is INVOKER.

| Boundary / operation | Caller validation and identity freshness | Write / replay boundary and disposition |
|---|---|---|
| Webhook | [Route](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/index.ts#L89) calls [handleWebhook](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L2748). Missing configured secret returns 503; missing/wrong header returns 401 before JSON parsing or bot initialization. SHA-256 digests are compared with accumulated XOR. | The old anonymous-spoofing lead is refuted in repository source. Runtime secret configuration, Telegram registration and deployed handler parity remain unchecked. Gateway JWT setting alone is not a finding. |
| Bot middleware | [Active Telegram lookup](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L207) resolves `ctx.from.id` against `telegram_usuarios.activo=true` before conversation resumption. Only `/start` permits an unregistered caller. | Subsequent updates from a disabled Telegram row are denied in source. It does not join app role/activity. A callback UUID or display name is not the authenticated identity. |
| Binding / administration | [Binding](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L336) requires an issued code, unbound row and expiry, then clears the code. [Configuration](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/src/components/configuracion/TelegramConfig.tsx#L239) stores bot modules and optional linked app ID separately. Live Telegram-user policy requires `es_usuario_gerencia()`. | Preserve documented binding behavior; no unbound-chat write was established. Binding concurrency, current codes and account membership were not tested. No current roster inferred from old memory. |
| Identity resolver | [Resolver](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/resolverUsuarioTelegram.ts#L98) rereads an active Telegram row by native sender ID, returning app ID/name. [Required link](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/resolverUsuarioTelegram.ts#L144) checks only non-null app ID. | This repairs conversation flavor/attribution loss. It does not establish app activity, current app role or bot module permission. Field flows deliberately allow a null app ID; do not refile that as broken binding. |
| Labor / monitoring | Entry commands and menu callbacks check `labores` / `monitoreo`. [Labor attribution](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts#L158) and [Monitoring attribution](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/monitoreo.ts#L68) resolve once inside `conversation.external`. | Later saves use captured attribution without a final module check. Labor checks existing registrations, but replacement remains separate DELETE/INSERT (S1 medium item). Monitoring round creation and observation INSERT are separate requests. Neither is an F1 receipt flow. |
| Income / cattle finance | [Income entry gate](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L426) requires `ingresos`. [Regular income](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/ingreso.ts#L713) resolves active Telegram identity at write time; it permits null linked app ID. [Cattle branch](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/ingreso.ts#L507) inserts directly without another resolver. | Both use service role, without final current module/app-role checks or durable request key. `ingresos` intentionally survived removal of `gastos` (162). No new anonymous financial writer or current unauthorized recipient is asserted. |
| Dairy weighing | `hato_produccion` checked at entry. [Conversation](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/pesajeLeche.ts#L243) requires linked ID, captured before waits; [Commit](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/pesajeLeche.ts#L510) passes that ID. | [Shared pipeline](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/hato-pesaje-pipeline.ts#L614) revalidates animal roster, configured dates and existing cells, not caller permissions. Per-cell saves are intentional; unique animal/date prevents duplicate cells, but a later replay can update a cell. No new all-or-nothing requirement. |
| Dairy events / new treatment | `hato_produccion` at entry; [Write resolver](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/eventoHato.ts#L938) rereads active Telegram identity at save, allowing field identity without app link. | Event INSERT, optional calf and straw-use work are multiple requests. Manual-event/straw unique indexes limit duplicate facts. New treatment uses atomic RPC 140, without a durable operation receipt. Current module/app-role/activity are not rechecked there. |
| Pending treatment step | [Selected-step confirmation](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/conversations/eventoHato.ts#L437) rereads active Telegram identity and requires app ID before service-only RPC 177. | [177](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/src/sql/migrations/177_hato_confirmar_paso_tratamiento.sql#L17) locks treatment then step; same-date retry is safe, another date is rejected; step, linked alerts and completion commit together. Live literal-body hash matches. It does not replace the general alert callback. |
| Inventory ronda / explanation / approval | Current module checks in handlers; conversations pass explicit Telegram row ID to RPCs. [Actor validator](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/src/sql/migrations/126_ronda_inventario_rpcs.sql#L302) distinguishes browser self-identity from active/module-authorized Telegram actor. Approval adds [linked Gerencia](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/src/sql/migrations/126_ronda_inventario_rpcs.sql#L995); [UI helper](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/ronda-helpers.ts#L566) reads current app role. | RPCs enforce ownership/state/locks. 132 proposal and 147 backed capture revalidate module at transaction entry; their live body hashes match. Approval source omits app activity, but its full live body differs literally and is not exported: do not assert that omission live. Applying an already-approved adjustment by any authorized ronda actor is documented behavior. |
| Esco / memory | [Free-text Esco](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L2490) checks `consultas`, resolves a linked app ID and calls exported `llmToolLoop` directly, bypassing the web HTTP Auth gate. [Memory callback](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L1316) requires active Telegram identity and link, then searches that user's conversation. | No current app activity/role check is added by this caller. `consultas` is the documented sensitive bot permission; no new arbitrary cross-user read was found. Memory callback has no module recheck, enforced TTL or consumed-token record despite its comment. Own-memory replay/expiry is a separate low-impact design risk. |

## Stale callbacks, retry and ranked dispositions

**No new verified critical/high vulnerability. No immediate remediation candidate
displaces S4.** Repository confidence and production applicability are separate.
The following scope labels do not invent or replace historical finding IDs.

1. **Separate app/bot revocation — medium design risk; production path unconfirmed.**
   Normal app edit bans Auth (S2), but [that handler](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/usuarios.tsx#L188)
   does not update Telegram activity/modules. Telegram does not authenticate with
   that app JWT. An app ban is therefore not evidence of Telegram revocation.
   A still-active Telegram identity with its module can satisfy repository gates
   after app deactivation/downgrade; sensitive Esco/income paths lack a current app
   check. Inventory approval uniquely rereads app role; activity remains a source
   lead with live body parity open. This is not evidence of an affected account,
   unauthorized grant, or live exploit. Preserve the independent field-permission
   model, retained `ingresos`, retired `gastos`, Monitor's Telegram-only use,
   field identities without app accounts, and existing ESCO-117 dispositions.
   Minimum next evidence: intended cross-channel revocation policy, deployed
   edge parity and controlled development cases. Do not change roles implicitly.
2. **Module removal during an active conversation — verified source authorization
   gap; medium, production applicability unconfirmed.** Module checks precede
   `conversation.enter`. The active-Telegram middleware runs again, but a resumed
   conversation reaches its save without rerunning those command gates. Resolvers
   check Telegram activity, not module membership. A legitimate operator who
   started an income/labor/dairy flow can finish after only that module is removed,
   provided their Telegram row remains active and conversation state survives.
   This does not mean Telegram deactivation is ignored. Inventory RPC actor checks
   are a stronger counterexample. Smallest future scope: current bot module and
   applicable identity requirements immediately before sensitive writes; preserve
   field exceptions. Focused development regression: start, revoke only module,
   resume confirmation; also test Telegram disable, missing link and allowed field
   identity. No implementation authorized; synchronized edge rollout would retain
   state and use a prior edge release for rollback, without deleting sessions.
3. **General alert claim before effect — verified source integrity defect; medium,
   production applicability unconfirmed.** [Alert handler](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L1658)
   atomically changes a pending/enviada alert before its later secado-event INSERT
   or treatment-step UPDATE. Domain errors are logged, then the callback still
   thanks the operator. A subsequent callback sees the closed state and skips the
   effect. A failed domain write can therefore leave a confirmed alert without its
   intended farm action, and retry cannot repair it. Only the timestamp trigger
   was listed on live `hato_alertas`; full trigger body parity remains open.
   The first-response claim prevents sequential duplicate effects; it does not
   make those requests one transaction. Smallest future scope: atomically persist
   the claim plus its required domain effect with existing response semantics.
   Test domain failure rolls back the claim, retry, concurrent responders and
   already-resolved alerts. Separate from 177's safe selected-step flow. Additive
   database-before-edge rollout and receipt/state-preserving rollback would need
   authorization and development validation; no reopening of resolved alerts here.
4. **Delivery replay — design risk / unchecked runtime outcome.** The webhook
   passes each accepted update to `bot.handleUpdate`; application code has no
   durable `update_id`/callback operation receipt. Sessions/conversations are
   keyed state, not F1 receipts. [Adapter](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L136)
   logs read/write errors and does not fail a save when a conversation-state write
   fails. A domain commit followed by lost conversation persistence can leave
   retry uncertain. `conversation.external` replay behavior is not a database
   transaction or proof of exactly-once delivery. Finance/treatment INSERTs have
   no supplied stable request ID; live unique indexes on those tables cover only
   their generated PKs. No duplicate caused by a Telegram retry was demonstrated:
   exact resolved plugin behavior, delivery concurrency and development crash
   recovery remain unchecked. Keep this separate from S1's proven labor
   replacement window and F1's durable receipts.

### Callback-specific positive checks and accepted limits

- Ronda preview/discard/undo validate current module and transcript actor/state.
  [Handlers](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L1973) pass the declared actor to RPCs;
  discard additionally predicates actor and pending state. Proposal 132 preserves
  130's state guard; the stale-reset bug is not refiled. Apply requires locked
  `ajuste_aprobado` state and live balance; repeat cannot silently apply the same
  approved state again in repository source. A decision and its automatic apply
  are separate RPCs: a failed apply can remain approved for the documented retry.
- [Event undo](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L1428) requires an existing
  `fuente='telegram'` event; calf deletion fails closed on references and checks
  provenance. [Treatment undo](https://github.com/sforero94/Escociaos/blob/6bc295196237d2a9d855a406a333464e22b0fef8/supabase/functions/make-server-1ccce916/telegram/bot.ts#L1603) rejects web-created
  treatments and any executed step. A completed sequential delete replay finds
  no row. Neither has creator/module/age authorization at callback entry beyond
  active Telegram middleware. The event-undo access limitation is a documented
  accepted note, not a newly filed high issue. Genuine old buttons and authorized
  recipients are the realistic prerequisite; no callback forgery or arbitrary
  UUID reachability is asserted. Check/delete races and multi-request undo failure
  are design risks, not claimed successful double deletion or financial damage.
- Alert responses do not independently recheck subscription/module or linked app
  role; an earlier recipient's still-usable button is not itself proof of current
  permission. Recipient revocation semantics need an owner decision. A resolved
  alert suppresses later effects. This does not close the failed-effect window.
- No direct Telegram manual-stock balance assignment was found in the mapped
  ronda helpers; stock effects go through actor/state-validating RPCs. This does
  not certify every service-role tool or reopen F1.

## Catalog corroboration and remaining gaps

- `telegram_usuarios`: RLS enabled, one Gerencia ALL policy. Sessions,
  conversations, messages and alert delivery rows: RLS enabled with no policies,
  deny-all as documented for browser callers. The bot uses service role.
- Fourteen ronda/treatment functions sampled first, plus selected-step RPC 177:
  INVOKER, pinned `public, pg_temp`, no anon EXECUTE. Ronda report emission and
  177 also deny authenticated EXECUTE; service role can execute. ACLs are not
  evidence of handler authorization or deployed source equivalence.
- Local literal MD5 matches live for proposal 132
  `e19181bcf96e4383ce6df970a3b6af1a`, backed capture 147
  `611a7d7b6ba8bc5e101e8782c0a40f49`, and selected step 177
  `ca3a7e740d6eeb20fe0c48c10531adf4`. Treatment 140 retains S1's match
  `5504439a268818623461faa6ba669481`.
- Actor, approval, apply and confirmation historical literal hashes differ from
  live. Actor live `9a28228bd43e05dd47c1a9c280c0e534` vs 126
  `099ff31a39346463c1da8b72bdc558f0`; approval live
  `1b53f8b074e92c2e503bb237ec862daa` vs 126
  `50296787f899e69f4622e0f4afeae44e`. Differences do not establish semantic drift.
  Prior permitted S1 actor/lock observations remain evidence; complete current
  body parity is open. No new body export was requested.
- Live unique indexes corroborate manual-event/straw deduplication, animal/date
  pesaje uniqueness and Telegram sender uniqueness. Finance income/cattle and
  new-treatment tables have PK-only unique indexes. These are constraints, not
  observations of duplicate or corrupted business records.
- Trigger metadata showed no noninternal trigger on `usuarios`; Telegram users
  and alerts listed only timestamp triggers. No claim about external provisioning
  hooks or the complete behavior of unexported trigger bodies.
- Carry forward S2's inactive creation/Auth provisioning and TTL/session uncertainty,
  owner-only revocation limits, broad SELECT class and unsampled live policy/body
  gaps. No account counts or current role/module distribution verified here.
- F1 receipts, pending attempts, old-tab risk and open legitimate-operator
  confirmation remain unchanged. Preserve all receipts/state on rollback.
  Inventory's documented terminal-state/uncatalogued-product gaps remain separate.
  Storage, secret values/configuration, logs and reachable dependencies remain S4;
  no Storage operation, bot message, live probe, business query or PR324 work.

Checks: pinned Git tree/blob identity; read-only catalog/deployment metadata;
nonmutating local literal-body MD5 comparison completed before disconnection;
documentation paths/line bounds, fences, whitespace and scope/credential checks
at close-out. Lint execution is blocked by the disconnected local execution
environment; prior S2 lint evidence is not presented as a new pass. No runtime
suite, installs, mobile retest, impersonation or production test transaction.

Next: **S4 — secrets, file access and reachable dependencies**, read-only only.
Begin with source/configuration file boundaries and the resolved `xlsx` parsing
lead against reachable callers and current primary advisories. Do not start S4
within this session.
