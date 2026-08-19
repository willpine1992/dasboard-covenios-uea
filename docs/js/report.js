/* ==========================================================================
   Relatório analítico em PDF (gerado no navegador, sem backend) — usa
   jsPDF + jspdf-autotable (vendorizados em lib/, sem CDN). Reflete o
   recorte de dados atualmente filtrado no painel: os 4 gráficos (Gantt,
   Acordos por ano, Acordos por país, Mapa de Fluxo) são re-renderizados
   fora da tela com os dados já filtrados e capturados como imagem — não
   é screenshot dos gráficos visíveis, é uma segunda renderização isolada
   (assim não mexe no que está na tela).

   Os 4 gráficos são todos SVG puro, então a captura serializa o próprio
   SVG (com o estilo computado — cores/fontes — copiado inline, já que um
   data:image/svg+xml não enxerga o style.css externo da página) e
   rasteriza via Image+canvas. Chegamos a tentar html2canvas aqui, mas
   ele trava o renderer nessa página (clona o documento inteiro) — a
   rota SVG nativa é bem mais leve e não tem esse problema.
   ========================================================================== */
function describeActiveFilters(meta) {
  const parts = [];
  for (const f of meta.FILTER_FIELDS) {
    const set = meta.filters[f.key];
    if (set && set.size) parts.push(`${f.label}: ${[...set].join(", ")}`);
  }
  if (meta.selectedAno != null) parts.push(`Ano: ${meta.selectedAno}`);
  if (meta.selectedPais != null) parts.push(`País: ${meta.selectedPais}`);
  return parts;
}

const SVG_INLINE_PROPS = [
  "fill", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-dasharray",
  "opacity", "font-family", "font-size", "font-weight", "text-anchor", "letter-spacing",
];

/* copia o estilo computado (resolvido a partir do style.css externo,
   incl. var()) pro atributo style de cada nó — precisa rodar enquanto o
   svg ainda está de verdade no document, senão getComputedStyle não tem
   o que resolver */
function inlineComputedStyle(svgEl) {
  const apply = (el) => {
    const cs = getComputedStyle(el);
    let style = "";
    for (const p of SVG_INLINE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) style += `${p}:${v};`;
    }
    el.setAttribute("style", style);
  };
  apply(svgEl);
  svgEl.querySelectorAll("*").forEach(apply);
}

/* serializa um <svg> (já com estilo inline) e rasteriza via canvas */
function svgToPng(svgEl, { width, height, scale = 2, background = "#ffffff" }) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  const svgStr = new XMLSerializer().serializeToString(clone);
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Falha ao rasterizar SVG do relatório"));
    img.src = svgUrl;
  });
}

/* renderiza `renderFn(el)` num container fora da tela e captura como PNG.
   `height` fixo é exigido por gráficos que leem el.clientHeight (combo,
   globo); deixe undefined para gráficos de altura automática (Gantt,
   barras por país), que crescem com o conteúdo. Quando o gráfico usa
   mais de um <svg> (caso do Gantt: eixo fixo + linhas), empilha as
   capturas verticalmente num canvas só. */
async function captureChart(renderFn, { width, height } = {}) {
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed; left:-10000px; top:0; width:${width}px; ` +
    (height ? `height:${height}px;` : "") +
    `background:#ffffff;`;
  document.body.appendChild(host);
  let destroy = null;
  try {
    const result = renderFn(host);
    if (result && typeof result.destroy === "function") destroy = result.destroy;
    // dá um frame pro layout assentar (largura/altura lidas via clientWidth/Height)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const svgs = [...host.querySelectorAll("svg")];
    if (!svgs.length) return null;
    svgs.forEach(inlineComputedStyle);

    const canvases = [];
    for (const svg of svgs) {
      const w = Number(svg.getAttribute("width")) || width;
      const h = Number(svg.getAttribute("height")) || 1;
      if (h < 1) continue;
      canvases.push(await svgToPng(svg, { width: w, height: h }));
    }
    if (!canvases.length) return null;

    const totalH = canvases.reduce((s, c) => s + c.height, 0);
    const finalW = Math.max(...canvases.map((c) => c.width));
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = finalW;
    finalCanvas.height = totalH;
    const ctx = finalCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, finalW, totalH);
    let yOff = 0;
    for (const c of canvases) {
      ctx.drawImage(c, 0, yOff);
      yOff += c.height;
    }
    // JPEG, não PNG: o canvas é opaco (fundo branco preenchido acima), mas
    // toDataURL("image/png") ainda emite RGBA, e o jsPDF embute isso como
    // bitmap bruto + máscara alfa em vez de recomprimir — inflava o PDF
    // pra dezenas de MB. JPEG não tem alfa e comprime muito melhor esse
    // tipo de conteúdo (fundo branco sólido + linhas/texto).
    return {
      dataUrl: finalCanvas.toDataURL("image/jpeg", 0.92),
      format: "JPEG",
      w: finalCanvas.width,
      h: finalCanvas.height,
    };
  } finally {
    if (destroy) destroy();
    document.body.removeChild(host);
  }
}

/* roda `fn` com o tema forçado pra "light" (relatório sempre claro,
   independente do tema atual do dashboard), restaurando tudo depois —
   sem persistir em localStorage nem disparar acordos:themechange (os
   gráficos visíveis na tela não devem piscar durante a geração) */
async function withLightTheme(fn) {
  const html = document.documentElement;
  const original = html.getAttribute("data-theme");
  html.setAttribute("data-theme", "light");
  refreshThemeColors();
  try {
    return await fn();
  } finally {
    if (original) html.setAttribute("data-theme", original); else html.removeAttribute("data-theme");
    refreshThemeColors();
  }
}

async function captureReportCharts(acordos, meta) {
  return withLightTheme(async () => {
    const continentColor = buildContinentColorScale(acordos, (d) => d.continente);
    const charts = {};

    charts.gantt = acordos.length
      ? await captureChart((el) => renderGanttChart(el, acordos, { continentColor }), { width: 760 })
      : null;

    charts.combo = acordos.length
      ? await captureChart((el) => renderComboChart(el, aggregateByAno(acordos), { showBars: meta.showBars, showLine: meta.showLine }), { width: 760, height: 340 })
      : null;

    return charts;
  });
}

async function generateAcordosReport(acordos, meta, targetWindow) {
  try {
    await buildAcordosReport(acordos, meta, targetWindow);
  } catch (err) {
    console.error("Falha ao gerar relatório:", err);
    if (targetWindow && !targetWindow.closed) {
      targetWindow.document.body.textContent = "Não foi possível gerar o relatório. Feche esta aba e tente novamente.";
    }
    throw err;
  }
}

async function buildAcordosReport(acordos, meta, targetWindow) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginBottom = 50;
  const brand = [11, 61, 43]; // verde institucional (--ink-primary aprox.)
  let y = 50;

  const activeFilters = describeActiveFilters(meta);
  const now = new Date();
  const genLabel = now.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...brand);
  doc.text("Relatório Analítico — Acordos Internacionais UEA", marginX, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Gerado em ${genLabel}`, marginX, y);
  y += 13;
  doc.text(
    activeFilters.length
      ? `Filtros ativos: ${activeFilters.join(" · ")}  —  ${fmt(acordos.length)} de ${fmt(meta.totalCount)} acordos`
      : `Sem filtros ativos — todos os ${fmt(meta.totalCount)} acordos da base`,
    marginX, y
  );
  y += 22;

  // ---------------- KPIs ----------------
  const stats = computeStats(acordos);
  const kpis = [
    ["Países", fmt(stats.total_paises)],
    ["Acordos", fmt(stats.total_acordos)],
    ["Vigentes", fmt(stats.ativos)],
    ["Expirados", fmt(stats.expirados)],
    ["Instituições", fmt(stats.instituicoes)],
  ];
  const kpiW = (pageW - marginX * 2) / kpis.length;
  kpis.forEach(([label, value], i) => {
    const x = marginX + i * kpiW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...brand);
    doc.text(value, x, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), x, y + 30);
  });
  y += 48;
  doc.setDrawColor(225, 225, 225);
  doc.line(marginX, y, pageW - marginX, y);
  y += 18;

  const sectionTitle = (text) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...brand);
    doc.text(text, marginX, y);
    y += 8;
  };

  const usableW = pageW - marginX * 2;
  const maxImgH = pageH - marginBottom - 70; // deixa espaço pro título numa página nova

  // desenha um gráfico capturado (dataUrl/w/h) como imagem, com título,
  // paginando se não couber no resto da página atual
  function addChartImage(title, chart) {
    if (!chart) return;
    let drawW = usableW;
    let drawH = (chart.h / chart.w) * drawW;
    if (drawH > maxImgH) { drawH = maxImgH; drawW = (chart.w / chart.h) * drawH; }

    if (y + 20 + drawH > pageH - marginBottom) { doc.addPage(); y = 50; }
    sectionTitle(title);
    y += 6;
    const x = marginX + (usableW - drawW) / 2;
    doc.addImage(chart.dataUrl, chart.format || "PNG", x, y, drawW, drawH);
    y += drawH + 22;
  }

  // ---------------- gráficos (Gantt, ano, país, mapa de fluxo) ----------------
  const charts = await captureReportCharts(acordos, meta);
  addChartImage("Vigência dos acordos (Gantt)", charts.gantt);
  addChartImage("Acordos por ano", charts.combo);

  if (y > 50) { doc.addPage(); y = 50; }

  const tableStyle = {
    margin: { left: marginX, right: marginX },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: [40, 40, 40] },
    headStyles: { fillColor: brand, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 246] },
    didDrawPage: () => { y = 40; },
  };

  const pct = (n) => acordos.length ? `${((n / acordos.length) * 100).toFixed(0)}%` : "0%";

  // ---------------- por continente ----------------
  sectionTitle("Acordos por continente");
  const porContinente = topEntries(countBy(acordos, (a) => a.continente || "—"), 20);
  doc.autoTable({
    ...tableStyle,
    startY: y,
    head: [["Continente", "Acordos", "% do total"]],
    body: porContinente.map(([k, v]) => [k, fmt(v), pct(v)]),
  });
  y = doc.lastAutoTable.finalY + 20;

  // ---------------- por tipo ----------------
  sectionTitle("Acordos por tipo");
  const porTipo = topEntries(countBy(acordos, (a) => a.tipo || "—"), 20);
  doc.autoTable({
    ...tableStyle,
    startY: y,
    head: [["Tipo de acordo", "Acordos", "% do total"]],
    body: porTipo.map(([k, v]) => [k, fmt(v), pct(v)]),
  });
  y = doc.lastAutoTable.finalY + 20;

  // ---------------- por status de validação ARI ----------------
  sectionTitle("Acordos por status de validação (ARI)");
  const porAri = topEntries(countBy(acordos, (a) => a.status_validacao_ari || "—"), 20);
  doc.autoTable({
    ...tableStyle,
    startY: y,
    head: [["Status de validação (ARI)", "Acordos", "% do total"]],
    body: porAri.map(([k, v]) => [k, fmt(v), pct(v)]),
  });
  y = doc.lastAutoTable.finalY + 20;

  // ---------------- por faixa de vencimento ----------------
  sectionTitle("Acordos por faixa de vencimento");
  const porFaixa = topEntries(countBy(acordos, (a) => a.faixa_vencimento || "—"), 20);
  doc.autoTable({
    ...tableStyle,
    startY: y,
    head: [["Faixa de vencimento", "Acordos", "% do total"]],
    body: porFaixa.map(([k, v]) => [k, fmt(v), pct(v)]),
  });
  y = doc.lastAutoTable.finalY + 20;

  // ---------------- por país ----------------
  sectionTitle("Acordos por país");
  const porPais = aggregateByPais(acordos);
  doc.autoTable({
    ...tableStyle,
    startY: y,
    head: [["País", "Continente", "Acordos", "Vigentes"]],
    body: porPais.map((d) => [d.pais, d.continente, fmt(d.n_acordos), fmt(d.n_ativos)]),
  });
  y = doc.lastAutoTable.finalY + 20;

  // ---------------- evolução por ano ----------------
  sectionTitle("Evolução por ano de início");
  const porAno = aggregateByAno(acordos);
  doc.autoTable({
    ...tableStyle,
    startY: y,
    head: [["Ano", "Novos acordos", "Acumulado"]],
    body: porAno.map((d) => [String(d.ano), fmt(d.novos), fmt(d.acumulado)]),
  });
  y = doc.lastAutoTable.finalY + 20;

  // ---------------- detalhamento completo ----------------
  sectionTitle("Detalhamento dos acordos");
  const rows = [...acordos].sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));
  doc.autoTable({
    ...tableStyle,
    startY: y,
    styles: { ...tableStyle.styles, fontSize: 7.8 },
    head: [["Instituição", "País", "Tipo", "Início", "Fim", "Status", "ARI"]],
    body: rows.map((a) => [
      a.instituicao || "—",
      a.pais || "—",
      a.tipo || "—",
      fmtDate(a.data_inicio),
      a.prazo_indeterminado ? "Indeterminado" : fmtDate(a.data_fim),
      a.status || "—",
      a.status_validacao_ari || "—",
    ]),
    columnStyles: { 0: { cellWidth: 150 } },
  });

  // ---------------- rodapé com paginação ----------------
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("PROPESP UEA · Acordos Internacionais", marginX, doc.internal.pageSize.getHeight() - 20);
    doc.text(`Página ${i} de ${pageCount}`, pageW - marginX, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  const blobUrl = doc.output("bloburl");
  if (targetWindow && !targetWindow.closed) targetWindow.location.href = blobUrl;
  else window.open(blobUrl, "_blank");
}
