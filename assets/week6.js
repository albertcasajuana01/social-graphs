// Week 6 — Names or story? All figures read ../assets/week6_names.json (written by analysis/week6_names.py);
// concordance lines come from week6_conc.json, fetched the first time someone opens a pair.
(function () {
  const C = { name: "#d95926", paper: "#6b6a64", story: "#3987e5", d1: "#55534c", d2: "#9a8350", d3: "#f0c96a",
              women: "#199e70", men: "#8a8982", ink: "#ecebe6", dim: "#a3a29b", muted: "#7a7973", line: "#24242a", surf: "#131316" };
  const CLS = [{ k: "name", label: "Names", c: C.name }, { k: "paper", label: "Paperwork", c: C.paper }, { k: "story", label: "Story", c: C.story }];
  const fmt2 = d3.format(".2f"), fmt3 = d3.format(".3f"), pct = d3.format(".0%");
  const tip = document.getElementById("tip");

  let D, P, PAIR, LABEL, BYLABEL, CONC = null;

  // ---------- helpers ----------
  const key = (a, b) => (a < b ? a + "-" + b : b + "-" + a);
  const pair = (a, b) => PAIR.get(key(a, b));
  const distTxt = (d) => (d === 1 ? "linked" : d === -1 ? "not connected" : d + " hops");
  const distCls = (d) => (d === 1 ? "d1" : d === 2 ? "d2" : "d3");
  const distCol = (d) => (d === 1 ? C.d1 : d === 2 ? C.d2 : C.d3);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function showTip(ev, html) {
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const r = tip.getBoundingClientRect(), pad = 14;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => (tip.style.opacity = 0);

  function loadConc() {
    if (!CONC) CONC = d3.json("../assets/week6_conc.json");
    return CONC;
  }
  function onResize(fn) {
    let w = 0, t;
    const ro = new ResizeObserver((es) => {
      const nw = Math.round(es[0].contentRect.width);
      if (nw === w) return;
      w = nw; clearTimeout(t); t = setTimeout(fn, 60);
    });
    return ro;
  }
  function wordsTipList(terms, n = 6) {
    return '<div class="w">' + terms.slice(0, n).map(([w, , k]) => `<span style="color:${CLS[k].c}"><b style="color:${C.ink};font-weight:500">${esc(w)}</b></span>`).join("") + "</div>";
  }

  // ---------- inspector: one pair, its cosine split word by word, and concordance lines ----------
  function Inspector(el, opts = {}) {
    let cur = null;
    function show(a, b) {
      const p = pair(a, b);
      if (!p) { el.innerHTML = '<p class="chart-note">This pair isn\'t among the pairs we shipped.</p>'; return; }
      cur = p;
      if (el.hidden) el.hidden = false;
      const A = p.a, B = p.b;
      const parts = p.parts, cos = p.cos;
      // segments: shown words, then an "other" chunk per class for the remainder
      const segs = [];
      [0, 1, 2].forEach((k) => {
        const ts = p.terms.filter((t) => t[2] === k).sort((x, y) => y[1] - x[1]);
        ts.forEach((t) => segs.push({ w: t[0], c: t[1], k }));
        const rest = parts[k] - d3.sum(ts, (t) => t[1]);
        if (rest / cos > 0.004) segs.push({ w: "other " + CLS[k].label.toLowerCase(), c: rest, k, other: true });
      });
      el.innerHTML = `
        <div class="insp-head">
          <div class="insp-title">${esc(LABEL[A])}<span class="x">↔</span>${esc(LABEL[B])}</div>
          <div class="chips">
            <span class="chip">cosine <b>${fmt3(cos)}</b></span>
            <span class="chip">story-only cosine <b>${fmt3(p.story)}</b></span>
            <span class="chip ${distCls(p.d)}">network: <b>${distTxt(p.d)}</b></span>
            ${opts.closable ? '<button class="insp-close" aria-label="Close">×</button>' : ""}
          </div>
        </div>
        <div class="splitbar">${segs.map((s, i) => `<div class="seg-w${s.other ? " other" : ""}" data-i="${i}" style="flex:${(s.c / cos) * 1000} 0 0;background-color:${CLS[s.k].c}">${s.c / cos > 0.07 ? `<span>${esc(s.w)}</span>` : ""}</div>`).join("")}</div>
        <div class="split-scale"><span>0</span><span>cosine ${fmt3(cos)}</span></div>
        <div class="split-totals">${CLS.map((c, k) => `<div style="border-color:${c.c}"><b>${pct(parts[k] / cos)}</b>${c.label} · ${fmt3(parts[k])}</div>`).join("")}</div>
        <div class="conc-k">Read the text · concordance lines</div>
        <div class="words"></div>
        <div class="conc"></div>`;
      el.querySelectorAll(".seg-w").forEach((n) => {
        const s = segs[+n.dataset.i];
        n.addEventListener("mousemove", (ev) => showTip(ev, `<strong>${esc(s.w)}</strong><div class="td">${CLS[s.k].label} · adds ${fmt3(s.c)} = ${pct(s.c / cos)} of the cosine</div>`));
        n.addEventListener("mouseleave", hideTip);
      });
      const x = el.querySelector(".insp-close");
      if (x) x.addEventListener("click", () => { el.hidden = true; if (opts.onClose) opts.onClose(); });
      // word buttons: biggest contributors overall, then biggest story words
      const pick = [];
      p.terms.slice(0, 4).forEach(([w, , k]) => pick.push([w, k]));
      p.sterms.slice(0, 4).forEach(([w]) => { if (!pick.some((q) => q[0] === w)) pick.push([w, 2]); });
      const wb = el.querySelector(".words"), cb = el.querySelector(".conc");
      wb.innerHTML = pick.map(([w, k], i) => `<button data-w="${esc(w)}" class="${i === 0 ? "active" : ""}"><i style="background:${CLS[k].c}"></i>${esc(w)}</button>`).join("");
      const render = (w) => {
        cb.innerHTML = '<div class="side"><p class="none">loading…</p></div>';
        loadConc().then((cc) => {
          if (cur !== p) return;
          const side = (i) => {
            const ls = (cc[i] && cc[i][w]) || [];
            return `<div class="side"><h4>${esc(LABEL[i])}</h4>${ls.length ? ls.map(([l, m, r]) => `<p class="line">${esc(l)}<mark>${esc(m)}</mark>${esc(r)}</p>`).join("") : '<p class="none">not in this page\'s prose</p>'}</div>`;
          };
          cb.innerHTML = side(A) + side(B);
        });
      };
      wb.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        wb.querySelectorAll("button").forEach((q) => q.classList.toggle("active", q === b));
        render(b.dataset.w);
      }));
      if (pick.length) render(pick[0][0]);
    }
    return { show };
  }

  function legend(el, items) {
    el.innerHTML = items.map((it) => it.tick
      ? `<span><span class="tick"></span>${it.label}</span>`
      : `<span><span class="sw${it.dot ? " dot" : ""}" style="background:${it.c}"></span>${it.label}</span>`).join("");
  }

  function scrollIntoViewIfNeeded(el) {
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight - 120 || r.bottom < 60) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function findIndex(v) {
    if (!v) return -1;
    const k = BYLABEL.get(v.trim().toLowerCase());
    return k === undefined ? -1 : k;
  }

  // ---------- figure 1 ----------
  let fig1;
  function figure1() {
    fig1 = Inspector(document.getElementById("f1-insp"));
    const want = [
      ["Storm", "Human Torch", "Storm ↔ Human Torch"],
      ["Emma Frost", "Jack Frost", "Emma ↔ Jack Frost"],
      ["Iron Fist", "Lei Kung", "Iron Fist ↔ Lei Kung"],
      ["Morbius", "Blade", "Morbius ↔ Blade"],
      ["Garrison Kane", "Yo-Yo Rodriguez", "Kane ↔ Yo-Yo"],
      ["Detroit Steel", "Turbo", "Detroit Steel ↔ Turbo"],
    ];
    const box = document.getElementById("f1-picks");
    const ok = want.map(([a, b, t]) => [findIndex(a), findIndex(b), t]).filter(([a, b]) => a >= 0 && b >= 0 && pair(a, b));
    box.innerHTML = ok.map(([, , t], i) => `<button class="${i === 0 ? "active" : ""}">${t}</button>`).join("");
    box.querySelectorAll("button").forEach((b, i) => b.addEventListener("click", () => {
      box.querySelectorAll("button").forEach((q) => q.classList.toggle("active", q === b));
      fig1.show(ok[i][0], ok[i][1]);
    }));
    if (ok.length) fig1.show(ok[0][0], ok[0][1]);
  }
  function openInFig1(a, b) {
    document.querySelectorAll("#f1-picks button").forEach((q) => q.classList.remove("active"));
    fig1.show(a, b);
    document.getElementById("fig1").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- figure 2: the wall of nearest neighbors ----------
  function figure2() {
    const el = document.getElementById("f2-chart");
    const insp = Inspector(document.getElementById("f2-insp"), { closable: true, onClose: () => { sel = -1; paint(); } });
    legend(document.getElementById("f2-legend"), [
      { c: C.name, label: "Names" }, { c: C.paper, label: "Paperwork" }, { c: C.story, label: "Story" }, { tick: true, label: "one-name match" },
    ]);
    const rows = D.hero.map((h) => {
      const p = pair(h.i, h.j);
      return { ...h, share: h.parts[0] / h.cos, neff: p ? p.neff : 0, terms: p ? p.terms : [] };
    }).sort((a, b) => d3.descending(a.share, b.share) || d3.descending(a.cos, b.cos));
    let mode = "share", hi = -1, sel = -1, showOne = true;
    const svg = d3.select(el).append("svg");
    const gGrid = svg.append("g").attr("class", "grid");
    const gBars = svg.append("g");
    const gRef = svg.append("g");
    const gTick = svg.append("g");
    const gAx = svg.append("g").attr("class", "axis");
    const gHit = svg.append("g");
    const gMark = svg.append("g");
    let x, y, H = 320, m = { t: 14, r: 8, b: 30, l: 40 };

    function draw() {
      const W = el.clientWidth;
      H = W < 600 ? 240 : 330;
      svg.attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      x = d3.scaleBand().domain(d3.range(rows.length)).range([m.l, W - m.r]).paddingInner(W > 900 ? 0.2 : 0.05);
      const max = mode === "share" ? 1 : d3.max(rows, (r) => r.cos);
      y = d3.scaleLinear().domain([0, max]).nice().range([H - m.b, m.t]);
      gGrid.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
      gAx.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(mode === "share" ? pct : fmt2).tickSizeOuter(0));
      gAx.select(".domain").remove();
      gAx.selectAll(".ax-label").remove();

      const segs = [];
      rows.forEach((r, i) => {
        let base = 0;
        [0, 1, 2].forEach((k) => {
          const v = mode === "share" ? r.parts[k] / r.cos : r.parts[k];
          segs.push({ i, k, y0: base, y1: base + v });
          base += v;
        });
      });
      gBars.selectAll("rect").data(segs).join("rect")
        .attr("x", (s) => x(s.i)).attr("width", x.bandwidth())
        .attr("fill", (s) => CLS[s.k].c)
        .transition().duration(650).ease(d3.easeCubicOut)
        .attr("y", (s) => y(s.y1)).attr("height", (s) => Math.max(0, y(s.y0) - y(s.y1)));

      gRef.selectAll("*").remove();
      if (mode === "share") {
        gRef.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0.5)).attr("y2", y(0.5))
          .attr("stroke", C.ink).attr("stroke-opacity", 0.55).attr("stroke-dasharray", "3 4");
        gRef.append("text").attr("x", W - m.r - 6).attr("y", y(0.5) - 6).attr("text-anchor", "end").attr("class", "halo").style("fill", C.ink).style("font-size", "11px").text("half the cosine");
        const cut = rows.findIndex((r) => r.share <= 0.5);
        if (cut > 0) {
          gRef.append("line").attr("x1", x(cut) - 1).attr("x2", x(cut) - 1).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.ink).attr("stroke-opacity", 0.35);
          gRef.append("text").attr("x", x(cut) - 8).attr("y", m.t + 16).attr("text-anchor", "end").attr("class", "halo").style("fill", C.ink).style("font-size", "11px")
            .text(`← ${cut} of ${rows.length} pages: mostly names`);
        }
      }
      gTick.selectAll("rect").data(rows).join("rect")
        .attr("x", (r, i) => x(i)).attr("width", Math.max(1, x.bandwidth()))
        .attr("y", H - m.b + 6).attr("height", 8).attr("rx", 1)
        .attr("fill", C.d3).attr("opacity", (r) => (showOne && r.neff < 1.5 ? 0.95 : 0));
      gHit.selectAll("rect").data(rows).join("rect")
        .attr("x", (r, i) => x(i) - (x.step() - x.bandwidth()) / 2).attr("width", x.step())
        .attr("y", m.t).attr("height", H - m.t - m.b + 16).attr("fill", "transparent").style("cursor", "pointer")
        .on("mousemove", (ev, r) => {
          hi = rows.indexOf(r); paint();
          showTip(ev, `<strong>${esc(LABEL[r.i])}</strong> → <strong>${esc(LABEL[r.j])}</strong>
            <div class="td">cosine ${fmt3(r.cos)} · ${distTxt(r.d)}${r.neff < 1.5 ? " · one-name match" : ""}</div>
            <div class="row" style="margin-top:6px"><span>names</span><span>${pct(r.parts[0] / r.cos)}</span></div>
            <div class="row"><span>paperwork</span><span>${pct(r.parts[1] / r.cos)}</span></div>
            <div class="row"><span>story</span><span>${pct(r.parts[2] / r.cos)}</span></div>${wordsTipList(r.terms)}`);
        })
        .on("mouseleave", () => { hi = -1; paint(); hideTip(); })
        .on("click", (ev, r) => {
          sel = rows.indexOf(r); paint(); hideTip();
          const box = document.getElementById("f2-insp");
          insp.show(r.i, r.j);
          scrollIntoViewIfNeeded(box);
        });
      paint();
    }
    function paint() {
      const f = findIndex(document.getElementById("f2-find").value);
      const focus = f >= 0 ? rows.findIndex((r) => r.i === f) : -1;
      const active = [hi, sel, focus].filter((v) => v >= 0);
      gBars.selectAll("rect").attr("opacity", (s) => (active.length && !active.includes(s.i) ? 0.38 : 1));
      gMark.selectAll("*").remove();
      [sel, focus].filter((v) => v >= 0).forEach((i) => {
        const r = rows[i], top = mode === "share" ? 1 : r.cos;
        const cx = x(i) + x.bandwidth() / 2, ty = y(top) - 8;
        gMark.append("path").attr("d", `M${cx - 4},${ty - 6}L${cx + 4},${ty - 6}L${cx},${ty}Z`).attr("fill", C.ink);
        const W = el.clientWidth, right = cx > W * 0.7;
        gMark.append("text").attr("x", cx + (right ? -8 : 8)).attr("y", ty - 4).attr("text-anchor", right ? "end" : "start")
          .attr("class", "halo").style("fill", C.ink).style("font-size", "11.5px").style("font-weight", 600).text(`${LABEL[r.i]} → ${LABEL[r.j]}`);
      });
    }
    document.querySelectorAll("#f2-mode button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#f2-mode button").forEach((q) => q.classList.toggle("active", q === b));
      mode = b.dataset.v; draw();
    }));
    const one = document.getElementById("f2-one");
    one.addEventListener("change", () => { showOne = one.checked; one.parentElement.classList.toggle("on", showOne); draw(); });
    document.getElementById("f2-find").addEventListener("input", paint);
    onResize(draw).observe(el);
    draw();
  }

  // ---------- section 4 lists ----------
  function section4() {
    const rows = D.hero.map((h) => ({ ...h, p: pair(h.i, h.j) })).filter((r) => r.p);
    const one = rows.filter((r) => r.p.neff < 1.5), many = rows.filter((r) => r.p.neff >= 1.5);
    document.getElementById("one-n").textContent = one.length;
    document.getElementById("many-n").textContent = many.length;
    document.getElementById("one-l").textContent = pct(d3.mean(one, (r) => r.d === 1));
    document.getElementById("many-l").textContent = pct(d3.mean(many, (r) => r.d === 1));
    const uniq = (arr) => { const s = new Set(); return arr.filter((r) => { const k = key(r.i, r.j); if (s.has(k)) return false; s.add(k); return true; }); };
    const fill = (id, arr, how) => {
      const ul = document.getElementById(id);
      const top = uniq(arr).sort(how).slice(0, 6);
      ul.innerHTML = top.map((r) => {
        const names = r.p.terms.filter((t) => t[2] === 0).slice(0, r.p.neff < 1.5 ? 1 : 3).map((t) => t[0]).join(", ");
        return `<li data-a="${r.i}" data-b="${r.j}"><span>${esc(LABEL[r.i])} ↔ ${esc(LABEL[r.j])}</span><em>${esc(names)}</em></li>`;
      }).join("");
      ul.querySelectorAll("li").forEach((li) => li.addEventListener("click", () => openInFig1(+li.dataset.a, +li.dataset.b)));
    };
    const pickOne = ["Storm", "Emma Frost", "Solomon Kane", "Arabian Knight", "Breeze Barton", "Peggy Carter", "Hrimhari", "Black Fox"];
    fill("one-list", one.filter((r) => pickOne.includes(LABEL[r.i])), (a, b) => pickOne.indexOf(LABEL[a.i]) - pickOne.indexOf(LABEL[b.i]));
    fill("many-list", many, (a, b) => b.p.neff - a.p.neff);
  }

  // ---------- figure 3: rewiring ----------
  function figure3() {
    const el = document.getElementById("f3-chart");
    const input = document.getElementById("f3-find");
    const picks = ["Storm", "Morbius", "Garrison Kane", "Detroit Steel", "Emma Frost", "Spider-Man"].map(findIndex).filter((i) => i >= 0);
    const box = document.getElementById("f3-picks");
    box.innerHTML = picks.map((i, k) => `<button data-i="${i}" class="${k === 0 ? "active" : ""}">${esc(LABEL[i])}</button>`).join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { input.value = ""; focus(+b.dataset.i); }));
    input.addEventListener("change", () => { const i = findIndex(input.value); if (i >= 0) focus(i); });
    input.addEventListener("input", () => { const i = findIndex(input.value); if (i >= 0) focus(i); });
    let cur = picks[0];

    function focus(i) {
      cur = i;
      box.querySelectorAll("button").forEach((q) => q.classList.toggle("active", +q.dataset.i === i));
      const pg = P[i];
      const L = pg.raw, R = pg.story;
      const max = d3.max([...L, ...R], (r) => r[1]);
      const inR = new Set(R.map((r) => r[0])), inL = new Set(L.map((r) => r[0]));
      const row = (r, side) => {
        const [j, c, d] = r, shared = side === "l" ? inR.has(j) : inL.has(j);
        return `<div class="rw-row${shared ? " shared" : ""}" data-j="${j}" title="${esc(LABEL[j])}">
          <div class="bar" style="width:calc((100% - 104px) * ${(c / max).toFixed(4)});background:${side === "l" ? C.name : C.story};${side === "r" ? "left:10px" : ""}"></div>
          <span class="nm">${esc(LABEL[j])}</span><span class="v">${fmt2(c)}</span><span class="dt ${distCls(d)}">${distTxt(d).replace(" hops", "h").replace("not connected", "none")}</span></div>`;
      };
      const same = L[0][0] === R[0][0];
      el.innerHTML = `
        <div class="rw-focus"><span class="f">${esc(LABEL[i])}</span>
          <span class="m">${pg.deg} links · ${d3.format(",")(pg.tokens)} words · names are ${pct(pg.tok_name)} of its words but ${pct(pg.self_name)} of its vector</span></div>
        <div class="rw">
          <div class="rw-col left"><h4><i style="background:${C.name}"></i>Full TF-IDF</h4>${L.map((r) => row(r, "l")).join("")}</div>
          <div class="rw-mid"><svg></svg></div>
          <div class="rw-col right"><h4><i style="background:${C.story}"></i>Story words only</h4>${R.map((r) => row(r, "r")).join("")}</div>
        </div>
        <p class="chart-note" style="margin-top:12px">${same ? "Same nearest neighbor both ways." : `Nearest neighbor changes: <b style="color:${C.ink}">${esc(LABEL[L[0][0]])}</b> → <b style="color:${C.ink}">${esc(LABEL[R[0][0]])}</b>.`} ${L.filter((r) => inR.has(r[0])).length} of 8 neighbors survive.</p>`;
      // connector lines
      const mid = el.querySelector(".rw-mid"), svg = d3.select(mid).select("svg");
      requestAnimationFrame(() => {
        const mb = mid.getBoundingClientRect();
        const left = [...el.querySelectorAll(".rw-col.left .rw-row")], right = [...el.querySelectorAll(".rw-col.right .rw-row")];
        const cy = (n) => { const b = n.getBoundingClientRect(); return b.top + b.height / 2 - mb.top; };
        const links = [];
        left.forEach((ln) => { const rn = right.find((q) => q.dataset.j === ln.dataset.j); if (rn) links.push([cy(ln), cy(rn)]); });
        const w = mb.width;
        svg.selectAll("path").data(links).join("path")
          .attr("d", ([a, b]) => `M0,${a}C${w / 2},${a} ${w / 2},${b} ${w},${b}`)
          .attr("fill", "none").attr("stroke", C.ink).attr("stroke-opacity", 0.35).attr("stroke-width", 1.2);
      });
      el.querySelectorAll(".rw-row").forEach((n) => n.addEventListener("click", () => { input.value = ""; focus(+n.dataset.j); }));
    }
    onResize(() => focus(cur)).observe(el);
    focus(cur);
  }

  // ---------- figure 4: scatter, full vs story ----------
  function figure4() {
    const el = document.getElementById("f4-chart");
    const insp = Inspector(document.getElementById("f4-insp"), { closable: true, onClose: () => { sel = null; paint(); } });
    const rows = D.pairs.filter((p) => Math.max(p.cos, p.story) >= 0.08).map((p) => ({ ...p, share: p.parts[0] / p.cos }));
    document.getElementById("f4-n").textContent = d3.format(",")(rows.length);
    const order = (r) => (r.d === 1 ? 0 : r.d === 2 ? 1 : 2);
    rows.sort((a, b) => order(a) - order(b));
    let col = "d", sel = null, hov = null;
    const ramp = d3.scaleLinear().domain([0, 1]).range(["#3b3a36", C.name]).interpolate(d3.interpolateLab);
    const setLegend = () => legend(document.getElementById("f4-legend"), col === "d"
      ? [{ c: C.d1, label: "linked", dot: true }, { c: C.d2, label: "2 hops", dot: true }, { c: C.d3, label: "3+ hops or not connected", dot: true }]
      : [{ c: ramp(0.1), label: "story-heavy", dot: true }, { c: ramp(0.5), label: "half names", dot: true }, { c: ramp(0.95), label: "name-heavy", dot: true }]);
    setLegend();
    const svg = d3.select(el).append("svg");
    const gGrid = svg.append("g").attr("class", "grid"), gGridY = svg.append("g").attr("class", "grid");
    const gAxX = svg.append("g").attr("class", "axis"), gAxY = svg.append("g").attr("class", "axis");
    const gDiag = svg.append("g"), gDots = svg.append("g"), gAnn = svg.append("g"), gHi = svg.append("g");
    let x, y, delaunay, W, H;
    const m = { t: 16, r: 16, b: 44, l: 52 };
    const TV = [0, 0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8];
    const notes = [["Storm", "Human Torch"], ["Emma Frost", "Jack Frost"], ["Garrison Kane", "Yo-Yo Rodriguez"], ["Morbius", "Blade"], ["Detroit Steel", "Turbo"], ["Hybrid", "Mania"]];

    function draw() {
      W = el.clientWidth; H = Math.min(560, Math.max(360, W * 0.62));
      svg.attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      const mx = Math.max(d3.max(rows, (r) => r.cos), d3.max(rows, (r) => r.story)) * 1.02;
      x = d3.scaleSqrt().domain([0, mx]).range([m.l, W - m.r]);     // sqrt keeps y = x straight and spreads the crowded low end
      y = d3.scaleSqrt().domain([0, mx]).range([H - m.b, m.t]);
      gGrid.attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(TV).tickSize(-(H - m.t - m.b)).tickFormat(""));
      gGridY.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(TV).tickSize(-(W - m.l - m.r)).tickFormat(""));
      gAxX.attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(TV).tickFormat(d3.format("~g")).tickSizeOuter(0));
      gAxY.attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(TV).tickFormat(d3.format("~g")).tickSizeOuter(0));
      gAxX.selectAll(".ax-label").remove(); gAxY.selectAll(".ax-label").remove();
      gAxX.append("text").attr("class", "ax-label").attr("x", W - m.r).attr("y", 36).attr("text-anchor", "end").text("full TF-IDF cosine (names included), square-root scale →");
      gAxY.append("text").attr("class", "ax-label").attr("transform", "rotate(-90)").attr("x", -m.t).attr("y", -40).attr("text-anchor", "end").text("story-only cosine →");
      gDiag.selectAll("*").remove();
      gDiag.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(mx)).attr("y2", y(mx)).attr("stroke", C.ink).attr("stroke-opacity", 0.25);
      gDiag.append("text").attr("x", x(mx * 0.86)).attr("y", y(mx * 0.86) - 8).attr("text-anchor", "end").style("fill", C.dim).style("font-size", "11px").text("names don't matter");
      gDiag.append("text").attr("x", x(mx * 0.97)).attr("y", y(0.04)).attr("text-anchor", "end").style("fill", C.dim).style("font-size", "12px").style("font-style", "italic").text("name lookalikes");
      gDiag.append("text").attr("x", x(0.02)).attr("y", y(mx * 0.96)).style("fill", C.dim).style("font-size", "12px").style("font-style", "italic").text("story twins");
      gDots.selectAll("circle").data(rows).join("circle")
        .attr("cx", (r) => x(r.cos)).attr("cy", (r) => y(r.story)).attr("r", W < 600 ? 2.4 : 3)
        .attr("stroke", C.surf).attr("stroke-width", 1);
      delaunay = d3.Delaunay.from(rows, (r) => x(r.cos), (r) => y(r.story));
      // selective direct labels
      gAnn.selectAll("*").remove();
      notes.forEach(([a, b]) => {
        const ia = findIndex(a), ib = findIndex(b), p = ia >= 0 && ib >= 0 ? pair(ia, ib) : null;
        if (!p) return;
        const px = x(p.cos), py = y(p.story), right = px > W * 0.62;
        gAnn.append("circle").attr("cx", px).attr("cy", py).attr("r", 5.5).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 1);
        gAnn.append("text").attr("x", px + (right ? -9 : 9)).attr("y", py + 4).attr("text-anchor", right ? "end" : "start")
          .style("fill", C.ink).style("font-size", "11px").style("paint-order", "stroke").style("stroke", C.surf).style("stroke-width", 3)
          .text(`${a} ↔ ${b}`);
      });
      paint();
    }
    function paint() {
      const f = findIndex(document.getElementById("f4-find").value);
      gDots.selectAll("circle")
        .attr("fill", (r) => (col === "d" ? distCol(r.d) : ramp(r.share)))
        .attr("opacity", (r) => (f >= 0 ? (r.a === f || r.b === f ? 1 : 0.12) : col === "d" ? (r.d === 1 ? 0.8 : r.d === 2 ? 0.75 : 0.85) : 0.85));
      gHi.selectAll("*").remove();
      [hov, sel].filter(Boolean).forEach((r) => {
        gHi.append("circle").attr("cx", x(r.cos)).attr("cy", y(r.story)).attr("r", 7).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 1.5);
      });
      if (f >= 0) {
        const mine = rows.filter((r) => r.a === f || r.b === f).sort((a, b) => b.story - a.story).slice(0, 3);
        mine.forEach((r) => {
          const o = r.a === f ? r.b : r.a, px = x(r.cos), py = y(r.story), right = px > W * 0.62;
          gHi.append("text").attr("x", px + (right ? -9 : 9)).attr("y", py - 6).attr("text-anchor", right ? "end" : "start")
            .style("fill", C.ink).style("font-size", "11px").style("paint-order", "stroke").style("stroke", C.surf).style("stroke-width", 3).text(LABEL[o]);
        });
      }
      gAnn.attr("opacity", f >= 0 ? 0.15 : 1);
    }
    svg.on("mousemove", (ev) => {
      const [mx_, my_] = d3.pointer(ev);
      const k = delaunay.find(mx_, my_), r = rows[k];
      const dx = x(r.cos) - mx_, dy = y(r.story) - my_;
      if (dx * dx + dy * dy > 400) { hov = null; paint(); hideTip(); svg.style("cursor", null); return; }
      hov = r; paint(); svg.style("cursor", "pointer");
      showTip(ev, `<strong>${esc(LABEL[r.a])}</strong> ↔ <strong>${esc(LABEL[r.b])}</strong>
        <div class="row" style="margin-top:6px"><span>full cosine</span><span>${fmt3(r.cos)}</span></div>
        <div class="row"><span>story-only</span><span>${fmt3(r.story)}</span></div>
        <div class="row"><span>names' share</span><span>${pct(r.share)}</span></div>
        <div class="row"><span>network</span><span>${distTxt(r.d)}</span></div>${wordsTipList(r.terms)}`);
    }).on("mouseleave", () => { hov = null; paint(); hideTip(); })
      .on("click", () => { if (!hov) return; sel = hov; hideTip(); paint(); insp.show(sel.a, sel.b); scrollIntoViewIfNeeded(document.getElementById("f4-insp")); });
    document.querySelectorAll("#f4-col button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#f4-col button").forEach((q) => q.classList.toggle("active", q === b));
      col = b.dataset.v; setLegend(); paint();
    }));
    document.getElementById("f4-find").addEventListener("input", paint);
    onResize(draw).observe(el);
    draw();
  }

  // ---------- section 6: twins table ----------
  const VERDICT = {
    "Hybrid|Mania": ["real", "Both are symbiotes of the Venom family. Hybrid is four symbiotes fused into one."],
    "She-Hulk|Spider-Woman": ["phrase", "Both pages call her “one of Marvel's most notable and powerful female heroes”."],
    "Hellion|Jean Grey": ["real", "Telekinetic mutant students. Hellion uses telekinesis to work his prosthetic hands."],
    "Jean Grey|Scarlet Witch": ["real", "Very powerful mutants whose powers bend reality."],
    "Mania|She-Venom": ["real", "Both are hosts bonded to Venom-family symbiotes."],
    "Morbius|Spitfire": ["real", "Spitfire was drained of blood by her vampire uncle, Baron Blood. Morbius is the Living Vampire."],
    "Bird-Brain|Brain Drain": ["leak", "“brain” is in both names but mostly lowercase, so the name rule misses it."],
    "Mockingbird|Spider-Woman": ["generic", "great, work, costume: reviewers' vocabulary, not plot."],
    "Beta Ray Bill|Hercules": ["real", "Gods and worthiness: Bill lifts Thor's hammer, Hercules is an Olympian."],
    "Jean Grey|She-Hulk": ["phrase", "The same “powerful female” description, plus “relationship”."],
    "Emma Frost|Scarlet Witch": ["real", "Mutant women with mind and reality powers, and their children."],
    "Blackthorn|Scaredycat": ["real", "Both underwent the Morituri process, which grants powers and then kills."],
    "Quicksilver|Storm": ["real", "Mutants who married royalty: Crystal of the Inhumans, and Black Panther."],
    "Black Widow|Luke Cage": ["generic", "working, introduced, stories: publication vocabulary that slipped through."],
    "Spider-Man|Spider-Woman": ["generic", "costume, identity: true of almost any superhero."],
    "Gremlin|War Machine": ["real", "Armor: Gremlin wore the Titanium Man armor, Rhodes the Iron Man armor."],
    "Emma Frost|Rusty Collins": ["real", "Mutant schools: Emma's academy and the young mutant teams."],
    "Mayday Parker|Shang-Chi": ["real", "Children defined by famous fathers (Spider-Man and Zheng Zu)."],
    "Black Cat|She-Hulk": ["phrase", "female, relationship, dating: how women characters get described."],
    "Gwenpool|Spider-Woman": ["generic", "fan, make, real: commentary vocabulary."],
  };
  const VK = { real: ["Real shared story", C.story], phrase: ["Stock description", C.name], generic: ["Generic words", C.paper], leak: ["Name leak", "#9a8350"] };
  function twins() {
    const top = D.pairs.filter((p) => p.d !== 1).sort((a, b) => b.story - a.story).slice(0, 20);
    const vk = (p) => VERDICT[[LABEL[p.a], LABEL[p.b]].sort().join("|")];
    const counts = d3.rollup(top, (v) => v.length, (p) => (vk(p) || ["?"])[0]);
    const sum = document.getElementById("verdict-sum");
    const ks = ["real", "phrase", "generic", "leak"].filter((k) => counts.get(k));
    sum.innerHTML = ks.map((k) => `<div style="flex:${counts.get(k)} 0 0;background:${VK[k][1]}" title="${VK[k][0]}">${counts.get(k)}</div>`).join("");
    const lg = document.createElement("div");
    lg.className = "legend";
    sum.after(lg);
    legend(lg, ks.map((k) => ({ c: VK[k][1], label: `${VK[k][0]} (${counts.get(k)})` })));
    const tb = document.querySelector("#twins tbody");
    tb.innerHTML = top.map((p, i) => {
      const v = vk(p) || ["generic", "—"];
      return `<tr data-i="${i}"><td>${i + 1}</td><td>${esc(LABEL[p.a])} ↔ ${esc(LABEL[p.b])}</td><td class="num">${fmt3(p.story)}</td>
        <td>${p.sterms.slice(0, 4).map((t) => esc(t[0])).join(", ")}</td><td><span class="pill ${v[0]}">${VK[v[0]][0]}</span>${esc(v[1])}</td></tr>`;
    }).join("");
    tb.querySelectorAll("tr[data-i]").forEach((tr) => tr.addEventListener("click", () => {
      const nxt = tr.nextElementSibling;
      if (nxt && nxt.classList.contains("detail")) { nxt.remove(); tr.classList.remove("open"); return; }
      tb.querySelectorAll("tr.detail").forEach((d) => d.remove());
      tb.querySelectorAll("tr.open").forEach((d) => d.classList.remove("open"));
      tr.classList.add("open");
      const d = document.createElement("tr");
      d.className = "detail";
      d.innerHTML = '<td colspan="5"><div class="insp"></div></td>';
      tr.after(d);
      const p = top[+tr.dataset.i];
      Inspector(d.querySelector(".insp")).show(p.a, p.b);
    }));
  }

  // ---------- figure 5: link rates ----------
  const STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function hbars(el, rows, { max = 1, fmt = pct, sep = [] } = {}) {
    let drawn = 0;
    const draw = () => {
      const animate = !STILL && drawn++ === 0;
      el.innerHTML = "";
      const W = el.clientWidth, narrow = W < 560, lw = narrow ? 130 : 210, rh = 34, gap = 14;
      const H = rows.length * rh + sep.length * gap + 26;
      const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      const x = d3.scaleLinear().domain([0, max]).range([lw, W - 44]);
      svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H - 22)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(5).tickFormat(fmt).tickSizeOuter(0)).select(".domain").remove();
      let yy = 0;
      rows.forEach((r, i) => {
        if (sep.includes(i)) yy += gap;
        const g = svg.append("g").attr("transform", `translate(0,${yy})`);
        g.append("text").attr("x", lw - 12).attr("y", rh / 2 + 4).attr("text-anchor", "end").style("fill", r.strong ? C.ink : C.dim).style("font-size", narrow ? "11px" : "12.5px").text(r.label);
        const bar = g.append("rect").attr("x", lw).attr("y", 8).attr("height", rh - 16).attr("rx", 4).attr("fill", r.c);
        if (animate) bar.attr("width", 0).transition().duration(900).delay(i * 60).ease(d3.easeCubicOut).attr("width", Math.max(2, x(r.v) - lw));
        else bar.attr("width", Math.max(2, x(r.v) - lw));
        g.append("text").attr("x", x(r.v) + 8).attr("y", rh / 2 + 4).style("fill", C.ink).style("font-size", "12px").style("font-variant-numeric", "tabular-nums").text(fmt(r.v));
        g.append("rect").attr("x", 0).attr("y", 0).attr("width", W).attr("height", rh).attr("fill", "transparent")
          .on("mousemove", (ev) => showTip(ev, `<strong>${esc(r.label)}</strong><div class="td">${r.tip || ""}</div>`)).on("mouseleave", hideTip);
        yy += rh;
      });
    };
    onResize(draw).observe(el);
    draw();
  }

  function figure5() {
    const S = D.summary;
    const rows = D.hero.map((h) => ({ ...h, p: pair(h.i, h.j) })).filter((r) => r.p);
    const one = d3.mean(rows.filter((r) => r.p.neff < 1.5), (r) => r.d === 1);
    const many = d3.mean(rows.filter((r) => r.p.neff >= 1.5), (r) => r.d === 1);
    hbars(document.getElementById("f5-chart"), [
      { label: "Full TF-IDF", v: S.nn_linked_raw, c: C.dim, strong: true, tip: "nearest neighbor by the ordinary cosine" },
      { label: "Names only", v: S.nn_linked_names, c: C.name, tip: "cosine over name words alone" },
      { label: "Story only", v: S.nn_linked_story, c: C.story, strong: true, tip: "cosine over story words alone" },
      { label: "↳ one-name matches", v: one, c: C.name, tip: "full-TF-IDF lookalikes where one name does the work (N_eff < 1.5)" },
      { label: "↳ shared-cast matches", v: many, c: C.name, tip: "full-TF-IDF lookalikes carried by several names" },
      { label: "Any two pages", v: D.params.density, c: C.paper, tip: "share of all 45,753 page pairs that are linked" },
    ], { sep: [3, 5] });
  }

  // ---------- figure 6: gender ----------
  function figure6() {
    const g = D.gender, r = g.rate;
    hbars(document.getElementById("f6-rate"), [
      { label: "By chance", v: r.chance, c: C.paper, tip: "56 other women among 302 other pages" },
      { label: "Full TF-IDF", v: r.raw, c: C.women },
      { label: "Story only", v: r.story, c: C.women, strong: true },
      { label: "Story, gendered words removed", v: r.story_no_gender_words, c: C.women, tip: "female, woman, girlfriend, husband, mother… (30 words) dropped" },
    ], { max: 0.6 });
    legend(document.getElementById("f6-legend"), [{ c: C.women, label: `women (${g.counts.F} pages)`, dot: true }, { c: C.men, label: `men (${g.counts.M} pages)`, dot: true }]);
    const el = document.getElementById("f6-words");
    const rows = g.words.slice().sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
    const draw = () => {
      el.innerHTML = "";
      const W = el.clientWidth, narrow = W < 560, lw = narrow ? 120 : 170, rh = 30, H = rows.length * rh + 26;
      const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      const x = d3.scaleLinear().domain([0, 0.55]).range([lw, W - 50]);
      svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H - 22)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(5).tickFormat(pct).tickSizeOuter(0)).select(".domain").remove();
      rows.forEach(([lab, f, m], i) => {
        const y = i * rh + rh / 2, g_ = svg.append("g");
        g_.append("text").attr("x", lw - 12).attr("y", y + 4).attr("text-anchor", "end").style("fill", C.dim).style("font-size", narrow ? "11px" : "12.5px").text(lab);
        g_.append("line").attr("x1", x(Math.min(f, m))).attr("x2", x(Math.max(f, m))).attr("y1", y).attr("y2", y).attr("stroke", f > m ? C.women : C.men).attr("stroke-opacity", 0.5).attr("stroke-width", 2);
        g_.append("circle").attr("cx", x(m)).attr("cy", y).attr("r", 5).attr("fill", C.men).attr("stroke", C.surf).attr("stroke-width", 2);
        g_.append("circle").attr("cx", x(f)).attr("cy", y).attr("r", 5.5).attr("fill", C.women).attr("stroke", C.surf).attr("stroke-width", 2);
        const gap = f - m;
        g_.append("text").attr("x", x(Math.max(f, m)) + 10).attr("y", y + 4).style("fill", gap > 0 ? C.ink : C.muted).style("font-size", "11px").style("font-variant-numeric", "tabular-nums")
          .text((gap > 0 ? "+" : "−") + Math.abs(Math.round(gap * 100)) + " pts");
        g_.append("rect").attr("x", 0).attr("y", y - rh / 2).attr("width", W).attr("height", rh).attr("fill", "transparent")
          .on("mousemove", (ev) => showTip(ev, `<strong>${esc(lab)}</strong><div class="row" style="margin-top:6px"><span>women's pages</span><span>${pct(f)}</span></div><div class="row"><span>men's pages</span><span>${pct(m)}</span></div>`))
          .on("mouseleave", hideTip);
      });
    };
    onResize(draw).observe(el);
    draw();
  }

  // ---------- robustness ----------
  function robust() {
    const tb = document.querySelector("#robust-table tbody");
    tb.innerHTML = D.robust.map((r, i) => `<tr class="${i === 0 ? "hot" : ""}"><td>${esc(r.label)}</td><td class="num">${pct(r.nn_name_median)}</td>
      <td class="num">${pct(r.nn_name_majority)}</td><td class="num">${pct(1 - r.nn_same)}</td><td class="num">${pct(r.nn_linked_story)}</td></tr>`).join("");
  }

  function classExamples() {
    const tw = D.top_words;
    ["name", "paper", "story"].forEach((k, c) => {
      const words = (c === 1 ? D.paper_examples : tw[c].map((w) => w[0])).filter((w) => w.length > 2).slice(0, 9);
      document.getElementById("ex-" + k).innerHTML = words.map((w) => `<span>${esc(w)}</span>`).join("");
    });
  }

  // ---------- boot ----------
  d3.json("../assets/week6_names.json").then((data) => {
    D = data; P = D.pages;
    PAIR = new Map(D.pairs.map((p) => [key(p.a, p.b), p]));
    const counts = d3.rollup(P, (v) => v.length, (p) => p.label);
    LABEL = P.map((p) => (counts.get(p.label) > 1 ? p.id.replace(/_/g, " ").replace(/\(Marvel Comics\)|\(comics\)|\(character\)/i, "").trim() : p.label));
    // keep the plain label for the most-linked page of a duplicated name
    const best = d3.rollup(P.map((p, i) => [p, i]), (v) => d3.greatest(v, (q) => q[0].deg)[1], ([p]) => p.label);
    best.forEach((i, lab) => { if (counts.get(lab) > 1) LABEL[i] = lab; });
    BYLABEL = new Map();
    LABEL.forEach((l, i) => BYLABEL.set(l.toLowerCase(), i));
    document.getElementById("char-list").innerHTML = LABEL.slice().sort().map((l) => `<option value="${esc(l)}">`).join("");

    classExamples();
    figure1();
    figure2();
    section4();
    figure3();
    figure4();
    twins();
    figure5();
    figure6();
    robust();
  });
})();
