
const form = document.getElementById("form");

const amountInput = document.getElementById("amount");
const fromSelect = document.getElementById("from");
const toSelect = document.getElementById("to");

const swapButton = document.getElementById("swap");
const convertButton = document.getElementById("convert");

const amountError = document.getElementById("amount-error");
const pairError = document.getElementById("pair-error");

const stateEmpty = document.getElementById("state-empty");
const stateLoading = document.getElementById("state-loading");
const stateError = document.getElementById("state-error");

const output = document.getElementById("output");
const outMain = document.getElementById("out-main");
const outRate = document.getElementById("out-rate");
const outDate = document.getElementById("out-date");

const historyEmpty = document.getElementById("h-empty");
const historyLoading = document.getElementById("h-loading");
const historyError = document.getElementById("h-error");
const historyContent = document.getElementById("h-content");
const historyBody = document.getElementById("h-body");

let chart = null;
let requestId = 0;


// 1. Load currencies

async function loadCurrencies() {
    try {
        const response = await fetch(
            "https://api.frankfurter.dev/v2/currencies"
        );

        if (!response.ok) {
            throw new Error("Failed to load currencies");
        }

        const currencies = await response.json();

        currencies.sort((a, b) =>
            a.iso_code.localeCompare(b.iso_code)
        );

        fromSelect.innerHTML = "";
        toSelect.innerHTML = "";

        currencies.forEach(currency => {
            const option1 = document.createElement("option");

            option1.value = currency.iso_code;
            option1.textContent =
                `${currency.iso_code} - ${currency.name}`;

            const option2 = option1.cloneNode(true);

            fromSelect.appendChild(option1);
            toSelect.appendChild(option2);
        });

        fromSelect.value = "USD";
        toSelect.value = "THB";

        fromSelect.disabled = false;
        toSelect.disabled = false;
        swapButton.disabled = false;
        convertButton.disabled = false;

        stateEmpty.hidden = false;
        stateError.hidden = true;

    } catch (error) {
        console.error("Currency error:", error);

        stateEmpty.hidden = true;
        stateError.textContent =
            "Unable to load currencies. Please check your internet.";
        stateError.hidden = false;
    }
}


// 2. Validate input

function validateInput() {
    amountError.textContent = "";
    pairError.textContent = "";

    const amountText = amountInput.value.trim();

    if (amountText === "") {
        amountError.textContent = "Please enter an amount.";
        return false;
    }

    const amount = Number(amountText);

    if (!Number.isFinite(amount) || amount < 0) {
        amountError.textContent =
            "Please enter a valid non-negative amount.";
        return false;
    }

    if (fromSelect.value === toSelect.value) {
        pairError.textContent =
            "Please select two different currencies.";
        return false;
    }

    return true;
}


// 3. Convert currency

async function convertCurrency() {
    if (!validateInput()) {
        return;
    }

    const currentRequest = ++requestId;

    const amount = Number(amountInput.value);
    const from = fromSelect.value;
    const to = toSelect.value;

    stateEmpty.hidden = true;
    stateError.hidden = true;
    output.hidden = true;
    stateLoading.hidden = false;

    historyEmpty.hidden = true;
    historyError.hidden = true;
    historyContent.hidden = true;
    historyLoading.hidden = true;

    try {
        const url =
            `https://api.frankfurter.dev/v2/rate/` +
            `${from.toLowerCase()}/${to.toLowerCase()}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Unable to fetch exchange rate");
        }

        const data = await response.json();

        if (currentRequest !== requestId) return;

        const rate = Number(data.rate);

        if (!Number.isFinite(rate)) {
            throw new Error("Invalid exchange rate");
        }

        const convertedAmount = amount * rate;

        outMain.textContent =
            `${convertedAmount.toLocaleString(undefined, {
                maximumFractionDigits: 4
            })} ${to}`;

        outRate.textContent =
            `1 ${from} = ${rate} ${to}`;

        outDate.textContent = `Rate date: ${data.date}`;

        output.hidden = false;

        await loadHistory(from, to, currentRequest);

    } catch (error) {
        if (currentRequest !== requestId) return;

        console.error("Conversion error:", error);

        stateError.textContent =
            "Unable to fetch exchange rate. Please try again.";
        stateError.hidden = false;

    } finally {
        if (currentRequest === requestId) {
            stateLoading.hidden = true;
        }
    }
}


// 4. Swap currencies

swapButton.addEventListener("click", () => {
    const oldFrom = fromSelect.value;

    fromSelect.value = toSelect.value;
    toSelect.value = oldFrom;

    if (amountInput.value.trim() !== "") {
        convertCurrency();
    }
});


// 5. Submit form

form.addEventListener("submit", event => {
    event.preventDefault();
    convertCurrency();
});


// 6. Automatically convert when values change

fromSelect.addEventListener("change", () => {
    if (amountInput.value.trim() !== "") {
        convertCurrency();
    }
});

toSelect.addEventListener("change", () => {
    if (amountInput.value.trim() !== "") {
        convertCurrency();
    }
});

amountInput.addEventListener("input", () => {
    if (amountInput.value.trim() !== "") {
        convertCurrency();
    }
});


// 7. Get date 30 days ago

function getDate30DaysAgo() {
    const date = new Date();

    date.setDate(date.getDate() - 30);

    return date.toISOString().split("T")[0];
}


// 8. Load 30-day exchange-rate history

async function loadHistory(from, to, currentRequest) {
    historyEmpty.hidden = true;
    historyError.hidden = true;
    historyContent.hidden = true;
    historyLoading.hidden = false;

    try {
        const startDate = getDate30DaysAgo();
        const endDate = new Date().toISOString().split("T")[0];

        const url =
            `https://api.frankfurter.dev/v2/rates?` +
            `from=${startDate}&to=${endDate}` +
            `&base=${from}&quotes=${to}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Failed to load history");
        }

        const data = await response.json();

        if (currentRequest !== requestId) return;

        const history = data
            .filter(item =>
                item.base === from && item.quote === to
            )
            .sort((a, b) => a.date.localeCompare(b.date));

        if (history.length === 0) {
            historyEmpty.textContent =
                "No rate history available for this period.";
            historyEmpty.hidden = false;
            return;
        }

        historyBody.innerHTML = "";

        history.forEach(item => {
            const row = document.createElement("tr");

            const dateCell = document.createElement("td");
            dateCell.textContent = item.date;

            const rateCell = document.createElement("td");
            rateCell.textContent =
                Number(item.rate).toFixed(4);

            row.appendChild(dateCell);
            row.appendChild(rateCell);

            historyBody.appendChild(row);
        });

        historyContent.hidden = false;

        createChart(
            history.map(item => item.date),
            history.map(item => Number(item.rate)),
            from,
            to
        );

    } catch (error) {
        if (currentRequest !== requestId) return;

        console.error("History error:", error);

        historyError.textContent =
            "Unable to load rate history.";
        historyError.hidden = false;

    } finally {
        if (currentRequest === requestId) {
            historyLoading.hidden = true;
        }
    }
}


// 9. Create line chart

function createChart(dates, rates, from, to) {
    const canvas = document.getElementById("chart");

    if (!canvas || typeof Chart === "undefined") {
        console.error("Chart.js or chart canvas is missing.");
        return;
    }

    const ctx = canvas.getContext("2d");

    if (chart) {
        chart.destroy();
    }

    chart = new Chart(ctx, {
        type: "line",

        data: {
            labels: dates,

            datasets: [{
                label: `${from} to ${to}`,
                data: rates,
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.3,
                fill: false
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            scales: {
                y: {
                    beginAtZero: false
                }
            },

            plugins: {
                legend: {
                    display: true
                }
            }
        }
    });
}


// 10. Start the application

loadCurrencies();
