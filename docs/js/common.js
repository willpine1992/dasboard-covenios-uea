/* ==========================================================================
   Acordos Internacionais — utilidades compartilhadas: dados, paleta, tema
   ========================================================================== */
let CAT_COLORS = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];

let GREEN_SEQUENTIAL = ["#eaf7f0", "#c7ecda", "#96dab9", "#5fc192", "#2e9e6c", "#0f7a4d", "#0b5c3a"];
let CHART_MAP_FILL = "#eef5f1";
let CHART_MAP_BORDER = "#0b6b45";
let CHART_NODE_NEUTRAL = "#0b3d2b";

/* ---------- tema claro/escuro ---------- */
const THEME_KEY = "acordos-theme";

function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function refreshThemeColors() {
  CAT_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => readCssVar(`--cat-${i}`));
  GREEN_SEQUENTIAL = [1, 2, 3, 4, 5, 6, 7].map((i) => readCssVar(`--chart-seq-${i}`));
  CHART_MAP_FILL = readCssVar("--chart-map-fill");
  CHART_MAP_BORDER = readCssVar("--chart-map-border");
  CHART_NODE_NEUTRAL = readCssVar("--chart-node-neutral");
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  refreshThemeColors();
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
  window.dispatchEvent(new CustomEvent("acordos:themechange", { detail: { theme } }));
}

function toggleTheme() { applyTheme(getTheme() === "dark" ? "light" : "dark"); }

function initThemeToggle() {
  refreshThemeColors();
  const theme = getTheme();
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-label", theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro");
    btn.addEventListener("click", toggleTheme);
  }
}

/* ---------- dados ---------- */
async function loadData() {
  const opts = { cache: "no-cache" };
  return fetch("../data/dashboard.json", opts).then((r) => r.json());
}

/* ---------- agregações ---------- */
function countBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/* categoriza continentes presentes num conjunto, cor fixa por continente */
function buildContinentColorScale(items, keyFn) {
  const counts = countBy(items, keyFn);
  const ordered = topEntries(counts, 8).map(([k]) => k);
  const scale = new Map();
  ordered.forEach((k, i) => scale.set(k, CAT_COLORS[i % CAT_COLORS.length]));
  return scale;
}

/* ---------- agregações derivadas de "acordos" (recalculadas a cada filtro) ---------- */
function aggregateByPais(acordos) {
  const map = new Map();
  for (const a of acordos) {
    if (!map.has(a.pais)) map.set(a.pais, { pais: a.pais, continente: a.continente, n_acordos: 0, n_ativos: 0 });
    const e = map.get(a.pais);
    e.n_acordos += 1;
    if (a.ativo) e.n_ativos += 1;
  }
  return [...map.values()].sort((a, b) => b.n_acordos - a.n_acordos);
}

function aggregateByAno(acordos) {
  const counts = new Map();
  for (const a of acordos) {
    if (a.ano_inicio == null) continue;
    counts.set(a.ano_inicio, (counts.get(a.ano_inicio) || 0) + 1);
  }
  const anos = [...counts.keys()].sort((a, b) => a - b);
  let acumulado = 0;
  return anos.map((ano) => {
    acumulado += counts.get(ano);
    return { ano, novos: counts.get(ano), acumulado };
  });
}

function computeStats(acordos) {
  const paises = new Set(acordos.map((a) => a.pais));
  const instituicoes = new Set(acordos.map((a) => a.instituicao));
  const ativos = acordos.filter((a) => a.ativo).length;
  return {
    total_paises: paises.size,
    total_acordos: acordos.length,
    ativos,
    expirados: acordos.length - ativos,
    instituicoes: instituicoes.size,
  };
}

/* ---------- tooltip global ---------- */
let tooltipEl = null;
function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "viz-tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}
function showTooltip(x, y, html) {
  const el = ensureTooltip();
  el.innerHTML = html;
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.classList.add("is-visible");
}
function moveTooltip(x, y) {
  if (tooltipEl) { tooltipEl.style.left = x + "px"; tooltipEl.style.top = y + "px"; }
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove("is-visible");
}

function fmt(n) { return n.toLocaleString("pt-BR"); }

function debounce(fn, ms) {
  let t;
  return function (...args) {
    const ctx = this;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(ctx, args), ms);
  };
}
