// Week 7 — Can the text rebuild the network? All figures read ../assets/week7_comention.json
// (written by analysis/week7_comention.py). Every pair carries its evidence: the sentences on A's page that
// name B, and the line of A's wiki source where the link sits (or the words that were linked elsewhere).
(function () {
  // a muted palette: navy for what the text says, ink for the links, rust for shared codenames, DTU red for our misses
  const NAVY = "#2f5d8a", RUST = "#a8572f", SAGE = "#5b8a72";
  const C = { named: NAVY, linked: "#1c1b19", ink: "#1c1b19", dim: "#4f4d48", muted: "#7b7871", line: "#e5e2db",
              sentence: NAVY, paragraph: SAGE, page: RUST };
  const FAM = {
    agree:    { c: NAVY, label: "named and linked", desc: "A's prose names B, and A links to B." },
    codename: { c: RUST, label: "a shared codename", desc: "A links to B, but the words are a codename several characters share (Ghost Rider, Spider-Woman, Psylocke, Giant-Man). We send those words to the page about the name, or to nobody, so the text never names B itself." },
    words:    { c: SAGE, label: "linked from other words", desc: "A links to B on words that aren't on our name lists: an alter ego, a nickname, a description." },
    notprose: { c: "#9a978f", label: "not in the prose", desc: "The link isn't in A's prose. It sits in a reference, an italic comic title, the infobox or a table." },
    media:    { c: "#d6d2c9", label: "only in In other media", light: true, desc: "The link is only in A's In other media section, which we leave out of the text (it is mostly film titles and cast lists)." },
    missed:   { c: "#990000", label: "our matcher missed it", desc: "A's prose does name B with a name we know, and our matcher should have caught it." },
    holder:   { c: RUST, label: "linked to another of our pages", desc: "A's prose names B, but the editor linked those words to another of the 303 pages, usually another holder of the same codename." },
    outside:  { c: "#d4b19c", label: "linked to a page outside the 303", light: true, desc: "A's prose names B, but the editor linked those words to a page that isn't one of the 303: usually the specific person (Clint Barton, Carol Danvers), sometimes a film or a storyline." },
    never:    { c: "#76728c", label: "never linked", desc: "A's prose names B and never links those words. We read 40 of these: 25 were real mentions, 15 were our errors." },
  };
  const LINK_SIDE = ["agree", "codename", "words", "notprose", "media", "missed"];
  const NAME_SIDE = ["agree", "holder", "outside", "never"];
  const PLACE = { prose: "in the prose", list: "in a list", infobox: "in the infobox", reference: "inside a reference",
                  "italic title": "in an italic title (a comic, film or show)", table: "in a table", template: "inside a template",
                  "image caption": "in an image caption", gallery: "in a gallery" };
  const fmt = d3.format(","), pct = d3.format(".0%");
  const tip = document.getElementById("tip");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let D, WHY, LABEL, MANTLE, BYB = new Map(), BYLABEL = new Map();
  const fam = (p) => WHY[p.w].family;
  const lab = (n) => LABEL[n] || n.replace(/_/g, " ");

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
  function onResize(el, fn) {
    let w = 0, t;
    new ResizeObserver((es) => {
      const nw = Math.round(es[0].contentRect.width);
      if (nw === w) return;
      w = nw; clearTimeout(t); t = setTimeout(fn, 60);
    }).observe(el);
  }
  function highlight(text, spans) {
    let out = "", at = 0;
    spans.slice().sort((a, b) => a[0] - b[0]).forEach(([s, e]) => {
      if (s < at) return;
      out += esc(text.slice(at, s)) + "<mark>" + esc(text.slice(s, e)) + "</mark>";
      at = e;
    });
    return out + esc(text.slice(at));
  }
  function markFirst(text, word) {
    const i = word ? text.indexOf(word) : -1;
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(word) + "</mark>" + esc(text.slice(i + word.length));
  }

  // ---------- one pair, with its evidence ----------
  function evidence(p) {
    const f = FAM[fam(p)];
    const A = esc(lab(p.a)), B = esc(lab(p.b));
    let h = `<div class="ev"><div class="ev-head"><b>${A} → ${B}</b>
      <span class="why-chip" style="background:${f.c};${f.light ? "color:#1c1b19" : ""}">${esc(f.label)}</span></div>`;
    h += `<div class="ev-k">What ${A}'s page says</div>`;
    if (p.ev.length) {
      h += p.ev.map((e) => `<p class="line">${highlight(e.t, e.h)}<span class="sec">${esc(e.sec)}</span></p>`).join("");
      if (p.n > p.ev.length) h += `<p class="none">…and ${p.n - p.ev.length} more sentence${p.n - p.ev.length > 1 ? "s" : ""}.</p>`;
    } else {
      h += `<p class="none">Its prose never names ${B}, with the names we can resolve.</p>`;
    }
    h += `<div class="ev-k">What ${A}'s wiki source links</div>`;
    if (p.src) {
      const s = p.src;
      const where = PLACE[s.p] || s.p;
      const tgt = s.to ? `${esc(lab(s.to))} (one of the 303)` : `${esc(s.t)}${p.w === "lo" ? " (not one of the 303)" : ""}`;
      h += `<p class="none" style="font-style:normal;margin-bottom:6px"><span class="lk">[[${esc(s.t)}${s.sh && s.sh !== s.t ? "|" + esc(s.sh) : ""}]]</span>, ${where}: the link goes to ${tgt}.</p>`;
      h += `<div class="src">${markFirst(s.ln, s.sh)}</div>`;
    } else if (p.w === "ok") {
      h += `<p class="none" style="font-style:normal">A link to ${B} on the words above.</p>`;
    } else {
      h += `<p class="none">The words above are never linked anywhere on ${A}'s page.</p>`;
    }
    return h + "</div>";
  }

  // a list of pairs as buttons; clicking one shows its evidence in `out`
  function pairButtons(list, out, text, cap = 24) {
    const box = document.createElement("div");
    const draw = (n) => {
      box.innerHTML = '<div class="pairs">' + list.slice(0, n).map((p, i) => `<button data-i="${i}">${text(p)}</button>`).join("") + "</div>" +
        (list.length > n ? `<button class="more">Show all ${list.length}</button>` : "");
      box.querySelectorAll(".pairs button").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll(".pairs button.active").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        out.innerHTML = evidence(list[+b.dataset.i]);
      }));
      const more = box.querySelector(".more");
      if (more) more.addEventListener("click", () => draw(list.length));
    };
    draw(cap);
    return box;
  }

  // ---------- Figure 1: named by vs linked by ----------
  function fig1() {
    const chart = document.getElementById("f1-chart"), insp = document.getElementById("f1-insp");
    const nodes = Object.keys(LABEL).map((n) => {
      const ps = BYB.get(n) || [];
      return { n, named: ps.filter((p) => p.n > 0).length, linked: ps.filter((p) => p.l).length, mantle: MANTLE.has(n) };
    });
    let mode = "named", sel = "Hawkeye_(comics)";
    document.getElementById("f1-legend").innerHTML =
      `<span><i class="dot" style="background:${C.named}"></i>pages that name the character</span>
       <span><i class="dot hollow"></i>pages that link to its page</span>
       <span><span class="tag-mantle">name page</span>&nbsp; a page about a codename</span>`;

    function rows() {
      const by = { named: (d) => d.named - d.linked, linked: (d) => d.linked - d.named, top: (d) => d.named }[mode];
      return nodes.slice().sort((a, b) => by(b) - by(a) || b.named - a.named).slice(0, 16);
    }
    function draw() {
      const R = rows();
      const W = chart.clientWidth, narrow = W < 560;
      const m = { t: 26, r: 34, b: 8, l: narrow ? 128 : 210 }, rh = 27;
      const H = m.t + R.length * rh + m.b;
      const x = d3.scaleLinear().domain([0, d3.max(R, (d) => Math.max(d.named, d.linked)) * 1.05]).nice().range([m.l, W - m.r]);
      chart.innerHTML = "";
      const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t - 6})`).call(d3.axisTop(x).ticks(narrow ? 4 : 7).tickSizeOuter(0));
      svg.append("g").attr("class", "grid").attr("transform", `translate(0,${m.t - 6})`)
        .call(d3.axisTop(x).ticks(narrow ? 4 : 7).tickSize(-(R.length * rh + 6)).tickFormat(""));
      const g = svg.selectAll(".db-row").data(R).join("g").attr("class", (d) => "db-row" + (d.n === sel ? " on" : ""))
        .attr("transform", (d, i) => `translate(0,${m.t + i * rh})`)
        .on("click", (ev, d) => { sel = d.n; draw(); inspect(d.n); })
        .on("mousemove", (ev, d) => showTip(ev, `<strong>${esc(lab(d.n))}</strong>
            <div class="row"><span>pages that name it</span><span>${d.named}</span></div>
            <div class="row"><span>pages that link to it</span><span>${d.linked}</span></div>
            ${d.mantle ? '<div class="td">a page about a codename several characters used</div>' : ""}`))
        .on("mouseleave", hideTip);
      g.append("rect").attr("class", "hit").attr("x", 0).attr("y", 0).attr("width", W).attr("height", rh).attr("rx", 3);
      const maxc = narrow ? 17 : 28;
      g.append("text").attr("class", "nm").attr("x", m.l - 10).attr("y", rh / 2 + 4).attr("text-anchor", "end")
        .text((d) => { const s = lab(d.n); return s.length > maxc ? s.slice(0, maxc - 1) + "…" : s; });
      g.filter((d) => d.mantle).append("text").attr("class", "badge").attr("x", m.l - 10).attr("y", rh / 2 + 4)
        .attr("text-anchor", "end").attr("dx", function () { return -this.parentNode.querySelector(".nm").getComputedTextLength() - 6; })
        .text(narrow ? "·" : "name page");
      g.append("line").attr("class", "stem").attr("x1", (d) => x(d.linked)).attr("x2", (d) => x(d.named)).attr("y1", rh / 2).attr("y2", rh / 2);
      g.append("circle").attr("class", "d-linked").attr("cx", (d) => x(d.linked)).attr("cy", rh / 2).attr("r", 5.5);
      g.append("circle").attr("class", "d-named").attr("cx", (d) => x(d.named)).attr("cy", rh / 2).attr("r", 6);
      g.append("text").attr("class", "v").attr("x", (d) => x(Math.max(d.named, d.linked)) + 10).attr("y", rh / 2 + 4)
        .text((d) => `${d.named} / ${d.linked}`);
    }

    function inspect(n) {
      const ps = BYB.get(n) || [];
      const grp = [
        { k: "agree", t: "Name it and link it", list: ps.filter((p) => p.w === "ok") },
        { k: "outside", t: "Name it, but link those words to another page", list: ps.filter((p) => p.w === "lo" || p.w === "li") },
        { k: "never", t: "Name it, never link those words", list: ps.filter((p) => p.w === "nl") },
        { k: "codename", t: "Link to it without naming it", list: ps.filter((p) => p.l && p.w !== "ok") },
      ];
      insp.hidden = false;
      const d = nodes.find((x) => x.n === n);
      insp.innerHTML = `<div class="insp-head"><div class="insp-title">${esc(lab(n))}${d.mantle ? ' <span class="tag-mantle">name page</span>' : ""}</div>
        <button class="insp-close" aria-label="Close">×</button></div>
        <p class="insp-note">Named by <b>${d.named}</b> pages, linked by <b>${d.linked}</b>. Pick a page to read what it says and what its source links.</p>`;
      insp.querySelector(".insp-close").addEventListener("click", () => { insp.hidden = true; sel = null; draw(); });
      const out = document.createElement("div");
      grp.forEach((G) => {
        if (!G.list.length) return;
        const box = document.createElement("div");
        box.className = "grp";
        box.innerHTML = `<h4><i style="background:${FAM[G.k].c}"></i>${G.t} · ${G.list.length}</h4>`;
        G.list.sort((a, b) => b.n - a.n || lab(a.a).localeCompare(lab(b.a)));
        box.appendChild(pairButtons(G.list, out, (p) => {
          let s = esc(lab(p.a));
          if (p.w === "lo" || p.w === "li") s += ` <small>→ ${esc(p.src.to ? lab(p.src.to) : p.src.t)}</small>`;
          else if (p.l && p.w !== "ok") s += ` <small>${esc(FAM[fam(p)].label)}</small>`;
          return s;
        }));
        insp.appendChild(box);
      });
      insp.appendChild(out);
      const first = insp.querySelector(".pairs button");
      if (first) first.click();
    }

    document.querySelectorAll("#f1-mode button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#f1-mode button").forEach((x) => x.classList.toggle("active", x === b));
      mode = b.dataset.v; draw();
    }));
    const find = document.getElementById("f1-find");
    find.addEventListener("change", () => {
      const n = BYLABEL.get(find.value.trim().toLowerCase());
      if (!n) return;
      sel = n; draw(); inspect(n);
      insp.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    onResize(chart, draw);
    draw();
    inspect(sel);
  }

  // ---------- Figure 2: the two ledgers ----------
  function fig2() {
    const host = document.getElementById("f2-bars"), list = document.getElementById("f2-list");
    const P = D.pairs;
    const sides = [
      { k: "links", title: "The links", sub: (n) => `${fmt(n)} pairs where A links to B`, fams: LINK_SIDE, rows: P.filter((p) => p.l) },
      { k: "names", title: "The names", sub: (n) => `${fmt(n)} pairs where A's prose names B`, fams: NAME_SIDE, rows: P.filter((p) => p.n > 0) },
    ];
    const max = d3.max(sides, (s) => s.rows.length);
    let open = null;
    host.innerHTML = "";
    sides.forEach((S) => {
      const counts = S.fams.map((f) => ({ f, list: S.rows.filter((p) => fam(p) === f) }));
      const box = document.createElement("div");
      box.className = "ledger";
      box.innerHTML = `<div class="ledger-k"><b>${S.title}</b><span>${S.sub(S.rows.length)}</span></div>
        <div class="lbar" style="width:${(S.rows.length / max) * 100}%">${counts.map((c) => {
          const F = FAM[c.f], w = (c.list.length / S.rows.length) * 100;
          return `<div class="s${F.light ? " light" : ""}" data-f="${c.f}" style="width:${w}%;background:${F.c}">${w > 6 ? `<span>${fmt(c.list.length)}</span>` : ""}</div>`;
        }).join("")}</div>
        <div class="lkey">${counts.map((c) => `<span data-f="${c.f}"><i style="background:${FAM[c.f].c}"></i>${esc(FAM[c.f].label)}<b>${fmt(c.list.length)}</b></span>`).join("")}</div>`;
      host.appendChild(box);
      const pick = (f) => {
        const c = counts.find((x) => x.f === f);
        document.querySelectorAll("#f2-bars .lbar").forEach((b) => b.classList.add("dim"));
        document.querySelectorAll("#f2-bars .s").forEach((s) => s.classList.remove("on"));
        box.querySelector(`.s[data-f="${f}"]`).classList.add("on");
        open = S.k + f;
        const L = c.list.slice().sort((a, b) => b.n - a.n || lab(a.a).localeCompare(lab(b.a)));
        list.hidden = false;
        list.innerHTML = `<div class="insp-head"><div class="insp-title">${esc(FAM[f].label)} <span class="x">·</span> ${fmt(L.length)} pairs</div>
          <button class="insp-close" aria-label="Close">×</button></div><p class="insp-note">${esc(FAM[f].desc)}</p>`;
        list.querySelector(".insp-close").addEventListener("click", () => {
          list.hidden = true;
          document.querySelectorAll("#f2-bars .lbar").forEach((b) => b.classList.remove("dim"));
        });
        const out = document.createElement("div");
        list.appendChild(pairButtons(L, out, (p) => `${esc(lab(p.a))} → ${esc(lab(p.b))}`, 30));
        list.appendChild(out);
        list.querySelector(".pairs button").click();
      };
      box.querySelectorAll(".s, .lkey span").forEach((el) => {
        el.addEventListener("click", () => pick(el.dataset.f));
        el.addEventListener("mousemove", (ev) => {
          const c = counts.find((x) => x.f === el.dataset.f);
          showTip(ev, `<strong>${esc(FAM[c.f].label)}</strong><div class="row"><span>pairs</span><span>${fmt(c.list.length)} (${pct(c.list.length / S.rows.length)})</span></div><div class="td">Click to list them.</div>`);
        });
        el.addEventListener("mouseleave", hideTip);
      });
    });
  }

  // ---------- Figure 3: the unit dial + roll calls ----------
  function fig3() {
    const chart = document.getElementById("f3-chart"), roll = document.getElementById("f3-roll");
    const units = ["sentence", "paragraph", "page"];
    document.getElementById("f3-legend").innerHTML = units.map((u) => `<span><i class="sw" style="background:${C[u]}"></i>same ${u}</span>`).join("") +
      `<span><i class="dash"></i>chance (${pct(D.stats.chance)} of pairs are linked)</span>`;
    function draw() {
      const W = chart.clientWidth, H = Math.min(380, Math.max(280, W * 0.55));
      const m = { t: 14, r: 18, b: 42, l: 50 };
      const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
      chart.innerHTML = "";
      const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(""));
      svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(pct));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(pct));
      svg.append("text").attr("class", "ax-label").attr("x", (m.l + W - m.r) / 2).attr("y", H - 6).attr("text-anchor", "middle").text("share of the linked pairs it finds (recall) →");
      svg.append("text").attr("class", "ax-label").attr("transform", `translate(13,${(m.t + H - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").text("share of its edges that are links (precision) →");
      svg.append("line").attr("x1", x(0)).attr("x2", x(1)).attr("y1", y(D.stats.chance)).attr("y2", y(D.stats.chance))
        .attr("stroke", C.muted).attr("stroke-dasharray", "4 4");
      units.forEach((u) => {
        const pts = D.dial.filter((d) => d.unit === u);
        svg.append("path").datum(pts).attr("fill", "none").attr("stroke", C[u]).attr("stroke-width", 2)
          .attr("d", d3.line().x((d) => x(d.recall)).y((d) => y(d.precision)));
        const g = svg.selectAll(null).data(pts).join("g").attr("transform", (d) => `translate(${x(d.recall)},${y(d.precision)})`)
          .on("mousemove", (ev, d) => showTip(ev, `<strong>Same ${u}, at least ${d.k}×</strong>
            <div class="row"><span>edges</span><span>${fmt(d.edges)}</span></div>
            <div class="row"><span>of them linked</span><span>${fmt(d.linked)} (${pct(d.precision)})</span></div>
            <div class="row"><span>links found</span><span>${pct(d.recall)} of 1,434</span></div>`))
          .on("mouseleave", hideTip);
        g.append("circle").attr("r", 9).attr("fill", "transparent");
        g.append("circle").attr("r", 4.5).attr("fill", "#fff").attr("stroke", C[u]).attr("stroke-width", 2);
        g.append("text").attr("class", "halo").attr("x", 7).attr("y", -6).style("font-size", "10px").style("fill", C[u]).text((d) => d.k);
      });
    }
    function drawRoll() {
      const R = D.roll.map((d) => ({ ...d, lab: d.n >= 6 ? "6+" : String(d.n) }));
      const W = roll.clientWidth, H = 170, m = { t: 8, r: 16, b: 34, l: 50 };
      const x = d3.scaleBand().domain(R.map((d) => d.lab)).range([m.l, W - m.r]).padding(0.28);
      const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
      roll.innerHTML = "";
      const svg = d3.select(roll).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(pct));
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0));
      svg.append("text").attr("class", "ax-label").attr("x", (m.l + W - m.r) / 2).attr("y", H - 4).attr("text-anchor", "middle").text("characters named in the sentence");
      const g = svg.selectAll(null).data(R).join("g")
        .on("mousemove", (ev, d) => showTip(ev, `<strong>${d.lab} names in the sentence</strong><div class="row"><span>pairs</span><span>${fmt(d.pairs)}</span></div><div class="row"><span>linked</span><span>${pct(d.linked)}</span></div>`))
        .on("mouseleave", hideTip);
      g.append("rect").attr("x", (d) => x(d.lab)).attr("width", x.bandwidth()).attr("y", (d) => y(d.linked)).attr("height", (d) => y(0) - y(d.linked))
        .attr("fill", C.sentence).attr("rx", 2);
      g.append("text").attr("x", (d) => x(d.lab) + x.bandwidth() / 2).attr("y", (d) => y(d.linked) - 5).attr("text-anchor", "middle")
        .style("font-size", "11px").style("fill", C.ink).text((d) => pct(d.linked));
    }
    onResize(chart, draw);
    onResize(roll, drawRoll);
    draw(); drawRoll();
  }

  // ---------- Figure 4: the audit samples ----------
  function fig4() {
    const A = D.audit;
    if (!A) return;
    const sum = document.getElementById("f4-sum"), list = document.getElementById("f4-list");
    function show(k) {
      const X = A[k], ok = X.filter((x) => x.ok).length;
      const kinds = d3.rollups(X.filter((x) => !x.ok), (v) => v.length, (x) => x.kind).sort((a, b) => b[1] - a[1]);
      sum.innerHTML = `<span class="chip ok"><b>${ok}</b> of ${X.length} ${k === "A" ? "right" : "real mentions"}</span>` +
        kinds.map(([kind, n]) => `<span class="chip"><b>${n}</b> ${esc(kind)}</span>`).join("");
      list.innerHTML = X.map((x) => {
        const ctx = esc(x.ctx).replace(/\[\[(.+?)\]\]/, "<mark>$1</mark>");
        return `<div class="it${x.ok ? "" : " bad"}"><div class="mk ${x.ok ? "y" : "n"}">${x.ok ? "✓" : "✗"}</div><div>
          <div class="ctx">…${ctx}…</div>
          <div class="who">on ${esc(lab(x.page))}'s page · read as ${esc(lab(x.who))}</div>
          ${x.ok ? "" : `<div class="err">${esc(x.kind)}: ${esc(x.why)}</div>`}</div></div>`;
      }).join("");
    }
    document.querySelectorAll("#f4-tab button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#f4-tab button").forEach((x) => x.classList.toggle("active", x === b));
      show(b.dataset.v);
    }));
    show("A");
  }

  d3.json("../assets/week7_comention.json").then((data) => {
    D = data;
    WHY = D.why;
    LABEL = D.label;
    MANTLE = new Set(D.mantle);
    D.pairs.forEach((p) => {
      if (!BYB.has(p.b)) BYB.set(p.b, []);
      BYB.get(p.b).push(p);
    });
    Object.entries(LABEL).forEach(([n, s]) => BYLABEL.set(s.toLowerCase(), n));
    document.getElementById("char-list").innerHTML = Object.values(LABEL).sort().map((s) => `<option value="${esc(s)}">`).join("");
    fig1(); fig2(); fig3(); fig4();
  });
})();
