"""Static report figures (SVG). Interactive charts live in the frontend; these are for HTML/PDF reports.

Palette: the validated categorical set (light mode, white surface). Production/canon = slot 1 blue,
development cohort = slot 2 orange, a third cluster = slot 3 aqua, a fourth cluster folds to gray.
The diverging scale is blue <-> red with a neutral gray midpoint and equal OKLab lightness steps.
"""
from __future__ import annotations

import io
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]
FOLD_GRAY = "#898781"
INK, INK2, MUTED, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#ffffff"
MARKERS = ["o", "s", "^", "D"]
BLUE_ARM = ["#184f95", "#3987e5", "#9ec5f4"]
MIDPOINT = "#f0efec"

plt.rcParams.update({
    "svg.hashsalt": "reltroner-statistics",
    "svg.fonttype": "none",
    "font.family": "DejaVu Sans",
    "font.size": 9,
    "axes.edgecolor": AXIS,
    "axes.linewidth": 0.8,
    "axes.labelcolor": INK2,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "axes.grid": True,
    "grid.color": GRID,
    "grid.linewidth": 0.6,
    "grid.linestyle": "-",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
})


def _srgb_to_oklab(hexcolor: str) -> tuple[float, float, float]:
    rgb = [int(hexcolor[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    l = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]
    m = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]
    s = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_)


def _oklab_to_hex(L: float, a: float, b: float) -> str:
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    lin = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    out = []
    for c in lin:
        c = min(max(c, 0.0), 1.0)
        c = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        out.append(round(c * 255))
    return "#" + "".join(f"{v:02x}" for v in out)


def diverging_stops() -> list[str]:
    """Blue arm from the documented ramp; red arm mirrors each step's OKLab L and chroma at the red pole hue."""
    _, ra, rb = _srgb_to_oklab("#e34948")
    red_hue = math.atan2(rb, ra)
    red = []
    for h in BLUE_ARM:
        L, a, b = _srgb_to_oklab(h)
        c = math.hypot(a, b)
        red.append(_oklab_to_hex(L, c * math.cos(red_hue), c * math.sin(red_hue)))
    return [*BLUE_ARM, MIDPOINT, *reversed(red)]


def _save(fig, path: Path) -> bytes:
    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", metadata={"Date": None, "Creator": None})
    plt.close(fig)
    data = buf.getvalue().encode("utf-8")
    path.write_bytes(data)
    return data


def _label_points(ax, xs, ys, labels, fig):
    """Greedy direct labels: try right/left/above/below; skip a label that would collide."""
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    placed = []
    offsets = [(6, 0, "left", "center"), (-6, 0, "right", "center"), (0, 7, "center", "bottom"), (0, -7, "center", "top")]
    order = sorted(range(len(labels)), key=lambda i: labels[i])
    for i in order:
        for dx, dy, ha, va in offsets:
            t = ax.annotate(labels[i], (xs[i], ys[i]), xytext=(dx, dy), textcoords="offset points", ha=ha, va=va, fontsize=7.5, color=INK2)
            bb = t.get_window_extent(renderer=renderer).expanded(1.05, 1.15)
            if not any(bb.overlaps(p) for p in placed) and ax.bbox.contains(bb.x0, bb.y0) and ax.bbox.contains(bb.x1, bb.y1):
                placed.append(bb)
                break
            t.remove()


def _footer(fig, text: str):
    fig.text(0.0, -0.02, text, fontsize=7, color=MUTED, ha="left", va="top", transform=fig.transFigure)


def scatter_sdi_gdp(matrix_all, entities, footer: str, path: Path) -> bytes:
    names = dict(zip(entities["id"], entities["name"]))
    cohort = dict(zip(entities["id"], entities["cohort"]))
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    xs_all, ys_all, labels = [], [], []
    for slot, (key, label) in enumerate([("PROFILED_14", "Profiled nations (14)"), ("DEVELOPMENT_5", "Development nations (5)")]):
        rows = matrix_all[[cohort.get(e) == key for e in matrix_all.index]][["gdp_per_capita", "sdi"]].dropna()
        ax.scatter(rows["gdp_per_capita"], rows["sdi"], s=46, c=SERIES[slot], marker=MARKERS[slot], edgecolors=SURFACE, linewidths=1.6, label=label, zorder=3)
        xs_all += rows["gdp_per_capita"].tolist(); ys_all += rows["sdi"].tolist(); labels += [names[e] for e in rows.index]
    ax.set_xscale("log")
    ax.set_xlabel("GDP per capita (USD per sentient, log scale)")
    ax.set_ylabel("Sentient Development Index")
    ax.set_title("SDI against GDP per capita, Year 0", loc="left", fontsize=11, color=INK, pad=10)
    ax.legend(frameon=False, loc="lower right", fontsize=8, labelcolor=INK2)
    _label_points(ax, xs_all, ys_all, labels, fig)
    _footer(fig, footer)
    return _save(fig, path)


def correlation_heatmap(corr: dict, labels_by_id: dict, footer: str, path: Path) -> bytes:
    feats = corr["features"]
    mat = [[(v if v is not None else float("nan")) for v in row] for row in corr["spearman"]]
    cmap = LinearSegmentedColormap.from_list("rs_diverging", diverging_stops())
    fig, ax = plt.subplots(figsize=(7.2, 6.4))
    im = ax.imshow(mat, cmap=cmap, vmin=-1, vmax=1)
    ax.grid(False)
    names = [labels_by_id.get(f, f) for f in feats]
    ax.set_xticks(range(len(feats)), names, rotation=55, ha="right", fontsize=7.5)
    ax.set_yticks(range(len(feats)), names, fontsize=7.5)
    for i in range(len(feats)):
        for j in range(len(feats)):
            v = corr["spearman"][i][j]
            if v is not None and i != j and abs(v) >= 0.7:
                ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=6.5, color="#ffffff" if abs(v) >= 0.85 else INK)
    ax.set_xticks([x - 0.5 for x in range(1, len(feats))], minor=True)
    ax.set_yticks([y - 0.5 for y in range(1, len(feats))], minor=True)
    ax.grid(which="minor", color=SURFACE, linewidth=2)
    ax.tick_params(which="minor", length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    cb = fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02)
    cb.outline.set_visible(False)
    cb.set_label("Spearman ρ (|ρ| ≥ 0.70 labeled)", color=INK2, fontsize=8)
    ax.set_title(f"Rank correlation across {corr['n']} profiled nations", loc="left", fontsize=11, color=INK, pad=10)
    _footer(fig, footer)
    return _save(fig, path)


def cluster_scatter(clustering: dict, names: dict, footer: str, path: Path) -> bytes | None:
    if clustering["status"] != "COMPUTED" or not clustering["kmeans"]["recommended_k"]:
        return None
    k = clustering["kmeans"]["recommended_k"]
    run = next(x for x in clustering["kmeans"]["runs"] if x["k"] == k)
    label = {x["entity_id"]: x["cluster"] for x in run["labels"]}
    coords = clustering["pca"]["coordinates"]
    evr = clustering["pca"]["explained_variance_ratio"]
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    xs, ys, labels = [], [], []
    for c in range(k):
        pts = [p for p in coords if label[p["entity_id"]] == c]
        color = SERIES[c] if c < len(SERIES) else FOLD_GRAY
        ax.scatter([p["pc1"] for p in pts], [p["pc2"] for p in pts], s=50, c=color, marker=MARKERS[c % len(MARKERS)], edgecolors=SURFACE, linewidths=1.6,
                   label=f"Cluster {c + 1} ({len(pts)})", zorder=3)
        xs += [p["pc1"] for p in pts]; ys += [p["pc2"] for p in pts]; labels += [names[p["entity_id"]] for p in pts]
    ax.set_xlabel(f"PC1 ({evr[0] * 100:.1f}% of variance)")
    ax.set_ylabel(f"PC2 ({evr[1] * 100:.1f}% of variance)")
    sil = run["silhouette"]
    ax.set_title(f"K-Means k={k} (silhouette {sil:.2f}) on standardized features, PCA projection", loc="left", fontsize=11, color=INK, pad=10)
    ax.legend(frameon=False, fontsize=8, labelcolor=INK2, loc="best")
    _label_points(ax, xs, ys, labels, fig)
    _footer(fig, footer)
    return _save(fig, path)


def historical_anchors(points: list[tuple[int, float]], footer: str, path: Path) -> bytes | None:
    if len(points) < 2:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    xs = [-y for y, _ in points]
    ys = [v * 100 for _, v in points]
    ax.scatter(xs, ys, s=60, c=SERIES[0], edgecolors=SURFACE, linewidths=1.8, zorder=3)
    for x, y, (bac, _) in zip(xs, ys, points):
        ax.annotate(f"{y:.0f}%  ·  {'Year 0' if bac == 0 else f'{bac} BAC'}", (x, y), xytext=(0, 9), textcoords="offset points", ha="center", fontsize=8, color=INK)
    lo = min(xs) - 60
    ax.set_xlim(lo, 40)
    ticks = [t for t in range(0, int(-lo) + 1, 100)]
    ax.set_xticks([-t for t in ticks], ["Year 0" if t == 0 else f"{t}" for t in ticks])
    ax.set_xlabel("Years before Year 0 (BAC)")
    ax.set_ylabel("Real GDP growth (%)")
    ax.set_ylim(0, max(ys) * 1.3)
    ax.set_title("Planetary real GDP growth: canonical anchors only", loc="left", fontsize=11, color=INK, pad=10)
    ax.text(0.01, 0.04, "No observations between anchors. Values are not interpolated.", transform=ax.transAxes, fontsize=7.5, color=INK2)
    _footer(fig, footer)
    return _save(fig, path)
