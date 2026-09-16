"""Generate the JSON payload behind posts/week3-robustness.html.

Loads the real week-1 edge list, builds the undirected simple graph, and asks the
classic attack-tolerance question: does removing nodes in order of centrality
fragment the network faster than removing them at random? Three removal orders
are simulated on the giant component: static betweenness-centrality rank, static
degree rank, and random order (averaged over many trials). Also reports whether
the single node whose removal fragments the network the most is the same node
that tops the betweenness ranking.

Run from this directory (analysis/): python week3_robustness.py
Writes ../assets/week3_robustness.json
"""
from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd

RANDOM_TRIALS = 200
RNG_SEED = 42
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "assets" / "week3_robustness.json"

nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#")
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#", header=None, names=["source", "target"])

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False))
Gu = G.to_undirected(reciprocal=False)
Gu.remove_edges_from(nx.selfloop_edges(Gu))

name_of = dict(zip(nodes.node_id, nodes.name))

comps = sorted(nx.connected_components(Gu), key=len, reverse=True)
giant_nodes = comps[0]
GC = Gu.subgraph(giant_nodes).copy()
n_gc = GC.number_of_nodes()

betweenness = nx.betweenness_centrality(GC)
degree = dict(GC.degree())

bet_order = sorted(GC.nodes(), key=lambda v: -betweenness[v])
deg_order = sorted(GC.nodes(), key=lambda v: -degree[v])

rng = np.random.default_rng(RNG_SEED)


def giant_fraction_curve(order):
    """Fraction of the original giant-component size remaining in its largest
    surviving piece, after removing 0, 1, 2, ... nodes in `order`."""
    H = GC.copy()
    fractions = [1.0]
    for node in order:
        H.remove_node(node)
        if H.number_of_nodes() == 0:
            fractions.append(0.0)
            continue
        largest = len(max(nx.connected_components(H), key=len))
        fractions.append(largest / n_gc)
    return fractions


bet_curve = giant_fraction_curve(bet_order)
deg_curve = giant_fraction_curve(deg_order)

random_curves = []
node_list = list(GC.nodes())
for _ in range(RANDOM_TRIALS):
    order = rng.permutation(node_list).tolist()
    random_curves.append(giant_fraction_curve(order))
random_mean = np.mean(random_curves, axis=0).tolist()

# Single-node fragmentation impact: drop in giant-component fraction after
# removing just that one node (bigger drop = more fragmenting).
impact = {}
for node in node_list:
    H = GC.copy()
    H.remove_node(node)
    largest = len(max(nx.connected_components(H), key=len)) if H.number_of_nodes() else 0
    impact[node] = 1.0 - largest / n_gc

impact_rank = sorted(node_list, key=lambda v: -impact[v])
bet_rank_of = {v: i + 1 for i, v in enumerate(bet_order)}
deg_rank_of = {v: i + 1 for i, v in enumerate(deg_order)}

top_fragmenters = [
    {
        "name": name_of[v],
        "impact": round(impact[v], 4),
        "betweenness_rank": bet_rank_of[v],
        "degree_rank": deg_rank_of[v],
    }
    for v in impact_rank[:10]
]

top_betweenness = [
    {"name": name_of[v], "betweenness": round(betweenness[v], 5), "degree": degree[v]}
    for v in bet_order[:10]
]

payload = {
    "meta": {
        "n_giant": n_gc,
        "random_trials": RANDOM_TRIALS,
        "top_fragmenter": name_of[impact_rank[0]],
        "top_betweenness_node": name_of[bet_order[0]],
        "same_node": impact_rank[0] == bet_order[0],
    },
    "curves": {
        "x": list(range(n_gc + 1)),
        "betweenness_attack": bet_curve,
        "degree_attack": deg_curve,
        "random_failure": random_mean,
    },
    "top_fragmenters": top_fragmenters,
    "top_betweenness": top_betweenness,
}

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(f"Wrote {OUTPUT_PATH}")
print(json.dumps(payload["meta"], indent=2))
print("\nTop fragmenters:")
for row in top_fragmenters:
    print(row)
print("\nTop betweenness:")
for row in top_betweenness:
    print(row)
