(function () {
  const state = { scale: "log", fit: true };

  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#ecebe6", family: "Inter, -apple-system, sans-serif" },
    margin: { l: 60, r: 20, t: 20, b: 55 },
    legend: { orientation: "h", y: -0.25 },
    xaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a" },
    yaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a" },
  };

  const PLOT_OPTS = { displayModeBar: false, responsive: true };

  fetch("../assets/week2_models.json")
    .then((response) => response.json())
    .then((data) => {
      renderCCDF(data);
      wireControls(data);
    })
    .catch((error) => {
      console.error("Unable to load week 2 model data:", error);
      const plotHost = document.getElementById("ccdf-plot");
      if (plotHost) {
        plotHost.innerHTML = "<p class='chart-note'>The CCDF data could not be loaded.</p>";
      }
    });

  function renderCCDF(data) {
    const traces = [
      {
        x: data.real.map((point) => point.x),
        y: data.real.map((point) => point.y),
        mode: "lines+markers",
        type: "scatter",
        name: "real network",
        line: { color: "#e0b85a", width: 2 },
        marker: { size: 6, color: "#e0b85a" },
      },
      {
        x: data.random.map((point) => point.x),
        y: data.random.map((point) => point.y),
        mode: "lines",
        type: "scatter",
        name: "G(n,m) random graph",
        line: { color: "#199e70", width: 2, dash: "dash" },
      },
      {
        x: data.ba.map((point) => point.x),
        y: data.ba.map((point) => point.y),
        mode: "lines",
        type: "scatter",
        name: "Barabási–Albert (m = 5)",
        line: { color: "#e8765a", width: 2, dash: "dot" },
      },
    ];

    if (state.fit) {
      traces.push({
        x: data.fit.map((point) => point.x),
        y: data.fit.map((point) => point.y),
        mode: "lines",
        type: "scatter",
        name: "power-law fit",
        line: { color: "#8ecae6", width: 2 },
      });
    }

    const type = state.scale === "log" ? "log" : "linear";
    const layout = Object.assign({}, baseLayout, {
      title: "Complementary cumulative degree distribution",
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "degree k", type }),
      yaxis: Object.assign({}, baseLayout.yaxis, { title: "P(K ≥ k)", type }),
    });

    Plotly.newPlot("ccdf-plot", traces, layout, PLOT_OPTS);
  }

  function wireControls(data) {
    const scaleBtn = document.getElementById("ccdf-scale-toggle");
    const fitBtn = document.getElementById("ccdf-fit-toggle");

    scaleBtn.onclick = () => {
      state.scale = state.scale === "log" ? "linear" : "log";
      scaleBtn.textContent = state.scale === "log" ? "● log–log axes" : "○ linear axes";
      scaleBtn.classList.toggle("on", state.scale === "log");
      renderCCDF(data);
    };

    fitBtn.onclick = () => {
      state.fit = !state.fit;
      fitBtn.textContent = state.fit ? "● show fitted power law" : "○ hide fitted power law";
      fitBtn.classList.toggle("on", state.fit);
      renderCCDF(data);
    };
  }
})();
