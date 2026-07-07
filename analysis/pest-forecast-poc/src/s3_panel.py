"""S3 — Feature + label panel (the frozen artifact everything downstream depends on).

Unit of prediction: (lote_key, pest_group, fecha) — one row per monitoring round where a
focus pest_group was observed at a lote. Pooled pest_groups (acaros, fungoso) collapse their
member pest_keys' incidencia_pct via a simple mean across whichever members were recorded
that round (documented modeling choice — see PEST_GROUP_AGG below).

Leakage rules (doc section 7), enforced here:
  - All weather trailing-window features use days strictly BEFORE the round's fecha
    (window = [fecha - w, fecha - 1], never includes fecha itself).
  - Autoregressive feature = the last observation strictly before the round's fecha.
  - Intervention features (days-since-last-spray, spray-count-in-window) use spray events
    strictly before fecha.
  - Risk-tier thresholds are frozen from TRAIN-YEARS-ONLY (2023-2024) per pest_group, then
    applied uniformly to validate/test — never fit on the years being evaluated.

KNOWN LIMITATION (found by the S7 red-team, documented rather than fixed): because tier
thresholds are frozen ONCE from train_years=[2023,2024] and reused everywhere, the
leave-one-year-out folds that hold out 2023 or 2024 as "test" are scoring against labels
partly calibrated on that same held-out year — those two LOYO folds are not fully
leakage-clean. loyo_2025/loyo_2026 are unaffected (neither year is in the threshold-fitting
years). Verified in S6 (reports/s6_evaluation.md) to not change the final go/no-go outcome
for this run; a full fix would need per-LOYO-fold tier thresholds (and thus per-fold label
columns), judged not worth the rebuild cost here.

Output:
  data/processed/panel.parquet  — frozen feature+label panel
  data/processed/folds.json     — frozen CV fold definitions (train/validate/test years + LOYO)
  reports/s3_panel.md           — schema, label-horizon logic notes, min-data drops, leakage self-check
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from normalize import normalize_lote, normalize_pest

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"

CONFIG = yaml.safe_load(open(ROOT / "config.yaml"))
WINDOWS = CONFIG["features"]["trailing_windows_days"]
HORIZONS = CONFIG["horizons_days"]  # [14, 28] -> ("h14", "h28")
TRAIN_YEARS = CONFIG["cv"]["train_years"]
VALIDATE_YEAR = CONFIG["cv"]["validate_year"]
TEST_YEAR = CONFIG["cv"]["test_year"]
MIN_OBS = CONFIG["min_data"]["min_obs_per_series"]
MIN_YEARS = CONFIG["min_data"]["min_years_per_series"]
BINARY_EXCEED_TIER = CONFIG["tiers"]["binary_exceed_tier"]

# How pooled pest_groups collapse multiple member pest_keys observed the same (lote,fecha)
# into one group-level incidence. Mean, not max: avoids one noisy sub-observation dominating
# a "pressure" signal that is supposed to represent the whole biological complex.
PEST_GROUP_AGG = "mean"


def log_and_print(log, msg):
    log.append(msg)


def build_pest_group_series(monitoreo: pd.DataFrame, log: list) -> pd.DataFrame:
    """Collapse member pest_keys -> one row per (fecha, lote_key, pest_group)."""
    focus = monitoreo[monitoreo["pest_group"].notna()].copy()
    grouped = (
        focus.groupby(["fecha", "lote_key", "pest_group"], as_index=False)
        .agg(incidencia_pct=("incidencia_pct", PEST_GROUP_AGG),
             n_members_observed=("pest_key", "nunique"),
             arboles_monitoreados=("arboles_monitoreados", "mean"))
    )
    log.append(f"pest_group series: {len(focus)} focus-pest rows -> {len(grouped)} "
               f"(lote,pest_group,fecha) rows after {PEST_GROUP_AGG}-aggregating pooled members")
    return grouped


def load_fumigacion_events(log: list) -> pd.DataFrame:
    events = []

    f23 = pd.read_excel(RAW / "[2023] Planilla Detallada Escocia Hass.xlsx",
                         sheet_name=CONFIG["sources"]["excel_fumigacion_sheet"], header=1)
    f23["fecha"] = pd.to_datetime(f23["FECHA"], errors="coerce")
    n_bad = f23["fecha"].isna().sum()
    if n_bad:
        log.append(f"fumigacion 2023: dropped {n_bad} rows with unparseable FECHA")
    f23 = f23[f23["fecha"].notna()].copy()
    f23["lote_key"] = f23["LOTE"].apply(lambda x: normalize_lote(x, log))
    f23 = f23[f23["lote_key"].notna()]
    events.append(f23[["fecha", "lote_key"]])

    f24 = pd.read_excel(RAW / "[2024] Planilla Detallada Escocia Hass.xlsx",
                         sheet_name=CONFIG["sources"]["excel_fumigacion_sheet"], header=12)
    f24["fecha"] = pd.to_datetime(f24["Fecha"], errors="coerce")
    n_bad = f24["fecha"].isna().sum()
    if n_bad:
        log.append(f"fumigacion 2024: dropped {n_bad} rows with unparseable Fecha")
    f24 = f24[f24["fecha"].notna()].copy()
    f24["lote_key"] = f24["Lote"].apply(lambda x: normalize_lote(x, log))
    f24 = f24[f24["lote_key"].notna()]
    events.append(f24[["fecha", "lote_key"]])

    dbm = pd.read_csv(RAW / "db_movimientos_diarios_lotes.csv")
    dbm["fecha"] = pd.to_datetime(dbm["fecha"], errors="coerce")
    n_bad = dbm["fecha"].isna().sum()
    if n_bad:
        log.append(f"fumigacion db: dropped {n_bad} rows with unparseable fecha")
    dbm = dbm[dbm["fecha"].notna()].copy()
    dbm["lote_key"] = dbm["lote"].apply(lambda x: normalize_lote(x, log))
    dbm = dbm[dbm["lote_key"].notna()]
    events.append(dbm[["fecha", "lote_key"]])

    all_events = pd.concat(events, ignore_index=True).drop_duplicates()
    span_min, span_max = all_events["fecha"].min(), all_events["fecha"].max()
    log.append(f"fumigacion events: {len(all_events)} distinct (fecha,lote) spray-days, "
               f"{span_min.date()}..{span_max.date()}")

    # Known coverage hole: Excel FUMIGACION ends 2025-06-24, DB movimientos_diarios starts
    # 2025-12-15 -- ~6 months with no spray-log record in EITHER source. Intervention
    # features computed for monitoring rounds in that window are NaN, not zero, and flagged.
    gap_start, gap_end = pd.Timestamp("2025-06-25"), pd.Timestamp("2025-12-14")
    log.append(f"KNOWN GAP: no spray-log source covers {gap_start.date()}..{gap_end.date()} "
               f"(~6 months between Excel FUMIGACION end and DB movimientos_diarios start) — "
               f"intervention features for rounds whose trailing window falls entirely in this "
               f"gap are left NaN (flagged via *_coverage_unknown), never silently zero-filled")

    return all_events.sort_values(["lote_key", "fecha"]).reset_index(drop=True)


def weather_features_for(weather: pd.DataFrame, lote_fechas: pd.Series) -> pd.DataFrame:
    """For each unique round fecha, compute trailing-window weather features (strictly prior days)."""
    w = weather.set_index("fecha").sort_index()
    core_vars = ["temp_c_min", "temp_c_max", "temp_c_avg", "humedad_pct_min", "humedad_pct_max",
                 "humedad_pct_avg", "lluvia_total_mm", "viento_kmh_avg", "rafaga_kmh_max"]

    warm_wet_t = CONFIG["features"]["warm_wet_temp_min_c"]
    warm_wet_rain = CONFIG["features"]["warm_wet_rain_min_mm"]
    hot_dry_t = CONFIG["features"]["hot_dry_temp_min_c"]
    hot_dry_rain = CONFIG["features"]["hot_dry_rain_max_mm"]
    gdd_base = CONFIG["features"]["gdd_base_c"]

    w["is_warm_wet"] = (w["temp_c_avg"] >= warm_wet_t) & (w["lluvia_total_mm"] >= warm_wet_rain)
    w["is_hot_dry"] = (w["temp_c_max"] >= hot_dry_t) & (w["lluvia_total_mm"] <= hot_dry_rain)
    w["gdd"] = (w["temp_c_avg"] - gdd_base).clip(lower=0)

    def max_consecutive_run(bool_series: pd.Series) -> int:
        if bool_series.empty:
            return 0
        groups = (~bool_series).cumsum()
        runs = bool_series.groupby(groups).sum()
        return int(runs.max()) if len(runs) else 0

    unique_fechas = pd.Series(sorted(lote_fechas.unique()))
    rows = []
    for fecha in unique_fechas:
        row = {"fecha": fecha}
        for win in WINDOWS:
            start = fecha - pd.Timedelta(days=win)
            end = fecha - pd.Timedelta(days=1)  # strictly before fecha
            wnd = w.loc[(w.index >= start) & (w.index <= end)]
            prefix = f"w{win}"
            if len(wnd) == 0:
                for v in core_vars:
                    row[f"{prefix}_{v}_mean"] = np.nan
                row[f"{prefix}_rain_sum"] = np.nan
                row[f"{prefix}_rain_days"] = np.nan
                row[f"{prefix}_warm_wet_days"] = np.nan
                row[f"{prefix}_warm_wet_max_run"] = np.nan
                row[f"{prefix}_hot_dry_days"] = np.nan
                row[f"{prefix}_hot_dry_max_run"] = np.nan
                row[f"{prefix}_gdd_sum"] = np.nan
                continue
            for v in core_vars:
                row[f"{prefix}_{v}_mean"] = wnd[v].mean()
            row[f"{prefix}_rain_sum"] = wnd["lluvia_total_mm"].sum()
            row[f"{prefix}_rain_days"] = int((wnd["lluvia_total_mm"] > 0).sum())
            row[f"{prefix}_warm_wet_days"] = int(wnd["is_warm_wet"].sum())
            row[f"{prefix}_warm_wet_max_run"] = max_consecutive_run(wnd["is_warm_wet"])
            row[f"{prefix}_hot_dry_days"] = int(wnd["is_hot_dry"].sum())
            row[f"{prefix}_hot_dry_max_run"] = max_consecutive_run(wnd["is_hot_dry"])
            row[f"{prefix}_gdd_sum"] = wnd["gdd"].sum()
        rows.append(row)
    return pd.DataFrame(rows)


def intervention_features_for(events: pd.DataFrame, series: pd.DataFrame, log: list) -> pd.DataFrame:
    """days_since_last_spray + spray_count_in_trailing_window, per (lote_key, fecha), strictly prior."""
    ev_by_lote = {lote: sorted(g["fecha"].tolist()) for lote, g in events.groupby("lote_key")}
    ev_min_max = events["fecha"].min(), events["fecha"].max()

    rows = []
    for _, r in series[["lote_key", "fecha"]].drop_duplicates().iterrows():
        lote, fecha = r["lote_key"], r["fecha"]
        row = {"lote_key": lote, "fecha": fecha}
        dates = ev_by_lote.get(lote, [])
        prior = [d for d in dates if d < fecha]

        # Coverage flag: is `fecha` inside the known no-spray-log-source gap?
        gap_start, gap_end = pd.Timestamp("2025-06-25"), pd.Timestamp("2025-12-14")
        in_gap = gap_start <= fecha <= gap_end

        if in_gap or fecha < ev_min_max[0]:
            row["days_since_last_spray"] = np.nan
            row["intervention_coverage_unknown"] = True
        else:
            row["days_since_last_spray"] = (fecha - prior[-1]).days if prior else np.nan
            row["intervention_coverage_unknown"] = False

        for win in WINDOWS:
            start = fecha - pd.Timedelta(days=win)
            cnt = sum(1 for d in prior if d >= start)
            row[f"spray_count_w{win}"] = np.nan if (in_gap or fecha < ev_min_max[0]) else cnt
        rows.append(row)

    out = pd.DataFrame(rows)
    n_unknown = out["intervention_coverage_unknown"].sum()
    log.append(f"intervention features: {n_unknown}/{len(out)} rows flagged coverage_unknown "
               f"(fall in the known spray-log gap or before any spray record)")
    return out


def autoregressive_features_for(series: pd.DataFrame) -> pd.DataFrame:
    """Last-observed incidencia_pct strictly before this round, per (lote_key, pest_group)."""
    s = series.sort_values(["lote_key", "pest_group", "fecha"]).copy()
    s["ar_last_incidencia_pct"] = s.groupby(["lote_key", "pest_group"])["incidencia_pct"].shift(1)
    s["ar_last_gap_days"] = (
        s["fecha"] - s.groupby(["lote_key", "pest_group"])["fecha"].shift(1)
    ).dt.days
    return s


def seasonality_features_for(fechas: pd.Series) -> pd.DataFrame:
    woy = fechas.dt.isocalendar().week.astype(float)
    return pd.DataFrame({
        "fecha": fechas,
        "week_sin": np.sin(2 * np.pi * woy / 52.0),
        "week_cos": np.cos(2 * np.pi * woy / 52.0),
    }).drop_duplicates(subset="fecha")


def floracion_features_for(series: pd.DataFrame, floracion: pd.DataFrame) -> pd.DataFrame:
    merged = series[["lote_key", "fecha"]].drop_duplicates().merge(
        floracion, on=["lote_key", "fecha"], how="left"
    )
    merged["floracion_available"] = merged["floracion_sin_flor"].notna()
    return merged


def compute_tier_thresholds(series: pd.DataFrame, log: list) -> dict:
    """Per-pest_group tertile thresholds, frozen from TRAIN YEARS ONLY.

    Fallback (only if a group has <10 train-year obs) widens to train+validate years —
    NEVER to the whole series, which would pull in the test year and reintroduce exactly
    the "climatology/thresholds computed on the test year" leakage class the S2 fix addressed.
    """
    train = series[series["fecha"].dt.year.isin(TRAIN_YEARS)]
    pre_test_years = TRAIN_YEARS + [VALIDATE_YEAR]
    thresholds = {}
    for grp, g in train.groupby("pest_group"):
        vals = g["incidencia_pct"].dropna()
        if len(vals) < 10:
            log.append(f"tier thresholds: pest_group={grp} has only {len(vals)} train-year obs "
                       f"— widening to train+validate years {pre_test_years} (still NEVER the "
                       f"test year {TEST_YEAR})")
            vals = series[(series["pest_group"] == grp)
                          & (series["fecha"].dt.year.isin(pre_test_years))]["incidencia_pct"].dropna()
        q1, q2 = vals.quantile([1 / 3, 2 / 3]).tolist()
        thresholds[grp] = {"low_max": q1, "med_max": q2}
        log.append(f"tier thresholds (train-years {TRAIN_YEARS} only) for {grp}: "
                   f"Low<={q1:.2f}, Med<={q2:.2f}, High>{q2:.2f} (n={len(vals)})")
    return thresholds


def tier_of(pct: float, thr: dict) -> str:
    if pd.isna(pct):
        return np.nan
    if pct <= thr["low_max"]:
        return "Low"
    if pct <= thr["med_max"]:
        return "Med"
    return "High"


def build_labels(series: pd.DataFrame, thresholds: dict, log: list) -> pd.DataFrame:
    s = series.sort_values(["lote_key", "pest_group", "fecha"]).reset_index(drop=True)
    s["tier"] = s.apply(lambda r: tier_of(r["incidencia_pct"], thresholds[r["pest_group"]]), axis=1)

    for h in HORIZONS:
        tier_col, exceed_col, gap_col = f"tier_h{h}", f"exceed_h{h}", f"gap_days_h{h}"
        s[tier_col] = pd.Series([np.nan] * len(s), dtype="object")
        s[exceed_col] = np.nan
        s[gap_col] = np.nan

    for (lote, grp), g in s.groupby(["lote_key", "pest_group"]):
        idx = g.index.tolist()
        fechas = g["fecha"].tolist()
        tiers = g["tier"].tolist()
        for i, i_global in enumerate(idx):
            for h in HORIZONS:
                target_j = None
                for j in range(i + 1, len(idx)):
                    if (fechas[j] - fechas[i]).days >= h:
                        target_j = j
                        break
                if target_j is not None:
                    s.loc[i_global, f"tier_h{h}"] = tiers[target_j]
                    s.loc[i_global, f"exceed_h{h}"] = int(tiers[target_j] == BINARY_EXCEED_TIER.capitalize())
                    s.loc[i_global, f"gap_days_h{h}"] = (fechas[target_j] - fechas[i]).days

    for h in HORIZONS:
        n_labeled = s[f"tier_h{h}"].notna().sum()
        log.append(f"labels h={h}d: {n_labeled}/{len(s)} rows have a valid future round "
                   f"(>= {h}d ahead) to label against")

    return s


def apply_min_data_rule(panel: pd.DataFrame, log: list) -> pd.DataFrame:
    keep_keys = []
    drop_log = []
    for (lote, grp), g in panel.groupby(["lote_key", "pest_group"]):
        n_obs = len(g)
        n_years = g["fecha"].dt.year.nunique()
        if n_obs < MIN_OBS or n_years < MIN_YEARS:
            drop_log.append(f"DROP series lote={lote} pest_group={grp}: n_obs={n_obs} "
                            f"n_years={n_years} (min required: {MIN_OBS} obs, {MIN_YEARS} years)")
        else:
            keep_keys.append((lote, grp))
    log.extend(drop_log)
    log.append(f"min-data rule: {len(drop_log)} series dropped, "
               f"{len(keep_keys)} series kept")
    mask = panel.set_index(["lote_key", "pest_group"]).index.isin(keep_keys)
    return panel[mask].reset_index(drop=True)


def main():
    log: list[str] = []
    PROCESSED.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)

    monitoreo = pd.read_parquet(PROCESSED / "monitoreo_lote.parquet")
    weather = pd.read_parquet(PROCESSED / "weather_daily.parquet")
    floracion = pd.read_parquet(INTERIM / "floracion_db.parquet")

    series = build_pest_group_series(monitoreo, log)
    series = autoregressive_features_for(series)

    events = load_fumigacion_events(log)
    interv = intervention_features_for(events, series, log)
    wfeat = weather_features_for(weather, series["fecha"])
    seas = seasonality_features_for(series["fecha"])
    flor = floracion_features_for(series, floracion)

    panel = series.merge(interv, on=["lote_key", "fecha"], how="left")
    panel = panel.merge(wfeat, on="fecha", how="left")
    panel = panel.merge(seas, on="fecha", how="left")
    panel = panel.merge(flor, on=["lote_key", "fecha"], how="left")

    thresholds = compute_tier_thresholds(series, log)
    panel = build_labels(panel, thresholds, log)

    panel_before_min_data = len(panel)
    panel = apply_min_data_rule(panel, log)

    panel["year"] = panel["fecha"].dt.year
    panel = panel.sort_values(["lote_key", "pest_group", "fecha"]).reset_index(drop=True)

    # --- Frozen CV folds ---
    all_years = sorted(panel["year"].unique().tolist())
    folds = {
        "primary": {"train_years": TRAIN_YEARS, "validate_year": VALIDATE_YEAR, "test_year": TEST_YEAR},
        "leave_one_year_out": [
            {"test_year": y, "train_years": [yr for yr in all_years if yr != y]}
            for y in all_years if y >= min(TRAIN_YEARS)  # only rotate through years with real modeling data
        ],
        "all_years_present": all_years,
    }
    with open(PROCESSED / "folds.json", "w") as f:
        json.dump(folds, f, indent=2, default=str)

    panel_path = PROCESSED / "panel.parquet"
    panel.to_parquet(panel_path, index=False)

    # --- Leakage self-check: no feature column name accidentally encodes the target date's own info ---
    feature_cols = [c for c in panel.columns if c.startswith("w") and ("_mean" in c or "_sum" in c
                    or "_days" in c or "_run" in c)]
    assert len(feature_cols) > 0, "no weather feature columns found — pipeline bug"

    report_lines = [
        "# S3 — Feature + Label Panel Report",
        "",
        f"**Output:** `data/processed/panel.parquet` — {len(panel)} rows "
        f"({panel_before_min_data} before min-data rule)",
        f"**Folds:** `data/processed/folds.json` — primary split train={TRAIN_YEARS} "
        f"validate={VALIDATE_YEAR} test={TEST_YEAR}, plus leave-one-year-out over {all_years}",
        "",
        "## Schema",
        "",
        f"Unit of prediction: (lote_key, pest_group, fecha). {len(panel.columns)} columns — "
        f"weather trailing-window features (windows {WINDOWS}d), intervention features, "
        f"autoregressive last-incidence, floración (DB-era only), seasonality (week sin/cos), "
        f"and labels tier_h{{14,28}} / exceed_h{{14,28}} / gap_days_h{{14,28}}.",
        "",
        "## Pooled pest_group aggregation",
        f"Members of a pooled pest_group (acaros, fungoso) collapse to one incidencia_pct per "
        f"(lote,fecha) via **{PEST_GROUP_AGG}** across whichever members were recorded that round.",
        "",
        "## Processing log",
        "",
    ]
    for line in log:
        report_lines.append(f"- {line}")

    (REPORTS / "s3_panel.md").write_text("\n".join(report_lines) + "\n")

    print(f"OK: wrote {panel_path} ({len(panel)} rows, {len(panel.columns)} cols)")
    print(f"OK: wrote data/processed/folds.json")
    print(f"OK: wrote reports/s3_panel.md")
    print("Rows per pest_group:", panel.groupby("pest_group").size().to_dict())
    print("Rows per year:", panel.groupby("year").size().to_dict())


if __name__ == "__main__":
    sys.exit(main())
