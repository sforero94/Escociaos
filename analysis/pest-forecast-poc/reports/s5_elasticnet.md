# S5 — Approach C: Penalized Ordinal / Elastic-Net Regression

**Tournament candidate C** (of 4 independent approaches — plan doc section 6, Workflow 2). This is the 'simple-plus' linear model: the strongest, most carefully-regularized linear baseline, valued for interpretability.

## Approach chosen

A **hybrid** of the two options offered in the brief:

- **3-tier target (Low<Med<High):** true ordinal logistic regression via `statsmodels.miscmodels.ordinal_model.OrderedModel(distr='logit')` — respects the tier ordering, unlike unordered multinomial logistic. statsmodels has no built-in elastic-net for this model class (`fit_regularized` is not implemented for `OrderedModel` — checked directly), so regularization is via **correlation-pruning feature selection on the training split only**: rank all 82+ engineered features by |Pearson r| with the ordinal-coded label, greedily keep up to 12, skipping any candidate with |r|>0.85 against an already-kept feature. Fallback chain on non-convergence: 12 -> 6 -> 3 features -> plain L2 multinomial logistic (never triggered in this run — see console log).
- **Binary 'exceed high tier' target:** real elastic-net via `sklearn.linear_model.LogisticRegression(penalty='elasticnet', solver='saga')` on the full feature set (elastic-net does its own sparsification), `class_weight='balanced'`.

## Regularization strength selection

`(C, l1_ratio)` for the binary elastic-net were grid-searched (C in [0.01, 0.1, 1.0, 10.0], l1_ratio in [0.0, 0.2, 0.5, 0.8, 1.0]) **once per (pest_group, horizon)**, fitting on the primary split's train_years=[2023,2024] and scoring on validate_year=2025 — test_year=2026 was never used for tuning. The scoring criterion is **mean(ROC-AUC, PR-AUC)**, not PR-AUC alone: pure PR-AUC was empirically found to be maximized, on several small class-imbalanced validate sets (~100 rows), by the degenerate ALL-ZERO-COEFFICIENT (intercept-only) elastic-net solution — verified directly (e.g. cucarron_marceno h14: PR-AUC=0.816 with 0 non-zero coefficients vs. 0.756 for the best actually-discriminative model in the same grid), a known artifact of PR-AUC under small, imbalanced samples rather than real skill. ROC-AUC of a constant-score model is always exactly 0.5, so averaging the two metrics guards against selecting a no-skill intercept-only model. The same chosen `(C, l1_ratio)` is reused for that pest_group/horizon's primary-test evaluation AND all four leave-one-year-out folds (each refits the model on its own train_years, but does not re-tune hyperparameters — a documented simplification since LOYO folds have no natural inner validate year and their purpose is robustness-checking, not re-tuning).

The ordinal model's 'regularization strength' is the feature-count cap (12, with the 12->6->3 fallback chain) rather than a continuous penalty — a deliberate dimensionality-reduction stand-in for elastic-net, as the brief allows.

## Preprocessing

- Current-round `tier` (Low/Med/High) ordinally encoded 0/1/2 (legitimate input, not label leakage — see `eval.py`).
- Boolean flags (`intervention_coverage_unknown`, `floracion_available`) cast to 0/1.
- `floracion_*` columns (NaN pre-2025) imputed to 0; `floracion_available` already flags missingness so no extra indicator was added for these.
- All other NaN-bearing columns (`ar_last_incidencia_pct`, `ar_last_gap_days`, `days_since_last_spray`, `spray_count_w{7,14,21,28}`) median-imputed using the CURRENT SPLIT's training-years median only, with a companion `{col}_missing` binary indicator.
- `StandardScaler` fit ONLY on the split's training rows, applied to eval — never fit on validate/test data, at any stage (imputation, correlation ranking, scaling, hyperparameter search all use training years exclusively).
- Fit and evaluated **separately per pest_group** (no pooling across pest_groups — that is Approach D's job).

## Primary split — test_year=2026 metrics (out-of-sample, never touched during tuning)

### Horizon 14d

| pest_group | macro_f1 | balanced_acc | roc_auc | pr_auc | n_eval_rows |
|---|---|---|---|---|---|
| acaros | 0.283 | 0.370 | nan | nan | 48 |
| cucarron_marceno | 0.035 | 0.031 | 0.492 | 0.511 | 36 |
| fungoso | 0.157 | 0.139 | 0.375 | 0.045 | 17 |
| monalonion | 0.189 | 0.333 | 0.500 | 0.697 | 38 |
| mosca_ovario | 0.118 | 0.107 | 0.500 | 0.548 | 31 |
| thrips | 0.258 | 0.256 | 0.588 | 0.408 | 21 |

### Horizon 28d

| pest_group | macro_f1 | balanced_acc | roc_auc | pr_auc | n_eval_rows |
|---|---|---|---|---|---|
| acaros | 0.310 | 0.500 | nan | nan | 46 |
| cucarron_marceno | 0.000 | 0.000 | 0.500 | 0.804 | 28 |
| fungoso | 0.242 | 0.500 | 0.071 | 0.036 | 15 |
| monalonion | 0.159 | 0.333 | 0.500 | 0.734 | 32 |
| mosca_ovario | 0.104 | 0.096 | 0.500 | 0.536 | 28 |
| thrips | 0.271 | 0.433 | 0.690 | 0.231 | 17 |

## Primary split — validate_year=2025 metrics (also used for binary hyperparameter tuning)

### Horizon 14d

| pest_group | macro_f1 | balanced_acc | roc_auc | pr_auc | n_eval_rows |
|---|---|---|---|---|---|
| acaros | 0.294 | 0.329 | 0.750 | 0.045 | 122 |
| cucarron_marceno | 0.333 | 0.345 | 0.596 | 0.756 | 117 |
| fungoso | 0.379 | 0.396 | 0.941 | 0.441 | 87 |
| monalonion | 0.262 | 0.313 | 0.500 | 0.801 | 103 |
| mosca_ovario | 0.365 | 0.532 | 0.500 | 0.647 | 102 |
| thrips | 0.340 | 0.357 | 0.778 | 0.742 | 89 |

### Horizon 28d

| pest_group | macro_f1 | balanced_acc | roc_auc | pr_auc | n_eval_rows |
|---|---|---|---|---|---|
| acaros | 0.340 | 0.370 | 0.719 | 0.014 | 122 |
| cucarron_marceno | 0.246 | 0.238 | 0.500 | 0.803 | 117 |
| fungoso | 0.373 | 0.377 | 0.874 | 0.208 | 87 |
| monalonion | 0.197 | 0.261 | 0.500 | 0.816 | 103 |
| mosca_ovario | 0.246 | 0.354 | 0.500 | 0.637 | 102 |
| thrips | 0.582 | 0.575 | 0.754 | 0.522 | 89 |

## Leave-one-year-out folds — macro_f1 / pr_auc by test_year

### Horizon 14d

| pest_group | loyo_2023 | loyo_2024 | loyo_2025 | loyo_2026 |
|---|---|---|---|---|
| acaros | f1=0.252/pr=0.602 | f1=0.257/pr=0.012 | f1=0.250/pr=0.061 | f1=0.548/pr=nan |
| cucarron_marceno | f1=0.461/pr=0.773 | f1=0.241/pr=0.272 | f1=0.304/pr=0.792 | f1=0.238/pr=0.508 |
| fungoso | f1=0.279/pr=0.450 | f1=0.347/pr=0.538 | f1=0.386/pr=0.427 | f1=0.139/pr=0.042 |
| monalonion | f1=0.324/pr=0.632 | f1=0.401/pr=0.668 | f1=0.347/pr=0.801 | f1=0.354/pr=0.697 |
| mosca_ovario | f1=0.393/pr=0.120 | f1=0.266/pr=0.681 | f1=0.346/pr=0.463 | f1=0.298/pr=0.070 |
| thrips | f1=0.244/pr=0.217 | f1=0.390/pr=0.367 | f1=0.305/pr=0.718 | f1=0.128/pr=0.418 |

### Horizon 28d

| pest_group | loyo_2023 | loyo_2024 | loyo_2025 | loyo_2026 |
|---|---|---|---|---|
| acaros | f1=0.270/pr=0.715 | f1=0.161/pr=0.300 | f1=0.275/pr=0.012 | f1=0.442/pr=nan |
| cucarron_marceno | f1=0.358/pr=0.682 | f1=0.304/pr=0.603 | f1=0.252/pr=0.803 | f1=0.252/pr=0.804 |
| fungoso | f1=0.376/pr=0.488 | f1=0.323/pr=0.511 | f1=0.397/pr=0.212 | f1=0.250/pr=0.036 |
| monalonion | f1=0.320/pr=0.624 | f1=0.302/pr=0.687 | f1=0.271/pr=0.816 | f1=0.280/pr=0.734 |
| mosca_ovario | f1=0.344/pr=0.076 | f1=0.161/pr=0.676 | f1=0.302/pr=0.371 | f1=0.267/pr=0.096 |
| thrips | f1=0.246/pr=0.252 | f1=0.204/pr=0.345 | f1=0.579/pr=0.599 | f1=0.100/pr=0.260 |

## Interpretability — top-5 highest-magnitude coefficients (primary-split model, test_year=2026 fit uses train=[2023,2024])

Ordinal-model coefficients: positive = higher feature value pushes toward a higher (worse) tier. Binary elastic-net coefficients: positive = higher feature value pushes toward exceeding the High-tier threshold. All coefficients are on STANDARDIZED (z-scored) feature scales, so magnitudes are directly comparable within a model.

### acaros — horizon 14d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w28_hot_dry_max_run | -3.5408 |
| w21_hot_dry_days | 2.6570 |
| incidencia_pct | 1.7461 |
| ar_last_incidencia_pct | 1.0348 |
| w14_viento_kmh_avg_mean | 1.0251 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| incidencia_pct | 1.1836 |
| w28_warm_wet_max_run | 1.0394 |
| w28_viento_kmh_avg_mean | 0.9721 |
| week_sin | -0.8869 |
| ar_last_incidencia_pct | 0.8840 |

### acaros — horizon 28d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w28_hot_dry_days | -3.0461 |
| w21_hot_dry_max_run | 2.2382 |
| incidencia_pct | 1.7468 |
| ar_last_incidencia_pct | 1.3330 |
| w28_viento_kmh_avg_mean | 0.8144 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| w14_rafaga_kmh_max_mean | 1.9592 |
| w21_warm_wet_days | 1.5342 |
| w28_rafaga_kmh_max_mean | 1.3356 |
| w7_rafaga_kmh_max_mean | -1.3197 |
| w21_warm_wet_max_run | -1.2756 |

### cucarron_marceno — horizon 14d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| week_sin | -0.7341 |
| w21_warm_wet_days | 0.5173 |
| days_since_last_spray | 0.4483 |
| w7_hot_dry_days | 0.4063 |
| w21_rafaga_kmh_max_mean | -0.3882 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| week_sin | -0.1026 |
| w21_warm_wet_days | 0.0700 |
| w21_warm_wet_max_run | 0.0682 |
| incidencia_pct | 0.0610 |
| w14_warm_wet_max_run | 0.0248 |

### cucarron_marceno — horizon 28d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w28_rafaga_kmh_max_mean | -1.4518 |
| w28_temp_c_avg_mean | 1.0496 |
| w28_hot_dry_days | -0.8124 |
| week_sin | -0.7529 |
| incidencia_pct | 0.5858 |

**Binary elastic-net (exceed) model:**

_At the tuned regularization strength, elastic-net drove ALL coefficients to zero (intercept-only / no-skill model) — see the regularization-strength note above; this is a genuine null result for this pest_group/horizon, not missing data._

### fungoso — horizon 14d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w28_hot_dry_days | -3.4645 |
| w21_hot_dry_days | -0.9367 |
| week_sin | 0.9350 |
| spray_count_w28 | 0.8141 |
| tier | 0.6186 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| week_sin | 0.7771 |
| w28_viento_kmh_avg_mean | 0.4343 |
| ar_last_incidencia_pct | 0.3543 |
| tier | 0.3449 |
| w28_rafaga_kmh_max_mean | -0.2994 |

### fungoso — horizon 28d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w21_hot_dry_days | -3.0632 |
| week_sin | 1.0746 |
| week_cos | 0.8019 |
| tier | 0.7404 |
| spray_count_w28 | 0.6866 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| week_sin | 0.2092 |
| week_cos | 0.2041 |
| ar_last_incidencia_pct | 0.1969 |
| incidencia_pct | 0.1494 |
| w21_viento_kmh_avg_mean | 0.1322 |

### monalonion — horizon 14d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| tier | 0.6245 |
| w28_rain_days | -0.5841 |
| w7_warm_wet_max_run | -0.4105 |
| w28_humedad_pct_avg_mean | 0.3524 |
| w7_rain_days | 0.1953 |

**Binary elastic-net (exceed) model:**

_At the tuned regularization strength, elastic-net drove ALL coefficients to zero (intercept-only / no-skill model) — see the regularization-strength note above; this is a genuine null result for this pest_group/horizon, not missing data._

### monalonion — horizon 28d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w21_humedad_pct_max_mean | 1.1383 |
| w14_rain_days | -0.9052 |
| w7_rain_days | 0.6785 |
| w7_lluvia_total_mm_mean | -0.5890 |
| w28_rain_days | -0.5480 |

**Binary elastic-net (exceed) model:**

_At the tuned regularization strength, elastic-net drove ALL coefficients to zero (intercept-only / no-skill model) — see the regularization-strength note above; this is a genuine null result for this pest_group/horizon, not missing data._

### mosca_ovario — horizon 14d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w28_viento_kmh_avg_mean | -1.2503 |
| w14_viento_kmh_avg_mean | 0.6477 |
| incidencia_pct | 0.6238 |
| w14_humedad_pct_max_mean | 0.4573 |
| w28_warm_wet_days | 0.4446 |

**Binary elastic-net (exceed) model:**

_At the tuned regularization strength, elastic-net drove ALL coefficients to zero (intercept-only / no-skill model) — see the regularization-strength note above; this is a genuine null result for this pest_group/horizon, not missing data._

### mosca_ovario — horizon 28d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w14_viento_kmh_avg_mean | -0.6872 |
| w28_viento_kmh_avg_mean | -0.5839 |
| week_sin | 0.5440 |
| incidencia_pct | 0.5314 |
| ar_last_incidencia_pct | 0.5169 |

**Binary elastic-net (exceed) model:**

_At the tuned regularization strength, elastic-net drove ALL coefficients to zero (intercept-only / no-skill model) — see the regularization-strength note above; this is a genuine null result for this pest_group/horizon, not missing data._

### thrips — horizon 14d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w21_humedad_pct_min_mean | 2.0003 |
| w28_viento_kmh_avg_mean | 1.0602 |
| w7_humedad_pct_min_mean | -0.8990 |
| tier | 0.8560 |
| w14_viento_kmh_avg_mean | 0.4722 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| w28_viento_kmh_avg_mean | 0.6853 |
| tier | 0.3864 |
| week_cos | 0.2779 |
| w7_rain_sum | -0.2746 |
| w7_lluvia_total_mm_mean | -0.2746 |

### thrips — horizon 28d

**Ordinal (tier) model:**

| feature | coefficient |
|---|---|
| w28_hot_dry_days | 3.9430 |
| w21_hot_dry_days | -3.3840 |
| w28_gdd_sum | -1.8642 |
| w28_rain_sum | -0.8930 |
| w21_viento_kmh_avg_mean | 0.8761 |

**Binary elastic-net (exceed) model:**

| feature | coefficient |
|---|---|
| w28_viento_kmh_avg_mean | 0.1571 |
| w21_viento_kmh_avg_mean | 0.1465 |
| week_sin | -0.1211 |
| w28_lluvia_total_mm_mean | -0.1092 |
| w28_rain_sum | -0.1092 |

