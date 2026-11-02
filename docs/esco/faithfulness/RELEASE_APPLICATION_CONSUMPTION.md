# One reviewed application product-consumption release — draft only

## Frozen source and recovery

- Candidate: merged PR391 source `48a925cca797ac470832f07f6b1c6f7addc61a4b`, edge tree `1bc6254f47858acc63a3329ec219df296dddf6b4`.
- Complete candidate fingerprint: `d611ff0a8864b05a0e960e21edb242219dfa07e2e64c11c8d8ada9d2cec2d4f5`, 85 files. Native candidate content has not been observed; execution must prove 83 downloaded files and two type-only reconstructions against pinned Git, then exact full equality.
- Recovery source: `bf6a8a30dadcafdc9e27b3b9514d1b77f8d4ad58`, edge tree `14b02e7c564c8a05d6d26939f008111e759c1c65`.
- Recovery complete85 fingerprint: `a8ad35ddfb11af95909791ad96a08e9a90bde9c61bd2efde7bffdc54d44d6a02`; native83 fingerprint: `6e0027496d63d6b8c603e5590d0e4a4cd22a30df54173351ce2f4f797956bee4`.
- Metadata-only read at preparation confirms ACTIVE v288, bundle `7c2583626cc7e7ecac531ef62a71e6d3581a4426be05bfd58df9b6218d978beb`, updated_at `1793554013172` (2026-11-01 17:26:53.172 UTC), verify_jwt=false, import_map=false. Historical source proof came from successful release [41331467207](https://github.com/sforero94/Escociaos/actions/runs/41331467207). This is not a fresh source capture; two matching fresh captures are mandatory at execution.

Target: project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`, identity `9defb252-5ea2-463b-b91b-497e0a7fe582`. Both sources have 85 files/native83; only the two pinned type-only modules may be reconstructed after exact AST/reference/type-only proof. Source/configuration consistency does not prove business truth or identical compiled bundles.

## Scope and guard preservation

The new workflow/controller/checks reuse the reviewed PR390 pattern with updated immutable source, recovery, baseline and confirmation bindings. The shared source/config/cache/type-only capture helpers, old consumed controls, runtime, SQL, providers and storage contract remain unchanged. The ordinary test wrapper includes the new checks. Its workflow guard reads the actual new workflow and rejects permission expansion, secret movement and old workflows.

`.github/workflows/release-application-consumption-once.yml` is manual main-only first-attempt, contents:read only, shared `escocia-backend-release` concurrency, no persisted checkout credentials. Checkout action `11bd71901bbe5b1630ceea73d27597364c9af683`, Supabase CLI2.122.0 and TypeScript5.9.3 stay pinned. Existing `SUPABASE_ACCESS_TOKEN` appears only in the final step and normal CLI environment. No new secret, Actions-read grant, credential change, migrations, other function or model call.

## Required next approval and single execution

Publication is preparation only. Separate specific approval must cover the exact final draft head, ready/merge, one controlled deployment, conditional owned rollback and an exclusive backend window. Prior PR390 permission is consumed. No secret access or workflow execution occurs during preparation.

After approval, revalidate head/main/checks and live v288 metadata; merge controls and await exact-merge CI/GitHub Vercel. Dispatch the new workflow once on that merged controls SHA with `DEPLOY_APPROVED_APPLICATION_CONSUMPTION_WITH_V288_ROLLBACK` and `exclusive_backend_window=true`. No arbitrary source input exists. Before credentials, fixed source syntax and invocation are checked. Before deployment: clean candidate/recovery source/config equality, two fresh matching v288 captures, stable metadata and immediate ownership baseline. Unknown files/cache/symlinks/type analysis, changed source/config/baseline or stale ownership stop execution.

One CLI deployment must yield next-version ownership, healthy status, unchanged JWT/import-map configuration, full downloaded/reconstructed candidate source proof and stable metadata. Only a confirmed owned failed status/configuration/health permits one verified rollback. Denial, timeout, transport/CLI/source-verification uncertainty or another operator stops for inspection; no blind retry or rollback and no pin relaxation. Runner-temporary capture is cleaned in finally; pinned Git provides durable reproducible source recovery.

## Recovery and acceptance limits

Rollback restores v288 source/configuration, including the known N04 wording refusal. It does not guarantee an identical binary or delete receipts. The one-slot/user, 30-minute receipt validity with lazy deletion remains unchanged; no historical repair or production receipt deletion.

The v288 campaign remains eight first-attempt sends: six useful, N03 coverage-inconclusive, N04 source-answerable failure, eight unrun. No campaign was rerun during preparation. Synthetic routing/shared-loop parity proves bounded code behavior, not real model/UI quality or general language coverage. Parent must rerun the affected supported case and passing/ambiguous controls after a separately approved release. Do not count a valid supported refusal as success or call health/source verification online acceptance.

## Preparation receipts

PR391 merged unchanged at the pinned source after explicit owner approval. Postmerge [CI41378895877](https://github.com/sforero94/Escociaos/actions/runs/41378895877), job125065124897, passed 5,418 tests / 241 files and lint zero errors / 907 warnings; GitHub Vercel passed. These are source integration checks, not backend activation.

Release preparation passed 41 synthetic Node guards, then an independent 41 candidate + 41 explicit recovery checks and eight extra binding/refusal assertions. The final full suite passed 5,419 tests / 241 files, zero skips; types/build passed (29.20s), lint zero errors / 907 existing warnings; whitespace and unchanged runtime/SQL were checked. The first full run had one documentation-only false positive from the existing chat-ID heuristic matching a public run identifier near a channel module reference. Clarifying the prose resolved it; the guard was not changed or relaxed. Exact-head CI is verified at draft publication and recorded in the handoff. No secret, CLI deploy/download, management mutation or online model call occurred during preparation.
