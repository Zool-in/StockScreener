import { fetchOHLCV } from '../core/api.js?v=7';
import { rsi, macd } from '../core/math.js?v=7';

// ─── Heikin-Ashi Calculation ───
function calculateHeikinAshi(opens, highs, lows, closes) {
  const n = closes.length;
  const haClose = new Array(n);
  const haOpen = new Array(n);
  const haHigh = new Array(n);
  const haLow = new Array(n);

  haClose[0] = (opens[0] + highs[0] + lows[0] + closes[0]) / 4;
  haOpen[0] = (opens[0] + closes[0]) / 2;
  haHigh[0] = highs[0];
  haLow[0] = lows[0];

  for (let i = 1; i < n; i++) {
    haClose[i] = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
    haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
    haHigh[i] = Math.max(highs[i], haOpen[i], haClose[i]);
    haLow[i] = Math.min(lows[i], haOpen[i], haClose[i]);
  }

  return { haOpen, haHigh, haLow, haClose };
}

// ─── DOM Elements ───
const DOM = {
  universePills: document.getElementById('universePills'),
  customTickerWrapper: document.getElementById('customTickerWrapper'),
  tickerInput: document.getElementById('tickerInput'),
  btnBullish: document.getElementById('btnBullish'),
  btnBearish: document.getElementById('btnBearish'),
  lookbackInput: document.getElementById('lookbackInput'),
  scanBtn: document.getElementById('scanBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  progressArea: document.getElementById('progressArea'),
  progressText: document.getElementById('progressText'),
  progressPercent: document.getElementById('progressPercent'),
  progressBar: document.getElementById('progressBar'),
  tableBody: document.getElementById('tableBody'),
  mmiStatus: document.getElementById('mmiStatus'),
  connStatus: document.getElementById('connStatus')
};

// ─── State ───
let tickers = [];
let scanResults = [];
let isScanning = false;
let currentAbortController = null;
let scanDirection = 'bullish'; // 'bullish' or 'bearish'
let currentSort = { col: 'score', asc: false };

// ─── Initialize ───
async function init() {
  fetchGlobalStatus();
  setInterval(fetchGlobalStatus, 30000);

  // Universe Pill Clicks
  DOM.universePills.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('pill')) return;
    Array.from(DOM.universePills.children).forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');

    const val = e.target.dataset.val;
    if (val === 'custom') {
      DOM.customTickerWrapper.classList.remove('hidden');
      updateTickersFromInput();
    } else {
      DOM.customTickerWrapper.classList.add('hidden');
      DOM.scanBtn.disabled = true;
      DOM.scanBtn.querySelector('span').innerText = `Loading ${val.toUpperCase()}...`;
      try {
        const res = await fetch(`/api/symbols?index=${val}`);
        const data = await res.json();
        if (data.symbols) {
          tickers = data.symbols;
        }
      } catch (err) {
        console.error("Failed to load symbols", err);
      }
      DOM.scanBtn.disabled = false;
      DOM.scanBtn.querySelector('span').innerText = `Run Multi-TF Scan`;
    }
  });

  // Load Nifty 50 default tickers
  try {
    const res = await fetch('/api/symbols?index=nifty50');
    const data = await res.json();
    if (data.symbols) tickers = data.symbols;
  } catch (err) {
    console.error("Failed to load default symbols", err);
  }

  // Custom input listener
  DOM.tickerInput.addEventListener('input', updateTickersFromInput);

  // Direction Toggles
  DOM.btnBullish.addEventListener('click', () => {
    DOM.btnBullish.classList.add('active');
    DOM.btnBearish.classList.remove('active');
    scanDirection = 'bullish';
    renderTable();
  });

  DOM.btnBearish.addEventListener('click', () => {
    DOM.btnBearish.classList.add('active');
    DOM.btnBullish.classList.remove('active');
    scanDirection = 'bearish';
    renderTable();
  });

  // Buttons
  DOM.scanBtn.addEventListener('click', runMultiTFScan);
  DOM.cancelBtn.addEventListener('click', cancelScan);

  // Sorting
  document.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (!col) return;
      if (currentSort.col === col) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.col = col;
        currentSort.asc = ['symbol'].includes(col); // ASC for scrip name, DESC for numbers
      }
      renderTable();
    });
  });
}

function updateTickersFromInput() {
  tickers = DOM.tickerInput.value.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Fetch Global Status ───
async function fetchGlobalStatus() {
  try {
    const mmiRes = await fetch('/api/mmi');
    if (mmiRes.ok) {
      const mmiData = await mmiRes.json();
      DOM.mmiStatus.innerText = `MMI: ${mmiData.value || 'N/A'}`;
      if (mmiData.value < 30) DOM.mmiStatus.className = 'badge badge-green';
      else if (mmiData.value > 70) DOM.mmiStatus.className = 'badge badge-red';
      else DOM.mmiStatus.className = 'badge badge-amber';
    }

    const brokersRes = await fetch('/kite/status');
    if (brokersRes.ok) {
      const bData = await brokersRes.json();
      if (bData.connected) {
        DOM.connStatus.innerText = 'Kite: Connected';
        DOM.connStatus.className = 'badge badge-green';
      } else {
        DOM.connStatus.innerText = 'Brokers: Offline';
        DOM.connStatus.className = 'badge badge-muted';
      }
    }
  } catch (e) {
    console.error('Failed to fetch status:', e);
  }
}

// ─── Scan Execution ───
async function runMultiTFScan() {
  if (isScanning) return;
  if (tickers.length === 0) {
    alert("Please select or enter at least one ticker.");
    return;
  }

  isScanning = true;
  scanResults = [];
  DOM.scanBtn.style.display = 'none';
  DOM.cancelBtn.style.display = 'inline-flex';
  DOM.progressArea.style.display = 'block';
  DOM.tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 64px 0;">Scanning starting...</td></tr>`;

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const lookback = parseInt(DOM.lookbackInput.value) || 0;

  // We fetch Daily, Weekly, and Monthly data for each stock
  const BATCH_SIZE = 4; // Fetch in small batches to prevent gateway/proxy timeouts
  const BATCH_DELAY = 300;

  try {
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) throw new Error('AbortError');

      const batch = tickers.slice(i, i + BATCH_SIZE);
      DOM.progressText.innerText = `Scanning (${i}/${tickers.length}) stocks...`;
      const pct = Math.round((i / tickers.length) * 100);
      DOM.progressPercent.innerText = `${pct}%`;
      DOM.progressBar.style.width = `${pct}%`;

      await Promise.all(batch.map(async (ticker) => {
        try {
          // Fetch Daily, Weekly, Monthly data in parallel for the current stock
          const [dailyData, weeklyData, monthlyData] = await Promise.all([
            fetchOHLCV(ticker, '1d', signal),
            fetchOHLCV(ticker, '1wk', signal),
            fetchOHLCV(ticker, '1mo', signal)
          ]);

          const dLen = dailyData.closes.length;
          const wLen = weeklyData.closes.length;
          const mLen = monthlyData.closes.length;

          // Need sufficient history
          if (dLen < 30 || wLen < 15 || mLen < 15) return;

          // Slices based on lookback
          const dCloses = dailyData.closes.slice(0, dLen - lookback);
          const dOpens = dailyData.opens.slice(0, dLen - lookback);
          const dHighs = dailyData.highs.slice(0, dLen - lookback);
          const dLows = dailyData.lows.slice(0, dLen - lookback);

          const wCloses = weeklyData.closes.slice(0, wLen - lookback);
          const wOpens = weeklyData.opens.slice(0, wLen - lookback);
          const wHighs = weeklyData.highs.slice(0, wLen - lookback);
          const wLows = weeklyData.lows.slice(0, wLen - lookback);

          const mCloses = monthlyData.closes.slice(0, mLen - lookback);
          const mOpens = monthlyData.opens.slice(0, mLen - lookback);
          const mHighs = monthlyData.highs.slice(0, mLen - lookback);
          const mLows = monthlyData.lows.slice(0, mLen - lookback);

          // ─── Calculate Indicators ───
          // Daily
          const dRsi = rsi(dCloses);
          const dMacd = macd(dCloses);

          // Weekly
          const wRsi = rsi(wCloses);
          const wHa = calculateHeikinAshi(wOpens, wHighs, wLows, wCloses);
          const wHaClose = wHa.haClose[wHa.haClose.length - 1];
          const wHaOpen = wHa.haOpen[wHa.haOpen.length - 1];

          // Monthly
          const mRsi = rsi(mCloses);
          const mHa = calculateHeikinAshi(mOpens, mHighs, mLows, mCloses);
          const mHaClose = mHa.haClose[mHa.haClose.length - 1];
          const mHaOpen = mHa.haOpen[mHa.haOpen.length - 1];

          // ─── Condition Checks ───
          // 1. Monthly (HA Bull/Bear + RSI)
          const isMonthlyBull = (mHaClose > mHaOpen) && (mRsi > 50);
          const isMonthlyBear = (mHaClose < mHaOpen) && (mRsi < 50);

          // 2. Weekly (HA Bull/Bear + RSI)
          const isWeeklyBull = (wHaClose > wHaOpen) && (wRsi > 50);
          const isWeeklyBear = (wHaClose < wHaOpen) && (wRsi < 50);

          // 3. Daily (RSI + MACD Crossover)
          const isDailyBull = (dRsi > 50) && (dMacd.hist > 0);
          const isDailyBear = (dRsi < 50) && (dMacd.hist < 0);

          // Confluence Calculation
          let score = 0;
          if (scanDirection === 'bullish') {
            if (isMonthlyBull) score++;
            if (isWeeklyBull) score++;
            if (isDailyBull) score++;
          } else {
            if (isMonthlyBear) score++;
            if (isWeeklyBear) score++;
            if (isDailyBear) score++;
          }

          scanResults.push({
            symbol: ticker,
            lcp: dailyData.cmp || dCloses[dCloses.length - 1],
            monthly: scanDirection === 'bullish' ? (isMonthlyBull ? 1 : 0) : (isMonthlyBear ? 1 : 0),
            weekly: scanDirection === 'bullish' ? (isWeeklyBull ? 1 : 0) : (isWeeklyBear ? 1 : 0),
            daily: scanDirection === 'bullish' ? (isDailyBull ? 1 : 0) : (isDailyBear ? 1 : 0),
            rsi: dRsi,
            macdVal: dMacd.macd,
            macdSig: dMacd.signal,
            macdHist: dMacd.hist,
            score: score
          });
        } catch (e) {
          console.error(`Skipping stock ${ticker}:`, e);
        }
      }));

      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    DOM.progressText.innerText = `Scan completed.`;
    DOM.progressPercent.innerText = `100%`;
    DOM.progressBar.style.width = `100%`;

    renderTable();
  } catch (err) {
    if (err.message === 'AbortError') {
      DOM.tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 64px 0;">Scan cancelled.</td></tr>`;
    } else {
      console.error(err);
      DOM.tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--red); padding: 64px 0;">Scan failed: ${err.message}</td></tr>`;
    }
  } finally {
    isScanning = false;
    DOM.scanBtn.style.display = 'inline-flex';
    DOM.cancelBtn.style.display = 'none';
    setTimeout(() => {
      DOM.progressArea.style.display = 'none';
    }, 2000);
  }
}

function cancelScan() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

// ─── Rendering ───
const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function renderTable() {
  // Sort results
  const sorted = [...scanResults].sort((a, b) => {
    let valA = a[currentSort.col];
    let valB = b[currentSort.col];

    if (currentSort.col === 'symbol') {
      return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return currentSort.asc ? (valA - valB) : (valB - valA);
  });

  // Render rows
  if (sorted.length === 0) {
    DOM.tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 64px 0;">
          No stocks scanned or matched.
        </td>
      </tr>
    `;
    return;
  }

  DOM.tableBody.innerHTML = sorted.map((res, i) => {
    let confluenceText = 'None';
    let confluenceClass = 'confluence-none';

    if (res.score === 3) {
      confluenceText = scanDirection === 'bullish' ? 'Triple Confluence' : 'Triple Bearish';
      confluenceClass = scanDirection === 'bullish' ? 'confluence-high' : 'confluence-bear-high';
    } else if (res.score > 0) {
      confluenceText = `Partial (${res.score}/3)`;
      confluenceClass = 'confluence-partial';
    }

    const macdSign = res.macdHist > 0 ? '+' : '';
    const macdColor = res.macdHist > 0 ? 'var(--green)' : 'var(--red)';

    return `
      <tr>
        <td>${i + 1}</td>
        <td class="sym-name">
          <a href="https://in.tradingview.com/chart/?symbol=NSE%3A${res.symbol}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dashed var(--border);">
            ${res.symbol}
          </a>
        </td>
        <td class="numeric">${fmt.format(res.lcp)}</td>
        <td style="text-align: center;"><span class="badge-status badge-${res.monthly}">${res.monthly}</span></td>
        <td style="text-align: center;"><span class="badge-status badge-${res.weekly}">${res.weekly}</span></td>
        <td style="text-align: center;"><span class="badge-status badge-${res.daily}">${res.daily}</span></td>
        <td class="numeric" style="color: ${res.rsi > 50 ? 'var(--green)' : 'var(--red)'}">${Math.round(res.rsi)}</td>
        <td class="numeric" style="color: ${macdColor}">${macdSign}${fmt.format(res.macdHist)}</td>
        <td style="text-align: center;"><span class="confluence-badge ${confluenceClass}">${confluenceText}</span></td>
      </tr>
    `;
  }).join('');

  // Update headers sort icons
  document.querySelectorAll('th').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.sort === currentSort.col) {
      icon.innerHTML = currentSort.asc ? '&#9650;' : '&#9660;';
    } else {
      icon.innerHTML = '';
    }
  });
}

init();
