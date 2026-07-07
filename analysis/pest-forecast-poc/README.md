# pest-forecast-poc

Isolated, **self-contained** proof-of-concept workspace. It is **not** part of the Escocia OS app: nothing
here is imported by `src/`, and no stage writes to the production database (read-only access only).

**Full design & execution contract:** [`../../docs/POC_PREDICCION_PLAGAS.md`](../../docs/POC_PREDICCION_PLAGAS.md)
— read that first. It is written for the Claude Code goal loop (Opus 4.8 orchestrator + Sonnet 5 workers)
and defines every stage, acceptance check, success criterion, and the two multi-agent workflows.

## Question this POC answers
Can weather history + 4 years of pest monitoring predict, at **lote level**, a **2–4-week-ahead risk tier**
for 6 focus pests, beating naive baselines **on held-out years**? Output = a go/no-go recommendation.

## Layout
```
config.yaml            # all knobs (focus pests, tier thresholds, CV years, feature windows, farm coords)
requirements.txt       # python deps
data/raw/              # source Excel + raw DB pulls (copy the two Planilla .xlsx here at S0)
data/interim/          # per-stage working artifacts
data/processed/        # frozen artifacts: monitoreo_lote.parquet, panel.parquet, folds.json
src/                   # s0_setup.py … s7_synthesis.py  +  eval.py (the ONE shared eval harness)
reports/               # s1_dataquality.md, s2_weather_reconciliation.md, s4_baselines.md, go-no-go.md
```

## Hard rules (see doc §6–§7)
- **Freeze before fan-out:** `panel.parquet`, `folds.json`, and the baselines are immutable before any
  modeling agent runs. All model agents import `src/eval.py` — no home-rolled splits or metrics.
- **Out-of-year validation only.** Never random-split. Train 2023–24 / validate 2025 / test 2026, plus
  leave-one-year-out.
- **Pre-registered success criteria.** GO = ≥3 of 6 pests beat the best baseline by ≥0.05 macro-F1 (3-tier)
  or ≥0.05 PR-AUC (binary) on the test year, surviving leave-one-year-out and the leakage red-team.

## Calling it off
Delete this folder and `docs/POC_PREDICCION_PLAGAS.md`. Nothing else in the repo depends on it.
