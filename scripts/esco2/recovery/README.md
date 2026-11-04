# P0/P1 offline comparison

Run from the repository root with the existing lockfile dependencies installed:

```sh
npm test -- scripts/esco2/recovery
./node_modules/.bin/tsc --noEmit -p scripts/esco2/recovery/tsconfig.json
./node_modules/.bin/eslint scripts/esco2/recovery
node --experimental-strip-types scripts/esco2/recovery/measure.ts
```

The tests deny network `fetch`, inject all planner responses, verify the P0 SHA-256
manifest, and use fresh synthetic rows only. They never import the paid
`scripts/esco2/e2e-local.ts` campaign. No application, function, deployment or
production configuration imports this experiment.

Read the frozen semantics in
[p0-semantic-contract-2026-11-04.md](../../../docs/esco2/p0-semantic-contract-2026-11-04.md)
and the independent rubric in
[p0-qa-rubric-2026-11-04.md](../../../docs/esco2/p0-qa-rubric-2026-11-04.md).
The fixed denominator is 16 scenarios. Supplementary source and isolation controls
are reported separately. Repeat runs remain measurements of those same scenarios.

The baseline invokes the unchanged consultation core with scripted planning and
its existing deterministic fallback. Repair retains the existing numeric result
with the minimum semantic sidecar. Redesign converts the same calculations into
bound claims before factual rendering. Shared source checks and arithmetic count
equally for both alternatives.

Stage C uses the real authorization function and fixed source reader through the
synthetic PostgreSQL RLS harness. Its local candidate wrapper is a test seam.
The actual HTTP handler has a separate scripted baseline control. This does not
prove candidate HTTP integration, natural-language planning, real JWT verification,
production completeness, web behavior, generalization or product acceptance.

Evidence lives under `qa/`: `freeze.json`, `results.json`, `rls-results.json`, and
timestamped comparison runs in `iterations/`. Generated evidence contains only
synthetic IDs, aggregate judgments, timings and code hashes.

The benchmark stores 100 timing samples per scenario after 10 warmups. It reports
the 11 fully substantive scenarios separately from the partial response and the
unknown/clarification cases. Repair timing excludes its QA-only claim export;
redesign timing includes the claim projection required by its renderer. Both
timings exclude the additional source re-execution in `validateCandidate`.
Microsecond differences are not evidence of a useful server latency advantage.

P0/P1 authorize this experiment only. Stop before P2, runtime integration, paid
calls, production reads, migrations, deployment, commit or push.
