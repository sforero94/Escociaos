# Evidence-family release controls — local review preparation

These five new files prepare one reviewed release. They do not authorize publication,
dispatch or deployment. Consumed selected-core controllers and workflows stay unchanged.
The runtime source is published as PR403, source
`4104bbae172cd6d945625173bd75c7d5d9de4eb9`. Its complete tree is byte-identical to
the reviewed local candidate1b9d11c. The controller pin is the actual published SHA;
operational gates still require exact-head CI, current ownership and fresh captures.

| Role | Source commit | Runtime tree | Full source |
| --- | --- | --- | --- |
| Candidate, published PR403 | `4104bbae172cd6d945625173bd75c7d5d9de4eb9` | `d6dd710e738d54586e05e400ac5069acd87bdf4a` | 112 files; `df07feb53dbff0322c1e9c49966226d7b38a708e7f55fecc9a95827357492700` |
| Fixed recovery | `6ed67f5cb8b629de17618a3b100747b00ea856a6` | `264c2c6b42b4eb2d443350ebacbcad5df5b5f6f1` | 109 files; `59d413c9e4a9a2cb1ee08d878e9641afa5b192e5a16e0850c6172cb50855f27d` |

Expected baseline: version293, ACTIVE, verifyJWT=false, bundle hash
`73c94422f63389427fd6063ad6e101fb06112f85e7eb1c399e75a47ac360f65f`,
updated `2026-11-03T02:03:42.413Z`, from run41563670705/job125679935519.
These are parent-observed receipt pins, not a new live observation. The deployment
bundle hash is distinct from the full Git/source fingerprints.

Recovery native download is explicitly bound to the already observed 107 files and
hash `bd22e3f697aa8a31c7e13df8e5d145ec89a80691a00ae0ebfcf00d663f5192b8`.
This pin is not inferred from the full recovery count. Candidate native count/hash
remain unobserved before deployment. The controller records the actual capture and
requires exact source reconstruction: only zero to two specifically proven empty-type
modules may be absent. It never labels a guessed candidate count as downloaded evidence.

The new controller, checks and capture helper are
`release-evidence-families-once.mjs`, `release-evidence-families-once.checks.mjs` and
`release-evidence-families-capture.mjs`; the workflow has the corresponding family name.
CLI2.122.0, TypeScript5.9.3, target/project, minimal deployment configuration, linked
project cache, bounded latest-release cache tag policy and source/type hashes remain
fixed. Every raw path/type/size/hash, wrapper and cache artifact must match. Unknown
files, runtime omissions, changed type-only references, symlinks and invalid compilers
fail closed. Only proven missing modules are restored into a separate clean layout;
the raw capture is not rewritten. Native and reconstructed evidence remain distinct.

Execution guards preserve the reviewed controller pattern: manual main dispatch,
first attempt, explicit exclusive backend window, a shared backend concurrency group,
contents-read only, fixed checkout action commit, no Actions-read permission and one
step-scoped management secret. The pre-credential source check validates the controls
runtime tree/fingerprint. Full checkout/config/source verification occurs after the
first metadata read but before capture/mutation. The template has no absolute timing
input; its existing exclusive-window input and twenty-minute job timeout are preserved.
The workflow lock does not exclude operators outside that concurrency group.

Release requires confirmation `DEPLOY_EVIDENCE_FAMILIES_WITH_V293_SOURCE_ROLLBACK`.
Two fresh recovery captures and metadata checks precede the one deployment. Health,
source reconstruction and continued ownership must then agree. A confirmed technical
failure permits at most one owned rollback. Uncertain CLI, network, metadata or ownership
outcomes stop without retry or automatic rollback. A healthy HTTP200 response does not
establish functional acceptance or physical/business correctness.

Functional rollback remains a separate supervised `rollback` dispatch with confirmation
`ROLLBACK_EVIDENCE_FAMILIES_TO_V293_SOURCE`. Its version/bundle/timestamp inputs must
come from the verified owned release receipt and match current metadata. They select no
source pin. It takes two candidate captures, verifies fixed recovery/config/type proof,
deploys that recovery and verifies its health/source/new ownership. The receipt is not
cryptographically signed and does not protect against an authorized malicious operator.
Filesystem rereads do not provide an atomic snapshot against a hostile local writer.

Local checks use synthetic operations only; they never invoke main, CLI, fetch, secrets,
business reads or a model. CI installs the proof compiler outside the checkout and sets
`PROOF_TYPESCRIPT` explicitly; an invalid explicit path cannot fall back. It also sets
`RELEASE_TEST_BASELINE` to the independent recovery checkout's runtime directory. A clean
local layout without node_modules must pass with those two explicit paths:

```sh
PROOF_TYPESCRIPT=/absolute/proof/node_modules/typescript/lib/typescript.js \
RELEASE_TEST_BASELINE=/absolute/rollback-source/supabase/functions/make-server-1ccce916 \
node --test scripts/release-evidence-families-once.checks.mjs
```

Exact-head CI, operational coordination, fresh captures and independent review
remain required gates before execution. No production, provider/model call, external write,
new permission, push or deployment was performed by this preparation. A local commit
may preserve the reviewed files; it does not publish or execute the controller.
