# Calibration adjudication ledger — v1

Prepared 2026-10-28. Status: **blocked for review**, not an approved rubric.
Baseline dataset SHA-256: `328ce0394708ea04b0ba8b786a76a5060b42ab3229096e92b591235c8a42933c`.
The uploaded dataset remains immutable. No original label, criterion, or verdict was changed.

## Evidence inspection

At branch base `7771185`, neither `evals/esco/golden/` nor
`evals/esco/runs/2026-10-27-*` exists in this checkout. A bounded file search
under `/workspace` and `/tmp` found no golden JSONL or calibration artifacts.
BASELINE.md provides aggregate results and case IDs, not individual human labels,
approved criteria, answers, or snapshots. Production credentials do not recover
historical evidence. No production query or paid calibration was attempted.

The old labels and rubric below are **unavailable**, not inferred from the aggregate.
Each case is excluded from enforced gates pending its evidence and D01 review.
These are temporary gate exclusions, not final adjudications or task completion.

| Case | Old label / rubric | Evidence available | Proposed interpretation / next review | Reviewer decision | Affected gate |
|---|---|---|---|---|---|
| ESCO-GS-001 | unavailable | BASELINE disagreement list only | Compare original human label with exact approved criteria and answer | pending D01; no reviewer attribution | disputed calibration / release assertions |
| ESCO-GS-030 | unavailable | BASELINE disagreement list only | Determine whether discrepancy is dataset correction or a stricter new rubric | pending D01 | disputed calibration / release assertions |
| ESCO-GS-039 | unavailable | BASELINE disagreement list only | Inspect claimed false negative without assuming this case is its source | pending D01 | disputed calibration / release assertions |
| ESCO-GS-040 | unavailable | BASELINE disagreement list; live retrieval warning | Recover historical tool responses and scope before asserting numerical truth | pending D01 | historical animal-sales reference |
| ESCO-GS-042 | unavailable | BASELINE disagreement list only | Recover period, coverage and historical context before deciding drift | pending D01 | historical reference / release assertions |
| ESCO-GS-054 | unavailable | BASELINE wording concern only | Distinguish acknowledgement/proposal from assertion of a completed durable write; require actual write evidence for the latter | pending D01; proposal only | memory wording rubric |
| ESCO-GS-056 | unavailable | BASELINE reports duplicate criterion IDs after retries | Keep malformed judge output unavailable/inconclusive; never guess pass/fail | no new human verdict; existing parser behavior retained | excluded from conclusive calibration denominator; visible in overall coverage |

The baseline does not map each disagreement category to a specific case. The
review questions above do not claim that mapping.

## Review procedure and historical drift

Recover the approved JSONL from authorized private storage, verify its hash, and
recover the corrected original-answer report and compatible snapshots. Attach
private references, exact old label/criteria, evidence date, and proposed change
for each row. An attributed reviewer must record decision, reason, affected IDs,
and a new rubric/reference version; retain the original alongside it.

Historical drift means that later source data can differ from answer-time data.
It permits an explicit comparability limitation; it does not excuse an unsupported
claim or authorize replacing historical truth with today's query result. Without
compatible evidence, keep the case unresolved and outside enforced gates.
Missing historical summaries alone do not prove a tool failure. Explicit errors
and exhausted execution remain failures, even when summaries are incomplete.
Existing judge prompt/parser tests check these distinctions; their success does
not resolve D01. Original-answer calibration remains unavailable until both the
approved dataset and an authorized one-time budget are available.

## Independent fallback

Continue P0-03 with synthetic controls. Synthetic evidence must state its origin;
it cannot resolve these disputes or establish historical expected numbers.
P0-03-a is the closed HTTP transport foundation; P0-03-b must add tool/argument/
scenario/turn fixture matching, the 12–15 scenario pack, provenance manifests,
and the documented real-model command before P0-03 can be done.
