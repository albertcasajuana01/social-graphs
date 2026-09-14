"""Generate the JSON payload behind posts/week2-models.html.

Loads the real week-1 edge list, builds the undirected simple graph, and compares
its degree distribution against two null models pooled over many realizations:
a matched G(n,m) Erdos-Renyi random graph and a Barabasi-Albert graph tuned to the
same edge count. Also fits a power law to the real degree sequence with the
`powerlaw` package and tests it against a log-normal alternative.

Run from this directory (analysis/): python week2_models.py
Writes ../assets/week2_models.json
"""
from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
import powerlaw

REALIZATIONS = 200
RNG_SEED = 42
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "assets" / "week2_models.json"

nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#")
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#", header=None, names=["source", "target"])

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False))
Gu = G.to_undirected(reciprocal=False)
Gu.remove_edges_from(nx.selfloop_edges(Gu))

n = Gu.number_of_nodes()
m = Gu.number_of_edges()
comps = sorted(nx.connected_components(Gu), key=len, reverse=True)
giant = comps[0]
isolates = sum(1 for c in comps if len(c) == 1)
max_degree = max(dict(Gu.degree()).values())

# m_ba tuned so a BA graph on n nodes lands as close as possible to the real edge count m
best_m_ba, best_diff = 1, float("inf")
for candidate in range(1, 15):
    ba_edges = candidate * (n - candidate)
    diff = abs(ba_edges - m)
    if diff < best_diff:
        best_m_ba, best_diff = candidate, diff
m_ba = best_m_ba

rng = np.random.default_rng(RNG_SEED)


def ccdf_from_values(values):
    """P(K >= x) for x in the sorted unique positive values, i.e. an inclusive CCDF."""
    values = np.asarray(values)
    values = values[values > 0]  # CCDF of degree starting at k=1; isolates reported separately
    total = len(values)
    counts = {}
    for v in values:
        counts[int(v)] = counts.get(int(v), 0) + 1
    xs = sorted(counts)
    points = []
    remaining = total
    for x in xs:
        points.append({"x": x, "y": round(remaining / total, 6)})
        remaining -= counts[x]
    return points


def pooled_degrees(generator, realizations):
    pooled = []
    for i in range(realizations):
        g = generator(int(rng.integers(0, 2**31 - 1)))
        pooled.extend(d for _, d in g.degree())
    return pooled


real_degrees = [d for _, d in Gu.degree()]
random_degrees = pooled_degrees(lambda seed: nx.gnm_random_graph(n, m, seed=seed), REALIZATIONS)
ba_degrees = pooled_degrees(lambda seed: nx.barabasi_albert_graph(n, m_ba, seed=seed), REALIZATIONS)

real_ccdf = ccdf_from_values(real_degrees)
random_ccdf = ccdf_from_values(random_degrees)
ba_ccdf = ccdf_from_values(ba_degrees)

# Power-law fit on the real (positive) degree sequence
positive_degrees = np.array([d for d in real_degrees if d > 0])
fit = powerlaw.Fit(positive_degrees, discrete=True, verbose=False)
alpha = float(fit.power_law.alpha)
xmin = float(fit.power_law.xmin)
R_lognormal, p_lognormal = fit.distribution_compare("power_law", "lognormal")
R_exponential, p_exponential = fit.distribution_compare("power_law", "exponential")

fit_xs = sorted(set(int(p["x"]) for p in real_ccdf if p["x"] >= xmin))
# CCDF of a discrete power law P(K>=k) ~ (k/xmin)^-(alpha-1), anchored to match the real curve at xmin
anchor_y = next(p["y"] for p in real_ccdf if p["x"] == int(xmin))
fit_points = [{"x": x, "y": round(anchor_y * (x / xmin) ** (-(alpha - 1)), 6)} for x in fit_xs]

payload = {
    "meta": {
        "n": n,
        "m": m,
        "max_degree": int(max_degree),
        "isolates": int(isolates),
        "giant_component_fraction": round(len(giant) / n, 4),
        "m_ba": m_ba,
        "realizations": REALIZATIONS,
        "alpha": round(alpha, 3),
        "xmin": xmin,
        "p_vs_lognormal": p_lognormal,
        "R_vs_lognormal": R_lognormal,
        "p_vs_exponential": p_exponential,
        "R_vs_exponential": R_exponential,
    },
    "real": real_ccdf,
    "random": random_ccdf,
    "ba": ba_ccdf,
    "fit": fit_points,
}

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(f"Wrote {OUTPUT_PATH}")
print(json.dumps(payload["meta"], indent=2))
