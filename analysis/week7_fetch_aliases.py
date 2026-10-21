"""Week 7: freeze the names each character goes by, and what Wikipedia says each name means.

The page text calls Spider-Man "Peter Parker" as often as "Spider-Man", so finding
characters in the text needs more names than the page titles. We collect candidate
names from three places:
  - the page title without its "(Marvel Comics)"-style qualifier,
  - the English Wikidata label and aliases of the character,
  - the parenthesis in the first sentence ("The Abomination (Emil Blonsky) is ...").
Then we ask Wikipedia where each name leads (following redirects). A name will only
count for a character if Wikipedia sends it to that character's page: "Peter Parker"
lands on Spider-Man, but "Steve Rogers" lands on Captain America, who is not one of
our 303 pages, even though William Burnside also used that name.

Both steps hit the network, so we run them once and store the answers.
Writes data/week7_wikidata_aliases.json and data/week7_name_targets.json. Needs pandas.
"""
import collections
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd

UA = {"User-Agent": "dtu-02805-course-project/1.0 (https://github.com/albertcasajuana01/social-graphs)"}
NICK = {"Jonathan": "Johnny", "Daniel": "Danny", "Anthony": "Tony", "Robert": "Bobby", "William": "Billy",
        "James": "Jimmy", "Theodore": "Teddy", "Patricia": "Patsy", "Elizabeth": "Betsy", "Richard": "Ricky",
        "Edward": "Eddie", "Samuel": "Sam", "Thomas": "Tommy", "Charles": "Charlie", "Matthew": "Matt"}


def api(host, **params):
    body = urllib.parse.urlencode({**params, "format": "json", "maxlag": 5}).encode()
    for wait in (2, 5, 15, 30, 60):
        time.sleep(wait / 2)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(f"https://{host}/w/api.php", data=body, headers=UA)))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(wait)
    raise RuntimeError("rate limited")


nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#", quoting=3)

# ---------- 1. Wikidata labels and aliases ----------
WD = "data/week7_wikidata_aliases.json"
if not os.path.exists(WD):
    qids = nodes.wikidata_id.dropna().unique().tolist()
    got = {}
    for i in range(0, len(qids), 50):
        for qid, e in api("www.wikidata.org", action="wbgetentities", ids="|".join(qids[i:i + 50]),
                          props="labels|aliases", languages="en")["entities"].items():
            got[qid] = {"label": e.get("labels", {}).get("en", {}).get("value"),
                        "aliases": [a["value"] for a in e.get("aliases", {}).get("en", [])]}
    json.dump({n: got.get(q, {"label": None, "aliases": []}) for n, q in zip(nodes.node_id, nodes.wikidata_id)},
              open(WD, "w"), ensure_ascii=False, indent=1)
wd = json.load(open(WD))

# ---------- 2. candidate names ----------
cands = {}   # name -> {node: source}


def add(name, n, how):
    name = re.sub(r"\s+", " ", name.replace('"', "").replace("“", "").replace("”", "")).strip(" ,.")
    if len(name) >= 3 and re.search(r"[A-Z]", name):
        cands.setdefault(name, {}).setdefault(n, how)
        words = name.split()
        if 3 <= len(words) <= 4 and all(w[:1].isupper() for w in words):
            add(words[0] + " " + words[-1], n, how + "/short")          # Peter Benjamin Parker -> Peter Parker
        if len(words) == 2 and words[0] in NICK:
            add(NICK[words[0]] + " " + words[1], n, how + "/nick")     # Jonathan Storm -> Johnny Storm


for n, name, d in zip(nodes.node_id, nodes.name, nodes.description.fillna("")):
    add(re.sub(r"\s*\([^()]*\)$", "", name), n, "title")
    m = re.search(r"\(([^()]+)\)$", name)
    if m and not re.search(r"comics|character|Marvel|film|universe|Morituri|Inhuman|Heroes for Hire|New Universe", m.group(1), re.I):
        add(m.group(1), n, "title")                                   # Ghost Rider (Danny Ketch) -> Danny Ketch
    if wd[n]["label"]:
        add(wd[n]["label"], n, "wikidata")
    for a in wd[n]["aliases"]:
        add(a, n, "wikidata")
    m = re.match(r"^(?:The )?[^(]{0,60}?\(([^)]+)\)", d)
    if m:
        for part in re.split(r";|,| also known as | or ", m.group(1)):
            if part.strip() and not re.match(r"^\w+:", part.strip()):
                add(part, n, "first sentence")

# ---------- 3. where does Wikipedia send each name? ----------
# The node titles go in too: a few pages were renamed after the course snapshot
# (Spider-Woman (Gwen Stacy) is now "Spider-Gwen"), so a name that lands on the new
# title still means the snapshot's node.
names = sorted(cands)
asked = names + [n.replace("_", " ") for n in nodes.node_id]
landed = {}
for i in range(0, len(asked), 50):
    chunk = asked[i:i + 50]
    r = api("en.wikipedia.org", action="query", titles="|".join(chunk), redirects=1, prop="pageprops", ppprop="disambiguation")["query"]
    hop = {x["from"]: x["to"] for x in r.get("normalized", [])}
    redir = {x["from"]: x["to"] for x in r.get("redirects", [])}
    pages = {p["title"]: p for p in r["pages"].values()}
    for s in chunk:
        t = hop.get(s, s)
        t = redir.get(t, t)
        p = pages.get(t, {})
        if "missing" in p or "invalid" in p or not p:
            landed[s] = None                                          # no Wikipedia page by this name
        elif "pageprops" in p and "disambiguation" in p["pageprops"]:
            landed[s] = "(disambiguation)"
        else:
            landed[s] = t.replace(" ", "_")
lands = collections.Counter(landed[n.replace("_", " ")] for n in nodes.node_id)
now = {landed[n.replace("_", " ")]: n for n in nodes.node_id      # only a rename that one node owns; merged pages
       if landed[n.replace("_", " ")] not in (None, "(disambiguation)") and lands[landed[n.replace("_", " ")]] == 1}
target = {s: now.get(landed[s], landed[s]) for s in names}
moved = {n: landed[n.replace("_", " ")] for n in nodes.node_id if landed[n.replace("_", " ")] != n}
print("pages renamed since the snapshot:", moved)

json.dump({s: {"proposed_by": cands[s], "wikipedia_target": target[s]} for s in names},
          open("data/week7_name_targets.json", "w"), ensure_ascii=False, indent=1)
print(len(names), "candidate names;", sum(t is None for t in target.values()), "without a page;",
      sum(t == "(disambiguation)" for t in target.values()), "disambiguation pages")
