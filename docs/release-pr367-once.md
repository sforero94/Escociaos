# PR367 release repair — review and execution approval required

Deploy only source `634580480c72b27c7ccd2d8c006af520d0ca1058` to project
`ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`. This change prepares release controls only.
It does not deploy, change database state, activate other work, or alter production access.
Parent review and specific merge/dispatch approval remain required.

## Confirmed diagnostic evidence

PR369 merged at `ecfdb028229c5c803a4a78177e6861fa19cbba4c`.
[Diagnostic40938972828](https://github.com/sforero94/Escociaos/actions/runs/40938972828)
completed once with deploymentAttempted=false. Strict layout validation failed; gitEquivalent was null.
Backend metadata remained v280, ACTIVE, verify_jwt=false, import_map=false.
Bundle SHA256 was `dc67ed8b9f26f47b3d4184446ddaf67055b7832dc33f39fdb874b06268c7ff00`.
PR367 remains undeployed at this preparation stage.

The CLI produced these two cache files, separate from function source:

| Relative path | Bytes | SHA256 |
| --- | ---: | --- |
| supabase/.temp/cli-latest | 8 | e259ceef24c76934bc3c6884c465e636c7f058e1b275e46de8d1e51a5dc8c4c4 |
| supabase/.temp/linked-project.json | 134 | 5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302 |

Native function source contained80 files. Every downloaded file matched pinned Git bytes; no source file changed or appeared unexpectedly.
The native fingerprint was `f2a7edba76fcccaa37807b6096fdad5357bfdbf26641a2e30d4052593f36d053`.
Only these two Git modules were absent:

| Git path | SHA256 | Incoming explicit type-only references |
| --- | --- | ---: |
| importHato/tipos.ts | a737ed522a05bbe61dcafe5404cf2bbb6fb54356fe891617fa9c0d744b562ff1 | 10 |
| telegram/types.ts | 60cf9a3e52182f34d2411694c0cfd702f8fe17efe7cc7c1f0a64db78af534ed5 | 8 |

These are observations from one read-only diagnostic, not proof that future downloads retain this shape.
The earlier [release40931922567](https://github.com/sforero94/Escociaos/actions/runs/40931922567)
stopped before deployment. [Drift40932344531](https://github.com/sforero94/Escociaos/actions/runs/40932344531)
reported undeployed main source while health returned200. Verification CI success does not resolve production drift.

## Narrow reconstruction gate

The durable rollback source is Git commit `e5d2291202901848c45e42a2ffddae1a4cdf249e`.
Its function tree is `0336fa13a040a48178a7d73beb6c8a1709e9a6a7`.
The complete82-file fingerprint is `5fd66ee8d485aefd7809c18dbdb6be5db114e46cae0b43690bad9160a5c260ad`.

For each first, second, and restored capture:

1. Verify both fixed Git commits, tree hashes, cleanliness, and minimal deployment config.
2. Download once into a private temporary directory using official CLI2.122.0.
3. Inventory every raw file and directory. Reject symlinks, special files, extra paths, changed bytes, or changed cache hashes/sizes.
4. Require exact equality with pinned Git minus precisely the two listed modules, plus precisely the observed cache entries.
5. Verify the omitted Git module hashes. Parse all75 .ts and7 .tsx Git modules with TypeScript5.9.3.
6. Require only interfaces, type aliases, imports, and type exports in the omitted modules; reject side-effect imports.
7. Require each omitted module to emit only `export {};`. Require all18 observed incoming references to be explicitly type-only.
8. Copy raw source/config into a new clean directory. Restore only those two modules from verified pinned Git.
9. Run the original complete-source/config comparator unchanged. Require all82 reconstructed files to match pinned Git.
10. Preserve separate native80-file and reconstructed82-file fingerprints in safe logs. Never describe reconstructed modules as downloaded.

Unknown layouts remain rejected. Cache entries are validated, never broadly ignored.
Raw captures remain untouched. Rollback uses the first clean verified capture, including restored types and minimal config.
The diagnostic mode retains its original strict raw-layout check; it does not reconstruct or enable deployment.
A changing cache digest may therefore require another diagnosis and review before release.

## Deployment and recovery gates

Require exact v280 baseline metadata, including function identity, version-bound entrypoint, JWT setting, and bundle hash.
Recheck metadata after captures and immediately before deployment. Two reconstructed captures must equal each other and pinned Git.
Only then deploy the fixed release source with the Supabase CLI.
Require the next version, changed bundle hash, ACTIVE status, verify_jwt=false, and anonymous health200 with status=ok.
Recheck metadata after health. On confirmed smoke/config failure, require unchanged deployment metadata before rollback.
Verify restored version/config/health, capture its source through the same reconstruction gate, and recheck metadata.
Rollback still fails the release job. CLI failure or unexpected/concurrent metadata stops without blind retry or rollback.
Workflow concurrency does not lock other deployment tools; an exclusive deployment window remains necessary.

The seeded minimal TOML is not downloaded historical configuration.
Its settings are checked against remote metadata: fixed entrypoint, no import map, and verify_jwt=false.
No source rewriting, package/import rewriting, whitespace normalization, or additional file omission is allowed.
Migration186 and alert source compatibility were checked separately. This job does not apply migrations187 or activate PR362.

Git retains the verified first-party source and canonical settings after temporary capture deletion.
This is not bit-identical ESZIP recovery. External imports include unversioned `npm:hono` and major-only packages.
Registry resolution, runtime image, and live secrets are not snapshotted. TypeScript emission is not a Deno bundle-reproduction proof.
The fixed-tree AST/reference check is not a general module-resolution analysis.
After runner loss or uncertain outcome, inspect remote state before considering separately reviewed recovery.

## Validation, permissions, and cleanup

Run `node --test scripts/release-pr367.checks.mjs scripts/release-pr367-capture.checks.mjs` after installing repository dependencies.
Local checks pass67 tests with no skips. This includes real pinned Git syntax analysis and synthetic disk reconstruction/rollback.
The positive disk regression substitutes only a synthetic cache digest in a private temporary implementation copy.
It never reads the remote cache body or changes production cache constants.
Standard PR CI does not run these separately named Node checks; manual execution runs them before management credentials are available.
Pinned TypeScript5.9.3 installs without scripts or management credentials. CLI installation also precedes credential access.

The workflow remains manual/main-only, contents:read, without persisted checkout credentials or artifact uploads.
Mode defaults to diagnose. Confirmations must match the selected mode; release requires `DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK`.
The existing management secret is available only in the selected-mode step. No credential creation or permission change occurs.
Logs contain relative paths, types, counts, hashes, and proof status; no raw source/API/CLI bodies are printed.
Diagnostic filename redaction replaces only the exact supplied current access-token string, not arbitrary credential-like names.
Temporary captures are deleted at exit. No private key, backup service, provider call, or business probe is introduced.

A release replaces the entire shared edge service, including Web/Telegram, alert, and cron routes.
Health alone does not validate business routes, live faithfulness, or calibration. Parent coordinates browser QA and Bot Log.
After release acceptance, remove the six temporary control, proof, test, workflow, and guide files in a cleanup PR.
