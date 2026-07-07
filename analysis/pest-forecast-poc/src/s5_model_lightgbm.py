"""S5 — Modeling tournament, Approach B: regularized LightGBM with monotonic constraints.

One LightGBM model per (pest_group x horizon) for EACH target:
  - tier_h{h}   -> multiclass objective (num_class=3, classes ordinally encoded Low/Med/High -> 0/1/2)
  - exceed_h{h} -> binary objective, continuous probability output

Kept deliberately small/regularized given the tiny per-pest-group sample sizes (a few hundred
rows train, tens to ~100 rows validate/test per split): shallow trees (max_depth=4,
num_leaves<=15), high min_child_samples, L1/L2 penalties, early stopping against the
`validate_year` split of the primary fold ONLY (never against test_year — see the docstring
of `fit_primary` below).

Monotonic constraints (documented per-pest-group rationale in MONOTONE_SPEC below) are applied
to the trailing weather window that matches the forecast horizon (w14 features for the 14-day
horizon model, w28 features for the 28-day horizon model) plus two universal constraints that
hold for every pest: more recent incidence should not lower the forecast (`ar_last_incidencia_pct`,
`incidencia_pct`), and a currently-higher tier should not lower the forecast (`tier`, ordinally
encoded).

Categorical encoding: the only non-numeric input feature is `tier` (current round's own tier,
Low/Med/High). It is ORDINALLY encoded (0/1/2), not passed as a LightGBM `categorical_feature`,
because (a) it has a natural order that ordinal encoding preserves and unordered categorical
splits would discard, and (b) LightGBM's `monotone_constraints` cannot be applied to
categorical-typed features, and we want a monotonic constraint on this column (higher current
tier => forecast should not decrease). Boolean flag columns (`intervention_coverage_unknown`,
`floracion_available`) are cast to int8; every other feature is left as native float/int with
NaN passed through untouched (LightGBM handles missing values natively — no imputation).

Outputs:
  data/processed/model_results_lightgbm.parquet
  data/processed/predictions_lightgbm.parquet   (primary TEST split, test_year=2026, only)
  reports/s5_lightgbm.md
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval as ev

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"

SEED = 42
TIER_ORDER = ev.TIER_ORDER  # ["Low", "Med", "High"]
TIER2IDX = {t: i for i, t in enumerate(TIER_ORDER)}
IDX2TIER = {i: t for t, i in TIER2IDX.items()}

MIN_TRAIN_ROWS = 30       # below this, flag the fit as unreliable / skip
MIN_TRAIN_CLASSES = 2     # need at least 2 distinct classes present to fit meaningfully
FALLBACK_NUM_BOOST_ROUND = 100  # used for LOYO folds if the primary fit was skipped entirely
EARLY_STOPPING_ROUNDS = 30
MAX_BOOST_ROUND = 500

BOOL_COLS = ["intervention_coverage_unknown", "floracion_available"]

# ---------------------------------------------------------------------------
# Monotonic constraint rationale (documented per plan doc instructions — POC-level
# judgment call, not exhaustive). Keys are generic weather-window SUFFIXES; they get
# prefixed with w{horizon}_ so the constrained window matches each model's own horizon
# (14d model constrains w14_*, 28d model constrains w28_*). +1 = incidence/risk should not
# decrease as the driver increases; -1 = should not increase.
# ---------------------------------------------------------------------------
MONOTONE_SPEC: dict[str, dict[str, int]] = {
    # Mites: classic hot/dry flare pest. More hot-dry days / degree-days -> risk should not
    # fall; more rain/humidity (which suppresses mite population) -> risk should not rise.
    "acaros": {
        "hot_dry_days": 1,
        "hot_dry_max_run": 1,
        "gdd_sum": 1,
        "humedad_pct_avg_mean": -1,
        "rain_sum": -1,
    },
    # Foliar/fruit fungal complex: warm-wet infection windows. More warm-wet days, more rain,
    # more humidity -> risk should not fall; more hot-dry days (dries out the canopy) -> should
    # not rise.
    "fungoso": {
        "warm_wet_days": 1,
        "warm_wet_max_run": 1,
        "rain_sum": 1,
        "humedad_pct_avg_mean": 1,
        "hot_dry_days": -1,
    },
    # Monalonión: highland flagship pest, favored by humid/cooler conditions.
    "monalonion": {
        "humedad_pct_avg_mean": 1,
        "rain_sum": 1,
        "temp_c_avg_mean": -1,
    },
    # Thrips: warm/dry conditions + floración (floración handled via the non-window special
    # case below, not a trailing-weather-window feature).
    "thrips": {
        "hot_dry_days": 1,
        "temp_c_max_mean": 1,
        "rain_sum": -1,
    },
    # Cucarrón marceño: seasonal emergence tied to rain ONSET (more rainy days / rain volume
    # in the window -> emergence risk should not fall).
    "cucarron_marceno": {
        "rain_days": 1,
        "rain_sum": 1,
    },
    # Mosca del ovario: floración-phenology driven, not weather-window driven — see the
    # non-window special case below (floracion_flor_madura). No trailing-weather constraints
    # asserted here (deliberately conservative: we don't have a confident enough agronomic
    # prior on which weather driver dominates for this pest to justify a hard constraint).
    "mosca_ovario": {},
}

# Non-window-specific constraints, applied to every model for every pest_group (universal
# persistence priors) plus one pest-specific phenology constraint.
UNIVERSAL_CONSTRAINTS = {
    "ar_last_incidencia_pct": 1,   # higher recent incidence should not lower the forecast
    "incidencia_pct": 1,           # higher current-round incidence should not lower the forecast
    "tier": 1,                     # ordinally-encoded current tier; higher should not lower forecast
}
PEST_SPECIFIC_NONWINDOW_CONSTRAINTS = {
    "mosca_ovario": {"floracion_flor_madura": 1},
    "thrips": {"floracion_flor_madura": 1},
}


def encode_features(df: pd.DataFrame, feats: list[str]) -> pd.DataFrame:
    """Ordinal-encode `tier`, cast bool flag columns to int8, leave everything else as-is.
    LightGBM natively handles NaN — no imputation performed.
    """
    X = df[feats].copy()
    if "tier" in X.columns:
        X["tier"] = X["tier"].map(TIER2IDX).astype("float64")
    for c in BOOL_COLS:
        if c in X.columns:
            X[c] = X[c].astype("int8")
    return X


def build_monotone_constraints(pest_group: str, horizon: int, feats: list[str]) -> list[int]:
    spec = dict(MONOTONE_SPEC.get(pest_group, {}))
    spec.update(PEST_SPECIFIC_NONWINDOW_CONSTRAINTS.get(pest_group, {}))
    window_prefix = f"w{horizon}_"
    col_direction = dict(UNIVERSAL_CONSTRAINTS)
    for suffix, direction in spec.items():
        # window-specific suffixes get the w{horizon}_ prefix; phenology / non-window keys
        # (e.g. floracion_flor_madura) are already full column names.
        windowed_name = window_prefix + suffix
        if windowed_name in feats:
            col_direction[windowed_name] = direction
        elif suffix in feats:
            col_direction[suffix] = direction
    return [col_direction.get(f, 0) for f in feats]


def base_params(objective: str, monotone_constraints: list[int], num_class: int | None = None) -> dict:
    p = dict(
        objective=objective,
        max_depth=4,
        num_leaves=15,
        min_child_samples=20,
        min_data_in_leaf=20,
        learning_rate=0.05,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=1,
        lambda_l1=0.1,
        lambda_l2=1.0,
        monotone_constraints=monotone_constraints,
        monotone_constraints_method="basic",
        verbosity=-1,
        seed=SEED,
        deterministic=True,
        force_row_wise=True,
    )
    if num_class is not None:
        p["num_class"] = num_class
    return p


def fit_primary(Xtr, ytr, Xval, yval, objective, monotone_constraints, num_class=None):
    """Fit against train years with early stopping evaluated against `validate_year` ONLY.
    Test-year data never enters this function — the contract's non-negotiable rule
    ("never let test_year touch model fitting or hyperparameter selection").
    """
    params = base_params(objective, monotone_constraints, num_class)
    train_set = lgb.Dataset(Xtr, label=ytr, free_raw_data=False)
    valid_set = lgb.Dataset(Xval, label=yval, reference=train_set, free_raw_data=False)
    booster = lgb.train(
        params, train_set, num_boost_round=MAX_BOOST_ROUND, valid_sets=[valid_set],
        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
    )
    return booster, booster.best_iteration or MAX_BOOST_ROUND


def fit_fixed(Xtr, ytr, objective, monotone_constraints, num_boost_round, num_class=None):
    """Fit with a FIXED number of rounds (no early stopping) — used for leave-one-year-out
    folds, where no leakage-safe validation year exists inside the fold. The round count is
    carried over from the primary split's early-stopping result for this pest_group/horizon/
    target (a documented simplification: see reports/s5_lightgbm.md).
    """
    params = base_params(objective, monotone_constraints, num_class)
    train_set = lgb.Dataset(Xtr, label=ytr, free_raw_data=False)
    booster = lgb.train(params, train_set, num_boost_round=max(num_boost_round, 10),
                         callbacks=[lgb.log_evaluation(0)])
    return booster


def sufficient(df: pd.DataFrame, label_col: str) -> tuple[bool, str]:
    if len(df) < MIN_TRAIN_ROWS:
        return False, f"train n={len(df)} < {MIN_TRAIN_ROWS}"
    n_classes = df[label_col].nunique(dropna=True)
    if n_classes < MIN_TRAIN_CLASSES:
        return False, f"only {n_classes} distinct class(es) in train"
    return True, ""


def predict_tier(booster: lgb.Booster, X: pd.DataFrame) -> np.ndarray:
    proba = booster.predict(X)
    return proba.argmax(axis=1)


def main():
    panel = ev.load_panel()
    folds = ev.load_folds()
    feats = ev.feature_columns(panel)
    pest_groups = sorted(panel["pest_group"].unique().tolist())

    result_rows: list[dict] = []
    prediction_rows: list[dict] = []
    feature_importance: dict[tuple[str, int], pd.Series] = {}
    notes: list[str] = []

    primary = folds["primary"]
    train_years_p = primary["train_years"]
    validate_year_p = primary["validate_year"]
    test_year_p = primary["test_year"]

    for pest_group in pest_groups:
        grp_panel = panel[panel["pest_group"] == pest_group].copy()

        for horizon in ev.HORIZONS:
            tier_col = f"tier_h{horizon}"
            exceed_col = f"exceed_h{horizon}"
            constraints = build_monotone_constraints(pest_group, horizon, feats)

            # ---------------- PRIMARY SPLIT ----------------
            train_df, val_df = ev.get_split(grp_panel, horizon, train_years_p, validate_year_p)
            _, test_df = ev.get_split(grp_panel, horizon, train_years_p, test_year_p)

            if len(test_df):
                present_tiers = set(test_df[tier_col].dropna().unique())
                missing_tiers = set(TIER_ORDER) - present_tiers
                if missing_tiers:
                    notes.append(
                        f"[{pest_group} h{horizon}] primary_test (2026, n={len(test_df)}): tier(s) "
                        f"{sorted(missing_tiers)} never occur in the eval set (distribution shift, not a "
                        "bug) — macro-F1 is dragged down because the absent class always scores F1=0."
                    )
                present_exceed = set(test_df[exceed_col].dropna().unique())
                if len(present_exceed) < 2 and len(present_exceed) > 0:
                    notes.append(
                        f"[{pest_group} h{horizon}] primary_test (2026): exceed_h{horizon} is a single "
                        f"class ({present_exceed}) in the eval set -> ROC-AUC/PR-AUC undefined (nan), per "
                        "eval.metrics_binary's own contract, not a bug."
                    )

            Xtr = encode_features(train_df, feats)
            Xval = encode_features(val_df, feats)
            Xtest = encode_features(test_df, feats)

            # ---- tier (multiclass) ----
            ytr_tier = train_df[tier_col].map(TIER2IDX)
            yval_tier = val_df[tier_col].map(TIER2IDX)
            ytest_tier = test_df[tier_col].map(TIER2IDX)

            ok, why = sufficient(train_df.assign(_y=ytr_tier), "_y")
            best_round_tier = FALLBACK_NUM_BOOST_ROUND
            tier_booster = None
            if not ok or len(val_df) == 0:
                notes.append(f"[{pest_group} h{horizon}] tier model SKIPPED (primary): {why or 'empty validate set'}")
            else:
                tier_booster, best_round_tier = fit_primary(
                    Xtr, ytr_tier, Xval, yval_tier, "multiclass", constraints, num_class=3
                )
                feature_importance[(pest_group, horizon)] = pd.Series(
                    tier_booster.feature_importance(importance_type="gain"), index=feats
                ).sort_values(ascending=False)

                if len(val_df):
                    pred_val = pd.Series(IDX2TIER).loc[predict_tier(tier_booster, Xval)].values
                    m = ev.metrics_tier(val_df[tier_col].values, pred_val)
                    result_rows.append(dict(approach="lightgbm", pest_group=pest_group, horizon=horizon,
                                             split="primary_validate", macro_f1=m["macro_f1"],
                                             balanced_accuracy=m["balanced_accuracy"], roc_auc=np.nan,
                                             pr_auc=np.nan, n_eval_rows=len(val_df)))
                if len(test_df):
                    pred_test = pd.Series(IDX2TIER).loc[predict_tier(tier_booster, Xtest)].values
                    m = ev.metrics_tier(test_df[tier_col].values, pred_test)
                    result_rows.append(dict(approach="lightgbm", pest_group=pest_group, horizon=horizon,
                                             split="primary_test", macro_f1=m["macro_f1"],
                                             balanced_accuracy=m["balanced_accuracy"], roc_auc=np.nan,
                                             pr_auc=np.nan, n_eval_rows=len(test_df)))

            # ---- exceed (binary) ----
            tr_mask = train_df[exceed_col].notna()
            val_mask = val_df[exceed_col].notna()
            test_mask = test_df[exceed_col].notna()
            ytr_exc = train_df.loc[tr_mask, exceed_col].astype(int)
            yval_exc = val_df.loc[val_mask, exceed_col].astype(int)
            ytest_exc = test_df.loc[test_mask, exceed_col].astype(int)

            ok_e, why_e = sufficient(train_df.loc[tr_mask].assign(_y=ytr_exc), "_y")
            best_round_exc = FALLBACK_NUM_BOOST_ROUND
            exceed_booster = None
            if not ok_e or val_mask.sum() == 0:
                notes.append(f"[{pest_group} h{horizon}] exceed model SKIPPED (primary): {why_e or 'empty validate set'}")
            else:
                exceed_booster, best_round_exc = fit_primary(
                    Xtr.loc[tr_mask], ytr_exc, Xval.loc[val_mask], yval_exc, "binary", constraints
                )
                if val_mask.sum():
                    score_val = exceed_booster.predict(Xval.loc[val_mask])
                    m = ev.metrics_binary(yval_exc.values, score_val)
                    result_rows.append(dict(approach="lightgbm", pest_group=pest_group, horizon=horizon,
                                             split="primary_validate", macro_f1=np.nan, balanced_accuracy=np.nan,
                                             roc_auc=m["roc_auc"], pr_auc=m["pr_auc"], n_eval_rows=int(val_mask.sum())))
                if test_mask.sum():
                    score_test = exceed_booster.predict(Xtest.loc[test_mask])
                    m = ev.metrics_binary(ytest_exc.values, score_test)
                    result_rows.append(dict(approach="lightgbm", pest_group=pest_group, horizon=horizon,
                                             split="primary_test", macro_f1=np.nan, balanced_accuracy=np.nan,
                                             roc_auc=m["roc_auc"], pr_auc=m["pr_auc"], n_eval_rows=int(test_mask.sum())))

            # ---- predictions.parquet rows: primary TEST split only, merge tier + exceed ----
            if len(test_df):
                pred_tier_out = (pd.Series(IDX2TIER).loc[predict_tier(tier_booster, Xtest)].values
                                  if tier_booster is not None else np.array([np.nan] * len(test_df)))
                score_exceed_out = np.full(len(test_df), np.nan)
                if exceed_booster is not None:
                    score_exceed_out[test_mask.values] = exceed_booster.predict(Xtest.loc[test_mask])
                for i, (_, row) in enumerate(test_df.iterrows()):
                    prediction_rows.append(dict(
                        lote_key=row["lote_key"], pest_group=pest_group, fecha=row["fecha"], horizon=horizon,
                        y_true_tier=row[tier_col], y_pred_tier=pred_tier_out[i],
                        y_true_exceed=row[exceed_col], y_pred_score_exceed=score_exceed_out[i],
                    ))

            # ---------------- LEAVE-ONE-YEAR-OUT ----------------
            for loyo in folds["leave_one_year_out"]:
                ty, trys = loyo["test_year"], loyo["train_years"]
                train_l, test_l = ev.get_split(grp_panel, horizon, trys, ty)
                if len(test_l) == 0:
                    continue
                Xtr_l = encode_features(train_l, feats)
                Xtest_l = encode_features(test_l, feats)

                ytr_l_tier = train_l[tier_col].map(TIER2IDX)
                ok_l, why_l = sufficient(train_l.assign(_y=ytr_l_tier), "_y")
                if ok_l:
                    booster_l = fit_fixed(Xtr_l, ytr_l_tier, "multiclass", constraints, best_round_tier, num_class=3)
                    pred_l = pd.Series(IDX2TIER).loc[predict_tier(booster_l, Xtest_l)].values
                    m = ev.metrics_tier(test_l[tier_col].values, pred_l)
                    result_rows.append(dict(approach="lightgbm", pest_group=pest_group, horizon=horizon,
                                             split=f"loyo_{ty}", macro_f1=m["macro_f1"],
                                             balanced_accuracy=m["balanced_accuracy"], roc_auc=np.nan,
                                             pr_auc=np.nan, n_eval_rows=len(test_l)))
                else:
                    notes.append(f"[{pest_group} h{horizon}] tier model SKIPPED (loyo {ty}): {why_l}")

                trm = train_l[exceed_col].notna()
                tsm = test_l[exceed_col].notna()
                ytr_l_exc = train_l.loc[trm, exceed_col].astype(int)
                ok_le, why_le = sufficient(train_l.loc[trm].assign(_y=ytr_l_exc), "_y")
                if ok_le and tsm.sum():
                    booster_le = fit_fixed(Xtr_l.loc[trm], ytr_l_exc, "binary", constraints, best_round_exc)
                    score_l = booster_le.predict(Xtest_l.loc[tsm])
                    m = ev.metrics_binary(test_l.loc[tsm, exceed_col].astype(int).values, score_l)
                    result_rows.append(dict(approach="lightgbm", pest_group=pest_group, horizon=horizon,
                                             split=f"loyo_{ty}", macro_f1=np.nan, balanced_accuracy=np.nan,
                                             roc_auc=m["roc_auc"], pr_auc=m["pr_auc"], n_eval_rows=int(tsm.sum())))
                elif not ok_le:
                    notes.append(f"[{pest_group} h{horizon}] exceed model SKIPPED (loyo {ty}): {why_le}")

    # ---------------- write outputs ----------------
    results_df = pd.DataFrame(result_rows)
    # Collapse tier-only and exceed-only rows that share (pest_group,horizon,split) into one
    # row per the requested schema (macro_f1/balanced_accuracy from tier row, roc_auc/pr_auc
    # from exceed row, n_eval_rows from whichever is present — they should match anyway).
    merged = (
        results_df.groupby(["approach", "pest_group", "horizon", "split"], as_index=False)
        .agg(macro_f1=("macro_f1", "max"), balanced_accuracy=("balanced_accuracy", "max"),
             roc_auc=("roc_auc", "max"), pr_auc=("pr_auc", "max"), n_eval_rows=("n_eval_rows", "max"))
    )
    merged.to_parquet(PROCESSED / "model_results_lightgbm.parquet", index=False)

    preds_df = pd.DataFrame(prediction_rows)
    preds_df.to_parquet(PROCESSED / "predictions_lightgbm.parquet", index=False)

    write_report(merged, feature_importance, notes, folds)

    print(f"OK: model_results_lightgbm.parquet ({len(merged)} rows), "
          f"predictions_lightgbm.parquet ({len(preds_df)} rows), reports/s5_lightgbm.md")


def write_report(results_df: pd.DataFrame, feature_importance: dict, notes: list[str], folds: dict):
    lines = [
        "# S5 — Approach B: Regularized LightGBM with Monotonic Constraints",
        "",
        "## Setup",
        "",
        "One LightGBM model per (pest_group x horizon) per target (tier: multiclass num_class=3; "
        "exceed: binary). Hyperparameters, chosen for the small per-pest-group sample sizes "
        "(a few hundred train rows): `max_depth=4`, `num_leaves=15`, `min_child_samples=20`, "
        "`min_data_in_leaf=20`, `learning_rate=0.05`, `feature_fraction=0.8`, `bagging_fraction=0.8`, "
        "`lambda_l1=0.1`, `lambda_l2=1.0`, up to 500 boosting rounds with early stopping "
        "(patience 30) evaluated **only** against `validate_year=2025` of the primary split. "
        "`test_year=2026` never touches fitting or round-count selection.",
        "",
        "For leave-one-year-out folds there is no leakage-safe validation year inside the fold "
        "(all 4 non-test years are only ever the training set), so each LOYO fit reuses the "
        "boosting-round count chosen by the primary split's early stopping for that same "
        "pest_group/horizon/target, then trains on the fold's own train_years with no further "
        "early stopping. This is a documented POC-level simplification, not a re-tuning against "
        "the LOYO test year.",
        "",
        "**Categorical encoding**: `tier` (current round's own Low/Med/High reading) is the only "
        "non-numeric feature. It is ordinally encoded 0/1/2 (not passed via LightGBM's "
        "`categorical_feature`) so that (a) its natural order is preserved and (b) a monotonic "
        "constraint can be placed on it — `monotone_constraints` does not support "
        "categorical-typed columns. Boolean flags (`intervention_coverage_unknown`, "
        "`floracion_available`) are cast to int8. All other features are left as native float/int; "
        "NaN (e.g. pre-2025 floración fields) is passed through untouched — LightGBM splits on "
        "missingness natively, no imputation performed.",
        "",
        "## Monotonic constraints (documented reasoning)",
        "",
        "Applied to the trailing weather window matching each model's own horizon (the 14-day "
        "model constrains `w14_*` features, the 28-day model constrains `w28_*`), plus two "
        "universal constraints on every model: `ar_last_incidencia_pct` and `incidencia_pct` "
        "(recent/current incidence should not lower the forecast), and the ordinally-encoded "
        "`tier` (a currently-higher tier should not lower the forecast).",
        "",
        "| pest_group | biology | constrained drivers (this horizon's window) | direction |",
        "|---|---|---|---|",
        "| acaros | hot/dry flare (mite) | hot_dry_days, hot_dry_max_run, gdd_sum | + (risk rises with heat/dryness) |",
        "| acaros | ″ | humedad_pct_avg_mean, rain_sum | - (risk falls with rain/humidity) |",
        "| fungoso | warm-wet infection | warm_wet_days, warm_wet_max_run, rain_sum, humedad_pct_avg_mean | + |",
        "| fungoso | ″ | hot_dry_days | - (dries out canopy, suppresses infection) |",
        "| monalonion | humid highland pest | humedad_pct_avg_mean, rain_sum | + |",
        "| monalonion | ″ | temp_c_avg_mean | - (cooler favors this pest) |",
        "| thrips | warm/dry + floración | hot_dry_days, temp_c_max_mean, floracion_flor_madura | + |",
        "| thrips | ″ | rain_sum | - |",
        "| cucarron_marceno | rain-onset emergence | rain_days, rain_sum | + |",
        "| mosca_ovario | floración-phenology only | floracion_flor_madura | + (no weather constraint asserted — insufficient confident prior) |",
        "",
        "## Results — primary split (train=[2023,2024])",
        "",
    ]

    for split_label, split_name in [("primary_validate", "validate_year=2025 (used for early stopping)"),
                                     ("primary_test", "test_year=2026 (held out, never touched fitting)")]:
        sub = results_df[results_df["split"] == split_label].sort_values(["pest_group", "horizon"])
        lines.append(f"### {split_name}")
        lines.append("")
        lines.append("| pest_group | horizon | macro_f1 | balanced_acc | roc_auc | pr_auc | n |")
        lines.append("|---|---|---|---|---|---|---|")
        for _, r in sub.iterrows():
            lines.append(
                f"| {r['pest_group']} | {r['horizon']} | {fmt(r['macro_f1'])} | {fmt(r['balanced_accuracy'])} | "
                f"{fmt(r['roc_auc'])} | {fmt(r['pr_auc'])} | {int(r['n_eval_rows'])} |"
            )
        lines.append("")

    lines.append("## Results — leave-one-year-out")
    lines.append("")
    lines.append("| pest_group | horizon | loyo_test_year | macro_f1 | balanced_acc | roc_auc | pr_auc | n |")
    lines.append("|---|---|---|---|---|---|---|---|")
    loyo_rows = results_df[results_df["split"].str.startswith("loyo_")].copy()
    loyo_rows["test_year"] = loyo_rows["split"].str.replace("loyo_", "").astype(int)
    loyo_rows = loyo_rows.sort_values(["pest_group", "horizon", "test_year"])
    for _, r in loyo_rows.iterrows():
        lines.append(
            f"| {r['pest_group']} | {r['horizon']} | {r['test_year']} | {fmt(r['macro_f1'])} | "
            f"{fmt(r['balanced_accuracy'])} | {fmt(r['roc_auc'])} | {fmt(r['pr_auc'])} | {int(r['n_eval_rows'])} |"
        )
    lines.append("")

    lines.append("## Feature importances (gain, primary-split tier model)")
    lines.append("")
    lines.append("Top 10 features by gain, for two representative pest_groups at horizon 14d "
                 "(the strongest and a weaker performer — see results tables above):")
    lines.append("")
    for pg in sorted({k[0] for k in feature_importance}):
        key = (pg, 14)
        if key not in feature_importance:
            continue
        top10 = feature_importance[key].head(10)
        lines.append(f"### {pg} (h14)")
        lines.append("")
        lines.append("| feature | gain |")
        lines.append("|---|---|")
        for feat, gain in top10.items():
            lines.append(f"| {feat} | {gain:.1f} |")
        lines.append("")

    lines.append("## Notes / anomalies flagged during fitting")
    lines.append("")
    if notes:
        for n in notes:
            lines.append(f"- {n}")
    else:
        lines.append("- None — every (pest_group, horizon) combination had sufficient data to fit both targets "
                      "on every split.")
    lines.append("")

    lines.append("## Caveats")
    lines.append("")
    lines.append("- Per-pest_group/year sample sizes are small (primary test_year=2026 ranges from "
                 "~28 rows for fungoso/mosca_ovario to ~58 for acaros); point metrics on these splits "
                 "carry wide uncertainty (no bootstrap CIs computed here — that is the S6 harness's job, "
                 "this script reports point estimates per the S5 contract).")
    lines.append("- LOYO folds reuse the primary split's early-stopping round count rather than "
                 "re-tuning per fold (see Setup) — a conservative simplification appropriate for a POC, "
                 "but it means LOYO results are not independently hyperparameter-tuned.")
    lines.append("")

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "s5_lightgbm.md").write_text("\n".join(lines) + "\n")


def fmt(x) -> str:
    return "nan" if pd.isna(x) else f"{x:.3f}"


if __name__ == "__main__":
    sys.exit(main())
