// Shared navigation for every page: the "Weekly posts" menu, breadcrumbs with previous/next,
// reading progress, the contents rail on wide screens, and previous/next cards at the end of a post.
(function () {
  const POSTS = [
    { n: 1, href: "week1-bootstrap.html", title: "Meet the network: 303 heroes, 17 loners, and one island of Morituri" },
    { n: 2, href: "week2-models.html", title: "Degree distribution vs. random models" },
    { n: 3, href: "week3-robustness.html", title: "Attack vs. random failure: how many heroes break the web?" },
    { n: 4, href: "week4-renaissance.html", title: "Where did the Renaissance go? 200 Louvain runs" },
    { n: 5, href: "week5-copying.html", title: "Wikipedia copies the paperwork, not the plot" },
    { n: 6, href: "week6-names.html", title: "Names or story? What Marvel lookalikes share" },
    { n: 7, href: "week7-hawkeye.html", title: "Can the text rebuild the network? Names, links and the Hawkeye problem" },
  ];
  const inPosts = /\/posts\//.test(location.pathname);
  const base = inPosts ? "" : "posts/";
  const home = inPosts ? "../index.html" : "index.html";
  const here = location.pathname.split("/").pop();
  const k = POSTS.findIndex((p) => p.href === here);

  // ---------- "Weekly posts" menu ----------
  document.querySelectorAll("[data-posts]").forEach((box) => {
    box.innerHTML = POSTS.slice().reverse().map((p) =>
      `<a href="${base}${p.href}" class="${p.href === here ? "current" : ""}"><span class="wk">Week ${p.n}</span><span class="tt">${p.title}</span></a>`
    ).join("") + `<a class="all" href="${home}">All posts and about this site</a>`;
  });
  // close the menu when clicking elsewhere or pressing Escape
  const menus = document.querySelectorAll("details.menu");
  document.addEventListener("click", (e) => menus.forEach((m) => { if (!m.contains(e.target)) m.open = false; }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menus.forEach((m) => (m.open = false)); });

  const article = document.querySelector("article");

  // ---------- breadcrumbs + previous / next (posts only) ----------
  if (article && k >= 0) {
    const head = article.querySelector(".article-head") || article.firstElementChild;
    const prev = POSTS[k - 1], next = POSTS[k + 1];
    const crumbs = document.createElement("nav");
    crumbs.className = "crumbs";
    crumbs.setAttribute("aria-label", "Breadcrumb");
    crumbs.innerHTML = `<span><a href="${home}">Home</a><span class="sep">/</span><a href="${home}#posts">Posts</a><span class="sep">/</span>Week ${POSTS[k].n}</span>
      <span class="pn">${prev ? `<a href="${prev.href}">← Week ${prev.n}</a>` : ""}${next ? `<a href="${next.href}">Week ${next.n} →</a>` : ""}</span>`;
    head.parentNode.insertBefore(crumbs, head);

    if (!article.querySelector(".post-nav")) {
      const nav = document.createElement("div");
      nav.className = "post-nav";
      if (prev) nav.innerHTML += `<a href="${prev.href}"><small>← Previous · Week ${prev.n}</small><span>${prev.title}</span></a>`;
      if (next) nav.innerHTML += `<a class="next" href="${next.href}"><small>Next · Week ${next.n} →</small><span>${next.title}</span></a>`;
      else nav.innerHTML += `<a class="next" href="${home}"><small>All posts →</small><span>Back to the index</span></a>`;
      article.appendChild(nav);
    }
  }

  // ---------- reading progress ----------
  const prog = document.querySelector(".progress");
  if (prog && article) {
    const onScroll = () => {
      const r = article.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      prog.style.width = (Math.min(1, Math.max(0, -r.top / Math.max(total, 1))) * 100).toFixed(2) + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---------- contents rail ----------
  if (article) {
    const heads = [...article.querySelectorAll("h2")];
    if (heads.length >= 4) {
      const toc = document.createElement("nav");
      toc.className = "toc";
      toc.setAttribute("aria-label", "Contents");
      toc.innerHTML = '<div class="t">On this page</div>';
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
      const spy = () => {
        toc.classList.toggle("on", heads[0].getBoundingClientRect().top < window.innerHeight * 0.9);
        let cur = 0;
        heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 150) cur = i; });
        links.forEach((a, i) => a.classList.toggle("cur", i === cur));
      };
      window.addEventListener("scroll", spy, { passive: true });
      spy();
    }
  }
})();
