"""Cross-language export checks: XML produced by the Node renderers validates against report.xsd."""
import shutil
import subprocess

import pytest
import xmlschema

from conftest import ROOT, SCHEMAS


@pytest.fixture(scope="module")
def exports(tmp_path_factory):
    node = shutil.which("node")
    if node is None:
        pytest.fail("Node.js is required to generate fixture exports")
    out = tmp_path_factory.mktemp("exports")
    subprocess.run([node, str(ROOT / "scripts" / "export-fixture.ts"), str(out)], check=True, cwd=ROOT, capture_output=True)
    return out


@pytest.mark.parametrize("name", ["single", "consolidated"])
def test_xml_validates_against_xsd(exports, name):
    schema = xmlschema.XMLSchema(str(SCHEMAS / "report.xsd"))
    schema.validate(str(exports / f"{name}.xml"))


def test_xsd_rejects_tampered_xml(exports, tmp_path):
    schema = xmlschema.XMLSchema(str(SCHEMAS / "report.xsd"))
    text = (exports / "consolidated.xml").read_text(encoding="utf-8").replace('priority="P1"', 'priority="P9"', 1)
    bad = tmp_path / "bad.xml"
    bad.write_text(text, encoding="utf-8")
    assert not schema.is_valid(str(bad))


def test_csv_is_rfc4180_parseable_with_formula_guard(exports):
    import csv
    import io
    raw = (exports / "consolidated.csv").read_bytes().decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(raw, newline="")))
    assert rows and "id" in rows[0]
    notes = [r["remodeling_value"] for r in rows if r["field"] == "note"]
    assert notes and all(n.startswith("'+") for n in notes)
