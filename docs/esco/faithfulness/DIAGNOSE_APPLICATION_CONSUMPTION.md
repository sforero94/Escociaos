# Read-only application-consumption mismatch classification — draft

## Evidence and purpose

The approved release [41446616421](https://github.com/sforero94/Escociaos/actions/runs/41446616421), job125281202903, failed before its first successful capture receipt. Exact checkouts, CLI2.122.0 setup and 41 negative controls passed; the final controller exited1 with a generic catch. No deployment or rollback marker appeared. Independent metadata remained ACTIVE v288, unchanged source bundle/configuration/time. There were no retained artifacts. The old failure remains in history.

The first read-only diagnosis [41452881917](https://github.com/sforero94/Escociaos/actions/runs/41452881917), job125302160494, passed setup, initial metadata, Git/config checks and download, then rejected first proof with RAW_LAYOUT_REJECTED. Cleanup succeeded; no artifacts were retained. No second metadata guard ran. An independent afterward observation matched v288, which does not prove a continuous snapshot or the older release failure cause. This consumed first diagnosis is not rerun.

CLI setup announced latestv3.0.0 while the existing raw-layout guard pins the exact v2.122.0 cache value. A synthetic cache-only change reproduces that guard rejection. It is a hypothesis, not the observed raw inventory. The second diagnostic adds classification, not normalization or acceptance of a changed cache. An HTTP rejection, transport/setup failure or another source/proof guard remains possible.

## Fixed identities and unchanged guards

- Target project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`, identity `9defb252-5ea2-463b-b91b-497e0a7fe582`.
- Candidate Git source `48a925cca797ac470832f07f6b1c6f7addc61a4b`, tree `1bc6254f47858acc63a3329ec219df296dddf6b4`, complete85 fingerprint `d611ff0a8864b05a0e960e21edb242219dfa07e2e64c11c8d8ada9d2cec2d4f5`.
- Recovery Git source `bf6a8a30dadcafdc9e27b3b9514d1b77f8d4ad58`, tree `14b02e7c564c8a05d6d26939f008111e759c1c65`, complete85 `a8ad35ddfb11af95909791ad96a08e9a90bde9c61bd2efde7bffdc54d44d6a02`, native83 `6e0027496d63d6b8c603e5590d0e4a4cd22a30df54173351ce2f4f797956bee4`.
- Fixed baseline ACTIVE v288, bundle `7c2583626cc7e7ecac531ef62a71e6d3581a4426be05bfd58df9b6218d978beb`, updated_at `1793554013172`, verify_jwt=false, import_map=false; entrypoint and function identity remain exact.

No runtime, SQL, provider, credential, permission or shared capture-helper change. Existing release controllers and their two-capture/deployment/owned-rollback gates are untouched. This separate reader does not import the release driver. It checks both pinned Git sources, clean checkout/tree/configuration/fingerprints, current controls runtime and initial baseline; obtains only the first capture; runs the unchanged exact raw/source/cache inventory, type-only AST/reference proof and reconstructed85/native83 equality; then requires unchanged baseline metadata. Unknown or changed data fails closed. One capture is sufficient for this read-only diagnosis because no deployment path exists. It is not a substitute for two fresh captures before any future release.

## Manual workflow and output boundary

`.github/workflows/diagnose-application-consumption-once.yml` requires manual main first attempt with `DIAGNOSE_APPLICATION_CONSUMPTION_V288_CLASSIFY_ONLY`. It has contents:read only, shared backend concurrency and no persisted checkout credentials. Sources and checkout action are immutable; Supabase CLI2.122.0 and TypeScript5.9.3 remain pinned. The existing management secret appears only in the final reader step; it is not forwarded to Git or any other recipient. No new permissions, accounts, secrets, migrations, endpoint or model call.

The only remote operations are one fixed-target metadata GET before/after and a fixed CLI function download. CLI arguments cannot select another operation/project/function. There is no deploy/rollback operation in the controller or reachable release import. Setup, metadata, source, first download, proof, metadata-after and cleanup emit fixed stage/start/ok/failure events. A new mismatch/classified event contains only a fixed category and 17 bounded numeric counters; no hashes are emitted, including cache hashes. The existing management credential remains broad; read-only behavior is enforced by the reviewed command graph, not new permission narrowing. Error output is limited to allowlisted codes and bounded numeric HTTP/CLI statuses. Messages, stacks, URLs, headers, tokens, API/source bodies and subprocess output are never reported. Unknown exceptions stay UNCLASSIFIED; a failure is never approval, including falsy thrown values.

Private downloaded/reconstructed source exists only in a runner-temporary directory. Cleanup is always attempted and reported even on setup/proof/logging failures; a cleanup failure fails the job while preserving an earlier failure. No source artifact is uploaded or retained intentionally. Ordinary ephemeral runner disposal remains the final isolation boundary if deletion fails. Successful diagnosis proves technical source/configuration consistency, not compiled-binary identity or answer quality.

## Classification and unchanged acceptance

The controller first reads a bounded inventory and applies the original `validateRawInventory` function to that same in-memory snapshot. Classification is observational: the original rejection is always rethrown even if an observer returns approval or throws. If preflight passes, the original full `reconstructCapture` pipeline and final proof still run without modification. The shared acceptance/cache/type/source helpers and all release controls remain byte-identical. The diagnostic reference itself must satisfy the unchanged guard before any category is trusted.

Categories are fixed:

- CACHE_ONLY: differences are confined to the two known cache records; all compared native source, wrapper, seeded-config and representation fields match. Fixed latest/link changed/missing counters identify those known metadata slots without printing a path or value. This is not approval of either cache value.
- SOURCE_ONLY, WRAPPER_ONLY or CONFIG_ONLY: changed/missing expected native files, known structural entries, or seeded local configuration respectively. MIXED_MISMATCH means multiple recognized buckets differ.
- UNKNOWN_LAYOUT covers unexpected entries and any additional representation/key-order difference, even alongside a cache change. UNSAFE_LAYOUT covers unsafe paths, symlinks or special files. MALFORMED_LAYOUT covers invalid metadata, duplicate paths, sparse inventories, accessors or nonplain object/array behavior. LIMIT_EXCEEDED and REFERENCE_INVALID prevent unsupported inputs from producing cache-only confidence.
- RAW_MATCH means only that preflight's raw guard accepted its snapshot. It is not a reconstructed proof. The original full helper reads again; later failures remain failures, with a separate WRAPPER_LAYOUT_REJECTED code for a reconstruction-wrapper failure. No filesystem/database snapshot guarantee is implied.

Counters have fixed keys and integer bounds 0..512: cache changed/missing; known latest/link changed/missing flags; native source changed/missing; known wrapper changed/missing; seeded config changed/missing; unexpected/unexpected-source; representation changed; unsafe/malformed. Invalid or limited inventories do not claim exhaustive counts. Unexpected names, file contents, exception text and actual digests never enter output. Known cache reference hashes are copied only from the existing nonsensitive guard metadata and self-checked against that authority; actual source/cache/config hashes are compared internally only.

Defensive inherited-serialization controls reject nonplain inputs without invoking their methods; they are not evidence of a live capture cause. The adversarial cache-plus-source-key-order regression is explicitly covered: it must be UNKNOWN_LAYOUT, never CACHE_ONLY. A classifier result describes this new observation, not the previous diagnosis or historical release. The new output still may require a separate reviewed repair; it never opens a deployment path.

## Parent review and one execution

Owner approval covers publication, conditional integration and ONE additional diagnose-only execution after review/tests. The unique new confirmation cannot select the consumed first diagnostic. This preparation stops at draft and parent independent review; no merge or dispatch here. Parent must revalidate exact head/main/checks, unchanged pins and v288 baseline before the approved integration/run. There is no release retry, rollback authority or permission to fix the cache from a hypothesis. A guard rejection may deliberately leave the diagnostic run red while providing a safe stage/code. Do not rerun uncertain outcomes. Stage-only evidence may not identify which raw entry differed; any broader output or source retention needs its own review.

The v288 online campaign remains six useful, one coverage-inconclusive, one source-answerable failure and eight unrun. No new online sends or production writes occur in preparation. Focused/full final-content tests, independent adversarial review and exact-head CI receipts belong to the candidate handoff; synthetic checks do not establish online acceptance.
