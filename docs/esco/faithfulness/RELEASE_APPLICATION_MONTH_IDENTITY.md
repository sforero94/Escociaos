# Named-month identity release — preparation only

PR385 is merged, but its identity correction is not yet deployed. This new manual control is a draft requiring separate specific merge/dispatch approval. Previous release approvals were consumed. No online acceptance is claimed; the parent stopped the current campaign after its first supported failure.

## Fixed candidate and recovery

- Target: project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`; same fixed identity and entrypoint.
- Candidate Git: `391e4d7ce86b0bfc8c7969b721f46949e2a209cc`; edge tree `afeafd0a5a265f3585ac8567b41bd80185c5b78e`; 84 files, fingerprint `868b804198237b26b1bee4123741c6e2bfc2daf2277bbb31c326aa5b04b94f84`.
- Recovery Git: `15b6f42c3254788deddfc9a236b6bf4d8b8955be`; edge tree `94a25bdd46eb011f9afbc0cc303ff09de4885a15`; reconstructed84 fingerprint `944e5d81ead68cca317f5339d131df918554193822c6beb9152f846ea0e9a93c`.
- Historical v285 native82 fingerprint: `462670c3d2df3c2323881978f132dc53240ca8d12bd0fd656e07c67e54892f5c`. Evidence: [release41169319585](https://github.com/sforero94/Escociaos/actions/runs/41169319585), job124443636842, attempt1, one deployment and zero rollbacks. This is not a fresh capture for the proposed release.
- Pinned baseline: ACTIVE v285, bundle `b77c76b7bab947a29f0480a243a13ee53ab2d4903062badc708901b3591a4ee9`, updated `2026-10-31T04:37:50.416Z`, verify_jwt=false, import_map=false. These historical observations must be checked again at execution; unexpected movement aborts.

## Unchanged safety pattern

The workflow is manual main-only, attempt1, contents:read only, with shared `escocia-backend-release` concurrency. Exclusive backend window defaults false. Confirmation is uniquely `DEPLOY_APPROVED_APPLICATION_MONTH_IDENTITY_WITH_V285_ROLLBACK`. The existing repository SUPABASE_ACCESS_TOKEN is present only in the final step. No new credential, access grant or Actions-read permission is proposed. Checkout remains pinned to `11bd71901bbe5b1630ceea73d27597364c9af683`; CLI2.122.0 and TypeScript5.9.3 setup plus synthetic checks run before management credentials.

The existing reviewed capture/proof helpers remain unchanged. Both source versions require 82 native files plus only the two pinned type-only modules (`importHato/tipos.ts`, `telegram/types.ts`) reconstructed from Git to establish all84 files. Exact raw paths/bytes/hashes/cache, AST/reference proof, clean Git trees and seeded config are mandatory. Unknown layouts, source differences, symlinks or extra/missing files fail closed.

Execution requires two fresh matching v285 recovery captures and immediate stable metadata/source checks before one CLI deployment. After deployment require owned version increment, changed bundle/newer timestamp, health, exact source/config and stable ownership. Conditional rollback is allowed once only for a confirmed failed deployment still owned by the job, then must verify recovery source/config/health and ownership. Uncertain command, transport, capture or ownership outcomes stop without blind retry or rollback. Existing consumed controls and immutable pins are unchanged, not weakened or rebound.

## Limits and next gate

Source captures remain private runner-temporary files; ordinary completion removes them in finally. Durable recovery is the fixed Git source/config, not an identical compiled binary. Configuration is seeded from Git and deployed identity/entrypoint/JWT/import-map metadata is checked independently; this is not proof of a downloaded remote TOML. No migration, business write, data repair, other function, pruning or model/provider change is included.

A separately approved successful release must be followed by the parent's controlled first-case rerun and remaining smoke cases. Synthetic correctness, source equality and health do not establish online factual-answer quality. No deployment, diagnostic dispatch or secret invocation is authorized by this preparation.
