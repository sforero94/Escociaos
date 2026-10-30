# Bounded answer-quality remediation

## Baseline and outcome

Repository baseline: main `0aa3710f2e01173ba1dd8f5b495d63de9bf6c3c3`, tree `55240cc72366a8b8fb48a31040371682ef6c783c`. Active backend baseline remains v282, runtime source `e7a5545bc8d87ad0502caf009d0201cae67fc772`. Local remediation is not deployed. Preserve security, SQL, access and existing domain calculations.

Confirm causal mechanisms, fix confirmed defects in small packages, and demonstrate materially better factual answers in comparable online Web tests. Parent owns private evidence, independent grading, release coordination and the prospective online campaign. Synthetic replay proves code/protocol behavior, not model quality. No private prompts, records, identities or traces belong in repository fixtures.

Candidate mechanisms remain separate: incomplete/candidate evidence becoming certainty; changed source figures/rankings/components; date/entity/record-type scope drift; stale answers overriding fresh evidence; date-contract conflicts and missing terminal answers. Do not infer one root cause from overlapping symptoms. Resolve ambiguous references/date contracts before classifying factual errors. Q03's cause is not established by this package. Rainfall needs evaluator-held-out coverage.

## First package: terminal answer validation

Confirmed in the real `llmToolLoop` under synthetic transport: normal completion returned `msg.content || ''`, allowing empty or whitespace assistant turns and truthy non-string protocol content. The exhausted-round fallback rejected falsy content but accepted whitespace and truthy non-strings. Web streaming could then complete or persist an invalid assistant turn. This is a protocol/completion defect, not proof of provider unavailability or the cause of a particular field observation.

The fix requires a nonempty string at both return boundaries. Invalid content follows the existing error path; there is no automatic retry, fabricated answer, new refusal of valid text or additional provider call. Existing application/birth evidence guards run first. Valid output is preserved byte-for-byte, including formatting. An explicit limitation after unavailable evidence remains a valid response. Empty output fails both with fresh context and with prior assistant prose; this does not establish the separate factual-anchoring hypothesis.

Reproduction before the fix: 21 failures / 7 controls passed in the new synthetic file. Final regression matrix: 30 tests across immediate completion, one real read-only tool round and exhausted three-round completion; empty, whitespace, null/absent, number, array and object content; valid text controls; prior-context control; unavailable-evidence controls, including the existing birth guard before terminal validation. Closed mocks reject unmatched destinations/methods and never delegate to inherited fetch. No external model is invoked. Local final checks and exact candidate CI are recorded in the PR/handoff.

This package does not fix numerical attribution, unsupported physical/causal assertions, scope drift, date comparisons or semantic task completion. Rejecting invalid protocol content is not an improvement claim for the factual-quality campaign. Existing combined-turn numeric anchors can still mask wrong attribution or later contradictions; close only the claim/turn checks needed for each subsequent regression.

## Prospective acceptance (parent controlled)

At most 40 online sends: 20 original retests, 10 evaluator-held-out cases, six dependent continuations and four additional high-risk repetitions. Hold-out wording stays unavailable to implementation until candidate freeze. Guided continuations are not independent cases. Require at least 16 original tasks with usable bounded-scope references before interpreting the gate, not 16 fully answerable tasks. Partial cases retain obligations for their answerable subparts plus documented limits. Unknown remainder must not erase those obligations or alter historical whole-answer grades. Retain original labels and all inconclusive/missing states.

Require zero material factual errors, no regression of the six previously correct originals, at least 90% useful/complete answers among predeclared answerable oracle-resolved originals, at least 9/10 held-out useful passes, at least 5/6 answerable continuations without repeated falsehood/fabricated history, and 3/3 useful passes for each selected high-risk prompt. Broad refusals do not pass. These are operational sample gates, not population reliability estimates. Source/health checks and deterministic replay cannot substitute for this acceptance.

For each next confirmed mechanism, freeze an independent source reference and a failing case, passing control and incomplete-evidence control before changing behavior. Assert entity/value/unit/period attribution per claim and turn, freshness and coverage, supported inference, and completion of answerable parts. Use synthetic replacements in Git; retain private online evidence only in the authorized application/report workflow. No expanded P1–P6 program, direct provider evaluation, production migration or deployment is authorized by draft preparation.
