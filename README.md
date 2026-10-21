# social-graphs

Group repo for **02805 Social Graphs & Interactions** (DTU) — [live site: The Marvel Web](https://albertcasajuana01.github.io/social-graphs/).

Renamed from `the-marvel-web`: this repo will hold every week's post (and eventually
the final project), not just the Marvel network work.

Each week we add one post exploring the shared Marvel Comics superhero network
(303 characters from Wikipedia's `Category:Marvel Comics superheroes`, and the
links between their pages) — with actual interactive figures, not screenshots:
a draggable, searchable D3 force-directed graph and live Plotly degree-distribution
charts, both fed by JSON exported from the analysis notebook.

## Group

- Albert Casajuana ([@albertcasajuana01](https://github.com/albertcasajuana01))
- [@viktorguijarro](https://github.com/viktorguijarro)
- [@mariona2ca](https://github.com/mariona2ca)

## Structure

```
index.html                 — post listing
posts/                      — one HTML page per week's post
style.css                    — shared site styling (classic light theme: Source Serif 4 + Inter, DTU red accent)
assets/
  site.js                     — shared navigation: Weekly posts menu, breadcrumbs, prev/next, reading progress, contents rail
  week6.js, week6.css         — week-6 figures (pair inspector, lookalike wall, rewiring, scatter, gender)
  week7.js, week7.css         — week-7 figures (named by vs linked by, the two ledgers, co-mention dial, audit samples)
  network.js, network.json    — interactive D3 force-directed network (posts/week1)
  charts.js, degree_data.json — interactive Plotly degree-distribution charts
  giant-component.png, morituri-island.png — static fallback figures (pre-interactive draft)
analysis/                    — the notebook(s) and data behind each post
  distribution_as_code.ipynb
  make_figures.py              — regenerates the static fallback figures
  export_data.py               — regenerates network.json / degree_data.json
  week2_models.py              — regenerates week2_models.json (CCDF vs. null models)
  week3_robustness.py          — regenerates week3_robustness.json (attack vs. random failure)
  week4_renaissance.py         — regenerates week4_traditions.json (Louvain consensus, loyalty, backbone)
  week5_copying.py             — regenerates week5_copying.json (shared 8-gram passages between pages)
  week6_names.py               — regenerates week6_names.json + week6_conc.json (TF-IDF cosine split into names / paperwork / story)
  week7_fetch_aliases.py       — one-off: freezes Wikidata aliases + where Wikipedia sends each candidate name
  week7_fetch_wikitext.py      — one-off: freezes each page's wiki source at the snapshot date + redirect titles
  week7_comention.py           — regenerates week7_comention.json (name resolution, mention/co-mention networks vs links)
  data/                         — frozen weekly snapshots from the course data page
```

## Reproducing week 1

```bash
cd analysis
jupyter nbconvert --to notebook --execute --inplace distribution_as_code.ipynb
python export_data.py     # writes ../assets/network.json and ../assets/degree_data.json
python make_figures.py    # optional: static PNG fallbacks
```

## Reproducing week 2

```bash
cd analysis
python week2_models.py    # writes ../assets/week2_models.json (needs networkx, numpy, pandas, powerlaw)
```

## Reproducing week 3

```bash
cd analysis
python week3_robustness.py   # writes ../assets/week3_robustness.json (needs networkx, numpy, pandas)
```

## Reproducing week 4

Week 4 uses the course's philosopher network (`analysis/data/week4_philosophers_*.tsv`) instead of Marvel.

```bash
cd analysis
python week4_renaissance.py   # ~2.5 min; writes ../assets/week4_traditions.json (needs networkx, numpy, pandas, scikit-learn)
```

## Reproducing week 5

Week 5 adds the page text (`analysis/data/marvel_pages.zip`, the course's week-5 release).

```bash
cd analysis
python week5_copying.py   # ~1 min; writes ../assets/week5_copying.json (needs networkx, numpy, pandas)
```

## Reproducing week 6

```bash
cd analysis
python week6_names.py   # ~20 s; writes ../assets/week6_names.json and ../assets/week6_conc.json (needs networkx, numpy, pandas, scikit-learn)
```

## Reproducing week 7

Week 7 resolves character names with Wikipedia's own redirects and reads each page's wiki source, both
frozen in `analysis/data/` (`week7_name_targets.json`, `week7_wikidata_aliases.json`, `week7_wikitext.json.gz`,
`week7_redirects.json`), so the analysis runs offline. The hand-labelled audit samples are in `week7_audit.json`.

```bash
cd analysis
python week7_comention.py   # ~1 min; writes ../assets/week7_comention.json (needs networkx, numpy, pandas, scikit-learn, mwparserfromhell)
# only to refetch the frozen inputs (network access, ~15 min):
python week7_fetch_aliases.py && python week7_fetch_wikitext.py
```

## Publishing

Plain static HTML/CSS/JS (D3 + Plotly from CDN, no build step), served by GitHub Pages
from the `master` branch root. Push to `master` and the live site updates within a
minute or two.
