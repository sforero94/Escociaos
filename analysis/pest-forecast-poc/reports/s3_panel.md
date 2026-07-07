# S3 — Feature + Label Panel Report

**Output:** `data/processed/panel.parquet` — 2735 rows (2759 before min-data rule)
**Folds:** `data/processed/folds.json` — primary split train=[2023, 2024] validate=2025 test=2026, plus leave-one-year-out over [2022, 2023, 2024, 2025, 2026]

## Schema

Unit of prediction: (lote_key, pest_group, fecha). 93 columns — weather trailing-window features (windows [7, 14, 21, 28]d), intervention features, autoregressive last-incidence, floración (DB-era only), seasonality (week sin/cos), and labels tier_h{14,28} / exceed_h{14,28} / gap_days_h{14,28}.

## Pooled pest_group aggregation
Members of a pooled pest_group (acaros, fungoso) collapse to one incidencia_pct per (lote,fecha) via **mean** across whichever members were recorded that round.

## Processing log

- pest_group series: 4180 focus-pest rows -> 2759 (lote,pest_group,fecha) rows after mean-aggregating pooled members
- fumigacion 2023: dropped 1 rows with unparseable FECHA
- UNMAPPED lote raw='nan' — dropped
- UNMAPPED lote raw='nan' — dropped
- UNMAPPED lote raw='nan' — dropped
- UNMAPPED lote raw='nan' — dropped
- UNMAPPED lote raw='nan' — dropped
- fumigacion 2024: dropped 4 rows with unparseable Fecha
- fumigacion events: 686 distinct (fecha,lote) spray-days, 2021-06-29..2026-06-24
- KNOWN GAP: no spray-log source covers 2025-06-25..2025-12-14 (~6 months between Excel FUMIGACION end and DB movimientos_diarios start) — intervention features for rounds whose trailing window falls entirely in this gap are left NaN (flagged via *_coverage_unknown), never silently zero-filled
- intervention features: 68/634 rows flagged coverage_unknown (fall in the known spray-log gap or before any spray record)
- tier thresholds (train-years [2023, 2024] only) for acaros: Low<=16.44, Med<=51.50, High>51.50 (n=423)
- tier thresholds (train-years [2023, 2024] only) for cucarron_marceno: Low<=3.00, Med<=9.00, High>9.00 (n=302)
- tier thresholds (train-years [2023, 2024] only) for fungoso: Low<=6.54, Med<=11.67, High>11.67 (n=350)
- tier thresholds (train-years [2023, 2024] only) for monalonion: Low<=3.00, Med<=7.62, High>7.62 (n=304)
- tier thresholds (train-years [2023, 2024] only) for mosca_ovario: Low<=2.86, Med<=8.67, High>8.67 (n=164)
- tier thresholds (train-years [2023, 2024] only) for thrips: Low<=6.00, Med<=23.67, High>23.67 (n=314)
- labels h=14d: 2688/2759 rows have a valid future round (>= 14d ahead) to label against
- labels h=28d: 2663/2759 rows have a valid future round (>= 28d ahead) to label against
- DROP series lote=10. Santa Rosa pest_group=acaros: n_obs=4 n_years=1 (min required: 20 obs, 2 years)
- DROP series lote=10. Santa Rosa pest_group=cucarron_marceno: n_obs=15 n_years=3 (min required: 20 obs, 2 years)
- DROP series lote=10. Santa Rosa pest_group=fungoso: n_obs=1 n_years=1 (min required: 20 obs, 2 years)
- DROP series lote=10. Santa Rosa pest_group=monalonion: n_obs=4 n_years=2 (min required: 20 obs, 2 years)
- min-data rule: 4 series dropped, 48 series kept
