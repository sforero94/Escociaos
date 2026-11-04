# P2-A local regression evidence

Run from the repository root with the existing installed lockfile dependencies:

```sh
npm test -- --maxWorkers=4
npm run typecheck
npm run lint
./node_modules/.bin/eslint src/utils/esco2 src/__tests__/esco2P2*.ts vite.config.ts
./node_modules/.bin/eslint --no-ignore supabase/functions/esco-consultas/manejador.ts
./node_modules/.bin/vite build --outDir /private/tmp/esco2-p2-build-final --emptyOutDir
git diff --check
```

The full suite includes the five P2 files and five existing focused labor suites.
P2 tests deny network fetch and use scripted LLM responses plus synthetic PGlite
data/RLS. No paid `scripts/esco2/e2e-local.ts` import or production read is needed.
Do not run the frozen P1 recovery writers against the repaired runtime: they
overwrite historical result files and expect baseline defects. Default discovery
excludes those writers, documents, generated builds and the retired archive.

`validation.json` records aggregate results, source hashes, the 34-file preservation
check, frozen five-file manifest and evidence limitations. The full final run
passed 7,298 tests / 301 files; 108 P2 checks comprise 93 independent QA and 15
backend unit checks. These are regression checks, not independent business cases
or an acceptance score. Eight copied-response mutations test the QA oracle,
separately from 13 actual runtime planner/publication attack checks.

Read [the result report](../../../docs/esco2/p2-result-2026-11-04.md),
[scope](../../../docs/esco2/p2-runtime-scope-2026-11-04.md) and
[independent QA record](../../../docs/esco2/p2-qa-evidence-2026-11-04.md).
P3 and production/publication actions require separate authorization.
