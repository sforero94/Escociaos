# POC — Predicción de riesgo de plagas y enfermedades (Escocia Hass)

**Status:** proposed · **Owner-decision gate:** go/no-go at the end · **Executor:** Claude Code goal loop
(Opus 4.8 orchestrator + Sonnet 5 workers) · **Touches production:** NO (read-only DB + isolated workspace)

> This document is written for **autonomous Claude Code agents**, not humans. It is contract-driven: every
> stage has explicit input/output artifacts and an acceptance check; success criteria are pre-registered;
> the two multi-agent workflows that materially change the outcome are specified. Execution happens only
> inside `analysis/pest-forecast-poc/` and read-only against the production database. Deleting that folder
> and this doc calls the whole thing off cleanly.

---

## 0. One-paragraph purpose
Decide, cheaply and rigorously, whether **weather history + 4 years of pest monitoring** can predict, at
**lote level**, a **2–4-week-ahead risk tier** (Low/Med/High, and a binary "will exceed the action
threshold") for a short list of economically important pests/diseases — with skill that **beats naive
baselines on held-out years**. Output is a **go/no-go recommendation with per-pest evidence**, not a
production model. If the signal isn't there, we learn it here for a few days of agent time instead of a
multi-week build.

## 1. The go/no-go question (pre-registered)
> For each focus pest, does any candidate model beat the best naive baseline (persistence / seasonal
> climatology / prevalence) by a pre-set margin, on **out-of-year** validation, with **no leakage**?

- **GO** if ≥3 of 6 focus pests clear the margin on the held-out test year AND survive leave-one-year-out
  (not one lucky split) AND the leakage red-team finds nothing invalidating.
- **CONDITIONAL** (iterate / scope down) if 1–2 pests clear it, or signal is in-sample only.
- **NO-GO** if models do not beat baselines out-of-year → document why; weather+monitoring at this
  horizon/granularity is insufficient. This is a valid, valuable result.

**Margin:** ≥ **0.05 absolute macro-F1** (3-tier) OR ≥ **0.05 absolute PR-AUC** (binary exceed), over the
best baseline, on the test year. These numbers are frozen — see §8.

## 2. Scope & non-goals
**In scope:** lote-level only (owner decision — no sublote); the 6 focus targets below; risk-tier +
binary-exceed labels at +2wk and +4wk; out-of-year validation; intervention-aware framing.

**Focus targets (6), some pooled by biology to borrow statistical strength:**
1. **Ácaros** (pool: Ácaro + Ácaro cristalino + Huevos de acaro + name variants) — hot/dry flares.
2. **Complejo fungoso foliar/fruto** (pool: Colletotrichum + Antracnosis ramas/fruto + Cladosporium) —
   warm-wet infection windows; expected strongest early win.
3. **Monalonión** — highland flagship pest; humidity/phenology.
4. **Thrips** — warm/dry + floración.
5. **Mosca del ovario** — floración-phenology driven.
6. **Cucarrón marceño** — seasonal emergence tied to rain onset.

**Non-goals (explicitly out):** no production/app code, no UI, no real-time inference, no DB writes, no
sublote modeling, no import into `monitoreos` (that is a *post-greenlight* step), no deep learning, no
hyper-parameter arms race. The POC answers "is there signal," nothing more.

## 3. Data inputs (measured, ready)

| Source | Content | Span | Notes for agents |
|---|---|---|---|
| Excel `[2023] Planilla Detallada Escocia Hass.xlsx` → sheet `MONITOREO` | 1,759 rows, 85 dates, **lote-level** | 2023 (+few 2022/2024) | header row 0; `incidencia` is a **fraction 0–1** |
| Excel `[2024] Planilla Detallada Escocia Hass.xlsx` → sheet `PLAGAS Y ENFERMEDADES` | 2,565 rows, 88 dates | 2024 | header row **11**, data from row 12; sublote col mostly blank → drop |
| DB `monitoreos` | ~4,233 rows, ~79 dates, sublote-level | 2025→2026 | `incidencia` is a **percentage 0–100**; aggregate to lote |
| DB `clima_resumen_diario` | daily weather, two `station_id`s | 2020→2026 | `wunderground-historico` (daily, no radiation, →Nov 2025) + Ecowitt `84:1F:E8:35:D8:73` (5-min, radiation, Mar 2026→) |
| Excel `FUMIGACION` (both files) | lote-level spray log (fecha, lote, insumo, propósito, blanco biológico) | 2021→2024 | intervention features for training years; 2024 header row 12 |
| DB `aplicaciones` / `movimientos_diarios` | spray execution | 2025→ | intervention features for the DB era |
| DB `plagas_enfermedades_catalogo` | taxonomy + `tipo` | — | canonical name mapping |

Source files live in the owner's `~/Downloads/`; copy them into `data/raw/` at S0 (read-only originals).

**Harmonization contract (lote-level — the single granularity for the whole POC):**
- Convert Excel `incidencia` ×100 to match the DB percentage scale; **clip/flag** impossible rows
  (>100 after ×100 — e.g. Ácaro 3.59→359, huevos 12.64→1264; severidad/counts leaked into the incidence
  column). Repair only if unambiguous, else drop — **log every affected row**.
- Normalize pest names to `plagas_enfermedades_catalogo` (strip trailing spaces, merge variants like
  `H-acaro Cristalino` and `Huevos de acaro`, `Beneficos `↔`Beneficos`).
- Normalize lote labels (`3. Australia`, `1. Piedra Paula`, `2. Salto de Tequendama`, …) to a stable
  `lote_key`; reconcile the historical lote list against the DB `lotes` table.
- When several sublote/observation rows share a (fecha, lote, pest), aggregate to lote by
  **árbol-weighted mean incidencia** (weight by `arboles_monitoreados`) — never a plain mean.
- 2024→2025 seam: Excel ends 2024-12-26, DB starts 2025-01-03 (clean) — still run a dedup check.
- **Output:** `data/processed/monitoreo_lote.parquet` with columns
  `[fecha, lote_key, pest_key, pest_group, arboles_monitoreados, incidencia_pct, source]`.

## 4. Isolated workspace & environment
```
analysis/pest-forecast-poc/           # self-contained; deletable; never imported by the app
  config.yaml                         # farm coords, focus pests, tier thresholds, CV years, feature windows
  requirements.txt                    # pandas, numpy, scikit-learn, lightgbm, statsmodels, pyarrow, openpyxl, requests, pyyaml
  data/raw/  data/interim/  data/processed/
  src/                                # s0_setup.py … s7_synthesis.py + eval.py (shared harness)
  reports/                            # metrics tables, plots, go-no-go.md
  README.md
```
- **Language:** Python. The repo is TS/React; this POC is analysis, deliberately decoupled.
- **DB access:** read-only (Supabase MCP `execute_sql`, or a read-only client with the anon key).
  Never write a production table.
- **Determinism:** fixed seeds; every stage reads/writes a versioned parquet so stages are independently
  re-runnable and auditable. Config-driven — no magic numbers inline.

## 5. Pipeline stages (each is a contract with an acceptance check)
> S1–S4 are **sequential and correctness-critical** — errors here silently poison everything — so each runs
> a **builder → independent verifier** pair (§6). S5 is the **modeling tournament** over a *frozen* panel.

**S0 — Setup & contracts.** Scaffold, pin `requirements.txt`, write `config.yaml`
(`focus_pests`, `lote_list`, `train=[2023,2024]`, `validate=2025`, `test=2026`,
`feature_windows=[7,14,21,28]`, `horizons_days=[14,28]`, `farm_lat/lon`). Copy the two Excel files into
`data/raw/`. *Accept:* config validates; `pip install -r requirements.txt` succeeds; DB read smoke-test
returns rows.

**S1 — Harmonize monitoring → lote-level panel** (§3 contract). *Accept:* row counts reconcile to source
±logged drops; **no `incidencia_pct` > 100 survives unflagged**; per-year and per-pest counts printed and
match §3's expected magnitudes; `reports/s1_dataquality.md` lists every repaired/dropped row (no silent
truncation).

**S2 — Weather backbone.** Assemble ONE homogeneous daily series 2023→2026. **Recommended design:** on-site
station as primary (`wunderground-historico` 2023–2025, Ecowitt 2026) + **NASA POWER** (free, no API key;
params `T2M_MIN`, `T2M_MAX`, `T2M`, `RH2M`, `PRECTOTCORR`, `ALLSKY_SFC_SW_DWN`, `WS2M`) to **gap-fill** and
to **supply radiation** for the WU years that lack it. Reconcile sources and record per-variable offsets.
One farm = one weather series shared by all lotes (acceptable at lote granularity). *Accept:* zero missing
days 2023→2026 after gap-fill; `source_of_record` flagged per day; station-vs-POWER deltas in
`reports/s2_weather_reconciliation.md`.

**S3 — Feature + label panel (the artifact everything downstream depends on).** Join each monitoring round
to trailing weather. **All features computed strictly before the "from-date"** (§7 leakage rules):
- Trailing-window (7/14/21/28 d) temp mean/min/max, RH mean/max, rain sum & rain-days, radiation, wind.
- Derived: **warm-wet-day runs** (fungal infection proxy), **hot-dry spells / GDD** (mite proxy).
- `floracion_*` phenology (DB era; impute + missingness flag for Excel years).
- Seasonality (week-of-year, sin/cos).
- **Autoregressive** last-observed incidence per lote×pest (strictly prior round) — usually the single
  strongest feature; guard against leakage.
- **Intervention** features: days-since-last-spray and spray-count-in-trailing-window per lote, from the
  harmonized `FUMIGACION` (2021–2024) + `aplicaciones`/`movimientos_diarios` (2025+).

**Labels:** tier (Low/Med/High) and binary "exceed high-tier", at the **next monitoring round ≥14 d ahead**
(+2wk) and **≥28 d ahead** (+4wk) — horizon defined by rounds because monitoring is irregular. Tiers from
per-pest historical tertiles by default; use the owner's agronomic economic thresholds if provided.
*Accept:* panel schema fixed & **frozen**; label-horizon logic unit-tested; min-data rule applied (drop
lote×pest series with <20 obs or spanning <2 years, **logged**); the frozen panel AND the frozen CV fold
definition written as immutable artifacts (`data/processed/panel.parquet`, `data/processed/folds.json`).

**S4 — Baselines (pre-registered, frozen BEFORE any modeling).** (1) persistence (next tier = current
tier); (2) seasonal climatology (this pest's typical tier for this week-of-year, computed **excluding the
test year**); (3) prevalence / majority class. *Accept:* baseline metrics per pest/horizon written to
`reports/s4_baselines.md` with a timestamp; these numbers are locked and cannot be revised after model
results are seen.

**S5 — Modeling tournament** (§6, Workflow 2). *Accept:* every candidate evaluated on the **same frozen
panel + same folds + same eval harness**; per-pest/per-horizon skill-vs-baseline with block-bootstrap CIs.

**S6 — Evaluation & out-of-year analysis.** Primary split: train 2023–24 / validate 2025 / test 2026. Also
**leave-one-year-out**. Metrics: macro-F1 & balanced accuracy (3-tier), ROC-AUC & PR-AUC (binary), all
expressed as **skill vs best baseline**. Report per pest, per horizon, per year. *Accept:* no random-split
metric appears anywhere; CIs via block bootstrap over **monitoring rounds** (not rows).

**S7 — Synthesis & go/no-go.** `reports/go-no-go.md`: per-pest verdict table, which model won each pest
(mixed winners allowed — a valid finding), honest limitations, and the recommendation against §1.

## 6. Multi-agent execution model (only where it changes the outcome)
Three structural rules and two workflows. Everything else is a plain sequential stage — do not over-orchestrate.

**Rule A — Freeze before fan-out.** The panel (S3), the CV fold definitions (S3), and the baselines (S4) are
written as **immutable artifacts** before any modeling agent starts. All model agents import the **same eval
harness** (`src/eval.py`). Without this, tournament results aren't comparable and the POC is worthless.

**Rule B — One eval harness, one metric definition.** `src/eval.py` owns fold loading, metric computation,
baseline comparison, and bootstrap CIs. Model agents may not roll their own splits or metrics.

**Rule C — Pre-registration is load-bearing.** Baselines and success thresholds are committed before results
exist; the red-team (below) checks they weren't moved.

**Workflow 1 — Builder → Verifier pairs on the data stages (S1–S3).** The high-leverage place for
adversarial checking, because bad data produces confident-but-false conclusions. For each of S1/S2/S3: one
Sonnet worker builds the artifact; a **second, independent** Sonnet worker audits it against the acceptance
check (reconcile counts, distribution sanity, unit-conversion correctness, dedup at the 2024/2025 seam,
leakage in feature timing). The orchestrator does not advance until the verifier signs off. Diverge-converge
is overkill here; build+skeptic is the right shape.

**Workflow 2 — Modeling tournament (diverge → converge) on S5.** Where independent parallel attempts
genuinely beat one linear attempt: "is there signal" depends on picking the right representation, and a
single worker may choose a mediocre one and wrongly conclude "no signal." Fan out **4 candidate approaches
in parallel**, each a distinct hypothesis, all on the frozen panel + folds + harness:
- **A. Agronomic-index + calibration** — per-pest infection/degree-day index → logistic/ordinal calibrator.
- **B. Regularized gradient-boosted trees** (LightGBM) with monotonic constraints on key drivers.
- **C. Penalized ordinal / elastic-net regression** — the strong, interpretable "simple-plus" model.
- **D. Hierarchical / pooled model** borrowing strength across lotes and within pest groups.

Then **converge:** a judge worker compares out-of-year skill per pest, selects the **winner per pest**
(mixed winners fine), and writes the comparison. Keep it to these 4 — more is ceremony, not signal.

**Final red-team — leakage & validity critic (single dedicated skeptic, before S7).** One worker whose only
job is to **invalidate** the positive results: hunt for future-info-in-features, autoregressive label
leakage, climatology computed on the test year, fold contamination, moved goalposts, and silent scope
reductions. Leakage is the #1 way POCs like this yield a false "it works." This skeptic is worth more than a
5th model. **Any GO verdict must survive it.**

## 7. Methodological validity rules (non-negotiable)
- **Never** random-split; always out-of-year / forward-chaining. All rounds of a test year are fully held out.
- Trailing weather uses only data **≤ the from-date**, never the target date.
- Autoregressive feature = last incidence **strictly before** the from-date.
- Climatology baseline excludes the test year.
- Block-bootstrap CIs over **monitoring rounds** (autocorrelation-aware), not individual rows.
- Min-data rule enforced and **logged**; every drop/repair recorded (no silent truncation).
- Intervention confound is **measured, not fully solved**: report skill with vs without intervention
  features; the deployed "risk if we don't act" query would set intervention=none — note this, don't build it.

## 8. Success criteria
See §1 — pre-registered. Do not move the goalposts after seeing results; the red-team verifies this.

## 9. Risks & how the POC de-risks them
| Risk | Mitigation |
|---|---|
| Data harmonization errors invalidate everything | Builder→Verifier pairs (S1–S3) + reconciliation logs |
| Data leakage → false positive | Dedicated leakage red-team before S7; §7 rules |
| Overfit to 2 training years | Out-of-year + leave-one-year-out |
| Weak baselines make models look good | Baselines pre-registered & frozen before modeling |
| Wrong model representation → false negative | 4-way modeling tournament |
| Farm microclimate ≠ coarse reanalysis | Station-primary + POWER gap-fill; report deltas |
| Spraying suppresses pests → muddies signal | Intervention features + with/without reporting |

## 10. Deliverables & effort envelope
**Deliverables:** harmonized `monitoreo_lote.parquet`; weather backbone; frozen `panel.parquet` + `folds.json`;
`s4_baselines.md`; tournament results; and `reports/go-no-go.md` with the recommendation.
**Envelope:** bounded analysis (days of agent time, not weeks); most token budget goes to Workflow 2
(tournament) and the red-team. Everything is reversible — delete `analysis/pest-forecast-poc/` and this doc.

## 11. Verification checklist (how the owner confirms the agents did it right)
1. `reports/go-no-go.md` exists and states a clear GO / CONDITIONAL / NO-GO with the per-pest table.
2. Baseline numbers were written (artifact timestamp) **before** model numbers.
3. Every metric in the report is out-of-year; grep the harness for `train_test_split` / `shuffle=True` → must be absent.
4. `reports/s1_dataquality.md` accounts for all dropped/repaired rows.
5. The leakage red-team report is present and its objections are resolved, not ignored.

## 12. Post-POC (only if GO — not part of this POC)
Import 2023–2024 monitoring into `monitoreos`; productionize the winning model per pest; add a real-time
inference path (recent observed weather → risk tier); surface as a `/monitoreo` dashboard card + alerts in
`AlertList`. None of this is done during the POC.
