/* ==========================================================================
   Acordos Internacionais — página 2: Mapa de Fluxo
   ========================================================================== */
(async function () {
  const data = await loadData();
  const { por_pais, paises_geo, manaus } = data;

  initThemeToggle();

  const continentColor = buildContinentColorScale(por_pais, (d) => d.continente);
  renderLegend();

  const world = await getWorld();
  initFlowGlobe(document.getElementById("flow-chart"), { paisesGeo: paises_geo, manaus, continentColor, world });

  function renderLegend() {
    const items = [...continentColor.entries()];
    d3.select("#continent-legend").selectAll(".flow-legend__item").data(items).join("div")
      .attr("class", "flow-legend__item")
      .html(([continente, color]) => `<span class="flow-legend__swatch" style="background:${color}"></span>${continente}`);
  }
})();
