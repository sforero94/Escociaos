# Routing release preparation — draft only

PR383 is merged; this proposal does not activate it in the backend. A separate specific approval is required to merge and dispatch this one-shot control. No online acceptance is claimed. The active v284 baseline has technical release/source proof, not a passing factual-answer campaign.

## Fixed target and source

- Project/function: `ywhtjwawnkeqlwxbvgup` / `make-server-1ccce916`; unchanged function identity and entrypoint.
- Candidate Git: `15b6f42c3254788deddfc9a236b6bf4d8b8955be`; edge tree `94a25bdd46eb011f9afbc0cc303ff09de4885a15`; 84 files; fingerprint `944e5d81ead68cca317f5339d131df918554193822c6beb9152f846ea0e9a93c`.
- Recovery Git: `35ac322ce205c39282dbd60fedbd5120ef67a666`; edge tree `ed99b037c0d1c35fdff3df291d264e0ddacd531e`; reconstructed84 files, fingerprint `9018b28b81425f0f8b86379400bd1ad49c32a7df0a57b121c30614fbc5a0e629`.
- Observed v284 native82 fingerprint: `e983476d2fc242c399b61c58b6bbc342dd5b396ea1840fece42d675dd5178aa2`. Historical source receipt: [release41125188642](https://github.com/sforero94/Escociaos/actions/runs/41125188642), job124301631786, attempt1, one deployment, zero rollbacks. This is not a fresh capture for the proposed release.
- Exact baseline metadata: ACTIVE v284, bundle `e7240ba25395b1c26e4a30d4c72fef534999be5ed93a8f13cded383d303e3fe0`, updated `2026-10-30T20:42:06.140Z`, verify_jwt=false, import_map=false.

## Preserved execution gates

The dedicated workflow is manual main-only, attempt1, contents:read only, with the shared `escocia-backend-release` concurrency group and explicit exclusive backend window. Confirmation is `DEPLOY_APPROVED_APPLICATION_ROUTING_WITH_V284_ROLLBACK`. Existing SUPABASE_ACCESS_TOKEN is scoped only to the final step; no Actions-read, secret changes or new identity. Checkout action remains pinned to `11bd71901bbe5b1630ceea73d27597364c9af683`; CLI2.122.0 and TypeScript5.9.3 are prepared without management credentials.

The unchanged reviewed capture/proof helpers compare exact paths, native bytes/hashes, cache shape and type-only AST/references. Both recovery and candidate require native82/reconstructed84 proof. Only `importHato/tipos.ts` and `telegram/types.ts` may be reconstructed from pinned Git; do not describe those files as downloaded. Unknown files/layouts, symlinks, malformed counts or changed source fail closed.

Before the single deployment, require clean fixed Git source/config, two fresh exact v284 captures, unchanged baseline and immediate pre-deploy metadata. After deployment require owned version increment, changed bundle/newer timestamp, health, exact source/config and stable ownership. Rollback is permitted only for a confirmed failed deployment still owned by this job, followed by recovery source/config/health/ownership verification. Uncertain CLI, transport, capture or ownership outcomes stop without blind retries or rollback. No migrations, pruning, other functions, provider/model changes, data repair or permission changes are included.

## Recovery and acceptance limits

Raw captures are private runner-temporary files removed in finally. Durable recovery is the fixed Git source/config; identical compiled binary recovery is not guaranteed. Config is seeded from Git, with remote identity/entrypoint/JWT/import-map metadata independently checked; this is not a downloaded remote TOML proof. Existing completed release controls and historical receipts are unchanged, not reused for execution under a stale approval. Future cleanup needs its own bounded review.

After a separately approved successful release, the parent must run comparable online acceptance on the actual version. Synthetic routing/renderer tests establish the closed boundary, not unrestricted language coverage or model quality.
