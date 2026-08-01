import { fetchOHLCV } from '../core/api.js?v=8';
import { smaSeries, ema } from '../core/math.js?v=7';

// ─── Constants ───────────────────────────────────────────────────────────────
const STYLES = {
  textPrimary: '#c9d1d9',
  gridColor: 'rgba(56, 139, 253, 0.1)',
  profitColor: '#2ea44f',
  lossColor: '#f85149',
};

// State variables for dashboard
let activeGridSize = 1;
const chartInstances = new Map(); // paneId -> { chart, candleSeries, overlays: {}, data }
let dashboardSymbols = [];

// Load the symbol list for autocomplete
async function loadDashboardSymbols() {
  try {
    const [resNse, resBse] = await Promise.all([
      fetch('/api/symbols?index=all').then(r => r.ok ? r.json() : { symbols: [] }),
      fetch('/api/symbols?index=bse_exclusive').then(r => r.ok ? r.json() : { symbols: [] })
    ]);
    dashboardSymbols = Array.from(new Set([
      ...(resNse.symbols || []),
      ...(resBse.symbols || [])
    ])).filter(Boolean).sort();
  } catch (err) {
    console.error('Failed to load dashboard symbols:', err);
  }
}

// ─── Initialize Dashboard ───────────────────────────────────────────────────
export async function initDashboard() {
  await loadDashboardSymbols();

  // Setup layout pill clicks
  const layoutPills = document.getElementById('dashboardLayoutPills');
  if (layoutPills) {
    layoutPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill');
      if (!btn) return;
      Array.from(layoutPills.children).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const layout = parseInt(btn.dataset.layout) || 1;
      setDashboardLayout(layout);
    });
  }

  // Initial render
  setDashboardLayout(1);
}

// ─── Layout Engine ──────────────────────────────────────────────────────────
function setDashboardLayout(size) {
  activeGridSize = size;
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;

  // Clear existing instances to prevent memory leaks
  chartInstances.forEach(inst => {
    if (inst.chart) inst.chart.remove();
  });
  chartInstances.clear();
  grid.innerHTML = '';

  // Setup CSS Grid classes based on size
  if (size === 1) {
    grid.style.gridTemplateColumns = '1fr';
  } else if (size === 2) {
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  } else if (size === 4) {
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  } else if (size === 6) {
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  }

  // Predefined default symbols for initial loading
  const defaults = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN'];

  for (let i = 0; i < size; i++) {
    const paneId = `pane-${i}`;
    const defaultSym = defaults[i % defaults.length];
    createChartPane(grid, paneId, defaultSym);
  }
}

// ─── Chart Pane Builder ──────────────────────────────────────────────────────
function createChartPane(container, paneId, initialSymbol) {
  const pane = document.createElement('div');
  pane.className = 'chart-pane';
  pane.id = paneId;
  pane.innerHTML = `
    <div class="chart-pane-header">
      <div class="pane-controls suggestions-container" style="flex:1; max-width: 250px;">
        <input type="text" class="input pane-ticker-input" value="${initialSymbol}" style="padding: 4px 8px; font-size:12px; height: 28px; width:100%;" placeholder="Search Ticker...">
      </div>
      <div class="pane-controls">
        <select class="input pane-tf-select" style="padding: 4px 8px; font-size:12px; height: 28px; width:80px; background: rgba(0,0,0,0.2);">
          <option value="15m">15 Min</option>
          <option value="1h">1 Hour</option>
          <option value="1d" selected>Daily</option>
          <option value="1wk">Weekly</option>
          <option value="1mo">Monthly</option>
        </select>
        <button class="btn btn-secondary pane-refresh-btn" style="min-height: 28px; padding: 0 8px; font-size: 11px;">Refresh</button>
      </div>
    </div>
    <div class="pane-chart" id="${paneId}-chart"></div>
    <div class="indicator-toggles">
      <button class="ind-btn" data-ind="sma20">SMA 20</button>
      <button class="ind-btn" data-ind="ema50">EMA 50</button>
      <button class="ind-btn" data-ind="ema200">EMA 200</button>
      <button class="ind-btn" data-ind="vwap">VWAP</button>
    </div>
  `;

  container.appendChild(pane);

  const chartContainer = document.getElementById(`${paneId}-chart`);
  const tickerInput = pane.querySelector('.pane-ticker-input');
  const tfSelect = pane.querySelector('.pane-tf-select');
  const refreshBtn = pane.querySelector('.pane-refresh-btn');

  // Initialize Lightweight Chart
  const chart = LightweightCharts.createChart(chartContainer, {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: STYLES.textPrimary,
    },
    grid: {
      vertLines: { color: STYLES.gridColor },
      horzLines: { color: STYLES.gridColor },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: STYLES.gridColor,
    },
    timeScale: {
      borderColor: STYLES.gridColor,
      timeVisible: true,
    },
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: STYLES.profitColor,
    downColor: STYLES.lossColor,
    borderDownColor: STYLES.lossColor,
    borderUpColor: STYLES.profitColor,
    wickDownColor: STYLES.lossColor,
    wickUpColor: STYLES.profitColor,
  });

  // Track instance state
  const instance = {
    chart,
    candleSeries,
    overlays: {},
    data: null,
    ticker: initialSymbol,
    timeframe: '1d',
    activeIndicators: new Set(),
  };
  chartInstances.set(paneId, instance);

  // Auto resize chart inside pane
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || !entries[0].contentRect) return;
    const { width, height } = entries[0].contentRect;
    chart.resize(width, height);
  });
  resizeObserver.observe(chartContainer);

  // Setup Autocomplete suggestions for input
  setupPaneAutocomplete(pane, tickerInput, (selectedSym) => {
    instance.ticker = selectedSym;
    loadPaneData(paneId);
  });

  // Event Listeners
  tfSelect.addEventListener('change', (e) => {
    instance.timeframe = e.target.value;
    loadPaneData(paneId);
  });

  refreshBtn.addEventListener('click', () => {
    loadPaneData(paneId);
  });

  // Indicator Toggle Clicks
  pane.querySelector('.indicator-toggles').addEventListener('click', (e) => {
    const btn = e.target.closest('.ind-btn');
    if (!btn) return;
    const indicator = btn.dataset.ind;
    btn.classList.toggle('active');

    if (instance.activeIndicators.has(indicator)) {
      instance.activeIndicators.delete(indicator);
      if (instance.overlays[indicator]) {
        chart.removeSeries(instance.overlays[indicator]);
        delete instance.overlays[indicator];
      }
    } else {
      instance.activeIndicators.add(indicator);
      renderIndicator(paneId, indicator);
    }
  });

  // Load initial data
  loadPaneData(paneId);
}

// ─── Data Loader ─────────────────────────────────────────────────────────────
async function loadPaneData(paneId) {
  const instance = chartInstances.get(paneId);
  if (!instance) return;

  const chartDiv = document.getElementById(`${paneId}-chart`);
  if (!chartDiv) return;

  // Add a small loading spinner
  let loader = chartDiv.querySelector('.pane-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.className = 'pane-loader';
    loader.innerHTML = '<div class="spinner"></div>';
    loader.setAttribute('style', 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index: 10;');
    chartDiv.appendChild(loader);
  }

  try {
    const data = await fetchOHLCV(instance.ticker, instance.timeframe);
    instance.data = data;

    // Convert and sort candles
    let candleData = [];
    for (let i = 0; i < data.closes.length; i++) {
      candleData.push({
        time: data.ts[i],
        open: data.opens[i],
        high: data.highs[i],
        low: data.lows[i],
        close: data.closes[i],
      });
    }

    candleData.sort((a, b) => a.time - b.time);
    
    // De-duplicate
    const uniqueCandles = [];
    for (let i = 0; i < candleData.length; i++) {
      if (i > 0 && candleData[i].time === candleData[i - 1].time) continue;
      uniqueCandles.push(candleData[i]);
    }

    instance.candleSeries.setData(uniqueCandles);
    instance.chart.timeScale().fitContent();

    // Re-render active indicators
    instance.activeIndicators.forEach(indicator => {
      renderIndicator(paneId, indicator);
    });

  } catch (err) {
    console.error(`Failed to load data for pane ${paneId}:`, err);
  } finally {
    if (loader) loader.remove();
  }
}

// ─── Indicator Overlay Renderer ──────────────────────────────────────────────
function renderIndicator(paneId, indicator) {
  const instance = chartInstances.get(paneId);
  if (!instance || !instance.data) return;

  const { closes, ts, opens, highs, lows, volumes } = instance.data;

  // Remove existing series overlay if any
  if (instance.overlays[indicator]) {
    instance.chart.removeSeries(instance.overlays[indicator]);
    delete instance.overlays[indicator];
  }

  let lineData = [];
  let color = '#58a6ff';
  let title = indicator.toUpperCase();

  if (indicator === 'sma20') {
    const list = smaSeries(closes, 20);
    for (let i = 0; i < list.length; i++) {
      if (list[i] !== null) lineData.push({ time: ts[i], value: list[i] });
    }
    color = '#ffc069';
  } else if (indicator === 'ema50') {
    const list = ema(closes, 50);
    for (let i = 0; i < list.length; i++) {
      if (list[i] !== null) lineData.push({ time: ts[i], value: list[i] });
    }
    color = '#da70d6';
  } else if (indicator === 'ema200') {
    const list = ema(closes, 200);
    for (let i = 0; i < list.length; i++) {
      if (list[i] !== null) lineData.push({ time: ts[i], value: list[i] });
    }
    color = '#ff7875';
  } else if (indicator === 'vwap') {
    // Custom VWAP calculation for the timeframe
    let sumPV = 0, sumV = 0, lastDayStr = '';
    for (let i = 0; i < closes.length; i++) {
      const date = new Date(ts[i] * 1000);
      const dayStr = date.toDateString();
      // Reset daily for intraday (15m, 1h), else keep cumulative
      if (['15m', '1h'].includes(instance.timeframe) && dayStr !== lastDayStr) {
        sumPV = 0; sumV = 0;
        lastDayStr = dayStr;
      }
      const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
      const v = volumes[i] || 0;
      sumPV += typicalPrice * v;
      sumV += v;
      if (sumV > 0) {
        lineData.push({ time: ts[i], value: sumPV / sumV });
      }
    }
    color = '#5cdbd3';
  }

  if (lineData.length > 0) {
    lineData.sort((a, b) => a.time - b.time);
    const lineSeries = instance.chart.addLineSeries({
      color: color,
      lineWidth: 1.5,
      title: title,
    });
    lineSeries.setData(lineData);
    instance.overlays[indicator] = lineSeries;
  }
}

// ─── Autocomplete Setup ──────────────────────────────────────────────────────
function setupPaneAutocomplete(pane, input, onSelect) {
  const listEl = document.createElement('div');
  listEl.className = 'suggestions-list hidden';
  pane.querySelector('.suggestions-container').appendChild(listEl);

  let activeIndex = -1;

  function showSuggestions(list) {
    listEl.innerHTML = '';
    if (list.length === 0) {
      listEl.classList.add('hidden');
      return;
    }
    listEl.classList.remove('hidden');
    list.forEach((sym, idx) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerText = sym;
      item.addEventListener('click', () => {
        selectSuggestion(sym);
      });
      listEl.appendChild(item);
    });
  }

  function selectSuggestion(sym) {
    input.value = sym;
    listEl.classList.add('hidden');
    input.focus();
    activeIndex = -1;
    onSelect(sym);
  }

  input.addEventListener('input', () => {
    const query = input.value.trim().toUpperCase();
    if (query.length < 1) {
      listEl.classList.add('hidden');
      activeIndex = -1;
      return;
    }
    const filtered = dashboardSymbols
      .filter(sym => sym.startsWith(query))
      .slice(0, 10);
    showSuggestions(filtered);
    activeIndex = -1;
  });

  input.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.suggestion-item');
    if (listEl.classList.contains('hidden') || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        selectSuggestion(items[activeIndex].innerText);
      }
    } else if (e.key === 'Escape') {
      listEl.classList.add('hidden');
      activeIndex = -1;
    }
  });

  function updateActiveItem(items) {
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!pane.querySelector('.suggestions-container').contains(e.target)) {
      listEl.classList.add('hidden');
      activeIndex = -1;
    }
  });
}
