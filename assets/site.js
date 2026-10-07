// Shared chrome for every page: top bar state, reading progress, table of contents,
// previous/next links, scroll reveals, and the network drawn behind the index masthead.
(function () {
  const POSTS = [
    { n: 1, href: "week1-bootstrap.html", title: "Meet the network: 303 heroes, 17 loners, and one island of Morituri" },
    { n: 2, href: "week2-models.html", title: "Degree distribution vs. random models" },
    { n: 3, href: "week3-robustness.html", title: "Attack vs. random failure" },
    { n: 4, href: "week4-renaissance.html", title: "Where did the Renaissance go?" },
    { n: 5, href: "week5-copying.html", title: "Wikipedia copies the paperwork, not the plot" },
    { n: 6, href: "week6-names.html", title: "Names or story?" },
  ];

  const bar = document.querySelector(".topbar");
  const prog = document.querySelector(".progress");
  const article = document.querySelector("article");

  function onScroll() {
    const y = window.scrollY;
    if (bar) bar.classList.toggle("scrolled", y > 8);
    if (prog && article) {
      const r = article.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(total, 1)));
      prog.style.width = (p * 100).toFixed(2) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- table of contents ----------
  if (article) {
    const heads = [...article.querySelectorAll("h2")];
    if (heads.length >= 4) {
      const toc = document.createElement("nav");
      toc.className = "toc";
      toc.setAttribute("aria-label", "Contents");
      toc.innerHTML = '<div class="t">Contents</div>';
      heads.forEach((h, i) => {
        if (!h.id) h.id = "s" + (i + 1);
        const a = document.createElement("a");
        a.href = "#" + h.id;
        const clone = h.cloneNode(true);
        clone.querySelectorAll(".sec").forEach((s) => s.remove());
        a.textContent = clone.textContent.trim();
        toc.appendChild(a);
      });
      document.body.appendChild(toc);
      const links = [...toc.querySelectorAll("a")];
      const first = heads[0];
      function spy() {
        toc.classList.toggle("on", first.getBoundingClientRect().top < window.innerHeight * 0.9);
        let cur = 0;
        heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) cur = i; });
        links.forEach((a, i) => a.classList.toggle("cur", i === cur));
      }
      window.addEventListener("scroll", spy, { passive: true });
      spy();
    }

    // ---------- previous / next ----------
    const here = location.pathname.split("/").pop();
    const k = POSTS.findIndex((p) => p.href === here);
    if (k >= 0 && !article.querySelector(".post-nav")) {
      const nav = document.createElement("div");
      nav.className = "post-nav";
      const prev = POSTS[k - 1], next = POSTS[k + 1];
      if (prev) nav.innerHTML += `<a href="${prev.href}"><small>← Week ${prev.n}</small><span>${prev.title}</span></a>`;
      if (next) nav.innerHTML += `<a class="next" href="${next.href}"><small>Week ${next.n} →</small><span>${next.title}</span></a>`;
      article.appendChild(nav);
    }
  }

  // ---------- reveal on scroll ----------
  const rev = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && rev.length) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    rev.forEach((el) => io.observe(el));
  } else rev.forEach((el) => el.classList.add("in"));

  // ---------- masthead network (index only) ----------
  const cv = document.getElementById("mast-net");
  if (cv && window.d3) {
    const ctx = cv.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    function size() {
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size);
    d3.json(cv.dataset.src).then((g) => {
      const nodes = g.nodes.filter((n) => n.comp === "giant").map((n) => ({ id: n.id, deg: n.in + n.out }));
      const keep = new Set(nodes.map((n) => n.id));
      const links = [];
      g.nodes.forEach((n) => (n.outLinks || []).forEach((t) => {
        if (keep.has(n.id) && keep.has(t) && n.id < t) links.push({ source: n.id, target: t });
      }));
      const sim = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((d) => d.id).distance(28).strength(0.25))
        .force("charge", d3.forceManyBody().strength(-26))
        .force("x", d3.forceX(() => W * 0.74).strength(0.04))
        .force("y", d3.forceY(() => H * 0.48).strength(0.06))
        .alphaDecay(0.012);
      const t0 = performance.now();
      function draw(now) {
        const rot = still ? 0 : (now - t0) / 90000;
        const cx = W * 0.74, cy = H * 0.48, c = Math.cos(rot), s = Math.sin(rot);
        const P = (n) => [cx + (n.x - cx) * c - (n.y - cy) * s, cy + (n.x - cx) * s + (n.y - cy) * c];
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = "rgba(236,235,230,0.07)";
        ctx.beginPath();
        links.forEach((l) => { const a = P(l.source), b = P(l.target); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
        ctx.stroke();
        nodes.forEach((n) => {
          const [x, y] = P(n), r = 1 + Math.sqrt(n.deg) * 0.42;
          ctx.fillStyle = n.deg > 40 ? "rgba(224,184,90,0.9)" : "rgba(236,235,230,0.35)";
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        });
        if (!still) requestAnimationFrame(draw);
      }
      for (let i = 0; i < 120; i++) sim.tick();       // start from a settled-ish layout
      if (still) { sim.stop(); for (let i = 0; i < 200; i++) sim.tick(); draw(0); }
      else { sim.on("tick", () => draw(performance.now())); requestAnimationFrame(draw); }
    });
  }
})();
