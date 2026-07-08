"""S4 — Pre-registered baselines, frozen BEFORE any modeling (plan doc section 5, S4).

Three baselines per pest_group per horizon:
  1. Persistence: predict next tier = current round's own tier.
  2. Seasonal climatology: predict the pest_group's typical tier for this week-of-year,
     computed EXCLUDING the eval year (whichever year is currently being evaluated —
     generalizes the doc's "excludes the test year" rule to work under leave-one-year-out too).
  3. Prevalence / majority class: predict the most common tier in the training years.

Written with a timestamp-equivalent ordering marker (git-committed before any model result
exists) so these numbers cannot be revised after seeing model results — see reports/s4_baselines.md.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval as ev

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"

TIER_ORDER = ev.TIER_ORDER


def baseline_persistence(eval_df: pd.DataFrame) -> pd.Series:
    """Predict next tier = current round's own tier (the `tier` column, i.e. today's reading)."""
    return eval_df["tier"]


def baseline_climatology(panel: pd.DataFrame, eval_df: pd.DataFrame, pest_group: str,
                          exclude_year: int, horizon: int) -> pd.Series:
    """Per pest_group, per week-of-year: the modal FUTURE tier (tier_h{horizon}) among rounds
    NOT in `exclude_year`, matched to eval_df's rows by week-of-year. Falls back to the
    pest_group's overall modal tier (still excluding exclude_year) if a given week-of-year
    was never observed outside the excluded year.
    """
    label_col = f"tier_h{horizon}"
    ref = panel[(panel["pest_group"] == pest_group) & (panel["year"] != exclude_year)
                & (panel[label_col].notna())].copy()
    ref["woy"] = ref["fecha"].dt.isocalendar().week.astype(int)

    modal_by_woy = ref.groupby("woy")[label_col].agg(lambda s: s.value_counts().idxmax())
    overall_modal = ref[label_col].value_counts().idxmax() if len(ref) else "Med"

    eval_woy = eval_df["fecha"].dt.isocalendar().week.astype(int)
    return eval_woy.map(modal_by_woy).fillna(overall_modal)


def baseline_prevalence(train_df: pd.DataFrame, eval_df: pd.DataFrame, horizon: int) -> pd.Series:
    """Majority class in the training years for this horizon's label, applied uniformly."""
    label_col = f"tier_h{horizon}"
    modal = train_df[label_col].dropna().value_counts().idxmax() if train_df[label_col].notna().any() else "Med"
    return pd.Series([modal] * len(eval_df), index=eval_df.index)


def evaluate_baselines_for_split(panel: pd.DataFrame, pest_group: str, horizon: int,
                                  train_years: list[int], eval_year: int) -> dict:
    grp_panel = panel[panel["pest_group"] == pest_group]
    train, eval_df = ev.get_split(grp_panel, horizon, train_years, eval_year)
    if len(eval_df) == 0:
        return None

    label_col = f"tier_h{horizon}"
    exceed_col = f"exceed_h{horizon}"
    y_true_tier = eval_df[label_col]
    y_true_exceed = eval_df[exceed_col].astype(int)

    results = {}
    pred_persist = baseline_persistence(eval_df)
    results["persistence"] = ev.metrics_tier(y_true_tier, pred_persist)
    # Binary version of persistence: "will exceed" if current tier is already High.
    score_persist_exceed = (eval_df["tier"] == "High").astype(int)
    results["persistence"].update(ev.metrics_binary(y_true_exceed, score_persist_exceed))

    pred_clim = baseline_climatology(panel, eval_df, pest_group, eval_year, horizon)
    results["climatology"] = ev.metrics_tier(y_true_tier, pred_clim)
    score_clim_exceed = (pred_clim == "High").astype(int)
    results["climatology"].update(ev.metrics_binary(y_true_exceed, score_clim_exceed))

    pred_prev = baseline_prevalence(train, eval_df, horizon)
    results["prevalence"] = ev.metrics_tier(y_true_tier, pred_prev)
    score_prev_exceed = (pred_prev == "High").astype(int)
    results["prevalence"].update(ev.metrics_binary(y_true_exceed, score_prev_exceed))

    results["n_eval_rows"] = len(eval_df)
    return results


def main():
    panel = ev.load_panel()
    folds = ev.load_folds()
    pest_groups = sorted(panel["pest_group"].unique().tolist())

    report_lines = [
        "# S4 — Pre-registered Baselines Report",
        "",
        "**FROZEN BEFORE ANY MODELING** — these numbers are committed to git in this same "
        "changeset, before any S5 model has been run, and must not be revised after seeing "
        "model results (plan doc section 5/6, Rule C).",
        "",
    ]

    all_rows = []
    for horizon in ev.HORIZONS:
        report_lines.append(f"## Horizon {horizon}d — primary split (test={folds['primary']['test_year']})")
        report_lines.append("")
        report_lines.append("| pest_group | best_baseline | macro_f1 | balanced_acc | roc_auc | pr_auc | n |")
        report_lines.append("|---|---|---|---|---|---|---|")
        for grp in pest_groups:
            res = evaluate_baselines_for_split(
                panel, grp, horizon, folds["primary"]["train_years"], folds["primary"]["test_year"]
            )
            if res is None:
                continue
            best_name, best_f1 = None, -1
            for name in ["persistence", "climatology", "prevalence"]:
                if res[name]["macro_f1"] > best_f1:
                    best_f1 = res[name]["macro_f1"]
                    best_name = name
            b = res[best_name]
            report_lines.append(
                f"| {grp} | {best_name} | {b['macro_f1']:.3f} | {b['balanced_accuracy']:.3f} | "
                f"{b.get('roc_auc', float('nan')):.3f} | {b.get('pr_auc', float('nan')):.3f} | {res['n_eval_rows']} |"
            )
            all_rows.append({"horizon": horizon, "pest_group": grp, "split": "primary_test",
                              **{f"{name}_{k}": v for name in res if name != "n_eval_rows"
                                 for k, v in res[name].items()}})
        report_lines.append("")

    # Leave-one-year-out baselines too (needed later for the LOYO robustness check).
    report_lines.append("## Leave-one-year-out baselines (best-of-3 macro-F1 per pest_group/horizon/year)")
    report_lines.append("")
    report_lines.append("| pest_group | horizon | loyo_test_year | best_baseline | macro_f1 |")
    report_lines.append("|---|---|---|---|---|")
    for loyo in folds["leave_one_year_out"]:
        test_year = loyo["test_year"]
        train_years = loyo["train_years"]
        for horizon in ev.HORIZONS:
            for grp in pest_groups:
                res = evaluate_baselines_for_split(panel, grp, horizon, train_years, test_year)
                if res is None:
                    continue
                best_name, best_f1 = None, -1
                for name in ["persistence", "climatology", "prevalence"]:
                    if res[name]["macro_f1"] > best_f1:
                        best_f1 = res[name]["macro_f1"]
                        best_name = name
                report_lines.append(f"| {grp} | {horizon} | {test_year} | {best_name} | {best_f1:.3f} |")
                all_rows.append({"horizon": horizon, "pest_group": grp, "split": f"loyo_{test_year}",
                                  **{f"{name}_{k}": v for name in res if name != "n_eval_rows"
                                     for k, v in res[name].items()}})

    baselines_df = pd.DataFrame(all_rows)
    baselines_df.to_parquet(ROOT / "data" / "processed" / "baselines.parquet", index=False)

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "s4_baselines.md").write_text("\n".join(report_lines) + "\n")
    print(f"OK: wrote reports/s4_baselines.md and data/processed/baselines.parquet ({len(baselines_df)} rows)")


if __name__ == "__main__":
    sys.exit(main())
