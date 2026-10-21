"""Week 7: freeze the wiki source of every page as it was on the snapshot date.

The course text is the rendered prose. It has no infoboxes or tables, and it does
not say which words were links. To check *why* a link and the text disagree, we need
the source: every [[target|shown text]] with its place on the page. We take, for each
of the 303 pages, the last revision on or before the course snapshot (2026-08-26),
plus every redirect title that leads to each page (so [[Jessica Drew]] counts as a
link to Spider-Woman (Jessica Drew)).

Writes data/week7_wikitext.json.gz and data/week7_redirects.json. Needs pandas (and network access, once).
"""
import gzip
import json
import time
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd

SNAPSHOT = "2026-08-26T23:59:59Z"
UA = {"User-Agent": "dtu-02805-course-project/1.0 (https://github.com/albertcasajuana01/social-graphs)"}


def api(**params):
    body = urllib.parse.urlencode({**params, "format": "json", "formatversion": 2, "maxlag": 5}).encode()
    for wait in (2, 5, 15, 30, 60):
        time.sleep(wait / 2)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request("https://en.wikipedia.org/w/api.php", data=body, headers=UA)))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(wait)
    raise RuntimeError("rate limited")


nodes = pd.read_csv("data/week1_nodes.tsv", sep="\t", comment="#", quoting=3)

# The page's own history, not where its title redirects today: ten Morituri pages (Silencer among them), Vindicator and
# Dargo Ktor were merged into other articles after the snapshot, and the redirect would hand us the merged article.
MOVED = {"Vindicator_(comics)": "Heather Hudson"}   # moved after the snapshot; its old title is now a disambiguation page
src = {}
for n in nodes.node_id:
    ask = dict(action="query", prop="revisions", titles=MOVED.get(n, n.replace("_", " ")), rvprop="ids|timestamp|content",
               rvslots="main", rvstart=SNAPSHOT, rvdir="older", rvlimit=1)
    p = api(**ask)["query"]["pages"][0]
    if "revisions" not in p:                       # history moved with the article (Vindicator): follow the move
        p = api(**ask, redirects=1)["query"]["pages"][0]
    rev = p["revisions"][0]
    now = api(action="query", titles=n.replace("_", " "), redirects=1)["query"]["pages"][0]["title"]
    src[n] = {"title_now": now, "revid": rev["revid"], "timestamp": rev["timestamp"],
              "wikitext": rev["slots"]["main"]["content"]}
with gzip.open("data/week7_wikitext.json.gz", "wt", encoding="utf-8") as f:
    json.dump(src, f, ensure_ascii=False)

# every title that redirects to each page (pages merged into one article since the snapshot keep only their own title)
now = pd.Series({n: s["title_now"] for n, s in src.items()})
shared = set(now[now.duplicated(keep=False)])
redirects = {n: [n.replace("_", " ")] for n in nodes.node_id}
owner = {t: n for n, t in now.items() if t not in shared}
titles = sorted(owner)
for i in range(0, len(titles), 50):
    cont = {}
    while True:
        r = api(action="query", prop="redirects", titles="|".join(titles[i:i + 50]), rdlimit="max", rdnamespace=0, **cont)
        for p in r["query"]["pages"]:
            n = owner.get(p["title"])
            if n:
                redirects[n] += [p["title"]] + [x["title"] for x in p.get("redirects", [])]
        if "continue" not in r:
            break
        cont = r["continue"]
json.dump({n: sorted(set(v)) for n, v in redirects.items()}, open("data/week7_redirects.json", "w"), ensure_ascii=False, indent=1)
print(len(src), "pages;", sum(len(v) for v in redirects.values()), "titles that lead to them")
