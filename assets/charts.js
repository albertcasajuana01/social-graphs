(function () {
  const state = { metric: "in", scale: "log", distX: "linear", distY: "linear" };

  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#ecebe6", family: "Inter, -apple-system, sans-serif" },
    margin: { l: 55, r: 20, t: 10, b: 45 },
    legend: { orientation: "h", y: -0.22 },
    xaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a" },
    yaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a" },
  };
  const PLOT_OPTS = { displayModeBar: false, responsive: true };

  fetch("../assets/degree_data.json")
    .then((r) => r.json())
    .then((data) => {
      renderDegree(data);
      renderTwoDist(data);
      wireTabs();
      wireDegreeControls(data);
      wireDistControls(data);
    });

  function degreeTraces(data, metric) {
    const d = data[metric];
    const raw = {
      x: d.raw_x,
      y: d.raw_y,
      mode: "markers",
      type: "scatter",
      name: "raw count",
      marker: { color: metric === "in" ? "#e8765a" : "#3987e5", size: 8 },
      text: d.raw_x.map((v) => {
        const ex = d.top_examples[String(v)];
        return ex && ex.length ? "e.g. " + ex.join(", ") : "";
      }),
      hovertemplate: "k+1 = %{x}<br>count = %{y}<br>%{text}<extra></extra>",
    };
    const binned = {
      x: d.bin_x,
      y: d.bin_y,
      mode: "lines+markers",
      type: "scatter",
      name: "log-binned",
      line: { color: "#e0b85a", width: 2 },
      marker: { size: 5, color: "#e0b85a" },
      hovertemplate: "bin center = %{x:.1f}<br>count / width = %{y:.2f}<extra></extra>",
    };
    return [raw, binned];
  }

  function renderDegree(data) {
    const traces = degreeTraces(data, state.metric);
    const type = state.scale === "log" ? "log" : "linear";
    const layout = Object.assign({}, baseLayout, {
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "k + 1", type }),
      yaxis: Object.assign({}, baseLayout.yaxis, { title: "count", type }),
    });
    Plotly.newPlot("degree-plot", traces, layout, PLOT_OPTS);
  }

  function renderTwoDist(data) {
    const td = data.two_dist;
    const traces = [
      {
        x: td.exponential.x, y: td.exponential.y, mode: "lines+markers", name: "exponential",
        line: { color: "#199e70" }, marker: { size: 4, color: "#199e70" },
      },
      {
        x: td.powerlaw.x, y: td.powerlaw.y, mode: "lines+markers", name: "power law",
        line: { color: "#e66767" }, marker: { size: 4, color: "#e66767" },
      },
      {
        x: td.real_indegree.x, y: td.real_indegree.y, mode: "lines+markers", name: "real in-degree (k+1)",
        line: { color: "#e0b85a" }, marker: { size: 6, color: "#e0b85a" },
      },
    ];
    const layout = Object.assign({}, baseLayout, {
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "x", type: state.distX }),
      yaxis: Object.assign({}, baseLayout.yaxis, { title: "density", type: state.distY }),
    });
    Plotly.newPlot("twodist-plot", traces, layout, PLOT_OPTS);
  }

  function wireTabs() {
    const tabDeg = document.getElementById("tab-degree");
    const tabTwo = document.getElementById("tab-twodist");
    const panelDeg = document.getElementById("panel-degree");
    const panelTwo = document.getElementById("panel-twodist");
    tabDeg.onclick = () => {
      tabDeg.classList.add("active");
      tabTwo.classList.remove("active");
      panelDeg.hidden = false;
      panelTwo.hidden = true;
      Plotly.Plots.resize("degree-plot");
    };
    tabTwo.onclick = () => {
      tabTwo.classList.add("active");
      tabDeg.classList.remove("active");
      panelTwo.hidden = false;
      panelDeg.hidden = true;
      Plotly.Plots.resize("twodist-plot");
    };
  }

  function wireDegreeControls(data) {
    const inBtn = document.getElementById("deg-metric-in");
    const outBtn = document.getElementById("deg-metric-out");
    const scaleBtn = document.getElementById("deg-scale-toggle");
    inBtn.onclick = () => {
      state.metric = "in";
      inBtn.classList.add("on");
      outBtn.classList.remove("on");
      renderDegree(data);
    };
    outBtn.onclick = () => {
      state.metric = "out";
      outBtn.classList.add("on");
      inBtn.classList.remove("on");
      renderDegree(data);
    };
    scaleBtn.onclick = () => {
      state.scale = state.scale === "log" ? "linear" : "log";
      scaleBtn.textContent = state.scale === "log" ? "● log–log axes" : "○ linear axes";
      scaleBtn.classList.toggle("on", state.scale === "log");
      renderDegree(data);
    };
  }

  function wireDistControls(data) {
    const xBtn = document.getElementById("dist-x-toggle");
    const yBtn = document.getElementById("dist-y-toggle");
    xBtn.onclick = () => {
      state.distX = state.distX === "linear" ? "log" : "linear";
      xBtn.textContent = "x axis: " + state.distX;
      xBtn.classList.toggle("on", state.distX === "log");
      renderTwoDist(data);
    };
    yBtn.onclick = () => {
      state.distY = state.distY === "linear" ? "log" : "linear";
      yBtn.textContent = "y axis: " + state.distY;
      yBtn.classList.toggle("on", state.distY === "log");
      renderTwoDist(data);
    };
  }
})();
