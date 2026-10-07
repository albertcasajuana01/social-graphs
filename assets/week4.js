(function () {
  // Tradition colours, fixed order (dark-surface steps of the validated 8-slot palette); "other" is neutral.
  const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767", "#6b6a64"];
  const colorOf = (t) => COLORS[t < 0 ? 8 : t];
  const REN = "15th–16th";
  const PLOT_OPTS = { displayModeBar: false, responsive: true };
  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#ecebe6", family: "Inter, -apple-system, sans-serif", size: 12 },
    margin: { l: 60, r: 20, t: 10, b: 50 },
    showlegend: false,
    hoverlabel: { bgcolor: "#08080a", bordercolor: "#3987e5", font: { color: "#ecebe6" } },
    xaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a", linecolor: "#24242a" },
    yaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a", linecolor: "#24242a" },
  };
  const fmt = (x, d = 2) => Number(x).toFixed(d);

  fetch("../assets/week4_traditions.json")
    .then((r) => r.json())
    .then((data) => {
      data.labels = data.traditions.map((t) => t.label).concat(["Other"]);
      fillNumbers(data);
      legend("era-legend", data.labels);
      legend("tug-legend", data.labels.slice(0, 8));
      eraChart(data);
      eraTable(data);
      loyaltyChart(data);
      tugChart(data);
      hostChart(data);
      backbone(data);
    })
    .catch((err) => {
      console.error("Unable to load week 4 data:", err);
      document.querySelectorAll(".chart-plot").forEach((el) => {
        el.innerHTML = "<p class='chart-note'>The data could not be loaded.</p>";
      });
    });

  function fillNumbers(d) {
    const m = d.meta;
    const set = (k, v) => document.querySelectorAll(`[data-k="${k}"]`).forEach((el) => (el.textContent = v));
    set("nmi_u", `${fmt(m.nmi_u[0])} – ${fmt(m.nmi_u[2])}`);
    set("Q", `${fmt(m.Q_consensus)} vs ${fmt(m.Q_null[0])}`);
    set("ren", `${fmt(m.ren_mean_loyalty)} vs ${fmt(m.all_mean_loyalty)}`);
    set("bloc", `${Math.round(m.bloc_pair_mean * 100)}%`);
    set("bloc_pct", `${Math.round(m.bloc_pair_mean * 100)}%`);
    set("Qc", fmt(m.Q_consensus));
    set("Qnull", `${fmt(m.Q_null[0])} ± ${fmt(m.Q_null[1], 3)}`);
    set("nmi_lo", fmt(m.nmi_u[0]));
    set("nmi_hi", fmt(m.nmi_u[2]));
    set("nmi_uw", fmt(m.nmi_cons_u_w));
    set("nmi_w", `${fmt(m.nmi_w[0])}–${fmt(m.nmi_w[2])}`);
    set("moved", m.moved_u_to_w);
  }

  function legend(id, labels) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = labels
      .map((l, i) => `<span><span class="dot" style="background:${COLORS[i]}"></span>${l}</span>`)
      .join("");
  }

  // ---------- 1. traditions per era ----------
  function eraChart(d) {
    const x = d.eras.map((e) => e.short);
    function traces(share) {
      return d.labels.map((label, t) => ({
        type: "bar",
        name: label,
        x,
        y: d.eras.map((e) => (share ? e.counts[t] / e.n : e.counts[t])),
        customdata: d.eras.map((e) => [e.counts[t], e.n, (100 * e.counts[t]) / e.n]),
        marker: { color: COLORS[t], line: { color: "#131316", width: 1.5 } },
        hovertemplate: `<b>${label}</b><br>%{x}: %{customdata[0]} of %{customdata[1]} (%{customdata[2]:.0f}%)<extra></extra>`,
      }));
    }
    function draw(share) {
      const layout = Object.assign({}, baseLayout, {
        barmode: "stack",
        bargap: 0.28,
        margin: Object.assign({}, baseLayout.margin, { t: 30 }),
        xaxis: Object.assign({}, baseLayout.xaxis, { title: "Wikipedia century list" }),
        yaxis: Object.assign({}, baseLayout.yaxis, share
          ? { title: "share of the era's philosophers", tickformat: ".0%", range: [0, 1] }
          : { title: "philosophers" }),
        annotations: share ? [{
          x: REN, y: 1.0, yanchor: "bottom", showarrow: false,
          text: "largest tradition: 28%", font: { color: "#e0b85a", size: 11 },
        }] : [],
      });
      Plotly.react("era-plot", traces(share), layout, PLOT_OPTS);
    }
    const bShare = document.getElementById("era-share");
    const bCount = document.getElementById("era-count");
    bShare.onclick = () => { bShare.classList.add("active"); bCount.classList.remove("active"); draw(true); };
    bCount.onclick = () => { bCount.classList.add("active"); bShare.classList.remove("active"); draw(false); };
    draw(true);
  }

  function eraTable(d) {
    const body = document.querySelector("#era-table tbody");
    body.innerHTML = d.eras
      .map((e) => `<tr class="${e.short === REN ? "hot" : ""}"><td>${e.short}</td><td class="num">${e.n}</td>` +
        `<td class="num">${fmt(e.mean_loyalty)}</td><td class="num">${Math.round(e.share_below_half * 100)}%</td>` +
        `<td class="num">${Math.round(e.top_share * 100)}%</td><td class="num">${fmt(e.entropy_bits)}</td></tr>`)
      .join("");
  }

  // ---------- 2. loyalty by era ----------
  function loyaltyChart(d) {
    const traces = d.eras.map((e) => {
      const pts = d.nodes.filter((n) => n.era === e.short);
      const hot = e.short === REN;
      return {
        type: "box",
        name: e.short,
        y: pts.map((n) => n.loy),
        text: pts.map((n) => `<b>${n.name}</b><br>loyalty ${fmt(n.loy)} · degree ${n.deg}<br>${d.labels[n.t < 0 ? 8 : n.t]}`),
        hoverinfo: "text",
        boxpoints: "all",
        jitter: 0.6,
        pointpos: 0,
        marker: { size: 4, opacity: 0.55, color: hot ? "#e0b85a" : "#a3a29b" },
        line: { color: hot ? "#e0b85a" : "#8a8982", width: 1.5 },
        fillcolor: hot ? "rgba(224,184,90,0.10)" : "rgba(154,165,184,0.08)",
      };
    });
    const layout = Object.assign({}, baseLayout, {
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "Wikipedia century list" }),
      yaxis: Object.assign({}, baseLayout.yaxis, { title: "loyalty (share of 200 runs at home)", range: [-0.03, 1.05] }),
    });
    Plotly.newPlot("loyalty-plot", traces, layout, PLOT_OPTS);
  }

  // ---------- 3. tug of war ----------
  function tugChart(d) {
    const picks = d.nodes.filter((n) => n.deg >= 8).sort((a, b) => a.loy - b.loy).slice(0, 14);
    ["Aristotle", "Baruch Spinoza"].forEach((nm) => picks.push(d.nodes.find((n) => n.name === nm)));
    const names = picks.map((n) => `${n.name.replace(" (philosopher)", "")} <span style="color:#a3a29b">(${n.era})</span>`);
    const traces = d.labels.map((label, t) => ({
      type: "bar",
      orientation: "h",
      name: label,
      y: names,
      x: picks.map((n) => n.share[t]),
      marker: { color: COLORS[t], line: { color: "#131316", width: 1.5 } },
      hovertemplate: `%{y}<br><b>${label}</b>: %{x:.0%} of runs<extra></extra>`,
    }));
    const layout = Object.assign({}, baseLayout, {
      barmode: "stack",
      bargap: 0.25,
      margin: { l: 250, r: 20, t: 10, b: 45 },
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "share of the 200 Louvain runs", tickformat: ".0%", range: [0, 1] }),
      yaxis: Object.assign({}, baseLayout.yaxis, { autorange: "reversed", automargin: true }),
    });
    Plotly.newPlot("tug-plot", traces, layout, PLOT_OPTS);
  }

  // ---------- 3b. who hosts the bloc ----------
  function hostChart(d) {
    const rows = d.meta.bloc_hosts.slice().reverse();
    const layout = Object.assign({}, baseLayout, {
      margin: { l: 290, r: 40, t: 10, b: 45 },
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "runs (of 200)" }),
      yaxis: Object.assign({}, baseLayout.yaxis, { automargin: true }),
    });
    Plotly.newPlot("host-plot", [{
      type: "bar",
      orientation: "h",
      y: rows.map((r) => r[0]),
      x: rows.map((r) => r[1]),
      text: rows.map((r) => r[1]),
      textposition: "outside",
      cliponaxis: false,
      textfont: { color: "#a3a29b" },
      marker: { color: "#3987e5" },
      hovertemplate: "Galileo shares a community with %{y}<br>in %{x} of 200 runs<extra></extra>",
    }], layout, PLOT_OPTS);
  }

  // ---------- 5. backbone network ----------
  function backbone(d) {
    const svg = d3.select("#bb-svg");
    const stage = document.getElementById("bb-stage");
    const tooltip = document.getElementById("bb-tooltip");
    const W = stage.clientWidth || 800;
    const H = stage.clientHeight || 560;
    svg.attr("viewBox", [0, 0, W, H]);
    const zoomLayer = svg.append("g");
    const linkLayer = zoomLayer.append("g");
    const nodeLayer = zoomLayer.append("g");
    const labelLayer = zoomLayer.append("g").style("pointer-events", "none");
    const zoom = d3.zoom().scaleExtent([0.2, 8]).on("zoom", (e) => zoomLayer.attr("transform", e.transform));
    svg.call(zoom);

    const nodes = d.nodes.map((n) => Object.assign({}, n));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const radius = (n) => 2.2 + Math.sqrt(n.str) * 0.38;
    const loyColor = d3.scaleSequential((t) => d3.interpolateRgb("#e0b85a", "#2e2e34")(t)).domain([0, 1]);
    const topStrength = new Set(nodes.slice().sort((a, b) => b.str - a.str).slice(0, 10).map((n) => n.id));

    const state = { alpha: 0.2, mode: "u", ren: false, focus: null };
    let nodeSel, linkSel, labelSel, visNodes = [], visLinks = [], adj = new Map(), first = true;

    const sim = d3.forceSimulation()
      .force("link", d3.forceLink().id((n) => n.id).distance(18).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-22).distanceMax(260))
      .force("x", d3.forceX(W / 2).strength(0.06))
      .force("y", d3.forceY(H / 2).strength(0.06))
      .force("collide", d3.forceCollide((n) => radius(n) + 1))
      .alphaDecay(0.03)
      .on("tick", ticked);

    // datalist for search
    const list = document.getElementById("phil-list");
    nodes.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((n) => {
      const o = document.createElement("option");
      o.value = n.name;
      list.appendChild(o);
    });

    document.getElementById("bb-table").innerHTML = d.meta.backbone
      .map((r) => `<tr class="${r.alpha === 0.2 ? "hot" : ""}"><td>${r.alpha}</td><td class="num">${r.links.toLocaleString()}</td>` +
        `<td class="num">${r.attached.toLocaleString()}</td><td class="num">${r.giant.toLocaleString()}</td></tr>`)
      .join("");

    function rebuild() {
      const links = d.edges.filter((e) => e.p < state.alpha).map((e) => ({ source: e.s, target: e.t, w: e.w }));
      const ids = new Set();
      links.forEach((l) => { ids.add(l.source); ids.add(l.target); });
      visNodes = nodes.filter((n) => ids.has(n.id));
      visLinks = links;
      adj = new Map(visNodes.map((n) => [n.id, new Set()]));
      links.forEach((l) => { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); });
      visNodes.forEach((n) => {
        if (n.x === undefined) { n.x = W / 2 + (Math.random() - 0.5) * W * 0.6; n.y = H / 2 + (Math.random() - 0.5) * H * 0.6; }
      });

      linkSel = linkLayer.selectAll("line").data(visLinks, (l) => `${l.source.id ?? l.source}-${l.target.id ?? l.target}`)
        .join("line")
        .attr("stroke", "#3a3a40")
        .attr("stroke-width", (l) => 0.4 + Math.min(l.w, 12) * 0.12);

      nodeSel = nodeLayer.selectAll("circle").data(visNodes, (n) => n.id)
        .join("circle")
        .attr("r", radius)
        .attr("stroke", "#08080a")
        .attr("stroke-width", 0.6)
        .style("cursor", "pointer")
        .on("mouseenter", (e, n) => showTip(e, n))
        .on("mousemove", moveTip)
        .on("mouseleave", () => (tooltip.style.opacity = 0))
        .on("click", (e, n) => { e.stopPropagation(); state.focus = state.focus === n.id ? null : n.id; paint(); })
        .call(d3.drag()
          .on("start", (e, n) => { if (!e.active) sim.alphaTarget(0.2).restart(); n.fx = n.x; n.fy = n.y; })
          .on("drag", (e, n) => { n.fx = e.x; n.fy = e.y; })
          .on("end", (e, n) => { if (!e.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));

      labelSel = labelLayer.selectAll("text").data(visNodes.filter((n) => topStrength.has(n.id)), (n) => n.id)
        .join("text")
        .text((n) => n.name)
        .attr("font-size", 10)
        .attr("fill", "#ecebe6")
        .attr("stroke", "#08080a")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .attr("text-anchor", "middle");

      sim.nodes(visNodes);
      sim.force("link").links(visLinks);
      // settle off-screen first so the figure opens as a layout, not a hairball
      sim.stop().alpha(first ? 1 : 0.5);
      for (let i = 0; i < (first ? 300 : 150); i++) sim.tick();
      first = false;
      ticked();
      sim.alpha(0.05).restart();
      countLabel();
      paint();
    }

    function countLabel() {
      // giant component via union-find
      const parent = new Map(visNodes.map((n) => [n.id, n.id]));
      const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
      visLinks.forEach((l) => {
        const a = find(l.source.id ?? l.source), b = find(l.target.id ?? l.target);
        if (a !== b) parent.set(a, b);
      });
      const sizes = new Map();
      visNodes.forEach((n) => { const r = find(n.id); sizes.set(r, (sizes.get(r) || 0) + 1); });
      const giant = Math.max(0, ...sizes.values());
      document.getElementById("bb-count").textContent =
        `Disparity filter at α = ${state.alpha.toFixed(2)}: ${visLinks.length.toLocaleString()} of 9,139 links kept, ` +
        `${visNodes.length} of 1,374 philosophers attached, giant component ${giant}. ` +
        `Node size = strength; the ten strongest are labelled. Colours are computed on the full network, not the backbone.`;
    }

    function colorFor(n) {
      if (state.mode === "loy") return loyColor(n.loy);
      return colorOf(state.mode === "w" ? n.tw : n.t);
    }

    function paint() {
      const f = state.focus;
      const nb = f !== null && adj.has(f) ? adj.get(f) : null;
      const dim = (n) => (state.ren && n.era !== REN) || (nb && n.id !== f && !nb.has(n.id));
      nodeSel.attr("fill", colorFor)
        .attr("opacity", (n) => (dim(n) ? 0.12 : 1))
        .attr("stroke", (n) => (n.id === f ? "#ffffff" : "#08080a"))
        .attr("stroke-width", (n) => (n.id === f ? 2 : 0.6));
      linkSel.attr("stroke-opacity", (l) => {
        const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
        if (nb) return s === f || t === f ? 0.9 : 0.04;
        if (state.ren) return byId.get(s).era === REN || byId.get(t).era === REN ? 0.6 : 0.05;
        return 0.35;
      });
      labelSel.attr("opacity", (n) => (dim(n) ? 0.15 : 1));
      if (state.mode === "loy") {
        document.getElementById("bb-legend").innerHTML =
          `<span><span class="dot" style="background:${loyColor(0)}"></span>unstable (home in 0% of runs)</span>` +
          `<span><span class="dot" style="background:${loyColor(0.5)}"></span>50%</span>` +
          `<span><span class="dot" style="background:${loyColor(1)}"></span>always home</span>`;
      } else {
        legend("bb-legend", d.labels);
      }
    }

    function ticked() {
      linkSel.attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y)
        .attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
      nodeSel.attr("cx", (n) => n.x).attr("cy", (n) => n.y);
      labelSel.attr("x", (n) => n.x).attr("y", (n) => n.y - radius(n) - 3);
    }

    function showTip(e, n) {
      const lu = d.labels[n.t < 0 ? 8 : n.t], lw = d.labels[n.tw < 0 ? 8 : n.tw];
      tooltip.innerHTML = `<strong>${n.name}</strong> <span class="td">${n.era}</span>` +
        `<div class="td">${lu}${lw !== lu ? ` → weighted: ${lw}` : ""}</div>` +
        `<div class="td">loyalty ${fmt(n.loy)} · degree ${n.deg} · strength ${n.str}</div>`;
      tooltip.style.opacity = 1;
      moveTip(e);
    }
    function moveTip(e) {
      const r = stage.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      if (x > r.width - 250) x -= 270;
      if (y > r.height - 90) y -= 100;
      tooltip.style.left = x + "px";
      tooltip.style.top = y + "px";
    }

    svg.on("click", () => { state.focus = null; paint(); });

    const slider = document.getElementById("alpha");
    const out = document.getElementById("alpha-out");
    slider.addEventListener("input", () => { out.textContent = (+slider.value).toFixed(2); });
    slider.addEventListener("change", () => { state.alpha = +slider.value; rebuild(); });

    document.querySelectorAll(".seg button[data-mode]").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".seg button[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
        state.mode = b.dataset.mode;
        paint();
      });
    });
    const ren = document.getElementById("toggle-ren");
    ren.addEventListener("change", () => { state.ren = ren.checked; ren.parentElement.classList.toggle("on", ren.checked); paint(); });
    document.getElementById("reheat-btn").addEventListener("click", () => sim.alpha(0.8).restart());

    document.getElementById("phil-search").addEventListener("change", (e) => {
      const n = nodes.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
      if (!n) return;
      if (!adj.has(n.id)) {
        document.getElementById("bb-count").textContent =
          `${n.name} has no link that survives the filter at α = ${state.alpha.toFixed(2)}. Try a larger α.`;
        return;
      }
      state.focus = n.id;
      paint();
      const k = 2.2;
      svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * n.x, H / 2 - k * n.y).scale(k));
    });

    rebuild();
  }
})();
