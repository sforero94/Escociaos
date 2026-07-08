"""S1 — Harmonize monitoring data (2023/2024 Excel + 2025/2026 DB) to a lote-level panel.

Output: data/processed/monitoreo_lote.parquet
  columns: [fecha, lote_key, pest_key, pest_group, arboles_monitoreados, incidencia_pct, source]

Also writes data/interim/floracion_db.parquet (DB-era phenology, used later in S3)
and reports/s1_dataquality.md (every repaired/dropped row, row-count reconciliation).

Contract: see docs/POC_PREDICCION_PLAGAS.md section 3.
"""
import sys
from pathlib import Path

import pandas as pd
import yaml

from normalize import PEST_GROUP_OF, normalize_lote, normalize_pest

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"

CONFIG = yaml.safe_load(open(ROOT / "config.yaml"))


def load_excel_2023(log: list) -> pd.DataFrame:
    path = RAW / "[2023] Planilla Detallada Escocia Hass.xlsx"
    df = pd.read_excel(path, sheet_name=CONFIG["sources"]["excel_2023_monitoreo_sheet"], header=0)
    n_in = len(df)
    df["fecha"] = pd.to_datetime(df["Fecha de monitoreo"], errors="coerce")
    bad_dates = df["fecha"].isna().sum()
    if bad_dates:
        log.append(f"2023: dropped {bad_dates} rows with unparseable fecha")
    df = df[df["fecha"].notna()].copy()

    df["lote_key"] = df["Lote"].apply(lambda x: normalize_lote(x, log))
    df = df[df["lote_key"].notna()].copy()

    df["pest_key"] = df["Plaga o enfermedad"].apply(lambda x: normalize_pest(x, log))

    df["arboles_monitoreados"] = pd.to_numeric(df["Arboles Monitoreados\nA"], errors="coerce")
    df["arboles_afectados"] = pd.to_numeric(df["Árboles Afectados\nB"], errors="coerce")
    df["incidencia_frac"] = pd.to_numeric(df["Incidencia"], errors="coerce")
    df["incidencia_pct"] = df["incidencia_frac"] * 100.0

    nan_rows = df[df["incidencia_pct"].isna() | df["arboles_monitoreados"].isna()]
    for _, r in nan_rows.iterrows():
        log.append(
            f"2023: DROP row with NaN incidencia/arboles_monitoreados fecha={r['fecha'].date()} "
            f"lote={r['lote_key']} pest={r['pest_key']}"
        )
    df = df[df["incidencia_pct"].notna() & df["arboles_monitoreados"].notna()].copy()

    over = df[df["incidencia_pct"] > 100.0]
    for _, r in over.iterrows():
        log.append(
            f"2023: DROP impossible row fecha={r['fecha'].date()} lote={r['lote_key']} "
            f"pest={r['pest_key']} arboles_monitoreados={r['arboles_monitoreados']} "
            f"arboles_afectados={r['arboles_afectados']} incidencia_frac={r['incidencia_frac']} "
            f"(afectados > monitoreados — impossible; unrepairable, dropping)"
        )
    df = df[df["incidencia_pct"] <= 100.0].copy()

    df["source"] = "excel_2023"
    out = df[["fecha", "lote_key", "pest_key", "arboles_monitoreados", "incidencia_pct", "source"]].copy()
    log.append(f"2023: {n_in} raw rows -> {len(out)} kept after harmonization")
    return out


def load_excel_2024(log: list) -> pd.DataFrame:
    path = RAW / "[2024] Planilla Detallada Escocia Hass.xlsx"
    df = pd.read_excel(path, sheet_name=CONFIG["sources"]["excel_2024_monitoreo_sheet"], header=11)
    n_in = len(df)
    df["fecha"] = pd.to_datetime(df["Fecha de monitoreo"], errors="coerce")
    bad_dates = df["fecha"].isna().sum()
    if bad_dates:
        log.append(f"2024: dropped {bad_dates} rows with unparseable fecha")
    df = df[df["fecha"].notna()].copy()

    # Sublote column mostly blank per plan note — drop it, aggregate to lote level.
    df["lote_key"] = df["Lote"].apply(lambda x: normalize_lote(x, log))
    df = df[df["lote_key"].notna()].copy()

    df["pest_key"] = df["Plaga o enfermedad"].apply(lambda x: normalize_pest(x, log))

    df["arboles_monitoreados"] = pd.to_numeric(df["Arboles Monitoreados\nA"], errors="coerce")
    df["arboles_afectados"] = pd.to_numeric(df["Árboles Afectados\nB"], errors="coerce")
    df["incidencia_frac"] = pd.to_numeric(df["Incidencia"], errors="coerce")
    df["incidencia_pct"] = df["incidencia_frac"] * 100.0

    nan_rows = df[df["incidencia_pct"].isna() | df["arboles_monitoreados"].isna()]
    for _, r in nan_rows.iterrows():
        log.append(
            f"2024: DROP row with NaN incidencia/arboles_monitoreados fecha={r['fecha'].date()} "
            f"lote={r['lote_key']} pest={r['pest_key']}"
        )
    df = df[df["incidencia_pct"].notna() & df["arboles_monitoreados"].notna()].copy()

    over = df[df["incidencia_pct"] > 100.0]
    for _, r in over.iterrows():
        log.append(
            f"2024: DROP impossible row fecha={r['fecha'].date()} lote={r['lote_key']} "
            f"pest={r['pest_key']} arboles_monitoreados={r['arboles_monitoreados']} "
            f"arboles_afectados={r['arboles_afectados']} incidencia_frac={r['incidencia_frac']} "
            f"(afectados > monitoreados — impossible; unrepairable, dropping)"
        )
    df = df[df["incidencia_pct"] <= 100.0].copy()

    df["source"] = "excel_2024"
    out = df[["fecha", "lote_key", "pest_key", "arboles_monitoreados", "incidencia_pct", "source"]].copy()
    log.append(f"2024: {n_in} raw rows -> {len(out)} kept after harmonization")
    return out


def load_db(log: list) -> tuple[pd.DataFrame, pd.DataFrame]:
    path = RAW / "db_monitoreos.csv"
    df = pd.read_csv(path)
    n_in = len(df)
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")

    df["lote_key"] = df["lote"].apply(lambda x: normalize_lote(x, log))
    df = df[df["lote_key"].notna()].copy()

    df["pest_key"] = df["pest"].apply(lambda x: normalize_pest(x, log))

    # DB incidencia is already a 0-100 percentage (confirmed against raw counts).
    df["arboles_monitoreados"] = pd.to_numeric(df["arboles_monitoreados"], errors="coerce")
    df["arboles_afectados"] = pd.to_numeric(df["arboles_afectados"], errors="coerce")
    df["incidencia_pct"] = pd.to_numeric(df["incidencia"], errors="coerce")

    impossible = df[df["arboles_afectados"] > df["arboles_monitoreados"]]
    for _, r in impossible.iterrows():
        log.append(
            f"db: DROP impossible row fecha={r['fecha'].date()} lote={r['lote_key']} "
            f"pest={r['pest_key']} arboles_monitoreados={r['arboles_monitoreados']} "
            f"arboles_afectados={r['arboles_afectados']} (afectados > monitoreados)"
        )
    df = df[df["arboles_afectados"] <= df["arboles_monitoreados"]].copy()
    df = df[df["incidencia_pct"].notna() & df["arboles_monitoreados"].notna()].copy()

    df["source"] = "db"
    monitoreo_out = df[["fecha", "lote_key", "pest_key", "arboles_monitoreados", "incidencia_pct", "source"]].copy()
    log.append(f"db: {n_in} raw rows -> {len(monitoreo_out)} kept after harmonization")

    # Floración fields — DB era only, carried separately for S3 (not part of the frozen pest panel schema).
    floracion_cols = ["fecha", "lote_key", "floracion_sin_flor", "floracion_brotes",
                       "floracion_flor_madura", "floracion_cuaje"]
    floracion = df[floracion_cols].drop_duplicates(subset=["fecha", "lote_key"]).copy()
    return monitoreo_out, floracion


def aggregate_arbol_weighted(df: pd.DataFrame, log: list) -> pd.DataFrame:
    """Collapse duplicate (fecha, lote_key, pest_key, source) rows via arbol-weighted mean incidencia."""
    before = len(df)
    dupe_mask = df.duplicated(subset=["fecha", "lote_key", "pest_key", "source"], keep=False)
    n_dupes = dupe_mask.sum()
    if n_dupes:
        log.append(f"aggregate: {n_dupes} rows involved in same-source (fecha,lote,pest) duplicates — weighted-averaging")

    def weighted(g: pd.DataFrame) -> pd.Series:
        w = g["arboles_monitoreados"]
        wsum = w.sum()
        inc = (g["incidencia_pct"] * w).sum() / wsum if wsum > 0 else g["incidencia_pct"].mean()
        return pd.Series({"arboles_monitoreados": wsum, "incidencia_pct": inc})

    out = (
        df.groupby(["fecha", "lote_key", "pest_key", "source"], as_index=False)
        .apply(weighted, include_groups=False)
    )
    log.append(f"aggregate: {before} rows -> {len(out)} rows after arbol-weighted collapse")
    return out


def main():
    log: list[str] = []
    REPORTS.mkdir(exist_ok=True)
    INTERIM.mkdir(exist_ok=True)
    PROCESSED.mkdir(exist_ok=True)

    e23 = load_excel_2023(log)
    e24 = load_excel_2024(log)
    dbm, floracion = load_db(log)

    combined = pd.concat([e23, e24, dbm], ignore_index=True)
    combined = aggregate_arbol_weighted(combined, log)

    # Now collapse across sources too, in case the same (fecha,lote,pest) appears under
    # different `source` tags (should not happen given the clean 2024->2025 seam, but verify).
    cross_source_dupes = combined.duplicated(subset=["fecha", "lote_key", "pest_key"], keep=False)
    n_cross = cross_source_dupes.sum()
    if n_cross:
        log.append(f"SEAM CHECK: {n_cross} rows share (fecha,lote,pest) across DIFFERENT sources — investigate")
        dup_dates = sorted(combined.loc[cross_source_dupes, "fecha"].dt.date.unique().tolist())
        log.append(f"  affected dates: {dup_dates[:20]}{'...' if len(dup_dates) > 20 else ''}")
    else:
        log.append("SEAM CHECK: 0 cross-source (fecha,lote,pest) duplicates — 2024->2025 seam is clean")

    combined["pest_group"] = combined["pest_key"].map(PEST_GROUP_OF)

    # Sanity: no incidencia_pct > 100 survives.
    assert (combined["incidencia_pct"] <= 100.0).all(), "incidencia_pct > 100 survived — leakage in drop logic"
    assert (combined["incidencia_pct"] >= 0.0).all(), "negative incidencia_pct found"

    final = combined[["fecha", "lote_key", "pest_key", "pest_group", "arboles_monitoreados", "incidencia_pct", "source"]]
    final = final.sort_values(["fecha", "lote_key", "pest_key"]).reset_index(drop=True)

    out_path = PROCESSED / "monitoreo_lote.parquet"
    final.to_parquet(out_path, index=False)

    floracion_path = INTERIM / "floracion_db.parquet"
    floracion.to_parquet(floracion_path, index=False)

    # --- per-year / per-pest counts for the report ---
    final["year"] = final["fecha"].dt.year
    per_year = final.groupby("year").size().to_dict()
    focus_keys = set(PEST_GROUP_OF.keys())
    focus_rows = final[final["pest_key"].isin(focus_keys)]
    per_pest_group = focus_rows.groupby("pest_group").size().to_dict()

    report_lines = [
        "# S1 — Data Quality Report (monitoring harmonization)",
        "",
        f"**Output:** `data/processed/monitoreo_lote.parquet` — {len(final)} rows",
        f"**Floración interim:** `data/interim/floracion_db.parquet` — {len(floracion)} rows (DB era only)",
        "",
        "## Row counts by year",
        "",
        "| Year | Rows |",
        "|---|---|",
    ]
    for yr, cnt in sorted(per_year.items()):
        report_lines.append(f"| {yr} | {cnt} |")

    report_lines += ["", "## Rows by focus pest_group", "", "| pest_group | Rows |", "|---|---|"]
    for grp, cnt in sorted(per_pest_group.items()):
        report_lines.append(f"| {grp} | {cnt} |")

    report_lines += ["", "## Distinct lote_key x pest_key series and their span", ""]
    series_span = (
        final.groupby(["lote_key", "pest_key"])["fecha"]
        .agg(["count", "min", "max"])
        .reset_index()
        .sort_values(["lote_key", "pest_key"])
    )
    report_lines.append(f"Total distinct (lote_key, pest_key) series: {len(series_span)}")

    report_lines += ["", "## Processing log (every drop/repair, in order)", ""]
    for line in log:
        report_lines.append(f"- {line}")

    (REPORTS / "s1_dataquality.md").write_text("\n".join(report_lines) + "\n")

    print(f"OK: wrote {out_path} ({len(final)} rows), {floracion_path} ({len(floracion)} rows)")
    print(f"OK: wrote reports/s1_dataquality.md ({len(log)} log lines)")
    print("Per-year counts:", per_year)
    print("Per-focus-pest-group counts:", per_pest_group)


if __name__ == "__main__":
    sys.exit(main())
