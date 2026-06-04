const APP_CACHE_KEY = "dividendos-pwa:last-result";
const DATA_MANIFEST_URL = "./data/manifest.json";

const form = document.querySelector("#quote-form");
const tickerInput = document.querySelector("#ticker");
const yearsInput = document.querySelector("#years");
const percentInput = document.querySelector("#percent");
const submitButton = document.querySelector("#submit-button");
const feedback = document.querySelector("#feedback");
const summaryTitle = document.querySelector("#summary-title");
const tickerPills = document.querySelector("#ticker-pills");
const metricsGrid = document.querySelector("#metrics-grid");
const detailsGrid = document.querySelector("#details-grid");
const yearBars = document.querySelector("#year-bars");
const eventsBody = document.querySelector("#events-body");

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

let dataManifest = {
  featuredTickers: [],
  tickers: {},
};

bootstrap();

async function bootstrap() {
  registerServiceWorker();
  const urlState = getUrlState();

  try {
    dataManifest = await fetchManifest();
    buildTickerPills(dataManifest.featuredTickers);
  } catch (_error) {
    buildTickerPills(["BAZA3"]);
    setFeedback(
      "Nao foi possivel carregar a lista de tickers locais. O app ainda pode funcionar para arquivos ja gerados.",
      true
    );
  }

  restoreLastResult(urlState);
  hydrateInputsFromUrl(urlState);

  if (urlState.ticker) {
    await loadTicker({
      ticker: urlState.ticker,
      years: Number(yearsInput.value),
      percent: Number(percentInput.value),
    });
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const ticker = tickerInput.value.trim().toUpperCase();
  const years = Number(yearsInput.value);
  const percent = Number(percentInput.value);

  if (!ticker || !Number.isInteger(years) || !Number.isInteger(percent)) {
    setFeedback("Preencha ticker, anos e retorno alvo com valores validos.", true);
    return;
  }

  if (years < 1 || percent < 1) {
    setFeedback("Anos e retorno alvo precisam ser maiores que zero.", true);
    return;
  }

  await loadTicker({ ticker, years, percent });
});

async function fetchManifest() {
  const response = await fetch(DATA_MANIFEST_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Falha ao carregar o manifesto de dados: HTTP ${response.status}.`);
  }

  return response.json();
}

async function loadTicker({ ticker, years, percent }) {
  setLoading(true);
  setFeedback(`Buscando dados locais de ${ticker}...`);

  try {
    const stockData = await fetchStockData(ticker);
    const viewModel = buildViewModel({ stockData, ticker, years, percent });
    renderResult(viewModel);
    localStorage.setItem(APP_CACHE_KEY, JSON.stringify(viewModel));
    setFeedback(`Consulta concluida para ${ticker}.`);
  } catch (error) {
    const cached = readCachedResult();

    if (cached && cached.ticker === ticker) {
      renderResult(cached);
      setFeedback(`${error.message} Exibindo o ultimo resultado salvo localmente.`, true);
    } else {
      clearResult();
      setFeedback(error.message, true);
    }
  } finally {
    setLoading(false);
  }
}

async function fetchStockData(ticker) {
  const manifestEntry = dataManifest.tickers?.[ticker];
  const dataPath = manifestEntry?.path || `./data/stocks/${ticker}.json`;
  const response = await fetch(dataPath, { cache: "no-store" });

  if (response.status === 404) {
    throw new Error(
      `O ticker ${ticker} nao possui arquivo local gerado. Atualize a base local para incluí-lo.`
    );
  }

  if (!response.ok) {
    throw new Error(`Falha ao carregar os dados locais de ${ticker}: HTTP ${response.status}.`);
  }

  return response.json();
}

function buildViewModel({ stockData, ticker, years, percent }) {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - years + 1;
  const dividends = normalizeDividends(stockData.dividends || []);
  const filteredDividends = dividends.filter((item) => item.baseYear >= minYear);

  if (!filteredDividends.length) {
    throw new Error(`Nao existem dividendos validos para ${ticker} nos ultimos ${years} anos.`);
  }

  const yearlyTotalsMap = new Map();

  for (const item of filteredDividends) {
    yearlyTotalsMap.set(item.baseYear, (yearlyTotalsMap.get(item.baseYear) || 0) + item.rate);
  }

  const yearlyTotals = Array.from(yearlyTotalsMap.entries())
    .map(([year, total]) => ({ year, total }))
    .sort((left, right) => left.year - right.year);

  const totalDividends = yearlyTotals.reduce((sum, item) => sum + item.total, 0);
  const averageDividends = totalDividends / yearlyTotals.length;
  const ceilingPrice = (averageDividends * 100) / percent;
  const currentPrice = Number(stockData.currentPrice || 0);
  const lastDividend = filteredDividends.at(-1) || dividends.at(-1) || null;
  const upsideToCeiling = currentPrice > 0
    ? ((ceilingPrice / currentPrice) - 1) * 100
    : null;

  return {
    ticker,
    shortName: stockData.companyName || ticker,
    longName: stockData.companyName || ticker,
    years,
    percent,
    currentPrice,
    totalDividends,
    averageDividends,
    ceilingPrice,
    upsideToCeiling,
    updatedAt: stockData.updatedAt || null,
    lastDividend,
    yearlyTotals,
    events: filteredDividends.slice(-12).reverse(),
    sourceName: stockData.source?.name || "Base local",
    sourceUrl: stockData.source?.url || null,
  };
}

function normalizeDividends(rawDividends) {
  return rawDividends
    .map((item) => {
      const baseDate = parseDate(item.comDate);
      const paymentDate = parseDate(item.paymentDate);
      const rate = Number(item.valuePerShare || 0);

      return {
        rate,
        label: item.type || "Provento",
        baseDate,
        paymentDate,
        baseYear: baseDate ? baseDate.getUTCFullYear() : null,
      };
    })
    .filter((item) => item.baseDate && Number.isFinite(item.rate) && item.rate > 0)
    .sort((left, right) => left.baseDate - right.baseDate);
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function renderResult(model) {
  summaryTitle.textContent = `${model.longName} (${model.ticker})`;
  renderMetrics(model);
  renderDetails(model);
  renderYearBars(model.yearlyTotals);
  renderEvents(model.events);
}

function renderMetrics(model) {
  metricsGrid.innerHTML = [
    metricCard("Cotacao atual", formatCurrency(model.currentPrice)),
    metricCard("Total no periodo", formatCurrency(model.totalDividends)),
    metricCard("Media anual", formatCurrency(model.averageDividends)),
    metricCard("Preco teto", formatCurrency(model.ceilingPrice), true),
  ].join("");
}

function renderDetails(model) {
  const cards = [
    {
      title: "Periodo analisado",
      body: `${model.years} anos com ${model.yearlyTotals.length} ano(s) com proventos validos.`,
    },
    {
      title: "Regra de calculo",
      body: `Media anual (${formatCurrency(model.averageDividends)}) x 100 / ${model.percent}%`,
    },
    {
      title: "Comparacao com a cotacao",
      body: buildPriceComparison(model),
    },
  ];

  detailsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="detail-card">
          <strong>${card.title}</strong>
          <span>${card.body}</span>
        </article>
      `
    )
    .join("");
}

function renderYearBars(yearlyTotals) {
  const maxValue = Math.max(...yearlyTotals.map((item) => item.total), 0);

  if (!maxValue) {
    yearBars.className = "year-bars empty-state";
    yearBars.textContent = "Nao ha dados suficientes para desenhar o grafico.";
    return;
  }

  yearBars.className = "year-bars";
  yearBars.innerHTML = yearlyTotals
    .map((item) => {
      const width = Math.max((item.total / maxValue) * 100, 4);

      return `
        <div class="bar-row">
          <span class="bar-label">${item.year}</span>
          <div class="bar-track" aria-hidden="true">
            <div class="bar-fill" style="width: ${width}%"></div>
          </div>
          <span class="bar-value">${formatCurrency(item.total)}</span>
        </div>
      `;
    })
    .join("");
}

function renderEvents(events) {
  if (!events.length) {
    eventsBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">Nenhum evento disponivel.</td>
      </tr>
    `;
    return;
  }

  eventsBody.innerHTML = events
    .map(
      (item) => `
        <tr>
          <td>${formatDate(item.baseDate)}</td>
          <td>${formatDate(item.paymentDate)}</td>
          <td>${item.label}</td>
          <td>${formatCurrency(item.rate)}</td>
        </tr>
      `
    )
    .join("");
}

function clearResult() {
  summaryTitle.textContent = "Pronto para calcular.";
  detailsGrid.innerHTML = "";
  yearBars.className = "year-bars empty-state";
  yearBars.textContent = "Nenhum dado carregado ainda.";
  eventsBody.innerHTML = `
    <tr>
      <td colspan="4" class="empty-row">Nenhum dado carregado ainda.</td>
    </tr>
  `;

  metricsGrid.innerHTML = [
    metricCard("Cotacao atual", "--"),
    metricCard("Total no periodo", "--"),
    metricCard("Media anual", "--"),
    metricCard("Preco teto", "--", true),
  ].join("");
}

function metricCard(label, value, accent = false) {
  return `
    <article class="metric-card${accent ? " accent-card" : ""}">
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
    </article>
  `;
}

function buildTickerPills(featuredTickers) {
  tickerPills.innerHTML = featuredTickers.map(
    (ticker) => `<button class="ticker-pill" type="button" data-ticker="${ticker}">${ticker}</button>`
  ).join("");

  tickerPills.addEventListener("click", (event) => {
    const target = event.target.closest("[data-ticker]");
    if (!target) {
      return;
    }

    tickerInput.value = target.dataset.ticker;
    tickerInput.focus();
  });
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Consultando..." : "Calcular";
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return currencyFormatter.format(value);
}

function formatDate(value) {
  if (!value) {
    return "--";
  }

  return dateFormatter.format(value);
}

function buildPriceComparison(model) {
  if (!Number.isFinite(model.currentPrice) || model.currentPrice <= 0) {
    return "Cotacao atual indisponivel para comparar com o preco teto.";
  }

  if (!Number.isFinite(model.upsideToCeiling)) {
    return "Comparacao indisponivel.";
  }

  if (model.currentPrice <= model.ceilingPrice) {
    return `A cotacao esta ${formatPercent(Math.abs(model.upsideToCeiling))} abaixo ou igual ao preco teto.`;
  }

  return `A cotacao esta ${formatPercent(Math.abs(model.upsideToCeiling))} acima do preco teto.`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value.toFixed(2)}%`;
}

function restoreLastResult(urlState) {
  const cached = readCachedResult();

  if (!cached) {
    return;
  }

  if (!urlState.ticker) {
    tickerInput.value = cached.ticker || tickerInput.value;
  }

  if (!urlState.years) {
    yearsInput.value = cached.years || yearsInput.value;
  }

  if (!urlState.percent) {
    percentInput.value = cached.percent || percentInput.value;
  }

  if (!urlState.ticker) {
    renderResult(cached);
    setFeedback(`Ultimo resultado local restaurado para ${cached.ticker}.`);
  }
}

function readCachedResult() {
  try {
    const raw = localStorage.getItem(APP_CACHE_KEY);
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
    // Falha de registro nao impede o app de funcionar online.
  }
}

function hydrateInputsFromUrl(urlState) {
  if (urlState.ticker) {
    tickerInput.value = urlState.ticker;
  }

  if (urlState.years) {
    yearsInput.value = String(urlState.years);
  }

  if (urlState.percent) {
    percentInput.value = String(urlState.percent);
  }
}

function getUrlState() {
  const params = new URLSearchParams(window.location.search);
  const ticker = params.get("ticker")?.trim().toUpperCase() || "";
  const years = Number(params.get("years"));
  const percent = Number(params.get("percent"));

  return {
    ticker,
    years: Number.isInteger(years) && years > 0 ? years : null,
    percent: Number.isInteger(percent) && percent > 0 ? percent : null,
  };
}
