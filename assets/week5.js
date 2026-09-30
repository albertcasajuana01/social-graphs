(function () {
  const PROSE = "#6b7385";
  const COPIED = "#d55181";
  const PARA = "#ffd23f";
  const PHRASE = "#4a5572";
  const PLOT_OPTS = { displayModeBar: false, responsive: true };
  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#e8ecf4", family: "Inter, sans-serif", size: 12 },
    margin: { l: 190, r: 20, t: 10, b: 50 },
    hoverlabel: { bgcolor: "#05070c", bordercolor: "#6c63ff", font: { color: "#e8ecf4" } },
    xaxis: { gridcolor: "#232b3d", zerolinecolor: "#232b3d", linecolor: "#232b3d" },
    yaxis: { gridcolor: "#232b3d", zerolinecolor: "#232b3d", linecolor: "#232b3d" },
  };
  const pct = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  fetch("../assets/week5_copying.json")
    .then((r) => r.json())
    .then((d) => {
      fillNumbers(d);
      sectionChart(d);
      borrowedTable(d);
      sensitivityTable(d);
      copyNetwork(d);
    })
    .catch((err) => {
      console.error("Unable to load week 5 data:", err);
      document.querySelectorAll(".chart-plot, .net-stage").forEach((el) => {
        el.innerHTML = "<p class='chart-note'>The data could not be loaded.</p>";
      });
    });

  function fillNumbers(d) {
    const s = d.stats;
    const set = (k, v) => document.querySelectorAll(`[data-k="${k}"]`).forEach((el) => (el.textContent = v));
    const sec = Object.fromEntries(d.sections.map((x) => [x.section, x]));
    set("edges", s.edges);
    set("pages_copying", s.pages_copying);
    set("para", s.paragraph_edges);
    set("para_linked", `${s.paragraph_edges} of ${s.paragraph_edges}`);
    set("density", pct(s.link_density, 1));
    set("frac_linked", pct(s.frac_linked));
    set("bio", `${pct(sec["Fictional character biography"].copied)} vs ${pct(sec["Fictional character biography"].all)}`);
    set("copied_tokens", s.copied_tokens.toLocaleString("en"));
    set("tokens", s.tokens.toLocaleString("en"));
  }

  // ---------- 1. where the copied text sits ----------
  function sectionChart(d) {
    const rows = d.sections.slice().sort((a, b) => a.all - b.all);
    const y = rows.map((r) => r.section);
    const traces = [
      {
        type: "bar", orientation: "h", name: "share of all prose", y, x: rows.map((r) => r.all),
        marker: { color: PROSE }, hovertemplate: "%{y}<br>%{x:.1%} of all prose<extra></extra>",
      },
      {
        type: "bar", orientation: "h", name: "share of copied text", y, x: rows.map((r) => r.copied),
        marker: { color: COPIED }, hovertemplate: "%{y}<br>%{x:.1%} of copied text<extra></extra>",
      },
    ];
    const layout = Object.assign({}, baseLayout, {
      barmode: "group", bargap: 0.25, bargroupgap: 0.08,
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.08, font: { color: "#9aa5b8" } },
      margin: { l: 190, r: 20, t: 36, b: 44 },
      xaxis: Object.assign({}, baseLayout.xaxis, { tickformat: ".0%", title: { text: "share of tokens", font: { color: "#9aa5b8" } } }),
      yaxis: Object.assign({}, baseLayout.yaxis, { automargin: true }),
    });
    Plotly.newPlot("section-plot", traces, layout, PLOT_OPTS);
  }

  // ---------- tables ----------
  function borrowedTable(d) {
    const tb = document.querySelector("#borrowed-table tbody");
    tb.innerHTML = d.borrowed.slice(0, 12).map((r) => `
      <tr><td>${esc(r.name)}</td><td class="num">${pct(r.borrowed, 1)}</td>
      <td class="num">${r.tokens.toLocaleString("en")}</td><td class="num">${r.indeg}</td></tr>`).join("");
  }

  function sensitivityTable(d) {
    const tb = document.querySelector("#sens-table tbody");
    tb.innerHTML = d.sensitivity.map((r) => {
      const main = r.max_pages === d.params.MAX_PAGES && r.min_passage === d.params.MIN_PASSAGE;
      return `<tr class="${main ? "hot" : ""}"><td class="num">${r.max_pages}</td><td class="num">${r.min_passage}</td>
        <td class="num">${r.edges}</td><td class="num">${pct(r.linked)}</td>
        <td class="num">${r.paragraphs} (${pct(r.paragraphs_linked)})</td>
        <td class="num">${pct(r.pub)}</td><td class="num">${pct(r.bio)}</td></tr>`;
    }).join("");
  }

  // ---------- 2. the copying network ----------
  function copyNetwork(d) {
    const stage = document.getElementById("cp-stage");
    const svg = d3.select("#cp-svg");
    const tip = document.getElementById("cp-tooltip");
    const panel = document.getElementById("cp-panel");
    const W = stage.clientWidth, H = stage.clientHeight;
    svg.attr("viewBox", [0, 0, W, H]);

    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const nodes = d.nodes.map((n) => Object.assign({}, n));
    const links = d.edges.map((e) => Object.assign({ source: e.a, target: e.b }, e));
    const r = d3.scaleSqrt().domain([0, d3.max(nodes, (n) => n.tokens)]).range([3, 20]);
    const fill = d3.scaleSequential(d3.interpolateRgb("#3a4460", "#ff6ec7")).domain([0, 0.25]).clamp(true);
    const width = d3.scaleSqrt().domain([30, d3.max(links, (l) => l.shared)]).range([1, 7]);
    const labelled = new Set(links.filter((l) => l.kind === "paragraph").flatMap((l) => [l.a, l.b]));

    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on("zoom", (ev) => g.attr("transform", ev.transform)));

    const link = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", (l) => (l.kind === "paragraph" ? PARA : PHRASE))
      .attr("stroke-opacity", (l) => (l.kind === "paragraph" ? 0.85 : 0.9))
      .attr("stroke-width", (l) => width(l.shared))
      .attr("stroke-dasharray", (l) => (l.linked ? null : "4 3"))
      .style("cursor", "pointer")
      .on("mousemove", (ev, l) => showTip(ev, `<strong>${esc(byId.get(l.a).name)} ↔ ${esc(byId.get(l.b).name)}</strong>
          <div class="td">${l.shared} copied tokens in ${l.passages} passage(s), longest ${l.longest}<br>${l.linked ? "the pages are linked" : "<b>no link</b> between the pages"}<br>click to read it</div>`))
      .on("mouseleave", hideTip)
      .on("click", (ev, l) => showEdge(l));

    const node = g.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("r", (n) => r(n.tokens))
      .attr("fill", (n) => fill(n.borrowed))
      .attr("stroke", "#05070c").attr("stroke-width", 1.2)
      .style("cursor", "pointer")
      .on("mousemove", (ev, n) => showTip(ev, `<strong>${esc(n.name)}</strong>
          <div class="td">${pct(n.borrowed, 1)} of its prose is shared with another page<br>${n.tokens.toLocaleString("en")} tokens · linked to by ${n.indeg} pages</div>`))
      .on("mouseleave", hideTip)
      .on("click", (ev, n) => showNode(n))
      .call(d3.drag()
        .on("start", (ev, n) => { if (!ev.active) sim.alphaTarget(0.2).restart(); n.fx = n.x; n.fy = n.y; })
        .on("drag", (ev, n) => { n.fx = ev.x; n.fy = ev.y; })
        .on("end", (ev, n) => { if (!ev.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));

    const label = g.append("g").selectAll("text").data(nodes.filter((n) => labelled.has(n.id))).join("text")
      .text((n) => n.name.replace(/ \((character|Marvel Comics)\)$/, ""))
      .attr("font-size", 10).attr("fill", "#c9d1e0").attr("pointer-events", "none")
      .attr("paint-order", "stroke").attr("stroke", "#05070c").attr("stroke-width", 3);

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((n) => n.id).distance(55).strength(0.9))
      .force("charge", d3.forceManyBody().strength(-60))
      .force("collide", d3.forceCollide((n) => r(n.tokens) + 3))
      .force("x", d3.forceX(W / 2).strength(0.07))
      .force("y", d3.forceY(H / 2).strength(0.1))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    sim.on("tick", draw);
    draw();

    function draw() {
      link.attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y)
        .attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
      node.attr("cx", (n) => n.x).attr("cy", (n) => n.y);
      label.attr("x", (n) => n.x + r(n.tokens) + 3).attr("y", (n) => n.y + 3);
    }

    function showTip(ev, html) {
      const box = stage.getBoundingClientRect();
      tip.innerHTML = html;
      tip.style.opacity = 1;
      tip.style.left = `${Math.min(ev.clientX - box.left + 14, box.width - 250)}px`;
      tip.style.top = `${ev.clientY - box.top + 12}px`;
    }
    function hideTip() { tip.style.opacity = 0; }

    function edgeHtml(l) {
      const a = byId.get(l.a), b = byId.get(l.b);
      return `<div class="passage">
        <div class="hp-meta"><b>${esc(a.name)}</b> · ${esc(l.section_a)} &nbsp;↔&nbsp; <b>${esc(b.name)}</b> · ${esc(l.section_b)}</div>
        <div class="hp-meta">${l.shared} copied tokens (${pct(l.share_a)} of ${esc(a.name)}, ${pct(l.share_b)} of ${esc(b.name)}) ·
          ${l.passages} passage(s) · ${l.linked ? "the pages are linked" : "<b>the pages do not link</b>"}</div>
        <blockquote>…${esc(l.text)}…</blockquote></div>`;
    }
    function open(title, meta, body) {
      panel.hidden = false;
      panel.innerHTML = `<div class="hp-head"><div><h3>${title}</h3><div class="hp-meta">${meta}</div></div>
        <button class="hp-close" aria-label="Close">✕</button></div>${body}`;
      panel.querySelector(".hp-close").onclick = () => { panel.hidden = true; highlight(null); };
    }
    function showEdge(l) {
      highlight(new Set([l.a, l.b]), l);
      open(`${esc(byId.get(l.a).name)} ↔ ${esc(byId.get(l.b).name)}`, "Longest passage the two pages share word for word", edgeHtml(l));
    }
    function showNode(n) {
      const mine = links.filter((l) => l.a === n.id || l.b === n.id);
      highlight(new Set(mine.flatMap((l) => [l.a, l.b])));
      open(esc(n.name), `${pct(n.borrowed, 1)} of its ${n.tokens.toLocaleString("en")} tokens appear on another page · linked to by ${n.indeg} pages`,
        mine.map(edgeHtml).join(""));
    }
    function highlight(set, edge) {
      node.attr("opacity", (n) => (!set || set.has(n.id) ? 1 : 0.35));
      label.attr("opacity", (n) => (!set || set.has(n.id) ? 1 : 0.35));
      link.attr("opacity", (l) => (!set ? 1 : edge ? (l === edge ? 1 : 0.3) : set.has(l.a) && set.has(l.b) ? 1 : 0.3));
    }

    // search
    const list = document.getElementById("cp-list");
    list.innerHTML = nodes.map((n) => `<option value="${esc(n.name)}">`).join("");
    document.getElementById("cp-search").addEventListener("change", (ev) => {
      const n = nodes.find((x) => x.name.toLowerCase() === ev.target.value.trim().toLowerCase());
      if (n) showNode(n);
    });
    document.getElementById("cp-reheat").onclick = () => sim.alpha(0.8).restart();
    showEdge(links[1]);   // open on Cyclops ↔ Jean Grey
  }
})();
