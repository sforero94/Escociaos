# S1 — Remaining writes and F1 boundaries

Assessed 2026-10-28 (America/New_York). Read-only assessment; documentation
changes only. No remediation or production release is authorized by this report.

## Baseline and limits

- Reviewed checkout: `3fd28b988163d15f4711efd5e303eda54cbdadde`, PR #354,
  branch `docs/security-review-session-plan`. Its application and edge source
  trees are identical to F1 release `e1518d09ae8f27726499b4a93dfbffbb10516b4f`
  (`git diff` over `src/` and `supabase/` is empty).
- Vercel metadata and deployment aliases reverified: production
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED, SHA `e1518d0…`,
  alias [escociaos.vercel.app](https://escociaos.vercel.app).
  This confirms deployment routing, not a new browser/workflow test.
- Supabase account `supabase_bitis-coward` / `escocia-os`, project
  `ywhtjwawnkeqlwxbvgup`: ledger still records `20261028014545` /
  `185_inventario_guardado_atomico`. No migration was applied.
- Edge metadata now reports **version 279**, ACTIVE, `verify_jwt=false`.
  Reported hash is still `60ef9ded0d685a9ab7a627f6f2ce2b5a28a0908a948e46900aaae8e25fdc155b`;
  entrypoint still names a version-278 source directory. Neither establishes
  source parity. Backend observations below are **code-only** unless explicitly
  identified as database catalog evidence.
- Automatic approval review rejected full deployed edge-source export because
  it could expose sensitive implementation or embedded secrets through the
  connector/workbench. A later broad trigger/RPC body export was also rejected
  as a separate sensitive production-source export. Neither rejected action
  returned source. No alternate identity/endpoint or indirect export was used.
  Metadata-only reads succeeded; those do not close the body-comparison gap.
- Only catalog/ledger SELECTs and deployment metadata were read. No business
  rows, account roster, Auth sessions, logs, Storage objects, bot messages,
  live probes, or farm transactions were requested.

## Evidence convention

Source links below pin the reviewed SHA. Live observations were obtained on
2026-10-28 via `SUPABASE_RUN_READ_ONLY_QUERY`; metadata through
`SUPABASE_LIST_FUNCTIONS`, `VERCEL_GET_DEPLOYMENTS` and
`VERCEL_LIST_DEPLOYMENT_ALIASES`. Catalog reads covered `pg_policy`,
`pg_class`, `pg_proc`, `pg_trigger`, `pg_constraint`, `pg_indexes` and
`aclexplode(relacl)`. No payloads or business data are included here.

## Writer and boundary matrix

G = active Gerencia; A = active Administrador. These are database roles resolved
from the account, not sidebar module grants. Transactional means one database
request; it does not imply durable replay protection.

| Writer / records | Authorization boundary | Transaction, lock and replay boundary | Result / limit |
|---|---|---|---|
| F1 manual movement, complete purchase, purchase reversal | Live INVOKER RPC, G/A gate; product/purchase/movement RLS; own-user receipt RLS | Receipt + domain writes in one transaction; receipt and product row locks; purchase locks products in UUID order; absolute adjustment checks expected balance | Preserved. Same request returns its receipt. No fallback to individual writes. [185](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/sql/migrations/185_inventario_guardado_atomico.sql#L44) |
| F1 browser pending attempts | Session user ID namespaces local storage | Persist before send; ambiguous errors retain attempt; changed data blocked; late response only clears matching attempt | Existing release evidence reused. It does not coordinate distinct requests from separate tabs. [retry helper](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/utils/guardadoInventario.ts#L37) |
| Product form | Product RLS G/A | Edit strips `cantidad_actual`; creation forces zero | No remaining stale-balance assignment in this current web form. [form](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/inventory/ProductForm.tsx#L140) |
| CSV product import | JWT `getUser` + current G/A role; service-role INSERT | One INSERT per new product, accepts opening balance; unique name rejects existing product | Does **not** overwrite an existing product's balance. Partial import is explicitly reported. Known opening-balance design, not a new F1 finding. Activity/revocation and deployed handler parity go to S2. [importer](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/supabase/functions/make-server-1ccce916/importar-productos.tsx#L451) |
| Application closure | Live INVOKER RPC and G/A application/product RLS | One transaction; locks application and products; closed-state rejects repeat; product balances reread under lock | Shares product locks with F1. No stale client balance assignment. Repeat rejects rather than returning a durable receipt. Product ordering differs from F1: deadlock can abort a transaction, not partially commit it. [closure](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/sql/migrations/106_cierre_aplicacion_transaccional.sql#L164) |
| Daily application capture | Live parent/child INSERT policies G/A; parent DELETE/UPDATE requires owner | Parent, products, workers are separate requests; worker trigger belongs only to worker INSERT transaction; cleanup is a later DELETE | Verified source failure window; see results below. This captures usage; stock deduction occurs at closure. [capture](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/aplicaciones/DailyMovementForm.tsx#L650) |
| Application calculation/edit | Parent G/A RLS observed; child policy coverage incomplete | Parent write, deletion of old relations, then multiple inserts; some deletion errors ignored | Verified source failure window; not covered by closure RPC. [editor](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/aplicaciones/CalculadoraAplicaciones.tsx#L488) |
| Web labor registration/edit | Live `registros_trabajo` write predicates require active G/A | Batch INSERT is one statement; daily total precheck is a separate SELECT; edits are direct updates | 149's daily-total guard is on the daily-worker trigger, not a general labor-table constraint. Concurrency and nullable uniqueness need separate verification; no claim of observed overpayment. [capture](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/labores/RegistrarTrabajoDialog.tsx#L275) |
| Telegram labor replacement | Service role; bot linked-user/module gates, conversation resolver | `conversation.external` encloses separate DELETE and INSERT HTTP requests, not a database transaction | Code-only integrity defect; identity freshness/replay authorization remains S3. [replacement](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts#L824) |
| Expense/income browser batches | Live `fin_gastos` / `fin_ingresos` RLS G only | Each batch INSERT is atomic; file upload is separate; no durable operation ID or retry receipt | Lost-response retry can duplicate the batch. [expenses](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/finanzas/components/GastosBatchTable.tsx#L224), [income](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/finanzas/components/IngresosBatchTable.tsx#L256) |
| Cattle financial capture / confirmation | Live finance exception permits G/A; confirmation RPC is INVOKER | Financial INSERT and pending-movement trigger commit together; confirmation is a separate RPC locking pending row; UI reports failed confirmation and directs operator to existing pending movement | Deliberate recoverable pending state, not proof that stock and finance commit together. Weight edits perform additional best-effort requests. [form](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/finanzas/components/TransaccionGanadoForm.tsx#L475) |
| Dairy quincena + income; animal sale | INVOKER RPC; finance RLS G only for linked income; metadata verified | Related writes inside one RPC; live quincena unique period and income FK RESTRICT | Quincena save body hash matches migration 085. Other body parity not established. No F1 receipt semantics inferred. [hook](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/hato/hooks/useProduccionHato.ts#L270) |
| Dairy treatment + next step | INVOKER RPC; web G/A RLS; bot service-role caller separately gated | Header and step in one RPC; local body hash matches live migration 140 body | Atomic pair confirmed by source/hash, not exactly-once registration. [140](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/sql/migrations/140_hato_registrar_tratamiento.sql#L100) |
| Dairy death, alert actions, manual cycle/birth and weighing | Web G/A write RLS sampled; bot uses service role | Death is event INSERT then status UPDATE; some other actions are also multiple requests. Weighing cells are intentionally independent facts | Death failure window below. Per-cell weighing is documented acceptable behavior. Other multi-record handlers remain unchecked in detail. [death](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/components/hato/hooks/useRegistrarSalidaHato.ts#L75) |
| Telegram inventory ronda | INVOKER RPCs, explicit actor validator; browser actor must equal session, bot actor must be active linked Telegram row with module | Exception and product locks; current-balance delta; exception state guards prevent repeat application; writes inside RPC | Live bodies for apply/resolve/actor were read in the initial permitted catalog query. No F1 receipt used. Linked app account activity remains S2/S3 lead. [147](https://github.com/sforero94/Escociaos/blob/3fd28b988163d15f4711efd5e303eda54cbdadde/src/sql/migrations/147_fn_ronda_resolver_con_captura_cantidad_confirmada.sql#L100) |
| Telegram income, cattle, dairy events and undo | Bot binding/module gates; service role bypasses browser RLS | Direct inserts, RPCs and compensating deletes vary by handler | Entry points mapped in `telegram/conversations/{ingreso,eventoHato,jornal}.ts` and `bot.ts`; complete stale-callback and replay analysis reserved for S3. Source deployment parity open. |
| Old open browser tabs | Existing direct inventory table grants/RLS | Old client can still perform individual writes and assign a previously read balance | Known residual release risk. Refresh tabs; preserve pending attempts. F1 did not revoke these grants or invalidate old bundles. No observed stale-tab transaction claimed. |

## Ranked results and dispositions

No new verified critical/high vulnerability was established. No urgent remediation
scope displaces S2. The following are **medium integrity defects**, ranked for
follow-up within the small internal team's ordinary workflows. They require an
authorized operator and a failed/interrupted request or uncertain response; no
unauthenticated write or confirmed farm-data damage is asserted. Confidence in
the source failure paths is high; backend deployment confidence is separate.
These descriptions are scope labels, not replacements for existing ESCO IDs.

| Result | Evidence and practical failure | Smallest future fix / focused regression / rollback |
|---|---|---|
| Finance batch retry — verified source defect; live constraint corroboration | Batch INSERT success is followed by draft clearing. A response lost after commit takes the error path and retains input; retry submits new rows. Live unique indexes on both finance tables cover only `id`, which these payloads omit. Amounts can be counted twice; no business rows were examined. | Stable operation key and transactional batch receipt; retain uncertain input until lookup. Test committed-but-lost response, reload, changed payload and role loss with synthetic data. Additive migration before client; rollback keeps receipts/uncertain attempts and pauses recapture. Authorization and development validation required. |
| Application edit replacement — verified source defect; child policy parity incomplete | Editor commits parent update and deletes old relations before rebuilding them. Some delete errors are ignored; later insert failure leaves an incomplete/mixed saved plan. Closure atomicity does not protect calculation edits. | One INVOKER save RPC for existing plan replacement; check every result and preserve existing role semantics. Inject failure after deletions and verify full old plan remains; test successful replacement and concurrent edit policy. Additive migration before client; preserve the RPC on frontend rollback; no historical reconstruction automatically. |
| Daily movement capture — verified source defect; live RLS/trigger corroboration | Parent/products/workers commit separately. A tab interruption skips compensating DELETE; a lost child response can also leave the user uncertain. Existing parent PK is not a durable request key. Worker-trigger rollback cannot undo the earlier parent/product commits. | One role-preserving transaction plus stable capture key. Test failure at each child stage, lost response and repeat capture; assert one complete parent with correct children/labor. Additive migration before client; preserve receipts and resolve pending saves before rollback recapture. |
| Telegram labor replacement — verified code defect, **production applicability unconfirmed** | Existing registrations are deleted in one request; the following INSERT can fail. `conversation.external` provides conversation replay behavior, not rollback of the earlier database commit. Labor/cost history can be removed without replacement. | One bounded service-role RPC replacing exactly the selected task/date/lote/workers, with current actor checks and request identity. Test insert failure leaves original rows and retry is not a second replacement. Migration + synchronized edge sources; verify ordering and keep RPC during backend rollback. Do not implement before scope authorization and parity review. |
| Dairy death event/state — verified source defect; live write RLS/trigger corroboration | Event INSERT can commit before animal status UPDATE fails, leaving an active animal with a death event. The hook explicitly reports this partial save and directs manual correction, limiting silent impact. | Atomic event/state RPC retaining G/A semantics. Test second-write failure, role loss, retry and status conflict; preserve the existing operator warning until recovery exists. Additive RPC before frontend, keep it on rollback; no automatic event removal or status backfill. |

Each fix above is a proposal, **not approved or implemented**. Full release
regressions and development database testing belong to its authorized remediation
session. There is no reason to rerun F1's 4,646-test release suite for this report.

## Catalog corroboration and unresolved parity

- All 14 sampled domain tables have RLS enabled. Product, purchase, inventory
  movement and application writes require G/A. Finance expenses/income require G.
  Cattle finance retains its documented G/A exception. Labor and dairy event/animal
  writes use active-role predicates. This is not an all-table access audit.
- `get_user_role()` reads only an active account; `es_usuario_gerencia()` requires
  current active Gerencia. Both remain DEFINER with fixed search_path as designed.
- F1 receipt grants: authenticated SELECT/INSERT/UPDATE, no DELETE; no anon table
  grants. Existing domain table grants remain broad but RLS controls row operations.
  The documented legacy TRUNCATE grant is not evidence of an exposed HTTP writer.
- Nine sampled RPC/trigger functions have pinned `public, pg_temp` search_path
  and no anonymous EXECUTE. `fn_cleanup_compra_dependencies` and the cattle
  validation trigger are DEFINER; the seven other sampled save RPCs are INVOKER.
  Trigger EXECUTE denial does not prevent trigger firing, per repository precedent.
- Live `md5(prosrc)` matches local literal body for F1
  (`3d82f1664018ba30092ba76561f8fd33`), quincena save in 085
  (`9f854b0fd80f24507cf793da84d23910`) and treatment in 140
  (`5504439a268818623461faa6ba669481`). Local hash calculation was nonmutating.
- Several literal bodies differ: closure live `ab733de8168be36f3a8f2f7a438469a3`
  vs 106 `43832798a2dacd8f0efa645d2dbe4540`; worker trigger live
  `15be972eeff3e318032aadcae7ffb84f` vs 149
  `ad6eb8c3093464f0f4f5cea1de11323c`. Cattle confirmation/validation and other
  dairy functions also differ from the historical files inspected. Comments and
  later replacements can explain differences; **no behavioral drift is inferred**.
  Initial permitted live closure read confirmed application/product locks and
  closed-state rejection. Broader body equivalence remains unverified after the
  export rejection. Do not reapply migrations to make hashes match.
- Eighteen sampled domain triggers were enabled. Product triggers only update
  timestamp/attribution; purchase has timestamp trigger; no automatic purchase
  expense or stock-ledger repair trigger was found. Daily worker INSERT invokes
  labor creation; labor-table triggers observed cover cost/state/date/attribution,
  not a universal daily-sum constraint. Hato correction triggers do not couple
  death event INSERT to animal status UPDATE.

## Separate design risks, accepted behavior and unchecked paths

- CSV opening balances are documented accepted behavior in data-integrity memory.
  Current ProductForm creation now forces zero, but the CSV path remains an
  opening-balance INSERT, not a stale UPDATE. Do not invent an exploit or historical
  damage from that difference; any policy change is a separate owner decision.
- Closure trusts client consolidation/amount fields; validation of finite,
  nonnegative quantities and repeated product IDs is a separate defense-in-depth
  candidate. G/A already have direct stock writes; no new privilege escalation
  established. Cross-RPC product lock ordering may cause retriable deadlocks.
- Labor daily totals and nullable uniqueness require focused development evidence
  before asserting a concurrent overcount. The 149 trigger is not universal and
  its exact live body parity remains open. No payroll totals queried.
- Daily parent UPDATE/DELETE policy is owner-only, without an active-role clause.
  This goes to S2 revocation analysis; a policy shape alone does not establish a
  currently usable deactivated session. Do not infer the current account roster
  from old memory, which has historical counts inconsistent with the plan shorthand.
- Dairy weighing is intentionally per-cell, not an all-or-nothing sheet; preserve
  this distinction. Check chequeo commit, manual birth/undo, alert/step actions,
  milk cell concurrency and full cattle aggregate-lock behavior only when needed
  for a selected follow-up; their complete live bodies were not verified here.
- Pest capture and monitoring-round creation are direct service-role writes in
  `telegram/conversations/monitoreo.ts`; no complete replay review in S1. Detailed
  Telegram middleware, callback freshness, account activity and undo belong to S3.
- Browser/file access, file upload compensation and dependency reachability remain
  S4. No Storage operation or broader advisor/performance sweep was performed.
- F1 live operator confirmation remains open. Existing release tests/runbook are
  evidence for their named flows only. PR324 and its redesign/WIP remain parked.

Next: **S2 — active accounts, role isolation and exposure**, starting with current
account revocation through user-management/Auth and the owner-only daily policies.
Continue code-only where production source export is unavailable; no fix is started.
