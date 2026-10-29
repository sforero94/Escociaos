# Draft361: reproduce channel message construction offline

Existing branch `codex/esco-faithfulness-eval-messages`, integrated with main `50d377641dfbb2f98864f4be68f1f3275263efd2`.
Original reviewed implementation head: `917f9ad42b8b491f97f277254af9a97f892210b7`.
Both builder/test blobs remain unchanged; refresh only integrates main and reconciles shared trackers.

Pure builders reproduce Web/Telegram prompts, opaque tool summaries and persisted-history windows for future offline evaluations.
Web selects latest20 persisted rows; Telegram selects earliest20, intentionally reproducing its current newer-question omission.
Repeated-turn histories remain isolated; unknown channels and expanded LLM protocol are rejected.
Missing/error/truncated evidence remains opaque, with no invented success or freshness claim.
Static tests read both source mirrors; no deployed handler is imported or executed.

Scope stays five files: one pure module, one synthetic test file and three tracker documents.
Input adapter359, security, runtime367, release controls and PO changes remain untouched from main.
No date helper, runner, CLI, provider, private fixture, environment/credential access or production write.
Measurementv1.1 and immutable labels/adjudication remain intact. No real-model injection-resistance or calibration claim.
Final-head tests/types/lint/build, independent review and CI are recorded in the PR/handoff after commit.

Remain draft; specific approval is required before ready/merge. No backend deployment.
Next order:361 →363 →364 →366; reconcile/retest each, never merge the offline integration-base branch.
Rollback is a normal source revert without schema or traffic change.

Business one-liner: Reproduces Web and Telegram history formatting offline so future evaluations test the channel context actually supplied.
