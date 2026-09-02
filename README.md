# The Marvel Web

Group site for **02805 Social Graphs & Interactions** (DTU) — [live site](https://albertcasajuana01.github.io/the-marvel-web/).

Each week we add one post exploring the shared Marvel Comics superhero network
(303 characters from Wikipedia's `Category:Marvel Comics superheroes`, and the
links between their pages).

## Group

- Albert Casajuana ([@albertcasajuana01](https://github.com/albertcasajuana01))
- [@viktorguijarro](https://github.com/viktorguijarro)
- [@mariona2ca](https://github.com/mariona2ca)

## Structure

```
index.html              — post listing
posts/                  — one HTML page per week's post
style.css                — shared site styling
assets/                  — figures embedded in posts
analysis/                — the notebook(s) and data behind each post
  distribution_as_code.ipynb
  make_figures.py        — regenerates the network figures in assets/
  data/                   — frozen weekly snapshots from the course data page
```

## Reproducing week 1

```bash
cd analysis
jupyter nbconvert --to notebook --execute --inplace distribution_as_code.ipynb
python make_figures.py
```

## Publishing

Plain static HTML/CSS, served by GitHub Pages from the `master` branch root —
no build step. Push to `master` and the live site updates within a minute or two.
