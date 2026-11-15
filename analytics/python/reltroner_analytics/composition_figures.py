"""Deterministic Matplotlib figures for primary ancestry and Spatial 3D composition.

Input: the composition artifact (reltroner-composition.v2), validated against its JSON Schema.
Output: one light and one dark SVG per figure (``<id>.svg`` and ``<id>-dark.svg``), drawn with the
validated categorical palette of the site (fixed category order; gray only for "Other").

Every figure keeps its own denominator: ancestry and habitat shares are of unique residents, surface
shares are of national terrestrial land. Ancestry figures cite production main; spatial figures
cite remodeling main and say that it is not published production canon. Text is converted to
paths so the figures render identically on every client, and the output carries no timestamp.
"""
from __future__ import annotations

import argparse
import json
import math
import textwrap
from pathlib import Path

import jsonschema
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams.update({
    "svg.hashsalt": "reltroner-composition-v2",
    "svg.fonttype": "path",
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.spines.top": False,
    "axes.spines.right": False,
})

THEMES = {
    "light": {
        "surface": "#ffffff", "ink": "#0b0b0b", "ink2": "#52514e", "grid": "#e6e9ef", "axis": "#c3c2b7",
        "series": ["#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#008300"], "other": "#898781",
    },
    "dark": {
        "surface": "#0b1a33", "ink": "#eef5ff", "ink2": "#c2d2ea", "grid": "#1b2d4d", "axis": "#34496c",
        "series": ["#3987e5", "#199e70", "#c98500", "#d55181", "#0ca30c"], "other": "#898781",
    },
}
SUFFIX = {"light": "", "dark": "-dark"}


def colors(rows: list[dict], theme: dict) -> list[str]:
    """Fixed order: categorical slots by position; the 'other' category always takes the fold gray."""
    out, slot = [], 0
    for r in rows:
        if r["key"] == "other":
            out.append(theme["other"])
        else:
            out.append(theme["series"][slot])
            slot += 1
    return out


def ink_on(hex_color: str) -> str:
    """Black or white text, whichever has the higher contrast against the fill."""
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    return "#0b0b0b" if (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) else "#ffffff"


def number(v: float, places: int = 2) -> str:
    return f"{v:,.{places}f}"


def percent(v: float, places: int = 2) -> str:
    """Display rounding only: at most `places` decimals, trailing zeros removed (the data keeps full precision)."""
    return f"{round(v, places):.{places}f}".rstrip("0").rstrip(".") + "%"


def wrapped(note: str, width: int) -> str:
    return chr(10).join(textwrap.wrap(note, width=width, break_long_words=False, break_on_hyphens=False))


def save(fig, path: Path, theme: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, format="svg", bbox_inches="tight", pad_inches=0.18, metadata={"Date": None, "Creator": None}, facecolor=theme["surface"])
    plt.close(fig)


def pie(rows: list[dict], value_key: str, unit: str, title: str, note: str, theme: dict, path: Path) -> None:
    fills = colors(rows, theme)
    fig = plt.figure(figsize=(6.4, 6.6), facecolor=theme["surface"])
    ax = fig.add_axes((0.14, 0.4, 0.72, 0.5))
    ax.set_facecolor(theme["surface"])
    values = [r["pct"] for r in rows]
    wedges, _ = ax.pie(values, startangle=90, counterclock=False, colors=fills,
                       wedgeprops={"edgecolor": theme["surface"], "linewidth": 2})
    for w, r, fill in zip(wedges, rows, fills):
        if r["pct"] >= 6:
            angle = math.radians((w.theta1 + w.theta2) / 2)
            ax.text(0.66 * math.cos(angle), 0.66 * math.sin(angle), percent(r["pct"], 1), ha="center", va="center", fontsize=10.5, fontweight="bold", color=ink_on(fill))
    ax.set_aspect("equal")
    fig.text(0.04, 0.95, title, fontsize=14, fontweight="bold", color=theme["ink"], ha="left", va="top")
    legend = ax.legend(
        wedges,
        [f"{r['label']}  ·  {percent(r['pct'])}" + ("" if r.get(value_key) is None else f"  ·  {number(r[value_key])} {unit}") for r in rows],
        loc="upper left", bbox_to_anchor=(-0.18, -0.02), frameon=False, fontsize=10.5, labelcolor=theme["ink"], handlelength=1.1, handleheight=1.1, borderaxespad=0,
    )
    legend.set_in_layout(True)
    fig.text(0.04, 0.03, wrapped(note, 104), fontsize=8.6, color=theme["ink2"], ha="left", va="bottom", linespacing=1.35)
    save(fig, path, theme)


def stacked(countries: list[dict], field: str, value_key: str | None, title: str, axis_label: str, note: str, theme: dict, path: Path) -> bool:
    rows = [c for c in countries if c[field]]
    if not rows:
        return False
    rows.sort(key=lambda c: (-c["population_billion"], c["name"]))
    categories = rows[0][field]
    fills = colors(categories, theme)
    fig, ax = plt.subplots(figsize=(10.2, 0.42 * len(rows) + 2.6), facecolor=theme["surface"])
    ax.set_facecolor(theme["surface"])
    left = [0.0] * len(rows)
    for i, category in enumerate(categories):
        values = []
        for country in rows:
            match = next((r for r in country[field] if r["key"] == category["key"]), None)
            if match is None:
                raise ValueError(f"Inconsistent category vector in {country['name']}")
            value = match["pct"] if value_key is None else match[value_key]
            if value is None:
                raise ValueError(f"Missing denominator for an assigned vector in {country['name']}")
            values.append(value)
        bars = ax.barh(range(len(rows)), values, left=left, color=fills[i], height=0.68, label=category["label"], edgecolor=theme["surface"], linewidth=1.6)
        if value_key is None:
            for bar, v in zip(bars, values):
                if v >= 11:
                    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_y() + bar.get_height() / 2, percent(v, 1).rstrip("%"), ha="center", va="center", fontsize=8.6, color=ink_on(fills[i]))
        left = [a + b for a, b in zip(left, values)]
    if value_key is not None:
        span = max(left)
        for y, total in enumerate(left):
            ax.text(total + span * 0.01, y, number(total), va="center", ha="left", fontsize=8.6, color=theme["ink2"])
        ax.set_xlim(0, span * 1.12)
    else:
        ax.set_xlim(0, 100)
    ax.invert_yaxis()
    ax.set_yticks(range(len(rows)), [c["name"] for c in rows], fontsize=9.5, color=theme["ink"])
    ax.tick_params(axis="x", colors=theme["ink2"], labelsize=9)
    ax.tick_params(axis="y", length=0)
    ax.set_xlabel(axis_label, color=theme["ink2"], fontsize=9.5)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color(theme["axis"])
    ax.grid(axis="x", color=theme["grid"], linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_title(title, fontsize=13, fontweight="bold", loc="left", pad=34, color=theme["ink"])
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=min(len(categories), 3), frameon=False, fontsize=9, labelcolor=theme["ink"], handlelength=1.1, borderaxespad=0.3)
    fig.text(0.01, 0.0, wrapped(note, 190), fontsize=8, color=theme["ink2"], ha="left", va="top", linespacing=1.35)
    fig.tight_layout()
    save(fig, path, theme)
    return True


def generate(data: dict, out: Path) -> list[str]:
    prod = data["sources"]["production"]
    draft = data["sources"]["remodeling"]
    prod_cite = f"Source: {prod['repository']}@{prod['commit_sha'][:12]} · {prod['path']} · production main · Year 0"
    draft_cite = (f"Source: {draft['repository']}@{draft['commit_sha'][:12]} · {draft['path']} · remodeling main, "
                  "creator-ratified in remodeling, not published production canon · Year 0") if draft else ""
    planet = data["ancestry"]["planet"]
    ancestry = data["ancestry"]["countries"]
    spatial = data["spatial"]["countries"]
    written: list[str] = []

    def emit(fig_id: str, draw) -> None:
        for name, theme in THEMES.items():
            if draw(theme, out / f"{fig_id}{SUFFIX[name]}.svg") is not False:
                written.append(f"{fig_id}{SUFFIX[name]}")

    emit("species-planet", lambda t, p: pie(planet["rows"], "absolute_billion", "B", "Asthortera · primary ancestry",
         f"Creator-ratified representative benchmark of the 14 profiled nations (reference {planet['reference_population_billion']:g} B), "
         f"not a census of all {planet['sovereign_states']} states. Headcounts: share × {number(planet['population_billion'], 0)} B. "
         f"Primary ancestry is not a biological species taxonomy. {prod_cite}", t, p))
    for c in ancestry:
        if c["status"] != "ASSIGNED":
            continue
        slug = c["id"].split(":")[1]
        emit(f"species-country-{slug}", lambda t, p, c=c: pie(c["rows"], "absolute_billion", "B", f"{c['name']} · primary ancestry",
             f"Share of {number(c['population_billion'])} B unique residents; billions = population × share / 100. {prod_cite}", t, p))
    emit("species-stacked-percent", lambda t, p: stacked(ancestry, "rows", None, "Primary ancestry · share of each national population",
         "Percent of unique national residents", f"Nations without assigned shares are omitted, not zero. {prod_cite}", t, p))
    emit("species-stacked-billions", lambda t, p: stacked(ancestry, "rows", "absolute_billion", "Primary ancestry · residents (billion)",
         "Billion unique residents (population × share / 100)", f"Bar end = national population. Nations without assigned shares are omitted, not zero. {prod_cite}", t, p))
    for c in spatial:
        slug = c["id"].split(":")[1]
        if c["surface_status"] == "ASSIGNED":
            area = "" if c["land_area_million_km2"] is None else f"{number(c['land_area_million_km2'])} million km² of"
            emit(f"spatial-surface-{slug}", lambda t, p, c=c, area=area: pie(c["surface"], "area_million_km2", "M km²", f"{c['name']} · terrestrial surface footprint",
                 f"Share of {area} national terrestrial land, not built or habitable volume. {draft_cite}", t, p))
        if c["habitat_status"] == "ASSIGNED":
            emit(f"spatial-habitat-{slug}", lambda t, p, c=c: pie(c["habitats"], "absolute_billion", "B", f"{c['name']} · principal home habitats",
                 f"Share of {number(c['population_billion'])} B unique usual residents, not land area or urbanization. {draft_cite}", t, p))
    emit("spatial-surface-percent", lambda t, p: stacked(spatial, "surface", None, "Terrestrial surface footprint · share of national land",
         "Percent of national terrestrial land area", f"Not built, constructed or habitable km³. {draft_cite}", t, p))
    emit("spatial-surface-area", lambda t, p: stacked(spatial, "surface", "area_million_km2", "Terrestrial surface footprint · area (million km²)",
         "Million km² of national terrestrial land (land area × share / 100)", f"Bar end = national land area in the remodeling record. {draft_cite}", t, p))
    emit("spatial-habitat-percent", lambda t, p: stacked(spatial, "habitats", None, "Principal home habitats · share of unique residents",
         "Percent of unique usual residents", f"Resident shares are not urbanization and not land area. {draft_cite}", t, p))
    emit("spatial-habitat-residents", lambda t, p: stacked(spatial, "habitats", "absolute_billion", "Principal home habitats · residents (billion)",
         "Billion unique usual residents (population × share / 100)", f"Bar end = national population in the remodeling record. {draft_cite}", t, p))
    return written


SHARE_TOLERANCE = 1e-4


def check_closure(data: dict) -> None:
    """Every assigned share vector closes to 100% (a rule JSON Schema cannot express)."""
    vectors = [("planet ancestry", data["ancestry"]["planet"]["rows"])]
    vectors += [(f"{c['name']} ancestry", c["rows"]) for c in data["ancestry"]["countries"]]
    for c in data["spatial"]["countries"]:
        vectors += [(f"{c['name']} surface", c["surface"]), (f"{c['name']} habitats", c["habitats"])]
    for label, rows in vectors:
        if rows and abs(sum(r["pct"] for r in rows) - 100) > SHARE_TOLERANCE:
            raise SystemExit(f"composition input violates the share closure rule: {label} sums to {sum(r['pct'] for r in rows)}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="reltroner_analytics.composition_figures")
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--charts-dir", required=True, type=Path)
    ap.add_argument("--schemas", type=Path, default=None)
    args = ap.parse_args(argv)
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if args.schemas is not None:
        schema = json.loads((args.schemas / "composition.schema.json").read_text(encoding="utf-8"))
        errors = sorted(jsonschema.Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path))
        if errors:
            raise SystemExit(f"composition input violates composition.schema.json: {'/'.join(map(str, errors[0].path))}: {errors[0].message[:300]}")
    elif data.get("schema_version") != "reltroner-composition.v2":
        raise SystemExit("Unexpected composition contract")
    check_closure(data)
    written = generate(data, args.charts_dir)
    print(json.dumps({"status": "COMPOSITION_MATPLOTLIB_GENERATED", "figure_count": len(written)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
