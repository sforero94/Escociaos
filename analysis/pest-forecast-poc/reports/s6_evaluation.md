# S6 — Evaluation Report (tournament convergence)

Primary split: train=[2023, 2024], validate=2025, test=2026
Success criteria (frozen, config.yaml): macro_f1 margin >= 0.05, pr_auc margin >= 0.05, need >= 3/6 pests to clear

## Per-pest, per-horizon: best-by-macro_f1 model AND best-by-pr_auc model (primary test year)

Reported separately and NOT mixed — an earlier version of this report showed one model's name next to a *different* model's pr_auc value (caught by an independent red-team). Each row below always shows a single model's own macro_f1 AND its own pr_auc together; `clears_margin` is YES if EITHER the macro_f1-best model clears the macro_f1 margin, OR the pr_auc-best model clears the pr_auc margin (matches the pre-registered rule: "does ANY candidate model beat baseline by the margin on EITHER metric").

| pest_group | horizon | best_by_macro_f1 (own macro_f1/pr_auc) | f1_skill | best_by_pr_auc (own macro_f1/pr_auc) | pr_skill | clears_margin |
|---|---|---|---|---|---|---|
| acaros | 14 | hierarchical (0.311/nan) | -0.015 | hierarchical (0.311/nan) | +nan | no |
| acaros | 28 | hierarchical (0.342/nan) | +0.032 | hierarchical (0.342/nan) | +nan | no |
| cucarron_marceno | 14 | agronomic (0.274/0.658) | -0.174 | hierarchical (0.169/0.686) | -0.097 | no |
| cucarron_marceno | 28 | agronomic (0.284/0.779) | -0.039 | lightgbm (0.190/0.822) | +0.018 | no |
| fungoso | 14 | hierarchical (0.345/0.056) | +0.070 | agronomic (0.262/0.125) | -0.446 | YES |
| fungoso | 28 | hierarchical (0.317/0.125) | +0.032 | hierarchical (0.317/0.125) | -0.425 | no |
| monalonion | 14 | hierarchical (0.345/0.491) | +0.001 | elasticnet (0.189/0.697) | +0.000 | no |
| monalonion | 28 | hierarchical (0.351/0.664) | -0.033 | agronomic (0.245/0.756) | +0.022 | no |
| mosca_ovario | 14 | agronomic (0.206/0.076) | -0.085 | elasticnet (0.118/0.548) | +0.000 | no |
| mosca_ovario | 28 | agronomic (0.104/0.079) | -0.196 | elasticnet (0.104/0.536) | +0.000 | no |
| thrips | 14 | hierarchical (0.331/0.315) | +0.003 | lightgbm (0.288/0.468) | -0.151 | no |
| thrips | 28 | elasticnet (0.271/0.231) | +0.057 | lightgbm (0.214/0.394) | -0.256 | YES |

## Block-bootstrap 95% CIs (monitoring-round blocks) for margin-clearing (pest,horizon)

| pest_group | horizon | winner | macro_f1_skill (95% CI) | pr_auc_skill (95% CI) |
|---|---|---|---|---|
| fungoso | 14 | hierarchical | +0.070 [-0.088, +0.199] | -0.474 [-0.493, -0.282] |
| thrips | 28 | elasticnet | +0.057 [-0.167, +0.239] | -0.419 [-0.583, +0.166] |

## Leave-one-year-out robustness of the primary-test winner

**Caveat (found by the S7 red-team, not fixed — verified non-outcome-changing):** tier thresholds (`compute_tier_thresholds` in `s3_panel.py`) are frozen ONCE from the primary split's `train_years=[2023,2024]` and reused for every LOYO fold. For the `loyo_2023` and `loyo_2024` rows below, that means the tier/exceed labels being scored were partly calibrated on the very year held out as "test" in that fold — those two LOYO columns are not fully leakage-clean out-of-year checks. `loyo_2025` and `loyo_2026` ARE clean (neither year is in the threshold-fitting years). The red-team traced this through and confirmed it cannot flip the final verdict here: the only two (pest,horizon) pairs that clear the primary-test margin at all have their sole positive LOYO year at 2025 (clean), and no other pest clears the primary margin regardless of LOYO. A full fix (per-fold tier thresholds) was judged not worth the rebuild cost for a POC given it cannot change this run's outcome.

| pest_group | horizon | winner | loyo_year | model_macro_f1 | baseline_macro_f1 | skill | positive? |
|---|---|---|---|---|---|---|---|
| acaros | 14 | hierarchical | 2023 | 0.194 | 0.392 | -0.198 | no |
| acaros | 14 | hierarchical | 2024 | 0.463 | 0.586 | -0.123 | no |
| acaros | 14 | hierarchical | 2025 | 0.337 | 0.339 | -0.001 | no |
| acaros | 14 | hierarchical | 2026 | 0.286 | 0.326 | -0.041 | no |
| acaros | 28 | hierarchical | 2023 | 0.184 | 0.393 | -0.210 | no |
| acaros | 28 | hierarchical | 2024 | 0.458 | 0.591 | -0.134 | no |
| acaros | 28 | hierarchical | 2025 | 0.306 | 0.310 | -0.004 | no |
| acaros | 28 | hierarchical | 2026 | 0.283 | 0.310 | -0.027 | no |
| cucarron_marceno | 14 | agronomic | 2023 | 0.267 | 0.500 | -0.233 | no |
| cucarron_marceno | 14 | agronomic | 2024 | 0.231 | 0.361 | -0.130 | no |
| cucarron_marceno | 14 | agronomic | 2025 | 0.327 | 0.340 | -0.013 | no |
| cucarron_marceno | 14 | agronomic | 2026 | 0.331 | 0.448 | -0.118 | no |
| cucarron_marceno | 28 | agronomic | 2023 | 0.256 | 0.370 | -0.114 | no |
| cucarron_marceno | 28 | agronomic | 2024 | 0.114 | 0.322 | -0.208 | no |
| cucarron_marceno | 28 | agronomic | 2025 | 0.244 | 0.278 | -0.034 | no |
| cucarron_marceno | 28 | agronomic | 2026 | 0.379 | 0.323 | +0.056 | yes |
| fungoso | 14 | hierarchical | 2023 | 0.440 | 0.517 | -0.077 | no |
| fungoso | 14 | hierarchical | 2024 | 0.407 | 0.589 | -0.182 | no |
| fungoso | 14 | hierarchical | 2025 | 0.427 | 0.388 | +0.039 | yes |
| fungoso | 14 | hierarchical | 2026 | 0.222 | 0.276 | -0.054 | no |
| fungoso | 28 | hierarchical | 2023 | 0.465 | 0.479 | -0.014 | no |
| fungoso | 28 | hierarchical | 2024 | 0.420 | 0.542 | -0.122 | no |
| fungoso | 28 | hierarchical | 2025 | 0.339 | 0.313 | +0.026 | yes |
| fungoso | 28 | hierarchical | 2026 | 0.244 | 0.285 | -0.040 | no |
| monalonion | 14 | hierarchical | 2023 | 0.464 | 0.444 | +0.019 | yes |
| monalonion | 14 | hierarchical | 2024 | 0.467 | 0.498 | -0.031 | no |
| monalonion | 14 | hierarchical | 2025 | 0.323 | 0.361 | -0.039 | no |
| monalonion | 14 | hierarchical | 2026 | 0.352 | 0.344 | +0.008 | yes |
| monalonion | 28 | hierarchical | 2023 | 0.384 | 0.411 | -0.027 | no |
| monalonion | 28 | hierarchical | 2024 | 0.373 | 0.448 | -0.075 | no |
| monalonion | 28 | hierarchical | 2025 | 0.344 | 0.336 | +0.007 | yes |
| monalonion | 28 | hierarchical | 2026 | 0.434 | 0.384 | +0.049 | yes |
| mosca_ovario | 14 | agronomic | 2023 | 0.297 | 0.371 | -0.073 | no |
| mosca_ovario | 14 | agronomic | 2024 | 0.290 | 0.522 | -0.232 | no |
| mosca_ovario | 14 | agronomic | 2025 | 0.364 | 0.404 | -0.041 | no |
| mosca_ovario | 14 | agronomic | 2026 | 0.291 | 0.316 | -0.025 | no |
| mosca_ovario | 28 | agronomic | 2023 | 0.260 | 0.400 | -0.139 | no |
| mosca_ovario | 28 | agronomic | 2024 | 0.243 | 0.458 | -0.215 | no |
| mosca_ovario | 28 | agronomic | 2025 | 0.306 | 0.350 | -0.045 | no |
| mosca_ovario | 28 | agronomic | 2026 | 0.314 | 0.321 | -0.007 | no |
| thrips | 14 | hierarchical | 2023 | 0.378 | 0.359 | +0.019 | yes |
| thrips | 14 | hierarchical | 2024 | 0.458 | 0.431 | +0.027 | yes |
| thrips | 14 | hierarchical | 2025 | 0.394 | 0.508 | -0.114 | no |
| thrips | 14 | hierarchical | 2026 | 0.366 | 0.328 | +0.038 | yes |
| thrips | 28 | elasticnet | 2023 | 0.246 | 0.340 | -0.094 | no |
| thrips | 28 | elasticnet | 2024 | 0.204 | 0.359 | -0.156 | no |
| thrips | 28 | elasticnet | 2025 | 0.579 | 0.424 | +0.155 | yes |
| thrips | 28 | elasticnet | 2026 | 0.100 | 0.214 | -0.114 | no |

## Final per-pest verdict (clears margin on primary test AND majority-positive across LOYO)

| pest_group | any horizon clears margin + LOYO-robust? |
|---|---|
| acaros | no |
| cucarron_marceno | no |
| fungoso | no |
| monalonion | no |
| mosca_ovario | no |
| thrips | no |

**0/6 pests clear margin + are LOYO-robust (need >= 3 for a GO recommendation per config.yaml).**
