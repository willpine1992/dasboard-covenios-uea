/* ==========================================================================
   Relatório analítico em PDF (gerado no navegador, sem backend) — usa
   jsPDF + jspdf-autotable (vendorizados em lib/, sem CDN). Reflete o
   recorte de dados atualmente filtrado no painel.
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

function generateAcordosReport(acordos, meta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;
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
  window.open(blobUrl, "_blank");
}
