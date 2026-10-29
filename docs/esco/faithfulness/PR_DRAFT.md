# Draft: verify the unchanged actual loop with closed synthetic HTTP

Head branch: `codex/esco-faithfulness-eval-loop`. Target #364 branch `codex/esco-faithfulness-eval-replay` at `19d16783e7af0dde3a95057dea45446ece76e4a5`.

Run actual llmToolLoop and a real read-only births tool against exact synthetic model/REST fixtures. Both finalizers and private sticky failures prevent swallowed/missing evidence from appearing valid. Preserve current follow-up history and failure/partial-evidence abstention. Add31 synthetic controls; no deployed source change.

Fixed synthetic Deno bindings only, no environment passthrough/live fallback. Fresh fetch installation restores exact descriptors and inherited mock history/behavior; tests prove zero inherited-network calls. Full request signatures reject mismatched methods/URLs/queries/bodies/headers and redirects. Trusted test execution is not an arbitrary-JavaScript/process sandbox. Model request hashes were captured under denial and pinned; consistency is not provenance/quality.

Measurement v1.1, unadjudicated labels and unavailable judge/review/real usage retained. No calibration, source-pack/private fixture read, actual credential/provider/production call, runtime/edge edit or deployment. Final committed-head tests/types/lint/build, harness-file lint, independent review and CI receipts belong in the publication handoff.

Queue: #359 → #361 → #363 → #364 → this PR. Do not merge the offline integration base. Reconcile/retarget/retest changed dependent heads after earlier merges. Draft only, no merges tonight. Rollback: test/docs revert.

Remaining: queue integration, broader reviewed synthetic coverage, separate runtime evidence/injection decisions, explicit disclosure/provider approval for private calibration and separate live-QA/deployment activation. Stop after this milestone.

Morning-paper one-liner: Tests the actual agent loop and births lookup against synthetic evidence while proving it cannot fall through to the network.
