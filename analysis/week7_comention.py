"""Week 7: Can the text rebuild the network?

A Wikipedia hyperlink from page A to page B is an editor's decision. The text of A
also *names* other characters, whether or not anyone linked them. We find every
named character in every sentence of the 303 Marvel pages, build two networks from
the names alone, and compare them with the hyperlink network edge by edge:

  - the mention network: A -> B when A's page names B (same shape as a link),
  - the co-mention network: A - B when one sentence (or paragraph, or page) names both,
    on any of the 303 pages.

Names are resolved with a rule we can defend: a name counts for a character only if
Wikipedia itself sends that name to the character's page (frozen by
week7_fetch_aliases.py).

Writes ../assets/week7_comention.json. Needs numpy, pandas, scikit-learn, mwparserfromhell.
"""
import collections
import gzip
import itertools
import json
import os
import re
import urllib.parse
import zipfile

import mwparserfromhell as mw
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

CUT = ("References", "External links", "See also", "Notes", "Further reading", "Bibliography", "Sources")
PAPER = {"Publication history", "Creation", "In other media", "Reception", "Collected editions"}
CANON = {   # top-level headings, as in weeks 5 and 6
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
PREFIX = [("Alternate versions", "Other versions"), ("Other versions", "Other versions"), ("Reception", "Reception"),
          ("Powers", "Powers and abilities"), ("Supporting", "Supporting characters"), ("Personality", "Characterization"),
          ("Publication", "Publication history"), ("Publishing", "Publication history"), ("In other media", "In other media"),
          ("Fictional character", "Fictional character biography"), ("Concept", "Creation"), ("Creation", "Creation")]
SKIP = {"In other media"}   # adaptations: names there are mostly film, show and game titles and cast credits
GENERIC = {None, "character", "characters", "comics", "Marvel Comics", "Marvel"}   # qualifiers that mark the main page
VARIANT = re.compile(r"Ultimate|film|Mangaverse|Guardians of the Galaxy")         # pages about one version of a bigger name
ORDINARY = 3          # a one-word name that also occurs at least this often in lower case is an ordinary word (force, storm)
NAME_CAP = 0.5        # a one-word name must be capitalized in more than half its uses (course rule, as in week 6)
OWN_STOP = {"The", "Doctor", "Captain", "Black", "Red", "White", "Blue", "Iron", "Spider", "Man", "Woman", "Girl", "Boy",
            "Kid", "Lord", "Agent", "Mister", "Miss", "King", "Queen", "Prince", "Princess", "Professor", "Marvel", "Dr", "Jr"}
# a name inside a comic's title is a citation, not the character: "The Amazing Spider-Man #129", "Hulk (vol. 2)"
TITLE_BEFORE = re.compile(r"(?:Amazing|Spectacular|Sensational|Incredible|Savage|Uncanny|Astonishing|Ultimate|Superior|"
                          r"Untold Tales of|Web of|Marvel Team-Up|Marvel Two-in-One|Friendly Neighborhood|"
                          r"Immortal|Mighty|All-New|Totally Awesome|Champions|Rampaging|Adventures of|Tales of|Annual|Project:|Codename:|Hotel)\s+$|"
                          r"[A-Za-z]/$|&\s+$")
TITLE_AFTER = re.compile(r"^(?:(?:\s*(?:\(vol\.?\s*\d+\)|vol\.?\s*\d+|Vol\.?\s*\d+))?\s*(?:#\s*\d|Annual|Unlimited|Team-Up|and Power Pack|"
                         r"Noir\b|2099|Family|Magazine|Comics\b)|:\s|/[A-Z]|\s+&\s|\s\d\b|\s+and (?:His Amazing Friends|the Agents of)|"
                         r"(?:\s+(?:and|of|the|&|[A-Z][\w'’-]*)){1,4}\s*#\s*\d|\s+(?:School|Academy|Institute|Force|Club|Corps)\b)")
# "Spider-Man: No Way Home", "Power Man and Iron Fist #73", "Deadpool 2", the Jean Grey School, the Enigma Force
TITLE_WORDS = re.compile(r"^(?:The |Your )?(?:Amazing|Spectacular|Sensational|Incredible|Savage|Uncanny|Astonishing|Friendly|Fantastic)\b")
FUNCTION = {"when", "after", "while", "although", "though", "however", "meanwhile", "later", "eventually", "soon",
            "despite", "during", "before", "following", "unlike", "like", "with", "without", "both", "then", "now", "but",
            "and", "or", "as", "at", "in", "on", "by", "for", "from", "to", "the", "a", "an", "has", "had", "is", "was"}
DROP = {"Justice"}    # read in the text: off its own page "Justice" is almost always Vance Astrovik, another of our pages
# an ordinary-word name glued to another capitalized word is part of a longer name: Air Force, Sue Storm, Ebony Blade
GLUE_WORD = r"[A-Z][\w'’.-]*"
GLUE_BEFORE = re.compile(r"(?<![\w-])(" + GLUE_WORD + r") (?:of (?:the )?)?$")
GLUE_AFTER = re.compile(r"^ (?:of (?:the )?)?(" + GLUE_WORD + r")")
GLUE_NEXT = re.compile(r"^ (" + GLUE_WORD + r")")
ABBR = re.compile(r"\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|vs|Vol|No|U\.S|Lt|Sgt|Capt|Gen|Prof|[A-Z])\.$")      # "G. W. Bridge" is one name

# ---------- load ----------
with zipfile.ZipFile("data/marvel_pages.zip") as z:
    pages = {urllib.parse.unquote(n.split("/")[-1][:-4]): z.read(n).decode("utf-8")
             for n in z.namelist() if n.endswith(".txt") and "README" not in n}
nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#", quoting=3)
edges = pd.read_csv("data/week1_edges.tsv", sep="\t", comment="#", names=["source", "target"])
names_db = json.load(open("data/week7_name_targets.json"))
NODES = sorted(pages)
assert set(NODES) == set(nodes.node_id)
LINKS = {(a, b) for a, b in edges.itertuples(index=False) if a != b}
label = {n: re.sub(r"\s*\([^()]*\)$", "", nm) for n, nm in zip(nodes.node_id, nodes.name)}
qual = {n: (re.search(r"\(([^()]+)\)$", nm).group(1) if re.search(r"\(([^()]+)\)$", nm) else None)
        for n, nm in zip(nodes.node_id, nodes.name)}


def body_of(text):
    cut = len(text)
    for h in CUT:
        m = re.search(r"\n\n\n" + re.escape(h) + r"\n", text)
        if m:
            cut = min(cut, m.start())
    return text[:cut]


body = {n: body_of(pages[n]) for n in NODES}

# capitalization of every word, for the one-word-name rule
seen, cap = collections.Counter(), collections.Counter()
for t in body.values():
    for w in re.findall(r"[A-Za-z][A-Za-z'-]*", t):
        seen[w.lower()] += 1
        cap[w.lower()] += w[0].isupper()


def name_like(s):
    """multi-word names pass; a one-word name must be mostly capitalized in the corpus"""
    return " " in s or "-" in s or seen[s.lower()] == 0 or cap[s.lower()] > NAME_CAP * seen[s.lower()]


# ---------- 1. resolve every candidate name to at most one character ----------
def usable(s):
    return name_like(s) and s not in DROP and not TITLE_WORDS.match(s)


def claimants(s):
    """pages that go by this name, leaving out pages about one version of a bigger character"""
    return [n for n in names_db[s]["proposed_by"] if not VARIANT.search(qual[n] or "")]


resolve, why, shared = {}, {}, []
for s, rec in names_db.items():
    by, tgt = rec["proposed_by"], rec["wikipedia_target"]
    who = claimants(s)
    titles = [n for n in who if by[n] == "title"]
    main = [n for n in titles if qual[n] in GENERIC]
    if not usable(s):
        pick, reason = None, "common word or a title" if s not in DROP else "read in the text: means someone else"
    elif any(s == qual[n] for n in who) and tgt not in (None, "(disambiguation)") and tgt not in who:
        pick, reason = None, "Wikipedia sends it elsewhere"        # "Gwen Stacy" is the original Gwen, not Spider-Gwen
    elif tgt in pages:
        pick, reason = tgt, "Wikipedia redirect"                    # Wikipedia sends the name to one of our pages
    elif len(main) == 1:
        pick, reason = main[0], "page title"                     # for a shared title the main page: Wolverine, not Ultimate Wolverine
    elif len(who) == 1 and (titles or (tgt is None and " " in s and all(w[:1].isupper() for w in s.split()))):
        pick, reason = who[0], "page title" if titles else "no page; unique full name"
    elif len(who) >= 2 and tgt in (None, "(disambiguation)"):
        pick, reason = None, "shared codename"
        shared.append(s)
    else:
        pick, reason = None, "Wikipedia sends it elsewhere" if tgt not in (None, "(disambiguation)") else "ambiguous"
    why[s] = [pick, reason, tgt]
    if pick:
        resolve[s] = pick


def alias_regex(names):
    alt = "|".join(re.escape(a) for a in sorted(names, key=len, reverse=True))
    return re.compile(r"(?<![\w-])(?:" + alt + r")(?!\w|-[A-Z0-9])")       # "Phoenix Force-possessed" still names it


# a codename several pages share ("Black Widow": Natasha Romanova and Yelena Belova) goes to the page whose
# unambiguous names the other pages use at least SHARE_WIN times more often; otherwise to nobody. Text only, no links.
SHARE_WIN = 3
use = collections.Counter(resolve[m.group()] for n, t in body.items() for m in alias_regex(resolve).finditer(t) if resolve[m.group()] != n)
for s in shared:
    ranked = sorted(claimants(s), key=lambda n: -use[n])
    if use[ranked[0]] >= SHARE_WIN * max(1, use[ranked[1]]):
        resolve[s] = ranked[0]
        why[s][:2] = [ranked[0], f"shared codename; {use[ranked[0]]} vs {use[ranked[1]]} unambiguous uses"]

# on its own page, every name a character goes by means that character, plus its first name and surname.
# Not on a mantle page ("Bucky is the name used by several different characters"): there "Jack Monroe" is still Jack Monroe.
MANTLE = {n for n, d in zip(nodes.node_id, nodes.description.fillna(""))
          if re.search(r"\b(?:name|alias|code ?name|identity)\b[^.]{0,30}\b(?:of|used by)\b[^.]{0,12}\b(?:several|two|three|multiple|various|a number|different)\b", d)}
own = collections.defaultdict(set)
for s, rec in names_db.items():
    for n in rec["proposed_by"]:
        if usable(s) and (resolve.get(s) in (None, n) or n not in MANTLE):
            own[n].add(s)
            for w in s.split():
                if re.fullmatch(r"[A-Z][a-z'’-]{2,}", w) and w not in OWN_STOP and name_like(w):
                    own[n].add(w)
GLOBAL_RE = alias_regex(resolve)
OWN_RE = {n: alias_regex(own[n] | {a for a, m in resolve.items() if m == n}) for n in NODES}


def glued(text, s, e, ordinary):
    """is the one-word name at text[s:e] one word of a longer capitalized name? ("When Cyclops" is not)
    A capitalized word right after it always counts (Thunderbolt Ross, Wolverine Legends): if it were the same
    character, its longer name would have matched first. Before it, or joined by "of", only for ordinary words."""
    after = GLUE_NEXT.match(text[e:e + 30])
    if after and after.group(1).lower().strip(".") not in ENGLISH_STOP_WORDS | FUNCTION:
        return True
    if not ordinary:
        return False
    for m in (GLUE_BEFORE.search(text[max(0, s - 30):s]), GLUE_AFTER.match(text[e:e + 30])):
        if m and m.group(1).lower().strip(".") not in ENGLISH_STOP_WORDS | FUNCTION:
            return True
    return False


def mentions(text, page):
    """[(start, end, character)] named in one sentence of `page`: longest names first, the page's own names win ties"""
    found = []
    for prio, rx in ((1, OWN_RE[page]), (0, GLOBAL_RE)):
        for m in rx.finditer(text):
            s, e, w = m.start(), m.end(), m.group()
            if TITLE_BEFORE.search(text[max(0, s - 40):s]) or TITLE_AFTER.match(text[e:e + 40]):
                continue                                             # part of a comic, film or show title
            if " " not in w and glued(text, s, e, seen[w.lower()] - cap[w.lower()] >= ORDINARY):
                continue                                             # one word of a longer name: Air Force, Sue Storm
            found.append((e - s, prio, s, e, page if prio else resolve[w]))
    out = []
    for _, _, s, e, who in sorted(found, key=lambda f: (-f[0], -f[1], f[2])):
        if all(e <= a or b <= s for a, b, _ in out):
            out.append((s, e, who))
    return sorted(out)


def sentences(par):
    out, start = [], 0
    for m in re.finditer(r"[.!?][\"'”)]*\s+(?=[A-Z\"“(])", par):
        if ABBR.search(par[start:m.start() + 1]):
            continue
        out.append(par[start:m.end()].strip())
        start = m.end()
    out.append(par[start:].strip())
    return [s for s in out if s]


def section_of(head, current):
    """plain text loses heading levels, so an unknown heading ("1970s", "Civil War") is a sub-heading of the current section"""
    if head in CANON:
        return CANON[head]
    for prefix, sec in PREFIX:
        if head.startswith(prefix):
            return sec
    return current


# ---------- 2. walk every page: section > paragraph > sentence ----------
units = []    # one row per sentence: page, section, paragraph id, text, characters named
for n in NODES:
    pid = 0
    parts = re.split(r"\n\n\n([^\n]{1,70})\n", "\n\n\nLead\n" + body[n])     # headings follow two blank lines
    sec = "Lead"
    for head, text in zip(parts[1::2], parts[2::2]):
        sec = section_of(head.strip(), sec)
        for block in text.split("\n"):
            block = block.strip()
            if not block or (len(block) <= 70 and not re.search(r"[.!?]$", block)):
                continue                                             # sub-headings and bare list items
            pid += 1
            if sec in SKIP:
                continue
            for s in sentences(block):
                ms = mentions(s, n)
                units.append({"page": n, "sec": sec, "par": pid, "text": s, "who": [c for _, _, c in ms], "spans": ms})

df = pd.DataFrame(units)
print(len(df), "sentences;", sum(len(w) for w in df.who), "name mentions;",
      df.who.map(lambda w: len(set(w)) >= 2).sum(), "sentences name two or more characters")


# ---------- 3. the wiki source: where does each link sit, and what text does it show? ----------
with gzip.open("data/week7_wikitext.json.gz", "rt", encoding="utf-8") as f:
    SRC = json.load(f)
REDIR = json.load(open("data/week7_redirects.json"))


def norm(t):
    t = t.split("#")[0].replace("_", " ").strip()
    return t[:1].upper() + t[1:]


title_node = {}
for n, ts in REDIR.items():
    for t in ts:
        title_node.setdefault(norm(t), n)


def place_of(sec, link, line):
    """where a [[link]] sits on the page"""
    for a in sec.get_ancestors(link):
        if isinstance(a, mw.nodes.Template):
            return "infobox" if str(a.name).strip().lower().startswith("infobox") else "template"
        if isinstance(a, mw.nodes.Tag):
            tag = str(a.tag).lower()
            if tag == "ref":
                return "reference"
            if tag in ("table", "td", "th", "tr"):
                return "table"
            if tag in ("i", "gallery"):
                return "italic title" if tag == "i" else "gallery"
        if isinstance(a, mw.nodes.Wikilink):
            return "image caption"
    return "list" if line.lstrip().startswith(("*", "#", ";", ":")) else "prose"


rows = []   # every wikilink on every page: page, target node (or outside title), shown text, place, section, line
for n in NODES:
    code = mw.parse(SRC[n]["wikitext"])
    for sec in code.get_sections(levels=[2], include_lead=True):
        hs = sec.filter_headings(recursive=False)
        head = section_of(hs[0].title.strip_code().strip(), "Lead") if hs and hs[0].level == 2 else "Lead"
        text, cur = str(sec), 0
        for link in sec.filter_wikilinks():
            raw = str(link)
            i = text.find(raw, cur)
            cur = i + len(raw) if i >= 0 else cur
            line = text[text.rfind("\n", 0, max(i, 0)) + 1: text.find("\n", max(i, 0)) if text.find("\n", max(i, 0)) >= 0 else None]
            target = norm(str(link.title))
            if ":" in target and target.split(":")[0] in ("File", "Image", "Category", "Wikipedia", "Help", "Template"):
                continue
            shown = (link.text.strip_code() if link.text else str(link.title)).strip()
            rows.append({"page": n, "to": title_node.get(target), "target": target, "shown": shown,
                         "place": place_of(sec, link, line), "sec": head,
                         "line": re.sub(r"\s+", " ", mw.parse(line).strip_code())})
src = pd.DataFrame(rows)
print(len(src), "wikilinks;", src.to.notna().sum(), "point at one of the 303 pages")


# ---------- 4. the mention network vs the links, pair by pair ----------
STORY = {"Lead", "Fictional character biography", "Powers and abilities", "Characterization", "Supporting characters", "Other versions"}
men = collections.defaultdict(list)          # (a, b) -> sentences on a's page that name b
surface = collections.defaultdict(set)       # (a, b) -> the strings a's page uses for b
for i, u in enumerate(units):
    for s, e, c in u["spans"]:
        if c != u["page"]:
            surface[(u["page"], c)].add(u["text"][s:e])
    for c in dict.fromkeys(u["who"]):
        if c != u["page"]:
            men[(u["page"], c)].append(i)
M, L = set(men), LINKS
names_of = collections.defaultdict(set)
for s, n in resolve.items():
    names_of[n].add(s)
by_page = {n: g for n, g in src.groupby("page")}
RANK = ["prose", "list", "table", "image caption", "template", "infobox", "italic title", "reference"]


def why_link_unnamed(a, b):
    """a links to b but a's text never names b: what does the source show?"""
    r = by_page[a][by_page[a].to == b]
    if r.empty:
        return "missing from the snapshot source", None
    if r.sec.isin(SKIP).all():
        return "only in In other media, which we leave out", r.iloc[0]
    r = r[~r.sec.isin(SKIP)]
    best = r.iloc[np.argmin([RANK.index(p) for p in r.place])]
    if best.place == "infobox":
        return "only in the infobox", best
    if best.place in ("italic title", "reference"):
        return "only in a comic title or a reference", best
    if best.place in ("table", "image caption", "template"):
        return "only in a table or caption", best
    shown = set(r[r.place.isin(["prose", "list"])].shown)
    if any(resolve.get(x) not in (None, b) for x in shown):
        return "a shared codename we give to another page", best
    if shown & own[a]:
        return "the page's own codename, which we read as the page itself", best   # "Wolverine" on Ultimate Wolverine's page
    if any(b in names_db.get(x, {}).get("proposed_by", {}) and x not in resolve for x in shown):
        return "a shared codename we leave unresolved", best           # Psylocke, Giant-Man, Power Man, Hellcat
    if shown & names_of[b] or shown & own[b]:
        return "named, but our matcher missed it", best
    return "linked from other words", best      # [[Hulk|Bruce Banner's alter ego]], [[Spider-Woman (Jessica Drew)|Jessica]]


def why_named_unlinked(a, b):
    """a's text names b but a never links to b: where does the source send those words?"""
    r = by_page[a][by_page[a].shown.isin(surface[(a, b)]) & ~by_page[a].sec.isin(SKIP)]
    if r.empty:
        return "never linked on this page", None
    r = r.assign(rank=[RANK.index(p) for p in r.place], n=r.groupby("target").target.transform("size"))
    best = r.sort_values(["rank", "n"], ascending=[True, False]).iloc[0]       # a prose link, to its most common target
    if isinstance(best.to, str):
        return "the name is linked to another of our pages", best
    return "the name is linked to a page outside the 303", best


ledger = []
for a, b in sorted(L | M):
    k = "both" if (a, b) in L and (a, b) in M else None
    row = None
    if (a, b) in L and (a, b) not in M:
        k, row = why_link_unnamed(a, b)
    elif (a, b) in M and (a, b) not in L:
        k, row = why_named_unlinked(a, b)
    secs = collections.Counter(units[i]["sec"] for i in men.get((a, b), []))
    ledger.append({"a": a, "b": b, "linked": (a, b) in L, "named": len(men.get((a, b), [])), "why": k,
                   "story": sum(v for s, v in secs.items() if s in STORY), "back": (b, a) in L,
                   "src": None if row is None else {"place": row.place, "shown": row.shown, "target": row.target,
                                                    "to": row.to if isinstance(row.to, str) else None, "line": row.line}})
led = pd.DataFrame(ledger)
print("\nlinks", len(L), "| named", len(M), "| both", (led.why == "both").sum())
print(led[led.linked & (led.why != "both")].why.value_counts().to_string())
print(led[~led.linked].why.value_counts().to_string())


# ---------- 5. the co-mention network: who is named together? ----------
Lu = {frozenset(e) for e in L}
N_PAIRS = len(NODES) * (len(NODES) - 1) // 2


def groups(unit):
    """the sets of characters named together in each sentence, paragraph or page"""
    g = collections.defaultdict(set)
    for i, u in enumerate(units):
        key = {"sentence": i, "paragraph": (u["page"], u["par"]), "page": u["page"]}[unit]
        g[key] |= set(u["who"])
    return [(k, s) for k, s in g.items() if len(s) >= 2]


dial, co_sent = [], None
for unit in ("sentence", "paragraph", "page"):
    co = collections.Counter()
    for _, s in groups(unit):
        co.update(frozenset(p) for p in itertools.combinations(sorted(s), 2))
    if unit == "sentence":
        co_sent = co
    for k in range(1, 7):
        T = {e for e, w in co.items() if w >= k}
        hit = len(T & Lu)
        dial.append({"unit": unit, "k": k, "edges": len(T), "linked": hit,
                     "precision": round(hit / max(1, len(T)), 3), "recall": round(hit / len(Lu), 3)})
print("\nco-mention vs links (undirected:", len(Lu), "pairs; chance", round(len(Lu) / N_PAIRS, 3), ")")
print(pd.DataFrame(dial).query("k in (1, 2, 3)").to_string(index=False))

# roll calls: a sentence that names n characters adds n(n-1)/2 pairs at once
size = []
for i, s in groups("sentence"):
    for p in itertools.combinations(sorted(s), 2):
        size.append({"n": min(len(s), 6), "linked": frozenset(p) in Lu, "own": units[i]["page"] in p})
size = pd.DataFrame(size)
roll = (size.groupby("n").agg(pairs=("linked", "size"), linked=("linked", "mean")).reset_index())
print(roll.to_string(index=False))
third = size.groupby("own").linked.agg(["size", "mean"])
print("pairs that include the page's own subject vs. two other characters:\n", third)


# ---------- 6. export for the figures ----------
WHY = {   # reason -> (short code, family shown in the figure)
    "both": ("ok", "agree"),
    "a shared codename we give to another page": ("cg", "codename"),
    "a shared codename we leave unresolved": ("cu", "codename"),
    "the page's own codename, which we read as the page itself": ("co", "codename"),
    "linked from other words": ("ow", "words"),
    "only in a comic title or a reference": ("tr", "notprose"),
    "only in the infobox": ("ib", "notprose"),
    "only in a table or caption": ("tc", "notprose"),
    "only in In other media, which we leave out": ("om", "media"),
    "named, but our matcher missed it": ("mm", "missed"),
    "the name is linked to another of our pages": ("li", "holder"),
    "the name is linked to a page outside the 303": ("lo", "outside"),
    "never linked on this page": ("nl", "never"),
}
GENERIC_Q = re.compile(r"\s*\((?:character|characters|comics|Marvel Comics|Marvel)\)$")
show = {n: GENERIC_Q.sub("", nm) for n, nm in zip(nodes.node_id, nodes.name)}


def evidence(a, b, k=2, width=150):
    """up to k sentences on a's page that name b (story sections first), trimmed, with b's names highlighted"""
    ids = sorted(men.get((a, b), []), key=lambda i: (units[i]["sec"] not in STORY, i))[:k]
    out = []
    for i in ids:
        u = units[i]
        hs = [(s, e) for s, e, c in u["spans"] if c == b]
        lo = max(0, hs[0][0] - width)
        hi = min(len(u["text"]), hs[0][1] + width)
        text = ("…" if lo else "") + u["text"][lo:hi] + ("…" if hi < len(u["text"]) else "")
        off = lo - (1 if lo else 0)
        out.append({"t": text, "h": [[s - off, e - off] for s, e in hs if s >= lo and e <= hi], "sec": u["sec"]})
    return out


def clip(line, shown, width=170):
    i = line.find(shown)
    if i < 0:
        return line[:2 * width]
    lo, hi = max(0, i - width), min(len(line), i + len(shown) + width)
    return ("…" if lo else "") + line[lo:hi] + ("…" if hi < len(line) else "")


pairs = []
for r in ledger:
    s = r["src"]
    pairs.append({"a": r["a"], "b": r["b"], "l": int(r["linked"]), "n": r["named"], "w": WHY[r["why"]][0],
                  "s": r["story"], "bk": int(r["back"]), "ev": evidence(r["a"], r["b"]),
                  "src": None if s is None else {"p": s["place"], "sh": s["shown"], "t": s["target"], "to": s["to"],
                                                 "ln": clip(s["line"], s["shown"])}})

audit = json.load(open("data/week7_audit.json")) if os.path.exists("data/week7_audit.json") else None
out = {
    "stats": {"pages": len(NODES), "sentences": len(units), "mentions": int(sum(len(u["who"]) for u in units)),
              "names_known": len(resolve), "links": len(L), "named": len(M), "both": len(L & M),
              "source_links": int(len({(r.page, r.to) for r in src.itertuples() if isinstance(r.to, str) and r.to != r.page} & L)),
              "pairs_undirected": len(Lu), "chance": round(len(Lu) / N_PAIRS, 4)},
    "why": {code: {"label": k, "family": fam} for k, (code, fam) in WHY.items()},
    "label": show,
    "mantle": sorted(MANTLE),
    "pairs": pairs,
    "dial": dial,
    "roll": roll.to_dict("records"),
    "third": {"own": [int(third.loc[True, "size"]), round(float(third.loc[True, "mean"]), 3)],
              "other": [int(third.loc[False, "size"]), round(float(third.loc[False, "mean"]), 3)]},
    "resolution": collections.Counter(r[1].split(";")[0] for r in why.values()),
    "audit": audit,
}
json.dump(out, open("../assets/week7_comention.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote ../assets/week7_comention.json", round(os.path.getsize("../assets/week7_comention.json") / 1e6, 2), "MB")
