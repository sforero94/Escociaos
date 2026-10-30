# Application facts release candidate (draft only)

PR380 and PR381 are integrated. This proposed manual control does not deploy until a separately approved merge and dispatch. Backend v283 remains the observed baseline; source/health checks are not online answer-quality acceptance.

## Immutable source and recovery pins

- Candidate: `35ac322ce205c39282dbd60fedbd5120ef67a666`, edge tree `ed99b037c0d1c35fdff3df291d264e0ddacd531e`; 84 files, fingerprint `9018b28b81425f0f8b86379400bd1ad49c32a7df0a57b121c30614fbc5a0e629`.
- Recovery: `2b94c84c1bbdc941ce171f788b2e6c10aa0b01dc`, edge tree `abff19626f37e09673ec64ce891138de96f87510`; reconstructed 83 files, fingerprint `9a32ed73281ac31879ee00ae5b9414abc4cd82718c4513821f37d9d3dee30140`.
- Prior v283 native capture: 81 files, fingerprint `39ce6e333468238a836572178e7f32184a0ee038fb5c8def3aaf09f00f5c46ed`. Evidence: [successful prior release](https://github.com/sforero94/Escociaos/actions/runs/41091880755), job 124187587200, attempt 1. This is historical evidence, not a fresh capture for this release.
- Baseline metadata: ACTIVE v283, bundle `4903bccd4b8c782db853c6e1fb369109df651426018c4e8358fbb689ed2b1638`, updated `2026-10-30T16:39:59.071Z`, verify_jwt=false, import_map=false; fixed function/project identity and entrypoint.

## Proposed execution and refusal conditions

The dedicated `release-application-facts-once.yml` is manual, main-only, attempt 1, contents:read only, and shares the backend release concurrency group. It requires the exact confirmation and an exclusive backend window. Checkout is commit-pinned; Supabase CLI is 2.122.0 and TypeScript is 5.9.3. The existing management secret is scoped only to the final release step; no Actions-read permission or new credential is required.

Before any deployment, compare exact baseline metadata, Git source/config pins, and two fresh downloads. Native recovery bytes must match all 81 prior files. Only the two pinned type-only modules may be reconstructed from Git, with AST/reference proof, to establish the 83-file recovery source. Reject unknown wrappers, cache shapes, paths, symlinks, extra, missing or changed files. Candidate source verification requires 82 native files plus the same two proven type-only modules, yielding all 84 pinned files. Never describe reconstructed files as downloaded.

Immediately recheck metadata and source before the single CLI deployment of `make-server-1ccce916` in `ywhtjwawnkeqlwxbvgup`. Verify version increment, changed bundle, newer timestamp, health, full source and configuration, and stable ownership. Conditional rollback requires a confirmed failed deployment still owned by this job; verify recovery health, source/config and ownership. Uncertain command, transport, capture or ownership outcomes stop without blind retry or rollback. No other function, migration, data repair, pruning, secret setting or provider/model call is included.

## Recovery limits and follow-up

Raw source captures remain private runner-temporary files and are removed in finally. Durable recovery source is the pinned public Git commit, not a retained private bundle. Config is seeded from pinned Git; remote identity/entrypoint/JWT/import-map metadata is checked independently. This does not recover or prove an identical compiled binary or downloaded remote TOML. An unknown future downloader layout fails closed. Retiring the completed one-shot controls needs a later reviewed cleanup; the previous release controls and historical receipts are preserved here.

After an approved release, independently verify deployed metadata/source, then run the comparable online acceptance campaign. Synthetic tests and deterministic rendering do not certify unrestricted language coverage or general model factuality.
