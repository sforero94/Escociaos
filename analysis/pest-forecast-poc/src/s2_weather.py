"""S2 — Weather backbone: one homogeneous daily series from station data.

DEVIATION FROM DESIGN DOC (logged here + reports/s2_weather_reconciliation.md):
The plan's recommended design gap-fills station data with NASA POWER (free, no-key API)
to (a) plug missing days and (b) supply radiation for the 2020-2025 "wunderground-historico"
era, which never recorded it. This sandbox's egress proxy returns a hard 403 policy denial
for power.larc.nasa.gov (and for any host outside an allowlist) — confirmed via
`curl $HTTPS_PROXY/__agentproxy/status`, which logs it as `connect_rejected` /
"gateway answered 403 to CONNECT (policy denial)". Per this environment's own operating
instructions, policy denials must be reported, not routed around — so no external API is
used here.

Fallback actually implemented:
  - Union both stations into one daily series (their date ranges do not overlap, so no
    conflict resolution is needed — wunderground-historico 2020-07-01..2025-11-04, Ecowitt
    84:1F:E8:35:D8:73 2026-03-18..2026-07-06).
  - That union leaves a REAL 134-day full blackout, 2025-11-05..2026-03-17, with zero
    station readings at all (461 monitoring rows fall inside it — mostly the 2025 validate
    year and early 2026 test year). Gap-filled via day-of-year seasonal climatology: for each
    missing calendar day, average that variable across all OTHER available years within a
    +/-5 day window of the same month-day. This is a same-source (station-only) substitute
    for POWER's satellite reanalysis — weaker for capturing that specific period's actual
    anomalies, but requires no external network call and stays grounded in this farm's own
    multi-year seasonal pattern.
  - Radiation (radiacion_wm2_avg/max, uv_index_max) has NO wunderground coverage at all
    (documented: WU predates radiation instrumentation) and only 109 Ecowitt days. Since
    POWER was the plan's only source for backfilling radiation across the WU years, radiation
    is NOT usable as a general feature here — it is carried through with a `has_radiation`
    flag but EXCLUDED from S3's feature set. This is flagged as a real scope reduction, not
    silently dropped.

Output: data/processed/weather_daily.parquet
  columns: [fecha, temp_c_min, temp_c_max, temp_c_avg, humedad_pct_min, humedad_pct_max,
            humedad_pct_avg, lluvia_total_mm, viento_kmh_avg, rafaga_kmh_max,
            radiacion_wm2_avg, uv_index_max, source_of_record, is_climatology_filled, has_radiation]
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
CONFIG = yaml.safe_load(open(ROOT / "config.yaml"))
TEST_YEAR = CONFIG["cv"]["test_year"]
REPORTS = ROOT / "reports"

CORE_VARS = [
    "temp_c_min", "temp_c_max", "temp_c_avg",
    "humedad_pct_min", "humedad_pct_max", "humedad_pct_avg",
    "lluvia_total_mm", "viento_kmh_avg", "rafaga_kmh_max",
]
RADIATION_VARS = ["radiacion_wm2_avg", "radiacion_wm2_max", "uv_index_max"]

DOY_WINDOW_DAYS = 5


def load_station_union() -> pd.DataFrame:
    df = pd.read_csv(RAW / "db_clima_resumen_diario.csv")
    df["station_id"] = df["station_id"].str.strip()
    df["fecha"] = pd.to_datetime(df["fecha"])
    # No date overlap between the two stations (verified) — union is a plain concat, then
    # in the rare event of an actual same-day double entry, prefer the row with more
    # populated core variables.
    df["n_core_present"] = df[CORE_VARS].notna().sum(axis=1)
    df = df.sort_values("n_core_present", ascending=False).drop_duplicates(subset="fecha", keep="first")
    df = df.sort_values("fecha").drop(columns="n_core_present").reset_index(drop=True)
    return df


def _doy_mean_lookup(obs: pd.DataFrame, var: str) -> dict:
    doy_values: dict[int, list] = {}
    for _, r in obs.iterrows():
        for offset in range(-DOY_WINDOW_DAYS, DOY_WINDOW_DAYS + 1):
            d = int(r["doy"]) + offset
            if d < 1:
                d += 366
            if d > 366:
                d -= 366
            doy_values.setdefault(d, []).append(r[var])
    return {d: float(np.mean(v)) for d, v in doy_values.items() if v}


def doy_climatology_fill(daily: pd.DataFrame, log: list) -> pd.DataFrame:
    """Fill missing days with a day-of-year climatology.

    Pass 1 (primary): built ONLY from years strictly before the year being filled
    (forward-chaining / expanding-window) — never the fill-year itself or any later year.
    This matters even for *training*-year gaps: an independent verifier caught an earlier
    version of this function pooling ALL years indiscriminately, which let 2026 (test-year)
    station readings leak backward into 2020-2025 climatology fills — exactly the
    "climatology computed on the test year" red flag the design doc calls out as invalidating.

    Pass 2 (fallback, logged): station data starts mid-2020, so 2020-2021 don't have full
    calendar-year coverage — some day-of-year values in those two years have NO prior-year
    reference at all (a cold-start artifact, not a modeling concern: neither year has any
    monitoring round in the panel). For cells pass 1 can't fill, fall back to pooling all
    years EXCEPT the designated test year (still never touches test-year data).

    Pass 3 (last resort, loudly logged as CRITICAL): if pass 2 still can't fill a cell
    (should not happen given the data), fall back to all years including the test year and
    flags it — this would need manual review before trusting the artifact.

    Crucially, ALL passes draw their reference pool from `observed_orig` (the ORIGINAL
    station-observed mask, captured before any filling) — never from a previous pass's
    climatology-filled values. Otherwise a cold-start fill in 2020 (itself sourced from
    future years) could recirculate into 2021's "prior year" pool and so on, silently
    re-introducing the same forward-leakage pass 1 exists to prevent.
    """
    daily = daily.copy()
    daily["doy"] = daily["fecha"].dt.dayofyear
    daily["year"] = daily["fecha"].dt.year
    for var in CORE_VARS:
        daily[f"is_filled_{var}"] = False

    all_years = sorted(daily["year"].unique().tolist())

    for var in CORE_VARS:
        missing_mask = daily[var].isna()
        n_missing_before = int(missing_mask.sum())
        if n_missing_before == 0:
            continue

        observed_orig = daily[var].notna()  # fixed reference mask — never mutated below
        remaining_mask = missing_mask.copy()
        n_pass2 = 0
        n_pass3 = 0

        # --- Pass 1: strict prior-years-only, per fill-year ---
        for fill_year in all_years:
            year_missing_mask = remaining_mask & (daily["year"] == fill_year)
            if not year_missing_mask.any():
                continue
            obs = daily.loc[observed_orig & (daily["year"] < fill_year), ["doy", var]]
            if obs.empty:
                continue
            doy_mean = _doy_mean_lookup(obs, var)
            fill_values = daily.loc[year_missing_mask, "doy"].map(doy_mean)
            filled_idx = fill_values[fill_values.notna()].index
            daily.loc[filled_idx, var] = fill_values.loc[filled_idx]
            daily.loc[filled_idx, f"is_filled_{var}"] = True
            remaining_mask.loc[filled_idx] = False

        # --- Pass 2: fallback, all years except TEST_YEAR, only for cells pass 1 missed ---
        if remaining_mask.any():
            obs = daily.loc[observed_orig & (daily["year"] != TEST_YEAR), ["doy", var]]
            if not obs.empty:
                doy_mean = _doy_mean_lookup(obs, var)
                fill_values = daily.loc[remaining_mask, "doy"].map(doy_mean)
                filled_idx = fill_values[fill_values.notna()].index
                daily.loc[filled_idx, var] = fill_values.loc[filled_idx]
                daily.loc[filled_idx, f"is_filled_{var}"] = True
                n_pass2 = len(filled_idx)
                remaining_mask.loc[filled_idx] = False

        # --- Pass 3: last resort, all years including test year (should not trigger) ---
        if remaining_mask.any():
            obs = daily.loc[observed_orig, ["doy", var]]
            doy_mean = _doy_mean_lookup(obs, var)
            fill_values = daily.loc[remaining_mask, "doy"].map(doy_mean)
            filled_idx = fill_values[fill_values.notna()].index
            daily.loc[filled_idx, var] = fill_values.loc[filled_idx]
            daily.loc[filled_idx, f"is_filled_{var}"] = True
            n_pass3 = len(filled_idx)
            remaining_mask.loc[filled_idx] = False
            if n_pass3:
                log.append(f"CRITICAL {var}: {n_pass3} cells needed the pass-3 fallback "
                            f"(all years INCLUDING test year {TEST_YEAR}) — review before trusting this variable")

        still_missing = int(remaining_mask.sum())
        msg = (f"{var}: {n_missing_before} missing days -> "
               f"{n_missing_before - n_pass2 - n_pass3} filled via prior-years-only climatology")
        if n_pass2:
            msg += f", {n_pass2} via pass-2 fallback (all years except test year {TEST_YEAR})"
        if n_pass3:
            msg += f", {n_pass3} via pass-3 fallback (ALL years incl. test year — see CRITICAL line)"
        if still_missing:
            msg += f", {still_missing} still missing (no reference day available anywhere)"
        log.append(msg)

    daily = daily.drop(columns=["doy", "year"])
    return daily


def main():
    log: list[str] = []
    PROCESSED.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)

    stations = load_station_union()
    log.append(f"Loaded {len(stations)} station-day rows across {stations['station_id'].nunique()} stations")
    for st, g in stations.groupby("station_id"):
        log.append(f"  {st}: {g['fecha'].min().date()} .. {g['fecha'].max().date()} ({len(g)} days)")

    full_range = pd.date_range(stations["fecha"].min(), stations["fecha"].max(), freq="D")
    daily = pd.DataFrame({"fecha": full_range}).merge(stations, on="fecha", how="left")
    daily["source_of_record"] = daily["station_id"].where(daily["station_id"].notna(), "MISSING_STATION")

    n_missing_days = daily["station_id"].isna().sum()
    log.append(f"Full daily span {full_range.min().date()}..{full_range.max().date()}: "
               f"{len(full_range)} days, {n_missing_days} days with NO station reading at all")

    # Identify + log the ACTUAL contiguous gap segments (not just min/max of missing dates,
    # which would misleadingly imply one single span when the missing days are scattered).
    gap_mask = daily["station_id"].isna().to_numpy()
    segments = []
    i = 0
    while i < len(gap_mask):
        if gap_mask[i]:
            j = i
            while j < len(gap_mask) and gap_mask[j]:
                j += 1
            segments.append((daily["fecha"].iloc[i], daily["fecha"].iloc[j - 1], j - i))
            i = j
        else:
            i += 1
    segments.sort(key=lambda s: -s[2])
    log.append(f"Station data has {len(segments)} separate missing-day gaps totalling "
               f"{gap_mask.sum()} days — filled via day-of-year climatology (prior years only). "
               f"See module docstring for why NASA POWER (the plan's designed gap-filler) could not "
               f"be used: power.larc.nasa.gov is blocked by this sandbox's egress policy.")
    for start, end, length in segments[:10]:
        log.append(f"  gap: {start.date()} .. {end.date()} ({length} days)")
    if len(segments) > 10:
        log.append(f"  ... and {len(segments) - 10} smaller gaps not listed individually")

    daily = doy_climatology_fill(daily, log)

    # Radiation: keep raw (no climatology fill — would fabricate a feature we've already
    # decided not to use), flag coverage.
    daily["has_radiation"] = daily["radiacion_wm2_avg"].notna()
    n_rad = daily["has_radiation"].sum()
    log.append(f"Radiation coverage: {n_rad}/{len(daily)} days ({n_rad/len(daily):.1%}) — "
               f"EXCLUDED from S3 feature set (insufficient coverage; see module docstring)")

    daily["source_of_record"] = daily["source_of_record"].replace("MISSING_STATION", "climatology_fill")

    filled_flag_cols = [f"is_filled_{v}" for v in CORE_VARS]
    daily["is_climatology_filled_any"] = daily[filled_flag_cols].any(axis=1)
    out_cols = (["fecha"] + CORE_VARS + RADIATION_VARS + ["source_of_record"]
                + filled_flag_cols + ["is_climatology_filled_any", "has_radiation"])
    final = daily[out_cols].sort_values("fecha").reset_index(drop=True)

    # Accept check (adapted): zero missing CORE-variable days after fill.
    for var in CORE_VARS:
        n_null = final[var].isna().sum()
        assert n_null == 0, f"{var} still has {n_null} null days after climatology fill"

    out_path = PROCESSED / "weather_daily.parquet"
    final.to_parquet(out_path, index=False)

    report_lines = [
        "# S2 — Weather Reconciliation Report",
        "",
        "## DEVIATION FROM PLAN (read first)",
        "",
        "The design doc's S2 recommends station-primary + **NASA POWER** gap-fill/radiation-backfill.",
        "`power.larc.nasa.gov` is blocked by this sandbox's egress proxy — confirmed via "
        "`curl $HTTPS_PROXY/__agentproxy/status`, which logged a `connect_rejected` / "
        "\"gateway answered 403 to CONNECT (policy denial)\" for that host (and, separately, for "
        "direct REST calls to the Supabase project itself — DB access here goes only through the "
        "Supabase MCP tool, not raw HTTPS). Per this environment's own operating rules, policy "
        "denials are reported, not retried or routed around.",
        "",
        "**Substitute implemented:** day-of-year seasonal climatology, built only from PRIOR years "
        "relative to the year being filled (forward-chaining, +/-5 calendar days) — never from the "
        "fill-year itself or any later year, including the test year. An earlier version of this "
        "fill pooled all years indiscriminately; an independent verifier caught it leaking 2026 "
        "(test-year) station readings backward into 2020-2025 fills and it was corrected before "
        "this artifact was frozen (see `src/s2_weather.py` docstring for detail). No external "
        "network data is used anywhere in this fallback.",
        "",
        "**Consequences to carry into the go/no-go writeup:**",
        "1. Station data has 39 separate missing-day gaps (331 days total, see list below), the "
        "largest being 2025-11-05..2026-03-17 (134 days) — spanning the tail of the *validate* year "
        "and the start of the *test* year. Those days have climatology-filled, not observed, weather "
        "features. Any model skill measured on test-year rounds that fall in or near this window is "
        "weaker evidence than rounds with real observed weather. Per-variable fill flags "
        "(`is_filled_<var>`) let downstream analysis check this precisely rather than relying on a "
        "single row-level flag.",
        "2. Radiation is dropped as a feature entirely (see coverage stats below) — it was only "
        "ever going to be usable via POWER backfill for the 2023-2025 wunderground era.",
        "",
        "## Station coverage",
        "",
    ]
    for st, g in stations.groupby("station_id"):
        report_lines.append(f"- **{st}**: {g['fecha'].min().date()} to {g['fecha'].max().date()} ({len(g)} days)")

    report_lines += [
        "",
        f"Full daily span: {full_range.min().date()} to {full_range.max().date()} ({len(full_range)} days)",
        f"Days with a real station reading: {len(full_range) - n_missing_days}",
        f"Days with NO station reading (climatology-filled): {n_missing_days}",
        "",
        "## Per-variable fill counts",
        "",
    ]
    for line in log:
        report_lines.append(f"- {line}")

    (REPORTS / "s2_weather_reconciliation.md").write_text("\n".join(report_lines) + "\n")

    print(f"OK: wrote {out_path} ({len(final)} rows)")
    print(f"OK: wrote reports/s2_weather_reconciliation.md")
    print(f"Blackout: {n_missing_days} days climatology-filled; radiation coverage {n_rad}/{len(final)} ({n_rad/len(final):.1%})")


if __name__ == "__main__":
    sys.exit(main())
