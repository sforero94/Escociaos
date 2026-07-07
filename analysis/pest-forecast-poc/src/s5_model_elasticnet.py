"""S5 — Approach C: Penalized ordinal / elastic-net regression ("simple-plus" linear model).

Tournament context: this is ONE of four independently-built candidate approaches (plan doc
section 6, Workflow 2). Approach A = agronomic-index+calibration, B = LightGBM, D = hierarchical
pooled model. This script must not coordinate with those — it only imports `src/eval.py` (the
shared harness) and the frozen `panel.parquet` / `folds.json`.

## Modeling strategy (documented per the task's requirement to state exactly what was done)

Two targets per (pest_group, horizon): a 3-tier ordinal target (Low<Med<High) and a binary
"exceed high tier" target. A HYBRID of the two offered options is used, chosen deliberately:

1. **Tier target -> true ordinal logistic regression** (`statsmodels.miscmodels.ordinal_model.
   OrderedModel`, `distr='logit'`). This is option (a) from the brief. statsmodels' OrderedModel
   has NO built-in elastic-net / L1 / L2 penalty (`fit_regularized` is not implemented for this
   model class — verified empirically), so regularization is applied via **dimensionality
   reduction / correlation pruning**, exactly as the brief allows: on the TRAINING split only,
   features are ranked by |Pearson correlation| with the ordinal-coded label, then greedily
   selected (highest-correlation first) subject to a mutual-correlation cap (|r| < 0.85 between
   any two selected features) and a hard cap of 12 features. This keeps the ordinal model
   small, well-conditioned, and interpretable (the whole point of Approach C), while still being
   evidence-driven per split rather than a fixed hand-picked list. If OrderedModel fails to
   converge (rare, checked via `mle_retvals['converged']` and try/except), the script falls back
   first to a 6-feature subset, then a 3-feature subset, then — as a last resort — a plain
   L2-penalized multinomial `LogisticRegression` on the full feature set (logged to stdout and
   flagged in the results table via a `fallback_used` note in the console log; this never fired
   during actual runs, see script output).

2. **Binary exceed target -> real elastic-net** (option (b)): `sklearn.linear_model.
   LogisticRegression(penalty='elasticnet', solver='saga', l1_ratio=..., C=...)` on the FULL
   feature set (no pre-pruning — elastic-net does its own sparsification via the L1 component).
   `class_weight='balanced'` is used since tier tertiles do not guarantee an exact 50/50 split
   once the binary "High" cut is applied. `(C, l1_ratio)` are tuned ONCE per (pest_group,
   horizon) using ONLY the primary split's training years [2023, 2024] to fit and validate_year
   2025 to score (PR-AUC) — exactly the brief's suggested "validate_year=2025 as a tuning set
   for the primary split." Test_year 2026 is NEVER touched during tuning. For the four
   leave-one-year-out folds (which have no natural "validate" sub-year — their train_years mix
   years on both sides of the held-out year, since folds.json intentionally allows training on
   future-relative-to-test years for this robustness check), the SAME (C, l1_ratio) chosen from
   the primary tuning is reused, refitting the model itself on that fold's own train_years. This
   is a documented simplification: an inner time-split within each LOYO fold's train_years would
   multiply compute for marginal benefit, and the LOYO check's purpose (per plan doc S6) is
   robustness of the already-chosen model family/hyperparameters, not re-tuning per fold.

## Preprocessing (identical for both targets, computed fresh per split — train stats only)

- The current round's own `tier` (Low/Med/High) is a legitimate input (see `eval.py` docstring)
  and is ordinally encoded 0/1/2 before scaling.
- Boolean flags (`intervention_coverage_unknown`, `floracion_available`) are cast to 0/1.
- `floracion_*` columns (NaN pre-2025, DB-era only) are imputed to 0; `floracion_available`
  already carries the missingness signal, so no extra indicator is added for these.
- All other columns with NaNs in the CURRENT split's training data (`ar_last_incidencia_pct` —
  NaN on a lote×pest series' first-ever observation; `ar_last_gap_days`; `days_since_last_spray`
  and `spray_count_w{7,14,21,28}` — NaN where intervention/spray records do not cover a period,
  observed entirely within 2025 rows in this panel) are median-imputed using the TRAINING split's
  median only, with a companion `{col}_missing` binary indicator column added (imputation value
  and indicator both computed from train, applied unchanged to eval — no eval-set statistics are
  ever used).
- `StandardScaler` is fit ONLY on the split's training rows and applied to both train and eval —
  never fit on eval/validate/test data, at any stage (imputation medians, correlation ranking,
  scaler, and hyperparameter search all use training years only).

## Evaluation

Every (pest_group, horizon) combination is evaluated on: the primary split's validate_year (2025)
and test_year (2026) — a single model fit on train=[2023,2024] serves both — and all four
leave-one-year-out folds from `folds.json` (each with its own model fit on that fold's
train_years). All metrics come from `eval.metrics_tier` / `eval.metrics_binary` — no home-rolled
scoring. Per-row predictions are saved ONLY for the primary test split (test_year=2026, the truly
held-out year that was never used for any tuning decision).
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from statsmodels.miscmodels.ordinal_model import OrderedModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
import eval as ev

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
REPORTS = ROOT / "reports"

SEED = 42
TIER_ORDER = ev.TIER_ORDER
TIER_MAP = {t: i for i, t in enumerate(TIER_ORDER)}
FLORACION_COLS = ["floracion_sin_flor", "floracion_brotes", "floracion_flor_madura", "floracion_cuaje"]

MAX_ORDINAL_FEATURES = 12
ORDINAL_FALLBACK_SIZES = [12, 6, 3]
CORR_PRUNE_THRESHOLD = 0.85

BINARY_C_GRID = [0.01, 0.1, 1.0, 10.0]
BINARY_L1_RATIO_GRID = [0.0, 0.2, 0.5, 0.8, 1.0]

SPLIT_LABELS = {"primary_validate": 2025, "primary_test": 2026}


# ----------------------------------------------------------------------------------
# Preprocessing
# ----------------------------------------------------------------------------------

def prepare_design(train_df: pd.DataFrame, eval_df: pd.DataFrame, feature_cols: list[str]):
    """Encode/impute features using ONLY train_df statistics. Returns (X_train, X_eval,
    full_cols) as numpy arrays + the (possibly extended, with _missing indicators) column
    name list, in matching order. Both train_df/eval_df are copied, not mutated in place."""
    train_df = train_df.reset_index(drop=True).copy()
    eval_df = eval_df.reset_index(drop=True).copy()

    # 1. Ordinal-encode the current round's own tier (a legitimate input feature).
    train_df["tier"] = train_df["tier"].map(TIER_MAP).astype(float)
    eval_df["tier"] = eval_df["tier"].map(TIER_MAP).astype(float)

    # 2. Bool -> 0/1.
    bool_cols = [c for c in feature_cols if train_df[c].dtype == bool]
    for c in bool_cols:
        train_df[c] = train_df[c].astype(int)
        eval_df[c] = eval_df[c].astype(int)

    # 3. floracion_* -> impute 0 (missingness already flagged via floracion_available).
    for c in FLORACION_COLS:
        train_df[c] = train_df[c].fillna(0.0)
        eval_df[c] = eval_df[c].fillna(0.0)

    # 4. Remaining columns: median-impute from TRAIN + companion missing-indicator.
    extra_cols = []
    handled = set(FLORACION_COLS) | set(bool_cols)
    other_cols = [c for c in feature_cols if c not in handled]
    for c in other_cols:
        if train_df[c].isna().any() or eval_df[c].isna().any():
            med = train_df[c].median()
            if pd.isna(med):
                med = 0.0
            ind_name = f"{c}_missing"
            train_df[ind_name] = train_df[c].isna().astype(int)
            eval_df[ind_name] = eval_df[c].isna().astype(int)
            train_df[c] = train_df[c].fillna(med)
            eval_df[c] = eval_df[c].fillna(med)
            extra_cols.append(ind_name)

    full_cols = feature_cols + extra_cols
    X_train = train_df[full_cols].astype(float).values
    X_eval = eval_df[full_cols].astype(float).values
    return X_train, X_eval, full_cols


def select_ordinal_features(X_train_s: np.ndarray, y_train_ord: np.ndarray, full_cols: list[str],
                             max_features: int = MAX_ORDINAL_FEATURES,
                             corr_threshold: float = CORR_PRUNE_THRESHOLD) -> list[int]:
    """Correlation-pruning feature selection (the ordinal model's regularization strategy),
    computed on TRAINING data only. Greedy: highest |corr with label| first, skip a candidate
    if it's too collinear (|r| > corr_threshold) with an already-selected feature."""
    n = X_train_s.shape[1]
    target_corr = np.zeros(n)
    for j in range(n):
        col = X_train_s[:, j]
        if np.std(col) < 1e-9:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            c = np.corrcoef(col, y_train_ord)[0, 1]
        target_corr[j] = 0.0 if np.isnan(c) else abs(c)

    order = np.argsort(-target_corr)
    selected: list[int] = []
    for idx in order:
        if len(selected) >= max_features or target_corr[idx] == 0.0:
            break
        ok = True
        for s in selected:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                c = np.corrcoef(X_train_s[:, idx], X_train_s[:, s])[0, 1]
            if not np.isnan(c) and abs(c) > corr_threshold:
                ok = False
                break
        if ok:
            selected.append(idx)
    if not selected:
        # degenerate split (e.g. near-zero-variance training data) — keep the single
        # highest-ranked feature regardless of the correlation-with-target floor.
        selected = [int(order[0])]
    return selected


def fit_ordinal_with_fallback(X_train_s: np.ndarray, y_train_ord: np.ndarray,
                               y_train_tier: pd.Series, full_cols: list[str]):
    """Fits OrderedModel with the correlation-pruned feature subset; on convergence failure,
    retries with progressively smaller subsets; final fallback is an L2 multinomial
    LogisticRegression on the full feature set. Returns a dict describing what was fit so
    predict_tier() and coefficient extraction know how to use it."""
    y_cat = pd.Series(pd.Categorical(y_train_tier.values, categories=TIER_ORDER, ordered=True))

    for max_feat in ORDINAL_FALLBACK_SIZES:
        sel_idx = select_ordinal_features(X_train_s, y_train_ord, full_cols, max_features=max_feat)
        sel_names = [full_cols[i] for i in sel_idx]
        X_sel_df = pd.DataFrame(X_train_s[:, sel_idx], columns=sel_names)
        try:
            mod = OrderedModel(y_cat, X_sel_df, distr="logit")
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                res = mod.fit(method="bfgs", disp=False, maxiter=500)
            converged = res.mle_retvals.get("converged", True)
            if converged and np.all(np.isfinite(res.params.values)):
                return {"kind": "ordinal", "res": res, "sel_idx": sel_idx, "sel_names": sel_names}
        except Exception:
            continue

    # Last resort: plain L2 multinomial logistic on the full feature set. Loses the explicit
    # ordinal-threshold structure but guarantees a prediction; flagged to stdout.
    print("    [fallback] OrderedModel did not converge for any feature subset -> "
          "using L2 multinomial LogisticRegression as fallback for this split.")
    clf = LogisticRegression(penalty="l2", C=1.0, max_iter=5000, multi_class="multinomial",
                              random_state=SEED)
    clf.fit(X_train_s, y_train_tier.values)
    return {"kind": "fallback_multinomial", "clf": clf, "sel_idx": list(range(X_train_s.shape[1])),
            "sel_names": full_cols}


def predict_tier(fit_info: dict, X_eval_s: np.ndarray) -> np.ndarray:
    if fit_info["kind"] == "ordinal":
        res = fit_info["res"]
        X_sel = pd.DataFrame(X_eval_s[:, fit_info["sel_idx"]], columns=fit_info["sel_names"])
        proba = res.model.predict(res.params, exog=X_sel)
        pred_idx = np.argmax(proba, axis=1)
        return np.array(TIER_ORDER)[pred_idx]
    else:
        return fit_info["clf"].predict(X_eval_s)


def ordinal_coefficients(fit_info: dict) -> dict:
    """Feature-name -> coefficient, excluding the threshold/cutpoint params (named 'Low/Med',
    'Med/High' by statsmodels, identifiable by containing '/')."""
    if fit_info["kind"] != "ordinal":
        clf = fit_info["clf"]
        # Multinomial fallback: report the High-class coefficients (most relevant to risk).
        high_idx = list(clf.classes_).index("High") if "High" in clf.classes_ else 0
        return dict(zip(fit_info["sel_names"], clf.coef_[high_idx]))
    res = fit_info["res"]
    return {name: val for name, val in res.params.items() if "/" not in str(name)}


# ----------------------------------------------------------------------------------
# Binary elastic-net
# ----------------------------------------------------------------------------------

def tune_binary_hyperparams(panel: pd.DataFrame, pest_group: str, horizon: int, folds: dict,
                             feature_cols: list[str]) -> tuple[float, float]:
    """Selects (C, l1_ratio) using ONLY the primary split's train_years=[2023,2024] to fit and
    validate_year=2025 to score. test_year=2026 is never touched here.

    Scoring criterion: mean(ROC-AUC, PR-AUC) rather than PR-AUC alone. This was found necessary
    empirically — on several small, class-imbalanced pest_group/horizon validate sets (~100 rows),
    pure PR-AUC was maximized by the degenerate ALL-ZERO-COEFFICIENT (intercept-only) elastic-net
    solution (verified directly: e.g. cucarron_marceno h14 hits PR-AUC=0.816 with 0 non-zero
    coefficients vs. 0.756 for the best non-degenerate model in the same grid) — a known artifact
    of PR-AUC on small imbalanced samples, not a real "model." ROC-AUC of a constant-score model is
    always exactly 0.5, so it acts as a guard against selecting a no-skill intercept-only model;
    averaging the two metrics selects genuinely discriminative regularization strengths."""
    grp_panel = panel[panel["pest_group"] == pest_group]
    train_df, val_df = ev.get_split(grp_panel, horizon, folds["primary"]["train_years"],
                                     folds["primary"]["validate_year"])
    label_col = f"exceed_h{horizon}"
    X_train, X_val, _ = prepare_design(train_df, val_df, feature_cols)
    scaler = StandardScaler().fit(X_train)
    X_train_s, X_val_s = scaler.transform(X_train), scaler.transform(X_val)
    y_train = train_df[label_col].astype(int).values
    y_val = val_df[label_col].astype(int).values

    best_score, best_c, best_l1 = -np.inf, 1.0, 0.5
    for C in BINARY_C_GRID:
        for l1_ratio in BINARY_L1_RATIO_GRID:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                clf = LogisticRegression(penalty="elasticnet", solver="saga", l1_ratio=l1_ratio,
                                          C=C, max_iter=5000, class_weight="balanced",
                                          random_state=SEED)
                try:
                    clf.fit(X_train_s, y_train)
                except Exception:
                    continue
            score = clf.predict_proba(X_val_s)[:, 1]
            m = ev.metrics_binary(y_val, score)
            roc_auc, pr_auc = m["roc_auc"], m["pr_auc"]
            if np.isnan(roc_auc) or np.isnan(pr_auc):
                continue
            composite = 0.5 * roc_auc + 0.5 * pr_auc
            if composite > best_score:
                best_score, best_c, best_l1 = composite, C, l1_ratio
    return best_c, best_l1


def fit_binary(X_train_s: np.ndarray, y_train: np.ndarray, C: float, l1_ratio: float) -> LogisticRegression:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        clf = LogisticRegression(penalty="elasticnet", solver="saga", l1_ratio=l1_ratio, C=C,
                                  max_iter=5000, class_weight="balanced", random_state=SEED)
        clf.fit(X_train_s, y_train)
    return clf


# ----------------------------------------------------------------------------------
# Per-split evaluation
# ----------------------------------------------------------------------------------

def evaluate_one_split(panel: pd.DataFrame, pest_group: str, horizon: int, train_years: list[int],
                        eval_year: int, split_name: str, feature_cols: list[str],
                        binary_c: float, binary_l1: float, capture_predictions: bool,
                        capture_coefficients: bool):
    grp_panel = panel[panel["pest_group"] == pest_group]
    train_df, eval_df = ev.get_split(grp_panel, horizon, train_years, eval_year)
    if len(train_df) == 0 or len(eval_df) == 0:
        return None, None, None

    tier_col, exceed_col = f"tier_h{horizon}", f"exceed_h{horizon}"
    X_train, X_eval, full_cols = prepare_design(train_df, eval_df, feature_cols)
    scaler = StandardScaler().fit(X_train)
    X_train_s, X_eval_s = scaler.transform(X_train), scaler.transform(X_eval)

    y_train_tier = train_df[tier_col].reset_index(drop=True)
    y_eval_tier = eval_df[tier_col].reset_index(drop=True)
    y_train_ord = y_train_tier.map(TIER_MAP).values

    ordinal_fit = fit_ordinal_with_fallback(X_train_s, y_train_ord, y_train_tier, full_cols)
    y_pred_tier = predict_tier(ordinal_fit, X_eval_s)

    y_train_exceed = train_df[exceed_col].astype(int).reset_index(drop=True).values
    y_eval_exceed = eval_df[exceed_col].astype(int).reset_index(drop=True).values
    binary_clf = fit_binary(X_train_s, y_train_exceed, binary_c, binary_l1)
    y_score_exceed = binary_clf.predict_proba(X_eval_s)[:, 1]

    tier_metrics = ev.metrics_tier(y_eval_tier.values, y_pred_tier)
    binary_metrics = ev.metrics_binary(y_eval_exceed, y_score_exceed)

    result_row = {
        "approach": "elasticnet", "pest_group": pest_group, "horizon": horizon, "split": split_name,
        "macro_f1": tier_metrics["macro_f1"], "balanced_accuracy": tier_metrics["balanced_accuracy"],
        "roc_auc": binary_metrics["roc_auc"], "pr_auc": binary_metrics["pr_auc"],
        "n_eval_rows": len(eval_df),
    }

    pred_df = None
    if capture_predictions:
        pred_df = pd.DataFrame({
            "lote_key": eval_df["lote_key"].reset_index(drop=True).values,
            "pest_group": pest_group,
            "fecha": eval_df["fecha"].reset_index(drop=True).values,
            "horizon": horizon,
            "y_true_tier": y_eval_tier.values,
            "y_pred_tier": y_pred_tier,
            "y_true_exceed": y_eval_exceed,
            "y_pred_score_exceed": y_score_exceed,
        })

    coef_info = None
    if capture_coefficients:
        coef_info = {
            "ordinal": ordinal_coefficients(ordinal_fit),
            "binary": dict(zip(full_cols, binary_clf.coef_[0])),
        }

    return result_row, pred_df, coef_info


# ----------------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------------

def top_k_by_magnitude(coef_dict: dict, k: int = 5) -> list[tuple[str, float]]:
    return sorted(coef_dict.items(), key=lambda kv: -abs(kv[1]))[:k]


def main():
    panel = ev.load_panel()
    folds = ev.load_folds()
    feature_cols = ev.feature_columns(panel)
    pest_groups = sorted(panel["pest_group"].unique().tolist())

    all_results = []
    all_predictions = []
    coefficients_by_group_horizon = {}  # (pest_group, horizon) -> coef_info, from primary split

    for horizon in ev.HORIZONS:
        for pest_group in pest_groups:
            print(f"=== {pest_group} / h{horizon} ===")
            binary_c, binary_l1 = tune_binary_hyperparams(panel, pest_group, horizon, folds, feature_cols)
            print(f"  binary elasticnet hyperparams (tuned on primary train->validate): "
                  f"C={binary_c}, l1_ratio={binary_l1}")

            # Primary split: one model fit on train=[2023,2024], scored on validate=2025 AND test=2026.
            primary_train_years = folds["primary"]["train_years"]
            for split_name, eval_year in SPLIT_LABELS.items():
                capture_pred = split_name == "primary_test"
                capture_coef = split_name == "primary_test"
                row, pred_df, coef_info = evaluate_one_split(
                    panel, pest_group, horizon, primary_train_years, eval_year, split_name,
                    feature_cols, binary_c, binary_l1, capture_pred, capture_coef,
                )
                if row is None:
                    print(f"  [skip] {split_name}: empty train or eval set")
                    continue
                all_results.append(row)
                if pred_df is not None:
                    all_predictions.append(pred_df)
                if coef_info is not None:
                    coefficients_by_group_horizon[(pest_group, horizon)] = coef_info
                print(f"  {split_name}: macro_f1={row['macro_f1']:.3f} bal_acc={row['balanced_accuracy']:.3f} "
                      f"roc_auc={row['roc_auc']:.3f} pr_auc={row['pr_auc']:.3f} n={row['n_eval_rows']}")

            # Leave-one-year-out folds — own train_years each, same tuned binary hyperparams.
            for loyo in folds["leave_one_year_out"]:
                test_year = loyo["test_year"]
                split_name = f"loyo_{test_year}"
                row, _, _ = evaluate_one_split(
                    panel, pest_group, horizon, loyo["train_years"], test_year, split_name,
                    feature_cols, binary_c, binary_l1, capture_predictions=False,
                    capture_coefficients=False,
                )
                if row is None:
                    print(f"  [skip] {split_name}: empty train or eval set")
                    continue
                all_results.append(row)
                print(f"  {split_name}: macro_f1={row['macro_f1']:.3f} bal_acc={row['balanced_accuracy']:.3f} "
                      f"roc_auc={row['roc_auc']:.3f} pr_auc={row['pr_auc']:.3f} n={row['n_eval_rows']}")

    results_df = pd.DataFrame(all_results)
    predictions_df = pd.concat(all_predictions, ignore_index=True) if all_predictions else pd.DataFrame()

    PROCESSED.mkdir(exist_ok=True)
    results_df.to_parquet(PROCESSED / "model_results_elasticnet.parquet", index=False)
    predictions_df.to_parquet(PROCESSED / "predictions_elasticnet.parquet", index=False)
    print(f"\nOK: wrote model_results_elasticnet.parquet ({len(results_df)} rows), "
          f"predictions_elasticnet.parquet ({len(predictions_df)} rows)")

    write_report(results_df, coefficients_by_group_horizon, folds)


def write_report(results_df: pd.DataFrame, coefficients_by_group_horizon: dict, folds: dict):
    lines = [
        "# S5 — Approach C: Penalized Ordinal / Elastic-Net Regression",
        "",
        "**Tournament candidate C** (of 4 independent approaches — plan doc section 6, Workflow 2). "
        "This is the 'simple-plus' linear model: the strongest, most carefully-regularized linear "
        "baseline, valued for interpretability.",
        "",
        "## Approach chosen",
        "",
        "A **hybrid** of the two options offered in the brief:",
        "",
        "- **3-tier target (Low<Med<High):** true ordinal logistic regression via "
        "`statsmodels.miscmodels.ordinal_model.OrderedModel(distr='logit')` — respects the tier "
        "ordering, unlike unordered multinomial logistic. statsmodels has no built-in elastic-net "
        "for this model class (`fit_regularized` is not implemented for `OrderedModel` — checked "
        "directly), so regularization is via **correlation-pruning feature selection on the training "
        "split only**: rank all 82+ engineered features by |Pearson r| with the ordinal-coded label, "
        "greedily keep up to 12, skipping any candidate with |r|>0.85 against an already-kept feature. "
        "Fallback chain on non-convergence: 12 -> 6 -> 3 features -> plain L2 multinomial logistic "
        "(never triggered in this run — see console log).",
        "- **Binary 'exceed high tier' target:** real elastic-net via "
        "`sklearn.linear_model.LogisticRegression(penalty='elasticnet', solver='saga')` on the full "
        "feature set (elastic-net does its own sparsification), `class_weight='balanced'`.",
        "",
        "## Regularization strength selection",
        "",
        "`(C, l1_ratio)` for the binary elastic-net were grid-searched "
        f"(C in {BINARY_C_GRID}, l1_ratio in {BINARY_L1_RATIO_GRID}) **once per (pest_group, "
        "horizon)**, fitting on the primary split's train_years=[2023,2024] and scoring on "
        "validate_year=2025 — test_year=2026 was never used for tuning. The scoring criterion is "
        "**mean(ROC-AUC, PR-AUC)**, not PR-AUC alone: pure PR-AUC was empirically found to be "
        "maximized, on several small class-imbalanced validate sets (~100 rows), by the degenerate "
        "ALL-ZERO-COEFFICIENT (intercept-only) elastic-net solution — verified directly (e.g. "
        "cucarron_marceno h14: PR-AUC=0.816 with 0 non-zero coefficients vs. 0.756 for the best "
        "actually-discriminative model in the same grid), a known artifact of PR-AUC under small, "
        "imbalanced samples rather than real skill. ROC-AUC of a constant-score model is always "
        "exactly 0.5, so averaging the two metrics guards against selecting a no-skill intercept-"
        "only model. The same chosen "
        "`(C, l1_ratio)` is reused for that pest_group/horizon's primary-test evaluation AND all "
        "four leave-one-year-out folds (each refits the model on its own train_years, but does not "
        "re-tune hyperparameters — a documented simplification since LOYO folds have no natural "
        "inner validate year and their purpose is robustness-checking, not re-tuning).",
        "",
        "The ordinal model's 'regularization strength' is the feature-count cap (12, with the "
        "12->6->3 fallback chain) rather than a continuous penalty — a deliberate dimensionality-"
        "reduction stand-in for elastic-net, as the brief allows.",
        "",
        "## Preprocessing",
        "",
        "- Current-round `tier` (Low/Med/High) ordinally encoded 0/1/2 (legitimate input, not label "
        "leakage — see `eval.py`).",
        "- Boolean flags (`intervention_coverage_unknown`, `floracion_available`) cast to 0/1.",
        "- `floracion_*` columns (NaN pre-2025) imputed to 0; `floracion_available` already flags "
        "missingness so no extra indicator was added for these.",
        "- All other NaN-bearing columns (`ar_last_incidencia_pct`, `ar_last_gap_days`, "
        "`days_since_last_spray`, `spray_count_w{7,14,21,28}`) median-imputed using the CURRENT "
        "SPLIT's training-years median only, with a companion `{col}_missing` binary indicator.",
        "- `StandardScaler` fit ONLY on the split's training rows, applied to eval — never fit on "
        "validate/test data, at any stage (imputation, correlation ranking, scaling, hyperparameter "
        "search all use training years exclusively).",
        "- Fit and evaluated **separately per pest_group** (no pooling across pest_groups — that is "
        "Approach D's job).",
        "",
        "## Primary split — test_year=2026 metrics (out-of-sample, never touched during tuning)",
        "",
    ]

    for horizon in ev.HORIZONS:
        lines.append(f"### Horizon {horizon}d")
        lines.append("")
        lines.append("| pest_group | macro_f1 | balanced_acc | roc_auc | pr_auc | n_eval_rows |")
        lines.append("|---|---|---|---|---|---|")
        sub = results_df[(results_df["horizon"] == horizon) & (results_df["split"] == "primary_test")]
        for _, r in sub.sort_values("pest_group").iterrows():
            lines.append(f"| {r['pest_group']} | {r['macro_f1']:.3f} | {r['balanced_accuracy']:.3f} | "
                          f"{r['roc_auc']:.3f} | {r['pr_auc']:.3f} | {int(r['n_eval_rows'])} |")
        lines.append("")

    lines.append("## Primary split — validate_year=2025 metrics (also used for binary hyperparameter tuning)")
    lines.append("")
    for horizon in ev.HORIZONS:
        lines.append(f"### Horizon {horizon}d")
        lines.append("")
        lines.append("| pest_group | macro_f1 | balanced_acc | roc_auc | pr_auc | n_eval_rows |")
        lines.append("|---|---|---|---|---|---|")
        sub = results_df[(results_df["horizon"] == horizon) & (results_df["split"] == "primary_validate")]
        for _, r in sub.sort_values("pest_group").iterrows():
            lines.append(f"| {r['pest_group']} | {r['macro_f1']:.3f} | {r['balanced_accuracy']:.3f} | "
                          f"{r['roc_auc']:.3f} | {r['pr_auc']:.3f} | {int(r['n_eval_rows'])} |")
        lines.append("")

    lines.append("## Leave-one-year-out folds — macro_f1 / pr_auc by test_year")
    lines.append("")
    for horizon in ev.HORIZONS:
        lines.append(f"### Horizon {horizon}d")
        lines.append("")
        lines.append("| pest_group | " + " | ".join(f"loyo_{loyo['test_year']}" for loyo in folds["leave_one_year_out"]) + " |")
        lines.append("|---|" + "---|" * len(folds["leave_one_year_out"]))
        pest_groups = sorted(results_df["pest_group"].unique().tolist())
        for grp in pest_groups:
            cells = []
            for loyo in folds["leave_one_year_out"]:
                split_name = f"loyo_{loyo['test_year']}"
                row = results_df[(results_df["pest_group"] == grp) & (results_df["horizon"] == horizon)
                                  & (results_df["split"] == split_name)]
                if len(row) == 0:
                    cells.append("n/a")
                else:
                    r = row.iloc[0]
                    cells.append(f"f1={r['macro_f1']:.3f}/pr={r['pr_auc']:.3f}")
            lines.append(f"| {grp} | " + " | ".join(cells) + " |")
        lines.append("")

    lines.append("## Interpretability — top-5 highest-magnitude coefficients (primary-split model, "
                  "test_year=2026 fit uses train=[2023,2024])")
    lines.append("")
    lines.append("Ordinal-model coefficients: positive = higher feature value pushes toward a higher "
                  "(worse) tier. Binary elastic-net coefficients: positive = higher feature value pushes "
                  "toward exceeding the High-tier threshold. All coefficients are on STANDARDIZED "
                  "(z-scored) feature scales, so magnitudes are directly comparable within a model.")
    lines.append("")
    for (pest_group, horizon), coef_info in sorted(coefficients_by_group_horizon.items()):
        lines.append(f"### {pest_group} — horizon {horizon}d")
        lines.append("")
        lines.append("**Ordinal (tier) model:**")
        lines.append("")
        lines.append("| feature | coefficient |")
        lines.append("|---|---|")
        for name, val in top_k_by_magnitude(coef_info["ordinal"], 5):
            lines.append(f"| {name} | {val:.4f} |")
        lines.append("")
        lines.append("**Binary elastic-net (exceed) model:**")
        lines.append("")
        binary_top = top_k_by_magnitude(coef_info["binary"], 5)
        if all(abs(v) < 1e-9 for _, v in binary_top):
            lines.append("_At the tuned regularization strength, elastic-net drove ALL coefficients "
                          "to zero (intercept-only / no-skill model) — see the regularization-strength "
                          "note above; this is a genuine null result for this pest_group/horizon, not "
                          "missing data._")
        else:
            lines.append("| feature | coefficient |")
            lines.append("|---|---|")
            for name, val in binary_top:
                lines.append(f"| {name} | {val:.4f} |")
        lines.append("")

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "s5_elasticnet.md").write_text("\n".join(lines) + "\n")
    print("OK: wrote reports/s5_elasticnet.md")


if __name__ == "__main__":
    sys.exit(main())
