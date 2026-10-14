# Combined writer races — October14

`combined-writer-races.py` runs the original31combined assertions and nine additional races on the complete verified local replay with all nine candidates installed. Four external private-export digests bind the graph; candidate, base-runner and extension hashes bind the evidence. No private definitions/rows are published. Evidence: `combined-writer-races.json`,49assertions with cleanup verified.

Each race first observes the winning session in PostgreSQL's sleep barrier after its write and full-state capture. The contender must then be observed waiting on a database lock. Missing either barrier fails the harness. Sleep provides a bounded lock-holding window; it is not accepted as proof of ordering. Each contender must fail with the expected source-owned or FK diagnostic, and final state must equal the snapshot captured inside the winning transaction. That snapshot includes every selected public/respaldos table and every protected candidate table. The privileged test coordinator resets its simulated role solely to capture those inaccessible proof tables; callers receive no extra privileges. Raw local source edits simulate competing writers and are not ordinary-role authorization certificates.

The nine observed races are:

1. Purchase posting wins; an old physical stock adjustment refuses after waiting.
2. Manual stock posting wins; a catalog edit retains its full original and refuses.
3. A daily source quantity edit wins; closure refuses its stale review rather than recalculating silently.
4. A planned-lot reference arrives; unused-plan deletion refuses and preserves it.
5. Animal identity changes; a pending treatment post refuses its old full animal snapshot.
6. Telegram registration relinks; committed native recovery refuses the old actor proof.
7. A profile is deactivated; committed manual-stock receipt recovery refuses disclosure.
8. A direct pending-step execution wins; clinical undo preserves the executed step and refuses its old review.
9. Delivered Gerencia undo wins; a delayed direct child insert waits, then fails its real FK without recreating a step or changing either receipt.

The base runner exposes an optional follow-up and its existing snapshot SQL so extensions reuse the exact graph/fixtures and capture winning state without copying the mutation suite. The default31-case runner behavior is unchanged. No candidate or production SQL changes belong to this unit. Broader Ronda proposal/delivery, every source writer, runtime resource bounds, hosted Auth/Storage and recovery remain separate acceptance requirements. This selected concurrency evidence does not certify all legacy/direct writers.

Next unit: effective table/column/function reachability and current caller inventory before coordinated retirement. Treatment alert responders still update steps directly, and migration177's invoker confirmation API needs its underlying table rights; do not remove those rights without a compatible caller/API cutover. Closure/plan runtime guards also still require the pre-retirement stock grants and must be reconciled before stock DML revocation.

Reproduce:

```sh
python3 scripts/security/combined-writer-races.py \
  /workspace/escociaos-security-control/schema-evidence \
  --runtime /tmp/escocia-pg17-runtime/package/native \
  --client /tmp/escocia-pg-client/node_modules/pg/lib/index.js \
  --private-diagnostics /tmp/escocia-writer-races-final-diagnostics-private.txt \
  --output docs/security-integrity/combined-writer-races.json
```

Validation:49native assertions PASS (31base +18winner/refusal checks for9observed lock races),29Python tests PASS, lint PASS (876existing warnings), typecheck PASS and source/hash/cleanup checks PASS. The default full application run completed250files with5,261passing tests and2five-second timeouts (chatRequestBounds/exportarPlanillaChequeoRoundTrip); a focused single-thread run passed all21tests covering both timed-out cases plus exportarInventario. A bounded-fork rerun also had2timing failures; slower thread/fork attempts were interrupted after worker-termination delays/no useful progress. No fresh all-green full application run is claimed. No application source, committed runner configuration or application deadline changed. Logs /tmp/escocia-writer-races-{lint,typecheck,tests,tests-bounded,targeted,python-tests,final}.log; later diagnostic attempts have tests-single-thread/tests-resource-bounded/tests-final/tests-verified suffixes. CI for the new commit remains pending.
