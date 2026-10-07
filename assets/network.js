(function () {
  const svg = d3.select("#network-svg");
  const stage = document.getElementById("network-stage");
  const tooltip = document.getElementById("network-tooltip");
  const panel = document.getElementById("hero-panel");
  const searchInput = document.getElementById("hero-search");
  const searchList = document.getElementById("hero-list");
  const diceBtn = document.getElementById("dice-btn");
  const resetBtn = document.getElementById("reset-view-btn");
  const toggleIsolates = document.getElementById("toggle-isolates");
  const toggleMorituri = document.getElementById("toggle-morituri");
  const toggleArrows = document.getElementById("toggle-arrows");
  const countLabel = document.getElementById("net-count-label");

  const rect = stage.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 560;

  svg.attr("viewBox", [0, 0, width, height]);

  const zoomLayer = svg.append("g");
  const linkLayer = zoomLayer.append("g").attr("class", "links");
  const nodeLayer = zoomLayer.append("g").attr("class", "nodes");

  const defs = svg.append("defs");
  defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#8a8982");

  const zoomBehavior = d3.zoom().scaleExtent([0.15, 6]).on("zoom", (event) => {
    zoomLayer.attr("transform", event.transform);
  });
  svg.call(zoomBehavior);

  let nodeSel, linkSel, nodesData, edgesData, byId, activeId = null;

  function compLabel(c) {
    return c === "giant" ? "giant component" : c === "morituri" ? "Morituri island" : "isolate";
  }

  fetch("../assets/network.json")
    .then((r) => r.json())
    .then((data) => {
      nodesData = data.nodes;
      edgesData = data.edges;
      byId = new Map(nodesData.map((d) => [d.id, d]));

      countLabel.textContent =
        `${data.meta.n} characters · ${data.meta.m_undir} links · ` +
        `giant component ${data.meta.giant} · Morituri island ${data.meta.morituri} · ${data.meta.isolates} isolates`;

      const maxIn = d3.max(nodesData, (d) => d.in) || 1;
      const color = d3.scaleSequential(d3.interpolatePlasma).domain([0, maxIn]);
      const radius = (d) => 3.2 + Math.sqrt(d.in) * 1.8;

      nodesData
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((d) => {
          const opt = document.createElement("option");
          opt.value = d.name;
          searchList.appendChild(opt);
        });

      edgesData.forEach((e) => {
        e.source = e.s;
        e.target = e.t;
      });

      const simulation = d3
        .forceSimulation(nodesData)
        .force("link", d3.forceLink(edgesData).id((d) => d.id).distance(30).strength(0.15))
        .force("charge", d3.forceManyBody().strength(-30))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide((d) => radius(d) + 1.5))
        .alphaDecay(0.025)
        .on("tick", ticked);

      linkSel = linkLayer
        .selectAll("line")
        .data(edgesData)
        .join("line")
        .attr("stroke", "#3a3a40")
        .attr("stroke-width", 0.7)
        .attr("stroke-opacity", 0.55);

      nodeSel = nodeLayer
        .selectAll("circle")
        .data(nodesData)
        .join("circle")
        .attr("r", radius)
        .attr("fill", (d) => color(d.in))
        .attr("stroke", "#08080a")
        .attr("stroke-width", 0.6)
        .style("cursor", "pointer")
        .on("mouseenter", onHoverIn)
        .on("mousemove", onMove)
        .on("mouseleave", onHoverOut)
        .on("click", (event, d) => {
          event.stopPropagation();
          focusNode(d);
        })
        .call(drag(simulation));

      svg.on("click", () => closePanel());

      applyFilters();
      updateArrowMode();

      setTimeout(() => simulation.alphaTarget(0), 2800);

      function ticked() {
        linkSel
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        nodeSel.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      }

      function drag(sim) {
        function started(event, d) {
          if (!event.active) sim.alphaTarget(0.12).restart();
          d.fx = d.x;
          d.fy = d.y;
        }
        function dragged(event, d) {
          d.fx = event.x;
          d.fy = event.y;
        }
        function ended(event, d) {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }
        return d3.drag().on("start", started).on("drag", dragged).on("end", ended);
      }

      function onHoverIn(event, d) {
        if (activeId === null) highlightNeighbors(d);
        tooltip.style.opacity = 1;
        tooltip.innerHTML =
          `<strong>${d.name}</strong><div class="td">in ${d.in} · out ${d.out} · ${compLabel(d.comp)}</div>`;
        onMove(event);
      }
      function onMove(event) {
        const r = stage.getBoundingClientRect();
        let x = event.clientX - r.left + 14;
        let y = event.clientY - r.top + 10;
        if (x + 250 > r.width) x = event.clientX - r.left - 250;
        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
      }
      function onHoverOut() {
        tooltip.style.opacity = 0;
        if (activeId === null) resetHighlight();
      }

      function neighborsOf(d) {
        return new Set([d.id, ...d.outLinks, ...d.inLinks]);
      }

      function highlightNeighbors(d) {
        const s = neighborsOf(d);
        nodeSel.attr("opacity", (n) => (s.has(n.id) ? 1 : 0.1));
        linkSel.attr("stroke-opacity", (e) => (e.s === d.id || e.t === d.id ? 0.9 : 0.04));
      }
      function resetHighlight() {
        nodeSel.attr("opacity", 1);
        linkSel.attr("stroke-opacity", 0.55);
      }

      function focusNode(d) {
        activeId = d.id;
        highlightNeighbors(d);
        renderPanel(d);
        const scale = 1.6;
        const t = d3.zoomIdentity
          .translate(width / 2 - d.x * scale, height / 2 - d.y * scale)
          .scale(scale);
        svg.transition().duration(600).call(zoomBehavior.transform, t);
      }
      window.__focusHero = focusNode;

      function renderPanel(d) {
        panel.hidden = false;
        const outN = d.outLinks.map((i) => byId.get(i)).sort((a, b) => b.in - a.in).slice(0, 14);
        const inN = d.inLinks.map((i) => byId.get(i)).sort((a, b) => b.in - a.in).slice(0, 14);
        panel.innerHTML = `
          <div class="hp-head">
            <div>
              <h3>${d.name}</h3>
              <div class="hp-meta">in-degree ${d.in} · out-degree ${d.out} · ${compLabel(d.comp)}${
                d.url ? ` · <a href="${d.url}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ""
              }</div>
            </div>
            <button class="hp-close" id="hp-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="hp-desc">${d.desc || "No description available."}</div>
          ${outN.length ? `<div class="hp-section-label">Links to (${d.outLinks.length})</div><div class="hp-links">${outN.map(chip).join("")}</div>` : ""}
          ${inN.length ? `<div class="hp-section-label">Linked from (${d.inLinks.length})</div><div class="hp-links">${inN.map(chip).join("")}</div>` : ""}
        `;
        document.getElementById("hp-close-btn").onclick = closePanel;
        panel.querySelectorAll(".hp-chip").forEach((el) => {
          el.onclick = () => focusNode(byId.get(+el.dataset.id));
        });
      }
      function chip(n) {
        return `<span class="hp-chip" data-id="${n.id}">${n.name}</span>`;
      }

      function closePanel() {
        activeId = null;
        panel.hidden = true;
        resetHighlight();
      }
      window.__closeHeroPanel = closePanel;

      function applyFilters() {
        const showIsolates = toggleIsolates.checked;
        const showMorituri = toggleMorituri.checked;
        nodeSel.style("display", (d) => {
          if (d.comp === "isolate" && !showIsolates) return "none";
          if (d.comp === "morituri" && !showMorituri) return "none";
          return null;
        });
        linkSel.style("display", (e) => {
          const s = byId.get(e.s), t = byId.get(e.t);
          if ((s.comp === "isolate" || t.comp === "isolate") && !showIsolates) return "none";
          if ((s.comp === "morituri" || t.comp === "morituri") && !showMorituri) return "none";
          return null;
        });
      }
      window.__applyNetFilters = applyFilters;

      function updateArrowMode() {
        const on = toggleArrows.checked;
        linkSel
          .attr("marker-end", (d) => (on && d.d !== "ts" ? "url(#arrow)" : null))
          .attr("marker-start", (d) => (on && (d.d === "ts" || d.d === "mutual") ? "url(#arrow)" : null));
      }
      window.__updateArrowMode = updateArrowMode;

      function findByName(query) {
        const q = query.trim().toLowerCase();
        if (!q) return null;
        return (
          nodesData.find((d) => d.name.toLowerCase() === q) ||
          nodesData.find((d) => d.name.toLowerCase().startsWith(q)) ||
          nodesData.find((d) => d.name.toLowerCase().includes(q))
        );
      }
      window.__findHeroByName = findByName;

      diceBtn.addEventListener("click", () => {
        const visible = nodesData.filter((d) => {
          if (d.comp === "isolate" && !toggleIsolates.checked) return false;
          if (d.comp === "morituri" && !toggleMorituri.checked) return false;
          return true;
        });
        const pick = visible[Math.floor(Math.random() * visible.length)];
        searchInput.value = pick.name;
        focusNode(pick);
      });

      resetBtn.addEventListener("click", () => {
        closePanel();
        svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const hit = findByName(searchInput.value);
        if (hit) focusNode(hit);
      });

      [toggleIsolates, toggleMorituri].forEach((el) =>
        el.addEventListener("change", () => {
          el.parentElement.classList.toggle("on", el.checked);
          applyFilters();
        })
      );
      toggleArrows.addEventListener("change", () => {
        toggleArrows.parentElement.classList.toggle("on", toggleArrows.checked);
        updateArrowMode();
      });
    });
})();
