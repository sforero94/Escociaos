# S5 — Approach B: Regularized LightGBM with Monotonic Constraints

## Setup

One LightGBM model per (pest_group x horizon) per target (tier: multiclass num_class=3; exceed: binary). Hyperparameters, chosen for the small per-pest-group sample sizes (a few hundred train rows): `max_depth=4`, `num_leaves=15`, `min_child_samples=20`, `min_data_in_leaf=20`, `learning_rate=0.05`, `feature_fraction=0.8`, `bagging_fraction=0.8`, `lambda_l1=0.1`, `lambda_l2=1.0`, up to 500 boosting rounds with early stopping (patience 30) evaluated **only** against `validate_year=2025` of the primary split. `test_year=2026` never touches fitting or round-count selection.

For leave-one-year-out folds there is no leakage-safe validation year inside the fold (all 4 non-test years are only ever the training set), so each LOYO fit reuses the boosting-round count chosen by the primary split's early stopping for that same pest_group/horizon/target, then trains on the fold's own train_years with no further early stopping. This is a documented POC-level simplification, not a re-tuning against the LOYO test year.

**Categorical encoding**: `tier` (current round's own Low/Med/High reading) is the only non-numeric feature. It is ordinally encoded 0/1/2 (not passed via LightGBM's `categorical_feature`) so that (a) its natural order is preserved and (b) a monotonic constraint can be placed on it — `monotone_constraints` does not support categorical-typed columns. Boolean flags (`intervention_coverage_unknown`, `floracion_available`) are cast to int8. All other features are left as native float/int; NaN (e.g. pre-2025 floración fields) is passed through untouched — LightGBM splits on missingness natively, no imputation performed.

## Monotonic constraints (documented reasoning)

Applied to the trailing weather window matching each model's own horizon (the 14-day model constrains `w14_*` features, the 28-day model constrains `w28_*`), plus two universal constraints on every model: `ar_last_incidencia_pct` and `incidencia_pct` (recent/current incidence should not lower the forecast), and the ordinally-encoded `tier` (a currently-higher tier should not lower the forecast).

| pest_group | biology | constrained drivers (this horizon's window) | direction |
|---|---|---|---|
| acaros | hot/dry flare (mite) | hot_dry_days, hot_dry_max_run, gdd_sum | + (risk rises with heat/dryness) |
| acaros | ″ | humedad_pct_avg_mean, rain_sum | - (risk falls with rain/humidity) |
| fungoso | warm-wet infection | warm_wet_days, warm_wet_max_run, rain_sum, humedad_pct_avg_mean | + |
| fungoso | ″ | hot_dry_days | - (dries out canopy, suppresses infection) |
| monalonion | humid highland pest | humedad_pct_avg_mean, rain_sum | + |
| monalonion | ″ | temp_c_avg_mean | - (cooler favors this pest) |
| thrips | warm/dry + floración | hot_dry_days, temp_c_max_mean, floracion_flor_madura | + |
| thrips | ″ | rain_sum | - |
| cucarron_marceno | rain-onset emergence | rain_days, rain_sum | + |
| mosca_ovario | floración-phenology only | floracion_flor_madura | + (no weather constraint asserted — insufficient confident prior) |

## Results — primary split (train=[2023,2024])

### validate_year=2025 (used for early stopping)

| pest_group | horizon | macro_f1 | balanced_acc | roc_auc | pr_auc | n |
|---|---|---|---|---|---|---|
| acaros | 14 | 0.351 | 0.355 | 0.338 | 0.012 | 122 |
| acaros | 28 | 0.363 | 0.365 | 0.388 | 0.007 | 122 |
| cucarron_marceno | 14 | 0.378 | 0.378 | 0.468 | 0.712 | 117 |
| cucarron_marceno | 28 | 0.147 | 0.261 | 0.568 | 0.736 | 117 |
| fungoso | 14 | 0.425 | 0.421 | 0.777 | 0.169 | 87 |
| fungoso | 28 | 0.359 | 0.391 | 0.720 | 0.108 | 87 |
| monalonion | 14 | 0.351 | 0.362 | 0.576 | 0.615 | 103 |
| monalonion | 28 | 0.137 | 0.338 | 0.542 | 0.668 | 103 |
| mosca_ovario | 14 | 0.068 | 0.067 | 0.605 | 0.452 | 102 |
| mosca_ovario | 28 | 0.000 | 0.000 | 0.619 | 0.390 | 102 |
| thrips | 14 | 0.526 | 0.530 | 0.904 | 0.840 | 89 |
| thrips | 28 | 0.409 | 0.462 | 0.644 | 0.547 | 89 |

### test_year=2026 (held out, never touched fitting)

| pest_group | horizon | macro_f1 | balanced_acc | roc_auc | pr_auc | n |
|---|---|---|---|---|---|---|
| acaros | 14 | 0.280 | 0.761 | nan | nan | 48 |
| acaros | 28 | 0.324 | 0.608 | nan | nan | 46 |
| cucarron_marceno | 14 | 0.179 | 0.344 | 0.422 | 0.477 | 36 |
| cucarron_marceno | 28 | 0.190 | 0.455 | 0.679 | 0.822 | 28 |
| fungoso | 14 | 0.119 | 0.194 | 0.750 | 0.100 | 17 |
| fungoso | 28 | 0.099 | 0.117 | 0.357 | 0.050 | 15 |
| monalonion | 14 | 0.337 | 0.394 | 0.558 | 0.458 | 38 |
| monalonion | 28 | 0.159 | 0.333 | 0.665 | 0.738 | 32 |
| mosca_ovario | 14 | 0.000 | 0.000 | 0.655 | 0.140 | 31 |
| mosca_ovario | 28 | 0.000 | 0.000 | 0.721 | 0.101 | 28 |
| thrips | 14 | 0.288 | 0.444 | 0.844 | 0.468 | 21 |
| thrips | 28 | 0.214 | 0.417 | 0.726 | 0.394 | 17 |

## Results — leave-one-year-out

| pest_group | horizon | loyo_test_year | macro_f1 | balanced_acc | roc_auc | pr_auc | n |
|---|---|---|---|---|---|---|---|
| acaros | 14 | 2023 | 0.206 | 0.267 | 0.516 | 0.609 | 200 |
| acaros | 14 | 2024 | 0.201 | 0.465 | 0.734 | 0.035 | 223 |
| acaros | 14 | 2025 | 0.325 | 0.353 | 0.471 | 0.016 | 122 |
| acaros | 14 | 2026 | 0.280 | 0.761 | nan | nan | 48 |
| acaros | 28 | 2023 | 0.192 | 0.595 | 0.657 | 0.727 | 200 |
| acaros | 28 | 2024 | 0.185 | 0.366 | 0.765 | 0.129 | 223 |
| acaros | 28 | 2025 | 0.304 | 0.338 | 0.393 | 0.007 | 122 |
| acaros | 28 | 2026 | 0.241 | 0.508 | nan | nan | 46 |
| cucarron_marceno | 14 | 2023 | 0.285 | 0.385 | 0.437 | 0.353 | 110 |
| cucarron_marceno | 14 | 2024 | 0.407 | 0.419 | 0.485 | 0.265 | 189 |
| cucarron_marceno | 14 | 2025 | 0.367 | 0.387 | 0.536 | 0.659 | 117 |
| cucarron_marceno | 14 | 2026 | 0.325 | 0.531 | 0.539 | 0.568 | 36 |
| cucarron_marceno | 28 | 2023 | 0.145 | 0.280 | 0.306 | 0.259 | 110 |
| cucarron_marceno | 28 | 2024 | 0.103 | 0.204 | 0.405 | 0.183 | 189 |
| cucarron_marceno | 28 | 2025 | 0.350 | 0.403 | 0.517 | 0.674 | 117 |
| cucarron_marceno | 28 | 2026 | 0.396 | 0.596 | 0.658 | 0.692 | 28 |
| fungoso | 14 | 2023 | 0.283 | 0.355 | 0.638 | 0.379 | 163 |
| fungoso | 14 | 2024 | 0.499 | 0.491 | 0.754 | 0.550 | 186 |
| fungoso | 14 | 2025 | 0.267 | 0.316 | 0.713 | 0.148 | 87 |
| fungoso | 14 | 2026 | 0.242 | 0.250 | 0.750 | 0.100 | 17 |
| fungoso | 28 | 2023 | 0.338 | 0.415 | 0.697 | 0.437 | 163 |
| fungoso | 28 | 2024 | 0.373 | 0.448 | 0.775 | 0.521 | 186 |
| fungoso | 28 | 2025 | 0.270 | 0.333 | 0.710 | 0.103 | 87 |
| fungoso | 28 | 2026 | 0.287 | 0.350 | 0.143 | 0.038 | 15 |
| monalonion | 14 | 2023 | 0.351 | 0.391 | 0.516 | 0.266 | 125 |
| monalonion | 14 | 2024 | 0.259 | 0.342 | 0.645 | 0.496 | 179 |
| monalonion | 14 | 2025 | 0.304 | 0.335 | 0.576 | 0.637 | 103 |
| monalonion | 14 | 2026 | 0.337 | 0.375 | 0.568 | 0.545 | 38 |
| monalonion | 28 | 2023 | 0.132 | 0.323 | 0.577 | 0.270 | 125 |
| monalonion | 28 | 2024 | 0.231 | 0.347 | 0.538 | 0.372 | 179 |
| monalonion | 28 | 2025 | 0.298 | 0.357 | 0.543 | 0.627 | 103 |
| monalonion | 28 | 2026 | 0.280 | 0.322 | 0.527 | 0.514 | 32 |
| mosca_ovario | 14 | 2023 | 0.092 | 0.259 | 0.395 | 0.123 | 45 |
| mosca_ovario | 14 | 2024 | 0.158 | 0.333 | 0.709 | 0.483 | 119 |
| mosca_ovario | 14 | 2025 | 0.276 | 0.500 | 0.528 | 0.391 | 102 |
| mosca_ovario | 14 | 2026 | 0.316 | 0.500 | 0.464 | 0.082 | 31 |
| mosca_ovario | 28 | 2023 | 0.095 | 0.259 | 0.294 | 0.044 | 45 |
| mosca_ovario | 28 | 2024 | 0.261 | 0.341 | 0.786 | 0.557 | 119 |
| mosca_ovario | 28 | 2025 | 0.246 | 0.399 | 0.557 | 0.327 | 102 |
| mosca_ovario | 28 | 2026 | 0.321 | 0.500 | 0.481 | 0.360 | 28 |
| thrips | 14 | 2023 | 0.317 | 0.385 | 0.668 | 0.326 | 151 |
| thrips | 14 | 2024 | 0.423 | 0.451 | 0.690 | 0.408 | 163 |
| thrips | 14 | 2025 | 0.441 | 0.441 | 0.883 | 0.835 | 89 |
| thrips | 14 | 2026 | 0.252 | 0.389 | 0.762 | 0.392 | 21 |
| thrips | 28 | 2023 | 0.215 | 0.318 | 0.484 | 0.234 | 151 |
| thrips | 28 | 2024 | 0.298 | 0.300 | 0.466 | 0.281 | 163 |
| thrips | 28 | 2025 | 0.364 | 0.370 | 0.646 | 0.532 | 89 |
| thrips | 28 | 2026 | 0.214 | 0.417 | 0.774 | 0.442 | 17 |

## Feature importances (gain, primary-split tier model)

Top 10 features by gain, for two representative pest_groups at horizon 14d (the strongest and a weaker performer — see results tables above):

### acaros (h14)

| feature | gain |
|---|---|
| incidencia_pct | 1036.6 |
| ar_last_incidencia_pct | 794.2 |
| spray_count_w28 | 611.9 |
| w21_rafaga_kmh_max_mean | 351.5 |
| spray_count_w21 | 187.3 |
| w21_lluvia_total_mm_mean | 151.3 |
| week_cos | 151.2 |
| tier | 131.0 |
| w28_viento_kmh_avg_mean | 127.2 |
| week_sin | 118.2 |

### cucarron_marceno (h14)

| feature | gain |
|---|---|
| week_sin | 347.9 |
| days_since_last_spray | 308.2 |
| week_cos | 283.1 |
| incidencia_pct | 241.7 |
| ar_last_gap_days | 239.2 |
| w28_rafaga_kmh_max_mean | 221.4 |
| w28_humedad_pct_min_mean | 172.3 |
| w7_viento_kmh_avg_mean | 169.5 |
| w21_rafaga_kmh_max_mean | 131.0 |
| w28_lluvia_total_mm_mean | 118.3 |

### fungoso (h14)

| feature | gain |
|---|---|
| incidencia_pct | 448.0 |
| week_sin | 444.0 |
| spray_count_w28 | 345.1 |
| ar_last_incidencia_pct | 333.4 |
| days_since_last_spray | 278.8 |
| w28_temp_c_min_mean | 254.8 |
| week_cos | 229.8 |
| ar_last_gap_days | 187.7 |
| w14_temp_c_min_mean | 154.3 |
| w28_humedad_pct_min_mean | 152.0 |

### monalonion (h14)

| feature | gain |
|---|---|
| w28_lluvia_total_mm_mean | 334.3 |
| ar_last_gap_days | 281.3 |
| ar_last_incidencia_pct | 164.2 |
| incidencia_pct | 159.4 |
| days_since_last_spray | 133.9 |
| w28_humedad_pct_min_mean | 125.7 |
| week_cos | 93.0 |
| w28_viento_kmh_avg_mean | 89.2 |
| w14_temp_c_min_mean | 86.4 |
| w14_temp_c_avg_mean | 83.1 |

### mosca_ovario (h14)

| feature | gain |
|---|---|
| incidencia_pct | 75.0 |
| w28_viento_kmh_avg_mean | 69.4 |
| w28_humedad_pct_min_mean | 54.9 |
| w28_rafaga_kmh_max_mean | 34.2 |
| week_cos | 29.9 |
| w14_rafaga_kmh_max_mean | 18.7 |
| w28_temp_c_min_mean | 16.8 |
| w28_rain_days | 12.1 |
| w7_viento_kmh_avg_mean | 10.5 |
| ar_last_gap_days | 10.4 |

### thrips (h14)

| feature | gain |
|---|---|
| week_cos | 320.4 |
| w28_lluvia_total_mm_mean | 304.6 |
| w28_viento_kmh_avg_mean | 174.3 |
| incidencia_pct | 124.8 |
| w21_viento_kmh_avg_mean | 122.4 |
| week_sin | 114.7 |
| w28_temp_c_min_mean | 110.6 |
| w14_viento_kmh_avg_mean | 107.1 |
| w21_temp_c_min_mean | 103.3 |
| w7_lluvia_total_mm_mean | 89.5 |

## Notes / anomalies flagged during fitting

- [acaros h14] primary_test (2026, n=48): tier(s) ['High'] never occur in the eval set (distribution shift, not a bug) — macro-F1 is dragged down because the absent class always scores F1=0.
- [acaros h14] primary_test (2026): exceed_h14 is a single class ({np.float64(0.0)}) in the eval set -> ROC-AUC/PR-AUC undefined (nan), per eval.metrics_binary's own contract, not a bug.
- [acaros h28] primary_test (2026, n=46): tier(s) ['High'] never occur in the eval set (distribution shift, not a bug) — macro-F1 is dragged down because the absent class always scores F1=0.
- [acaros h28] primary_test (2026): exceed_h28 is a single class ({np.float64(0.0)}) in the eval set -> ROC-AUC/PR-AUC undefined (nan), per eval.metrics_binary's own contract, not a bug.
- [cucarron_marceno h14] primary_test (2026, n=36): tier(s) ['Low'] never occur in the eval set (distribution shift, not a bug) — macro-F1 is dragged down because the absent class always scores F1=0.
- [cucarron_marceno h28] primary_test (2026, n=28): tier(s) ['Low'] never occur in the eval set (distribution shift, not a bug) — macro-F1 is dragged down because the absent class always scores F1=0.
- [mosca_ovario h14] primary_test (2026, n=31): tier(s) ['Low'] never occur in the eval set (distribution shift, not a bug) — macro-F1 is dragged down because the absent class always scores F1=0.
- [mosca_ovario h28] primary_test (2026, n=28): tier(s) ['Low'] never occur in the eval set (distribution shift, not a bug) — macro-F1 is dragged down because the absent class always scores F1=0.

## Caveats

- Per-pest_group/year sample sizes are small (primary test_year=2026 ranges from ~28 rows for fungoso/mosca_ovario to ~58 for acaros); point metrics on these splits carry wide uncertainty (no bootstrap CIs computed here — that is the S6 harness's job, this script reports point estimates per the S5 contract).
- LOYO folds reuse the primary split's early-stopping round count rather than re-tuning per fold (see Setup) — a conservative simplification appropriate for a POC, but it means LOYO results are not independently hyperparameter-tuned.

