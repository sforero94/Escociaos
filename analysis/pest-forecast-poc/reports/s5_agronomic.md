# S5 — Approach A: Agronomic-index + Calibration

Tournament candidate **A** (plan doc §6, Workflow 2). One biologically-motivated scalar risk index per pest_group, built from raw weather-derived trailing-window features already in the frozen panel (no new raw aggregation) plus an autoregressive state component and, for phenology-driven pests, a floración component — then calibrated to tier probabilities per pest_group x horizon via an ordinal logistic regression (statsmodels `OrderedModel`), with a per-threshold binary-logistic fallback when the ordinal fit fails to converge. Not pooled across pest_groups.

## Index construction rationale (per pest_group)

| pest_group | drivers (trailing window matched to horizon: w14 for +14d, w28 for +28d) | agronomic rationale |
|---|---|---|
| acaros | hot_dry_days, hot_dry_max_run, temp_c_max_mean, gdd_sum | Mites (Tetranychidae) flare under hot, dry conditions; degree-days accelerate their reproduction rate. |
| fungoso | warm_wet_days, warm_wet_max_run, rain_sum, humedad_pct_avg_mean, gdd_sum | Colletotrichum/Antracnosis/Cladosporium spores need a warm, moist leaf/fruit surface to germinate; consecutive wet-day runs matter more than total rain. |
| cucarron_marceno | rain_sum, rain_days, gdd_sum, warm_wet_days | Cucarrón marceño emergence is triggered by the onset of rains after the dry season; soil warming (GDD) speeds pupal development. |
| monalonion | humedad_pct_avg_mean, humedad_pct_max_mean, warm_wet_days + floración `brotes` (DB-era) | Highland flagship pest; humidity-driven, feeds preferentially on tender new shoots (brotes). |
| thrips | hot_dry_days, temp_c_max_mean + floración `flor_madura`/`cuaje` (DB-era) | Warm/dry conditions favor population buildup; thrips feed on and shelter in flower tissue, so bloom stage matters when known. |
| mosca_ovario | humedad_pct_avg_mean, warm_wet_days + floración `cuaje`/`flor_madura` (DB-era) | Ovary fly oviposits in flower/fruit-set tissue — phenology is the primary driver, weather a secondary modulator. |

Every group also includes a `state` component (0.5 x z-score of `ar_last_incidencia_pct` + 0.5 x z-score of current `incidencia_pct`) — the current reading is a legitimate input (not future-label leakage) and is agronomically the strongest single predictor of near-term trajectory for an already-present pest.

**NaN handling**: all z-scoring uses TRAIN-split mean/std only (re-fit per split, since train years differ across primary/leave-one-year-out folds). NaN values (`ar_last_incidencia_pct` on a series' first observation; floración fields pre-2025) are imputed to the train mean, i.e. z-score 0 — a neutral contribution, not a fabricated signal. For monalonion/thrips/mosca_ovario, a `floracion_available` flag is passed to the calibrator alongside the phenology index so it can learn the correct level-shift for pre-2025 rows where bloom stage is simply unmeasured rather than genuinely absent.

## Primary split — test year 2026 (train=2023-2024)

Includes an explicit **skill-vs-best-baseline** comparison against the frozen S4 baselines (`data/processed/baselines.parquet`, pre-registered before any modeling — read here, not recomputed). The plan doc's go/no-go margin is >=0.05 absolute macro-F1 or >=0.05 absolute PR-AUC over the best baseline.

| pest_group | horizon | macro_f1 | Δ vs best baseline (F1) | balanced_acc | roc_auc | pr_auc | Δ vs best baseline (PR-AUC) | n |
|---|---|---|---|---|---|---|---|---|
| acaros | 14 | 0.297 | -0.029 | 0.402 | nan | nan | nan | 48 |
| cucarron_marceno | 14 | 0.274 | -0.174 | 0.400 | 0.569 | 0.658 | -0.126 | 36 |
| fungoso | 14 | 0.262 | -0.014 | 0.306 | 0.812 | 0.125 | -0.446 | 17 |
| monalonion | 14 | 0.247 | -0.097 | 0.333 | 0.672 | 0.552 | -0.145 | 38 |
| mosca_ovario | 14 | 0.206 | -0.085 | 0.232 | 0.333 | 0.076 | -0.473 | 31 |
| thrips | 14 | 0.229 | -0.099 | 0.344 | 0.625 | 0.328 | -0.292 | 21 |
| acaros | 28 | 0.310 | +0.000 | 0.500 | nan | nan | nan | 46 |
| cucarron_marceno | 28 | 0.284 | -0.039 | 0.452 | 0.636 | 0.779 | -0.025 | 28 |
| fungoso | 28 | 0.250 | -0.035 | 0.300 | 0.286 | 0.045 | -0.505 | 15 |
| monalonion | 28 | 0.245 | -0.139 | 0.378 | 0.804 | 0.756 | +0.022 | 32 |
| mosca_ovario | 28 | 0.104 | -0.196 | 0.096 | 0.452 | 0.079 | -0.457 | 28 |
| thrips | 28 | 0.127 | -0.087 | 0.333 | 0.405 | 0.139 | -0.511 | 17 |

## Primary split — validate year 2025 (train=2023-2024)

| pest_group | horizon | macro_f1 | balanced_acc | roc_auc | pr_auc | n |
|---|---|---|---|---|---|---|
| acaros | 14 | 0.318 | 0.355 | 0.496 | 0.016 | 122 |
| cucarron_marceno | 14 | 0.324 | 0.326 | 0.587 | 0.736 | 117 |
| fungoso | 14 | 0.312 | 0.326 | 0.438 | 0.065 | 87 |
| monalonion | 14 | 0.292 | 0.360 | 0.502 | 0.592 | 103 |
| mosca_ovario | 14 | 0.268 | 0.346 | 0.569 | 0.372 | 102 |
| thrips | 14 | 0.331 | 0.387 | 0.636 | 0.486 | 89 |
| acaros | 28 | 0.287 | 0.322 | 0.223 | 0.005 | 122 |
| cucarron_marceno | 28 | 0.248 | 0.288 | 0.412 | 0.559 | 117 |
| fungoso | 28 | 0.274 | 0.281 | 0.352 | 0.050 | 87 |
| monalonion | 28 | 0.265 | 0.370 | 0.580 | 0.699 | 103 |
| mosca_ovario | 28 | 0.218 | 0.293 | 0.391 | 0.217 | 102 |
| thrips | 28 | 0.227 | 0.333 | 0.305 | 0.166 | 89 |

## Leave-one-year-out (macro-F1)

| pest_group | horizon | loyo_test_year | macro_f1 | n |
|---|---|---|---|---|
| acaros | 14 | 2023 | 0.296 | 200 |
| acaros | 14 | 2024 | 0.613 | 223 |
| acaros | 14 | 2025 | 0.312 | 122 |
| acaros | 14 | 2026 | 0.443 | 48 |
| acaros | 28 | 2023 | 0.317 | 200 |
| acaros | 28 | 2024 | 0.639 | 223 |
| acaros | 28 | 2025 | 0.272 | 122 |
| acaros | 28 | 2026 | 0.310 | 46 |
| cucarron_marceno | 14 | 2023 | 0.267 | 110 |
| cucarron_marceno | 14 | 2024 | 0.231 | 189 |
| cucarron_marceno | 14 | 2025 | 0.327 | 117 |
| cucarron_marceno | 14 | 2026 | 0.331 | 36 |
| cucarron_marceno | 28 | 2023 | 0.256 | 110 |
| cucarron_marceno | 28 | 2024 | 0.114 | 189 |
| cucarron_marceno | 28 | 2025 | 0.244 | 117 |
| cucarron_marceno | 28 | 2026 | 0.379 | 28 |
| fungoso | 14 | 2023 | 0.391 | 163 |
| fungoso | 14 | 2024 | 0.498 | 186 |
| fungoso | 14 | 2025 | 0.287 | 87 |
| fungoso | 14 | 2026 | 0.276 | 17 |
| fungoso | 28 | 2023 | 0.355 | 163 |
| fungoso | 28 | 2024 | 0.484 | 186 |
| fungoso | 28 | 2025 | 0.256 | 87 |
| fungoso | 28 | 2026 | 0.267 | 15 |
| monalonion | 14 | 2023 | 0.322 | 125 |
| monalonion | 14 | 2024 | 0.224 | 179 |
| monalonion | 14 | 2025 | 0.293 | 103 |
| monalonion | 14 | 2026 | 0.189 | 38 |
| monalonion | 28 | 2023 | 0.309 | 125 |
| monalonion | 28 | 2024 | 0.184 | 179 |
| monalonion | 28 | 2025 | 0.267 | 103 |
| monalonion | 28 | 2026 | 0.213 | 32 |
| mosca_ovario | 14 | 2023 | 0.297 | 45 |
| mosca_ovario | 14 | 2024 | 0.290 | 119 |
| mosca_ovario | 14 | 2025 | 0.364 | 102 |
| mosca_ovario | 14 | 2026 | 0.291 | 31 |
| mosca_ovario | 28 | 2023 | 0.260 | 45 |
| mosca_ovario | 28 | 2024 | 0.243 | 119 |
| mosca_ovario | 28 | 2025 | 0.306 | 102 |
| mosca_ovario | 28 | 2026 | 0.314 | 28 |
| thrips | 14 | 2023 | 0.193 | 151 |
| thrips | 14 | 2024 | 0.316 | 163 |
| thrips | 14 | 2025 | 0.364 | 89 |
| thrips | 14 | 2026 | 0.229 | 21 |
| thrips | 28 | 2023 | 0.185 | 151 |
| thrips | 28 | 2024 | 0.284 | 163 |
| thrips | 28 | 2025 | 0.231 | 89 |
| thrips | 28 | 2026 | 0.127 | 17 |

## Notes / anomalies

- No splits were skipped for insufficient data.

- Rough read on signal (primary test year, macro_f1): acaros(h14)=0.30, cucarron_marceno(h14)=0.27, fungoso(h14)=0.26, monalonion(h14)=0.25, mosca_ovario(h14)=0.21, thrips(h14)=0.23, acaros(h28)=0.31, cucarron_marceno(h28)=0.28, fungoso(h28)=0.25, monalonion(h28)=0.25, mosca_ovario(h28)=0.10, thrips(h28)=0.13

- **No (pest_group, horizon) combination cleared the pre-registered go/no-go margin** against the best S4 baseline on the primary test year under this approach. On macro-F1 specifically, this agronomic-index calibrator underperforms the best baseline (usually climatology or persistence) for nearly every pest_group/horizon — the 3-tier argmax decision is where it loses ground, even where the underlying binary 'exceed' score shows real ranking ability (see roc_auc/pr_auc: fungoso h14 roc_auc=0.81, monalonion h28 roc_auc=0.80/pr_auc=0.76, cucarron_marceno h28 pr_auc=0.78). This suggests the index+ordinal-calibrator combination captures *some* ordering signal but the fitted cutpoints do not translate it into better hard tier assignments than a simple week-of-year climatology, at least at this sample size (17-48 test rows per pest_group/horizon in 2026).

- **acaros**: `roc_auc`/`pr_auc` are NaN on the primary test year because `exceed_h14`/`exceed_h28` has a single class in 2026 (no High-tier rounds observed within the label horizon) — `eval.metrics_binary` correctly returns NaN rather than a misleading single-class AUC; this is a test-year data characteristic, not a modeling failure.

- **mosca_ovario h28** is the weakest combination (macro_f1=0.104, well below baseline and near the low end of all combinations tested) — the floración-phenology signal this pest_group's index leans on is only available from 2025 onward, so the primary-split calibrator (trained on 2023-2024, entirely pre-DB / floración-unavailable years) never actually learns from real phenology data; it is trained almost entirely off the `state` and weather components with the `pheno` term at its neutral (z=0) value. The leave-one-year-out folds that include 2025/2026 in training fare better on this pest_group (see table above), consistent with this explanation.
