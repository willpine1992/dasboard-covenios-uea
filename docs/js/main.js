/* ==========================================================================
   Acordos Internacionais — orquestração da página única
   ========================================================================== */
(async function () {
  const data = await loadData();
  const { stats, por_pais, por_ano, paises_geo, manaus } = data;

  initThemeToggle();

  const continentColor = buildContinentColorScale(por_pais, (d) => d.continente);

  renderStats();
  renderLegend();
  renderCountryBars(document.getElementById("bar-chart"), por_pais, { continentColor });
  renderComboChart(document.getElementById("combo-chart"), por_ano);

  const world = await getWorld();
  initFlowGlobe(document.getElementById("flow-chart"), { paisesGeo: paises_geo, manaus, continentColor, world });

  window.addEventListener("acordos:themechange", () => {
    renderCountryBars(document.getElementById("bar-chart"), por_pais, { continentColor });
    renderComboChart(document.getElementById("combo-chart"), por_ano);
  });
  window.addEventListener("resize", debounce(() => {
    renderCountryBars(document.getElementById("bar-chart"), por_pais, { continentColor });
    renderComboChart(document.getElementById("combo-chart"), por_ano);
  }, 200));

  function renderStats() {
    d3.select("#stat-paises").text(fmt(stats.total_paises));
    d3.select("#stat-acordos").text(fmt(stats.total_acordos));
    d3.select("#stat-ativos").text(fmt(stats.ativos));
    d3.select("#stat-expirados").text(fmt(stats.expirados));
    d3.select("#stat-instituicoes").text(fmt(stats.instituicoes));
  }

  function renderLegend() {
    const items = [...continentColor.entries()];
    d3.select("#continent-legend").selectAll(".flow-legend__item").data(items).join("div")
      .attr("class", "flow-legend__item")
      .html(([continente, color]) => `<span class="flow-legend__swatch" style="background:${color}"></span>${continente}`);
  }
})();
