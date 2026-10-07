"""Week 6: Names or story?

TF-IDF cosine between two pages is a sum over words, cos(a, b) = sum_t a_t * b_t
(with a, b unit-length). So every lookalike pair can be split *exactly* into the
part that comes from shared names, from shared real-world "paperwork" vocabulary,
and from shared story vocabulary. We do that for all 45,753 pairs of Marvel pages,
then rebuild the lookalikes from story words only and compare both to the link network.

Writes ../assets/week6_names.json. Needs networkx, numpy, pandas, scikit-learn.
"""
import collections
import json
import re
import urllib.parse
import zipfile

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics import roc_auc_score

NAME_CAP = 0.5        # a word is a name if more than this share of its uses are capitalized (course rule)
PAPER_SHARE = 0.7     # a word is paperwork if more than this share of its uses sit in real-world sections (baseline 34%)
MIN_DF, MAX_DF = 2, 0.5
TOP_TERMS = 14        # term contributions stored per pair
TOP_K = 8             # neighbors stored per page and representation
CUT = ("References", "External links", "See also", "Notes", "Further reading", "Bibliography", "Sources")
PAPER = {"Publication history", "Creation", "In other media", "Reception", "Collected editions"}
CANON = {   # top-level headings, as in week 5 (plain text loses heading levels)
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
TOK = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*")   # keeps Shi'ar, Ch'od in one piece

# ---------- load ----------
with zipfile.ZipFile("data/marvel_pages.zip") as z:
    pages = {urllib.parse.unquote(n.split("/")[-1][:-4]): z.read(n).decode("utf-8")
             for n in z.namelist() if n.endswith(".txt") and "README" not in n}
nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#", quoting=3)
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#", names=["source", "target"])
G = nx.Graph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False))
assert set(pages) == set(G)
names = sorted(pages)
idx = {n: i for i, n in enumerate(names)}
label = {n: re.sub(r"\s*\((?:[^()]*)\)$", "", nm) for n, nm in zip(nodes.node_id, nodes.name)}
dist = dict(nx.all_pairs_shortest_path_length(G))


def body_of(text):
    cut = len(text)
    for h in CUT:
        m = re.search(r"\n\n\n" + re.escape(h) + r"\n", text)
        if m:
            cut = min(cut, m.start())
    return text[:cut]


def tokens(text):
    """(start, end, word) with possessive 's stripped."""
    out = []
    for m in TOK.finditer(text):
        w = re.sub(r"['’]s$", "", m.group())
        out.append((m.start(), m.start() + len(w), w))
    return out


body = {n: body_of(pages[n]) for n in names}
TOKS = {n: tokens(body[n]) for n in names}

# word statistics: capitalization and where on the page each word lives
seen, cap, in_paper = collections.Counter(), collections.Counter(), collections.Counter()
for n in names:
    t = body[n]
    heads = [(m.start(1), m.group(1)) for m in re.finditer(r"\n\n\n([^\n]{1,70})\n", t)]
    hi, sec = 0, "Lead"
    for s, _, w in TOKS[n]:
        while hi < len(heads) and heads[hi][0] <= s:
            sec = CANON.get(heads[hi][1], sec)
            hi += 1
        lw = w.lower()
        seen[lw] += 1
        cap[lw] += w[0].isupper()
        in_paper[lw] += sec in PAPER
paper_baseline = sum(in_paper.values()) / sum(seen.values())
title_words = {w.lower() for n in names for _, _, w in tokens(label[n])} - {"the", "of", "and", "man", "woman", "girl", "boy"}


def analyzer(text):
    return [w.lower() for _, _, w in tokens(text) if len(w) > 1 and w.lower() not in ENGLISH_STOP_WORDS]


def build(name_cap=NAME_CAP, paper_share=PAPER_SHARE, sublinear=False, add_titles=False):
    vec = TfidfVectorizer(analyzer=analyzer, min_df=MIN_DF, max_df=MAX_DF, sublinear_tf=sublinear)
    X = vec.fit_transform(body[n] for n in names).toarray()
    V = vec.get_feature_names_out()
    proper = {w for w in seen if cap[w] > name_cap * seen[w]}
    if add_titles:
        proper |= title_words
    is_name = np.array([v in proper for v in V])
    is_paper = np.array([(not is_name[k]) and in_paper[v] / seen[v] > paper_share for k, v in enumerate(V)])
    cls = np.where(is_name, 0, np.where(is_paper, 1, 2))           # 0 name, 1 paperwork, 2 story
    S = X @ X.T
    parts = [(X * (cls == c)) @ X.T for c in range(3)]
    Xs = X * (cls == 2)
    Xs = Xs / np.linalg.norm(Xs, axis=1, keepdims=True)
    St = Xs @ Xs.T
    Xn = X * (cls == 0)
    Xn = Xn / np.maximum(np.linalg.norm(Xn, axis=1, keepdims=True), 1e-12)
    Sn = Xn @ Xn.T
    for M in (S, St, Sn, *parts):
        np.fill_diagonal(M, 0)
    return dict(X=X, V=V, cls=cls, S=S, parts=parts, St=St, Xs=Xs, Sn=Sn)


iu = np.triu_indices(len(names), 1)
linked = np.array([G.has_edge(names[i], names[j]) for i, j in zip(*iu)])


def summary(R):
    S, St, (SN, SP, SS) = R["S"], R["St"], R["parts"]
    nn, nns = S.argmax(1), St.argmax(1)
    nshare = np.array([SN[i, j] / S[i, j] for i, j in enumerate(nn)])
    lk = lambda a: float(np.mean([G.has_edge(names[i], names[j]) for i, j in enumerate(a)]))
    return {
        "nn_name_median": float(np.median(nshare)),
        "nn_name_majority": float((nshare > 0.5).mean()),
        "mass": [float(M[iu].sum() / S[iu].sum()) for M in (SN, SP, SS)],
        "nn_same": float((nn == nns).mean()),
        "nn_linked_raw": lk(nn), "nn_linked_story": lk(nns), "nn_linked_names": lk(R["Sn"].argmax(1)),
        "auc_raw": float(roc_auc_score(linked, S[iu])), "auc_names": float(roc_auc_score(linked, R["Sn"][iu])),
        "auc_story": float(roc_auc_score(linked, St[iu])),
    }


R = build()
X, V, cls, S, St = R["X"], R["V"], R["cls"], R["S"], R["St"]
SN, SP, SS = R["parts"]
main = summary(R)
print({k: round(v, 3) if isinstance(v, float) else v for k, v in main.items()})

# ---------- robustness ----------
variants = [
    ("Reported: capitalized > 50%, paperwork > 70%", {}),
    ("Names: capitalized > 30%", {"name_cap": 0.3}),
    ("Names: capitalized > 70%", {"name_cap": 0.7}),
    ("Names: + every word of the 303 page titles", {"add_titles": True}),
    ("Paperwork: > 60% in real-world sections", {"paper_share": 0.6}),
    ("Sublinear TF (1 + log count)", {"sublinear": True}),
]
robust = []
for lab, kw in variants:
    r = summary(R if not kw else build(**kw))
    r["label"] = lab
    robust.append(r)
    print(lab, round(r["nn_name_median"], 3), round(r["nn_same"], 3), round(r["nn_linked_story"], 3))

# ---------- surprise: gender (pronouns are stopwords, so they never enter the vectors) ----------
def gender(text):
    t = text.lower()
    f = len(re.findall(r"\b(?:she|her|hers|herself)\b", t))
    m = len(re.findall(r"\b(?:he|him|his|himself)\b", t))
    return "F" if f > 2 * m else "M" if m > 2 * f else "?"


sex = np.array([gender(pages[n]) for n in names])
GENDERED = {"female", "women", "woman", "girl", "girls", "girlfriend", "boyfriend", "husband", "wife", "mother",
            "daughter", "sister", "sisters", "feminist", "feminine", "lady", "queen", "princess", "pregnant",
            "male", "men", "man", "boy", "father", "son", "brother", "brothers", "king", "prince", "masculine"}


def women_story_nn(M):
    w = np.where(sex == "F")[0]
    return float(np.mean([sex[M[i].argmax()] == "F" for i in w]))


g_rate = {"chance": float((sex == "F").sum() - 1) / (len(names) - 1), "raw": women_story_nn(S), "story": women_story_nn(St)}
Xg = R["Xs"] * np.array([v not in GENDERED for v in V])
Xg = Xg / np.linalg.norm(Xg, axis=1, keepdims=True)
Sg = Xg @ Xg.T
np.fill_diagonal(Sg, 0)
g_rate["story_no_gender_words"] = women_story_nn(Sg)
ff_terms = collections.Counter()
for i in np.where(sex == "F")[0]:
    j = St[i].argmax()
    if sex[j] == "F":
        c = R["Xs"][i] * R["Xs"][j]
        for k in np.argsort(-c)[:10]:
            ff_terms[V[k]] += float(c[k])
g_terms = [[w, round(c, 3)] for w, c in ff_terms.most_common(16)]
WORD_PATTERNS = [   # page mentions the pattern at least once (raw text, so pronouns and names don't matter)
    ("relationship", r"\brelationship"), ("telekinesis", r"\btelekine"), ("luck / probability", r"\b(?:luck|probability)\b"),
    ("martial arts", r"\bmartial arts"), ("psychic / psionic", r"\b(?:psychic|psionic)"), ("telepathy", r"\btelepath"),
    ("mutant", r"\bmutant"), ("superhuman strength", r"\bsuperhuman strength"), ("armor", r"\barmou?r\b"),
    ("gun / rifle", r"\b(?:gun|guns|rifle|firearm)s?\b"),
]
g_words = []
for lab_, pat in WORD_PATTERNS:
    has = np.array([bool(re.search(pat, pages[n].lower())) for n in names])
    g_words.append([lab_, round(float(has[sex == "F"].mean()), 3), round(float(has[sex == "M"].mean()), 3)])
print("gender", g_rate, [w for w, _ in g_terms])

# ---------- per-page facts ----------
self_name = [float((X[i] ** 2)[cls == 0].sum()) for i in range(len(names))]   # share of each unit vector on names
tok_name = []
proper = {V[k] for k in range(len(V)) if cls[k] == 0}
for n in names:
    ws = [w.lower() for _, _, w in TOKS[n] if w.lower() not in ENGLISH_STOP_WORDS and len(w) > 1]
    tok_name.append(sum(w in proper for w in ws) / max(len(ws), 1))
print("name share of tokens (median)", np.median(tok_name), "of vector length^2 (median)", np.median(self_name))


def d(i, j):
    return dist[names[i]].get(names[j], -1)


nn, nns = S.argmax(1), St.argmax(1)
page_rows = []
for i, n in enumerate(names):
    raw_top = np.argsort(-S[i])[:TOP_K]
    sto_top = np.argsort(-St[i])[:TOP_K]
    page_rows.append({
        "id": n, "label": label[n], "sex": sex[i], "deg": G.degree(n), "tokens": len(TOKS[n]),
        "self_name": round(self_name[i], 3), "tok_name": round(tok_name[i], 3),
        "raw": [[int(j), round(float(S[i, j]), 4), d(i, j)] for j in raw_top],
        "story": [[int(j), round(float(St[i, j]), 4), d(i, j)] for j in sto_top],
    })

# ---------- pairs we ship: nearest neighbors + top story / raw pairs ----------
want = set()
for i in range(len(names)):
    for j in list(np.argsort(-S[i])[:5]) + list(np.argsort(-St[i])[:5]):
        want.add((min(i, int(j)), max(i, int(j))))
order = np.argsort(-St[iu])[:300]
want |= {(int(iu[0][k]), int(iu[1][k])) for k in order}
pairs = []
need_terms = collections.defaultdict(set)
for i, j in sorted(want):
    c = X[i] * X[j]
    top = [k for k in np.argsort(-c)[:TOP_TERMS] if c[k] > 0]
    cs = R["Xs"][i] * R["Xs"][j]
    story_top = [k for k in np.argsort(-cs)[:6] if cs[k] > 0]
    for k in top[:4] + story_top[:4]:
        need_terms[i].add(V[k])
        need_terms[j].add(V[k])
    nm = np.array([c[k] for k in top if cls[k] == 0])
    neff = float(1 / np.sum((nm / nm.sum()) ** 2)) if nm.sum() > 0 else 0.0
    pairs.append({
        "neff": round(neff, 2),
        "a": i, "b": j, "cos": round(float(S[i, j]), 4), "story": round(float(St[i, j]), 4),
        "parts": [round(float(M[i, j]), 4) for M in (SN, SP, SS)],
        "d": d(i, j),
        "terms": [[V[k], round(float(c[k]), 4), int(cls[k])] for k in top],
        "sterms": [[V[k], round(float(cs[k]), 4)] for k in story_top],
    })


# ---------- concordance lines for the terms the inspector can show ----------
def kwic(n, term, k=2, w=75):
    text = body[n]
    out, used = [], []
    hits = [(s, e) for s, e, t in TOKS[n] if t.lower() == term]
    if not hits:
        return out
    step = max(1, len(hits) // k)
    for s, e in hits[::step][:k]:
        a, b = max(0, s - w), min(len(text), e + w)
        left = re.sub(r"\s+", " ", text[a:s])
        right = re.sub(r"\s+", " ", text[e:b])
        out.append([("…" if a > 0 else "") + left, text[s:e], right + ("…" if b < len(text) else "")])
    return out


conc = {str(i): {t: kwic(names[i], t) for t in sorted(ts)} for i, ts in need_terms.items()}

# ---------- hero chart: each page's nearest neighbor, split ----------
hero = []
for i in range(len(names)):
    j = int(nn[i]); js = int(nns[i])
    hero.append({"i": i, "j": j, "cos": round(float(S[i, j]), 4),
                 "parts": [round(float(M[i, j]), 4) for M in (SN, SP, SS)],
                 "js": js, "scos": round(float(St[i, js]), 4), "d": d(i, j), "ds": d(i, js)})

# where the paperwork/name vocab comes from: most influential words per class
colsum = X.sum(0)
mass_t = (colsum ** 2 - (X ** 2).sum(0)) / 2    # sum over pairs of a_t * b_t, per word
top_words = {c: [[V[k], round(float(mass_t[k] / S[iu].sum()), 4)] for k in np.argsort(-(mass_t * (cls == c)))[:15]]
             for c in range(3)}
print("top name words", [w for w, _ in top_words[0][:10]])

out = {
    "params": {"name_cap": NAME_CAP, "paper_share": PAPER_SHARE, "min_df": MIN_DF, "max_df": MAX_DF,
               "paper_baseline": round(paper_baseline, 3), "vocab": int(len(V)),
               "n_name": int((cls == 0).sum()), "n_paper": int((cls == 1).sum()), "n_story": int((cls == 2).sum()),
               "pairs_total": int(len(iu[0])), "density": round(float(linked.mean()), 4)},
    "summary": main, "robust": robust,
    "tok_name_median": float(np.median(tok_name)), "self_name_median": float(np.median(self_name)),
    "top_words": top_words,
    "paper_examples": [V[k] for k in np.argsort(-np.array([seen[v] for v in V]) * (cls == 1))[:24]],
    "gender": {"counts": collections.Counter(sex.tolist()), "rate": g_rate, "terms": g_terms, "words": g_words},
    "pages": page_rows, "pairs": pairs, "hero": hero,
}
with open("../assets/week6_conc.json", "w") as f:     # concordance lines, fetched lazily by the inspector
    json.dump(conc, f, separators=(",", ":"), ensure_ascii=False)
with open("../assets/week6_names.json", "w") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
print("pairs shipped", len(pairs))
