"""Deterministic K-Means and DBSCAN over standardized development and demography features.

Sufficiency gate: complete cases only, n >= 10 and n >= 3k. Features are z-scored with the
population standard deviation. Random seeds, n_init, eps rules and k-selection are recorded.
Cluster labels are canonicalized so the same partition always carries the same numbers.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors

from .util import r

FEATURES = [
    ("sdi", "none"), ("gdp_per_capita", "log10"), ("life_expectancy", "none"), ("median_age", "none"),
    ("tfr", "none"), ("gini", "none"), ("urbanization", "none"),
]
MIN_N = 10
K_RANGE = (2, 3, 4)
RANDOM_STATE = 42
N_INIT = 50
DBSCAN_MIN_SAMPLES = 3
DBSCAN_EPS_PERCENTILE = 75


def _canonical_labels(labels: np.ndarray, ids: list[str], z: np.ndarray, noise: bool = False) -> np.ndarray:
    """Renumber clusters by descending mean of the first feature (SDI), ties by first member id."""
    uniq = [c for c in sorted(set(labels.tolist())) if not (noise and c == -1)]
    order = sorted(uniq, key=lambda c: (-float(z[labels == c, 0].mean()), min(i for i, l in zip(ids, labels) if l == c)))
    mapping = {old: new for new, old in enumerate(order)}
    return np.array([mapping.get(l, -1) for l in labels])


def run(matrix: pd.DataFrame, cohort: str) -> dict:
    feats = [f for f, _ in FEATURES]
    available = [f for f in feats if f in matrix.columns]
    excluded = []
    base = {
        "cohort": cohort,
        "features": [{"indicator_id": f, "transform": t} for f, t in FEATURES],
        "scaling": "z-score with population standard deviation (ddof=0)",
        "sufficiency": {"min_n": MIN_N, "rule": f"complete cases on all features; n >= {MIN_N} and n >= 3k for each k"},
    }
    if len(available) < len(feats):
        missing = sorted(set(feats) - set(available))
        return {**base, "status": "INSUFFICIENT_DATA", "n": 0, "reason": f"Features unavailable: {', '.join(missing)}.",
                "excluded_entities": [], "pca": None, "kmeans": None, "dbscan": None}
    data = matrix[feats].copy()
    for f, t in FEATURES:
        if t == "log10":
            data[f] = np.log10(data[f])
    for entity, row in data.iterrows():
        if row.isna().any():
            excluded.append({"entity_id": entity, "reason": "unassigned: " + ", ".join(sorted(row[row.isna()].index.tolist()))})
    data = data.dropna()
    ids = sorted(data.index.tolist())
    data = data.loc[ids]
    n = len(ids)
    if n < MIN_N:
        return {**base, "status": "INSUFFICIENT_DATA", "n": n, "reason": f"{n} complete cases; clustering requires at least {MIN_N}.",
                "excluded_entities": excluded, "pca": None, "kmeans": None, "dbscan": None}
    x = data.to_numpy(dtype=float)
    sd = x.std(axis=0, ddof=0)
    if (sd == 0).any():
        zero = [feats[i] for i in np.where(sd == 0)[0]]
        return {**base, "status": "INSUFFICIENT_DATA", "n": n, "reason": f"Zero variance: {', '.join(zero)}.",
                "excluded_entities": excluded, "pca": None, "kmeans": None, "dbscan": None}
    z = (x - x.mean(axis=0)) / sd

    pca = PCA(n_components=2, svd_solver="full")
    coords = pca.fit_transform(z)
    loadings = pca.components_.copy()
    for i in range(loadings.shape[0]):  # sign convention: largest |loading| positive
        if loadings[i, np.argmax(np.abs(loadings[i]))] < 0:
            loadings[i] *= -1
            coords[:, i] *= -1

    runs = []
    for k in K_RANGE:
        if n < 3 * k:
            continue
        km = KMeans(n_clusters=k, n_init=N_INIT, random_state=RANDOM_STATE, algorithm="lloyd")
        raw = km.fit_predict(z)
        labels = _canonical_labels(raw, ids, z)
        cents = np.array([z[labels == c].mean(axis=0) for c in range(k)])
        sil = silhouette_score(z, labels, metric="euclidean") if 1 < k < n else None
        runs.append({
            "k": k, "inertia": r(float(((z - cents[labels]) ** 2).sum())), "silhouette": r(sil),
            "sizes": [int((labels == c).sum()) for c in range(k)],
            "labels": [{"entity_id": e, "cluster": int(c)} for e, c in zip(ids, labels)],
            "centroids_z": [[r(v) for v in row] for row in cents],
        })
    scored = [run for run in runs if run["silhouette"] is not None]
    recommended = max(scored, key=lambda run: (run["silhouette"], -run["k"]))["k"] if scored else None

    nn = NearestNeighbors(n_neighbors=DBSCAN_MIN_SAMPLES).fit(z)
    dist, _ = nn.kneighbors(z)
    kdist = np.sort(dist[:, -1])
    eps = float(np.percentile(kdist, DBSCAN_EPS_PERCENTILE))
    eps = float(f"{eps:.6g}")
    db = DBSCAN(eps=eps, min_samples=DBSCAN_MIN_SAMPLES).fit(z)
    dlabels = _canonical_labels(db.labels_, ids, z, noise=True)

    return {
        **base, "status": "COMPUTED", "n": n, "reason": None, "excluded_entities": sorted(excluded, key=lambda e: e["entity_id"]),
        "pca": {
            "explained_variance_ratio": [r(v) for v in pca.explained_variance_ratio_],
            "loadings": [[r(v) for v in row] for row in loadings],
            "coordinates": [{"entity_id": e, "pc1": r(c[0]), "pc2": r(c[1])} for e, c in zip(ids, coords)],
        },
        "kmeans": {
            "random_state": RANDOM_STATE, "n_init": N_INIT, "runs": runs, "recommended_k": recommended,
            "selection_rule": "highest mean silhouette; ties resolved toward fewer clusters",
        },
        "dbscan": {
            "eps": r(eps), "min_samples": DBSCAN_MIN_SAMPLES,
            "eps_rule": f"{DBSCAN_EPS_PERCENTILE}th percentile of distances to the {DBSCAN_MIN_SAMPLES - 1}th nearest neighbor (k-distance)",
            "k_distances": [r(v) for v in kdist],
            "labels": [{"entity_id": e, "cluster": int(c)} for e, c in zip(ids, dlabels)],
            "n_clusters": int(len(set(dlabels.tolist()) - {-1})), "n_noise": int((dlabels == -1).sum()),
        },
    }
