# Temporary PR367 release job — draft, not dispatched

The job deploys only merged source `634580480c72b27c7ccd2d8c006af520d0ca1058`
to Escocia OS project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`.
No migration, new credentials, access changes, provider/business queries, PR362
activation, bot messages or other function deployment. Repository CLAUDE.md
requires the Supabase CLI; the connector publish path is not used.

## Before dispatch

Parent must review the final workflow and separately authorize dispatch. Workflow
publication/merge does not deploy. It accepts only manual invocation from main,
exact confirmation `DEPLOY_PR367_WITH_TEMPORARY_ROLLBACK`, and explicit acceptance
of temporary-only rollback. No schedule/push/PR triggers. GitHub token permissions
are contents:read; checkout credentials are not persisted. Existing repository
`SUPABASE_ACCESS_TOKEN` is injected only into the release step. No login, token
creation/rotation/export or GitHub secret-setting change. CLI 2.122.0 installs in
an earlier step without the management credential. Checkout action is pinned to
verified v4.2.2 commit `11bd71901bbe5b1630ceea73d27597364c9af683`.

The expected remote baseline is version280, ACTIVE, verify_jwt=false, bundle hash
`dc67ed8b9f26f47b3d4184446ddaf67055b7832dc33f39fdb874b06268c7ff00`.
A changed baseline aborts. Parent must reserve a release window with the other
deployment owner: metadata checks are not an atomic lock against out-of-band CLI
deployments. The workflow concurrency group serializes only this workflow. Migration186 was independently found in the live ledger
as `20261028193716`; its trace table/view catalog matches the required source
contract. PR360 database additions do not change this edge source. Migration187
and activation362 remain separate. Do not run a full database push.

## Rollback evidence and limits

Before deployment, two CLI downloads into separate private runner-temporary
directories must have the same sorted relative-path/file-SHA256 manifest. The
entrypoint must exist, symlinks/special files are rejected, and function metadata
must remain unchanged through capture. This verifies capture consistency, not
source provenance, semantic equivalence or a successful rebuild. Config comes
from the pinned release (verify_jwt=false); other remote configuration is not
changed by this job. No raw source or subprocess/API body goes to logs/artifacts.

**There is no durable rollback artifact.** Source exists only in this job and is
removed at exit. Runner termination, cancellation, timeout or job completion
removes recovery access. Public plaintext artifacts are prohibited. The input
`accept_temporary_rollback` defaults false; parent must explicitly decide whether
this gap is acceptable before dispatch. If durable recovery is required, stop and
select an approved private destination/encryption recipient first. None is added
or assumed here. Do not describe the historical Git source as verified v280.

Only a successful CLI deployment followed by an identifiable next version can
trigger automatic restoration. Health/config/startup failure restores the first
capture after a fresh unchanged-metadata check. Restored version/config/health
and re-downloaded source fingerprint must pass. A rebuild can change the bundle
hash, so it is not required to equal the historical ESZIP hash. A rollback still
fails the release job. CLI errors or unexpected/concurrent metadata stop without
blind retries/overwriting another owner; their outcome needs inspection.

## Gates and removal

Run `node --test scripts/release-pr367.checks.mjs` and review YAML before merge.
The source/tree/clean-working-directory/config gates run before any deployment.
The live smoke is anonymous GET /health only (bounded retry); no business record,
chat/model/provider or alert-tick request. This smoke does not prove live channel
faithfulness. Version/hash/status/JWT and safe manifest fingerprints are the only
release outputs. No source diff, environment dump or debug mode.

The whole shared edge service is replaced, including Web/Telegram, alert and cron
routes; the functional source delta is the saved-tool-evidence correction. After
release acceptance, remove the workflow, helper, checks and this temporary guide
through a small reviewed cleanup PR. Do not change the existing drift workflow or
secrets. Parent records the actual result in Bot Log. No deployment has run from
this draft.
