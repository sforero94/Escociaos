# Decision register

An owner-approved general direction does not approve every proposed threshold, retention policy, recurring spend, or deployment. Record the actual answer, date, and source when resolving a decision. Defaults below permit local work only where stated.

## Accepted direction

| ID | Decision | Source / consequence |
|---|---|---|
| A01 | Improve evidence controls, deterministic calculations, bounded execution, and multi-turn consistency; measure offline and online | User accepted the plan and requested incremental branch-based implementation |
| A02 | Session-sized tasks with tracked handoffs on a separate branch | Current user request; this directory and progress file are authoritative |
| A03 | Claude Sonnet is the semantic judge family | User's original evaluation instruction; pin an available exact model/version in run metadata |
| A04 | Private farm data and credentials do not belong in Git | Existing evaluation contract and repository ignores |

## Open owner decisions

| ID | Decision needed | Proposed default | Gates | Independent work allowed |
|---|---|---|---|---|
| D01 | Adjudicate five calibration disagreements and acknowledgement-vs-persistence wording | Keep original labels; version any reviewed truth/rubric change | P0-02 completion; disputed cases as release gates | All undisputed fixture and control work |
| D02 | Intended domain definitions: sale scope/transfers, cost basis, yield denominator, calendar boundaries | Reuse documented business rules; ask only where sources conflict | Affected P2 task acceptance | Synthetic calculations, extraction, unrelated domains |
| D03 | Who may read online traces, evidence snapshots, feedback, and review decisions | Gerencia-only review; narrowly scoped worker access; explicit user/conversation ownership | P4-01 production schema and P4-02 activation | Local schema design, access tests, synthetic traces |
| D04 | Snapshot and metadata retention and permitted provider payloads | Propose 14 days for minimized snapshots and 90 days for metadata; retention per data class; never capture credentials | Online capture/judging activation | Synthetic storage and cleanup tests |
| D05 | Daily online judge budget, one-time offline campaign budget, high-risk sampling priority | Start with 10% random sampling plus flagged cases under hard limits; no monetary amount presumed | Paid campaigns/schedules and P5 activation | Local worker/sampler tests with zero external calls |
| D06 | Pilot cohort, deployment scope, and production activation | Internal users first, assignment by conversation, observation-only judge | P6-01 live pilot and P6-02 canary | Offline candidate, runbook, disabled flags |
| D07 | Release quality and performance gates | Proposals in PLAN.md; confirm after comparable baseline | P3-03 enforced gates and P6 rollout decision | Implement report-only threshold configuration |

Do not ask all seven questions at session startup. Raise the concrete decision with evidence when its task reaches the gate. Existing approvals in later sessions take precedence; record them here rather than asking again.

## Implementation defaults (reversible)

- First-party trace storage and asynchronous evaluation worker. No external observability vendor is required for the first version.
- Online judges observe after the answer; they do not block user responses. Deterministic evidence controls run before publication.
- Missing or invalid judge verdict is `unavailable`, never `pass`. User feedback is an input for review, not a truth label.
- Random samples support production rate estimates; flagged samples support diagnosis. Store inclusion probabilities and report the populations separately.
- Preserve captured evidence at answer time. A later database query is not a historical snapshot.
- Freeze code, prompt, tool, model, judge, fixture, and rubric versions for comparisons. Full provider determinism is not assumed.
- Shadow generation may consume captured read-only evidence; it must not repeat memory writes, business actions, or external side effects.
- Failure to persist telemetry must not silently create a passing evaluation or indefinitely delay a response. Expose capture gaps.
- Out of initial scope: fine-tuning, changing model family, rebuilding every tool, auto-editing business data from a judge, and automatic promotion of feedback into golden truth.
