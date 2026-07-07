"""ONE shared eval harness (plan doc Rule B). Every baseline (S4) and model (S5) MUST import
this module for fold loading, feature/label column definitions, metrics, and bootstrap CIs —
no home-rolled splits or metrics. This is what makes tournament results comparable.

Never uses `train_test_split` / `shuffle=True` anywhere — out-of-year splits only.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import balanced_accuracy_score, f1_score, precision_recall_curve, auc, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"

HORIZONS = [14, 28]
TIER_ORDER = ["Low", "Med", "High"]

# Columns that must NEVER be used as model input features (identifiers, labels, or
# label-adjacent columns that would leak the existence/timing of the future round).
NON_FEATURE_COLS = {
    "fecha", "lote_key", "pest_group", "year", "n_members_observed",
    "tier_h14", "exceed_h14", "gap_days_h14",
    "tier_h28", "exceed_h28", "gap_days_h28",
}


def load_panel() -> pd.DataFrame:
    df = pd.read_parquet(PROCESSED / "panel.parquet")
    df["fecha"] = pd.to_datetime(df["fecha"])
    return df


def load_folds() -> dict:
    with open(PROCESSED / "folds.json") as f:
        return json.load(f)


def feature_columns(panel: pd.DataFrame) -> list[str]:
    """All columns usable as model input — everything except identifiers/labels.
    Includes the CURRENT round's own incidencia_pct/tier (legitimate: forecasting is
    'given today's reading + weather history, predict risk in 2-4 weeks', so today's
    reading is a valid input, not leakage of the FUTURE label).
    """
    return [c for c in panel.columns if c not in NON_FEATURE_COLS]


def get_split(panel: pd.DataFrame, horizon: int, train_years: list[int], eval_year: int,
              require_label: bool = True) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Out-of-year split for a given horizon. NEVER random — always by calendar year.
    `require_label=True` drops rows with no valid label for this horizon (no future round
    far enough ahead existed) from both sides, since they cannot be scored either way.
    """
    label_col = f"tier_h{horizon}"
    train = panel[panel["year"].isin(train_years)].copy()
    eval_df = panel[panel["year"] == eval_year].copy()
    if require_label:
        train = train[train[label_col].notna()]
        eval_df = eval_df[eval_df[label_col].notna()]
    return train, eval_df


def metrics_tier(y_true: pd.Series, y_pred: pd.Series) -> dict:
    """3-tier classification metrics: macro-F1 and balanced accuracy."""
    return {
        "macro_f1": f1_score(y_true, y_pred, labels=TIER_ORDER, average="macro", zero_division=0),
        "balanced_accuracy": balanced_accuracy_score(y_true, y_pred),
    }


def metrics_binary(y_true: pd.Series, y_score: pd.Series) -> dict:
    """Binary 'exceed high tier' metrics: ROC-AUC and PR-AUC, from a continuous score/probability."""
    y_true = np.asarray(y_true, dtype=int)
    y_score = np.asarray(y_score, dtype=float)
    if len(set(y_true)) < 2:
        return {"roc_auc": np.nan, "pr_auc": np.nan}
    precision, recall, _ = precision_recall_curve(y_true, y_score)
    return {
        "roc_auc": roc_auc_score(y_true, y_score),
        "pr_auc": auc(recall, precision),
    }


def block_bootstrap_ci(df: pd.DataFrame, metric_fn, n_boot: int = 500, seed: int = 42) -> dict:
    """Block-bootstrap over MONITORING ROUNDS (distinct fecha values), not individual rows —
    autocorrelation-aware per plan doc section 7. `metric_fn(sub_df) -> dict[str, float]`.
    `df` must contain a `fecha` column; rows sharing a fecha are resampled together as one block.
    """
    rng = np.random.default_rng(seed)
    unique_fechas = df["fecha"].unique()
    point = metric_fn(df)
    boot_results: dict[str, list] = {k: [] for k in point}

    for _ in range(n_boot):
        sampled_fechas = rng.choice(unique_fechas, size=len(unique_fechas), replace=True)
        parts = [df[df["fecha"] == f] for f in sampled_fechas]
        boot_df = pd.concat(parts, ignore_index=True)
        m = metric_fn(boot_df)
        for k, v in m.items():
            boot_results[k].append(v)

    out = {}
    for k, v in point.items():
        arr = np.array([x for x in boot_results[k] if not np.isnan(x)])
        if len(arr) == 0:
            out[k] = {"point": v, "ci_low": np.nan, "ci_high": np.nan}
        else:
            out[k] = {"point": v, "ci_low": float(np.percentile(arr, 2.5)), "ci_high": float(np.percentile(arr, 97.5))}
    return out


def skill_vs_baseline(model_metrics: dict, baseline_metrics: dict, keys: list[str]) -> dict:
    """Absolute margin: model - best baseline, per metric key."""
    return {k: model_metrics[k] - baseline_metrics[k] for k in keys}
