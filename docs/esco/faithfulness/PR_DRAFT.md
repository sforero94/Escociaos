# Existing draft363: closed synthetic fixture adapter on current main

A replay must reject unexpected tool calls and incomplete fixture consumption instead of silently falling through or accepting cleared diagnostics. This Node-only synthetic adapter matches exact scenario/turn/tool/canonical arguments, snapshots its input and retains sticky invalidity. It preserves opaque errors/partial/stale/missing evidence. Both turn and whole-case finalizers are mandatory for consumers.

Refresh base13ef1f4ded1d0505d8d9b5b823314a65c891f2fe; original reviewed head2f996c7cacebab5a05d03ce5fbd07590b0e67a19. Fixture implementation/test blobs remain identical. Only main integration and three tracker reconciliations are new; all unrelated371/security/PO/release work is retained. No372 dependency, new runtime code or private fixtures.

Full candidate tests/types/lint/build, independent adversarial review and exact-head CI must pass before parent readiness review. Historical40 fixture/4797 full tests are not fresh validation. Candidate SHA and actual results belong to the handoff.

No network, provider, environment, business data or production calls. Hashes prove consistency of supplied synthetic content, not truth/provenance. This adapter alone does not prove actual-loop isolation or calibration; those remain later scopes. Measurementv1.1 and immutable labels remain unchanged.

Order:363 first; reconcile/retest364 after363 lands, then366 after364. Never merge the old offline integration-base. This task stops before ready/merge. Rollback is an offline source/test/docs revert, no schema/backend rollback.

Business one-liner: Makes offline evaluation fail visibly when its synthetic evidence is missing, repeated or mismatched.

Local refreshed-candidate checks:40 fixture tests;208 evaluator tests/types/focused lint;5034 full tests/227 files, zero skips; full lint0 errors/907 existing warnings; build and whitespace passed. Independent review passed25 additional synthetic assertions and verified original blob parity. CI must validate the new remote merge head; historical2f996c7 results do not substitute.
