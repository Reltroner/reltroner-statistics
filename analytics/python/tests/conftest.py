"""Synthetic, schema-valid observation datasets. Invented numbers for testing only - never canon."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "analytics" / "schemas"
SHA_A = "a" * 40
INDICATORS = {
    "population": "billion sentients", "land_area": "million km²", "sdi": "index (0–1)", "gdp_per_capita": "USD per sentient",
    "real_gdp_growth": "ratio per year", "inflation": "ratio per year", "unemployment": "ratio of labor force", "debt_to_gdp": "ratio of GDP",
    "gini": "coefficient (0–1)", "urbanization": "ratio of population", "median_age": "years", "life_expectancy": "years", "tfr": "children per woman",
    "education_access": "ratio", "carbon_per_capita": "tonnes per sentient",
}


def _obs(entity_id, name, kind, cohort, indicator, value, year=0, status=None, interval=None, evidence=None):
    period = {"calendar": "BAC", "year_bac": year, "label": "Year 0" if year == 0 else f"{year} BAC"}
    if interval:
        period["interval"] = {"start_bac": interval[0], "end_bac": interval[1]}
        period["label"] = f"{interval[0]} BAC – {interval[1]} BAC"
    key = f"{entity_id}|{indicator}|{period['label']}|{status}"
    return {
        "id": "OBS-" + hashlib.sha256(key.encode()).hexdigest()[:12].upper(),
        "entity_id": entity_id, "entity_name": name, "entity_kind": kind, "cohort": cohort, "indicator_id": indicator,
        "value": value, "value_state": "ASSIGNED" if value is not None else "NULL", "unit": INDICATORS.get(indicator, "ratio"),
        "period": period, "status": status or ("CANON_OBSERVED" if value is not None else "INSUFFICIENT_DATA"),
        "source": {"role": "PRODUCTION_MAIN", "repository": "Reltroner/reltroner-studio", "commit_sha": SHA_A, "path": "data/x.json",
                   "blob_sha": "b" * 40, "pointer": f"x[{name}].{indicator}", "line": None},
        "model_version": "FIXTURE", "source_status_label": None, "evidence": evidence,
    }


def build_dataset(n_countries: int = 12, history_years: list[int] | None = None) -> dict:
    entities, observations = [], []
    for i in range(n_countries):
        eid, name = f"country:c{i:02d}", f"C{i:02d}"
        cohort = "PROFILED_14"
        entities.append({"id": eid, "name": name, "kind": "country", "cohort": cohort, "source_document": None, "specialization": None,
                         "fx_code": None, "foundation_bac": None, "represents_states": 1, "canon_status": "C"})
        group = i % 3
        vals = {
            "population": 50 + 30 * i, "land_area": 20 + 5 * i, "sdi": 0.80 + 0.05 * group + 0.002 * i, "gdp_per_capita": 1e9 * (2 + 3 * group) * (1 + 0.01 * i),
            "real_gdp_growth": 0.03 + 0.005 * group, "inflation": 0.002 + 0.001 * (i % 4), "unemployment": 0.02 + 0.003 * (i % 5),
            "debt_to_gdp": 0.4 + 0.05 * (i % 6), "gini": 0.30 + 0.02 * group + 0.001 * i, "urbanization": 0.70 + 0.06 * group,
            "median_age": 150 + 40 * group + i, "life_expectancy": 300 + 60 * group + 2 * i, "tfr": 1.9 - 0.25 * group - 0.01 * i,
            "education_access": 0.9 + 0.02 * group, "carbon_per_capita": 3 + group + 0.1 * i,
        }
        for ind, v in vals.items():
            observations.append(_obs(eid, name, "country", cohort, ind, round(v, 10)))
    entities.append({"id": "aggregate:deferred-18", "name": "Deferred states (combined residual)", "kind": "aggregate_residual", "cohort": "DEFERRED_18_AGGREGATE",
                     "source_document": None, "specialization": None, "fx_code": None, "foundation_bac": None, "represents_states": 18, "canon_status": "C"})
    observations.append(_obs("aggregate:deferred-18", "Deferred", "aggregate_residual", "DEFERRED_18_AGGREGATE", "sdi", 0.1, status="CANON_DERIVED"))
    entities.append({"id": "planet:asthortera", "name": "Asthortera", "kind": "planet", "cohort": "PLANET", "source_document": None, "specialization": None,
                     "fx_code": None, "foundation_bac": None, "represents_states": n_countries, "canon_status": "C"})
    for y in history_years if history_years is not None else [1010, 950, 0]:
        observations.append(_obs("planet:asthortera", "Asthortera", "planet", "PLANET", "real_gdp_growth", 0.04 + (y % 7) / 100, year=y))
    observations.append(_obs("planet:asthortera", "Asthortera", "planet", "PLANET", "population_growth", 0.014, year=995, status="SCENARIO", interval=(1010, 995)))
    return {
        "schema_version": "reltroner-statistics-observations.v1", "model_version": "FIXTURE", "dataset_path": "data/x.json",
        "production": {"commit_sha": SHA_A, "blob_sha": "b" * 40}, "remodeling": None, "entities": entities, "observations": observations,
        "proposals": [], "timeline": [], "ranges": [], "migration": {"flows": [], "total_billion": None, "status": "INSUFFICIENT_DATA", "source": None},
        "source_issues": [], "evidence_checks": [], "unknowns": [],
    }


@pytest.fixture
def dataset_file(tmp_path):
    def make(**kwargs) -> Path:
        p = tmp_path / f"observations-{len(list(tmp_path.iterdir()))}.json"
        p.write_text(json.dumps(build_dataset(**kwargs)), encoding="utf-8")
        return p
    return make


def finite(x) -> bool:
    return x is None or math.isfinite(x)
