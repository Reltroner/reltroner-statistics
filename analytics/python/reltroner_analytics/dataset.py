"""Load validated observations and shape the cross-sectional matrices the analyses consume.

Cohort rules (fixed):
  PROFILED_14 - the fourteen individually profiled nations.
  ALL_19      - PROFILED_14 plus the five development nations.
The deferred-18 residual is ONE combined aggregate, never 18 observations, and is excluded from
every cross-country computation. Only current canon values (CANON_OBSERVED / CANON_DERIVED) at
Year 0 enter cross-sectional statistics; ARCHIVED, PROPOSED and unassigned values do not.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

CANON = {"CANON_OBSERVED", "CANON_DERIVED"}
COHORTS = {"PROFILED_14": {"PROFILED_14"}, "ALL_19": {"PROFILED_14", "DEVELOPMENT_5"}}
LOG_INDICATORS = {"population", "gdp_usd", "gdp_per_capita"}


@dataclass(frozen=True)
class Dataset:
    raw: dict
    observations: pd.DataFrame
    entities: pd.DataFrame

    @property
    def model_version(self) -> str | None:
        return self.raw.get("model_version")

    @property
    def production_commit(self) -> str | None:
        prod = self.raw.get("production")
        return prod.get("commit_sha") if prod else None


def load(path: Path) -> Dataset:
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for o in raw["observations"]:
        p = o["period"]
        rows.append({
            "id": o["id"], "entity_id": o["entity_id"], "entity_name": o["entity_name"], "entity_kind": o["entity_kind"],
            "cohort": o["cohort"], "indicator_id": o["indicator_id"], "value": o["value"], "value_state": o["value_state"],
            "status": o["status"], "year_bac": p["year_bac"], "interval": "interval" in p, "model_version": o["model_version"],
            "evidence": o["evidence"] is not None,
        })
    obs = pd.DataFrame(rows)
    obs["value"] = pd.to_numeric(obs["value"], errors="coerce").astype("float64")
    ents = pd.DataFrame(raw["entities"])
    return Dataset(raw=raw, observations=obs, entities=ents)


def cross_section(ds: Dataset, cohort: str) -> pd.DataFrame:
    """Entity x indicator matrix of current canon Year 0 values; NaN where unassigned."""
    allowed = COHORTS[cohort]
    o = ds.observations
    mask = (o["cohort"].isin(allowed)) & (o["entity_kind"] == "country") & (o["year_bac"] == 0) & (~o["interval"]) & (~o["evidence"])
    current = o[mask & (o["status"] != "ARCHIVED")]
    canon = current[current["status"].isin(CANON)]
    members = sorted(ds.entities[ds.entities["cohort"].isin(allowed)]["id"].tolist())
    matrix = canon.pivot_table(index="entity_id", columns="indicator_id", values="value", aggfunc="first")
    indicators = sorted(current["indicator_id"].unique().tolist())
    return matrix.reindex(index=members, columns=indicators).astype("float64")
