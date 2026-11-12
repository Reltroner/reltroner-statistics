"""python -m reltroner_analytics --input observations.json --output analytics.json --charts-dir charts/ --schemas analytics/schemas"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from pathlib import Path

import jsonschema
import matplotlib
import numpy
import pandas
import scipy
import sklearn

from . import __version__, charts, clustering, history, stats
from .dataset import cross_section, load
from .util import canonical_json, sha256_bytes, sha256_text

INDICATOR_SHORT = {
    "population": "Population", "land_area": "Land area", "sdi": "SDI", "gdp_per_capita": "GDP per capita", "real_gdp_growth": "Real growth",
    "inflation": "Inflation", "unemployment": "Unemployment", "debt_to_gdp": "Debt/GDP", "gini": "Gini", "urbanization": "Urbanization",
    "median_age": "Median age", "life_expectancy": "Life expectancy", "tfr": "TFR", "education_access": "Education access", "carbon_per_capita": "Carbon",
}


def _validate(instance: dict, schema_path: Path, label: str) -> None:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    if errors:
        first = errors[0]
        raise SystemExit(f"{label} violates {schema_path.name}: {'/'.join(map(str, first.path))}: {first.message[:300]}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="reltroner_analytics")
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--charts-dir", required=True, type=Path)
    ap.add_argument("--schemas", required=True, type=Path)
    args = ap.parse_args(argv)

    raw_bytes = args.input.read_bytes()
    raw = json.loads(raw_bytes)
    _validate(raw, args.schemas / "observations.schema.json", "input")
    ds = load(args.input)
    m14 = cross_section(ds, "PROFILED_14")
    m19 = cross_section(ds, "ALL_19")
    names = dict(zip(ds.entities["id"], ds.entities["name"]))

    result = {
        "schema_version": "reltroner-statistics-analytics.v1",
        "status": "MODEL_ESTIMATE",
        "engine": {
            "reltroner_analytics": __version__, "python": platform.python_version(), "numpy": numpy.__version__, "pandas": pandas.__version__,
            "scipy": scipy.__version__, "scikit_learn": sklearn.__version__, "matplotlib": matplotlib.__version__,
        },
        "input": {"observations_sha256": sha256_bytes(raw_bytes), "model_version": ds.model_version, "production_commit": ds.production_commit},
        "descriptive": stats.descriptive(m14, "PROFILED_14") + stats.descriptive(m19, "ALL_19"),
        "correlation": stats.correlation(m14, "PROFILED_14"),
        "clustering": clustering.run(m14, "PROFILED_14"),
        "outliers": stats.robust_outliers(m14, "PROFILED_14") + stats.robust_outliers(m19, "ALL_19"),
        "history": history.assess(ds),
        "charts": [],
    }

    args.charts_dir.mkdir(parents=True, exist_ok=True)
    commit = (ds.production_commit or "unknown")[:12]
    footer = f"Source: Reltroner/reltroner-studio@{commit} · {raw.get('dataset_path')} · {ds.model_version} · deployment unverified · MODEL_ESTIMATE figure"
    produced = []
    produced.append(("sdi-vs-gdp-per-capita", "SDI against GDP per capita, Year 0",
                     "Scatter plot of SDI against GDP per capita on a log scale for the profiled and development nations.",
                     charts.scatter_sdi_gdp(m19, ds.entities, footer, args.charts_dir / "sdi-vs-gdp-per-capita.svg")))
    if result["correlation"]["status"] == "COMPUTED":
        produced.append(("correlation-spearman", "Rank correlation matrix",
                         "Heatmap of Spearman rank correlations between indicators across the profiled nations.",
                         charts.correlation_heatmap(result["correlation"], INDICATOR_SHORT, footer, args.charts_dir / "correlation-spearman.svg")))
    cs = charts.cluster_scatter(result["clustering"], names, footer, args.charts_dir / "kmeans-pca.svg")
    if cs:
        produced.append(("kmeans-pca", "K-Means clusters in PCA projection", "Scatter of the profiled nations on the first two principal components, colored by K-Means cluster.", cs))
    o = ds.observations
    anchors = o[(o["entity_id"] == "planet:asthortera") & (o["indicator_id"] == "real_gdp_growth") & (~o["interval"]) & (o["status"].isin({"CANON_OBSERVED", "CANON_DERIVED"}))]
    pts = sorted({(int(y), float(v)) for y, v in anchors[["year_bac", "value"]].itertuples(index=False)}, key=lambda p: -p[0])
    ha = charts.historical_anchors(pts, footer, args.charts_dir / "historical-real-growth.svg")
    if ha:
        produced.append(("historical-real-growth", "Planetary real GDP growth anchors", "Three discrete canonical observations of planetary real GDP growth; no interpolation between them.", ha))
    for cid, title, alt, data in produced:
        result["charts"].append({"id": cid, "title": title, "file": f"charts/{cid}.svg", "sha256": sha256_bytes(data), "alt": alt})

    digest_basis = {k: v for k, v in result.items() if k not in ("engine", "charts")}
    result["digest"] = sha256_text(canonical_json(digest_basis))
    _validate(result, args.schemas / "analytics.schema.json", "output")
    tmp = args.output.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    os.replace(tmp, args.output)
    print(json.dumps({"status": "ANALYTICS_GENERATED", "digest": result["digest"], "charts": len(result["charts"]),
                      "clustering": result["clustering"]["status"], "recommended_k": (result["clustering"]["kmeans"] or {}).get("recommended_k")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
