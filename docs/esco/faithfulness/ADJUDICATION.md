# Calibration adjudication ledger — v1

Prepared 2026-10-28. Initial v1 status: blocked for review. **Current: v2 owner decisions recorded; external calibration disclosure approval pending.**
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


## v2 — Owner adjudication, 2026-10-28 America/New_York

Source: Santiago Forero's direct chat response to the six case review questions.
The uploaded JSONL matches the baseline SHA-256 above (59 cases, 56 included).
Its original answers, criteria, human labels, and reference notes were inspected.
The earlier corrected calibration report and historical tool payloads remain absent;
we do not claim to have recovered the judge's old disagreement reasoning.

| Case | Uploaded old label / rubric concern | Attributed owner decision | v2 evaluation disposition |
|---|---|---|---|
| 001 | correct; rubric also demands the numerical lot comparison | “partial” | New adjudicated label partial; comparison remains required. Original label retained. Binary rubric failure does not mean the useful part disappears. |
| 030 | incorrect; requires actionable proposals beyond a ranking | “incorrect” | Retain incorrect and actionable-proposal requirement. Missing historical motor output prevents a numerical release assertion. |
| 039 | correct; historical inventory differs from later reference | “yes, data has changed since the golden set was extracted” | Preserve historical correct label; evaluate purchase separately. Exclude inventory from enforced historical comparison pending compatible evidence. |
| 040 | correct; rubric demands explicit beef/dairy scope statement | Context can suffice; state scope only when ambiguous | Revise scope criterion conditionally; retain numerical criteria. No unconditional wording requirement. |
| 042 | correct with noted freshness omission; rubric requires warning before trend | “correct with warning, no need to be super stringent” | Retain correct; freshness omission is a warning, not a standalone hard failure. Do not invent recent measurements. |
| 054 | incorrect; rubric prohibits acknowledgement as well as completion wording | “yes” to permitting acknowledgement with pending confirmation, while forbidding completed persistence claims | Revise wording criterion: acknowledgement allowed; ambiguous “Hecho” in original remains incorrect. Confirmation/persistence contract unchanged. |
| 056 | correct human label; earlier judge output malformed | No new human verdict requested or inferred | Keep original correct label; malformed judge output unavailable. Missing follow-up answer prevents an enforced full-conversation recovery assertion. |

Rubric version: `owner-2026-10-28-v2`. `aplicarAdjudicacion` creates a separate
structured clone for the focused campaign. It must only be used with the
hash-pinned source; the original runner/dataset defaults remain unchanged.
The 039 view removes incompatible later inventory and assesses the purchase only.
For 042, report the warning separately rather than converting it into a hard failure.
For 056, assess primary-answer criteria only if available; record the missing
follow-up requirement as unavailable rather than pretending it was met.

Historical drift is an evidence-comparability limitation, not a blanket numeric
tolerance. The uploaded label can be retained without claiming independent
verification of unrecovered inventory/motor payloads. These explicit exclusions
satisfy adjudication disposition, not historical replay readiness.

### Paid campaign authorization and dispatch state

The owner authorized **$1 total**, including retries, for a focused seven-case
original-answer calibration. This is a one-time authorization, not a schedule,
production rollout, or general campaign budget. D05 remains open for other work.
Planned model: `anthropic/claude-sonnet-4.6` via OpenRouter. Public pricing read
2026-10-28: $3/million input tokens and $15/million output tokens.

Automatic approval review rejected dispatch: the private uploaded dataset-derived
answers would be disclosed to OpenRouter, and the reviewer required explicit
payload-disclosure authorization beyond the budget authorization. No paid call
was made. The assistant asked the owner to authorize sending questions, answers,
criteria, reference figures, and recorded tool metadata. That answer is pending.
The rejected command did not create its proposed private campaign script. The script was subsequently prepared locally, without execution, at ignored `evals/esco/runs/2026-10-28-adjudication/calibrate.eval.ts`. It requires `ESCO_DISCLOSURE_APPROVED=1`; do not set that flag without the owner answer.

Before dispatch, prepare a private script under ignored `evals/esco/runs/` that
verifies the source hash, reserves a conservative input/output cost before each
call, pins provider maximum prices, retains reservations on failures, and stops
before the aggregate reservation exceeds $1. Include retries in that ledger.
Save per-case parsed output, unavailable results, tokens/cost and rubric/source
versions privately. Do not replace original human labels with judge verdicts.

### Integration update

Remote work through `b62e2f6` completed P0-03 and P1-01 while this owner review
was in progress. The independent fallback is now P1-02 (bounded loop/commands).
Earlier v1 fallback text records the prior state and is not the current task.
