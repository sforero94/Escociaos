# Request-contract release controls

Five new files prepare one reviewed release; they do not execute it. Prior consumed
workflows/controllers remain unchanged. The source is the published GitHub commit
`b52421e4be615cfbc797ec5f8652456c2a177bd3`, whose full tree matches the reviewed local
candidate `e5a2902ffba4e4e75d9f838fed3d64e8d0d7f8b2` byte for byte.

| Role | Source | Runtime tree | Full fingerprint |
| --- | --- | --- | --- |
| Candidate | `b52421e4be615cfbc797ec5f8652456c2a177bd3` | `016c43c35495a669003d2460f985204079a59ea5` | 113 files; `783232236fc7efa6544a58f14c487278b8554bee4dbd6c3a841bebba3115137a` |
| Recovery | `4104bbae172cd6d945625173bd75c7d5d9de4eb9` | `d6dd710e738d54586e05e400ac5069acd87bdf4a` | 112 files; `df07feb53dbff0322c1e9c49966226d7b38a708e7f55fecc9a95827357492700` |

Expected baseline receipt: ACTIVE v294, verify_jwt=false, import_map=false, updated
`2026-11-03T13:23:30.538Z` (1793712210538), bundle
`be3502b73ebb8c7da4f16616b77719cd5785f744b15108343cd4692635596a45`,
run41643826261/job125943827254, attempt1. This is an existing receipt, not a new live
observation. Recovery native download was observed as110 files with fingerprint
`68decdd991dee0283d41804bd1314c4ac3e357ca705691cb7ac26a1af2835377`.
Candidate native count/hash are unknown until its actual capture. Full Git source,
native download and deployment bundle are distinct evidence.

The new files copy the reviewed evidence-family pattern, changing only source and
recovery pins, role counts, baseline, names and confirmation strings. The shared
proof helper is unchanged. CLI2.122.0, TypeScript5.9.3, checkout action pin, fixed
function/project, deployment configuration, exact linked-project cache and bounded
latest-version cache validation remain fixed. Only the two unchanged, hash-pinned,
proved empty type-only modules may be absent from a native download. All remaining
source paths, bytes, wrapper/cache layout, imports and reconstruction must match.
Unknown entries, runtime omissions, changed type references and symlinks fail closed.

Manual main/attempt1, contents-read only, the shared backend concurrency group and
an explicit exclusive window remain mandatory. The existing management secret is
available only in the execution step. Before credentials, --source checks the current
runtime tree/fingerprint; full clean candidate/recovery checkout/config verification
occurs after the first metadata read and before capture/mutation. No permissions,
credentials, migrations, functions, provider settings or business data are changed.

Release confirmation: `DEPLOY_REQUEST_CONTRACT_WITH_V294_SOURCE_ROLLBACK`.
Two fresh matching recovery captures and stable exact metadata must precede one
deployment. Health, source/configuration and continued ownership must then agree.
A confirmed technical failure permits one owned rollback. Uncertain CLI/network/
metadata/ownership results stop without blind retry or rollback. HTTP200 health and
source proof do not establish useful or factually correct answers.

Functional rollback is a separate supervised dispatch with confirmation
`ROLLBACK_REQUEST_CONTRACT_TO_V294_SOURCE`, bound to the exact verified owned
release version/bundle/timestamp. It takes two fresh candidate captures and verifies
the fixed recovery before deployment. Recovery verifies source/configuration, not
an identical deployment binary, and does not remove history or application receipts.
The shared lock does not exclude external operators; ownership gates remain required.
The receipt is not cryptographically signed and filesystem rereads are not atomic
against a hostile concurrent local writer.

Local checks are synthetic: no main/CLI/fetch/secrets/business queries/model calls.
They must also pass in the clean runner layout using an explicitly installed compiler
outside root node_modules and an independently extracted recovery checkout:

```sh
PROOF_TYPESCRIPT=/absolute/proof/node_modules/typescript/lib/typescript.js \
RELEASE_TEST_BASELINE=/absolute/rollback-source/supabase/functions/make-server-1ccce916 \
node --test scripts/release-request-contract-once.checks.mjs
```

An explicit invalid compiler path cannot fall back. Exact-head CI, independent
review, release coordination and fresh source/metadata captures remain execution gates.
