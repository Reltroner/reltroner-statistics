"""Descriptive statistics, correlation and robust outlier review over cross-sectional cohorts."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as sps

from .dataset import LOG_INDICATORS
from .util import r

MIN_N_DESCRIPTIVE = 3
MIN_N_OUTLIER = 8
MIN_PAIRWISE_N = 8
ROBUST_Z_THRESHOLD = 3.5  # Iglewicz & Hoaglin modified z-score

# Correlation features: one representative per concept. Excluded: gdp_usd and gdp_share (scale
# identities of each other), SDI components (constituents of sdi), FX (arbitrary currency unit),
# specialization_factor (partly unassigned).
CORRELATION_FEATURES = [
    "population", "land_area", "sdi", "gdp_per_capita", "real_gdp_growth", "inflation", "unemployment",
    "debt_to_gdp", "gini", "urbanization", "median_age", "life_expectancy", "tfr", "education_access", "carbon_per_capita",
]


def descriptive(matrix: pd.DataFrame, cohort: str) -> list[dict]:
    out = []
    for ind in matrix.columns:
        col = matrix[ind]
        vals = col.dropna().to_numpy(dtype=float)
        n, missing = int(vals.size), int(col.isna().sum())
        base = {"indicator_id": ind, "cohort": cohort, "n": n, "n_missing": missing}
        if n < MIN_N_DESCRIPTIVE:
            out.append({**base, "status": "INSUFFICIENT_DATA", "mean": None, "median": None, "std": None, "min": None, "max": None,
                        "q1": None, "q3": None, "iqr": None, "mad": None, "whisker_low": None, "whisker_high": None, "outliers": [],
                        "reason": f"{n} assigned values; descriptive statistics require at least {MIN_N_DESCRIPTIVE}."})
            continue
        q1, med, q3 = np.percentile(vals, [25, 50, 75])
        iqr = q3 - q1
        lo_fence, hi_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        inside = vals[(vals >= lo_fence) & (vals <= hi_fence)]
        series = col.dropna()
        outliers = [{"entity_id": e, "value": r(v)} for e, v in series.items() if v < lo_fence or v > hi_fence]
        out.append({
            **base, "status": "COMPUTED",
            "mean": r(vals.mean()), "median": r(med), "std": r(vals.std(ddof=1)), "min": r(vals.min()), "max": r(vals.max()),
            "q1": r(q1), "q3": r(q3), "iqr": r(iqr), "mad": r(np.median(np.abs(vals - med))),
            "whisker_low": r(inside.min()), "whisker_high": r(inside.max()),
            "outliers": sorted(outliers, key=lambda x: x["entity_id"]), "reason": None,
        })
    return out


def _transform(series: pd.Series, ind: str) -> pd.Series:
    return np.log10(series) if ind in LOG_INDICATORS else series


def correlation(matrix: pd.DataFrame, cohort: str) -> dict:
    feats = [f for f in CORRELATION_FEATURES if f in matrix.columns]
    data = pd.DataFrame({f: _transform(matrix[f], f) for f in feats})
    k = len(feats)
    pearson = [[None] * k for _ in range(k)]
    spearman = [[None] * k for _ in range(k)]
    pairwise = [[0] * k for _ in range(k)]
    for i, a in enumerate(feats):
        for j, b in enumerate(feats):
            pair = pd.DataFrame({"a": data[a], "b": data[b]}).dropna()
            n = len(pair)
            pairwise[i][j] = n
            if n < MIN_PAIRWISE_N or pair["a"].nunique() < 2 or pair["b"].nunique() < 2:
                continue
            if i == j:
                pearson[i][j] = spearman[i][j] = 1.0
                continue
            pearson[i][j] = r(sps.pearsonr(pair["a"], pair["b"]).statistic)
            spearman[i][j] = r(sps.spearmanr(pair["a"], pair["b"]).statistic)
    min_n = min(min(row) for row in pairwise) if k else 0
    ok = k >= 2 and min_n >= MIN_PAIRWISE_N
    return {
        "status": "COMPUTED" if ok else "INSUFFICIENT_DATA", "cohort": cohort, "features": feats, "n": int(len(data.dropna())),
        "pearson": pearson, "spearman": spearman, "pairwise_n": pairwise, "min_pairwise_n": int(min_n),
        "reason": None if ok else f"Correlation requires at least {MIN_PAIRWISE_N} paired observations per feature pair.",
    }


def robust_outliers(matrix: pd.DataFrame, cohort: str) -> list[dict]:
    out = []
    for ind in matrix.columns:
        series = matrix[ind].dropna()
        n = int(series.size)
        base = {"indicator_id": ind, "cohort": cohort, "method": "modified z-score 0.6745·(x − median)/MAD", "threshold": ROBUST_Z_THRESHOLD, "n": n}
        if n < MIN_N_OUTLIER:
            out.append({**base, "status": "INSUFFICIENT_DATA", "median": None, "mad": None, "flagged": [],
                        "reason": f"{n} assigned values; robust outlier review requires at least {MIN_N_OUTLIER}."})
            continue
        vals = series.to_numpy(dtype=float)
        med = float(np.median(vals))
        mad = float(np.median(np.abs(vals - med)))
        if mad == 0:
            out.append({**base, "status": "INSUFFICIENT_DATA", "median": r(med), "mad": 0.0, "flagged": [],
                        "reason": "MAD is zero (more than half the values are identical); the modified z-score is undefined."})
            continue
        flagged = []
        for entity, v in series.items():
            z = 0.6745 * (float(v) - med) / mad
            if abs(z) > ROBUST_Z_THRESHOLD:
                flagged.append({"entity_id": entity, "value": r(v), "robust_z": r(z)})
        out.append({**base, "status": "COMPUTED", "median": r(med), "mad": r(mad),
                    "flagged": sorted(flagged, key=lambda x: (-abs(x["robust_z"]), x["entity_id"])), "reason": None})
    return out
