/* ==========================================================================
   Acordos Internacionais — orquestração da página 1 (Painel)
   ========================================================================== */
(async function () {
  const data = await loadData();
  const { stats, por_pais, por_ano, acordos } = data;

  initThemeToggle();

  const continentColor = buildContinentColorScale(por_pais, (d) => d.continente);

  renderStats();
  renderAll();

  window.addEventListener("acordos:themechange", renderAll);
  window.addEventListener("resize", debounce(renderAll, 200));

  function renderAll() {
    renderCountryBars(document.getElementById("bar-chart"), por_pais, { continentColor });
    renderComboChart(document.getElementById("combo-chart"), por_ano);
    renderGanttChart(document.getElementById("gantt-chart"), acordos, {
      continentColor,
      zoomControls: "#gantt-zoom",
    });
  }

  function renderStats() {
    d3.select("#stat-paises").text(fmt(stats.total_paises));
    d3.select("#stat-acordos").text(fmt(stats.total_acordos));
    d3.select("#stat-ativos").text(fmt(stats.ativos));
    d3.select("#stat-expirados").text(fmt(stats.expirados));
    d3.select("#stat-instituicoes").text(fmt(stats.instituicoes));
  }
})();
