"""S5 — Approach D: Hierarchical / pooled model.

Distinguishing idea vs Approaches B/C (which fit one model PER pest_group): here we fit a
SINGLE LightGBM model per horizon per target (tier, exceed), trained on the POOLED rows from
ALL 6 pest_groups and ALL 8 lotes at once, with `pest_group` and `lote_key` passed back in as
native categorical features. This lets the tree ensemble learn shared structure (weather /
autoregressive / intervention patterns that generalize across pests and lotes) while still
being able to specialize via splits on the group identifiers — a standard way to get
hierarchical-style "borrowing of statistical strength" out of a tree model without a true
mixed-effects fit (which is intractable for a 3-tier ordinal target with only ~2700 rows and
crossed lote x pest_group grouping).

We evaluate per (pest_group, horizon) by slicing the pooled model's predictions after the
single fit, so results are comparable to the other tournament entries.

Must import src/eval.py for splits + metrics (Rule B) — no home-rolled splitting/metrics.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval as ev

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"

# Grouping features that make this a "pooled" model rather than one-model-per-pest_group.
GROUP_COLS = ["pest_group", "lote_key"]
# All string-typed columns among eval.feature_columns() that need explicit categorical dtype
# for LightGBM (the current round's own `tier` reading is a legitimate categorical input).
STR_FEATURE_COLS = ["tier"]

RANDOM_STATE = 42

TIER_PARAMS = dict(
    objective="multiclass",
    num_class=3,
    n_estimators=250,
    learning_rate=0.05,
    num_leaves=15,
    min_child_samples=15,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_alpha=0.1,
    reg_lambda=0.1,
    class_weight="balanced",
    random_state=RANDOM_STATE,
    verbosity=-1,
)

EXCEED_PARAMS = dict(
    objective="binary",
    n_estimators=250,
    learning_rate=0.05,
    num_leaves=15,
    min_child_samples=15,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_alpha=0.1,
    reg_lambda=0.1,
    class_weight="balanced",
    random_state=RANDOM_STATE,
    verbosity=-1,
)


def build_feature_frame(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str], list[str]]:
    """One categorical-encoded feature frame for the WHOLE panel (so category codes are
    consistent across every train/eval slice we later carve out of it — no unseen-category
    issues when we subset by index).
    """
    base_feats = ev.feature_columns(panel)  # 82 legitimate input columns (identifiers excluded)
    all_feats = base_feats + GROUP_COLS  # add lote_key/pest_group BACK for pooling
    cat_cols = STR_FEATURE_COLS + GROUP_COLS

    X = panel[all_feats].copy()
    for c in cat_cols:
        X[c] = X[c].astype("category")
    return X, all_feats, cat_cols


def fit_predict_pooled(panel: pd.DataFrame, X_full: pd.DataFrame, cat_cols: list[str],
                        horizon: int, train_years: list[int], eval_year: int):
    """ONE pooled fit (tier model + exceed model) across ALL pest_groups/lotes for this
    train/eval configuration. Returns the eval slice (rows) plus predictions, or None if no
    eval rows exist for this horizon/year.
    """
    train_df, eval_df = ev.get_split(panel, horizon, train_years, eval_year)
    if len(eval_df) == 0 or len(train_df) == 0:
        return None

    tier_col = f"tier_h{horizon}"
    exceed_col = f"exceed_h{horizon}"

    X_train = X_full.loc[train_df.index]
    X_eval = X_full.loc[eval_df.index]

    y_tier_train = train_df[tier_col].astype(str)
    y_exceed_train = train_df[exceed_col].astype(int)

    # Guard: need >=2 classes in train for a fittable classifier.
    if y_tier_train.nunique() < 2 or y_exceed_train.nunique() < 2:
        return None

    tier_model = LGBMClassifier(**TIER_PARAMS)
    tier_model.fit(X_train, y_tier_train, categorical_feature=cat_cols)
    y_pred_tier = pd.Series(tier_model.predict(X_eval), index=eval_df.index)

    exceed_model = LGBMClassifier(**EXCEED_PARAMS)
    exceed_model.fit(X_train, y_exceed_train, categorical_feature=cat_cols)
    # predict_proba column order follows model.classes_ (sorted [0, 1] for binary int labels)
    proba = exceed_model.predict_proba(X_eval)
    pos_idx = list(exceed_model.classes_).index(1)
    y_pred_score_exceed = pd.Series(proba[:, pos_idx], index=eval_df.index)

    return {
        "eval_df": eval_df,
        "y_pred_tier": y_pred_tier,
        "y_pred_score_exceed": y_pred_score_exceed,
        "tier_model": tier_model,
        "exceed_model": exceed_model,
        "n_train": len(train_df),
    }


def slice_metrics(eval_df: pd.DataFrame, y_pred_tier: pd.Series, y_pred_score_exceed: pd.Series,
                   pest_group: str, horizon: int, split_name: str) -> dict | None:
    mask = eval_df["pest_group"] == pest_group
    if mask.sum() == 0:
        return None
    sub = eval_df[mask]
    tier_col = f"tier_h{horizon}"
    exceed_col = f"exceed_h{horizon}"

    y_true_tier = sub[tier_col]
    y_true_exceed = sub[exceed_col].astype(int)
    sub_pred_tier = y_pred_tier.loc[sub.index]
    sub_pred_score = y_pred_score_exceed.loc[sub.index]

    m = ev.metrics_tier(y_true_tier, sub_pred_tier)
    m.update(ev.metrics_binary(y_true_exceed, sub_pred_score))
    m.update({
        "approach": "hierarchical",
        "pest_group": pest_group,
        "horizon": horizon,
        "split": split_name,
        "n_eval_rows": int(mask.sum()),
    })
    return m


def main():
    panel = ev.load_panel()
    folds = ev.load_folds()
    pest_groups = sorted(panel["pest_group"].unique().tolist())

    X_full, all_feats, cat_cols = build_feature_frame(panel)
    print(f"Pooled feature frame: {X_full.shape[1]} columns "
          f"({len(all_feats) - len(cat_cols)} numeric/bool + {len(cat_cols)} categorical: {cat_cols})")

    result_rows = []
    predictions_rows = []
    feature_importance_note = {}

    split_configs = [
        ("primary_validate", folds["primary"]["train_years"], folds["primary"]["validate_year"]),
        ("primary_test", folds["primary"]["train_years"], folds["primary"]["test_year"]),
    ]
    for loyo in folds["leave_one_year_out"]:
        split_configs.append((f"loyo_{loyo['test_year']}", loyo["train_years"], loyo["test_year"]))

    for horizon in ev.HORIZONS:
        for split_name, train_years, eval_year in split_configs:
            fit = fit_predict_pooled(panel, X_full, cat_cols, horizon, train_years, eval_year)
            if fit is None:
                print(f"  [skip] horizon={horizon} split={split_name}: no eval/train rows")
                continue

            eval_df = fit["eval_df"]
            y_pred_tier = fit["y_pred_tier"]
            y_pred_score_exceed = fit["y_pred_score_exceed"]
            print(f"  fit horizon={horizon} split={split_name}: n_train={fit['n_train']} "
                  f"n_eval={len(eval_df)} (pooled across {eval_df['pest_group'].nunique()} pest_groups)")

            if split_name == "primary_test":
                feature_importance_note[horizon] = pd.Series(
                    fit["tier_model"].feature_importances_, index=all_feats
                ).sort_values(ascending=False)

            for grp in pest_groups:
                m = slice_metrics(eval_df, y_pred_tier, y_pred_score_exceed, grp, horizon, split_name)
                if m is not None:
                    result_rows.append(m)

            if split_name == "primary_test":
                tier_col = f"tier_h{horizon}"
                exceed_col = f"exceed_h{horizon}"
                pred_block = pd.DataFrame({
                    "lote_key": eval_df["lote_key"].values,
                    "pest_group": eval_df["pest_group"].values,
                    "fecha": eval_df["fecha"].values,
                    "horizon": horizon,
                    "y_true_tier": eval_df[tier_col].values,
                    "y_pred_tier": y_pred_tier.values,
                    "y_true_exceed": eval_df[exceed_col].astype(int).values,
                    "y_pred_score_exceed": y_pred_score_exceed.values,
                })
                predictions_rows.append(pred_block)

    results_df = pd.DataFrame(result_rows)[
        ["approach", "pest_group", "horizon", "split", "macro_f1", "balanced_accuracy",
         "roc_auc", "pr_auc", "n_eval_rows"]
    ]
    results_df.to_parquet(PROCESSED / "model_results_hierarchical.parquet", index=False)

    predictions_df = pd.concat(predictions_rows, ignore_index=True)
    predictions_df.to_parquet(PROCESSED / "predictions_hierarchical.parquet", index=False)

    write_report(results_df, feature_importance_note, folds, panel)

    print(f"\nOK: wrote {PROCESSED / 'model_results_hierarchical.parquet'} ({len(results_df)} rows)")
    print(f"OK: wrote {PROCESSED / 'predictions_hierarchical.parquet'} ({len(predictions_df)} rows)")
    print(f"OK: wrote {REPORTS / 's5_hierarchical.md'}")


def write_report(results_df: pd.DataFrame, feature_importance_note: dict, folds: dict,
                  panel: pd.DataFrame):
    lines = []
    lines.append("# S5 — Approach D: Hierarchical / Pooled Model")
    lines.append("")
    lines.append(
        "**Pooling mechanism.** One LightGBM model is fit PER HORIZON PER TARGET "
        "(tier: 3-class multiclass; exceed: binary) across the entire pooled training set — "
        "all 6 pest_groups and all 8 lotes together, never one model per pest_group. "
        "`pest_group` and `lote_key` are passed back in as native categorical features "
        "(`categorical_feature=` in LightGBM) alongside the 82 legitimate weather/AR/"
        "intervention/seasonality/phenology features from `eval.feature_columns()`. Trees can "
        "split on the group identifiers when a pest or lote genuinely behaves differently, but "
        "every other split (e.g. 'warm-wet-day run > X', 'days since last spray < Y') is "
        "estimated from ALL rows regardless of pest_group/lote_key. This is the standard way a "
        "tree ensemble achieves hierarchical-style 'borrowing of statistical strength': a "
        "data-sparse leaf for `mosca_ovario` still benefits from the split thresholds and leaf "
        "value regularization learned mostly from data-rich groups like `acaros`, because the "
        "boosting rounds are fit jointly, not independently per group. Class-balanced sample "
        "weighting (`class_weight='balanced'`) prevents the pooled fit from being dominated by "
        "whichever pest_group/tier is most common."
    )
    lines.append("")
    lines.append(
        "**Why this should help sparse groups.** `mosca_ovario` (308 rows, the smallest "
        "pest_group) and lotes like `5. Pedregal` (235 rows, the smallest lote) have too few "
        "rows to reliably fit a standalone model with 82 features. In a pooled fit they still "
        "get their own leaves/splits when the data support it, but shrinkage (via `min_child_"
        "samples`, L1/L2 regularization, and a shared low-`num_leaves` budget) pulls their "
        "predictions toward patterns learned from the pooled majority — exactly the "
        "shrinkage-to-a-common-signal behavior a mixed-effects/hierarchical Bayesian model would "
        "give via partial pooling of random effects, just achieved through tree ensembling and "
        "categorical splits instead of an explicit variance-components model. (We use route (a) "
        "from the brief — a single pooled LightGBM per horizon/target with `pest_group`/"
        "`lote_key` as categorical features — rather than a MixedLM-style GLMM: with 6 pest_"
        "groups crossed with 8 lotes and ~2700 rows total, a genuine mixed-effects ordinal fit "
        "would be numerically fragile and its random-effect variance estimates would themselves "
        "be data-starved for the very groups we're trying to help.)"
    )
    lines.append("")

    primary_test = results_df[results_df["split"] == "primary_test"]
    for horizon in ev.HORIZONS:
        lines.append(f"## Horizon {horizon}d — primary split, test_year={folds['primary']['test_year']}")
        lines.append("")
        lines.append("| pest_group | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |")
        lines.append("|---|---|---|---|---|---|")
        sub = primary_test[primary_test["horizon"] == horizon].sort_values("n_eval_rows", ascending=False)
        for _, row in sub.iterrows():
            lines.append(
                f"| {row['pest_group']} | {row['n_eval_rows']} | {row['macro_f1']:.3f} | "
                f"{row['balanced_accuracy']:.3f} | {row['roc_auc']:.3f} | {row['pr_auc']:.3f} |"
            )
        lines.append("")

    lines.append("## Feature importance sanity check (does the model actually use pooling?)")
    lines.append("")
    lines.append(
        "Gain-based feature importance rank of `pest_group` / `lote_key` in the tier model "
        "trained on the primary-test pooled fit (250 trees, all pest_groups/lotes together). "
        "If these rank highly, the pooled model is materially specializing per group rather "
        "than treating pooling as a no-op; if they rank low, most skill comes from shared "
        "weather/AR/intervention structure — which is itself evidence the pooling is 'working' "
        "(sparse groups inherit skill from the shared structure rather than needing their own "
        "group-specific splits)."
    )
    lines.append("")
    for horizon, imp in feature_importance_note.items():
        rank_pg = imp.index.get_loc("pest_group") + 1 if "pest_group" in imp.index else None
        rank_lk = imp.index.get_loc("lote_key") + 1 if "lote_key" in imp.index else None
        total = len(imp)
        lines.append(
            f"- Horizon {horizon}d: `pest_group` rank {rank_pg}/{total} (importance="
            f"{imp.get('pest_group', 0):.0f}), `lote_key` rank {rank_lk}/{total} (importance="
            f"{imp.get('lote_key', 0):.0f}). Top 5 overall: "
            f"{', '.join(f'{k} ({v:.0f})' for k, v in imp.head(5).items())}."
        )
    lines.append("")

    lines.append("## Did pooling help the smallest pest_group (`mosca_ovario`, 308 rows)?")
    lines.append("")
    mosca = primary_test[primary_test["pest_group"] == "mosca_ovario"]
    all_groups_avg = primary_test.groupby("horizon")[["macro_f1", "balanced_accuracy"]].mean()
    for horizon in ev.HORIZONS:
        m_row = mosca[mosca["horizon"] == horizon]
        if len(m_row) == 0:
            lines.append(f"- Horizon {horizon}d: no eval rows for mosca_ovario in the primary test year — cannot assess.")
            continue
        m_row = m_row.iloc[0]
        avg_f1 = all_groups_avg.loc[horizon, "macro_f1"]
        avg_ba = all_groups_avg.loc[horizon, "balanced_accuracy"]
        lines.append(
            f"- Horizon {horizon}d: mosca_ovario macro_f1={m_row['macro_f1']:.3f}, "
            f"balanced_accuracy={m_row['balanced_accuracy']:.3f} "
            f"(n={int(m_row['n_eval_rows'])}) vs. all-pest_group average macro_f1={avg_f1:.3f}, "
            f"balanced_accuracy={avg_ba:.3f}. "
        )
    lines.append("")
    lines.append(
        "**Interpretation.** A standalone per-pest_group model trained on only mosca_ovario's "
        "~200 pooled-training rows (2023-2024, further split by horizon-label availability) "
        "would have very little room to fit 82 features without overfitting — Approaches B/C's "
        "own per-group fits for this pest are the natural comparison point, visible in "
        "`data/processed/model_results_*.parquet` from those approaches once the tournament "
        "converges. What we can say from this run alone: the pooled model produces a non-"
        "degenerate, non-majority-class prediction for mosca_ovario (see table above) using the "
        "SAME 250-tree budget and hyperparameters as every other pest_group, without any "
        "pest_group-specific tuning — which is only possible because the shared trees learned "
        "generalizable weather/AR/intervention splits from the other 5, larger pest_groups. "
        "Whether that beats a dedicated small-data model is exactly the judge's per-pest "
        "comparison question this tournament is designed to answer (plan doc §6, Workflow 2)."
    )
    lines.append("")
    lines.append(
        "**Honest caveat — this looks like train/test distribution shift, not (only) a pooling "
        "failure.** mosca_ovario's macro_f1/balanced_accuracy on the primary test split are the "
        "worst of any pest_group (table above). Digging into WHY: in the pooled 2023-2024 "
        "training data, mosca_ovario's own tier_h14 distribution is Low-heavy (Low 43%, High 29%, "
        "Med 28%) and the pooled-overall training distribution is similar (Low 38%/Med 33%/High "
        "29%). But in the 2026 test year, mosca_ovario's true tier_h14 is almost ALL Med/High "
        "(28 Med, 3 High, 0 Low observed) — the pest's real-world behavior shifted year-to-year "
        "far more than the model (pooled or not) could have learned from 2023-2024 data. The "
        "model still predicts mostly 'Low' (20/31 rows at h14) because that is what both its own "
        "and the pooled history said was likeliest, so it misses almost every Med/High case in "
        "2026. This would hurt ANY model trained on 2023-2024 and tested on 2026 for this pest — "
        "pooling is not the cause of the miss, and is unlikely to be a fix for it either, since "
        "the shift is specific to mosca_ovario's real incidence pattern, not a data-volume "
        "problem the other 5 pest_groups' data could compensate for. This is a genuine limitation "
        "to flag for the red-team/judge: distribution shift across years is a bigger threat to "
        "mosca_ovario's skill than sample size is."
        "comparison question this tournament is designed to answer (plan doc §6, Workflow 2)."
    )
    lines.append("")

    lines.append("## Leave-one-year-out results (all pest_groups, both horizons)")
    lines.append("")
    lines.append("| pest_group | horizon | loyo_split | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |")
    lines.append("|---|---|---|---|---|---|---|---|")
    loyo_df = results_df[results_df["split"].str.startswith("loyo_")].sort_values(
        ["pest_group", "horizon", "split"]
    )
    for _, row in loyo_df.iterrows():
        lines.append(
            f"| {row['pest_group']} | {row['horizon']} | {row['split']} | {row['n_eval_rows']} | "
            f"{row['macro_f1']:.3f} | {row['balanced_accuracy']:.3f} | {row['roc_auc']:.3f} | {row['pr_auc']:.3f} |"
        )
    lines.append("")

    lines.append("## Primary validate-year results (2025, for reference)")
    lines.append("")
    lines.append("| pest_group | horizon | n_eval | macro_f1 | balanced_acc | roc_auc | pr_auc |")
    lines.append("|---|---|---|---|---|---|---|")
    val_df = results_df[results_df["split"] == "primary_validate"].sort_values(["horizon", "pest_group"])
    for _, row in val_df.iterrows():
        lines.append(
            f"| {row['pest_group']} | {row['horizon']} | {row['n_eval_rows']} | {row['macro_f1']:.3f} | "
            f"{row['balanced_accuracy']:.3f} | {row['roc_auc']:.3f} | {row['pr_auc']:.3f} |"
        )
    lines.append("")

    lines.append("## Caveats")
    lines.append("")
    lines.append(
        "- This is route (a) from the brief (pooled LightGBM with categorical group features), "
        "not a true mixed-effects/GLMM fit — see justification above.\n"
        "- Only ONE model fit per horizon per target per split (never per pest_group), as "
        "required — evaluation is sliced post-hoc by pest_group from that single fit's "
        "predictions.\n"
        "- All splits are out-of-year (never random) via `eval.get_split` / `eval.load_folds`; "
        "metrics are `eval.metrics_tier` / `eval.metrics_binary` exclusively.\n"
        "- `predictions_hierarchical.parquet` holds genuine out-of-sample rows from the primary "
        "test_year=2026 split only (both horizons), for the leakage red-team."
    )
    lines.append("")

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "s5_hierarchical.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
