(function () {
  const state = { xscale: "linear" };

  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: "#ecebe6", family: "Inter, -apple-system, sans-serif" },
    margin: { l: 60, r: 20, t: 20, b: 55 },
    legend: { orientation: "h", y: -0.25 },
    xaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a" },
    yaxis: { gridcolor: "#24242a", zerolinecolor: "#24242a", range: [0, 1.02] },
  };

  const PLOT_OPTS = { displayModeBar: false, responsive: true };

  fetch("../assets/week3_robustness.json")
    .then((response) => response.json())
    .then((data) => {
      renderCurves(data);
      wireControls(data);
    })
    .catch((error) => {
      console.error("Unable to load week 3 robustness data:", error);
      const plotHost = document.getElementById("robustness-plot");
      if (plotHost) {
        plotHost.innerHTML = "<p class='chart-note'>The robustness data could not be loaded.</p>";
      }
    });

  function renderCurves(data) {
    const x = data.curves.x;
    const traces = [
      {
        x,
        y: data.curves.random_failure,
        mode: "lines",
        type: "scatter",
        name: `random failure (mean of ${data.meta.random_trials} trials)`,
        line: { color: "#199e70", width: 2, dash: "dash" },
      },
      {
        x,
        y: data.curves.degree_attack,
        mode: "lines",
        type: "scatter",
        name: "targeted attack (by degree)",
        line: { color: "#e8765a", width: 2, dash: "dot" },
      },
      {
        x,
        y: data.curves.betweenness_attack,
        mode: "lines",
        type: "scatter",
        name: "targeted attack (by betweenness)",
        line: { color: "#e0b85a", width: 2 },
      },
    ];

    const type = state.xscale === "log" ? "log" : "linear";
    const layout = Object.assign({}, baseLayout, {
      title: "Giant component under attack vs. random failure",
      xaxis: Object.assign({}, baseLayout.xaxis, { title: "nodes removed", type }),
      yaxis: Object.assign({}, baseLayout.yaxis, { title: "fraction of giant component still connected" }),
    });

    Plotly.newPlot("robustness-plot", traces, layout, PLOT_OPTS);
  }

  function wireControls(data) {
    const scaleBtn = document.getElementById("robustness-scale-toggle");
    if (!scaleBtn) return;
    scaleBtn.onclick = () => {
      state.xscale = state.xscale === "log" ? "linear" : "log";
      scaleBtn.textContent = state.xscale === "log" ? "● log x-axis" : "○ linear x-axis";
      scaleBtn.classList.toggle("on", state.xscale === "log");
      renderCurves(data);
    };
  }
})();
