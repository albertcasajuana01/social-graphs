(function () {
  fetch("../assets/week3_robustness.json")
    .then((response) => response.json())
    .then((data) => {
      fillFragmentersTable(data.top_fragmenters);
      fillBetweennessTable(data.top_betweenness);
    })
    .catch((error) => {
      console.error("Unable to load week 3 robustness data for tables:", error);
    });

  function fillFragmentersTable(rows) {
    const body = document.getElementById("fragmenters-table");
    if (!body) return;
    body.innerHTML = rows
      .map(
        (r) =>
          `<tr><td>${r.name}</td><td>${(r.impact * 100).toFixed(2)}%</td>` +
          `<td>bet. #${r.betweenness_rank}</td><td>deg. #${r.degree_rank}</td></tr>`
      )
      .join("");
  }

  function fillBetweennessTable(rows) {
    const body = document.getElementById("betweenness-table");
    if (!body) return;
    body.innerHTML = rows
      .map((r) => `<tr><td>${r.name}</td><td>${r.betweenness.toFixed(4)}</td><td>deg. ${r.degree}</td></tr>`)
      .join("");
  }
})();
