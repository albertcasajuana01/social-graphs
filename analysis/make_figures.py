"""Regenerates the two network figures used in the week-1 post.

Run from this directory (analysis/): python make_figures.py
Writes ../assets/giant-component.png and ../assets/morituri-island.png
"""
import pandas as pd
import networkx as nx
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#")
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#",
                     header=None, names=["source", "target"])
name_of = dict(zip(nodes.node_id, nodes.name))

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False))
Gu = G.to_undirected(reciprocal=False)

comps = sorted(nx.connected_components(Gu), key=len, reverse=True)
giant, morituri = comps[0], comps[1]
in_deg = dict(G.in_degree())

# --- giant component ---
fig, ax = plt.subplots(figsize=(12, 12), facecolor="#0b0e14")
ax.set_facecolor("#0b0e14")
pos = nx.spring_layout(Gu.subgraph(giant), seed=7, k=0.22, iterations=100)
sizes = [35 + 20 * np.sqrt(in_deg[n]) for n in giant]
colors = [in_deg[n] for n in giant]
nx.draw_networkx_edges(Gu.subgraph(giant), pos, ax=ax, edge_color="#3a4a63", width=0.55, alpha=0.55)
nodes_artist = nx.draw_networkx_nodes(
    Gu.subgraph(giant), pos, ax=ax, node_size=sizes, node_color=colors,
    cmap="plasma", linewidths=0.3, edgecolors="#0b0e14",
)
ax.set_title("The Marvel superhero web — giant component (277 of 303 characters)",
              color="white", fontsize=15, pad=14)
ax.axis("off")
cbar = plt.colorbar(nodes_artist, ax=ax, fraction=0.03, pad=0.02)
cbar.set_label("in-degree", color="white")
cbar.ax.yaxis.set_tick_params(color="white")
plt.setp(plt.getp(cbar.ax.axes, "yticklabels"), color="white")
plt.tight_layout()
plt.savefig("../assets/giant-component.png", dpi=150, facecolor="#0b0e14")
plt.close(fig)

# --- Morituri island ---
fig2, ax2 = plt.subplots(figsize=(5, 5), facecolor="#0b0e14")
ax2.set_facecolor("#0b0e14")
sub = Gu.subgraph(morituri)
pos2 = nx.spring_layout(sub, seed=3)
nx.draw_networkx_edges(sub, pos2, ax=ax2, edge_color="#6c63ff", width=1.2)
nx.draw_networkx_nodes(sub, pos2, ax=ax2, node_size=260, node_color="#6c63ff")
for n in sub.nodes():
    x, y = pos2[n]
    ax2.text(x, y + 0.08, name_of[n], fontsize=8, color="white", ha="center")
ax2.set_title("The Morituri island (9 nodes, cut off\nfrom the rest of the universe)",
               color="white", fontsize=11)
ax2.axis("off")
plt.tight_layout()
plt.savefig("../assets/morituri-island.png", dpi=150, facecolor="#0b0e14")
plt.close(fig2)

print("wrote ../assets/giant-component.png and ../assets/morituri-island.png")
