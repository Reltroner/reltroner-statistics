"""Unit tests for the guarded Python decision tree module and CLI integration."""
from __future__ import annotations

import json
import subprocess
import sys

import numpy as np
import pandas as pd
import pytest
import xmlschema

from conftest import ROOT, SCHEMAS
from reltroner_analytics import decision_tree


def test_method_check_fits_classifier_and_regressor_with_exact_exported_predictions():
    mc = decision_tree.method_check()
    assert mc["data_origin"] == "SYNTHETIC_FIXTURE"
    assert len(mc["models"]) == 2
    by_task = {m["task"]: m for m in mc["models"]}

    for task, expected_estimator in [("classification", "DecisionTreeClassifier"), ("regression", "DecisionTreeRegressor")]:
        m = by_task[task]
        assert m["estimator"] == expected_estimator
        assert m["n_samples"] == decision_tree.METHOD_CHECK_ROWS
        assert m["n_train"] + m["n_test"] == m["n_samples"]
        assert m["leakage_checks"]["target_in_features"] is False
        assert m["leakage_checks"]["train_test_overlap"] == 0
        assert len(m["rules"]) >= 1
        assert len(m["verification_rows"]) > 0
        for row in m["verification_rows"]:
            got = decision_tree.predict(m["nodes"], row["features"])
            assert got == row["prediction"]
        # Missing or non-finite split feature must return None rather than a fallback branch.
        root_feat = m["nodes"][0]["feature"]
        if root_feat is not None:
            bad = dict(m["verification_rows"][0]["features"])
            bad[root_feat] = None
            assert decision_tree.predict(m["nodes"], bad) is None
            bad[root_feat] = float("nan")
            assert decision_tree.predict(m["nodes"], bad) is None


def test_sufficiency_gate_rejections_and_derivation_removal():
    base = decision_tree.synthetic_frame(n=60, seed=7)

    # 1. Rejected label sources (clusters / cohorts).
    for src in decision_tree.REJECTED_LABEL_SOURCES:
        g = decision_tree.assess(base, "synthetic_class", ["synthetic_x1", "synthetic_x2"], "classification", label_source=src)
        assert not g["passed"] and g["rejected_target"]

    # 2. Target leakage in features.
    g_leak = decision_tree.assess(base, "synthetic_y", ["synthetic_x1", "synthetic_y"], "regression")
    assert not g_leak["passed"] and g_leak["rejected_target"]

    # 3. Sample size below MIN_LABELED_SAMPLES and below MIN_SAMPLES_PER_FEATURE * k.
    small = decision_tree.synthetic_frame(n=20, seed=7)
    g_small = decision_tree.assess(small, "synthetic_y", ["synthetic_x1"], "regression")
    assert not g_small["passed"] and any("30" in r for r in g_small["reasons"])

    tight = decision_tree.synthetic_frame(n=35, seed=7)
    # 4 features need 40 complete rows; create an extra numeric column.
    tight["synthetic_x4"] = tight["synthetic_x1"] * 0.5
    g_ratio = decision_tree.assess(
        tight, "synthetic_y", ["synthetic_x1", "synthetic_x2", "synthetic_x3", "synthetic_x4"], "regression"
    )
    assert not g_ratio["passed"] and any("rows per feature" in r for r in g_ratio["reasons"])

    # 4. Constant target and rare classification class.
    const = base.copy()
    const["synthetic_y"] = 1.0
    g_const = decision_tree.assess(const, "synthetic_y", ["synthetic_x1", "synthetic_x2"], "regression")
    assert not g_const["passed"] and any("constant" in r for r in g_const["reasons"])

    rare = base.copy()
    rare["synthetic_class"] = "S0"
    rare.iloc[:4, rare.columns.get_loc("synthetic_class")] = "S1"
    g_rare = decision_tree.assess(rare, "synthetic_class", ["synthetic_x1", "synthetic_x2"], "classification")
    assert not g_rare["passed"] and any("S1" in r for r in g_rare["reasons"])

    # 5. Mixed units and infinities.
    g_units = decision_tree.assess(
        base, "synthetic_y", ["synthetic_x1", "synthetic_x2"], "regression", units={"synthetic_x1": {"km", "miles"}}
    )
    assert not g_units["passed"] and any("more than one unit" in r for r in g_units["reasons"])

    with_inf = base.copy()
    with_inf.iloc[0, with_inf.columns.get_loc("synthetic_x1")] = np.inf
    g_inf = decision_tree.assess(with_inf, "synthetic_y", ["synthetic_x1", "synthetic_x2"], "regression")
    assert not g_inf["passed"] and any("non-finite" in r for r in g_inf["reasons"])

    # 6. Derived feature automatically stripped for gdp_per_capita without leakage.
    df = pd.DataFrame({
        "gdp_per_capita": np.linspace(1000.0, 5000.0, 40),
        "gdp_usd": np.linspace(1e9, 5e9, 40),
        "population": np.linspace(1e6, 2e6, 40),
        "urbanization": np.linspace(0.4, 0.9, 40),
    })
    g_der = decision_tree.assess(df, "gdp_per_capita", ["gdp_usd", "population", "urbanization"], "regression")
    assert g_der["passed"]
    assert g_der["derived_features_removed"] == ["gdp_usd", "population"]
    assert g_der["features"] == ["urbanization"]


def test_missing_rows_excluded_without_imputation_and_temporal_bac_split():
    df = decision_tree.synthetic_frame(n=45, seed=11)
    # Set first 10 rows to NaN -> 35 complete rows remain, never imputed.
    df.iloc[:10, df.columns.get_loc("synthetic_x2")] = np.nan
    gate = decision_tree.assess(df, "synthetic_y", ["synthetic_x1", "synthetic_x2"], "regression")
    assert gate["n_rows"] == 45 and gate["n_complete"] == 35 and gate["passed"]

    # Add strict BAC descending timestamps (older = larger BAC year).
    clean = df.dropna().copy()
    clean["year_bac"] = np.arange(len(clean), 0, -1, dtype=float)
    fitted = decision_tree.fit(
        clean, "synthetic_y", ["synthetic_x1", "synthetic_x2"], "regression", data_origin="SYNTHETIC_FIXTURE", order_column="year_bac"
    )
    assert fitted["leakage_checks"]["temporal_order_respected"] is True
    assert fitted["leakage_checks"]["train_test_overlap"] == 0
    assert "temporal hold-out" in fitted["evaluation"]["method"]

    # Ambiguous temporal tie across train/test boundary must raise.
    tied = clean.copy()
    tied["year_bac"] = 100.0
    with pytest.raises(ValueError, match="Temporal split is ambiguous"):
        decision_tree.fit(
            tied, "synthetic_y", ["synthetic_x1", "synthetic_x2"], "regression", data_origin="SYNTHETIC_FIXTURE", order_column="year_bac"
        )


def test_cli_outputs_decision_trees_with_truthful_canonical_insufficiency(dataset_file, tmp_path):
    inp = dataset_file(n_countries=14, history_years=[1010, 950, 0])
    out = tmp_path / "analytics.json"
    charts = tmp_path / "charts"
    subprocess.run(
        [sys.executable, "-m", "reltroner_analytics", "--input", str(inp), "--output", str(out), "--charts-dir", str(charts), "--schemas", str(SCHEMAS)],
        check=True, cwd=ROOT / "analytics" / "python", capture_output=True, text=True,
    )
    data = json.loads(out.read_text(encoding="utf-8"))
    dt = data["decision_trees"]
    assert dt["status"] == "INSUFFICIENT_LABELED_DATA"
    by_id = {t["task_id"]: t for t in dt["tasks"]}
    assert by_id["regression-sdi-profiled-14"]["status"] == "INSUFFICIENT_LABELED_DATA"
    assert by_id["regression-sdi-profiled-14"]["model"] is None
    assert by_id["classification-kmeans-cluster"]["status"] == "REJECTED_TARGET"
    assert by_id["classification-cohort"]["status"] == "REJECTED_TARGET"
    assert dt["historical"]["status"] == "INSUFFICIENT_LABELED_DATA"
    assert dt["historical"]["max_series_length"] == 3
    assert dt["method_check"]["data_origin"] == "SYNTHETIC_FIXTURE"
    assert len(dt["method_check"]["models"]) == 2


def test_decision_finding_ids_validate_against_report_xsd():
    xsd = xmlschema.XMLSchema(str(SCHEMAS / "report.xsd"))
    zeros40 = "0" * 40
    zeros64 = "0" * 64
    findings_xml = "\n".join(
        f"""
        <finding id="{prefix}-0123456789AB" level="SECTION" classification="SEMANTIC_REVIEW_CANDIDATE"
                 changeType="CONTENT_CHANGED" reviewStatus="PROPOSAL" priority="P2">
          <title>Decision report {prefix}</title>
          <file path="creative/decisions/{prefix.lower()}" kind="markdown"/>
          <locator>decision.{prefix.lower()}</locator>
          <production present="true" type="string"><value>baseline</value></production>
          <remodeling present="true" type="string"><value>proposal</value></remodeling>
          <canonStatus>UNRATIFIED_PROPOSAL</canonStatus>
          <rule>DI-1.0.0</rule>
          <recommendation>Review without mutating canon.</recommendation>
        </finding>
        """
        for prefix in ("DT", "DTP", "DTE", "DTS")
    )
    xml_doc = f"""<?xml version="1.0" encoding="UTF-8"?>
    <report xmlns="https://reltroner-statistics.invalid/schema/report/v1"
            schemaVersion="reltroner-statistics-report.v1" layout="consolidated">
      <title>Decision Intelligence Report</title>
      <context generatedAt="2026-01-01T00:00:00Z" rulesVersion="P0R-2.0.0" semanticDigest="{zeros64}">
        <production repository="Reltroner/reltroner-studio" commit="{zeros40}" tree="{zeros40}"/>
        <remodeling repository="Reltroner/reltroner-studio-remodeling" commit="{zeros40}" tree="{zeros40}"/>
        <deployment status="DEPLOYMENT_UNVERIFIED">Not verified</deployment>
      </context>
      <authorityNotice>Proposals are never canon.</authorityNotice>
      <findings count="4">{findings_xml}</findings>
    </report>"""
    xsd.validate(xml_doc)
