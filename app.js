const FEATURED_TICKERS = ["PETR4", "VALE3", "ITUB4", "MGLU3"];
const APP_CACHE_KEY = "dividendos-pwa:last-result";

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

buildTickerPills();
restoreLastResult();
registerServiceWorker();

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

async function loadTicker({ ticker, years, percent }) {
  setLoading(true);
  setFeedback(`Buscando dados de ${ticker}...`);

  try {
    const quote = await fetchQuote(ticker);
    const viewModel = buildViewModel({ quote, ticker, years, percent });
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

async function fetchQuote(ticker) {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?dividends=true`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch (_error) {
    if (!response.ok) {
      throw new Error(`A API retornou erro ${response.status}.`);
    }
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Esse ticker provavelmente exige autenticacao. No GitHub Pages sem backend, use PETR4, VALE3, ITUB4 ou MGLU3."
      );
    }

    const message = payload?.message || payload?.error || `Erro ${response.status} ao consultar a API.`;
    throw new Error(message);
  }

  const quote = payload?.results?.[0];

  if (!quote) {
    throw new Error(`Nenhum resultado foi retornado para ${ticker}.`);
  }

  return quote;
}

function buildViewModel({ quote, ticker, years, percent }) {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - years + 1;
  const dividends = normalizeDividends(quote.dividendsData?.cashDividends || []);
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
  const regularMarketPrice = Number(quote.regularMarketPrice || 0);
  const lastDividend = filteredDividends.at(-1) || dividends.at(-1) || null;
  const upsideToCeiling = regularMarketPrice > 0
    ? ((ceilingPrice / regularMarketPrice) - 1) * 100
    : null;

  return {
    ticker,
    shortName: quote.shortName || ticker,
    longName: quote.longName || quote.shortName || ticker,
    years,
    percent,
    currentPrice: regularMarketPrice,
    totalDividends,
    averageDividends,
    ceilingPrice,
    upsideToCeiling,
    regularMarketChangePercent: Number(quote.regularMarketChangePercent || 0),
    updatedAt: quote.regularMarketTime || null,
    lastDividend,
    yearlyTotals,
    events: filteredDividends.slice(-12).reverse(),
  };
}

function normalizeDividends(rawDividends) {
  return rawDividends
    .map((item) => {
      const baseDate = parseDate(item.exDividendDate || item.paymentDate);
      const paymentDate = parseDate(item.paymentDate);
      const rate = Number(item.rate || item.value || 0);

      return {
        rate,
        label: item.label || item.type || "Provento",
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
    {
      title: "Ultimo provento",
      body: model.lastDividend
        ? `${formatCurrency(model.lastDividend.rate)} em ${formatDate(model.lastDividend.baseDate)}`
        : "Nao disponivel",
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

function buildTickerPills() {
  tickerPills.innerHTML = FEATURED_TICKERS.map(
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

function restoreLastResult() {
  const cached = readCachedResult();

  if (!cached) {
    return;
  }

  tickerInput.value = cached.ticker || tickerInput.value;
  yearsInput.value = cached.years || yearsInput.value;
  percentInput.value = cached.percent || percentInput.value;
  renderResult(cached);
  setFeedback(`Ultimo resultado local restaurado para ${cached.ticker}.`);
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
