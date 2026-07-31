// ─── Unified API Data Fetching ──────────────────────────────────────────────
const API_BASE = '/api/chart';
const memoryCache = new Map();

function isNSEMarketOpen() {
  const now = new Date();
  const day = now.getDay();
  const hrs = now.getHours();
  const mins = now.getMinutes();
  const timeVal = hrs * 100 + mins;
  return (day >= 1 && day <= 5 && timeVal >= 915 && timeVal <= 1530);
}

export async function fetchOHLCV(ticker, timeframe = '1d', signal = null) {
  // Support appending .BO for BSE stocks if not NSE
  let sym = ticker.trim().toUpperCase();
  if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) {
    sym += '.NS'; // Default to NSE
  }

  const cacheKey = `${sym}_${timeframe}`;
  const cached = memoryCache.get(cacheKey);
  const cacheTtlMs = isNSEMarketOpen() ? 2 * 60 * 1000 : 60 * 60 * 1000; // 2 mins during market, 1 hour off-market

  if (cached && (Date.now() - cached.timestamp < cacheTtlMs)) {
    return cached.data;
  }

  let interval = '1d', range = '1y';
  if (timeframe === '15m') { interval = '15m'; range = '60d'; }
  else if (timeframe === '1h') { interval = '60m'; range = '60d'; }
  else if (timeframe === '1d') { interval = '1d'; range = '2y'; }
  else if (timeframe === '1wk') { interval = '1wk'; range = '5y'; }
  else if (timeframe === '1mo') { interval = '1mo'; range = '5y'; }

  const url = `${API_BASE}?symbol=${encodeURIComponent(sym)}&interval=${interval}&range=${range}`;

  let res;
  let data;
  let retries = 3;
  while (retries > 0) {
    try {
      res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Failed to fetch ${sym} (Status: ${res.status})`);
      data = await res.json();

      if (!data || !data.chart || !data.chart.result || !data.chart.result[0].indicators.quote[0]) {
        throw new Error("Invalid data format from Yahoo Finance");
      }
      break; // Success
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 500)); // wait 500ms before retry
    }
  }

  const result = data.chart.result[0];
  const quote = result.indicators.quote[0];
  const timestamps = result.timestamp || [];

  // Filter out nulls
  const closes = [], highs = [], lows = [], opens = [], volumes = [], ts = [];
  const ohlcv = [];
  for (let i = 0; i < quote.close.length; i++) {
    if (quote.close[i] !== null && quote.high[i] !== null && quote.low[i] !== null && quote.open[i] !== null) {
      closes.push(quote.close[i]);
      highs.push(quote.high[i]);
      lows.push(quote.low[i]);
      opens.push(quote.open[i]);
      volumes.push(quote.volume[i] || 0);
      ts.push(timestamps[i]);
      ohlcv.push({
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i] || 0,
        time: timestamps[i]
      });
    }
  }

  // Sanitize trailing phantom zero-volume / unclosed bar at index n-1 when market is closed
  if (!isNSEMarketOpen()) {
    while (closes.length > 5 && volumes[volumes.length - 1] === 0) {
      closes.pop();
      highs.pop();
      lows.pop();
      opens.pop();
      volumes.pop();
      ts.pop();
      ohlcv.pop();
    }
  }

  if (closes.length === 0) throw new Error("No price data available");
  const cmp = closes[closes.length - 1];
  const meta = result.meta;

  const parsed = { ticker, sym, closes, highs, lows, opens, volumes, ts, meta, cmp, ohlcv };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: parsed });
  return parsed;
}
