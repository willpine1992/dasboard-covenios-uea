/* ==========================================================================
   Acordos Internacionais — orquestração da página 1 (Painel)
   ========================================================================== */
(async function () {
  const data = await loadData();
  const { acordos } = data;

  initThemeToggle();

  // cor por continente calculada sobre a base inteira, pra não mudar de
  // cor conforme os filtros são aplicados
  const continentColor = buildContinentColorScale(acordos, (d) => d.continente);

  const FILTER_FIELDS = [
    { key: "abrangencia", field: "abrangencia", label: "Abrangência" },
    { key: "statusAri", field: "status_validacao_ari", label: "Status de validação (ARI)" },
    { key: "continente", field: "continente", label: "Continente" },
    { key: "tipo", field: "tipo", label: "Tipo de acordo" },
  ];
  const filters = {};
  FILTER_FIELDS.forEach((f) => { filters[f.key] = new Set(); });
  let selectedAno = null; // clique numa coluna de "Acordos por ano"
  let selectedPais = null; // clique numa barra de "Acordos por país"
  let showBars = true, showLine = true; // toggle de séries do combo chart
  let ganttGranularity = "ano"; // granularidade do eixo do Gantt: "ano" | "semestre"

  // filtrado por tudo, exceto o que estiver em `exclude` — assim cada
  // gráfico "dono" de um filtro por-clique (ano/país) continua mostrando
  // todas as suas próprias opções mesmo com uma selecionada, em vez de
  // sumir com o resto ao clicar numa
  function filteredExcept(exclude) {
    return acordos.filter((a) =>
      FILTER_FIELDS.every((f) => !filters[f.key].size || filters[f.key].has(a[f.field])) &&
      (exclude === "ano" || selectedAno == null || a.ano_inicio === selectedAno) &&
      (exclude === "pais" || selectedPais == null || a.pais === selectedPais)
    );
  }

  function filteredAcordos() { return filteredExcept(null); }

  function toggleFilter(key, value) {
    filters[key].has(value) ? filters[key].delete(value) : filters[key].add(value);
    renderAll();
  }

  function toggleAno(ano) {
    selectedAno = selectedAno === ano ? null : ano;
    renderAll();
  }

  function togglePais(pais) {
    selectedPais = selectedPais === pais ? null : pais;
    renderAll();
  }

  function clearFilters() {
    FILTER_FIELDS.forEach((f) => filters[f.key].clear());
    selectedAno = null;
    selectedPais = null;
    renderAll();
  }

  function setGanttGranularity(key) {
    if (ganttGranularity === key) return;
    ganttGranularity = key;
    renderAll();
  }

  d3.select("#btn-clear-filters-top").on("click", clearFilters);
  d3.select("#btn-report").on("click", (ev) => {
    const btn = ev.currentTarget;
    // abre a aba já no clique (gesto síncrono do usuário) — se abrir só
    // depois dos awaits de captura dos gráficos, o Chrome trata como
    // pop-up não solicitado e bloqueia silenciosamente
    const reportTab = window.open("", "_blank");
    if (reportTab) {
      reportTab.document.title = "Gerando relatório…";
      reportTab.document.body.style.cssText = "font-family:-apple-system,Helvetica,Arial,sans-serif; color:#666; padding:60px;";
      reportTab.document.body.textContent = "Gerando relatório…";
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Gerando…";
    generateAcordosReport(filteredAcordos(), {
      filters, FILTER_FIELDS, selectedAno, selectedPais, totalCount: acordos.length,
      ganttGranularity, showBars, showLine,
    }, reportTab).finally(() => { btn.disabled = false; btn.textContent = original; });
  });

  renderFilterPanel();
  renderSeriesToggle();
  renderAll();

  window.addEventListener("acordos:themechange", renderAll);
  window.addEventListener("resize", debounce(renderAll, 200));

  function renderAll() {
    const current = filteredAcordos();

    renderStats(computeStats(current));
    renderCountryBars(document.getElementById("bar-chart"), aggregateByPais(filteredExcept("pais")), {
      continentColor,
      activePais: selectedPais,
      onCountryClick: togglePais,
    });
    renderComboChart(document.getElementById("combo-chart"), aggregateByAno(filteredExcept("ano")), {
      activeAno: selectedAno,
      onYearClick: toggleAno,
      showBars,
      showLine,
    });
    renderGanttChart(document.getElementById("gantt-chart"), current, {
      continentColor,
      zoomControls: "#gantt-zoom",
      granularityControls: "#gantt-granularity",
      granularity: ganttGranularity,
      onGranularityChange: setGanttGranularity,
    });
    renderFilterCounts(current);
  }

  function renderStats(stats) {
    d3.select("#stat-paises").text(fmt(stats.total_paises));
    d3.select("#stat-acordos").text(fmt(stats.total_acordos));
    d3.select("#stat-ativos").text(fmt(stats.ativos));
    d3.select("#stat-expirados").text(fmt(stats.expirados));
    d3.select("#stat-instituicoes").text(fmt(stats.instituicoes));
  }

  function renderFilterPanel() {
    const wrap = d3.select("#filters-panel");
    wrap.html("");

    const clearRow = wrap.append("div");
    clearRow.append("button").attr("class", "btn btn--ghost gantt-zoom-btn").text("Limpar filtros")
      .on("click", clearFilters);

    for (const f of FILTER_FIELDS) {
      const options = [...new Set(acordos.map((a) => a[f.field]).filter((v) => v != null && v !== ""))].sort();
      const group = wrap.append("div").attr("class", "filter-group");
      group.append("div").attr("class", "filter-group__title").text(f.label);
      const list = group.append("div").attr("class", "checklist").style("max-height", "none");
      const rows = list.selectAll(".checkrow").data(options, (d) => d).join("label").attr("class", "checkrow");
      rows.html((d) => `<input type="checkbox" /><span>${d}</span><small data-count></small>`);
      rows.select("input").on("change", (_, d) => toggleFilter(f.key, d));
    }
  }

  function renderSeriesToggle() {
    const items = [
      { key: "bars", label: "Colunas", color: "var(--chart-seq-4)", get: () => showBars, set: (v) => { showBars = v; } },
      { key: "line", label: "Linha", color: "var(--ink-primary)", get: () => showLine, set: (v) => { showLine = v; } },
    ];
    const wrap = d3.select("#combo-series-toggle");
    const chips = wrap.selectAll(".series-toggle__item").data(items, (d) => d.key).join("div")
      .attr("class", "series-toggle__item")
      .on("click", (_, d) => { d.set(!d.get()); renderSeriesToggle(); renderAll(); });
    chips.classed("is-off", (d) => !d.get());
    chips.html((d) => `<span class="series-toggle__dot" style="background:${d.color}"></span>${d.label}`);
  }

  function renderFilterCounts(current) {
    d3.select("#filter-count-hint").text(`${fmt(current.length)} / ${fmt(acordos.length)}`);
    // atualiza checkbox marcado + contagem, por grupo (ordem == FILTER_FIELDS,
    // já que os grupos foram criados nessa mesma ordem em renderFilterPanel)
    d3.select("#filters-panel").selectAll(".filter-group").each(function (_, gi) {
      const f = FILTER_FIELDS[gi];
      const counts = countBy(current, (a) => a[f.field]);
      d3.select(this).selectAll(".checkrow").each(function (d) {
        d3.select(this).select("input").property("checked", filters[f.key].has(d));
        d3.select(this).select("[data-count]").text(fmt(counts.get(d) || 0));
      });
    });
  }
})();
