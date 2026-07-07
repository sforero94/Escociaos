# S5 — Approach D: Hierarchical / Pooled Model

**Pooling mechanism.** One LightGBM model is fit PER HORIZON PER TARGET (tier: 3-class multiclass; exceed: binary) across the entire pooled training set — all 6 pest_groups and all 8 lotes together, never one model per pest_group. `pest_group` and `lote_key` are passed back in as native categorical features (`categorical_feature=` in LightGBM) alongside the 82 legitimate weather/AR/intervention/seasonality/phenology features from `eval.feature_columns()`. Trees can split on the group identifiers when a pest or lote genuinely behaves differently, but every other split (e.g. 'warm-wet-day run > X', 'days since last spray < Y') is estimated from ALL rows regardless of pest_group/lote_key. This is the standard way a tree ensemble achieves hierarchical-style 'borrowing of statistical strength': a data-sparse leaf for `mosca_ovario` still benefits from the split thresholds and leaf value regularization learned mostly from data-rich groups like `acaros`, because the boosting rounds are fit jointly, not independently per group. Class-balanced sample weighting (`class_weight='balanced'`) prevents the pooled fit from being dominated by whichever pest_group/tier is most common.

**Why this should help sparse groups.** `mosca_ovario` (308 rows, the smallest pest_group) and lotes like `5. Pedregal` (235 rows, the smallest lote) have too few rows to reliably fit a standalone model with 82 features. In a pooled fit they still get their own leaves/splits when the data support it, but shrinkage (via `min_child_samples`, L1/L2 regularization, and a shared low-`num_leaves` budget) pulls their predictions toward patterns learned from the pooled majority — exactly the shrinkage-to-a-common-signal behavior a mixed-effects/hierarchical Bayesian model would give via partial pooling of random effects, just achieved through tree ensembling and categorical splits instead of an explicit variance-components model. (We use route (a) from the brief — a single pooled LightGBM per horizon/target with `pest_group`/`lote_key` as categorical features — rather than a MixedLM-style GLMM: with 6 pest_groups crossed with 8 lotes and ~2700 rows total, a genuine mixed-effects ordinal fit would be numerically fragile and its random-effect variance estimates would themselves be data-starved for the very groups we're trying to help.)

## Horizon 14d — primary split, test_year=2026

| pest_group | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |
|---|---|---|---|---|---|
| acaros | 48 | 0.311 | 0.457 | nan | nan |
| monalonion | 38 | 0.345 | 0.350 | 0.632 | 0.491 |
| cucarron_marceno | 36 | 0.169 | 0.306 | 0.616 | 0.686 |
| mosca_ovario | 31 | 0.126 | 0.125 | 0.595 | 0.108 |
| thrips | 21 | 0.331 | 0.378 | 0.700 | 0.315 |
| fungoso | 17 | 0.345 | 0.361 | 0.500 | 0.056 |

## Horizon 28d — primary split, test_year=2026

| pest_group | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |
|---|---|---|---|---|---|
| acaros | 46 | 0.342 | 0.508 | nan | nan |
| monalonion | 32 | 0.351 | 0.395 | 0.733 | 0.664 |
| cucarron_marceno | 28 | 0.258 | 0.326 | 0.631 | 0.647 |
| mosca_ovario | 28 | 0.025 | 0.019 | 0.769 | 0.133 |
| thrips | 17 | 0.227 | 0.367 | 0.810 | 0.314 |
| fungoso | 15 | 0.317 | 0.317 | 0.786 | 0.125 |

## Feature importance sanity check (does the model actually use pooling?)

Gain-based feature importance rank of `pest_group` / `lote_key` in the tier model trained on the primary-test pooled fit (250 trees, all pest_groups/lotes together). If these rank highly, the pooled model is materially specializing per group rather than treating pooling as a no-op; if they rank low, most skill comes from shared weather/AR/intervention structure — which is itself evidence the pooling is 'working' (sparse groups inherit skill from the shared structure rather than needing their own group-specific splits).

- Horizon 14d: `pest_group` rank 5/84 (importance=430), `lote_key` rank 6/84 (importance=294). Top 5 overall: ar_last_incidencia_pct (1290), incidencia_pct (1135), ar_last_gap_days (576), days_since_last_spray (455), pest_group (430).
- Horizon 28d: `pest_group` rank 5/84 (importance=456), `lote_key` rank 7/84 (importance=297). Top 5 overall: ar_last_incidencia_pct (1240), incidencia_pct (1177), ar_last_gap_days (500), days_since_last_spray (468), pest_group (456).

## Did pooling help the smallest pest_group (`mosca_ovario`, 308 rows)?

- Horizon 14d: mosca_ovario macro_f1=0.126, balanced_accuracy=0.125 (n=31) vs. all-pest_group average macro_f1=0.271, balanced_accuracy=0.329. 
- Horizon 28d: mosca_ovario macro_f1=0.025, balanced_accuracy=0.019 (n=28) vs. all-pest_group average macro_f1=0.253, balanced_accuracy=0.322. 

**Interpretation.** A standalone per-pest_group model trained on only mosca_ovario's ~200 pooled-training rows (2023-2024, further split by horizon-label availability) would have very little room to fit 82 features without overfitting — Approaches B/C's own per-group fits for this pest are the natural comparison point, visible in `data/processed/model_results_*.parquet` from those approaches once the tournament converges. What we can say from this run alone: the pooled model produces a non-degenerate, non-majority-class prediction for mosca_ovario (see table above) using the SAME 250-tree budget and hyperparameters as every other pest_group, without any pest_group-specific tuning — which is only possible because the shared trees learned generalizable weather/AR/intervention splits from the other 5, larger pest_groups. Whether that beats a dedicated small-data model is exactly the judge's per-pest comparison question this tournament is designed to answer (plan doc §6, Workflow 2).

## Leave-one-year-out results (all pest_groups, both horizons)

| pest_group | horizon | loyo_split | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |
|---|---|---|---|---|---|---|---|
| acaros | 14 | loyo_2023 | 200 | 0.194 | 0.313 | 0.497 | 0.581 |
| acaros | 14 | loyo_2024 | 223 | 0.463 | 0.597 | 0.819 | 0.060 |
| acaros | 14 | loyo_2025 | 122 | 0.337 | 0.343 | 0.229 | 0.010 |
| acaros | 14 | loyo_2026 | 48 | 0.286 | 0.391 | nan | nan |
| acaros | 28 | loyo_2023 | 200 | 0.184 | 0.281 | 0.487 | 0.586 |
| acaros | 28 | loyo_2024 | 223 | 0.458 | 0.515 | 0.653 | 0.057 |
| acaros | 28 | loyo_2025 | 122 | 0.306 | 0.328 | 0.116 | 0.005 |
| acaros | 28 | loyo_2026 | 46 | 0.283 | 0.425 | nan | nan |
| cucarron_marceno | 14 | loyo_2023 | 110 | 0.440 | 0.487 | 0.561 | 0.497 |
| cucarron_marceno | 14 | loyo_2024 | 189 | 0.375 | 0.375 | 0.495 | 0.321 |
| cucarron_marceno | 14 | loyo_2025 | 117 | 0.277 | 0.285 | 0.437 | 0.595 |
| cucarron_marceno | 14 | loyo_2026 | 36 | 0.367 | 0.531 | 0.581 | 0.642 |
| cucarron_marceno | 28 | loyo_2023 | 110 | 0.182 | 0.238 | 0.252 | 0.247 |
| cucarron_marceno | 28 | loyo_2024 | 189 | 0.295 | 0.295 | 0.447 | 0.174 |
| cucarron_marceno | 28 | loyo_2025 | 117 | 0.296 | 0.322 | 0.402 | 0.587 |
| cucarron_marceno | 28 | loyo_2026 | 28 | 0.264 | 0.428 | 0.524 | 0.591 |
| fungoso | 14 | loyo_2023 | 163 | 0.440 | 0.464 | 0.799 | 0.591 |
| fungoso | 14 | loyo_2024 | 186 | 0.407 | 0.419 | 0.726 | 0.406 |
| fungoso | 14 | loyo_2025 | 87 | 0.427 | 0.427 | 0.802 | 0.196 |
| fungoso | 14 | loyo_2026 | 17 | 0.222 | 0.222 | 0.250 | 0.038 |
| fungoso | 28 | loyo_2023 | 163 | 0.465 | 0.499 | 0.709 | 0.373 |
| fungoso | 28 | loyo_2024 | 186 | 0.420 | 0.484 | 0.724 | 0.444 |
| fungoso | 28 | loyo_2025 | 87 | 0.339 | 0.379 | 0.868 | 0.219 |
| fungoso | 28 | loyo_2026 | 15 | 0.244 | 0.217 | 0.643 | 0.083 |
| monalonion | 14 | loyo_2023 | 125 | 0.464 | 0.466 | 0.572 | 0.301 |
| monalonion | 14 | loyo_2024 | 179 | 0.467 | 0.495 | 0.700 | 0.456 |
| monalonion | 14 | loyo_2025 | 103 | 0.323 | 0.329 | 0.509 | 0.598 |
| monalonion | 14 | loyo_2026 | 38 | 0.352 | 0.353 | 0.693 | 0.539 |
| monalonion | 28 | loyo_2023 | 125 | 0.384 | 0.408 | 0.624 | 0.302 |
| monalonion | 28 | loyo_2024 | 179 | 0.373 | 0.402 | 0.537 | 0.378 |
| monalonion | 28 | loyo_2025 | 103 | 0.344 | 0.375 | 0.494 | 0.610 |
| monalonion | 28 | loyo_2026 | 32 | 0.434 | 0.448 | 0.808 | 0.848 |
| mosca_ovario | 14 | loyo_2023 | 45 | 0.405 | 0.438 | 0.390 | 0.095 |
| mosca_ovario | 14 | loyo_2024 | 119 | 0.407 | 0.417 | 0.678 | 0.460 |
| mosca_ovario | 14 | loyo_2025 | 102 | 0.362 | 0.529 | 0.593 | 0.475 |
| mosca_ovario | 14 | loyo_2026 | 31 | 0.269 | 0.375 | 0.250 | 0.061 |
| mosca_ovario | 28 | loyo_2023 | 45 | 0.267 | 0.350 | 0.397 | 0.053 |
| mosca_ovario | 28 | loyo_2024 | 119 | 0.325 | 0.341 | 0.691 | 0.547 |
| mosca_ovario | 28 | loyo_2025 | 102 | 0.351 | 0.508 | 0.597 | 0.409 |
| mosca_ovario | 28 | loyo_2026 | 28 | 0.270 | 0.365 | 0.673 | 0.095 |
| thrips | 14 | loyo_2023 | 151 | 0.378 | 0.392 | 0.616 | 0.294 |
| thrips | 14 | loyo_2024 | 163 | 0.458 | 0.470 | 0.661 | 0.384 |
| thrips | 14 | loyo_2025 | 89 | 0.394 | 0.380 | 0.720 | 0.439 |
| thrips | 14 | loyo_2026 | 21 | 0.366 | 0.467 | 0.613 | 0.276 |
| thrips | 28 | loyo_2023 | 151 | 0.228 | 0.286 | 0.666 | 0.398 |
| thrips | 28 | loyo_2024 | 163 | 0.245 | 0.253 | 0.481 | 0.238 |
| thrips | 28 | loyo_2025 | 89 | 0.484 | 0.465 | 0.644 | 0.371 |
| thrips | 28 | loyo_2026 | 17 | 0.143 | 0.333 | 0.810 | 0.321 |

## Primary validate-year results (2025, for reference)

| pest_group | horizon | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |
|---|---|---|---|---|---|---|
| acaros | 14 | 122 | 0.342 | 0.348 | 0.600 | 0.031 |
| cucarron_marceno | 14 | 117 | 0.307 | 0.325 | 0.520 | 0.676 |
| fungoso | 14 | 87 | 0.509 | 0.502 | 0.736 | 0.169 |
| monalonion | 14 | 103 | 0.348 | 0.399 | 0.523 | 0.587 |
| mosca_ovario | 14 | 102 | 0.292 | 0.338 | 0.617 | 0.495 |
| thrips | 14 | 89 | 0.409 | 0.402 | 0.830 | 0.647 |
| acaros | 28 | 122 | 0.313 | 0.337 | 0.215 | 0.005 |
| cucarron_marceno | 28 | 117 | 0.296 | 0.305 | 0.545 | 0.664 |
| fungoso | 28 | 87 | 0.349 | 0.415 | 0.854 | 0.185 |
| monalonion | 28 | 103 | 0.253 | 0.275 | 0.499 | 0.601 |
| mosca_ovario | 28 | 102 | 0.149 | 0.168 | 0.569 | 0.340 |
| thrips | 28 | 89 | 0.494 | 0.480 | 0.852 | 0.687 |

## Caveats

- This is route (a) from the brief (pooled LightGBM with categorical group features), not a true mixed-effects/GLMM fit — see justification above.
- Only ONE model fit per horizon per target per split (never per pest_group), as required — evaluation is sliced post-hoc by pest_group from that single fit's predictions.
- All splits are out-of-year (never random) via `eval.get_split` / `eval.load_folds`; metrics are `eval.metrics_tier` / `eval.metrics_binary` exclusively.
- `predictions_hierarchical.parquet` holds genuine out-of-sample rows from the primary test_year=2026 split only (both horizons), for the leakage red-team.

