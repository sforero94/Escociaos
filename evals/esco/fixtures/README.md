# Synthetic tool controls v1

Every name, identifier, value and response in `synthetic-v1.json` was constructed
for this task. Nothing was copied from private farm evidence or relabeled as a
historical snapshot. Seed IDs identify failure categories from
`docs/esco/faithfulness/BASELINE.md`, not reviewed historical expected values.
In particular, the SYN-01/02 mapping to disputed 040 does not resolve D01.

Manifest fields apply to every scenario and tool response:

- `schema`: `esco-tool-fixtures/v1`, typed and checked in `lib/fixtures.ts`.
- `source`: `explicitly-synthetic`.
- `reference_version`: `synthetic-controls/v1`.
- `rubric_version`: `synthetic-transport/v1` (scenario criteria are review prompts).
- `review_status`: `synthetic-control-unadjudicated`; no owner truth label.
- `hashes`: SHA-256 of each complete scenario's canonical UTF-8 JSON. Recursively
  sort object keys lexically; preserve arrays, JSON values and Unicode. No spaces.

`turns[].fixtures[]` contains tool name, exact arguments and the complete JSON
payload returned at the tool boundary for that control. Some payloads deliberately
use simplified or extended fields to express missingness, partial coverage and
future domain controls. This is a synthetic response schema, not a claim that the
current production tools retrieve or emit every field. P1/P2 must migrate/review
these shapes against actual tool contracts; P3-02 separately tests retrieval.
Hashes detect accidental changes; they are not review signatures.

| Scenario | Control | Baseline seeds |
|---|---|---|
| SYN-01 | Explicit animal-sales detail (2 + 3 heads, value 900) | 040 |
| SYN-02 | Incomplete annual sales; no definitive total | 040, 021 |
| SYN-03 | Duplicate identical request; existing loop refusal | 012, 014, 044 |
| SYN-04 | Missing milk measurement differs from zero | 024, 045 |
| SYN-05 | Ambiguous name followed by explicit chapeta | 009, 048 |
| SYN-06 | Inventory enum-query error | 036 |
| SYN-07 | Same animal/evidence across Telegram turns | 041 |
| SYN-08 | Changed animal across web turns | 041, 004 |
| SYN-09 | Corrected evidence for same animal across turns | 041 |
| SYN-10 | Purchases versus consumption cost definition | 013, 015, 016, 017 |
| SYN-11 | Weighted kg/tree with unequal denominators | 028, 033, 037 |
| SYN-12 | Work versus formal closure; unknown capturer | 004, 005, 032, 058 |
| SYN-13 | Optional weather failure plus valid stock, missing minimum | 025, 026, 055, 057, 036 |
| SYN-14 | Explicit not-found for one identifier | 021, 024 |

All dates are controlled at 2026-10-28 09:00 Bogotá. State is the zero-based turn:
SYN-07 repeats identical evidence; SYN-08 changes the entity; SYN-09 changes the
snapshot. No state crosses scenario installations. The mock model's
`control_answer` is scripted and has no semantic evaluation value. Its tests
inspect the actual tool payloads sent back to the model and the real follow-up
context, including the production duplicate guard.

Gaps: approved historical evidence and D01 labels; retrieval/pagination verification;
real-model semantic scoring and repeat campaigns; bounded-loop improvements and
claim validation (P1); production endpoint/channel persistence and online tracing.
Free checks need no credentials. Real-model replay is documented separately in the
parent README and was not run for this pack.
