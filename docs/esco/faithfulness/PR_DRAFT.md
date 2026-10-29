# Draft: closed synthetic fixture replay

Base: main `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc`.
Head branch: `codex/esco-faithfulness-eval-fixtures`.

Offline runs need exact tool/argument/scenario/turn matching without silent fallback when a fixture is missing. Add strict synthetic manifest/hash validation and a closed fixture adapter with adversarial tests. No runtime behavior/network/provider change.

Non-JSON collisions reject. Invalid runs stay invalid after caught exceptions. Explicit turn/case finalizers detect unused fixtures and skipped turns. Error/unknown/partial/stale/truncated results remain opaque. Integrity hashes do not establish truth or private-source authorization. This is plumbing, not calibration.

Independent main base. Review after #359 then #361; no code dependency/retarget. Reconcile overlapping trackers and retest final heads after earlier merges. Draft only, no merge tonight. Rollback: revert offline files.

Final candidate SHA/checks are reported in publication handoff, distinct from source implementation. Excludes private fixtures, source scenario pack, model/case conversion, runner, CLI, runtime import, credentials and provider calls. Remaining: runner composition, transport/runtime injection, scenario review and authorized calibration/live QA.

Business one-liner: Makes offline tool replays fail clearly when synthetic evidence is missing or reused, preventing misleading evaluation results.
