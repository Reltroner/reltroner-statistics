"""Supervised decision trees (scikit-learn) behind a sufficiency gate.

A model is fitted on canonical observations only when every gate condition holds:
  - the target is an observed value, not a cluster assignment, a cohort or any other derived label;
  - the target is not among the features and no feature is arithmetically derived from it;
  - complete labeled rows >= MIN_LABELED_SAMPLES and >= MIN_SAMPLES_PER_FEATURE per feature;
  - the target is not constant; for classification every class has >= MIN_CLASS_SAMPLES rows;
  - every feature is numeric, finite and recorded in a single unit.
Rows with a missing feature or target are excluded. Canonical values are never imputed.

Evaluation is always out of sample: a stratified (classification) or shuffled (regression)
hold-out with a fixed seed, or a temporal hold-out in which every training row is older than
every test row. When the gate fails the result is INSUFFICIENT_LABELED_DATA and no model exists.

`method_check` fits the same code on generated numbers so the implementation is exercised and
its output can be inspected. Those numbers describe nothing in Asthortera.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, mean_absolute_error, r2_score
from sklearn.model_selection import ShuffleSplit, StratifiedShuffleSplit
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from . import __version__
from .util import canonical_json, r, sha256_text

MIN_LABELED_SAMPLES = 30
MIN_SAMPLES_PER_FEATURE = 10
MIN_SAMPLES_LEAF = 5
MIN_CLASS_SAMPLES = 2 * MIN_SAMPLES_LEAF
MAX_DEPTH = 3
TEST_FRACTION = 0.25
RANDOM_STATE = 42
MIN_SERIES_LENGTH = 30
METHOD_CHECK_SEED = 20261113
METHOD_CHECK_ROWS = 240

REJECTED_LABEL_SOURCES = ("kmeans cluster", "dbscan cluster", "cohort")
# target -> features that are computed from it, or from which it is computed, inside the dataset.
DERIVATIONS = {
    "gdp_per_capita": {"gdp_usd", "population"},
    "gdp_usd": {"gdp_share", "gdp_per_capita"},
    "gdp_share": {"gdp_usd"},
    "population": {"gdp_per_capita"},
    "sdi": {"sdi_individual", "sdi_institution"},
    "sdi_individual": {"sdi"},
    "sdi_institution": {"sdi"},
}
IMPORTANCE_CAVEAT = (
    "Feature importance is the share of impurity reduction attributed to a feature inside this fitted tree. "
    "It depends on the sample and on correlated features, and it is not evidence of causation."
)
POLICY = {
    "min_labeled_samples": MIN_LABELED_SAMPLES,
    "min_samples_per_feature": MIN_SAMPLES_PER_FEATURE,
    "min_class_samples": MIN_CLASS_SAMPLES,
    "max_depth": MAX_DEPTH,
    "min_samples_leaf": MIN_SAMPLES_LEAF,
    "test_fraction": TEST_FRACTION,
    "random_state": RANDOM_STATE,
    "missing_values": "Rows with a missing feature or target are excluded. Canonical values are never imputed.",
    "rejected_label_sources": list(REJECTED_LABEL_SOURCES),
    "rule": (
        f"A model is fitted only with an observed target, at least {MIN_LABELED_SAMPLES} complete labeled rows, at least "
        f"{MIN_SAMPLES_PER_FEATURE} rows per feature, a non-constant target and, for classification, at least {MIN_CLASS_SAMPLES} rows in every class."
    ),
}


def assess(frame: pd.DataFrame, target: str, features: list[str], kind: str, *, label_source: str = "observed",
           units: dict[str, set[str]] | None = None) -> dict:
    """Decide whether a supervised task may be fitted. Returns the gate verdict with every reason."""
    if kind not in ("classification", "regression"):
        raise ValueError(f"Unsupported task kind: {kind}")
    reasons: list[str] = []
    rejected = False
    if label_source in REJECTED_LABEL_SOURCES:
        rejected = True
        reasons.append(
            f"The label comes from '{label_source}'. Cluster assignments are unsupervised estimates and cohorts describe modeling coverage; "
            "neither is an observed class, so neither is accepted as a training label."
        )
    if target in features:
        rejected = True
        reasons.append(f"The target '{target}' is listed among the features (target leakage).")
    derived = sorted(f for f in features if f in DERIVATIONS.get(target, set()))
    usable = [f for f in features if f != target and f not in derived]
    if target not in frame.columns:
        rejected = True
        reasons.append(f"The dataset has no column '{target}'.")
    missing_cols = [f for f in usable if f not in frame.columns]
    if missing_cols:
        reasons.append(f"Features not present in the dataset: {', '.join(missing_cols)}.")
    usable = [f for f in usable if f in frame.columns]
    if not usable:
        reasons.append("No usable feature remains.")
    n_rows = int(len(frame))
    complete = frame.dropna(subset=[*usable, target]) if (not rejected and usable) else frame.iloc[0:0]
    n_complete = int(len(complete))
    if not rejected and usable:
        for f in usable:
            col = pd.to_numeric(complete[f], errors="coerce")
            if col.isna().any() or not np.isfinite(col.to_numpy(dtype="float64")).all():
                reasons.append(f"Feature '{f}' holds non-numeric or non-finite values.")
            if units is not None and len(units.get(f, set())) > 1:
                reasons.append(f"Feature '{f}' is recorded in more than one unit: {', '.join(sorted(units[f]))}.")
        if n_complete < MIN_LABELED_SAMPLES:
            reasons.append(f"{n_complete} complete labeled rows; at least {MIN_LABELED_SAMPLES} are required for a held-out evaluation.")
        if n_complete < MIN_SAMPLES_PER_FEATURE * len(usable):
            reasons.append(f"{n_complete} complete rows for {len(usable)} features; at least {MIN_SAMPLES_PER_FEATURE} rows per feature are required.")
        if n_complete:
            y = complete[target]
            if y.nunique(dropna=True) < 2:
                reasons.append("The target is constant, so there is nothing to learn.")
            elif kind == "classification":
                counts = y.astype(str).value_counts()
                small = counts[counts < MIN_CLASS_SAMPLES]
                if len(small):
                    reasons.append("Classes with fewer than " + f"{MIN_CLASS_SAMPLES} rows: " + ", ".join(f"{c} ({int(n)})" for c, n in sorted(small.items())) + ".")
            else:
                yv = pd.to_numeric(y, errors="coerce")
                if yv.isna().any() or not np.isfinite(yv.to_numpy(dtype="float64")).all():
                    reasons.append("The regression target holds non-numeric or non-finite values.")
    return {
        "passed": not reasons, "rejected_target": rejected, "reasons": reasons, "features": usable, "derived_features_removed": derived,
        "n_rows": n_rows, "n_complete": n_complete,
    }


def _split(n: int, y: np.ndarray, kind: str, order: np.ndarray | None) -> tuple[np.ndarray, np.ndarray, str, bool | None]:
    n_test = max(1, int(round(n * TEST_FRACTION)))
    if order is not None:
        # BAC years count down: a higher value is older. Train on the older rows, test on the newer ones.
        idx = np.argsort(-order, kind="stable")
        train, test = idx[: n - n_test], idx[n - n_test:]
        respected = bool(order[train].min() > order[test].max())
        if not respected:
            raise ValueError("Temporal split is ambiguous: a training row is not strictly older than every test row.")
        return np.sort(train), np.sort(test), f"temporal hold-out: oldest {n - n_test} rows train, newest {n_test} rows test", respected
    if kind == "classification":
        splitter = StratifiedShuffleSplit(n_splits=1, test_size=n_test, random_state=RANDOM_STATE)
        train, test = next(splitter.split(np.zeros(n), y))
        return np.sort(train), np.sort(test), f"stratified hold-out {n - n_test}/{n_test}, seed {RANDOM_STATE}", None
    splitter = ShuffleSplit(n_splits=1, test_size=n_test, random_state=RANDOM_STATE)
    train, test = next(splitter.split(np.zeros(n)))
    return np.sort(train), np.sort(test), f"shuffled hold-out {n - n_test}/{n_test}, seed {RANDOM_STATE}", None


def fit(frame: pd.DataFrame, target: str, features: list[str], kind: str, *, data_origin: str, order_column: str | None = None,
        label_source: str = "observed") -> dict:
    """Fit a bounded tree after the gate has passed. Raises when the gate does not pass."""
    gate = assess(frame, target, features, kind, label_source=label_source)
    if not gate["passed"]:
        raise ValueError("Sufficiency gate failed: " + " ".join(gate["reasons"]))
    feats = gate["features"]
    cols = [*feats, target] + ([order_column] if order_column else [])
    data = frame.dropna(subset=cols).sort_index(kind="stable")
    ids = [str(i) for i in data.index]
    # Features are stored at float32 precision, the precision scikit-learn splits on, so a threshold
    # comparison gives the same answer in every runtime that evaluates the exported tree.
    x = data[feats].to_numpy(dtype="float64").astype(np.float32).astype(np.float64)
    y = data[target].astype(str).to_numpy() if kind == "classification" else data[target].to_numpy(dtype="float64")
    order = data[order_column].to_numpy(dtype="float64") if order_column else None
    train, test, method, respected = _split(len(data), y, kind, order)
    overlap = len({ids[i] for i in train} & {ids[i] for i in test})
    if overlap:
        raise ValueError("Train and test rows overlap.")
    params = {"max_depth": MAX_DEPTH, "min_samples_leaf": MIN_SAMPLES_LEAF, "random_state": RANDOM_STATE}
    est = DecisionTreeClassifier(criterion="gini", **params) if kind == "classification" else DecisionTreeRegressor(criterion="squared_error", **params)
    est.fit(x[train], y[train])
    pred = est.predict(x[test])
    if kind == "classification":
        majority = pd.Series(y[train]).value_counts().sort_index().idxmax()
        metrics = {
            "accuracy": r(accuracy_score(y[test], pred)), "balanced_accuracy": r(balanced_accuracy_score(y[test], pred)),
            "macro_f1": r(f1_score(y[test], pred, average="macro", zero_division=0)), "baseline_accuracy": r(float(np.mean(y[test] == majority))),
        }
    else:
        mean = float(np.mean(y[train]))
        metrics = {
            "r2": r(r2_score(y[test], pred)), "mae": r(mean_absolute_error(y[test], pred)),
            "rmse": r(float(np.sqrt(np.mean((y[test] - pred) ** 2)))), "baseline_mae": r(float(np.mean(np.abs(y[test] - mean)))),
        }
    tree = est.tree_
    path = est.decision_path(x[train]).toarray().astype(bool)
    classes = [str(c) for c in est.classes_] if kind == "classification" else None
    nodes = []
    for i in range(tree.node_count):
        leaf = tree.children_left[i] == tree.children_right[i]
        members = y[train][path[:, i]]
        if kind == "classification":
            counts = {c: int(np.sum(members == c)) for c in classes}
            value = max(sorted(counts), key=lambda c: counts[c])
        else:
            counts, value = None, r(float(np.mean(members)))
        nodes.append({
            "id": int(i), "feature": None if leaf else feats[int(tree.feature[i])], "threshold": None if leaf else r(float(tree.threshold[i])),
            "left": None if leaf else int(tree.children_left[i]), "right": None if leaf else int(tree.children_right[i]),
            "n_samples": int(members.shape[0]), "impurity": r(float(tree.impurity[i])), "value": value, "class_counts": counts,
        })
    model = {
        "estimator": type(est).__name__, "task": kind, "target": target, "features": feats, "classes": classes, "data_origin": data_origin,
        "model_version": f"reltroner_analytics {__version__} decision_tree", "n_samples": int(len(data)), "n_train": int(len(train)), "n_test": int(len(test)),
        "random_state": RANDOM_STATE, "max_depth": MAX_DEPTH, "min_samples_leaf": MIN_SAMPLES_LEAF, "depth": int(est.get_depth()), "n_leaves": int(est.get_n_leaves()),
        "evaluation": {"method": method, "metrics": metrics},
        "feature_importance": [{"feature": f, "importance": r(float(v))} for f, v in zip(feats, est.feature_importances_)],
        "importance_caveat": IMPORTANCE_CAVEAT,
        "nodes": nodes, "rules": rules(nodes, target),
        "verification_rows": [{"features": {f: float(x[i, j]) for j, f in enumerate(feats)}, "prediction": (str(p) if kind == "classification" else r(float(p)))}
                              for i, p in list(zip(test, pred))[:12]],
        "leakage_checks": {"target_in_features": False, "derived_features_removed": gate["derived_features_removed"], "train_test_overlap": 0, "temporal_order_respected": respected},
        "limitations": [
            f"Fitted on {len(train)} rows and evaluated on {len(test)} held-out rows; metrics from a sample of this size are uncertain.",
            "A tree states thresholds that separate the training rows. It does not state why they differ.",
            "The model is exploratory (MODEL_ESTIMATE) and never changes canon.",
        ],
    }
    model["digest"] = sha256_text(canonical_json(model))
    return model


def rules(nodes: list[dict], target: str) -> list[str]:
    """One readable rule per leaf, in node order. Iterative, so depth is not a recursion concern."""
    by_id = {n["id"]: n for n in nodes}
    out: list[str] = []
    stack: list[tuple[int, list[str]]] = [(0, [])]
    while stack:
        node_id, conds = stack.pop()
        n = by_id[node_id]
        if n["feature"] is None:
            out.append(f"if {' and '.join(conds) if conds else 'always'} then {target} = {n['value']} (n={n['n_samples']})")
            continue
        stack.append((n["right"], [*conds, f"{n['feature']} > {n['threshold']}"]))
        stack.append((n["left"], [*conds, f"{n['feature']} <= {n['threshold']}"]))
    return out


def predict(nodes: list[dict], row: dict[str, float]):
    """Evaluate an exported tree. A missing feature value yields None (never a default branch)."""
    by_id = {n["id"]: n for n in nodes}
    n = by_id[0]
    for _ in range(len(nodes) + 1):
        if n["feature"] is None:
            return n["value"]
        v = row.get(n["feature"])
        if v is None or not np.isfinite(v):
            return None
        n = by_id[n["right"] if v > n["threshold"] else n["left"]]
    raise ValueError("Exported tree is not a tree")


def _task(task_id: str, kind: str, target: str, target_label: str, features: list[str], cohort: str, frame: pd.DataFrame, *, label_source: str = "observed",
          units: dict[str, set[str]] | None = None) -> dict:
    gate = assess(frame, target, features, kind, label_source=label_source, units=units)
    status = "REJECTED_TARGET" if gate["rejected_target"] else "INSUFFICIENT_LABELED_DATA"
    model = None
    if gate["passed"]:
        model = fit(frame, target, features, kind, data_origin="CANONICAL_OBSERVATIONS")
        status = "COMPUTED"
    return {"task_id": task_id, "kind": kind, "target": target, "target_label": target_label, "features": gate["features"] or features, "cohort": cohort,
            "n_rows": gate["n_rows"], "n_complete": gate["n_complete"], "status": status, "reasons": gate["reasons"], "model": model}


def synthetic_frame(n: int = METHOD_CHECK_ROWS, seed: int = METHOD_CHECK_SEED) -> pd.DataFrame:
    """Generated numbers for testing the method. Uniform draws only, rounded, so every platform produces the same table."""
    rng = np.random.default_rng(seed)
    u = np.round(rng.random((n, 5)), 3)
    x1, x2, x3 = u[:, 0], u[:, 1], u[:, 2]
    clean = (x1 > 0.55) & (x2 > 0.4)
    flipped = u[:, 3] < 0.05
    label = np.where(clean ^ flipped, "S1", "S0")
    y = np.round(np.where(x1 > 0.5, 3.0, 1.0) + np.where(x2 > 0.6, 1.5, 0.0) + (u[:, 4] - 0.5) * 0.4, 3)
    return pd.DataFrame({"synthetic_x1": x1, "synthetic_x2": x2, "synthetic_x3": x3, "synthetic_class": label, "synthetic_y": y},
                        index=[f"synthetic-{i:04d}" for i in range(n)])


def method_check() -> dict:
    frame = synthetic_frame()
    feats = ["synthetic_x1", "synthetic_x2", "synthetic_x3"]
    return {
        "data_origin": "SYNTHETIC_FIXTURE",
        "notice": "Fitted on generated numbers to verify the implementation. These rows describe no nation, indicator or event of Asthortera.",
        "models": [
            fit(frame, "synthetic_class", feats, "classification", data_origin="SYNTHETIC_FIXTURE"),
            fit(frame, "synthetic_y", feats, "regression", data_origin="SYNTHETIC_FIXTURE"),
        ],
    }


def run(matrix14: pd.DataFrame, matrix19: pd.DataFrame, history: dict, units: dict[str, set[str]] | None = None) -> dict:
    development = ["gdp_per_capita", "life_expectancy", "median_age", "tfr", "gini", "urbanization", "education_access"]
    tasks = [
        _task("regression-sdi-profiled-14", "regression", "sdi", "Sentient Development Index", development, "PROFILED_14", matrix14, units=units),
        _task("regression-sdi-all-19", "regression", "sdi", "Sentient Development Index", development, "ALL_19", matrix19, units=units),
        _task("regression-life-expectancy-profiled-14", "regression", "life_expectancy", "Life expectancy", ["sdi", "gdp_per_capita", "median_age", "urbanization"], "PROFILED_14", matrix14, units=units),
        _task("classification-kmeans-cluster", "classification", "kmeans_cluster", "K-Means cluster assignment", development, "PROFILED_14", matrix14, label_source="kmeans cluster"),
        _task("classification-cohort", "classification", "cohort", "Modeling cohort", development, "ALL_19", matrix19, label_source="cohort"),
    ]
    longest = max((s["n"] for s in history.get("series", [])), default=0)
    historical_reasons = []
    if longest < MIN_SERIES_LENGTH:
        historical_reasons.append(f"The longest canonical series has {longest} dated observations; at least {MIN_SERIES_LENGTH} are required for a temporal hold-out.")
    historical_reasons.append("Interpolated, reconstructed or scenario values are never used as training labels.")
    return {
        "status": "COMPUTED" if any(t["status"] == "COMPUTED" for t in tasks) else "INSUFFICIENT_LABELED_DATA",
        "policy": POLICY,
        "tasks": tasks,
        "historical": {"status": "INSUFFICIENT_LABELED_DATA", "max_series_length": int(longest), "min_series_length": MIN_SERIES_LENGTH, "reasons": historical_reasons},
        "method_check": method_check(),
    }
