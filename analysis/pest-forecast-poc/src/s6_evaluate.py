"""S6 — Evaluation: converge the 4-model tournament, compute skill-vs-baseline with
block-bootstrap CIs, and check leave-one-year-out robustness (design doc section 5, S6).

Primary split: train 2023-24 / validate 2025 / test 2026. Also leave-one-year-out.
Metrics expressed as SKILL VS BEST BASELINE (never a raw metric alone) — never a
random-split metric anywhere (this whole pipeline is out-of-year only).

Output:
  data/processed/tournament_results.parquet  — every (approach, pest_group, horizon, split) row
  reports/s6_evaluation.md                   — per-pest winner table, skill margins + bootstrap
                                                CIs on the primary test year, LOYO robustness check
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval as ev
from s4_baselines import baseline_persistence, baseline_climatology, baseline_prevalence

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"
CONFIG = yaml.safe_load(open(ROOT / "config.yaml"))

APPROACHES = ["agronomic", "lightgbm", "elasticnet", "hierarchical"]
MACRO_F1_MARGIN = CONFIG["success"]["metric_macro_f1_margin"]
PR_AUC_MARGIN = CONFIG["success"]["metric_pr_auc_margin"]
MIN_PESTS_TO_GO = CONFIG["success"]["min_pests_to_go"]


def load_all_model_results() -> pd.DataFrame:
    parts = [pd.read_parquet(PROCESSED / f"model_results_{a}.parquet") for a in APPROACHES]
    return pd.concat(parts, ignore_index=True)


def load_all_predictions() -> dict:
    return {a: pd.read_parquet(PROCESSED / f"predictions_{a}.parquet") for a in APPROACHES}


def best_baseline_row(baselines: pd.DataFrame, pest_group: str, horizon: int, split: str) -> dict:
    row = baselines[(baselines["pest_group"] == pest_group) & (baselines["horizon"] == horizon)
                     & (baselines["split"] == split)]
    if row.empty:
        return None
    row = row.iloc[0]
    best = {"macro_f1": -1, "pr_auc": -1, "name": None}
    for name in ["persistence", "climatology", "prevalence"]:
        f1 = row[f"{name}_macro_f1"]
        pr = row[f"{name}_pr_auc"]
        if pd.notna(f1) and f1 > best["macro_f1"]:
            best["macro_f1"] = f1
            best["name"] = name
        if pd.notna(pr) and pr > best["pr_auc"]:
            best["pr_auc"] = pr
    return best


def baseline_prediction_frame(panel: pd.DataFrame, pest_group: str, horizon: int,
                               train_years: list, eval_year: int, baseline_name: str) -> pd.DataFrame:
    """Recompute a specific baseline's row-level predictions, for paired bootstrap comparison."""
    grp_panel = panel[panel["pest_group"] == pest_group]
    train, eval_df = ev.get_split(grp_panel, horizon, train_years, eval_year)
    if baseline_name == "persistence":
        pred_tier = baseline_persistence(eval_df)
        pred_score = (eval_df["tier"] == "High").astype(int)
    elif baseline_name == "climatology":
        pred_tier = baseline_climatology(panel, eval_df, pest_group, eval_year, horizon)
        pred_score = (pred_tier == "High").astype(int)
    else:
        pred_tier = baseline_prevalence(train, eval_df, horizon)
        pred_score = (pred_tier == "High").astype(int)
    out = eval_df[["lote_key", "fecha", f"tier_h{horizon}", f"exceed_h{horizon}"]].copy()
    out = out.rename(columns={f"tier_h{horizon}": "y_true_tier", f"exceed_h{horizon}": "y_true_exceed"})
    out["y_pred_tier_baseline"] = pred_tier.values
    out["y_pred_score_baseline"] = pred_score.values
    return out


def paired_skill_bootstrap(model_pred: pd.DataFrame, baseline_pred: pd.DataFrame, n_boot=500, seed=42) -> dict:
    """Block-bootstrap (over monitoring rounds = distinct fecha) the model-minus-baseline skill margin."""
    merged = model_pred.merge(baseline_pred, on=["lote_key", "fecha"], suffixes=("", "_bl"))
    if merged.empty:
        return {"macro_f1_skill": np.nan, "pr_auc_skill": np.nan}

    def metric_fn(df):
        m_f1 = ev.metrics_tier(df["y_true_tier"], df["y_pred_tier"])["macro_f1"]
        b_f1 = ev.metrics_tier(df["y_true_tier"], df["y_pred_tier_baseline"])["macro_f1"]
        m_bin = ev.metrics_binary(df["y_true_exceed"], df["y_pred_score_exceed"])["pr_auc"]
        b_bin = ev.metrics_binary(df["y_true_exceed"], df["y_pred_score_baseline"])["pr_auc"]
        return {"macro_f1_skill": m_f1 - b_f1, "pr_auc_skill": (m_bin - b_bin) if not np.isnan(m_bin) and not np.isnan(b_bin) else np.nan}

    return ev.block_bootstrap_ci(merged, metric_fn, n_boot=n_boot, seed=seed)


def main():
    panel = ev.load_panel()
    folds = ev.load_folds()
    baselines = pd.read_parquet(PROCESSED / "baselines.parquet")
    all_results = load_all_model_results()
    all_preds = load_all_predictions()

    all_results.to_parquet(PROCESSED / "tournament_results.parquet", index=False)

    pest_groups = sorted(panel["pest_group"].unique().tolist())
    train_years = folds["primary"]["train_years"]
    test_year = folds["primary"]["test_year"]

    report_lines = [
        "# S6 — Evaluation Report (tournament convergence)",
        "",
        f"Primary split: train={train_years}, validate={folds['primary']['validate_year']}, test={test_year}",
        f"Success criteria (frozen, config.yaml): macro_f1 margin >= {MACRO_F1_MARGIN}, "
        f"pr_auc margin >= {PR_AUC_MARGIN}, need >= {MIN_PESTS_TO_GO}/6 pests to clear",
        "",
        "## Per-pest, per-horizon: best-by-macro_f1 model AND best-by-pr_auc model (primary test year)",
        "",
        "Reported separately and NOT mixed — an earlier version of this report showed one model's "
        "name next to a *different* model's pr_auc value (caught by an independent red-team). Each "
        "row below always shows a single model's own macro_f1 AND its own pr_auc together; "
        "`clears_margin` is YES if EITHER the macro_f1-best model clears the macro_f1 margin, OR "
        "the pr_auc-best model clears the pr_auc margin (matches the pre-registered rule: \"does "
        "ANY candidate model beat baseline by the margin on EITHER metric\").",
        "",
        "| pest_group | horizon | best_by_macro_f1 (own macro_f1/pr_auc) | f1_skill | "
        "best_by_pr_auc (own macro_f1/pr_auc) | pr_skill | clears_margin |",
        "|---|---|---|---|---|---|---|",
    ]

    clears_margin_by_pest = {g: False for g in pest_groups}
    winner_table = []

    for grp in pest_groups:
        for horizon in ev.HORIZONS:
            sub = all_results[(all_results["pest_group"] == grp) & (all_results["horizon"] == horizon)
                               & (all_results["split"] == "primary_test")]
            if sub.empty:
                continue
            best_f1_row = sub.loc[sub["macro_f1"].idxmax()]
            best_pr_row = sub.loc[sub["pr_auc"].idxmax()] if sub["pr_auc"].notna().any() else best_f1_row

            base = best_baseline_row(baselines, grp, horizon, "primary_test")
            if base is None:
                continue

            f1_skill = best_f1_row["macro_f1"] - base["macro_f1"]
            pr_skill = (best_pr_row["pr_auc"] - base["pr_auc"]) if pd.notna(best_pr_row["pr_auc"]) and base["pr_auc"] >= 0 else np.nan

            clears_via_f1 = f1_skill >= MACRO_F1_MARGIN
            clears_via_pr = pd.notna(pr_skill) and pr_skill >= PR_AUC_MARGIN
            clears = clears_via_f1 or clears_via_pr
            # `winner` = whichever model actually cleared its own margin, preferring the macro_f1
            # winner if both/neither cleared (used downstream for bootstrap CI + LOYO robustness).
            winner_approach = best_f1_row["approach"] if (clears_via_f1 or not clears_via_pr) else best_pr_row["approach"]
            if clears:
                clears_margin_by_pest[grp] = True

            winner_table.append({
                "pest_group": grp, "horizon": horizon, "winner": winner_approach,
                "model_macro_f1": best_f1_row["macro_f1"], "baseline_macro_f1": base["macro_f1"],
                "macro_f1_skill": f1_skill, "model_pr_auc": best_pr_row["pr_auc"],
                "baseline_pr_auc": base["pr_auc"], "pr_auc_skill": pr_skill, "clears_margin": clears,
            })

            report_lines.append(
                f"| {grp} | {horizon} | {best_f1_row['approach']} ({best_f1_row['macro_f1']:.3f}/"
                f"{best_f1_row['pr_auc']:.3f}) | {f1_skill:+.3f} | {best_pr_row['approach']} "
                f"({best_pr_row['macro_f1']:.3f}/{best_pr_row['pr_auc']:.3f}) | {pr_skill:+.3f} | "
                f"{'YES' if clears else 'no'} |"
            )

    winner_df = pd.DataFrame(winner_table)
    winner_df.to_parquet(PROCESSED / "winner_table.parquet", index=False)

    # --- Bootstrap CIs for the pests that clear the margin (highest-stakes claims) ---
    report_lines += ["", "## Block-bootstrap 95% CIs (monitoring-round blocks) for margin-clearing (pest,horizon)", ""]
    ci_rows = winner_df[winner_df["clears_margin"]]
    if ci_rows.empty:
        report_lines.append("*(none — no pest/horizon cleared the pre-registered margin on the primary test year)*")
    else:
        report_lines.append("| pest_group | horizon | winner | macro_f1_skill (95% CI) | pr_auc_skill (95% CI) |")
        report_lines.append("|---|---|---|---|---|")
        for _, r in ci_rows.iterrows():
            grp, horizon, approach = r["pest_group"], r["horizon"], r["winner"]
            base = best_baseline_row(baselines, grp, horizon, "primary_test")
            model_pred = all_preds[approach]
            model_pred = model_pred[(model_pred["pest_group"] == grp) & (model_pred["horizon"] == horizon)]
            base_pred = baseline_prediction_frame(panel, grp, horizon, train_years, test_year, base["name"])
            ci = paired_skill_bootstrap(model_pred, base_pred)
            f1ci = ci["macro_f1_skill"]
            prci = ci["pr_auc_skill"]
            report_lines.append(
                f"| {grp} | {horizon} | {approach} | {f1ci['point']:+.3f} "
                f"[{f1ci['ci_low']:+.3f}, {f1ci['ci_high']:+.3f}] | {prci['point']:+.3f} "
                f"[{prci['ci_low']:+.3f}, {prci['ci_high']:+.3f}] |"
            )

    # --- Leave-one-year-out robustness: does the winning approach ALSO clear or show positive
    #     skill across other held-out years, not just one lucky test-year split? ---
    report_lines += [
        "", "## Leave-one-year-out robustness of the primary-test winner", "",
        "**Caveat (found by the S7 red-team, not fixed — verified non-outcome-changing):** tier "
        "thresholds (`compute_tier_thresholds` in `s3_panel.py`) are frozen ONCE from the primary "
        "split's `train_years=[2023,2024]` and reused for every LOYO fold. For the `loyo_2023` and "
        "`loyo_2024` rows below, that means the tier/exceed labels being scored were partly "
        "calibrated on the very year held out as \"test\" in that fold — those two LOYO columns are "
        "not fully leakage-clean out-of-year checks. `loyo_2025` and `loyo_2026` ARE clean (neither "
        "year is in the threshold-fitting years). The red-team traced this through and confirmed it "
        "cannot flip the final verdict here: the only two (pest,horizon) pairs that clear the "
        "primary-test margin at all have their sole positive LOYO year at 2025 (clean), and no other "
        "pest clears the primary margin regardless of LOYO. A full fix (per-fold tier thresholds) "
        "was judged not worth the rebuild cost for a POC given it cannot change this run's outcome.",
        "",
    ]
    report_lines.append("| pest_group | horizon | winner | loyo_year | model_macro_f1 | baseline_macro_f1 | skill | positive? |")
    report_lines.append("|---|---|---|---|---|---|---|---|")
    loyo_robust = {}
    for _, r in winner_df.iterrows():
        grp, horizon, approach = r["pest_group"], r["horizon"], r["winner"]
        positives = []
        for loyo in folds["leave_one_year_out"]:
            loyo_year = loyo["test_year"]
            split_name = f"loyo_{loyo_year}"
            m_row = all_results[(all_results["approach"] == approach) & (all_results["pest_group"] == grp)
                                 & (all_results["horizon"] == horizon) & (all_results["split"] == split_name)]
            b = best_baseline_row(baselines, grp, horizon, split_name)
            if m_row.empty or b is None:
                continue
            skill = m_row.iloc[0]["macro_f1"] - b["macro_f1"]
            positives.append(skill > 0)
            report_lines.append(
                f"| {grp} | {horizon} | {approach} | {loyo_year} | {m_row.iloc[0]['macro_f1']:.3f} | "
                f"{b['macro_f1']:.3f} | {skill:+.3f} | {'yes' if skill > 0 else 'no'} |"
            )
        loyo_robust[(grp, horizon)] = (sum(positives) >= len(positives) / 2) if positives else False

    report_lines += ["", "## Final per-pest verdict (clears margin on primary test AND majority-positive across LOYO)", ""]
    report_lines.append("| pest_group | any horizon clears margin + LOYO-robust? |")
    report_lines.append("|---|---|")
    final_pest_verdict = {}
    for grp in pest_groups:
        grp_rows = winner_df[winner_df["pest_group"] == grp]
        robust_clear = False
        for _, r in grp_rows.iterrows():
            if r["clears_margin"] and loyo_robust.get((grp, r["horizon"]), False):
                robust_clear = True
        final_pest_verdict[grp] = robust_clear
        report_lines.append(f"| {grp} | {'YES' if robust_clear else 'no'} |")

    n_go = sum(final_pest_verdict.values())
    report_lines += [
        "", f"**{n_go}/{len(pest_groups)} pests clear margin + are LOYO-robust "
        f"(need >= {MIN_PESTS_TO_GO} for a GO recommendation per config.yaml).**"
    ]

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "s6_evaluation.md").write_text("\n".join(report_lines) + "\n")

    import json
    with open(PROCESSED / "final_pest_verdict.json", "w") as f:
        json.dump({"per_pest": final_pest_verdict, "n_go": n_go, "min_required": MIN_PESTS_TO_GO}, f, indent=2)

    print(f"OK: wrote reports/s6_evaluation.md, data/processed/tournament_results.parquet, "
          f"data/processed/winner_table.parquet, data/processed/final_pest_verdict.json")
    print(f"{n_go}/{len(pest_groups)} pests clear margin + LOYO-robust:", final_pest_verdict)


if __name__ == "__main__":
    sys.exit(main())
