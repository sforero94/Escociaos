# One reviewed registered-date cohort release — preparation only

## Frozen source and recovery

- Candidate source: `c2be2a5ba36cf39c22d4db251c0e5348910f1802` (merged PR387).
- Edge tree: `97abc8a49a2d6693ed12bdb0d06949b651cadca7`.
- Complete candidate source fingerprint: `d08faa6d930191cc667bc4fc20cab8907c331d5ac907270dc662fd03fcf35337`, **85 files**. Expected native layout has 83 source files plus two known omitted type-only modules reconstructed from pinned Git. This candidate native capture has not occurred.
- Fixed recovery source: `391e4d7ce86b0bfc8c7969b721f46949e2a209cc`, edge tree `afeafd0a5a265f3585ac8567b41bd80185c5b78e`.
- Complete v286 recovery fingerprint: `868b804198237b26b1bee4123741c6e2bfc2daf2277bbb31c326aa5b04b94f84`, 84 files. Native: `2e9e49e23c2ffe5dd37651c88c98170cb4730d9d310613337ba5df1603c26cfe`, 82 files. These are previous verified release receipts, not fresh captures for this job.
- Metadata-only verification on 2026-10-31: ACTIVE v286, bundle `9d5e36b67d41f2afa185d6a2921477ee49cb331ea26836678bb7aade84cdf9a5`, updated_at `1793472498681`, verify_jwt=false, import_map=false. Fixed project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`, identity `9defb252-5ea2-463b-b91b-497e0a7fe582`. This read does not establish fresh source equivalence or an exclusive deployment window.

## Reviewed path and approval boundary

New manual-only workflow: `.github/workflows/release-application-date-cohort-once.yml`. Controller and closed tests are `scripts/release-application-date-cohort-once{,.checks}.mjs`. The new narrowly copied capture helper accepts only exact approved 84/85-file Git inventories; all existing release controllers, capture helpers, workflows and pins remain unchanged. Exact raw source/cache/config comparison, two type-only AST proofs, unknown-path/symlink rejection and reconstructed equality remain mandatory.

Permissions stay `contents: read`; checkout action is pinned to `11bd71901bbe5b1630ceea73d27597364c9af683`, credentials are not persisted. CLI is Supabase2.122.0, proof TypeScript5.9.3. Existing repository `SUPABASE_ACCESS_TOKEN` appears only in the final capture/deploy step and the normal CLI environment. No Actions-read grant, new secret or credential, arbitrary source input, migrations, permissions, other functions or pruning.

Publication of this draft does **not** authorize ready/merge, secret use, dispatch, deployment or rollback. Before execution: independently review exact controls/head/checks, recheck current private-KV isolation using catalog metadata, obtain specific activation approval and exclusive backend window, and verify current main has the frozen runtime. Once approved, dispatch once from main with `DEPLOY_APPROVED_APPLICATION_DATE_COHORT_WITH_V286_ROLLBACK` and the exclusive-window confirmation. A stale baseline or any failed proof aborts. Never repin to unexpected production merely to pass.

Execution requires two fresh v286 captures, matching immediate pre-deploy metadata, unchanged clean source/config, then one CLI deployment. Success requires owned next-version metadata, bounded healthy response, exact native/reconstructed candidate source/config proof, and unchanged ownership afterward. A confirmed owned status/JWT/health failure permits one verified source rollback. A timeout, API denial, CLI exception, changed ownership or source verification uncertainty stops without blind retry or rollback. Same-job raw captures stay private and temporary; pinned Git provides durable reproducible source.

## Limits and acceptance

Source/config recovery does not guarantee the same compiled binary. Rollback does not undo or delete any private cohort receipts issued while a newer runtime was active; the old runtime ignores opaque metadata, and receipt validity/physical cleanup limits remain those in [APPLICATION_DATE_COHORT.md](APPLICATION_DATE_COHORT.md). There is no schema or business-data repair step. No global KV scan/deletion is authorized by this job.

Technical source/config/health success is not answer-quality acceptance. The existing v286 campaign remains three of sixteen sent: two useful, one failed date-comparison continuation, thirteen unrun. After a separately approved successful deployment, parent must run a fresh supported list followed by the registered-date comparison, then continue the agreed regression campaign. Old messages without authenticated receipts cannot be retroactively made trusted. No new model calls occur during preparation.

## Preparation receipts

PR387 exact-head CI41233661563 and postmerge CI41233949240 passed; postmerge job124633672263 confirms 5,386  tests / 240 files and lint 0 errors / 907 warnings. GitHub Vercel statuses passed; no direct Vercel metadata route was used. Source/health verification is separate from online quality.

Local draft-control validation: 5,387  tests / 240 files, zero skips; typecheck passed; lint 0 errors / 907 existing warnings; build passed (30.61s). Forty synthetic release guards passed on the candidate and independently on the exact 84-file recovery source; six additional independent pin/baseline/refusal assertions passed. One initial rollback fixture incorrectly reused version 287 instead of 288; the fixture was fixed, preserving the controller's +1 ownership requirement. Final independent code/documentation review found no remaining concrete blocker for draft publication.

Additional catalog-only isolation check (`log_PNw3wu64AD5l`) confirmed anon/authenticated are not superusers or BYPASSRLS and lack DELETE/TRUNCATE grants on the private KV; service_role retains its existing rights. No table rows were read or written. These metadata reads are not permission changes or a future release approval.
