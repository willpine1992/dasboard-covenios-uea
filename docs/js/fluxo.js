/* ==========================================================================
   Acordos Internacionais — página 2: Mapa de Fluxo
   ========================================================================== */
(async function () {
  const data = await loadData();
  const { por_pais, paises_geo, manaus, acordos } = data;

  initThemeToggle();

  const continentColor = buildContinentColorScale(por_pais, (d) => d.continente);
  renderLegend();

  const world = await getWorld();
  const globe = initFlowGlobe(document.getElementById("flow-chart"), {
    paisesGeo: paises_geo, manaus, continentColor, world,
    onSelect: showDetail,
  });

  function renderLegend() {
    const items = [...continentColor.entries()];
    d3.select("#continent-legend").selectAll(".flow-legend__item").data(items).join("div")
      .attr("class", "flow-legend__item")
      .html(([continente, color]) => `<span class="flow-legend__swatch" style="background:${color}"></span>${continente}`);
  }

  function showDetail(pais) {
    if (!pais) { d3.select("#flow-detail").classed("is-visible", false); return; }

    const acordosPais = acordos
      .filter((a) => a.pais === pais.pais)
      .sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));

    d3.select("#fd-title").text(pais.pais);
    d3.select("#fd-sub").text(
      `${pais.continente} · ${fmt(acordosPais.length)} acordo(s) · ${fmt(pais.n_ativos)} vigente(s)`
    );

    const rows = d3.select("#fd-acordos").selectAll(".pickrow").data(acordosPais, (d) => d.id).join("div").attr("class", "pickrow");
    rows.html((d) => `
      <span class="dot" style="background:${d.ativo ? "var(--accent)" : "var(--border-strong)"}"></span>
      <span class="label" title="${d.instituicao}">${d.instituicao}</span>
      <span class="count">${fmtDate(d.data_inicio)}–${fmtDate(d.data_fim)}</span>`);

    d3.select("#flow-detail").classed("is-visible", true);
  }

  d3.select("#fd-close").on("click", () => globe.setActive(null));
  d3.select("#flow-detail").on("click", (ev) => ev.stopPropagation());
})();
