const DATA_MANIFEST_URL = "./data/manifest.json";
const RANKING_SOURCE_URL = "./data/ranking-source.json";
const RANKING_CACHE_KEY = "dividendos-pwa:last-ranking";
const PAGE_SIZE = 50;

const form = document.querySelector("#ranking-form");
const yearsInput = document.querySelector("#years");
const percentInput = document.querySelector("#percent");
const searchInput = document.querySelector("#search");
const minValidYearsInput = document.querySelector("#min-valid-years");
const maxPriceInput = document.querySelector("#max-price");
const sortByInput = document.querySelector("#sort-by");
const onlyBelowInput = document.querySelector("#only-below");
const submitButton = document.querySelector("#submit-button");
const feedback = document.querySelector("#feedback");
const summaryTitle = document.querySelector("#summary-title");
const metricsGrid = document.querySelector("#metrics-grid");
const rankingCards = document.querySelector("#ranking-cards");
const rankingBody = document.querySelector("#ranking-body");
const prevPageButton = document.querySelector("#prev-page");
const nextPageButton = document.querySelector("#next-page");
const pageStatus = document.querySelector("#page-status");

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

let manifest = null;
let rankingSource = [];
let currentModel = null;
let currentPage = 1;

bootstrap();

async function bootstrap() {
  registerServiceWorker();

  try {
    manifest = await fetchManifest();
    rankingSource = await fetchRankingSource();
    restoreRanking();
    await loadRanking();
  } catch (error) {
    setFeedback(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadRanking();
});

prevPageButton.addEventListener("click", () => {
  if (!currentModel || currentPage <= 1) {
    return;
  }
  currentPage -= 1;
  renderTable(currentModel);
});

nextPageButton.addEventListener("click", () => {
  if (!currentModel) {
    return;
  }
  const totalPages = getTotalPages(currentModel.entries.length);
  if (currentPage >= totalPages) {
    return;
  }
  currentPage += 1;
  renderTable(currentModel);
});

async function fetchManifest() {
  const response = await fetch(DATA_MANIFEST_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Falha ao carregar o manifesto de dados: HTTP ${response.status}.`);
  }

  return response.json();
}

async function fetchRankingSource() {
  const response = await fetch(RANKING_SOURCE_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Falha ao carregar a base consolidada do ranking: HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return payload.stocks || [];
}

async function loadRanking() {
  const years = Number(yearsInput.value);
  const percent = Number(percentInput.value);
  const minValidYears = Number(minValidYearsInput.value);
  const maxPrice = maxPriceInput.value.trim() === "" ? null : Number(maxPriceInput.value);
  const sortBy = sortByInput.value;
  const onlyBelow = onlyBelowInput.checked;
  const query = searchInput.value.trim().toLowerCase();

  if (
    !Number.isInteger(years) ||
    !Number.isInteger(percent) ||
    !Number.isInteger(minValidYears) ||
    (maxPriceInput.value.trim() !== "" && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
    years < 1 ||
    percent < 1 ||
    minValidYears < 1
  ) {
    setFeedback("Revise os filtros numericos. Anos, retorno alvo e minimo de anos validos precisam ser validos.", true);
    return;
  }

  setLoading(true);
  setFeedback("Calculando ranking...");

  try {
    const entries = loadEntries(rankingSource, years, percent);
    const filtered = entries
      .filter((entry) => entry.validYears >= minValidYears)
      .filter((entry) => maxPrice === null || entry.currentPrice <= maxPrice)
      .filter((entry) => !onlyBelow || entry.discountPercent >= 0)
      .filter((entry) => {
        if (!query) {
          return true;
        }

        return entry.ticker.toLowerCase().includes(query) || entry.companyName.toLowerCase().includes(query);
      });

    const sorted = filtered
      .filter((entry) => Number.isFinite(entry.discountPercent))
      .sort((left, right) => compareEntries(left, right, sortBy));

    if (!sorted.length) {
      throw new Error("Nenhuma acao com dados suficientes foi encontrada.");
    }

    currentPage = 1;
    const model = buildRankingModel(sorted, years, percent, {
      minValidYears,
      maxPrice,
      sortBy,
      onlyBelow,
      query,
    });
    renderRanking(model);
    localStorage.setItem(RANKING_CACHE_KEY, JSON.stringify(model));
    setFeedback(`Ranking atualizado com ${sorted.length} acao(oes).`);
  } catch (error) {
    const cached = readCachedRanking();

    if (cached) {
      renderRanking(cached);
      setFeedback(`${error.message} Exibindo o ultimo ranking salvo localmente.`, true);
    } else {
      clearRanking();
      setFeedback(error.message, true);
    }
  } finally {
    setLoading(false);
  }
}

function loadEntries(source, years, percent) {
  return source
    .map((stockData) => buildEntry(stockData, stockData.ticker, years, percent))
    .filter(Boolean);
}

function buildEntry(stockData, ticker, years, percent) {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - years + 1;
  const dividends = (stockData.dividends || [])
    .map((item) => ({
      baseDate: item.comDate ? new Date(item.comDate) : null,
      value: Number(item.valuePerShare || 0),
    }))
    .filter((item) => item.baseDate && !Number.isNaN(item.baseDate.getTime()) && item.value > 0);

  const filtered = dividends.filter((item) => item.baseDate.getUTCFullYear() >= minYear);
  if (!filtered.length) {
    return null;
  }

  const yearlyTotalsMap = new Map();
  for (const item of filtered) {
    const year = item.baseDate.getUTCFullYear();
    yearlyTotalsMap.set(year, (yearlyTotalsMap.get(year) || 0) + item.value);
  }

  const yearlyTotals = Array.from(yearlyTotalsMap.values());
  if (!yearlyTotals.length) {
    return null;
  }

  const totalDividends = yearlyTotals.reduce((sum, value) => sum + value, 0);
  const averageDividends = totalDividends / yearlyTotals.length;
  const currentPrice = Number(stockData.currentPrice || 0);

  if (!(currentPrice > 0)) {
    return null;
  }

  const ceilingPrice = (averageDividends * 100) / percent;
  const discountPercent = ((ceilingPrice / currentPrice) - 1) * 100;

  return {
    ticker,
    companyName: stockData.companyName || ticker,
    validYears: yearlyTotals.length,
    currentPrice,
    averageDividends,
    ceilingPrice,
    discountPercent,
  };
}

function buildRankingModel(entries, years, percent, filters) {
  const belowCeilingCount = entries.filter((entry) => entry.discountPercent >= 0).length;
  const bestEntry = entries[0];

  return {
    years,
    percent,
    filters,
    entries,
    summary: {
      total: entries.length,
      belowCeilingCount,
      aboveCeilingCount: entries.length - belowCeilingCount,
      bestDiscountPercent: bestEntry.discountPercent,
    },
  };
}

function renderRanking(model) {
  currentModel = model;
  summaryTitle.textContent = `${model.entries.length} acoes para ${model.years} anos, ${model.percent}% e minimo de ${model.filters.minValidYears} ano(s) valido(s)`;
  metricsGrid.innerHTML = [
    metricCard("Acoes analisadas", String(model.summary.total)),
    metricCard("Abaixo do preco teto", String(model.summary.belowCeilingCount)),
    metricCard("Acima do preco teto", String(model.summary.aboveCeilingCount)),
    metricCard("Melhor desconto", formatPercent(model.summary.bestDiscountPercent), true),
  ].join("");

  rankingCards.className = "ranking-cards";
  rankingCards.innerHTML = model.entries.slice(0, 12).map((entry, index) => `
    <article class="ranking-card">
      <span class="ranking-position">#${index + 1}</span>
      <strong>${entry.ticker}</strong>
      <span>${entry.companyName}</span>
      <span>Cotacao: ${formatCurrency(entry.currentPrice)}</span>
      <span>Preco teto: ${formatCurrency(entry.ceilingPrice)}</span>
      <span class="ranking-badge ${entry.discountPercent >= 0 ? "positive" : "negative"}">
        ${formatPercent(entry.discountPercent)}
      </span>
    </article>
  `).join("");
  renderTable(model);
}

function clearRanking() {
  currentModel = null;
  summaryTitle.textContent = "Pronto para carregar.";
  rankingCards.className = "ranking-cards empty-state";
  rankingCards.textContent = "Nenhum ranking carregado ainda.";
  rankingBody.innerHTML = `
    <tr>
      <td colspan="8" class="empty-row">Nenhum ranking carregado ainda.</td>
    </tr>
  `;
  pageStatus.textContent = "Pagina 1 de 1";
  prevPageButton.disabled = true;
  nextPageButton.disabled = true;
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Calculando..." : "Atualizar ranking";
}

function metricCard(label, value, accent = false) {
  return `
    <article class="metric-card${accent ? " accent-card" : ""}">
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
    </article>
  `;
}

function formatCurrency(value) {
  return Number.isFinite(value) ? currencyFormatter.format(value) : "--";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}

function compareEntries(left, right, sortBy) {
  switch (sortBy) {
    case "average-desc":
      return right.averageDividends - left.averageDividends || right.discountPercent - left.discountPercent;
    case "price-asc":
      return left.currentPrice - right.currentPrice || right.discountPercent - left.discountPercent;
    case "valid-years-desc":
      return right.validYears - left.validYears || right.discountPercent - left.discountPercent;
    case "ceiling-desc":
      return right.ceilingPrice - left.ceilingPrice || right.discountPercent - left.discountPercent;
    case "discount-desc":
    default:
      return right.discountPercent - left.discountPercent || right.validYears - left.validYears;
  }
}

function renderTable(model) {
  const totalPages = getTotalPages(model.entries.length);
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  currentPage = safePage;
  const start = (safePage - 1) * PAGE_SIZE;
  const pageEntries = model.entries.slice(start, start + PAGE_SIZE);

  rankingBody.innerHTML = pageEntries.map((entry, index) => `
    <tr>
      <td>${start + index + 1}</td>
      <td><a href="./index.html?ticker=${entry.ticker}" target="_blank" rel="noreferrer">${entry.ticker}</a></td>
      <td>${entry.companyName}</td>
      <td>${entry.validYears}</td>
      <td>${formatCurrency(entry.currentPrice)}</td>
      <td>${formatCurrency(entry.averageDividends)}</td>
      <td>${formatCurrency(entry.ceilingPrice)}</td>
      <td class="${entry.discountPercent >= 0 ? "positive-text" : "negative-text"}">${formatPercent(entry.discountPercent)}</td>
    </tr>
  `).join("");

  pageStatus.textContent = `Pagina ${safePage} de ${totalPages}`;
  prevPageButton.disabled = safePage <= 1;
  nextPageButton.disabled = safePage >= totalPages;
}

function getTotalPages(totalItems) {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
}

function restoreRanking() {
  const cached = readCachedRanking();
  if (!cached) {
    return;
  }

  yearsInput.value = cached.years || yearsInput.value;
  percentInput.value = cached.percent || percentInput.value;
  minValidYearsInput.value = cached.filters?.minValidYears || minValidYearsInput.value;
  maxPriceInput.value = cached.filters?.maxPrice ?? "";
  sortByInput.value = cached.filters?.sortBy || "discount-desc";
  onlyBelowInput.checked = Boolean(cached.filters?.onlyBelow);
  searchInput.value = cached.filters?.query || "";
  currentPage = 1;
  renderRanking(cached);
  setFeedback("Ultimo ranking local restaurado.");
}

function readCachedRanking() {
  try {
    const raw = localStorage.getItem(RANKING_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (_error) {
    // Ignora falha de registro.
  }
}
