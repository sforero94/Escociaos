# P3 Task 0: clarification transport and bounded planner retry

Date: 2026-11-04. Base: main `6e18ca1e`. This PR contains Task 0 only.
No deployment, migration, secrets, production write, pilot, P4–P6 or held-out access.

## Changed behavior

The local diagnostic screen renders offered clarification choices as buttons. It sends
`estadoToken` plus the exact `respuestaAclaracion` ID. Free text sends the token without
choosing scope. New consultation, cancellation and account/role changes clear context;
a network error retains pending choices for a manual retry.

A pending free-text reply returns the same two choices and a short instruction to choose,
without replanning or interpreting text as scope. A schema-invalid plan retries once;
a second invalid plan stops. A transport error does not retry. Maximum two planner calls
per turn; factual output still comes from the deterministic renderer.

The development runner exercises the opaque-token boundary and an offered button ID.
The D26 fixture mode predeclares the named-task choice; it never maps follow-up prose to
scope. An explicit fixture option can override that declaration. References and scorer
were not changed. Budget checks run before every model call, including retries/follow-ups;
unknown costs or uncertain calls stop further calls and remain unknown, never zero.
The USD 0.025 per-call reservation is a conservative operator bound, not a provider-enforced cap.
`--aggregate-only` prints only totals; questions and detailed results stay private.

## Independent validation

Implementation and independent QA ran separately. The coordinator inspected the final
diff and reran the complete suite after correcting the runner choice.

| Check | Result |
|---|---|
| `npm test` | 7,468 passed / 313 files |
| New Task 0 tests included above | 65 passed, including 20 independent real-handler / synthetic SQL and client round-trip tests |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | 0 errors / 907 existing warnings |
| Frontend production build in a temporary directory | Passed |
| Diagnostic route/screen/client markers in production bundle | Absent |
| `git diff --check` | Passed |

Synthetic tests cover both offered choices, free text including option-looking text,
foreign users, maximum retry count, valid and invalid second plans, transport failure,
unchanged original question, client serialization, SQL table totals and budget receipts.
They do not certify browser rendering, real JWT cryptography or production completeness.
One initial local full-suite attempt stalled in the preexisting permission-hook test;
it was stopped. The stable final full run completed in 33.32 seconds with all tests green.

## Development-set check: aggregates only

Santiago explicitly authorized development questions and snapshot-derived catalog input
to OpenRouter `openai/gpt-6-luna`, within the cumulative P3 USD 0.25 cap. No production row
was acquired. Only the existing private labor snapshot and development fixtures were used.
The automatic approval review rejected the first launch before execution for missing
payload/destination specificity; Santiago supplied that specificity before any paid call.

Both runs used `scripts/esco2/m25.ts --config m3 --reps 3 --budget 0.25
--reserve-usd 0.025 --aggregate-only`, a distinct private tag and cumulative `--spent`.
The second run included `--spent 0.006836935`.

| Run | Attempts | Passes by repetition | Selection / response passes | Calls | Cost USD |
|---|---:|---|---|---:|---:|
| Initial runner with incorrectly predeclared category choice | 30 | 9/10, 9/10, 8/10 | 26/30, 26/30 | 36 | 0.006836935 |
| Corrected runner with fixture's declared named-task choice | 30 | 9/10, 8/10, 8/10 | 25/30, 25/30 | 36 | 0.006931810 |
| Cumulative P3 spend so far | 60 | Repeated measurements, not 60 independent scenarios | Not an acceptance score | 72 | **0.013768745** |

The initial category assumption was not verified and was wrong. It was corrected without
changing the fixture or scoring oracle. The initial result is retained, not replaced.
Remaining P3 allowance: USD 0.236231255; application checking has not run.

In the corrected run, the clarification round trip resolves in 3/3 attempts and its
choice-follow-up makes zero planner calls. Those three attempts still fail one numeric
anchor each. Two other attempts fail anchors. All five final dispositions are deterministic;
there was no planner-schema failure in this measurement, so the retry limit is verified
synthetically, not observed live. No costs are unknown. Each run contains 39 turns.

No source/reference correction is inferred from an anchor disagreement. A correct aggregate
for a selected plan does not prove the planner selected the intended scope. The existing
M2.5 scorer over-credits some date questions and checks numeric presence, so these are
language/regression signals only. They do not establish labor acceptance or D31 improvement.
Do not add special-case question fixes or run additional paid campaigns to hide these failures.

## Review gate and next step

Task 0 is ready for Santiago or Claude Code review; `verificacion` must pass before merge.
No merge is authorized solely by this report or by the independent synthetic QA result.
The source contract is a separate Task 1 PR. Subsequent dependent implementation resumes
from current main after the preceding review/merge; preserve the residual development
failures for review rather than claiming labor is accepted. No unresolved clarification
transport decision remains. The open review issue is the five development anchor failures.
After a future merge, esco-consultas drift is expected until Santiago separately authorizes
a redeploy. Do not deploy as part of this task.
