# S4 — Pre-registered Baselines Report

**FROZEN BEFORE ANY MODELING** — these numbers are committed to git in this same changeset, before any S5 model has been run, and must not be revised after seeing model results (plan doc section 5/6, Rule C).

## Horizon 14d — primary split (test=2026)

| pest_group | best_baseline | macro_f1 | balanced_acc | roc_auc | pr_auc | n |
|---|---|---|---|---|---|---|
| acaros | persistence | 0.326 | 0.500 | nan | nan | 48 |
| cucarron_marceno | persistence | 0.448 | 0.662 | 0.662 | 0.783 | 36 |
| fungoso | prevalence | 0.276 | 0.333 | 0.500 | 0.529 | 17 |
| monalonion | climatology | 0.344 | 0.400 | 0.591 | 0.591 | 38 |
| mosca_ovario | persistence | 0.291 | 0.429 | 0.429 | 0.048 | 31 |
| thrips | climatology | 0.328 | 0.356 | 0.644 | 0.535 | 21 |

## Horizon 28d — primary split (test=2026)

| pest_group | best_baseline | macro_f1 | balanced_acc | roc_auc | pr_auc | n |
|---|---|---|---|---|---|---|
| acaros | persistence | 0.310 | 0.500 | nan | nan | 46 |
| cucarron_marceno | persistence | 0.323 | 0.476 | 0.521 | 0.732 | 28 |
| fungoso | persistence | 0.285 | 0.283 | 0.464 | 0.033 | 15 |
| monalonion | persistence | 0.384 | 0.392 | 0.590 | 0.662 | 32 |
| mosca_ovario | persistence | 0.301 | 0.442 | 0.442 | 0.036 | 28 |
| thrips | climatology | 0.214 | 0.417 | 0.750 | 0.650 | 17 |

## Leave-one-year-out baselines (best-of-3 macro-F1 per pest_group/horizon/year)

| pest_group | horizon | loyo_test_year | best_baseline | macro_f1 |
|---|---|---|---|---|
| acaros | 14 | 2023 | persistence | 0.392 |
| cucarron_marceno | 14 | 2023 | persistence | 0.500 |
| fungoso | 14 | 2023 | persistence | 0.517 |
| monalonion | 14 | 2023 | persistence | 0.444 |
| mosca_ovario | 14 | 2023 | persistence | 0.371 |
| thrips | 14 | 2023 | persistence | 0.359 |
| acaros | 28 | 2023 | persistence | 0.393 |
| cucarron_marceno | 28 | 2023 | persistence | 0.370 |
| fungoso | 28 | 2023 | persistence | 0.479 |
| monalonion | 28 | 2023 | persistence | 0.411 |
| mosca_ovario | 28 | 2023 | persistence | 0.400 |
| thrips | 28 | 2023 | persistence | 0.340 |
| acaros | 14 | 2024 | persistence | 0.586 |
| cucarron_marceno | 14 | 2024 | persistence | 0.361 |
| fungoso | 14 | 2024 | persistence | 0.589 |
| monalonion | 14 | 2024 | persistence | 0.498 |
| mosca_ovario | 14 | 2024 | persistence | 0.522 |
| thrips | 14 | 2024 | persistence | 0.431 |
| acaros | 28 | 2024 | persistence | 0.591 |
| cucarron_marceno | 28 | 2024 | persistence | 0.322 |
| fungoso | 28 | 2024 | persistence | 0.542 |
| monalonion | 28 | 2024 | persistence | 0.448 |
| mosca_ovario | 28 | 2024 | persistence | 0.458 |
| thrips | 28 | 2024 | climatology | 0.359 |
| acaros | 14 | 2025 | climatology | 0.339 |
| cucarron_marceno | 14 | 2025 | persistence | 0.340 |
| fungoso | 14 | 2025 | persistence | 0.388 |
| monalonion | 14 | 2025 | persistence | 0.361 |
| mosca_ovario | 14 | 2025 | persistence | 0.404 |
| thrips | 14 | 2025 | persistence | 0.508 |
| acaros | 28 | 2025 | persistence | 0.310 |
| cucarron_marceno | 28 | 2025 | climatology | 0.278 |
| fungoso | 28 | 2025 | persistence | 0.313 |
| monalonion | 28 | 2025 | persistence | 0.336 |
| mosca_ovario | 28 | 2025 | persistence | 0.350 |
| thrips | 28 | 2025 | climatology | 0.424 |
| acaros | 14 | 2026 | persistence | 0.326 |
| cucarron_marceno | 14 | 2026 | persistence | 0.448 |
| fungoso | 14 | 2026 | prevalence | 0.276 |
| monalonion | 14 | 2026 | climatology | 0.344 |
| mosca_ovario | 14 | 2026 | prevalence | 0.316 |
| thrips | 14 | 2026 | climatology | 0.328 |
| acaros | 28 | 2026 | persistence | 0.310 |
| cucarron_marceno | 28 | 2026 | persistence | 0.323 |
| fungoso | 28 | 2026 | persistence | 0.285 |
| monalonion | 28 | 2026 | persistence | 0.384 |
| mosca_ovario | 28 | 2026 | prevalence | 0.321 |
| thrips | 28 | 2026 | climatology | 0.214 |
