
"use strict";

const API = "https://api.frankfurter.dev/v2";

const $ = (id) => document.getElementById(id);

const form = $("form");
const amountInput = $("amount");
const amountSymbol = $("amount-symbol");
const amountError = $("amount-error");
const fromSelect = $("from");
const toSelect = $("to");
const swapButton = $("swap");
const convertButton = $("convert");

const loadingState = $("state-loading");
const errorState = $("state-error");
const errorMessage = $("error-message");
const emptyState = $("state-empty");
const output = $("output");

const outPair = $("out-pair");
const outMain = $("out-main");
const outRate = $("out-rate");
const outDate = $("out-date");
const fromFlag = $("from-flag");

const historyLoading = $("h-loading");
const historyError = $("h-error");
const historyEmpty = $("h-empty");
const historyContent = $("h-content");
const historyBody = $("h-body");
const historyPairLabel = $("history-pair-label");

const currencySymbols = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
  KRW: "₩", THB: "฿", SGD: "S$", MYR: "RM", INR: "₹",
  AUD: "A$", CAD: "C$", CHF: "Fr", HKD: "HK$",
  NZD: "NZ$", IDR: "Rp", PHP: "₱", VND: "₫",
  BRL: "R$", TRY: "₺", MMK: "K"
};

const flags = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  CNY: "🇨🇳", KRW: "🇰🇷", THB: "🇹🇭", SGD: "🇸🇬",
  MYR: "🇲🇾", INR: "🇮🇳", AUD: "🇦🇺", CAD: "🇨🇦",
  CHF: "🇨🇭", HKD: "🇭🇰", NZD: "🇳🇿", IDR: "🇮🇩",
  PHP: "🇵🇭", VND: "🇻🇳", BRL: "🇧🇷", TRY: "🇹🇷",
  MMK: "🇲🇲"
};

let chartInstance = null;
let conversionId = 0;
let historyId = 0;

function symbol(code) {
  return currencySymbols[code] || code;
}

function number(value, digits = 4) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(value);
}

function money(value, code) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 4
    }).format(value);
  } catch {
    return `${code} ${number(value)}`;
  }
}

function dateLabel(date) {
  if (!date) return "Unavailable";

  const d = new Date(`${date}T00:00:00Z`);

  return Number.isNaN(d.getTime())
    ? date
    : new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(d);
}

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

function setConversionState(state, message = "") {
  loadingState.hidden = state !== "loading";
  errorState.hidden = state !== "error";
  emptyState.hidden = state !== "empty";
  output.hidden = state !== "success";

  if (message && state === "error") {
    errorMessage.textContent = message;
  }

  if (message && state === "empty") {
    emptyState.textContent = message;
  }
}

function setHistoryState(state, message = "") {
  historyLoading.hidden = state !== "loading";
  historyError.hidden = state !== "error";
  historyEmpty.hidden = state !== "empty";
  historyContent.hidden = state !== "success";

  if (message && state === "error") {
    historyError.textContent = message;
  }

  if (message && state === "empty") {
    historyEmpty.textContent = message;
  }
}

function populateCurrencies(currencies, select, defaultCode) {
  select.replaceChildren();

  currencies.forEach((currency) => {
    const option = document.createElement("option");
    option.value = currency.iso_code;
    option.textContent = `${currency.iso_code} — ${currency.name}`;
    select.appendChild(option);
  });

  select.value = currencies.some((c) => c.iso_code === defaultCode)
    ? defaultCode
    : currencies[0]?.iso_code || "";
}

function updateSymbol() {
  amountSymbol.textContent = symbol(fromSelect.value);
}

async function loadCurrencies() {
  fromSelect.disabled = true;
  toSelect.disabled = true;
  convertButton.disabled = true;

  try {
    const data = await getJSON(`${API}/currencies`);

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("The currency list is empty.");
    }

    data.sort((a, b) => a.iso_code.localeCompare(b.iso_code));

    populateCurrencies(data, fromSelect, "USD");
    populateCurrencies(data, toSelect, "EUR");

    fromSelect.disabled = false;
    toSelect.disabled = false;
    convertButton.disabled = false;

    updateSymbol();

    await Promise.all([
      convertCurrency(),
      loadHistory()
    ]);
  } catch (error) {
    setConversionState("error",
      `Could not load currencies. Check your internet connection. ${error.message}`);
    setHistoryState("error", "Could not load currency data.");
  }
}

async function convertCurrency() {
  const id = ++conversionId;
  const from = fromSelect.value;
  const to = toSelect.value;
  const amountText = amountInput.value.trim();
  const amount = Number(amountText);

  amountError.textContent = "";

  const pairError = $("pair-error");
  if (pairError) pairError.textContent = "";

  updateSymbol();

  if (!from || !to) {
    setConversionState("empty", "Choose both currencies.");
    return;
  }

  if (
    amountText === "" ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    amountError.textContent = "Enter a valid amount (zero or greater).";
    setConversionState("empty", "Enter a valid amount to convert.");
    return;
  }

  setConversionState("loading");
  convertButton.disabled = true;

  try {
    let rate;
    let date;

    if (from === to) {
      rate = 1;
      date = new Date().toISOString().slice(0, 10);
    } else {
      const data = await getJSON(
        `${API}/rate/${encodeURIComponent(from.toLowerCase())}/${encodeURIComponent(to.toLowerCase())}`
      );

      rate = Number(data.rate);
      date = data.date;

      if (!Number.isFinite(rate)) {
        throw new Error("The API returned an invalid rate.");
      }
    }

    if (id !== conversionId) return;

    outPair.textContent = `${from} → ${to}`;
    outMain.textContent = money(amount * rate, to);
    outRate.textContent = `1 ${from} = ${number(rate, 6)} ${to}`;
    outDate.textContent = dateLabel(date);
    fromFlag.textContent = flags[from] || "🌐";

    setConversionState("success");
  } catch (error) {
    if (id === conversionId) {
      setConversionState("error",
        `Unable to retrieve the exchange rate. ${error.message}`);
    }
  } finally {
    if (id === conversionId) {
      convertButton.disabled = false;
    }
  }
}

function buildHistoryURL(from, to, startDate, endDate) {
  const params = new URLSearchParams({
    base: from,
    quotes: to,
    from: startDate,
    to: endDate
  });

  return `${API}/rates?${params.toString()}`;
}

async function loadHistory() {
  const id = ++historyId;
  const from = fromSelect.value;
  const to = toSelect.value;

  if (!from || !to) {
    setHistoryState("empty", "Choose currencies to view rate history.");
    return;
  }

  historyPairLabel.textContent = `${from} → ${to}`;
  setHistoryState("loading");

  try {
    let points;

    if (from === to) {
      points = [{
        date: new Date().toISOString().slice(0, 10),
        rate: 1
      }];
    } else {
      const end = new Date();
      const start = new Date();

      // Approximately 90 days of history.
      start.setUTCDate(start.getUTCDate() - 90);

      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);

      const url = buildHistoryURL(from, to, startDate, endDate);
      const data = await getJSON(url);

      if (!Array.isArray(data)) {
        throw new Error("Unexpected historical data format.");
      }

      points = data
        .map((item) => ({
          date: item.date,
          rate: Number(item.rate)
        }))
        .filter((item) =>
          item.date && Number.isFinite(item.rate)
        )
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    if (id !== historyId) return;

    if (!points.length) {
      setHistoryState("empty",
        "No historical rates were returned for this currency pair and date range.");
      return;
    }

    // Reveal the chart container before measuring its dimensions.
    setHistoryState("success");

    // Wait one frame so the chart container is laid out.
    requestAnimationFrame(() => {
      if (id === historyId) {
        drawChart(points, from, to);
      }
    });

    renderHistoryTable(points, from, to);
  } catch (error) {
    if (id !== historyId) return;

    setHistoryState("error",
      `History could not load: ${error.message}. Check the API request or try another pair.`);
  }
}

function drawChart(points, from, to) {
  const canvas = $("chart");

  if (!canvas) {
    setHistoryState("error", "Chart canvas was not found in index.html.");
    return;
  }

  if (typeof Chart === "undefined") {
    setHistoryState("error",
      "Chart.js did not load. Check your internet connection or Chart.js CDN.");
    return;
  }

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 300);

  gradient.addColorStop(0, "rgba(84, 229, 255, 0.30)");
  gradient.addColorStop(1, "rgba(84, 229, 255, 0.01)");

  chartInstance = new Chart(context, {
    type: "line",
    data: {
      labels: points.map((p) => p.date),
      datasets: [{
        label: `${from} → ${to}`,
        data: points.map((p) => p.rate),
        borderColor: "#54e5ff",
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: points.length > 35 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#a5f5ff",
        pointBorderColor: "#121a31",
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 700
      },
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#dce7ff",
            usePointStyle: true,
            boxWidth: 8,
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: "#141c34",
          titleColor: "#ffffff",
          bodyColor: "#54e5ff",
          borderColor: "rgba(84, 229, 255, 0.3)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label(context) {
              return `1 ${from} = ${number(context.parsed.y, 6)} ${to}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: "#98a5c3",
            maxTicksLimit: 7,
            maxRotation: 0,
            callback(value) {
              const date = this.getLabelForValue(value);
              return date.slice(5);
            }
          },
          border: {
            color: "rgba(166, 184, 229, 0.15)"
          }
        },
        y: {
          grid: {
            color: "rgba(166, 184, 229, 0.10)"
          },
          ticks: {
            color: "#98a5c3",
            maxTicksLimit: 6,
            callback(value) {
              return number(Number(value), 4);
            }
          },
          border: {
            display: false
          }
        }
      }
    }
  });
}

function renderHistoryTable(points, from, to) {
  historyBody.replaceChildren();

  [...points].reverse().slice(0, 10).forEach((point) => {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = dateLabel(point.date);

    const pairCell = document.createElement("td");
    pairCell.textContent = `${from} → ${to}`;

    const rateCell = document.createElement("td");
    rateCell.textContent = `1 ${from} = ${number(point.rate, 6)} ${to}`;

    row.append(dateCell, pairCell, rateCell);
    historyBody.appendChild(row);
  });
}

/* Events */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await convertCurrency();
});

swapButton.addEventListener("click", async () => {
  const previousFrom = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = previousFrom;

  updateSymbol();

  await Promise.all([
    convertCurrency(),
    loadHistory()
  ]);
});

fromSelect.addEventListener("change", () => {
  updateSymbol();

  Promise.all([
    convertCurrency(),
    loadHistory()
  ]);
});

toSelect.addEventListener("change", () => {
  Promise.all([
    convertCurrency(),
    loadHistory()
  ]);
});

amountInput.addEventListener("input", () => {
  amountError.textContent = "";
});

/* Start */

loadCurrencies();
