# One read-only application-consumption diagnosis — draft

## Evidence and purpose

The approved release [41446616421](https://github.com/sforero94/Escociaos/actions/runs/41446616421), job125281202903, failed before its first successful capture receipt. Exact checkouts, CLI2.122.0 setup and 41 negative controls passed; the final controller exited1 with a generic catch. No deployment or rollback marker appeared. Independent metadata remained ACTIVE v288, unchanged source bundle/configuration/time. There were no retained artifacts. The old failure remains in history.

CLI setup announced latestv3.0.0 while the existing raw-layout guard pins the exact v2.122.0 cache value. A synthetic cache-only change reproduces that guard rejection. It is a hypothesis, not the observed raw inventory. This diagnostic does not normalize or accept a changed cache. An HTTP rejection, transport/setup failure or another source/proof guard remains possible.

## Fixed identities and unchanged guards

- Target project `ywhtjwawnkeqlwxbvgup`, function `make-server-1ccce916`, identity `9defb252-5ea2-463b-b91b-497e0a7fe582`.
- Candidate Git source `48a925cca797ac470832f07f6b1c6f7addc61a4b`, tree `1bc6254f47858acc63a3329ec219df296dddf6b4`, complete85 fingerprint `d611ff0a8864b05a0e960e21edb242219dfa07e2e64c11c8d8ada9d2cec2d4f5`.
- Recovery Git source `bf6a8a30dadcafdc9e27b3b9514d1b77f8d4ad58`, tree `14b02e7c564c8a05d6d26939f008111e759c1c65`, complete85 `a8ad35ddfb11af95909791ad96a08e9a90bde9c61bd2efde7bffdc54d44d6a02`, native83 `6e0027496d63d6b8c603e5590d0e4a4cd22a30df54173351ce2f4f797956bee4`.
- Fixed baseline ACTIVE v288, bundle `7c2583626cc7e7ecac531ef62a71e6d3581a4426be05bfd58df9b6218d978beb`, updated_at `1793554013172`, verify_jwt=false, import_map=false; entrypoint and function identity remain exact.

No runtime, SQL, provider, credential, permission or shared capture-helper change. Existing release controllers and their two-capture/deployment/owned-rollback gates are untouched. This separate reader does not import the release driver. It checks both pinned Git sources, clean checkout/tree/configuration/fingerprints, current controls runtime and initial baseline; obtains only the first capture; runs the unchanged exact raw/source/cache inventory, type-only AST/reference proof and reconstructed85/native83 equality; then requires unchanged baseline metadata. Unknown or changed data fails closed. One capture is sufficient for this read-only diagnosis because no deployment path exists. It is not a substitute for two fresh captures before any future release.

## Manual workflow and output boundary

`.github/workflows/diagnose-application-consumption-once.yml` requires manual main first attempt with `DIAGNOSE_APPLICATION_CONSUMPTION_V288_ONLY`. It has contents:read only, shared backend concurrency and no persisted checkout credentials. Sources and checkout action are immutable; Supabase CLI2.122.0 and TypeScript5.9.3 remain pinned. The existing management secret appears only in the final reader step; it is not forwarded to Git or any other recipient. No new permissions, accounts, secrets, migrations, endpoint or model call.

The only remote operations are one fixed-target metadata GET before/after and a fixed CLI function download. CLI arguments cannot select another operation/project/function. There is no deploy/rollback operation in the controller or reachable release import. Setup, metadata, source, first download, proof, metadata-after and cleanup emit fixed stage/start/ok/failure events. Error output is limited to allowlisted codes and bounded numeric HTTP/CLI statuses. Messages, stacks, URLs, headers, tokens, API/source bodies and subprocess output are never reported. Unknown exceptions stay UNCLASSIFIED; a failure is never approval, including falsy thrown values.

Private downloaded/reconstructed source exists only in a runner-temporary directory. Cleanup is always attempted and reported even on setup/proof/logging failures; a cleanup failure fails the job while preserving an earlier failure. No source artifact is uploaded or retained intentionally. Ordinary ephemeral runner disposal remains the final isolation boundary if deletion fails. Successful diagnosis proves technical source/configuration consistency, not compiled-binary identity or answer quality.

## Parent review and one execution

Owner approval covers publication, conditional integration and ONE diagnose-only execution after review/tests. This preparation stops at draft and parent independent review; no merge or dispatch here. Parent must revalidate exact head/main/checks, unchanged pins and v288 baseline before the approved integration/run. There is no release retry, rollback authority or permission to fix the cache from a hypothesis. A guard rejection may deliberately leave the diagnostic run red while providing a safe stage/code. Do not rerun uncertain outcomes. Stage-only evidence may not identify which raw entry differed; any broader output or source retention needs its own review.

The v288 online campaign remains six useful, one coverage-inconclusive, one source-answerable failure and eight unrun. No new online sends or production writes occur in preparation. Focused/full final-content tests, independent adversarial review and exact-head CI receipts belong to the candidate handoff; synthetic checks do not establish online acceptance.
