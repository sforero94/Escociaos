# Expense release readiness — no release performed

Date: 2026-10-29. Source main is c68c37e642ba118675326283f24b6e1d7b4b7dc2

## Current status — technical closeout accepted 2026-10-30

PR362 is released at merge e3b4c40b905154b9f5abdbdadcecc100c2f47fe8 with successful
postmerge CI 40940596671 and Vercel production/alias checks. The owner accepted
runtime Web Locks availability limits and later accepted technical closure; first
legitimate use is operational follow-up. See [closeout](technical-closeout.md).
The preparation source/base, pending release instructions and negative action
statements below describe historical stages, not today's deployment status.

## Production migration receipt — 2026-10-29

This receipt supersedes earlier pending production-application status below.
Santiago explicitly approved exact187; parent serialized release operations and
sent the go signal after the backend release terminated before deployment.
Applied exact merged SQL (SHA256
`6bf56111bfea8d8f4fb4e45ddea6291a295c0b7bf200346b9b6de77bb557a1af`)
with Composio `SUPABASE_APPLY_A_MIGRATION`, explicit account `escocia-os`, project
`ywhtjwawnkeqlwxbvgup`, name `187_fin_gastos_lote_reintentable`.
Provider confirmed success; live ledger version `20261029183837`.
Apply log: `log_mXefclLI7J1S`; metadata postcheck: `log_W3qY-rpLidiZ`.
Fresh preflight at18:38:23 UTC had ledger186, absent new objects, expense RLS and
active-role precondition true. Postcheck at18:38:51 UTC confirmed postgres-owned
receipt table with RLS, both own-Gerencia policies, postgres-owned INVOKER RPC
returning jsonb and pinned search_path public,pg_temp. Effective anon table/RPC
access denied; authenticated SELECT/INSERT and EXECUTE allowed, UPDATE/DELETE/
TRUNCATE denied; service_role retains privileged access. Existing expense RLS,
four policy definitions and two enabled triggers match preflight exactly.
No domain/personnel rows were read, no expense RPC was invoked, no frontend was
activated and no edge deployment occurred. Preserve RPC/receipts on rollback.
PR362 subsequently completed its approved release; see the current closeout.
Historical preparation baseline (PR360 merged): external PR362 was draft at
e7a1e8619ec1b64f1edde9330e43c4761b6de871, base branch
codex/security-expense-batch-retry at29a4a757. No remote source, PR base/state or
deployment configuration was changed in this preparation.

## Exact migration and security effects

File: src/sql/migrations/187_fin_gastos_lote_reintentable.sql
Git blob: bbf82766173adfa2aefa7566380afd17477cd200
SHA256: 6bf56111bfea8d8f4fb4e45ddea6291a295c0b7bf200346b9b6de77bb557a1af

The file is identical to merged PR360 and the previously reviewed29a4a757.
One BEGIN/COMMIT transaction creates public.fin_gastos_lotes (owner/Auth FK,
ON DELETE CASCADE), enables RLS and creates active-Gerencia/own-user SELECT and
INSERT policies. It revokes PUBLIC/anon/authenticated table privileges then gives
authenticated SELECT/INSERT. It creates the pinned-search-path INVOKER
fn_fin_gastos_guardar_lote(uuid,uuid,jsonb), revokes PUBLIC/anon execution and
grants authenticated execution. It changes no existing table policy, grant,
trigger or business record. Active Gerencia and expected-user equality precede
receipt replay. Receipt+rows are atomic; PGB01 means payload conflict,23514 explicit
validation. Pre-existing objects abort rather than overwrite.

IMPORTANT EFFECTIVE-ACL QUALIFICATION: observed public-schema default privileges
for postgres and supabase_admin grant table ALL and function EXECUTE to
service_role as well as anon/authenticated. Exact187 removes anon access and
restricts authenticated to SELECT/INSERT on receipts, but does NOT revoke inherited
service_role privileges. Thus service_role retains receipt CRUD and RPC EXECUTE
as an already trusted privileged role; do not describe the result as
"authenticated-only access." INVOKER and explicit actor/role checks remain.
A local fixture with those exact default-ACL shapes verified this behavior.
If the owner wants a different service-role contract, review a separate SQL change
before applying; do not silently alter this reviewed hash.

Own-Gerencia INSERT can deliberately forge its own receipt; receipts are accidental
retry protection, not an unforgeable audit log. Other-user receipts remain isolated
for ordinary authenticated clients. Existing privileged server/admin access and
legacy writers are not redesigned. Auth account deletion can delete its receipts;
rollback must not use account deletion or receipt/storage deletion to retry.

## Authorized metadata observations

All Supabase reads used Composio account escocia-os (supabase_bitis-coward),
project ywhtjwawnkeqlwxbvgup. Queries were SELECT in read_only transactions over
ledger/catalog metadata only: no domain/personnel/Auth roster rows, function bodies,
source export, logs, Storage, secrets or real transactions.

- Only project visible in this matched account: Escocia OS, ACTIVE_HEALTHY,
  PostgreSQL17.6.1.042. Branch list empty. No known authorized development target
  exists in this account. Other connected accounts were not searched or substituted.
- db/rest/auth health metadata healthy. This establishes service health only.
- Latest ledger entry186_hato_alertas_respuesta_trazas /20261028193716;
  no187 in latest entries. Receipt table and batch RPC are both absent.
- fin_gastos RLS enabled; four policy metadata entries. Named columns/types used
  by187 exist. Existing attribution/update trigger names present; no body parity
  or complete policy-expression parity was inferred.
- get_user_role and es_usuario_gerencia are DEFINER with pinned paths. Their
  current bodies/activity behavior were NOT exported or proven by that metadata.
- Existing authenticated expense SELECT/INSERT and helper EXECUTE grants true.
  Existing anon expense INSERT grant true as well; RLS still applies. A table grant
  alone is not evidence of anonymous financial-write capability.
- Source187 preconditions, ledger, object absence, execution role/default ACLs and
  existing policy/trigger baseline must be rechecked immediately before application.

## Local candidate and evidence

Prepared only in isolated worktree /workspace/expense-release-readiness, local
branch codex/security-expense-release-readiness. Original source branches and
/workspace/Escociaos remain unchanged. Main was incorporated without rewriting
PR362's source history. Only conflict: additive security progress tracker;
both histories retained. PR362 implementation files, helper/types/tests/browser
script remain byte-identical to e7a1e861. Migration187 and its fixture/runner
remain byte-identical to c68c37e6. Changes beyond existing PR362 are readiness
documentation and a local-only default-ACL/preflight regression script.

Results: 4,811 Vitest tests/219 files, no skipped tests; ten PostgreSQL groups;
four additional default-ACL/preflight groups; typecheck/build pass; lint0 errors/
907 existing warnings (Node24). Chromium1280/390 recovery and actual native
two-page Web Locks contention both orders pass. Browser auth/RPC are mocked:
there is NO browser-to-PostgREST integration coverage. The SQL fixture is minimal;
it is NOT a complete Supabase development environment or live schema reproduction.
No new CI/Vercel run was triggered because this local candidate was not published.

## Historical release plan — DB and local transport gates now completed

1. Choose an empty, nonproduction development target and its explicit matching
   account/ref, or authorize an isolated local Supabase stack. Do not clone
   production data, use production as the test target, switch to unrelated accounts,
   create credentials or create infrastructure silently. No such target was
   available in the matched account during this preparation.
2. Obtain exact authorization for applying the reviewed SQL and synthetic fixtures
   ONLY to that development target. Validate real Supabase Auth/PostgREST behavior:
   roles/active-user checks, JWT/expected-user mismatch, PGB01/23514 transport,
   identical retry IDs, concurrent repeat, payload conflict, cross-user denial,
   validation/trigger rollback, revocation on replay and actual receipt ACLs.
   Use synthetic users/catalogs/expenses only, never copied farm data.
3. Test the browser against that development endpoint with intercepted/real transport
   clearly distinguished. Verify native Web Locks in the actual operator browser,
   original profile and secure context. Unsupported browser must fail before pending
   mutation/upload/RPC; never use advisory locks or a direct-INSERT fallback.
4. After development validation, request action-time authorization for the exact187
   production transaction below. Readiness and source-merge approval do not authorize
   this security-sensitive database action. Recheck metadata baseline first.
5. Apply via the existing approved migration workflow only after authorization;
   verify ledger, objects, owner/RLS/effective grants, INVOKER/path, anon denial and
   unchanged existing expense policies/triggers. Metadata postchecks do not create
   test farm expenses. No broad DB-source export or credential retrieval.
6. Only after DB postconditions and operator browser confirmation, authorize
   publishing/retargeting the prepared PR362 candidate to main, final-head CI/Vercel,
   then its specific merge/frontend deployment. Releases must serialize with the
   parent's Faithfulness367 backend release. No edge deployment is needed for187.
   Parent owns Bot Log and release sequencing.

Historical production authorization text (approval received and exact187 applied):

"Apply exactly src/sql/migrations/187_fin_gastos_lote_reintentable.sql with SHA256
6bf56111bfea8d8f4fb4e45ddea6291a295c0b7bf200346b9b6de77bb557a1af to project
ywhtjwawnkeqlwxbvgup using account escocia-os, as one transaction after validated
development results and fresh metadata preconditions. Authorize the new receipt
table/RLS/own-active-Gerencia policies, authenticated SELECT/INSERT and RPC EXECUTE,
PUBLIC/anon revocations, and the existing service_role default privileges described
above. Permit metadata-only pre/post verification. Do not create real expenses,
export DB source, publish credentials, merge362 or deploy frontend under this action."

## Rollback and retained gaps

Before exposure/receipts, reviewed development-only teardown may remove new objects.
After exposure, preserve RPC, receipts and pending requests. Pause batch capture
before reverting the frontend; resolve the original account/UUID/payload rather than
recapturing an uncertain request. No receipt purge, browser-storage reset, lock
stealing, account deletion or historical financial repair as a workaround.

Retain F1 receipts/operator gap, approved edge-source HTTP413, separately denied
database-source export, shared/unowned draft risk, PR324 and all prior exclusions.
The original preparation performed no production mutation. The subsequent
authorized187 application is recorded in the current receipt at the top. No
production expense, new credential or frontend activation occurred.

Current next action: preserve accepted technical closeout and record the next
legitimate operator confirmation. PR362/187 are released; do not reapply or merge
again. No production expense tests or automatic next remediation.

## Local Auth/PostgREST stack completed — supersedes the earlier transport gap

The parent selected the empty local stack. Existing Docker28.4/Compose2.40 worked
as UID1000; no host/security setting, privileged daemon startup, paid project or
hosted branch was needed. Repo config only defines edge deployment, with no local
stack/CLI installed, so tests use the official Supabase service subset:
postgres17-alpine, supabase/gotrue:v2.197.0, postgrest/postgrest:v14.18.
Versions follow Supabase's official docker/docker-compose.yml:
https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml

Reproduce with scripts/tests/gastos-lote-local-stack.py after those images exist.
The runner uses --pull=never. PostgreSQL is tmpfs/network-none; Auth/PostgREST share
that namespace and bind127.0.0.1. The test gateway/Vite bind host loopback only,
with no Docker-published port, host mount, production environment lookup, external
provider, hosted resource or persistent external credential. Generated local
secrets use0600 temporary envfiles/stdin and are never printed. Auth's own migration
supplies auth.uid(); no replacement auth helper is used. Exact187 hash is asserted.

Terminal results: nine real Auth/PostgREST groups plus five real-browser scenarios.
Real password grants/JWT refresh, actor/role/activity checks, receipt RLS/REST ACL,
PGB01/23514 HTTP errors, four concurrent repeats and injected-row rollback pass.
Actual AuthProvider/SupabaseJS/GastosBatchTable passes1280/390 commit-before-HTTP-loss,
reload/exact replay/one-row/cleanup, native two-page contention both owner orders,
and unsupported-lock UI with a synthetic file makes no RPC/Storage POST.
This closes the *local* browser-to-Auth/PostgREST transport gap: auth/RPC are not
mocked in these new scripts. Existing earlier mock-only tests remain historical.

Independent read-only review found no blocker and confirmed isolation/real HTTP
evidence. Cleanup now checks Docker listing before reporting success; the terminal
run also left no test containers. All generated users, sessions, data and envfiles
are discarded. Application files and exact187 remain unchanged from dff1d49.

Limits: a synthetic finance schema/roles, not a full production schema/settings
mirror; no hosted gateway parity, external provider/Storage test, production row
or genuine field-device confirmation. Mobile viewport is still Chromium. Before
release, the preparation required metadata preconditions, exact187 approval,
postconditions and operator capability/release review. Later approval accepted
availability limits and completed activation; genuine devices remain unverified.
No push, hosted SQL application, production deploy or Bot Log write occurred in
that local test stage. Current terminal receipts are in technical-closeout.md.
