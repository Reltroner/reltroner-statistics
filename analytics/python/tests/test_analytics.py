import json

import numpy as np
import pandas as pd
import pytest

from reltroner_analytics import clustering, history, stats
from reltroner_analytics.charts import diverging_stops
from reltroner_analytics.cli import main
from reltroner_analytics.dataset import cross_section, load
from reltroner_analytics.util import r

from conftest import SCHEMAS


def test_rounding_is_stable_and_rejects_non_finite():
    assert r(0.1 + 0.2) == 0.3
    assert r(float("nan")) is None
    assert r(float("inf")) is None
    assert r(-0.0) == 0.0


def test_descriptive_known_values():
    m = pd.DataFrame({"x": [1.0, 2.0, 3.0, 4.0, 100.0]}, index=[f"country:{i}" for i in range(5)])
    d = stats.descriptive(m, "PROFILED_14")[0]
    assert d["status"] == "COMPUTED"
    assert (d["n"], d["median"], d["q1"], d["q3"], d["min"], d["max"]) == (5, 3.0, 2.0, 4.0, 1.0, 100.0)
    assert d["mad"] == 1.0
    assert d["outliers"] == [{"entity_id": "country:4", "value": 100.0}]
    assert d["whisker_high"] == 4.0
    few = stats.descriptive(pd.DataFrame({"x": [1.0, np.nan]}, index=["a", "b"]), "PROFILED_14")[0]
    assert few["status"] == "INSUFFICIENT_DATA" and few["n_missing"] == 1


def test_robust_outliers_and_zero_mad():
    vals = [1.0] * 9 + [50.0]
    m = pd.DataFrame({"x": vals, "y": [float(i) for i in range(9)] + [1000.0]}, index=[f"e{i}" for i in range(10)])
    out = {o["indicator_id"]: o for o in stats.robust_outliers(m, "PROFILED_14")}
    assert out["x"]["status"] == "INSUFFICIENT_DATA" and "MAD is zero" in out["x"]["reason"]
    assert out["y"]["status"] == "COMPUTED" and out["y"]["flagged"][0]["entity_id"] == "e9"


def test_cross_section_excludes_residual_archived_and_scenarios(dataset_file):
    ds = load(dataset_file())
    m = cross_section(ds, "PROFILED_14")
    assert "aggregate:deferred-18" not in m.index
    assert len(m) == 12
    assert m.dtypes.unique().tolist() == [np.dtype("float64")]
    assert "population_growth" not in m.columns


def test_clustering_is_reproducible_with_canonical_labels(dataset_file):
    ds = load(dataset_file())
    m = cross_section(ds, "PROFILED_14")
    a, b = clustering.run(m, "PROFILED_14"), clustering.run(m, "PROFILED_14")
    assert a == b
    assert a["status"] == "COMPUTED" and a["n"] == 12
    run3 = next(x for x in a["kmeans"]["runs"] if x["k"] == 3)
    assert sorted(run3["sizes"]) == [4, 4, 4]
    # Cluster 0 is the highest-SDI group by construction of the canonical relabeling.
    sdi = m["sdi"]
    labels = {x["entity_id"]: x["cluster"] for x in run3["labels"]}
    means = [sdi[[e for e, c in labels.items() if c == k]].mean() for k in range(3)]
    assert means == sorted(means, reverse=True)
    assert a["kmeans"]["random_state"] == 42 and a["kmeans"]["n_init"] == 50
    assert a["dbscan"]["min_samples"] == 3 and a["dbscan"]["eps"] > 0


def test_clustering_refuses_insufficient_samples(dataset_file):
    m = cross_section(load(dataset_file(n_countries=6)), "PROFILED_14")
    res = clustering.run(m, "PROFILED_14")
    assert res["status"] == "INSUFFICIENT_DATA" and res["kmeans"] is None and "at least 10" in res["reason"]


def test_history_gaps_are_insufficient_and_consecutive_runs_compute(dataset_file):
    sparse = history.assess(load(dataset_file()))
    s = next(x for x in sparse["series"] if x["indicator_id"] == "real_gdp_growth")
    assert s["volatility"]["status"] == "INSUFFICIENT_DATA" and s["max_consecutive_annual"] == 1
    assert "1010 BAC, 950 BAC, Year 0" in s["volatility"]["reason"]
    assert not any(x["indicator_id"] == "population_growth" for x in sparse["series"])
    dense = history.assess(load(dataset_file(history_years=list(range(30, 18, -1)))))
    d = next(x for x in dense["series"] if x["indicator_id"] == "real_gdp_growth")
    assert d["volatility"]["status"] == "COMPUTED" and d["max_consecutive_annual"] == 12
    assert d["volatility"]["rolling_median"][:4] == [None] * 4 and d["volatility"]["rolling_median"][4] is not None
    assert d["change_point"]["status"] == "INSUFFICIENT_DATA"


def test_diverging_scale_has_gray_midpoint_and_symmetric_arms():
    stops = diverging_stops()
    assert len(stops) == 7 and stops[3] == "#f0efec"
    assert stops[0] == "#184f95" and stops[0] != stops[-1]


def test_cli_output_validates_and_digest_is_reproducible(dataset_file, tmp_path):
    src = dataset_file()
    outs = []
    for run in range(2):
        out = tmp_path / f"analytics-{run}.json"
        assert main(["--input", str(src), "--output", str(out), "--charts-dir", str(tmp_path / f"charts-{run}"), "--schemas", str(SCHEMAS)]) == 0
        outs.append(json.loads(out.read_text(encoding="utf-8")))
    assert outs[0]["digest"] == outs[1]["digest"]
    assert outs[0]["status"] == "MODEL_ESTIMATE"
    assert {c["id"] for c in outs[0]["charts"]} >= {"sdi-vs-gdp-per-capita", "correlation-spearman", "kmeans-pca", "historical-real-growth"}
    svg = (tmp_path / "charts-0" / "kmeans-pca.svg").read_text(encoding="utf-8")
    assert "<svg" in svg and "Cluster 1" in svg and "dc:date" not in svg


def test_cli_rejects_invalid_input(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"schema_version": "wrong"}), encoding="utf-8")
    with pytest.raises(SystemExit, match="violates observations.schema.json"):
        main(["--input", str(bad), "--output", str(tmp_path / "o.json"), "--charts-dir", str(tmp_path / "c"), "--schemas", str(SCHEMAS)])
