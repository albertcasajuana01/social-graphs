"""Week 5: Wikipedia copying itself.

Find passages that appear word-for-word on two Marvel character pages, build the
"copying network" from them, and compare it to the link network.

Writes ../assets/week5_copying.json. Needs networkx, numpy, pandas.
"""
import collections
import itertools
import json
import re
import urllib.parse
import zipfile

import networkx as nx
import numpy as np
import pandas as pd

N = 8                 # shingle length (tokens)
MAX_PAGES = 5         # an 8-gram on more pages than this is boilerplate, not copying
MIN_PASSAGE = 12      # shortest shared run (tokens) we count as a copied passage
MIN_EDGE = 30         # copied tokens needed before two pages count as "copying"
PARAGRAPH = 40        # a pair whose longest shared run reaches this is a copied paragraph, not a stock phrase
CUT = ("References", "External links", "See also", "Notes", "Further reading", "Bibliography", "Sources")
CANON = {   # top-level headings (plain text loses heading levels, so anything else is a subsection)
    "Publication history": "Publication history", "Publishing history": "Publication history",
    "Creation": "Creation", "Development": "Creation", "Concept and creation": "Creation",
    "Conception and creation": "Creation", "Artistic conception": "Creation",
    "Fictional character biography": "Fictional character biography", "Character history": "Fictional character biography",
    "Biography": "Fictional character biography", "Mainstream versions": "Fictional character biography",
    "Powers and abilities": "Powers and abilities", "Abilities": "Powers and abilities",
    "Characterization": "Characterization", "Personality": "Characterization",
    "Supporting characters": "Supporting characters", "Enemies": "Supporting characters",
    "Other versions": "Other versions", "Alternate versions": "Other versions",
    "In other media": "In other media", "Merchandise": "In other media",
    "Reception": "Reception", "Cultural impact and legacy": "Reception", "Literary reception": "Reception",
    "Accolades": "Reception", "Collected editions": "Collected editions",
}

# ---------- load ----------
with zipfile.ZipFile("data/marvel_pages.zip") as z:
    pages = {urllib.parse.unquote(n.split("/")[-1][:-4]): z.read(n).decode("utf-8")
             for n in z.namelist() if n.endswith(".txt") and "README" not in n}
nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#", quoting=3)
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#", names=["source", "target"])
G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False))
U = G.to_undirected()
name = dict(zip(nodes.node_id, nodes.name))
assert set(pages) == set(G)


def body_of(text):
    """Article prose only: drop everything from the first reference-type heading on."""
    cut = len(text)
    for h in CUT:
        m = re.search(r"\n\n\n" + re.escape(h) + r"\n", text)
        if m:
            cut = min(cut, m.start())
    return text[:cut]


def tokenize(text):
    """Lower-case word tokens with char spans and the top-level section each falls in."""
    heads = [(m.start(1), m.group(1)) for m in re.finditer(r"\n\n\n([^\n]{1,70})\n", text)]
    toks, spans, secs = [], [], []
    hi, sec = 0, "Lead"
    for m in re.finditer(r"[a-z0-9]+(?:'[a-z]+)?", text.lower()):
        while hi < len(heads) and heads[hi][0] <= m.start():
            sec = CANON.get(heads[hi][1], sec)
            hi += 1
        toks.append(m.group())
        spans.append(m.span())
        secs.append(sec)
    return toks, spans, secs


body = {k: body_of(v) for k, v in pages.items()}
T = {k: tokenize(v) for k, v in body.items()}
ntok = {k: len(t[0]) for k, t in T.items()}

# ---------- 8-gram index ----------
where = collections.defaultdict(set)
for k, (toks, _, _) in T.items():
    for i in range(len(toks) - N + 1):
        where[tuple(toks[i:i + N])].add(k)
n_boiler = sum(len(v) > MAX_PAGES for v in where.values())


def shared_runs(a, b, max_pages, min_passage):
    """Maximal runs of tokens on page a covered by (non-boilerplate) 8-grams that also occur on b."""
    toks = T[a][0]
    hit = [i for i in range(len(toks) - N + 1)
           if len(ks := where[tuple(toks[i:i + N])]) <= max_pages and b in ks]
    runs, s, p = [], None, None
    for i in hit:
        if s is not None and i == p + 1:
            p = i
            continue
        if s is not None:
            runs.append((s, p + N))
        s = p = i
    if s is not None:
        runs.append((s, p + N))
    return [r for r in runs if r[1] - r[0] >= min_passage]


candidates = set()
for ks in where.values():
    if 2 <= len(ks) <= 10:   # widest boilerplate cut used in the sensitivity check
        candidates.update(itertools.combinations(sorted(ks), 2))


def copy_pairs(max_pages=MAX_PAGES, min_passage=MIN_PASSAGE, min_edge=MIN_EDGE):
    """All page pairs sharing >= min_edge copied tokens, plus the copied positions on each page."""
    pairs, covered = {}, collections.defaultdict(set)
    for a, b in candidates:
        ra, rb = shared_runs(a, b, max_pages, min_passage), shared_runs(b, a, max_pages, min_passage)
        ca, cb = sum(e - s for s, e in ra), sum(e - s for s, e in rb)
        if min(ca, cb) < min_edge:
            continue
        for s, e in ra:
            covered[a].update(range(s, e))
        for s, e in rb:
            covered[b].update(range(s, e))
        s, e = max(ra, key=lambda r: r[1] - r[0])
        sb, _ = max(rb, key=lambda r: r[1] - r[0])
        c0, c1 = T[a][1][s][0], T[a][1][e - 1][1]
        pairs[(a, b)] = dict(
            shared=round((ca + cb) / 2), passages=len(ra), longest=e - s,
            share_a=ca / ntok[a], share_b=cb / ntok[b],
            linked=U.has_edge(a, b), link_dir=[G.has_edge(a, b), G.has_edge(b, a)],
            kind="paragraph" if e - s >= PARAGRAPH else "phrase",
            section_a=T[a][2][s], section_b=T[b][2][sb], text=body[a][c0:c1].replace("\n", " "),
        )
    return pairs, covered


def section_shares(covered, only=None):
    sec_all, sec_cp = collections.Counter(), collections.Counter()
    for k, (_, _, secs) in T.items():
        if only is None or k in only:
            sec_all.update(secs)
        sec_cp.update(secs[i] for i in covered[k])
    return sec_all, sec_cp


pairs, covered = copy_pairs()
C = nx.Graph()
for (a, b), d in pairs.items():
    C.add_edge(a, b, **d)

# ---------- page-level borrowed share ----------
borrowed = pd.Series({k: len(covered[k]) / ntok[k] for k in pages}).sort_values(ascending=False)
indeg = pd.Series(dict(G.in_degree()))

# which sections the copied text sits in, vs. where all text sits
sec_all, sec_cp = section_shares(covered)
sec_inv, _ = section_shares(covered, only=set(C))   # section mix of the copying pages only

# ---------- does copying follow links? ----------
n_pairs = len(pages) * (len(pages) - 1) // 2
link_density = U.number_of_edges() / n_pairs
frac_linked = np.mean([d["linked"] for d in pairs.values()])
both_dir = np.mean([all(d["link_dir"]) for d in pairs.values()])
recip_all = np.mean([G.has_edge(b, a) for a, b in G.edges()])
# per-weight: heavy copying vs light copying
w = pd.DataFrame([dict(a=a, b=b, **d) for (a, b), d in pairs.items()]).sort_values("shared", ascending=False)
ccs = sorted(nx.connected_components(C), key=len, reverse=True)

print(f"pages {len(pages)}, body tokens {sum(ntok.values()):,}, boilerplate 8-grams {n_boiler:,}")
print(f"copy edges {C.number_of_edges()}, pages involved {C.number_of_nodes()}, components {len(ccs)}, sizes {[len(c) for c in ccs[:8]]}")
print(f"linked: {frac_linked:.2%} of copy pairs vs {link_density:.2%} of all pairs; both directions {both_dir:.2%} (all links reciprocal {recip_all:.2%})")
print(f"copied tokens total {sum(len(v) for v in covered.values()):,} = {sum(len(v) for v in covered.values()) / sum(ntok.values()):.2%} of prose")
print("\nmost borrowed pages:")
for k, v in borrowed.head(15).items():
    print(f"  {v:6.1%}  {ntok[k]:6d} tok  in={indeg[k]:3d}  {k}")
print("\nheaviest copy pairs:")
for r in w.head(20).itertuples():
    print(f"  {r.shared:5d} {r.passages:3d} longest {r.longest:4d} linked={r.linked!s:5} {r.a} -- {r.b}  [{r.section_a}]")
print("\nunlinked copy pairs:")
for r in w[~w.linked].itertuples():
    print(f"  {r.shared:5d} {r.a} -- {r.b}: {r.text[:140]}")
print("\ncopied share by section:")
for s, c in sec_cp.most_common(12):
    print(f"  {s:32s} {c / sum(sec_cp.values()):6.1%} of copied  vs {sec_all[s] / sum(sec_all.values()):6.1%} of all prose"
          f"  ({sec_inv[s] / sum(sec_inv.values()):6.1%} on the copying pages)")
print("\ncomponents:")
for c in ccs[:10]:
    print(f"  {len(c):2d}: {', '.join(sorted(name[x] for x in c))}")
print("\nparagraph copies:", (w.kind == "paragraph").sum(), "linked:", w[w.kind == "paragraph"].linked.mean(),
      "| phrases:", (w.kind == "phrase").sum(), "linked:", w[w.kind == "phrase"].linked.mean())
print("\ncorr(borrowed share, log in-degree+1):", np.corrcoef(borrowed[list(C)], np.log1p(indeg[list(C)]))[0, 1].round(3))

# ---------- sensitivity ----------
sens = []
for mp in (3, 5, 10):
    for mn in (8, 12, 20):
        p, cov = copy_pairs(mp, mn)
        _, cp = section_shares(cov)
        tot = sum(cp.values())
        par = [d for d in p.values() if d["kind"] == "paragraph"]
        sens.append(dict(max_pages=mp, min_passage=mn, edges=len(p),
                         linked=float(np.mean([d["linked"] for d in p.values()])),
                         paragraphs=len(par), paragraphs_linked=float(np.mean([d["linked"] for d in par])),
                         pub=(cp["Publication history"] + cp["Creation"]) / tot, bio=cp["Fictional character biography"] / tot))
        print(f"  max_pages={mp:2d} min_passage={mn:2d}: {len(p):3d} edges, {sens[-1]['linked']:.0%} linked, "
              f"{len(par)} paragraphs ({sens[-1]['paragraphs_linked']:.0%} linked), "
              f"pub hist {sens[-1]['pub']:.0%}, biography {sens[-1]['bio']:.0%}")

# ---------- export ----------
comp = {x: i for i, c in enumerate(ccs) for x in c}
out = dict(
    params=dict(N=N, MAX_PAGES=MAX_PAGES, MIN_PASSAGE=MIN_PASSAGE, MIN_EDGE=MIN_EDGE),
    stats=dict(paragraph_edges=int((w.kind == "paragraph").sum()),
               paragraph_linked=float(w[w.kind == "paragraph"].linked.mean()),
               phrase_linked=float(w[w.kind == "phrase"].linked.mean()),
               pages=len(pages), tokens=int(sum(ntok.values())), edges=C.number_of_edges(),
               pages_copying=C.number_of_nodes(), components=len(ccs),
               frac_linked=float(frac_linked), link_density=float(link_density),
               both_dir=float(both_dir), recip_all=float(recip_all),
               copied_tokens=int(sum(len(v) for v in covered.values()))),
    nodes=[dict(id=k, name=name[k], tokens=ntok[k], borrowed=round(float(borrowed[k]), 4),
                indeg=int(indeg[k]), comp=comp[k]) for k in C],
    edges=[dict(a=r.a, b=r.b, shared=int(r.shared), passages=int(r.passages), longest=int(r.longest),
                share_a=round(r.share_a, 4), share_b=round(r.share_b, 4), linked=bool(r.linked),
                kind=r.kind, section_a=r.section_a, section_b=r.section_b, text=r.text) for r in w.itertuples()],
    borrowed=[dict(id=k, name=name[k], borrowed=round(float(v), 4), tokens=ntok[k], indeg=int(indeg[k]))
              for k, v in borrowed.head(25).items()],
    sections=[dict(section=s, copied=c / sum(sec_cp.values()), all=sec_all[s] / sum(sec_all.values()),
                   involved=sec_inv[s] / sum(sec_inv.values())) for s, c in sec_cp.most_common(10)],
    sensitivity=sens,
)
with open("../assets/week5_copying.json", "w") as f:
    json.dump(out, f, ensure_ascii=False)
