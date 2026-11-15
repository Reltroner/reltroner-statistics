"""Composition figures: deterministic light and dark SVGs, and a schema gate on the input.

The share vectors of Reltronland and Beluftner are copied from the pinned sources; the rest of the
artifact is a minimal synthetic frame that satisfies the contract.
"""
from __future__ import annotations

import copy
import hashlib
import json

import jsonschema
import pytest

from reltroner_analytics import composition_figures as figures

from conftest import SCHEMAS

SHA_P, SHA_R, BLOB = "a" * 40, "b" * 40, "c" * 40
ANCESTRY = [("depeisit", "Depeisit"), ("cistheta", "Cistheta"), ("cosmeilian", "Cosmeilian"), ("native", "Native Asthorteran"),
            ("phantomkind", "Phantomkind / Spiritual Hybrid"), ("other", "Other")]
SURFACES = [("nature_minimal_intervention", "Natural low-intervention"), ("urban_active", "Active built urban"),
            ("urban_operational_low_or_biological_zero", "Operational low / biological-zero built urban"), ("urban_dormant", "Dormant built urban")]
HABITATS = [("surface_land", "Land surface"), ("underground", "Underground"), ("underwater", "Underwater"), ("floating", "Floating")]
GEOMETRY = [("polygon", "Country polygon"), ("constructed_volume_km3", "Constructed and occupied volume (km³)"), ("habitable_volume_km3", "Habitable volume (km³)"),
            ("marine_vertical_resident_distribution", "Marine residence by depth"), ("habitat_capacity", "Habitat capacity")]


def rows(cats, pcts, denominator, key="absolute_billion"):
    return [{"key": k, "label": label, "pct": p, key: round(denominator * p / 100, 10)} for (k, label), p in zip(cats, pcts)]


def artifact() -> dict:
    src = lambda side, repo, sha: {"side": side, "repository": repo, "commit_sha": sha, "blob_sha": BLOB, "path": "data/asthortera/nccm-v6-active-cross-domain.json"}
    country = lambda name, pop, pct, pointer: {
        "id": f"country:{name.lower()}", "name": name, "cohort": "PROFILED_14", "population_billion": pop, "status": "ASSIGNED", "rows": rows(ANCESTRY, pct, pop),
        "pointer": pointer, "remodeling": {"status": "IDENTICAL", "population_billion": pop, "rows": []},
    }
    spatial = lambda name, pop, land, surface, habitat, pointer: {
        "id": f"country:{name.lower()}", "name": name, "cohort": "PROFILED_14", "population_billion": pop, "land_area_million_km2": land,
        "production_land_area_million_km2": land, "production_population_billion": pop, "spatial_status_label": "C_creator_ratified_2026-11-01", "land_area_status_label": None,
        "reference": "Year 0", "surface_status": "ASSIGNED", "surface_denominator": "national terrestrial area only", "surface": rows(SURFACES, surface, land, "area_million_km2"),
        "habitat_status": "ASSIGNED", "habitat_denominator": "unique usual residents of country", "habitats": rows(HABITATS, habitat, pop),
        "geometry": [{"key": k, "label": label, "status": "UNASSIGNED"} for k, label in GEOMETRY], "pointer": pointer,
    }
    return {
        "schema_version": "reltroner-composition.v2", "model_version": "NCCM-FIXTURE",
        "sources": {"production": src("production", "Reltroner/reltroner-studio", SHA_P), "remodeling": src("remodeling", "Reltroner/reltroner-studio-remodeling", SHA_R)},
        "ancestry": {
            "authority": "PRODUCTION_MAIN", "pct_status": "CANON_OBSERVED", "absolute_status": "CANON_DERIVED", "absolute_formula": "population_billion × pct / 100",
            "planet": {"population_billion": 946, "sovereign_states": 3, "method": "CREATOR_RATIFIED_REPRESENTATIVE_14_COUNTRY_BENCHMARK", "reference_population_billion": 3288,
                       "provenance_note": "denominator 3288B", "headcount_source": "DERIVED_FROM_SHARES", "rows": rows(ANCESTRY, [50, 20, 15, 10, 2.5, 2.5], 946),
                       "pointer": "planet.ancestry_primary_pct_representative_14_country_weighted"},
            "countries": [country("Reltronland", 855, [64, 22, 4, 5, 2, 3], "countries_14[0]"), country("Beluftner", 91, [0.2, 0.5, 2, 90.3, 6, 1], "countries_14[1]")],
            "coverage": {"assigned": 2, "not_assigned": 0, "residual_states": 1, "residual_population_billion": 0},
        },
        "spatial": {
            "authority": "REMODELING_MAIN_CREATOR_RATIFIED_NOT_PRODUCTION", "status": "PROPOSED", "production_spatial_records": 0,
            "countries": [spatial("Reltronland", 855, 104, [58, 15, 14, 13], [70, 22, 2, 6], "countries_14[0]"), spatial("Beluftner", 91, 363, [87, 4, 5, 4], [82, 12, 2, 4], "countries_14[1]")],
            "coverage": {"surface_assigned": 2, "habitat_assigned": 2, "countries": 2},
        },
        "unknowns": ["fixture"],
    }


def digest_dir(path) -> dict:
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(path.glob("*.svg"))}


def test_artifact_fixture_satisfies_the_published_contract():
    schema = json.loads((SCHEMAS / "composition.schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema).validate(artifact())


def test_figures_are_deterministic_and_ship_in_both_themes(tmp_path):
    data = artifact()
    first, second = tmp_path / "a", tmp_path / "b"
    names = figures.generate(data, first)
    figures.generate(copy.deepcopy(data), second)
    expected = {"species-planet", "species-country-reltronland", "species-country-beluftner", "species-stacked-percent", "species-stacked-billions",
                "spatial-surface-reltronland", "spatial-habitat-reltronland", "spatial-surface-beluftner", "spatial-habitat-beluftner",
                "spatial-surface-percent", "spatial-surface-area", "spatial-habitat-percent", "spatial-habitat-residents"}
    assert set(names) == expected | {f"{n}-dark" for n in expected}
    assert digest_dir(first) == digest_dir(second), "same input, byte-identical SVGs"
    light = (first / "species-planet.svg").read_text(encoding="utf-8")
    dark = (first / "species-planet-dark.svg").read_text(encoding="utf-8")
    assert "#ffffff" in light.lower() and "#0b1a33" in dark.lower()
    assert "<dc:date>" not in light, "no timestamp in the output"


def test_unassigned_vectors_produce_no_figure(tmp_path):
    data = artifact()
    c = data["ancestry"]["countries"][1]
    c["status"], c["rows"] = "NOT_ASSIGNED", []
    names = figures.generate(data, tmp_path)
    assert "species-country-beluftner" not in names and "species-country-reltronland" in names


def test_schema_gate_rejects_a_vector_that_does_not_close(tmp_path):
    data = artifact()
    data["spatial"]["countries"][0]["habitats"][0]["pct"] = 80
    path = tmp_path / "composition.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(SystemExit, match="violates the share closure rule: Reltronland habitats sums to 110"):
        figures.main(["--input", str(path), "--charts-dir", str(tmp_path / "out"), "--schemas", str(SCHEMAS)])


def test_percent_display_rounding_does_not_touch_data():
    assert figures.percent(47.5116180048662) == "47.51%"
    assert figures.percent(70) == "70%"
    assert figures.percent(90.3) == "90.3%"
    assert figures.ink_on("#ffffff") == "#0b0b0b" and figures.ink_on("#0b1a33") == "#ffffff"
