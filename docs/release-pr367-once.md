# PR367 release blocked — read-only diagnostic pending review

Deploy only source `634580480c72b27c7ccd2d8c006af520d0ca1058` to project
`ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`. No migration187, PR362
activation, new credentials/access, provider/business reads, bot messages or other
function deployment. Repository CLAUDE.md requires the Supabase CLI; no connector
publish path. Parent reviews the final candidate and separately authorizes
merge/dispatch. Manual main-only trigger; mode defaults to `diagnose`. Diagnostic confirmation
is `DIAGNOSE_PR367_LAYOUT_ONLY`. An independently approved deployment must select
`release` and `DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK`. Permissions remain
contents:read, no persisted checkout
credentials, no schedule/push/PR release triggers. Existing management secret is
scoped to one step. Official CLI2.122.0 installs before that step; no login or
secret export. Checkout action is pinned to verified v4.2.2 SHA
`11bd71901bbe5b1630ceea73d27597364c9af683`.

## Durable source gate replaces ephemeral-only acceptance

The durable rollback reference is existing public Git commit
`e5d2291202901848c45e42a2ffddae1a4cdf249e`, function tree
`0336fa13a040a48178a7d73beb6c8a1709e9a6a7`. A separate clean, exact checkout is
mandatory. This is a **candidate rollback reference, not already verified v280**.
Actual downloaded bytes must prove equivalence before any deployment:

1. Require remote v280, ACTIVE, verify_jwt=false, no import map, fixed function
   ID/name/slug and exact known version-bound Supabase entrypoint. The recorded
   ESZIP hash is `dc67ed8b9f26f47b3d4184446ddaf67055b7832dc33f39fdb874b06268c7ff00`.
2. Download twice into separate runner-temporary roots. Only one top-level
   `supabase` directory is allowed. Its complete directory/file inventory,
   relative paths and file bytes must exactly match the pinned Git function
   tree (all82 source files). This includes hidden/extra files and empty
   directories. Wrapper directories allow only this function and the seeded CLI
   config; all other files/directories abort. Reject symlinks, special files and ambiguous
   paths. The two downloads must also match each other.
3. Check the release and rollback checkout commit/tree/cleanliness and exact
   deployment config. Git config contains only verify_jwt=false; remote metadata
   must independently agree, along with no import map and the fixed entrypoint.
   The CLI needs a TOML file, so the capture workspace seeds the exact minimal
   Git config. This copied file is not counted as downloaded source and does not
   prove historical remote TOML bytes. Configuration equality is a canonical
   settings comparison against metadata; source equality is actual byte equality.
   Any change to the seeded config also aborts. No unknown config reconstruction.
4. Recheck stable metadata immediately before the CLI deploy. No metadata hash,
   double-download consistency or historical report substitutes for Git equality.

Only normalization: compare a download's explicit `supabase` wrapper to the Git
`supabase` directory; validate the exact known Supabase build prefix/version for entrypoint
comparison; reconstruct the minimal TOML from settings independently proven by
metadata. The Management API does not export a historical TOML file. No CRLF, whitespace, source-map, extension, transpilation, package,
path, import rewrite or generated-file exclusions. Different CLI output layout,
missing files, extra files or changed bytes abort. Do not relax this gate merely
to make a real download pass; return the discrepancy for review.

If the gate passes, Git durably retains the proven source and canonically equivalent config when runner
capture is deleted. Same-job capture remains the immediate rollback input.
If the gate fails, no deployment occurs, so deleting the unverified temporary
capture does not strand a mutated deployment. No keypair, private Space, new
backup destination or artifact upload is needed. No ephemeral-only override.

## Recovery behavior and evidence limits

After a successful CLI deployment, require the next version and changed bundle
hash; configuration/status/anonymous health must pass. Re-read metadata after
successful smoke. On a known smoke/config failure, require unchanged deployment
metadata before restoring the verified capture. Check restored version/config,
health, re-downloaded full source manifest and metadata-backed config and stable metadata. Rollback
still fails the release job. CLI failures or unexpected/concurrent metadata stop
without blind mutation/retry. After runner loss or uncertain outcome, inspect
remote state first; a separately reviewed CLI recovery can use the proven Git
reference. Do not auto-run another deployment from an uncertain result.

Exact first-party source equality and metadata-backed config equivalence is not bit-identical ESZIP reproduction.
Existing external imports include unversioned `npm:hono` and major-only package
versions; transitive registry dependencies, runtime image and live secrets are
not snapshotted by Git. No dependency-resolution or runtime-binary reproducibility
claim is made. No broad dependency-pinning change is included. Parent must assess
this source-redeployment limit before release; exact old-bundle recovery would
require a separately verified bundle/lock artifact. The first live download failed wrapper validation. Source equality, rebuild and
release health remain unproven/unrun, so readiness remains conditional.

Coordinate the deployment owner: workflow concurrency serializes this workflow,
not other deployment tools. Metadata checks are not an atomic lock. Migration186
was independently found as `20261028193716`, with the required trace table/view
catalog. Its alert handlers remain in both pinned source trees. PR360 does not
change edge source; migration187/activation362 stay separate.

## Validation and cleanup

Run `node --test scripts/release-pr367.checks.mjs`; parse/review YAML. Standard PR
CI does not execute these separately named Node checks; the manual job does so
before credential access. Smoke is bounded anonymous GET /health only; no chat,
model, business route or alert-tick call. The entire shared edge service is
replaced, including Web/Telegram, alert and cron routes. No live faithfulness or
calibration claim. Logs contain safe phases/status/fingerprints only, never raw
source/API/subprocess output. Captures are removed at exit; Git is the durable
reference only after proof. After release acceptance, remove these four temporary
files through a small cleanup PR. Parent alone records the actual Bot Log result.

## Read-only layout diagnostic — preparation only

PR368 merged at `5e344fd73d2dd925fd49530b885dd2bf364875e0`. Verification run
[40931410656](https://github.com/sforero94/Escociaos/actions/runs/40931410656) passed.
Release run [40931922567](https://github.com/sforero94/Escociaos/actions/runs/40931922567)
stopped at `capture-first` / `Unexpected download wrapper`, before deployment or
rollback. Captures were deleted, so actual unexpected paths remain unknown.
The subsequent drift job
[40932344531](https://github.com/sforero94/Escociaos/actions/runs/40932344531) failed:
its log explicitly says clock/source drift (main source not deployed), while
anonymous health was200 and verify_jwt=false. Therefore postmerge checks are
**not all green**. Commit1460b034 records drift state only; it does not release367.

Official CLI2.122.0 research identifies a plausible wrapper addition, not a
confirmed diagnosis of this runner:
- [download.handler.ts](https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/commands/functions/download/download.handler.ts)
  calls linked-project caching after the download operation. Blob f6251fee.
- [linked-project-cache.service.ts](https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/telemetry/linked-project-cache.service.ts)
  documents legacy `supabase/.temp/linked-project.json` writes. Blob f5365ae6.
- [shared/functions/download.ts](https://github.com/supabase/cli/blob/v2.122.0/apps/cli/src/shared/functions/download.ts)
  controls source extraction and containment. Blob c91cebd5.
The release gate intentionally does not allow this cache path. No path is
normalized away on this evidence alone.

The proposed diagnostic uses the same fixed target, CLI arguments and seeded Git
config. It checks baseline and pinned checkout, downloads once, reports a bounded
JSON inventory of relative paths/types/file sizes/SHA256s, runs the existing
strict layout check, then verifies unchanged metadata. The separate gitEquivalent
field is null when layout validation fails, false for differing source and true
only for a complete matching fingerprint; none of these values enables release. A layout rejection appears
in the diagnostic report; it never enables deployment. Output state is always
`diagnostic-only`, with deploymentAttempted=false. No deploy/rollback/health
capability is supplied to the diagnostic runner. Symlinks are not followed,
special files are not opened, token-like names are redacted, and no raw API body,
CLI output or source body appears. No source/artifact upload or new permission.
The CLI may perform its existing same-project metadata cache read; no business
records are requested. Temporary downloaded files are deleted at exit.

After parent review and specific merge/dispatch approval, run only
`release-pr367-once.yml` on the reviewed main with mode=`diagnose` and confirmation
`DIAGNOSE_PR367_LAYOUT_ONLY`. Do not dispatch `release`. Retain the resulting safe
JSON log receipt for comparison with official source and expected Git inventory.
Any repair or canonicalization requires actual layout evidence and a separate
review. No diagnostic has run from this candidate yet.
