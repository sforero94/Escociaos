# Go/No-Go — Pest & Disease Risk Prediction POC (Escocia Hass)

**Recommendation: NO-GO.** Weather history + monitoring data, at lote-level granularity and
2-4 week horizons, did not beat naive baselines out-of-year with the rigor this POC required.
This is a valid, valuable result — it tells the owner where *not* to invest next, and why.

---

## 1. Per-pest verdict (pre-registered rule, config.yaml `success`)

**GO** requires ≥3 of 6 pests to clear the margin (≥0.05 absolute macro-F1 or ≥0.05 absolute
PR-AUC over the best baseline) on the 2026 test year, survive leave-one-year-out, and survive
the leakage red-team.

| pest_group | clears margin on 2026 test (any horizon) | survives leave-one-year-out | **Final: robust GO-quality signal?** |
|---|---|---|---|
| acaros | no | — | **NO** |
| cucarron_marceno | no | — | **NO** |
| fungoso | **YES** (h14, hierarchical model, macro_f1_skill +0.070) | no | **NO** |
| monalonion | no | — | **NO** |
| mosca_ovario | no | — | **NO** |
| thrips | **YES** (h28, elasticnet model, macro_f1_skill +0.057) | no | **NO** |

**0 of 6 pests** meet the full GO bar. Full numbers: `reports/s6_evaluation.md`.

### Why this isn't classified as CONDITIONAL despite "2 pests cleared the primary-test margin"

Read narrowly, section 1's CONDITIONAL wording ("1–2 pests clear it") could describe fungoso
and thrips. We are recommending NO-GO instead, for reasons the numbers themselves make plain:

- **Neither clear survives leave-one-year-out** — the entire point of LOYO is to catch "one
  lucky split," which is exactly what GO's own criteria call out as disqualifying. Fungoso/h14
  is only positive in the loyo_2025 fold (3 of 4 LOYO years are negative); thrips/h28 is only
  positive in loyo_2025 (also 3 of 4 negative).
- **Both show strongly negative `pr_auc_skill`** (fungoso h14: −0.425 to −0.474 depending on
  which model is used for the pr_auc side; thrips h28: −0.256) even as `macro_f1_skill` is
  nominally positive. That means the binary "will this exceed the action threshold" signal —
  arguably the more actionable of the two label types — got *worse*, not better. A model that
  improves 3-tier classification while getting meaningfully worse at the underlying yes/no
  question is not a model an agronomist should trust to flag action-worthy risk.
- The independent S7 red-team traced both clears back through the full pipeline (features,
  splits, model code) and found no leakage propping them up — they are genuinely this fragile,
  not artificially inflated. See section 4.

If the owner reads the raw "2 pests cleared the test-year margin" fact as enough to justify
scoping down and iterating rather than stopping, that is a legitimate alternative reading —
we flag it explicitly rather than deciding it silently.

## 2. What *did* show something worth knowing

Not every negative result was uniform:
- **thrips** and **monalonion** had the most consistent, non-degenerate discrimination across
  models and horizons (ROC-AUC 0.6–0.8 in several splits) even though tier classification never
  cleared the bar — the raw ranking signal exists, current tier-cutoff calibration doesn't
  capture it into a 3-way decision.
- **The autoregressive feature (`ar_last_incidencia_pct`, current `incidencia_pct`/`tier`) was
  consistently the most important feature across all 4 models** (LightGBM, elastic-net
  coefficients, hierarchical importances) — "today's reading" carries most of what
  predictability exists; weather features added comparatively little on top of persistence.
  This is itself informative: it suggests **persistence itself might be the practically useful
  operating rule**, more than any of the 4 built models materially improved on it.
- **mosca_ovario** was the weakest performer across the board (macro_f1 as low as 0.10), traced
  to a genuine train/test distribution shift specific to this pest (train years are Low-heavy,
  2026 test labels are almost entirely Med/High) — a real-world regime change, not a modeling
  artifact, and one no amount of better modeling would have fixed with this data.
- **acaros** produced degenerate ROC-AUC/PR-AUC (NaN) on the 2026 test slice because the
  binary "exceed" label had only one class present that year — an artifact of how few High-tier
  acaros rounds occurred in 2026, not a pipeline bug (independently confirmed).

## 3. Deviations from the design doc (read before trusting any number above)

This sandboxed execution environment blocks outbound network access to hosts outside an
allowlist (`power.larc.nasa.gov` included) — confirmed via the environment's own proxy status
endpoint reporting a hard policy denial, not a transient failure. Per this environment's
operating rules, policy denials are reported, not routed around. Three concrete consequences:

1. **Weather gap-filling used station-only day-of-year climatology instead of NASA POWER.**
   A 134-day full station blackout (2025-11-05 to 2026-03-17 — squarely inside the validate/test
   years) plus 38 smaller gaps were filled from this farm's own multi-year seasonal pattern
   (forward-chaining, prior-years-only — an independent verifier caught and fixed a real
   leakage bug in the first version of this fill, where test-year data was pooled into training-
   year fills; the fix was re-verified). This is weaker than a real satellite-reanalysis
   backfill for capturing that specific period's actual weather anomalies. See
   `reports/s2_weather_reconciliation.md`.
2. **Radiation was dropped as a feature entirely** — wunderground-historico (2020-2025) never
   recorded it, and POWER was the plan's only way to backfill it; with POWER unavailable,
   coverage was too sparse (5% of days) to use.
3. **A ~6-month spray-log gap** (2025-06-25 to 2025-12-14, between the Excel FUMIGACION export
   and the DB `movimientos_diarios` era) leaves intervention features (days-since-last-spray,
   spray-count-in-window) as flagged-unknown (NaN), not zero, for monitoring rounds in that
   window — never silently treated as "no spray happened."

None of these deviations are believed to be the reason for the NO-GO result — the autoregressive
and current-state features (unaffected by any of the three) were consistently the strongest
signal in every model, and weather features contributed comparatively little even in the
periods with clean, real station data. But they are real limitations of this specific run and
would need addressing (real POWER access, or an alternative weather API) before a repeat attempt
could be considered more conclusive.

**Also found and fixed during execution** (not deviations from the plan, but real bugs caught by
the process working as designed):
- S2's original climatology fill pooled all years indiscriminately, leaking test-year (2026)
  station data backward into training-year fills — caught by an independent verifier, fixed with
  a prior-years-only forward-chaining design, re-verified.
- S6's convergence step initially reported one model's macro-F1 next to a *different* model's
  PR-AUC under a single "winner" label — caught by the S7 red-team, fixed to report each model's
  own paired metrics; the true numbers for both marginal clears turned out slightly worse than
  first shown, not better.
- Tier-threshold tertiles are frozen once from train_years=[2023,2024] and reused across all
  leave-one-year-out folds, so `loyo_2023`/`loyo_2024` aren't fully leakage-clean (`loyo_2025`/
  `loyo_2026` are) — found by the red-team, verified not to change this run's outcome, documented
  rather than rebuilt (would need per-fold tier thresholds).
- One of the four modeling agents (elastic-net) caught, mid-build, that its own PR-AUC-based
  hyperparameter tuning was selecting a degenerate all-zero-coefficient model on several small
  imbalanced validate sets — fixed to score on mean(ROC-AUC, PR-AUC) instead, since a
  constant-score model always scores exactly 0.5 ROC-AUC.

## 4. Leakage red-team summary (full independent audit)

A dedicated agent, with no role in building any prior stage, tried specifically to invalidate
the two marginal "clears_margin" results and to hunt for any bug that could be suppressing real
signal (a false-negative check, given the result trended NO-GO). Independently recomputed both
marginal results from raw predictions (exact match to reported numbers), checked feature/label
column exclusions against the actual panel schema, checked scaling/imputation/hyperparameter
tuning never touched test-year data in any of the 4 models, checked horizon labels weren't
swapped, and checked split row counts against panel groupby counts (no data-starvation
artifact). Found the two real bugs described in section 3 (both fixed and re-verified as
non-outcome-changing). Verdict: **"NO-GO SURVIVES — the two marginal clears are genuine, the
bugs found are real but non-outcome-changing, and no implementation bug was found capable of
suppressing real signal at the scale needed to flip 0/6 to ≥3/6."**

## 5. Verification checklist (design doc section 11)

1. ✅ This document exists and states a clear recommendation (NO-GO) with the per-pest table above.
2. ✅ Baseline numbers (`reports/s4_baselines.md`) were committed to git before any model result
   existed (commit `4b07c92`, before the first S5 model commit `e846976`).
3. ✅ Every metric in every report is out-of-year. `grep -rn "train_test_split\|shuffle=True" src/`
   returns zero matches in actual code (only docstring mentions of the rule itself).
4. ✅ `reports/s1_dataquality.md` accounts for every dropped/repaired row (impossible
   afectados>monitoreados rows, unmapped lote='nan' rows, NaN-value rows — all logged, all
   independently re-derived and matched by a verifier).
5. ✅ The leakage red-team report exists (section 4) and its two objections were fixed and
   re-verified, not ignored.

## 6. What this POC cost, and what it bought

Per the design doc's envelope ("bounded analysis, days of agent time, not weeks"): this run
used roughly 20 subagent invocations across builder/verifier pairs (S1-S3), a 4-way modeling
tournament (S5), evaluation convergence (S6), and one dedicated red-team (S7), plus this
orchestrating session's own work assembling and connecting each stage. In exchange, the owner
now has: a harmonized 4-year lote-level pest monitoring dataset (`monitoreo_lote.parquet`), a
reconciled weather backbone, a frozen labeled feature panel, 4 independently-built and
-evaluated modeling approaches with full leave-one-year-out results, and a defensible answer —
backed by an adversarial audit trail, not a single unchecked run — that weather+monitoring at
this granularity and horizon does not yet clear the bar for a production pest-risk feature,
without a multi-week build first discovering the same thing.

## 7. If the owner wants to continue anyway

Section 12 of the design doc (post-POC steps) does not apply — this was a NO-GO. If the owner
still wants to pursue this direction, the highest-leverage next moves, in order, would be:
1. **Get real weather backfill** (fix POWER access, or source an alternative weather API/export)
   for the 134-day blackout and the pre-2026 radiation gap — the single largest data-quality
   deviation in this run.
2. **Investigate whether persistence-based alerting alone** (today's reading, no model) is
   already operationally useful, given it was the strongest single feature in every approach.
3. **Revisit granularity**: this POC was scoped to lote-level only by owner decision; sublote-
   level monitoring (available from 2024 onward) might carry sharper signal that lote-level
   averaging washes out — worth a scoped follow-up, not a full rebuild.
