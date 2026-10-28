# Baseline and evidence map

## Provenance

Initial implementation base: `14271f104fb0be1b0d2fffc1f9e706e4c4e83a70`, from `claude/gifted-euler-t8h8t2`. Planning branch: `codex/esco-faithfulness-plan`. Existing evaluation-only judge fixes are carried in a separate prerequisite commit; production edge code is unchanged at plan creation.

Evaluation recorded on 2026-10-27 UTC. Dataset SHA-256: `328ce0394708ea04b0ba8b786a76a5060b42ab3229096e92b591235c8a42933c`. It has 59 cases, 56 included, with 17 explicitly marked non-replayable against current data. Esco used `google/gemini-3-flash-preview`; the user-selected judge was `anthropic/claude-sonnet-4.6`. These are measured baseline model IDs, not permanent model-selection decisions.

| Run | Outcome | Interpretation |
|---|---|---|
| Corrected original-answer calibration | 10 pass / 45 fail / 1 inconclusive | Human agreement 28/33 = 84.8%; 23 excluded from that comparison |
| Live smoke, ESCO-GS-040 | Infrastructure completed; quality failed | Two attempts and full run had varying counts; incomplete legacy retrieval was visible |
| Full live, one primary run per case | 8 pass / 46 fail / 2 inconclusive | 8/54 conclusive = 14.8%; 8/56 overall = 14.3% |
| Live historical-change subset | 2 pass / 15 fail | Not proof of model regression |
| Live remaining subset | 6 pass / 31 fail / 2 inconclusive | Absence of a replay warning is not proof data stayed unchanged |

28 live cases had hard deterministic failures; 43 had semantic failures; groups overlap. Execution errors in ESCO-GS-012 and ESCO-GS-014 exhausted the model tool loop. They count as unsuccessful service outcomes even though the harness labels them inconclusive. All 54 completed live answers had valid judge output. No Supabase write attempts were recorded. The harness runs the shared loop in process; it does not prove deployed web/Telegram endpoint behavior.

Corrected calibration ESCO-GS-056 remained invalid after targeted judge retries (duplicate criterion IDs). The earlier original-answer run before historical-summary correction is unsuitable as a baseline. Missing optional weather/search credentials affected ESCO-GS-025/026/055/057. Do not interpret these as proof the tools cannot work when correctly configured.

## Regression seeds

| Case IDs | Observed failure / intended test |
|---|---|
| 004 | Correct-looking total with incorrect lot attribution: value matching alone is insufficient |
| 005 | Work records treated as evidence of formal task closure |
| 009, 048 | Unresolved alias or entity ambiguity treated as established identity |
| 012, 014, 044 | Exhaustion and duplicate calls; 044 recorded 194 interactions, 190 duplicate-query errors, four unique signatures |
| 013, 015, 016, 017 | Metric-definition ambiguity, application detail routing, unsupported discrepancy explanation |
| 021, 024, 045 | Coverage, missing measurements, and invented observations |
| 028, 033, 037, 040 | Denominators, weighted yield, derived prices, and annual aggregate correctness |
| 032, 058 | Source attribution and unsupported causal conclusions |
| 036 | Inventory enum/text filter produced PostgreSQL 42883 |
| 041 | Same animal's fact changed across consecutive turns |
| 054, 055 | Memory acknowledgement rubric and no-data-query commands |

IDs in this table abbreviate `ESCO-GS-NNN`. Freeze reviewed evidence before turning these into numerical release assertions.

## Calibration decisions requiring review

ESCO-GS-001, 030, 039, 040, 042 disagree with comparable human labels. They include missing rubric requirements, an apparent false negative, and historical-data ambiguity. Preserve original labels and distinguish dataset correction from a stricter new rubric. ESCO-GS-054 separately needs a precise distinction between acknowledging a request and asserting a completed write.

## Current source map

- `evals/esco/README.md`, `run.eval.ts`, `lib/ejecutor.ts`: runner, read-only guards, time handling, current reports.
- `src/utils/escoEvals/{golden,juez,deterministico,reporte,veredicto,tipos}.ts`: dataset parsing, judging, score aggregation. Number anchors do not establish claim attribution.
- `src/__tests__/escoEvals*.test.ts`: existing harness checks.
- `src/supabase/functions/server/chat.tsx`: shared tool loop, forced initial tool call, three-round limit, evidence metadata, web chat persistence/SSE.
- `src/supabase/functions/server/telegram/bot.ts`: shared-loop integration and Telegram persistence; currently no event callback at the free-text call site.
- `src/utils/escoConsultas.ts`: canonical consultation implementation; inspect its tool registry before adding alternatives.
- `scripts/sync-esco-consultas.py`: synchronizes consultation copies and mirrored chat source.
- `supabase/functions/make-server-1ccce916/`: deployment mirror, not a separate implementation.
- `.github/workflows/verificacion-pr.yml`: ordinary PR validation; paid evaluation jobs must be explicit and protected.
- `src/sql/migrations/`: verify live schema, available migration numbers, RLS and ledger before schema work.

## Private artifacts

Private JSONL, tool snapshots, and generated reports stay outside Git. In the originating workspace only, reports are under `/workspace/Escociaos/evals/esco/runs/2026-10-27-*` and the approved dataset is under `evals/esco/golden/`. These paths may disappear in a new session/environment. Use approved private storage or ask for the approved upload when needed. Do not fabricate fixtures from the summary above.

The committed prerequisite judge fix distinguishes absent historical summaries from actual errors, requests structured output with criterion IDs/counts, and adds validation feedback on retry. It improved calibration but does not guarantee provider schema compliance. Baseline checks passed 93 tests with the private dataset present; two dataset-specific tests skip when it is absent.
