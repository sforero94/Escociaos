# S2 — Active accounts, role isolation and data exposure

Assessed 2026-10-28 (America/New_York). Read-only assessment with explicit gaps.
Only review documentation changed. No fix, migration or production release.

## Baseline and evidence limits

- Source: `470c2d41934a40e9b23af50b91924b438b5e06d8`, [PR #354](https://github.com/sforero94/Escociaos/pull/354).
  Assessment branch: `security-s2-assessment`. `git diff` of `src/` and
  `supabase/` against F1 `e1518d09ae8f27726499b4a93dfbffbb10516b4f` is empty.
- Production frontend reverified using `VERCEL_GET_DEPLOYMENTS` filtered by
  project and production target, plus `VERCEL_LIST_DEPLOYMENT_ALIASES`:
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED, SHA `e1518d0…`,
  [escociaos.vercel.app](https://escociaos.vercel.app). Recent PR previews are
  STAGED and do not replace that production evidence. The first domain-filtered
  alias listing returned empty; the deployment-specific listing confirmed routing.
- `SUPABASE_LIST_FUNCTIONS` reverified v279 ACTIVE, `verify_jwt=false`, hash
  `60ef9ded0d685a9ab7a627f6f2ce2b5a28a0908a948e46900aaae8e25fdc155b`,
  entrypoint still in a version-278 directory. Backend observations below are
  **code-only**; none establishes deployed source parity.
- The user already approved edge-source export. Its connector/workbench
  HTTP 413 / `ToolRouterV2_PayloadTooLarge` (4345) gap remains open. No repeated
  oversized export or alternate export route was attempted. **The separate broad
  database trigger/RPC body export remains unapproved** after the earlier
  automatic-review rejection. No database body export was requested here.
- Authorized account `supabase_bitis-coward` / `escocia-os`, project
  `ywhtjwawnkeqlwxbvgup`. Catalog/ledger SELECTs only: policies, relation grants,
  RLS flags, view options, function ACL/security/search_path/body hashes, one
  column default and relevant trigger metadata. Latest ledger remains
  `20261028014545` / `185_inventario_guardado_atomico`.
- No account roster, personnel/business rows, Auth users/sessions, logs, Storage
  objects, live probes, impersonation, messages or transactions were queried.
  Historical user counts are not current evidence. Current Auth TTL, ban/session
  behavior and account provisioning configuration were not inspected.

Source links below pin the reviewed SHA. Live catalog evidence was obtained with
`SUPABASE_RUN_READ_ONLY_QUERY` on the assessment date. These observations describe
policy/grant capability, not successful live requests or historical data damage.

## Deactivation and revocation chain

1. [UsuariosConfig](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/components/configuracion/UsuariosConfig.tsx#L140)
   sends a session Bearer token and explicit `activo`. Its Gerencia UI check is
   supplemented by the handler's Auth validation and current database role read.
2. [User-management gate](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/usuarios.tsx#L18)
   calls `auth.getUser(token)`, then uses a service-role client to read `rol`.
   Missing user, invalid token and non-Gerencia fail closed. It does **not** read
   `activo`; service-role reads do not inherit the browser's activity-aware RLS.
3. [Editing an account](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/usuarios.tsx#L188)
   sets `ban_duration='876000h'` for explicit false and `'none'` for explicit true.
   Both password and metadata-only branches check the Auth error before changing
   `usuarios`. Thus the old claim that normal deactivation only flips a database
   flag is refuted. Auth update precedes the database UPDATE in separate requests;
   a later database error is reported, with no cross-service rollback.
4. The edit handler has no explicit session-list/revoke/signOut call. This does
   not prove Auth keeps sessions usable: Auth can invalidate them internally.
   Existing memory describes ban preventing login/refresh and an access-token
   window (historically one hour). That is historical context, **not a newly
   verified TTL or proof `getUser` accepts a banned user**. PostgREST JWT validity
   and Auth `/user` validation must not be treated as identical checks.
5. [Inactive creation](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/usuarios.tsx#L91)
   is a separate lead: `createUser` auto-confirms the email without a ban, then
   inserts `activo` from the request. An account created inactive with G/A role
   would fail activity-aware RLS but meets the role predicate of service-role
   handlers if Auth permits login. This is a **verified source lifecycle
   inconsistency / unconfirmed production path**, not a demonstrated live bypass.
   Missing evidence: deployed handler parity, provisioning hooks/configuration
   and a controlled development Auth check. No current affected accounts asserted.
6. [Profile loading](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/contexts/AuthContext.tsx#L48)
   skips profile reload on silent sign-in and token refresh. Its timeout fallback
   has empty role and no activity flag. `ProtectedRoute` blocks confirmed inactive
   profiles and Monitor; `RoleGuard` needs an allowed role; module checks deliberately
   fail open for an unconfirmed profile. Cached UI state is not immediate revocation.
   Backend current-role checks and RLS, not browser refresh, determine data access.
7. [Role helper 137](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/sql/migrations/137_get_user_role_respeta_activo.sql#L71)
   requires `activo=true`. Its local literal MD5 matches live `prosrc` MD5
   `0fbe6f826a3e4b1e4546492e08b66b89`. Role/activity changes therefore affect its
   policy decisions on subsequent database requests without waiting for UI refresh.
   No claim of aborting already-running requests. `es_usuario_gerencia()` remains
   the active-Gerencia helper recorded in S1; its metadata is pinned and its live
   body hash is `455c5429698830bfd35fb005c28dc4d5`, without a new body export.
8. [Account deletion](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/usuarios.tsx#L307)
   deletes the profile before Auth and checks each error. Losing the profile closes
   role-based checks, but a failed second request is not proof the Auth identity or
   all JWT-only/owner paths disappeared. No live deletion was tested.

## Access matrix — database boundaries

G = active Gerencia, A = active Administrador, V = active Verificador,
M = Monitor. “Authenticated” means a database request accepted as that JWT role;
it does not assert that an inactive account can obtain or retain such a token.
Module grants control navigation only. All 22 relations sampled for grants/RLS
have RLS enabled and authenticated SELECT/INSERT/UPDATE/DELETE except
`usuarios`, whose authenticated UPDATE is revoked. Policies are permissive:
a broader SELECT policy is not narrowed by another role-restricted SELECT.

| Surface | SELECT | INSERT | UPDATE | DELETE | Disposition / limit |
|---|---|---|---|---|---|
| All 13 `fin_*` tables | G, plus exceptions below | G, plus exceptions below | G | G | Every policy inspected; no new finance table relying only on a UI guard |
| `fin_transacciones_ganado` exception | G/A | G/A | G/A | G/A | Eight distinct policies; current A helper and G helper. Preserved documented exception, not new escalation |
| `fin_proveedores` exception | G/A | G/A | G | G | A-only additional policies; do not replace the model with G-only |
| `empleados` | G/A all; V only `estado='Activo'` | G/A | G | G | All predicates require active account; row restriction is not column masking of salary/identity fields |
| `contratistas` | G/A | G/A | G/A | G/A | Activity-aware helper; no new unrestricted SELECT |
| `registros_trabajo` | Any authenticated JWT (`true` policy) | G/A | G/A | G/A | Restricted V policy does not narrow the additional broad SELECT; costs are available without employee joins |
| `tareas` | G/A/V | G/A | G/A | G; A own or NULL creator | Explicit active-account predicates preserved |
| `usuarios` | Own row, or G all | G | No authenticated table UPDATE | G | Own-profile SELECT does not require activity. Role predicate alone is not a self-reactivation writer |
| `productos` | Any authenticated JWT (two `true` policies) | G/A | G/A | G | Existing price/stock exposure class; no module isolation implied |
| `produccion` | Any authenticated JWT | G/A | G/A | G/A | Gerencia-only dashboard is not a database read restriction |
| `movimientos_diarios` | Any authenticated JWT | G/A | Owner only | Owner only | Owner predicates omit role/activity; see revocation disposition below |
| Daily product/worker children | Any authenticated JWT | G/A | No UPDATE policy observed | G/A | Parent ownership does not make child permissions identical |
| `reportes_semanales` | Any authenticated JWT | G/A | G/A | Own `generado_por` | Owner DELETE omits activity; service-role ALL is intentional |
| `chat_conversations`, `chat_messages` | Active G, own conversation | Active G, own conversation | No policy observed | Own conversation for active G; no message DELETE policy observed | Message EXISTS traverses conversation RLS; owner check is not the only gate |
| `esco_memorias` | Owner | Owner | Owner | Owner | Owner-only ALL omits activity/role; not permission to read another user's memory |
| F1 operation receipts | Active G/A, own receipt | Active G/A, own receipt | Active G/A, own receipt | Grant revoked | Preserved F1; no independent cross-role receipt access |

Legacy anon table SELECT grants remain on most sampled relations. They do not
satisfy authenticated-only or current-role/owner policies. No anonymous finance
read is established from the grant alone. All seven public views report
`security_invoker=true`, including `v_gastos_completos`, `v_ingresos_completos`
and `v_resumen_financiero_mes`: no owner-privilege view bypass identified.

## HTTP, RPC and export matrix

All listed HTTP routes are reachable through
[index.ts](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/index.ts#L49).
Handler conclusions are code-only; gateway `verify_jwt=false` does not bypass
their own checks. Each role check below reads the current account role.

| Entry point | Caller boundary | Capability / activity result |
|---|---|---|
| `usuarios/crear`, `editar`, `eliminar` | Auth `getUser` + G | Service-role account/access writes. No explicit activity predicate; ban/provisioning qualification above |
| Inventory CSV import and product toggle | Auth `getUser` + G/A | Service-role inventory writes; no explicit activity predicate. Importer lead is not an anonymous writer |
| Weekly report generation | Auth `getUser` + G/A | Service-role farm data and owner-call summaries sent to generation; explicit role gate, activity gap shared with user handlers |
| Chat message | Auth `/user` + G | Service-role tools/history; existing-conversation ownership checked before use. ESCO-153 source fix preserved, not refiled |
| Hato chequeo preview/commit/photo; quincena photo; pesaje photo/commit | Auth `getUser` + G/A | Service-role processing/reads/writes/RPC calls; all inspected gates read role without activity. No Storage operations performed |
| Climate sync/backfill/update/retry; hato/inventory ticks | Configured shared secret OR Auth `getUser` + G | Manual role read omits activity. Cron-secret path deliberately independent of a human account; no secret values inspected |
| Health; climate forecast | No account gate | Health status / external weather proxy, not farm finance/personnel data. Forecast quota/input hardening belongs to S4 |
| Telegram webhook | Separate shared-secret/identity path | Reserved for S3; this matrix does not validate bot authorization |
| F1 save / quincena save | INVOKER + table RLS | Live metadata and S1 body parity retained; no evidence of bypass via RPC owner privileges |
| Chequeo commit | DEFINER, no anon/authenticated EXECUTE | Handler must gate service-role invocation; no browser RPC bypass from ACL alone |
| Author-name resolver (155) | DEFINER, authenticated EXECUTE, active resolved role, max 100 requested IDs | Live body MD5 `82005c798ab34696f146b81f89653982` matches local; returns ID + display name (email fallback), no salary/role/module fields. Documented exception preserved |
| Alert schedule list/change (175) | DEFINER, authenticated EXECUTE, active G, two-job allowlist | Both local body hashes match live (`31a512202fbc3b52fe8698c7a8ce02ce`, `ccd3fdbf53db6809264626d5d0dcd5b1`); no unguarded schedule writer identified |
| Purchase dependency cleanup (082) | DEFINER, authenticated EXECUTE | Local code checks active G/A through helper, then deletes only expenses linked to the specified purchase. Live hash `90fc3ea6045da7ea44cba7e2d43873ed` differs from literal 082 `449ecae91069b09d74cace872d7a2e7c`; complete body parity remains unverified. Do not infer drift or a bypass |
| Browser finance PDF/Excel | Session client fetch + finance RLS; financial reports additionally G `RoleGuard` | Export utilities format already fetched data. Granting a finance module does not bypass finance RLS. Saved/downloaded copies cannot be recalled by later deactivation |
| Browser labor PDF | Session client and joins under each table's RLS | `ReportesView` reads labor cost and worker joins, then exports held records. A denied employee join does not conceal `registros_trabajo.costo_jornal`. No generated private report was inspected |

Source evidence: [weekly gate](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/generar-reporte-semanal-endpoint.ts#L46),
[chat gate](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/chat.tsx#L228),
[chat ownership](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/supabase/functions/make-server-1ccce916/chat.tsx#L4062),
[labor fetch](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/components/labores/ReportesView.tsx#L165),
[labor export](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/components/labores/ReportesView.tsx#L407),
[finance report guard](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/components/finanzas/ReportesView.tsx#L39).

## Ranked dispositions and separate backlog

**No new verified critical/high vulnerability. S3 remains next.** Confidence in
observed policy shapes and repository control flow is high; deployed edge
applicability and Auth runtime behavior remain separately unconfirmed.

1. **Unconfirmed path — inactive creation / service-role activity checks.**
   Normal edit includes an Auth ban, so absence of `activo` alone is insufficient
   proof of the earlier exploit lead. Creation with false has no corresponding ban
   in repository code; direct SQL deactivation can also bypass the normal ban.
   Do not invent a confirmed self-reactivation or assign a live severity. First
   resolve edge parity and development Auth provisioning behavior. A future bounded
   fix, if selected, would enforce activity at privileged handler entry and align
   inactive creation with Auth state. Test inactive creation, ban, downgrade,
   missing profile, Auth failure and database-update failure using synthetic users.
   Preserve explicit reactivation and caller roles. No implementation authorized.
2. **Verified policy revocation limitation — medium design risk.** Daily parent
   UPDATE/DELETE requires only `created_by=auth.uid()`. The column exists live as
   UUID, has no default, and [normal capture](https://github.com/sforero94/Escociaos/blob/470c2d41934a40e9b23af50b91924b438b5e06d8/src/components/aplicaciones/DailyMovementForm.tsx#L665)
   supplies the session ID. A former G/A who remains authenticated after a role
   downgrade still satisfies ownership of their earlier rows. Whether any such
   rows/accounts exist is unchecked. Deactivation additionally requires a usable
   preexisting JWT; no such session was tested. Only a correction-audit trigger was
   listed on this parent, with its complete live body unchecked. No cascade,
   stock corruption or successful deactivated mutation is claimed. Owner report
   DELETE and owner memory ALL share the lack of an active-account gate, with
   narrower own-data effect. Minimum future decision: confirm whether owners retain
   these capabilities after downgrade; if revocation must close them, add the
   agreed active-role predicate without broadening ownership. Test own/other rows,
   downgrade and inactive JWT in development. New migration, prior-policy capture
   and policy-preserving rollback required; no change authorized.
3. **Existing exposure class — deferred medium/low access hardening.** Broad
   authenticated reads on labor costs, products, production and weekly reports
   survive UI module denial and do not inspect activity. This is the previously
   recorded always-true SELECT class, not a new anonymous disclosure. V's active
   employee access exposes allowed rows' columns, not a redacted projection; M's
   web block does not itself restrict direct authenticated API reads. No current
   V/M accounts or affected personnel were counted. Narrowing operational reads,
   salary/identity columns or report audiences needs an explicit owner decision,
   workflow inventory and focused G/A/V/M/disabled-account read regressions.
4. **Documented acceptable behavior / negative results.** Module fail-open,
   operational G/A cattle finance, A supplier access, author names, cron service
   identities, and the dedicated visual-verification account are not new findings.
   Do not infer missing audit wiring is newly discovered. Finance RLS and INVOKER
   views remain independent of cached UI role/module state. No new cross-user
   chat history path was found in current source.

## Unchecked evidence and next scope

- Edge v279 source comparison: approved but blocked by payload size; database
  broad body comparison: separately unapproved. Neither gap was bypassed.
- Current Auth TTL, ban-time access-token validation, session invalidation,
  inactive-create provisioning hooks and real account role/activity distribution.
  A deployment metadata match does not fill these gaps.
- Complete live purchase cleanup, audit-trigger and other unsampled RPC bodies;
  full hato/application child-table and column-grant access inventory. Matrix
  entries cover the named objects, not every public function/table.
- Storage policies/object/file behavior remains S4, including previously recorded
  activity/read-policy exceptions. No Storage objects were listed or fetched.
- Telegram linked-account activity, role/module consistency, stale callbacks and
  operation replay remain S3. No S3 handler-chain assessment started here.
- F1 operator workflow confirmation, old-tab risk, receipts and pending attempts
  remain as recorded. PR324 remains parked.

Checks: nonmutating source review, live metadata SELECTs and local literal-body
hash comparisons. Repository lint and documentation integrity checks are recorded
in the tracker at close-out. No new runtime tests, installations, full suite,
backend calls from local scripts, or production UI/mobile tests were needed for
these documentation-only changes. No remediation implemented or deployed.

Next: **S3 — Telegram identity and privileged operations**, beginning with the
webhook-to-linked-identity chain and freshness of current app role/activity/module
checks before sensitive service-role handlers. Do not start fixes.
