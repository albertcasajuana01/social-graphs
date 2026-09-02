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
style.css                    — shared site styling (comic/pop-art dark theme)
assets/
  network.js, network.json    — interactive D3 force-directed network (posts/week1)
  charts.js, degree_data.json — interactive Plotly degree-distribution charts
  giant-component.png, morituri-island.png — static fallback figures (pre-interactive draft)
analysis/                    — the notebook(s) and data behind each post
  distribution_as_code.ipynb
  make_figures.py              — regenerates the static fallback figures
  export_data.py               — regenerates network.json / degree_data.json
  data/                         — frozen weekly snapshots from the course data page
```

## Reproducing week 1

```bash
cd analysis
jupyter nbconvert --to notebook --execute --inplace distribution_as_code.ipynb
python export_data.py     # writes ../assets/network.json and ../assets/degree_data.json
python make_figures.py    # optional: static PNG fallbacks
```

## Publishing

Plain static HTML/CSS/JS (D3 + Plotly from CDN, no build step), served by GitHub Pages
from the `master` branch root. Push to `master` and the live site updates within a
minute or two.
