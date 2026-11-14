"""Deterministic Matplotlib figures for NCCM V6.5 ancestry and spatial composition.
No fictional interpolation. Planet ancestry is labeled as a representative benchmark.
Area-footprint and primary-habitat charts always keep their distinct denominators.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import math

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({
    "svg.hashsalt": "reltroner-composition-v1",
    "svg.fonttype": "none",
    "font.family": "DejaVu Sans",
    "font.size": 9,
    "figure.facecolor": "#ffffff",
    "axes.facecolor": "#ffffff",
    "axes.spines.top": False,
    "axes.spines.right": False,
})
COLORS = ["#2a78d6", "#17a6a3", "#e3a345", "#885fcd", "#d45c80", "#88919c"]
LAND_COLORS = ["#209679", "#2685ce", "#e2ac55", "#9a85b8"]


def save(fig, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, format="svg", bbox_inches="tight", metadata={"Date": None, "Creator": None}, facecolor="white")
    plt.close(fig)


def pie(rows: list[dict], title: str, note: str, colors: list[str], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8.1, 5.15))
    values = [r["pct"] for r in rows]
    wedges, _ = ax.pie(values, startangle=90, counterclock=False,
                       colors=colors[:len(rows)], wedgeprops={"edgecolor": "white", "linewidth": 1.1})
    ax.legend(wedges, [r["label"] + " · " + format(r["pct"], ".2f").rstrip("0").rstrip(".") + "%" for r in rows],
              loc="center left", bbox_to_anchor=(1, 0.5), frameon=False, fontsize=8.1)
    ax.set_title(title, fontsize=12, loc="left", pad=15)
    fig.text(0.5, 0.015, note, ha="center", va="bottom", fontsize=7.4, color="#52514e", wrap=True)
    save(fig, path)


def stacked(countries: list[dict], field: str, title: str, metric: str, path: Path) -> None:
    rows = [c for c in countries if c[field]]
    rows.sort(key=lambda c: (-c["population_billion"], c["name"]))
    if not rows:
        return
    categories = rows[0][field]
    colors = LAND_COLORS if field == "surface" or field == "habitats" else COLORS
    fig, ax = plt.subplots(figsize=(10.1, max(5.0, 0.39 * len(rows) + 1.8)))
    cursor = [0.0] * len(rows)
    for i, category in enumerate(categories):
        values = []
        for country in rows:
            match = next((r for r in country[field] if r["key"] == category["key"]), None)
            if not match:
                raise ValueError("Inconsistent category vector: " + country["name"])
            if metric == "pct":
                value = match["pct"]
            elif field == "surface":
                value = match["area_million_km2"]
            else:
                value = match["absolute_billion"]
            if value is None:
                raise ValueError("Missing land area for assigned spatial composition: " + country["name"])
            values.append(value)
        ax.barh(range(len(rows)), values, left=cursor, color=colors[i],
                height=0.66, label=category["label"], linewidth=0)
        cursor = [a + b for a, b in zip(cursor, values)]
    ax.invert_yaxis()
    ax.set_yticks(range(len(rows)), [c["name"] for c in rows], fontsize=8)
    ax.set_xlabel("Percent of national denominator" if metric == "pct" else
                  ("Million km² of national terrestrial land" if field == "surface" else "Billion unique residents"))
    ax.set_title(title, fontsize=11, loc="left", pad=12)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.08), ncol=min(3, len(categories)),
              frameon=False, fontsize=8)
    ax.grid(axis="x", color="#e0e2e5", linewidth=0.7, alpha=0.7)
    ax.set_axisbelow(True)
    if metric == "pct":
        ax.set_xlim(0, 100)
    fig.tight_layout()
    save(fig, path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--charts-dir", required=True, type=Path)
    args = ap.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if data.get("schema_version") != "reltroner-composition.v1":
        raise SystemExit("Unexpected composition contract")
    output = args.charts_dir
    countries = data["countries"]
    source = "Source: " + data["source"]["repository"] + "@" + data["source"]["commit_sha"][:12] + " · NCCM V6.5 Year 0"
    pie(data["planet"]["ancestry"], "Asthortera · primary ancestry",
        "Creator-ratified representative 14-country benchmark; NOT a measured 37-country census. " + source,
        COLORS, output / "species-planet.svg")
    for country in countries:
        slug = country["id"].split(":")[-1]
        if country["ancestry_status"] == "ASSIGNED":
            pie(country["ancestry"], country["name"] + " · primary ancestry",
                "Denominator: unique national residents · " + source,
                COLORS, output / ("species-country-" + slug + ".svg"))
        if country["surface_status"] == "ASSIGNED":
            pie(country["surface"], country["name"] + " · terrestrial surface footprint",
                "Denominator: national terrestrial land area; NOT constructed km³ · " + source,
                LAND_COLORS, output / ("spatial-surface-" + slug + ".svg"))
        if country["habitat_status"] == "ASSIGNED":
            pie(country["habitats"], country["name"] + " · primary home habitats",
                "Denominator: unique national residents; NOT surface area or urbanization · " + source,
                LAND_COLORS, output / ("spatial-habitat-" + slug + ".svg"))
    stacked(countries, "ancestry", "Primary ancestry · cross-country shares", "pct",
            output / "species-stacked-percent.svg")
    stacked(countries, "ancestry", "Primary ancestry · absolute population", "absolute",
            output / "species-stacked-billions.svg")
    stacked(countries, "surface", "Terrestrial footprint · cross-country shares", "pct",
            output / "spatial-surface-percent.svg")
    stacked(countries, "surface", "Terrestrial footprint · quantitative area", "absolute",
            output / "spatial-surface-area.svg")
    stacked(countries, "habitats", "Primary home habitats · national shares", "pct",
            output / "spatial-habitat-percent.svg")
    stacked(countries, "habitats", "Primary home habitats · residents", "absolute",
            output / "spatial-habitat-residents.svg")
    files = sorted(p.name for p in output.glob("*.svg") if p.name.startswith(("species-", "spatial-")))
    print(json.dumps({"status": "COMPOSITION_MATPLOTLIB_GENERATED", "figure_count": len(files)}))


if __name__ == "__main__":
    main()
