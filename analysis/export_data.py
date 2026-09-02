"""Exports the JSON data behind the interactive figures in posts/week1-bootstrap.html.

Run from this directory (analysis/): python export_data.py
Writes ../assets/network.json (D3 force-directed graph) and
../assets/degree_data.json (Plotly degree-distribution charts).
"""
import json

import networkx as nx
import numpy as np
import pandas as pd

nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#")
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#", header=None, names=["source", "target"])

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False))
Gu = G.to_undirected(reciprocal=False)

comps = sorted(nx.connected_components(Gu), key=len, reverse=True)
giant, morituri = comps[0], comps[1]
isolates = set().union(*comps[2:])

name_of = dict(zip(nodes.node_id, nodes.name))
desc_of = dict(zip(nodes.node_id, nodes.description))
url_of = dict(zip(nodes.node_id, nodes.url))
in_deg = dict(G.in_degree())
out_deg = dict(G.out_degree())


def comp_of(n):
    if n in giant:
        return "giant"
    if n in morituri:
        return "morituri"
    return "isolate"


def short(text, n=130):
    text = str(text) if pd.notna(text) else ""
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + "…"


# ---------- network.json ----------

node_list = list(G.nodes())
idx_of = {nid: i for i, nid in enumerate(node_list)}

out_nodes = [
    {
        "id": idx_of[nid],
        "nid": nid,
        "name": name_of[nid],
        "desc": short(desc_of.get(nid, "")),
        "url": url_of.get(nid, ""),
        "in": int(in_deg[nid]),
        "out": int(out_deg[nid]),
        "comp": comp_of(nid),
        "outLinks": [idx_of[t] for t in G.successors(nid)],
        "inLinks": [idx_of[s] for s in G.predecessors(nid)],
    }
    for nid in node_list
]

out_edges = []
seen = set()
for u, v in Gu.edges():
    a, b = idx_of[u], idx_of[v]
    s, t = (a, b) if a < b else (b, a)
    if (s, t) in seen:
        continue
    seen.add((s, t))
    su, tu = node_list[s], node_list[t]
    fwd, bwd = G.has_edge(su, tu), G.has_edge(tu, su)
    dirn = "mutual" if (fwd and bwd) else ("st" if fwd else "ts")
    out_edges.append({"s": s, "t": t, "d": dirn})

network = {
    "nodes": out_nodes,
    "edges": out_edges,
    "meta": {
        "n": len(out_nodes),
        "m_dir": G.number_of_edges(),
        "m_undir": len(out_edges),
        "giant": len(giant),
        "morituri": len(morituri),
        "isolates": len(isolates),
    },
}

with open("../assets/network.json", "w") as f:
    json.dump(network, f, separators=(",", ":"))

print(f"network.json: {len(out_nodes)} nodes, {len(out_edges)} edges")

# ---------- degree_data.json ----------

in_deg_arr = np.array([d for _, d in G.in_degree()])
out_deg_arr = np.array([d for _, d in G.out_degree()])
node_order = list(G.nodes())


def scatter(kp1):
    vals, counts = np.unique(kp1, return_counts=True)
    return vals, counts


def top_at_degree(deg_array, k):
    return [name_of[node_order[i]] for i in range(len(deg_array)) if deg_array[i] == k][:5]


def log_bin_edges(max_val, width1_max=7):
    e = list(range(1, width1_max + 1))
    while e[-1] < max_val:
        e.append(e[-1] * 2)
    return np.array(e)


def log_binned(values, width1_max=7):
    values = np.asarray(values)
    e = log_bin_edges(values.max(), width1_max)
    counts, _ = np.histogram(values, bins=e)
    widths = np.diff(e)
    x = np.empty(len(e) - 1)
    for i in range(len(e) - 1):
        span = np.arange(e[i], e[i + 1])
        x[i] = span[0] if len(span) == 1 else np.exp(np.mean(np.log(span)))
    y = counts / widths
    mask = counts > 0
    return x[mask].tolist(), y[mask].tolist()


def general_log_binned_pdf(values, bins=30):
    values = np.asarray(values)
    values = values[values > 0]
    e = np.geomspace(values.min(), values.max(), bins + 1)
    counts, _ = np.histogram(values, bins=e)
    widths = np.diff(e)
    x = np.sqrt(e[:-1] * e[1:])
    y = counts / widths / len(values)
    mask = counts > 0
    return x[mask].tolist(), y[mask].tolist()


out = {}
for label, deg in [("in", in_deg_arr), ("out", out_deg_arr)]:
    kp1 = deg + 1
    vals, counts = scatter(kp1)
    bx, by = log_binned(kp1)
    out[label] = {
        "raw_x": vals.tolist(),
        "raw_y": counts.tolist(),
        "bin_x": bx,
        "bin_y": by,
        "top_examples": {str(int(v)): top_at_degree(deg, int(v) - 1) for v in vals[:12]},
    }

rng = np.random.default_rng(42)
N = 10_000
expo = rng.exponential(scale=5.0, size=N)
alpha, xmin = 2.5, 1.0
u = rng.random(N)
powerlaw = xmin * (1 - u) ** (-1 / (alpha - 1))

ex, ey = general_log_binned_pdf(expo)
px, py = general_log_binned_pdf(powerlaw)
rx, ry = general_log_binned_pdf(in_deg_arr + 1)

out["two_dist"] = {
    "exponential": {"x": ex, "y": ey},
    "powerlaw": {"x": px, "y": py},
    "real_indegree": {"x": rx, "y": ry},
}
out["leaderboard"] = {
    "in": [[name_of[n], int(d)] for n, d in sorted(G.in_degree(), key=lambda p: -p[1])[:5]],
    "out": [[name_of[n], int(d)] for n, d in sorted(G.out_degree(), key=lambda p: -p[1])[:5]],
}

with open("../assets/degree_data.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))

print("degree_data.json written")
