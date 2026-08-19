/* ==========================================================================
   Acordos Internacionais — funções de gráfico (D3): barras, combo, globo
   ========================================================================== */

/* ---------------- Barras horizontais invertidas: acordos por país ---------------- */
function renderCountryBars(el, porPais, opts = {}) {
  const container = d3.select(el);
  container.selectAll("*").remove();
  const width = el.clientWidth;
  if (!porPais.length || width < 10) {
    container.append("div").attr("class", "empty-hint").text("Sem dados.");
    return;
  }

  const n = opts.n || porPais.length;
  const data = porPais.slice(0, n);
  const maxV = data[0].n_acordos;
  const continentColor = opts.continentColor;

  // altura de linha fixa e legível — se não couber tudo no painel, o
  // container rola (ver overflow-y:auto no CSS de #bar-chart), em vez de
  // espremer as linhas até ficar ilegível
  const rowH = opts.rowHeight || 24;
  const height = data.length * rowH;
  const svg = container.append("svg").attr("width", width).attr("height", height);
  const g = svg.selectAll("g.bar-track")
    .data(data)
    .join("g")
    .attr("class", "bar-track")
    .attr("transform", (_, i) => `translate(0, ${i * rowH})`);

  // invertido: rótulo à esquerda, barra cresce da direita pra esquerda,
  // valor na OUTRA ponta (a fixa, à direita — por isso reserva uma faixa
  // de espaço aí, senão o número cai em cima da própria barra)
  g.append("text")
    .attr("class", "bar-label")
    .attr("x", 0).attr("y", rowH * 0.32)
    .text((d) => truncateLabel(d.pais, 22));

  const barY = rowH * 0.45, barH = Math.max(5, rowH * 0.32);
  const rightPad = 34;
  const trackW = width - rightPad;
  const barW = (d) => Math.max(4, (d.n_acordos / maxV) * (trackW - 46));

  g.append("rect").attr("class", "bg")
    .attr("x", 0).attr("y", barY).attr("width", trackW).attr("height", barH).attr("rx", barH / 2);

  g.append("rect").attr("class", (d) => "fg" + (opts.activePais === d.pais ? " is-selected" : ""))
    .attr("y", barY).attr("height", barH).attr("rx", barH / 2)
    .attr("width", barW)
    .attr("x", (d) => trackW - barW(d))
    .attr("fill", (d) => (continentColor ? continentColor.get(d.continente) : CHART_NODE_NEUTRAL))
    .style("cursor", "pointer")
    .on("mousemove", (ev, d) => showTooltip(ev.clientX, ev.clientY,
      `<b>${d.pais}</b><br>${d.continente}<br>${fmt(d.n_acordos)} acordo(s)<br><span class="muted text-xs">clique p/ filtrar</span>`))
    .on("mouseleave", hideTooltip)
    .on("click", (ev, d) => { opts.onCountryClick && opts.onCountryClick(d.pais); });

  // valor na ponta fixa (direita) da barra
  g.append("text").attr("class", "bar-value")
    .attr("x", trackW + 8).attr("y", barY + barH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .text((d) => fmt(d.n_acordos));
}

/* ---------------- Combo: acordos por ano + acumulado ---------------- */
function renderComboChart(el, porAno, opts = {}) {
  const container = d3.select(el);
  container.selectAll("*").remove();
  const width = el.clientWidth, height = el.clientHeight;
  if (!porAno.length || width < 10 || height < 10) {
    container.append("div").attr("class", "empty-hint").text("Sem dados.");
    return;
  }

  const margin = { top: 10, right: 42, bottom: 26, left: 34 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = container.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(porAno.map((d) => d.ano)).range([0, innerW]).padding(0.35);
  const yBar = d3.scaleLinear().domain([0, d3.max(porAno, (d) => d.novos) * 1.15]).range([innerH, 0]);
  const yLine = d3.scaleLinear().domain([0, d3.max(porAno, (d) => d.acumulado) * 1.08]).range([innerH, 0]);

  // eixo X
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .selectAll("text")
    .data(porAno)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", (d) => x(d.ano) + x.bandwidth() / 2)
    .attr("y", 16)
    .attr("text-anchor", "middle")
    .text((d) => d.ano);

  // linha de base
  g.append("line")
    .attr("x1", 0).attr("x2", innerW).attr("y1", innerH).attr("y2", innerH)
    .attr("stroke", "var(--border-hairline)");

  const showBars = opts.showBars !== false;
  const showLine = opts.showLine !== false;

  // colunas: acordos novos no ano — clicáveis, filtram o painel por ano
  if (showBars) {
    g.selectAll("rect.combo-bar")
      .data(porAno)
      .join("rect")
      .attr("class", (d) => "combo-bar" + (opts.activeAno === d.ano ? " is-selected" : ""))
      .attr("x", (d) => x(d.ano))
      .attr("width", x.bandwidth())
      .attr("y", (d) => yBar(d.novos))
      .attr("height", (d) => innerH - yBar(d.novos))
      .attr("rx", 4)
      .style("cursor", "pointer")
      .on("mousemove", (ev, d) => showTooltip(ev.clientX, ev.clientY,
        `<b>${d.ano}</b><br>${fmt(d.novos)} acordo(s) novo(s)<br><span class="muted text-xs">clique p/ filtrar</span>`))
      .on("mouseleave", hideTooltip)
      .on("click", (ev, d) => { opts.onYearClick && opts.onYearClick(d.ano); });

    g.selectAll("text.combo-bar-value")
      .data(porAno)
      .join("text")
      .attr("class", "combo-bar-value")
      .attr("x", (d) => x(d.ano) + x.bandwidth() / 2)
      .attr("y", (d) => yBar(d.novos) - 6)
      .attr("text-anchor", "middle")
      .text((d) => fmt(d.novos));
  }

  // linha: acumulado
  if (showLine) {
    const line = d3.line().x((d) => x(d.ano) + x.bandwidth() / 2).y((d) => yLine(d.acumulado)).curve(d3.curveMonotoneX);
    g.append("path")
      .attr("class", "combo-line")
      .attr("d", line(porAno))
      .attr("fill", "none")
      .attr("stroke", "var(--ink-primary)")
      .attr("stroke-width", 2.4);

    g.selectAll("circle.combo-dot")
      .data(porAno)
      .join("circle")
      .attr("class", "combo-dot")
      .attr("cx", (d) => x(d.ano) + x.bandwidth() / 2)
      .attr("cy", (d) => yLine(d.acumulado))
      .attr("r", 4)
      .attr("fill", "var(--ink-primary)")
      .attr("stroke", "var(--surface-panel)")
      .attr("stroke-width", 2)
      .on("mousemove", (ev, d) => showTooltip(ev.clientX, ev.clientY,
        `<b>${d.ano}</b><br>${fmt(d.acumulado)} acordo(s) acumulado(s)`))
      .on("mouseleave", hideTooltip);

    g.selectAll("text.combo-line-value")
      .data(porAno)
      .join("text")
      .attr("class", "combo-line-value")
      .attr("x", (d) => x(d.ano) + x.bandwidth() / 2)
      .attr("y", (d) => yLine(d.acumulado) - 10)
      .attr("text-anchor", "middle")
      .style("fill", "var(--ink-primary)")
      .text((d) => fmt(d.acumulado));
  }

  if (!showBars && !showLine) {
    g.append("text").attr("class", "empty-hint")
      .attr("x", innerW / 2).attr("y", innerH / 2).attr("text-anchor", "middle")
      .text("Nenhuma série ativa.");
  }
}

function truncateLabel(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

/* ---------------- Gantt: vigência dos acordos ---------------- */
function renderGanttChart(el, acordos, opts = {}) {
  const container = d3.select(el);
  container.selectAll("*").remove();
  const width = el.clientWidth;
  if (!acordos.length || width < 10) {
    container.append("div").attr("class", "empty-hint").text("Sem dados.");
    return;
  }

  const continentColor = opts.continentColor;
  const rows = [...acordos].sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
  const labelText = (d) => `${d.instituicao} · ${d.pais}`;

  // mede a largura real do maior rótulo pra reservar coluna suficiente e
  // mostrar o nome completo da instituição, em vez de truncar num valor
  // fixo de caracteres (nomes variam muito de tamanho)
  const measureSvg = container.append("svg").style("position", "absolute").style("visibility", "hidden");
  const measureText = measureSvg.append("text").attr("class", "bar-label");
  let maxLabelW = 0;
  for (const d of rows) {
    measureText.text(labelText(d));
    maxLabelW = Math.max(maxLabelW, measureText.node().getComputedTextLength());
  }
  measureSvg.remove();

  const left = Math.min(Math.max(140, width * 0.5), maxLabelW + 26);
  const margin = { top: 48, right: 20, bottom: 6, left };
  const rowH = opts.rowHeight || 24;
  const innerH = rows.length * rowH;
  const innerW = width - margin.left - margin.right;
  const height = innerH + margin.top + margin.bottom;

  const today = new Date();
  const minDate = d3.min(rows, (d) => new Date(d.data_inicio));
  const maxDate = d3.max(rows, (d) => new Date(d.data_fim));
  const pad = (maxDate - minDate) * 0.03;
  const x0 = d3.scaleTime().domain([new Date(+minDate - pad), new Date(+maxDate + pad)]).range([0, innerW]);
  const y = d3.scaleBand().domain(rows.map((_, i) => i)).range([0, innerH]).padding(0.32);

  // eixo (datas) num SVG separado e FIXO no topo, fora da área com scroll —
  // senão ele rola junto com as linhas e some de vista (ver .gantt-axis-wrap)
  container.style("display", "flex").style("flex-direction", "column");
  const axisWrap = container.append("div").attr("class", "gantt-axis-wrap");
  const rowsWrap = container.append("div").attr("class", "gantt-rows-wrap");

  const axisSvg = axisWrap.append("svg").attr("width", width).attr("height", margin.top);
  const gAxis = axisSvg.append("g").attr("class", "gantt-axis").attr("transform", `translate(${margin.left},0)`);
  const todayLabel = axisSvg.append("text").attr("class", "gantt-today-label");

  const svg = rowsWrap.append("svg").attr("width", width).attr("height", innerH);

  const clipId = "gantt-clip-" + Math.random().toString(36).slice(2, 9);
  svg.append("clipPath").attr("id", clipId)
    .append("rect").attr("width", innerW).attr("height", innerH);

  // coluna de rótulos (instituição · país) — fixa, não participa do zoom
  const gLabels = svg.append("g");
  gLabels.selectAll("text.gantt-label")
    .data(rows)
    .join("text")
    .attr("class", "bar-label gantt-label")
    .attr("x", margin.left - 10)
    .attr("y", (_, i) => y(i) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(labelText);

  // área do gráfico (barras, linha de hoje) — clipada e com zoom
  const gPlot = svg.append("g").attr("transform", `translate(${margin.left},0)`);
  const gClip = gPlot.append("g").attr("clip-path", `url(#${clipId})`);

  const oneDay = 86400000;
  const bars = gClip.selectAll("rect.gantt-bar")
    .data(rows)
    .join("rect")
    .attr("class", "gantt-bar")
    .attr("y", (_, i) => y(i))
    .attr("height", y.bandwidth())
    .attr("rx", 5)
    .attr("fill", (d) => (continentColor ? continentColor.get(d.continente) : CHART_NODE_NEUTRAL))
    .on("mousemove", (ev, d) => {
      const diasRestantes = Math.round((new Date(d.data_fim) - today) / oneDay);
      const vigenciaTxt = diasRestantes >= 0
        ? `${fmt(diasRestantes)} dia(s) restante(s)`
        : `expirado há ${fmt(Math.abs(diasRestantes))} dia(s)`;
      showTooltip(ev.clientX, ev.clientY,
        `<b>${d.instituicao}</b><br>${d.pais} · ${d.continente}<br>` +
        `${fmtDate(d.data_inicio)} – ${fmtDate(d.data_fim)}<br>${d.status} · ${vigenciaTxt}`);
    })
    .on("mouseleave", hideTooltip);

  const todayLine = gClip.append("line").attr("class", "gantt-today-line")
    .attr("y1", 0).attr("y2", innerH);

  // eixo de duas linhas: ano (em cima) e semestre 1|2 (embaixo) — em vez
  // de rótulos alinhados a um tick (d3.axisTop padrão), os rótulos ficam
  // centrados no vão de cada banda (o ano/semestre inteiro), com uma
  // linha separadora nos limites reais (1º jan / 1º jul)
  function bandBoundaries(domain, interval) {
    const [d0, d1] = domain;
    let start = interval.floor(d0);
    if (start > d0) start = interval.offset(start, -1);
    const bounds = interval.range(start, interval.offset(interval.ceil(d1), 1));
    bounds.push(interval.offset(bounds[bounds.length - 1], 1));
    return bounds;
  }

  function bands(xScale, interval, labelFn) {
    const domain = xScale.domain();
    const bounds = bandBoundaries(domain, interval);
    const out = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const va = a < domain[0] ? domain[0] : a;
      const vb = b > domain[1] ? domain[1] : b;
      if (vb <= va) continue;
      out.push({ xMid: (xScale(va) + xScale(vb)) / 2, xStart: xScale(a), label: labelFn(a) });
    }
    return out;
  }

  const rowTop = 4, yearY = 17, semY = 39, rowBottom = margin.top - 3;

  function draw(xScale) {
    bars.attr("x", (d) => xScale(new Date(d.data_inicio)))
      .attr("width", (d) => Math.max(2, xScale(new Date(d.data_fim)) - xScale(new Date(d.data_inicio))));
    const tx = xScale(today);
    todayLine.attr("x1", tx).attr("x2", tx);
    todayLabel.attr("x", margin.left + tx + 4).attr("y", 9);

    gAxis.selectAll("*").remove();

    const yearBands = bands(xScale, d3.timeYear, (d) => String(d.getFullYear()));
    const semBands = bands(xScale, d3.timeMonth.every(6), (d) => (d.getMonth() < 6 ? "1" : "2"));

    gAxis.append("line").attr("class", "gantt-axis-divider")
      .attr("x1", 0).attr("x2", innerW).attr("y1", semY - 12).attr("y2", semY - 12);

    gAxis.selectAll("line.gantt-axis-tick-year")
      .data(yearBands.slice(1)).join("line")
      .attr("class", "gantt-axis-tick-year")
      .attr("x1", (d) => d.xStart).attr("x2", (d) => d.xStart)
      .attr("y1", rowTop).attr("y2", rowBottom);

    gAxis.selectAll("text.gantt-axis-year")
      .data(yearBands).join("text")
      .attr("class", "bar-label gantt-axis-year")
      .attr("x", (d) => d.xMid).attr("y", yearY)
      .attr("text-anchor", "middle")
      .text((d) => d.label);

    gAxis.selectAll("line.gantt-axis-tick-sem")
      .data(semBands.slice(1)).join("line")
      .attr("class", "gantt-axis-tick-sem")
      .attr("x1", (d) => d.xStart).attr("x2", (d) => d.xStart)
      .attr("y1", semY - 12).attr("y2", rowBottom);

    gAxis.selectAll("text.gantt-axis-sem")
      .data(semBands).join("text")
      .attr("class", "bar-label gantt-axis-sem")
      .attr("x", (d) => d.xMid).attr("y", semY)
      .attr("text-anchor", "middle")
      .text((d) => d.label);
  }
  draw(x0);
  todayLabel.text("Hoje");

  // ---- zoom (só no eixo do tempo — rows continuam fixas, sem distorcer) ----
  // scroll do mouse desligado de propósito (zoom só pelos botões +/−);
  // arrastar continua funcionando pra rolar o eixo depois de dar zoom
  const zoom = d3.zoom()
    .filter((ev) => ev.type !== "wheel")
    .scaleExtent([1, 30])
    .translateExtent([[0, 0], [innerW, 0]])
    .extent([[0, 0], [innerW, innerH]])
    .on("zoom", (ev) => draw(ev.transform.rescaleX(x0)));

  const zoomCatcher = gPlot.append("rect")
    .attr("class", "gantt-zoom-catcher")
    .attr("width", innerW).attr("height", innerH)
    .attr("fill", "transparent")
    .call(zoom);

  if (opts.zoomControls) {
    d3.select(opts.zoomControls).html("");
    const bar = d3.select(opts.zoomControls);
    bar.append("button").attr("class", "btn btn--ghost gantt-zoom-btn").text("−")
      .on("click", () => zoomCatcher.transition().duration(200).call(zoom.scaleBy, 0.7));
    bar.append("button").attr("class", "btn btn--ghost gantt-zoom-btn").text("Hoje")
      .on("click", () => {
        const span = maxDate - minDate;
        const k = Math.max(1, span / (today - minDate + span * 0.05) * 3);
        const tx = -x0(today) * k + innerW / 2;
        zoomCatcher.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(tx, 0).scale(k));
      });
    bar.append("button").attr("class", "btn btn--ghost gantt-zoom-btn").text("+")
      .on("click", () => zoomCatcher.transition().duration(200).call(zoom.scaleBy, 1.4));
    bar.append("button").attr("class", "btn btn--ghost gantt-zoom-btn").text("Reset")
      .on("click", () => zoomCatcher.transition().duration(200).call(zoom.transform, d3.zoomIdentity));
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
