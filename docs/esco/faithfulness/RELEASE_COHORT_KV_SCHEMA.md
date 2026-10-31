# One reviewed cohort KV schema release — draft only

## Frozen candidate and recovery

- Candidate source: `bf6a8a30dadcafdc9e27b3b9514d1b77f8d4ad58` (merged PR389).
- Candidate edge tree: `14b02e7c564c8a05d6d26939f008111e759c1c65`.
- Complete candidate fingerprint: `a8ad35ddfb11af95909791ad96a08e9a90bde9c61bd2efde7bffdc54d44d6a02`, 85 files. Its new native fingerprint has not been observed; the exact expected layout is 83 native files plus two proven type-only modules reconstructed from pinned Git.
- Recovery source: `c2be2a5ba36cf39c22d4db251c0e5348910f1802`, edge tree `97abc8a49a2d6693ed12bdb0d06949b651cadca7`.
- Recovery complete85 fingerprint: `d08faa6d930191cc667bc4fc20cab8907c331d5ac907270dc662fd03fcf35337`; native83 fingerprint: `00ed7d745293ad9b8942d718c0c302b8504b3cadbe659a5e3d53ccba5f5bfd9d`.
- Metadata-only baseline: ACTIVE v287, bundle `7daa45317df62b545f2138f0a15262322289380b73d0fd4207ae682e665cae17`, updated_at `1793476743098` (2026-10-31 19:59:03.098 UTC), verify_jwt=false, import_map=false. Prior source proof is historical; this job requires two fresh matching captures.

Target remains project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`, identity `9defb252-5ea2-463b-b91b-497e0a7fe582`. Both approved sources have85 files/native83; proof rejects the earlier84/native82 layout even with a matching supplied hash.

## Controls and execution boundary

Only the new manual workflow/controller/checks and ordinary test wrapper are added. `release-application-date-cohort-capture.mjs` is reused unchanged: exact raw source/config/cache layout, unsafe-path/symlink rejection, AST/type-only proof and full reconstructed equality. Previous workflows/controllers/pins remain immutable. This draft changes no runtime, SQL, data, permission, identity or provider.

Workflow `.github/workflows/release-application-cohort-kv-schema-once.yml` has contents:read only, main-only dispatch, first attempt and shared `escocia-backend-release` concurrency. Checkout is pinned to `11bd71901bbe5b1630ceea73d27597364c9af683`; credentials are not persisted. CLI Supabase2.122.0 and TypeScript5.9.3 stay pinned. Existing `SUPABASE_ACCESS_TOKEN` appears only in the final step and normal CLI environment; no new secret or Actions-read permission.

Separate approval is required for ready/merge and execution. Before approval, revalidate exact head/checks, current function metadata, KV key/value schema/isolation and the exclusive backend window. Dispatch once using `DEPLOY_APPROVED_APPLICATION_COHORT_KV_SCHEMA_WITH_V287_ROLLBACK`; there is no arbitrary source input. Two fresh recovery captures and stable immediate metadata precede one CLI deployment. Owned next-version metadata, health, deployed source/config proof and stable ownership are mandatory. A confirmed owned failure permits one verified rollback. A timeout, denial, unknown layout, changed source/ownership or uncertain CLI outcome stops; no blind retry, rollback or pin relaxation.

## Limits and acceptance

Rollback restores the known v287 source/configuration, including its known LC02 KV-read defect. It is technical recovery, not functional LC02 acceptance, and it does not guarantee an identical compiled binary or delete issued receipts. The one-slot/user, 30-minute validity and lazy physical cleanup contract remains unchanged; no historical conversation repair or production cache deletion is authorized.

The v287 gate remains three first sends: R01/R02 useful, LC02 operational failure, thirteen unrun. No extra production sends occurred while preparing this fix. After a separately approved successful release, parent must start a fresh supported list and immediate comparison in the same conversation. An old failed continuation cannot substitute for that new source pair. Source/health success and local SQL regression tests do not prove live answer quality or complete production Auth/RLS behavior.

## Preparation receipts

Source PR389 exact-head CI41238443355 and postmerge CI41238650018 passed; postmerge job124647660770 confirms 5,396 tests / 240 files and lint zero errors / 907 warnings. GitHub Vercel passed. Local release preparation passed 5,397 tests / 240 files, zero skips; types/build passed (31.04s), lint zero errors / 907 existing warnings. Independent review passed 41 candidate guards plus 41 explicit recovery guards, seven binding/refusal assertions and documentation/whitespace review. No concrete blocker remained for draft publication. These checks did not invoke the CLI, secret, release workflow or production application.
