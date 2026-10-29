# Temporary PR367 release job — draft, not dispatched

Deploy only source `634580480c72b27c7ccd2d8c006af520d0ca1058` to project
`ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`. No migration187, PR362
activation, new credentials/access, provider/business reads, bot messages or other
function deployment. Repository CLAUDE.md requires the Supabase CLI; no connector
publish path. Parent reviews the final candidate and separately authorizes
merge/dispatch. Manual main-only trigger, confirmation
`DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK`, contents:read, no persisted checkout
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
require a separately verified bundle/lock artifact. Actual download/equality,
rebuild and live checks are still unrun, so readiness remains conditional.

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
