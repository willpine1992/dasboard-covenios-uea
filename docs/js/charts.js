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

  // invertido: rótulo e valor à ESQUERDA, barra cresce da direita pra
  // esquerda (ancorada na borda direita do painel)
  g.append("text")
    .attr("class", "bar-label")
    .attr("x", 0).attr("y", rowH * 0.32)
    .text((d) => truncateLabel(d.pais, 22));

  const barY = rowH * 0.45, barH = Math.max(5, rowH * 0.32);
  g.append("rect").attr("class", "bg")
    .attr("x", 0).attr("y", barY).attr("width", width).attr("height", barH).attr("rx", barH / 2);

  g.append("rect").attr("class", "fg")
    .attr("y", barY).attr("height", barH).attr("rx", barH / 2)
    .attr("width", (d) => Math.max(4, (d.n_acordos / maxV) * (width - 46)))
    .attr("x", (d) => width - Math.max(4, (d.n_acordos / maxV) * (width - 46)))
    .attr("fill", (d) => (continentColor ? continentColor.get(d.continente) : CHART_NODE_NEUTRAL))
    .on("mousemove", (ev, d) => showTooltip(ev.clientX, ev.clientY,
      `<b>${d.pais}</b><br>${d.continente}<br>${fmt(d.n_acordos)} acordo(s)`))
    .on("mouseleave", hideTooltip);

  g.append("text").attr("class", "bar-value")
    .attr("x", 0).attr("y", barY + barH / 2).attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .text((d) => fmt(d.n_acordos));
}

/* ---------------- Combo: acordos por ano + acumulado ---------------- */
function renderComboChart(el, porAno) {
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

  // colunas: acordos novos no ano
  g.selectAll("rect.combo-bar")
    .data(porAno)
    .join("rect")
    .attr("class", "combo-bar")
    .attr("x", (d) => x(d.ano))
    .attr("width", x.bandwidth())
    .attr("y", (d) => yBar(d.novos))
    .attr("height", (d) => innerH - yBar(d.novos))
    .attr("rx", 4)
    .attr("fill", CHART_NODE_NEUTRAL)
    .attr("opacity", 0.75)
    .on("mousemove", (ev, d) => showTooltip(ev.clientX, ev.clientY,
      `<b>${d.ano}</b><br>${fmt(d.novos)} acordo(s) novo(s)`))
    .on("mouseleave", hideTooltip);

  g.selectAll("text.combo-bar-value")
    .data(porAno)
    .join("text")
    .attr("class", "combo-bar-value")
    .attr("x", (d) => x(d.ano) + x.bandwidth() / 2)
    .attr("y", (d) => yBar(d.novos) - 6)
    .attr("text-anchor", "middle")
    .text((d) => fmt(d.novos));

  // linha: acumulado
  const line = d3.line().x((d) => x(d.ano) + x.bandwidth() / 2).y((d) => yLine(d.acumulado)).curve(d3.curveMonotoneX);
  g.append("path")
    .attr("class", "combo-line")
    .attr("d", line(porAno))
    .attr("fill", "none")
    .attr("stroke", "var(--accent-strong)")
    .attr("stroke-width", 2.4);

  g.selectAll("circle.combo-dot")
    .data(porAno)
    .join("circle")
    .attr("class", "combo-dot")
    .attr("cx", (d) => x(d.ano) + x.bandwidth() / 2)
    .attr("cy", (d) => yLine(d.acumulado))
    .attr("r", 4)
    .attr("fill", "var(--accent-strong)")
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
    .style("fill", "var(--accent-strong)")
    .text((d) => fmt(d.acumulado));
}

function truncateLabel(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
