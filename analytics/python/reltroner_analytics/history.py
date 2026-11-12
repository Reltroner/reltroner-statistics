"""Historical coverage assessment. The 1010 BAC -> Year 0 axis is sparse; nothing is interpolated.

Rolling median/MAD volatility needs at least MIN_RUN_VOLATILITY consecutive annual observations
(window ROLLING_WINDOW); change-point analysis needs MIN_RUN_CHANGEPOINT. Scenario intervals and
archived values never count as observations.
"""
from __future__ import annotations

import numpy as np

from .util import r

ROLLING_WINDOW = 5
MIN_RUN_VOLATILITY = 8
MIN_RUN_CHANGEPOINT = 20
COUNTED = {"CANON_OBSERVED", "CANON_DERIVED"}


def _max_consecutive(years_desc: list[int]) -> int:
    if not years_desc:
        return 0
    best = run = 1
    for a, b in zip(years_desc, years_desc[1:]):
        run = run + 1 if a - b == 1 else 1
        best = max(best, run)
    return best


def assess(ds) -> dict:
    o = ds.observations
    point = o[(~o["interval"]) & (o["status"].isin(COUNTED)) & (o["value_state"] == "ASSIGNED")]
    keys = sorted({(e, i) for e, i, y in point[["entity_id", "indicator_id", "year_bac"]].itertuples(index=False) if y > 0})
    series = []
    for entity, ind in keys:
        s = point[(point["entity_id"] == entity) & (point["indicator_id"] == ind)].sort_values("year_bac", ascending=False)
        s = s.drop_duplicates(subset=["year_bac"], keep="first")
        years = [int(y) for y in s["year_bac"].tolist()]
        values = s["value"].astype(float).to_numpy()
        run = _max_consecutive(years)
        coverage = ", ".join("Year 0" if y == 0 else f"{y} BAC" for y in years)
        if run >= MIN_RUN_VOLATILITY:
            med = [r(float(np.median(values[i - ROLLING_WINDOW + 1:i + 1]))) if i >= ROLLING_WINDOW - 1 else None for i in range(len(values))]
            mad = []
            for i in range(len(values)):
                if i < ROLLING_WINDOW - 1:
                    mad.append(None)
                    continue
                w = values[i - ROLLING_WINDOW + 1:i + 1]
                mad.append(r(float(np.median(np.abs(w - np.median(w))))))
            vol = {"status": "COMPUTED", "reason": f"{run} consecutive annual observations; window {ROLLING_WINDOW}.", "rolling_median": med, "rolling_mad": mad}
        else:
            vol = {"status": "INSUFFICIENT_DATA", "rolling_median": None, "rolling_mad": None,
                   "reason": f"{len(years)} observation(s) at {coverage}; longest consecutive annual run {run}. Rolling median/MAD (window {ROLLING_WINDOW}) requires at least {MIN_RUN_VOLATILITY} consecutive annual observations."}
        cp = ({"status": "COMPUTED", "reason": f"{run} consecutive annual observations."} if run >= MIN_RUN_CHANGEPOINT else
              {"status": "INSUFFICIENT_DATA", "reason": f"Change-point detection requires at least {MIN_RUN_CHANGEPOINT} consecutive annual observations; longest run is {run}."})
        series.append({
            "entity_id": entity, "indicator_id": ind, "n": len(years), "years_bac": years,
            "statuses": s["status"].tolist(), "max_consecutive_annual": run, "volatility": vol, "change_point": cp,
        })
    return {
        "rule": f"Volatility: >= {MIN_RUN_VOLATILITY} consecutive annual canon observations (rolling window {ROLLING_WINDOW}). Change points: >= {MIN_RUN_CHANGEPOINT}. Scenario intervals, archived and proposed values are excluded; gaps are never interpolated.",
        "series": series,
    }
