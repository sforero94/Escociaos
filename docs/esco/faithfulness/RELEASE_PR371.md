# One-time PR371 backend controls

Current status: diagnostic40988136741 passed; release40992476137 stopped before management access and did not deploy. Current refreshed candidate awaits parent review/go; explicit owner authorization and remaining execution gates are recorded below. Runtime remains fixed at e7a5545bc8d87ad0502caf009d0201cae67fc772; subsequent commits add controls/tests/docs only.

## Fixed identities

| Item | Fixed value |
| --- | --- |
| Project / function | ywhtjwawnkeqlwxbvgup / make-server-1ccce916 |
| Function metadata ID | 9defb252-5ea2-463b-b91b-497e0a7fe582 |
| Runtime source / edge tree | e7a5545bc8d87ad0502caf009d0201cae67fc772 / 6e9969d49f652989ef2c1679ff24be0f976410e7 |
| Runtime complete82 fingerprint | b83bc09149e76798832153b2aa620bf91d8d90af26c889dfefe137e8d2465685 |
| Rollback Git / edge tree | 634580480c72b27c7ccd2d8c006af520d0ca1058 / 99ba3737577f064e27112e4e99a8dd24739c6422 |
| Rollback complete82 fingerprint | 3010b467d3d259cf34cbce7875b393e67748a709a88413857199dd6b2282ce4e |
| Native80 Git pin; observed in diagnostic40988136741 | 1a7e50e2d0b37c7aa0c014b564ee90312dfcdff971a49ebbc0215686342fa24f |
| Required baseline bundle / version | 27dc76027a6b6eeddd5866f1e749ec2de32c3ac059b449ec6c8cb703a742756b / 281 |
| Required baseline timestamp | 1793306746924 (2026-10-29T20:45:46.924Z) |

Baseline also requires ACTIVE, verify_jwt=false, import_map=false and the exact function/version entrypoint. These are historical required values, not a fresh observation. Any movement stops the job. Source and rollback checkouts must be clean, with exact commit/tree/config and full fingerprints. The new controls import only safe pure helpers from the unchanged PR367 files; they never call that release routine or broaden its old authorization.

## Modes and permission boundary

The new workflow is manual, main-only and first-attempt-only, with contents:read. No push/schedule/PR trigger, added credentials, persistent grants, artifacts or source uploads. It shares escocia-pr367-edge-release concurrency with the old job; the owner must additionally confirm an exclusive backend window covering other agents/CLI deployers. Re-run jobs is rejected. A new run after uncertainty requires inspection and new relevant authorization.

Both CLI2.122.0 and TypeScript5.9.3 are installed/tested before management credentials exist. The existing SUPABASE_ACCESS_TOKEN is scoped to the final execution step. The CLI uses its prepared cache offline. No token/output/API body is printed. Console evidence contains counts, paths, hashes, type proof and safe metadata only. Unknown path names are hashed; redirects/symlinks/special files/cache differences are rejected, never normalized away. Existing capture helpers retain exact wrapper/cache rules and the two known type-only omissions.

[GitHub requires workflow_dispatch files on the default branch](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow). This new workflow cannot be dispatched while only in draft371. Merge approval must acknowledge the normal frontend rollout; it does not itself authorize backend/migration execution.

## Required approval sequence

1. Review the final controls/tests and unchanged runtime; specifically approve ready/merge when appropriate. No release workflow dispatch is implied.
2. Specifically authorize one mode=diagnose dispatch with confirmation DIAGNOSE_PR371_V281_ONLY and blank reviewed-diagnostic inputs. This step uses the existing management identity only for metadata/source download. Diagnose receives no deployment or health capability.
3. Inspect the successful first-attempt diagnostic: native80 is downloaded evidence; reconstructed82 adds only importHato/tipos.ts and telegram/types.ts from pinned Git after AST/empty-emission and18 explicit incoming type-only-reference checks. Record the actual diagnostic run ID, control SHA and receiptSha256. The v280 capture is not v281 evidence. Any unknown difference stops; no guard relaxation is authorized.
4. Obtain separate owner approval for one release, conditional verified rollback and exclusive backend window, referencing that observed run/receipt. Dispatch mode=release with confirmation DEPLOY_PR371_WITH_REVIEWED_V281_ROLLBACK and those reviewed inputs. The controls commit must still be identical to the diagnostic; otherwise obtain a new diagnostic/review. Human approval remains an external requirement, not inferred from success or a matching expected hash.

Before the secret-bearing step, release verifies the successful main workflow/run/job and exactly one receipt via authenticated GitHub APIs/logs, with the same controller SHA and run_attempt1, exact reviewed receipt digest and pinned source/baseline fields. The new reviewed path requires the existing workflow GITHUB_TOKEN with job permission actions:read, explicitly exported only to the verification step. Denial, expired evidence, extra jobs/receipts or unknown redirects fail closed without anonymous or alternate-token fallback. The log redirect allowlist permits Azure account hostnames under blob.core.windows.net, not a single pinned account. No token is forwarded to Azure. The signed download uses a separate request without headers and rejects further redirects. The Supabase step receives no DIAGNOSTIC_GITHUB_TOKEN environment variable. GitHub permissions are job-scoped, not a step-level authorization boundary; other actions can access github.token implicitly. The workflow remains contents:read plus actions:read, without write permission. [GitHub documents Actions-read for job logs and allows public-resource reads](https://docs.github.com/en/rest/actions/workflow-jobs#download-job-logs-for-a-workflow-run); the old anonymous request did not return the required302. The failure log did not expose its HTTP status. [GitHub documents workflow-token permissions and implicit action access](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

Release then observes two new complete captures matching the reviewed native80 and reconstructed82, checks stable metadata and clean Git again, and deploys only the fixed source through Supabase CLI. It verifies owned next-version metadata, anonymous health and a fresh deployed-source comparison. Expected next version is282 only if the pinned281 baseline still holds.

## Failure, rollback and evidence limits

CLI errors, metadata movement, DEPLOYING/unknown status, unavailable/truncated health transport or unknown postdeploy layout are uncertain: stop and inspect; do not retry or blindly roll back. Only a stable, owned next-version deployment with confirmed bad health/configuration can trigger one rollback. Rollback redeploys verified clean capture/Git-equivalent281 source and config; it verifies next-version metadata, health and restored native80/reconstructed82 source. No deployment retry occurs. Bounded health retries do not retry deployment.

Git supplies durable source/config after the equality proof. Runner captures are temporary and removed even on failure; no private plaintext artifact is uploaded. Source recovery does not reproduce the original ESZIP, floating dependencies, runtime, secrets or version number. A successful rollback would normally be version283, not literal281. Log expiry or unavailable authenticated GitHub reads blocks release. This draft explicitly proposes actions:read; preparation does not exercise it. No PAT, repository-secret edit or access grant is included.

Migration188 is excluded entirely: no database commands, business reads/writes, old-row repair, provider/model calls or bot messages. Its preflight/application and any cleanup require separate approval. Health/source proof is not live faithfulness calibration or browser/chat acceptance.

After separately accepted release/rollback evidence, propose cleanup of this workflow, controller, synthetic checks/wrapper and this guide. Do not remove prior controls or evidence automatically. The temporary pinned-source test intentionally detects changed runtime while these controls are active.

## Historical PR371 preparation receipts

114 synthetic Node guards passed, including reused capture controls; the new Vitest wrapper runs them without inherited credentials. Full suite4994 tests/226 files, zero skips; evaluator168 tests plus types/focused lint; repository lint0 errors/907 existing warnings; build26.03s and whitespace/source-parity passed. Independent ownership/capture review12 extra assertions and prior-evidence review17 extra assertions passed without external calls. Review corrected the GitHub rerun admission gap and confirmed that interrupted health bodies remain uncertainty. Those initial preparation checks did not exercise public APIs or current metadata/captures; the later authorized diagnostic evidence below supersedes that limitation. Authenticated GitHub receipt access remains untested until specific approval. Final control-head/CI receipt is recorded in PR371/handoff; runtimee7a5545 evidence is separate.

## Historical execution and receipt-access repair preparation — 2026-10-30 UTC

PR371 merged as13ef1f4ded1d0505d8d9b5b823314a65c891f2fe. Postmerge CI40987891472 passed4994 tests; GitHub Vercel status succeeded. Diagnostic40988136741/job123843871660 succeeded once on that controller with actual native80 hash1a7e50e2d0b37c7aa0c014b564ee90312dfcdff971a49ebbc0215686342fa24f and reconstructed82 hash3010b467d3d259cf34cbce7875b393e67748a709a88413857199dd6b2282ce4e. Observed receipt SHA2567584390459c364b8866d3d837c93cf26f1ed17044348546e7e42b3d8db8d5e63. Metadata remained the pinned281 baseline.

The separately approved release40992476137/job123857899826 failed at public diagnostic-log redirect verification02:34:50UTC. The management-secret step was skipped: no fresh source capture, deploy or rollback occurred. All114 synthetic guards passed. The exact message was `Diagnostic log redirect unavailable`; it does not establish a specific HTTP code or universal authentication requirement. An existing authorized connector successfully retrieved the same diagnostic job log.

This repair makes authenticated Actions-read verification an explicit proposed route, not a runtime fallback. It preserves all prior run/workflow/main/first-attempt/controller/job/unique-receipt/digest/source/baseline/redirect checks. Non302 errors report only their status code, never headers, signed URLs, tokens or log bodies. No runtime/SQL/source pin changes.

Next gates: independent review and CI; owner-specific approval of actions:read and ready/merge; then one separately approved fresh diagnose on the resulting controls SHA. Review that new observed receipt. The old13ef diagnostic cannot authorize release under changed controls. Only after that review and specific activation/exclusive-window approval may one release dispatch occur. No merge, diagnostic, permission execution or deployment is included in preparing this draft. Migration188 is outside this workflow; parent reports its separate application ledger20261030023201 and postverification02:32:12UTC. No historical records were repaired.

Repair-local receipt:117 Node controls,4994 tests/226 files,168 evaluator tests and12 independent adversarial assertions passed. Types and build passed; lint0 errors/907 existing warnings; YAML and whitespace passed. Exact candidate CI belongs to the published handoff. No real authenticated-route probe occurred.

## Current372 refresh and approved execution sequence — 2026-10-30 UTC

Current mainfece0e5448eb36ac0be8b29333da20691baf114b includes363/364/366; postmerge366 CI40998038342 passed5091 tests/229 files and GitHub Vercel status succeeded.372 implementation remains byte-identical reviewed36af47a: only tracker/release documentation reconciles. Runtime/source, rollback/source, CLI2.122.0, TypeScript5.9.3, configuration, baseline281 and all native80/reconstructed82 guards remain unchanged. SQL188/RPC106 are untouched; parent reports188 already applied separately.

At03:30UTC the owner explicitly approved372 merge, job-wide Actions-read, a fresh diagnosis and conditional371 deployment if all checks pass. This is execution authority for the bounded sequence, not proof that it ran. Current scope stops at the reviewed final candidate and CI before parentgo for ready/merge. No additional owner question is required while source/permissions/target remain unchanged. Actual authenticated receipt access is still untested.373/security-closeout merge is excluded.

After372 merge/postmerge checks, freeze main. Dispatch one diagnose with blank receipt inputs under the actual merged controls SHA, review actual baseline/config/native80/reconstructed82/type proof and receipt digest with parent, then one approved release referencing that exact successful run/digest only if all guards pass. No main changes between diagnosis and release. The old40988136741/13ef receipt must not be reused. Baseline metadata is a required future observation; old hashes are not fresh deployment evidence. Unknown outcomes/layout/configuration/status/auth failure stop without fallback or blind retry. Confirmed owned failure permits only the reviewed conditional verified rollback.

No production/source download, management identity, Actions-read route or new permission is exercised during this refresh. No historical rows or business/model traffic are part of the release job. Public-source recovery does not guarantee identical ESZIP, dependencies, runtime or secrets.

Refreshed local checks:117 Node guards;5091 full tests/229 files;265 evaluator tests/types/focused lint; zero skips. Full lint0 errors/907 existing warnings, build and YAML/whitespace passed. Independent review12 additional adversarial tests plus117 controls/wrapper passed; all3 implementation blobs are identical36af47a. No permission/secret/live operation occurred. Final head/CI belongs to the published handoff.
