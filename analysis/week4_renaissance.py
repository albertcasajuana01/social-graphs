"""Generate the JSON payload behind posts/week4-renaissance.html.

Philosophers network (course week-4 snapshot), undirected giant component.
Instead of trusting one Louvain run, we run it 200 times with different seeds
and ask which philosophers keep changing community:

  1. 200 unweighted and 200 weighted Louvain runs (networkx, seeds 0..199).
  2. A consensus partition for each (Lancichinetti & Fortunato 2012): build the
     co-assignment matrix P_ij = share of runs in which i and j share a community,
     keep pairs with P_ij >= 0.5, run Louvain on that consensus graph, repeat
     until the runs agree.
  3. Loyalty of a philosopher = share of the 200 runs in which they land in the
     run-community that maps (by largest overlap) onto their consensus community.
  4. Loyalty and tradition mix per era (the century list each philosopher is on),
     with a permutation test for the least loyal era.
  5. Null model for Q: 20 degree-preserving shuffles.
  6. Disparity-filter backbone (Serrano et al. 2009), implemented from the
     formula; every edge carries its significance so the page can filter by alpha.

Run from this directory (analysis/): python week4_renaissance.py
Writes ../assets/week4_traditions.json  (needs networkx, numpy, pandas, scikit-learn)
"""
from __future__ import annotations

import collections
import json
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.metrics import normalized_mutual_info_score as nmi

RUNS = 200
TAU = 0.5
SHUFFLES = 20
ALPHA_MAX_EXPORT = 0.3
RNG_SEED = 42
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "assets" / "week4_traditions.json"

ERAS = [
    "centuries BC",
    "1st through 10th centuries",
    "11th through 14th centuries",
    "15th and 16th centuries",
    "17th century",
    "18th century",
    "19th century",
]
ERA_SHORT = ["BC", "1st–10th", "11th–14th", "15th–16th", "17th", "18th", "19th"]

# Consensus communities are named after their anchor (highest-degree member);
# the order is the stacking/colour order on the page (roughly chronological).
TRADITIONS = [
    ("Aristotle", "Greek & Roman antiquity"),
    ("The Buddha", "Indian philosophy"),
    ("Confucius", "Chinese philosophy"),
    ("Avicenna", "Islamic & Jewish philosophy"),
    ("Thomas Aquinas", "Christian thought"),
    ("René Descartes", "Early modern & Enlightenment"),
    ("Immanuel Kant", "German philosophy"),
    ("Bertrand Russell", "Founders of the 20th century"),
]

rng = np.random.default_rng(RNG_SEED)

# ---------- load ----------
nodes = pd.read_csv("data/week4_philosophers_nodes.tsv", sep="\t", comment="#")
edges = pd.read_csv("data/week4_philosophers_edges.tsv", sep="\t", comment="#")
name_of = dict(zip(nodes.node_id, nodes.name))
era_of = dict(zip(nodes.node_id, nodes.era))
desc_of = dict(zip(nodes.node_id, nodes.description.fillna("")))
url_of = dict(zip(nodes.node_id, nodes.url))

G = nx.Graph()
for s, t, w in edges.itertuples(index=False):
    if s == t:
        continue
    if G.has_edge(s, t):
        G[s][t]["weight"] += w  # sum both directions
    else:
        G.add_edge(s, t, weight=w)
GC = G.subgraph(max(nx.connected_components(G), key=len)).copy()
N = sorted(GC.nodes())
idx = {v: i for i, v in enumerate(N)}
n = len(N)
degree = dict(GC.degree())
strength = dict(GC.degree(weight="weight"))
era_arr = np.array([era_of[v] for v in N])
print(f"giant component: {n} philosophers, {GC.number_of_edges()} links")


def to_labels(partition):
    lab = np.empty(n, dtype=int)
    for c, members in enumerate(partition):
        for v in members:
            lab[idx[v]] = c
    return lab


def louvain_runs(graph, weight, runs, node_order):
    local = {v: i for i, v in enumerate(node_order)}
    out = []
    for seed in range(runs):
        part = nx.community.louvain_communities(graph, weight=weight, seed=seed)
        lab = np.empty(len(node_order), dtype=int)
        for c, members in enumerate(part):
            for v in members:
                lab[local[v]] = c
        out.append(lab)
    return np.array(out)


def consensus(L, tau=TAU, max_iter=10, runs=20):
    """Lancichinetti & Fortunato consensus clustering on a stack of labelings."""
    for _ in range(max_iter):
        P = np.zeros((n, n))
        for lab in L:
            P += lab[:, None] == lab[None, :]
        P /= len(L)
        if np.all((P > 0.999) | (P < 0.001)):
            break
        C = nx.Graph()
        C.add_nodes_from(range(n))
        ii, jj = np.where(np.triu(P, 1) >= tau)
        C.add_weighted_edges_from(zip(ii, jj, P[ii, jj]))
        L = louvain_runs(C, "weight", runs, list(range(n)))
    return L[0]


def run_membership(L, cons):
    """For each run map every run-community to the consensus community it overlaps
    most; return an (n x K) matrix of the share of runs each node spent in each
    consensus community. Loyalty is the diagonal entry for the node's own one."""
    K = cons.max() + 1
    share = np.zeros((n, K))
    for lab in L:
        mapping = {k: collections.Counter(cons[lab == k]).most_common(1)[0][0] for k in np.unique(lab)}
        mapped = np.array([mapping[x] for x in lab])
        share[np.arange(n), mapped] += 1
    return share / len(L)


def pair_nmi(L, pairs=500):
    vals = []
    while len(vals) < pairs:
        a, b = rng.integers(0, len(L), 2)
        if a != b:
            vals.append(nmi(L[a], L[b]))
    return np.array(vals)


# ---------- 1-2. many runs + consensus ----------
print("running Louvain", RUNS, "x 2 ...")
Lu = louvain_runs(GC, None, RUNS, N)
Lw = louvain_runs(GC, "weight", RUNS, N)
Qu = [nx.community.modularity(GC, [set(np.array(N)[lab == k]) for k in np.unique(lab)], weight=None) for lab in Lu[:50]]
cons_u = consensus(Lu)
cons_w = consensus(Lw)


def relabel_by_anchor(cons):
    """Give each big consensus community its tradition index; tiny leftovers -> -1."""
    out = np.full(n, -1)
    for t, (anchor, _) in enumerate(TRADITIONS):
        aid = next(v for v in N if name_of[v] == anchor)
        out[cons == cons[idx[aid]]] = t
    return out


tu = relabel_by_anchor(cons_u)
tw = relabel_by_anchor(cons_w)
print("unweighted consensus: leftovers", int((tu == -1).sum()), "| weighted leftovers", int((tw == -1).sum()))

share_u = run_membership(Lu, cons_u)
share_w = run_membership(Lw, cons_w)
loyalty = share_u[np.arange(n), cons_u]


def share_by_tradition(share, cons):
    """Collapse the consensus-community columns onto tradition indices (+ 'other')."""
    out = np.zeros((n, len(TRADITIONS) + 1))
    lab = relabel_by_anchor(cons)
    for k in range(share.shape[1]):
        members = np.where(cons == k)[0]
        t = lab[members[0]] if len(members) else -1
        out[:, t if t >= 0 else len(TRADITIONS)] += share[:, k]
    return out


tshare_u = share_by_tradition(share_u, cons_u)

# ---------- the Renaissance bloc: do the flippers move together, and who hosts them? ----------
BLOC = ["Galileo Galilei", "Johannes Kepler", "Giordano Bruno", "Tommaso Campanella", "Bernardino Telesio",
        "Pietro Pomponazzi", "Cesare Cremonini (philosopher)", "Heinrich Cornelius Agrippa", "Sébastien Basson"]
HOSTS = ["Aristotle", "Thomas Aquinas", "Avicenna", "René Descartes"]
bloc_ix = [idx[next(v for v in N if name_of[v] == b)] for b in BLOC]
host_ix = {h: idx[next(v for v in N if name_of[v] == h)] for h in HOSTS}
together = np.array([[np.mean(Lu[:, i] == Lu[:, j]) for j in bloc_ix] for i in bloc_ix])
bloc_pair_mean = (together.sum() - len(bloc_ix)) / (len(bloc_ix) ** 2 - len(bloc_ix))
galileo = bloc_ix[0]
host_counter = collections.Counter(
    " + ".join(h for h, i in host_ix.items() if lab[i] == lab[galileo]) or "none of the four anchors" for lab in Lu
)
print(f"bloc: mean pairwise co-assignment {bloc_pair_mean:.2f}; hosts {host_counter.most_common()}")

# ---------- 3-4. eras ----------
era_rows = []
for e, short in zip(ERAS, ERA_SHORT):
    m = era_arr == e
    counts = [int(((tu == t) & m).sum()) for t in range(len(TRADITIONS))] + [int(((tu == -1) & m).sum())]
    p = np.array([c for c in counts if c]) / m.sum()
    era_rows.append({
        "era": e, "short": short, "n": int(m.sum()), "counts": counts,
        "mean_loyalty": round(float(loyalty[m].mean()), 3),
        "share_below_half": round(float((loyalty[m] < 0.5).mean()), 3),
        "top_share": round(float(p.max()), 3),
        "entropy_bits": round(float(-(p * np.log2(p)).sum()), 3),
    })

ren = era_arr == "15th and 16th centuries"
k_ren = int(ren.sum())
perm = np.array([loyalty[rng.choice(n, k_ren, replace=False)].mean() for _ in range(10000)])
p_perm = float((perm <= loyalty[ren].mean()).mean())
print(f"15th-16th mean loyalty {loyalty[ren].mean():.3f}; permutation p = {p_perm:.4f}")

# ---------- 5. null model ----------
Q_cons = nx.community.modularity(GC, [set(np.array(N)[cons_u == k]) for k in np.unique(cons_u)], weight=None)
null_Q = []
for s in range(SHUFFLES):
    H = GC.copy()
    nx.double_edge_swap(H, nswap=5 * H.number_of_edges(), max_tries=10**7, seed=s)
    null_Q.append(nx.community.modularity(H, nx.community.louvain_communities(H, weight=None, seed=s), weight=None))
null_Q = np.array(null_Q)

# ---------- 6. disparity filter ----------
def disparity_p(u, v, w):
    """Smaller of the two endpoint significances (keep the edge if either < alpha)."""
    ps = []
    for a in (u, v):
        k = degree[a]
        ps.append(1.0 if k <= 1 else (1 - w / strength[a]) ** (k - 1))
    return min(ps)


edge_rows = []
for u, v, d in GC.edges(data=True):
    p = disparity_p(u, v, d["weight"])
    if p < ALPHA_MAX_EXPORT:
        edge_rows.append({"s": idx[u], "t": idx[v], "w": int(d["weight"]), "p": round(p, 5)})

backbone_table = []
for alpha in [0.05, 0.1, 0.2, 0.3]:
    B = nx.Graph()
    B.add_edges_from((N[e["s"]], N[e["t"]]) for e in edge_rows if e["p"] < alpha)
    giant = max(nx.connected_components(B), key=len)
    backbone_table.append({"alpha": alpha, "links": B.number_of_edges(), "attached": B.number_of_nodes(), "giant": len(giant)})
print("backbone", backbone_table)

# ---------- export ----------
wmap = {}  # weighted consensus community -> tradition index by overlap with the unweighted one
for k in np.unique(cons_w):
    wmap[int(k)] = int(collections.Counter(tu[cons_w == k]).most_common(1)[0][0])
tw_mapped = np.array([wmap[int(k)] for k in cons_w])
moved = np.where(tw_mapped != tu)[0]

node_rows = []
for i, v in enumerate(N):
    node_rows.append({
        "id": i, "name": name_of[v], "era": ERA_SHORT[ERAS.index(era_of[v])],
        "deg": degree[v], "str": strength[v], "t": int(tu[i]), "tw": int(tw_mapped[i]),
        "loy": round(float(loyalty[i]), 3),
        "share": [round(float(x), 3) for x in tshare_u[i]],
        "desc": desc_of[v][:160], "url": url_of[v],
    })

traditions = []
for t, (anchor, label) in enumerate(TRADITIONS):
    members = sorted(np.where(tu == t)[0], key=lambda i: -degree[N[i]])
    wmembers = sorted(np.where(tw == t)[0], key=lambda i: -degree[N[i]])
    traditions.append({
        "anchor": anchor, "label": label, "size": len(members), "size_w": len(wmembers),
        "top": [name_of[N[i]] for i in members[:6]],
        "top_w": [name_of[N[i]] for i in wmembers[:6]],
    })

nu, nw = pair_nmi(Lu), pair_nmi(Lw)
payload = {
    "meta": {
        "n": n, "m": GC.number_of_edges(), "runs": RUNS, "tau": TAU,
        "k_counts_u": {int(k): int(c) for k, c in sorted(collections.Counter(len(np.unique(l)) for l in Lu).items())},
        "nmi_u": [round(float(nu.min()), 3), round(float(nu.mean()), 3), round(float(nu.max()), 3)],
        "nmi_w": [round(float(nw.min()), 3), round(float(nw.mean()), 3), round(float(nw.max()), 3)],
        "Q_runs": [round(min(Qu), 3), round(max(Qu), 3)],
        "Q_consensus": round(Q_cons, 3),
        "Q_null": [round(float(null_Q.mean()), 3), round(float(null_Q.std()), 3)],
        "z_Q": round(float((Q_cons - null_Q.mean()) / null_Q.std()), 1),
        "nmi_cons_u_w": round(float(nmi(cons_u, cons_w)), 3),
        "nmi_cons_era": round(float(nmi(cons_u, era_arr)), 3),
        "leftover_u": int((tu == -1).sum()),
        "moved_u_to_w": int(len(moved)),
        "ren_mean_loyalty": round(float(loyalty[ren].mean()), 3),
        "all_mean_loyalty": round(float(loyalty.mean()), 3),
        "perm_p": p_perm,
        "backbone": backbone_table,
        "bloc": BLOC,
        "bloc_pair_mean": round(float(bloc_pair_mean), 3),
        "bloc_hosts": host_counter.most_common(),
    },
    "traditions": traditions,
    "eras": era_rows,
    "nodes": node_rows,
    "edges": edge_rows,
}
OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
print("wrote", OUTPUT_PATH, f"({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
print(json.dumps(payload["meta"], indent=1))
for t in traditions:
    print(t["label"], t["size"], t["size_w"], t["top_w"])
