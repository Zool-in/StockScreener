// ─── Unified API Data Fetching ──────────────────────────────────────────────
const API_BASE = '/api/chart';

export async function fetchOHLCV(ticker, timeframe = '1d') {
  // Support appending .BO for BSE stocks if not NSE
  let sym = ticker.trim().toUpperCase();
  if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) {
    sym += '.NS'; // Default to NSE
  }

  let interval = '1d', range = '1y';
  if (timeframe === '15m') { interval = '15m'; range = '60d'; }
  else if (timeframe === '1h') { interval = '60m'; range = '730d'; }
  else if (timeframe === '1d') { interval = '1d'; range = '1y'; }
  else if (timeframe === '1wk') { interval = '1wk'; range = '5y'; }
  else if (timeframe === '1mo') { interval = '1mo'; range = '10y'; }

  const url = `${API_BASE}?ticker=${encodeURIComponent(sym)}&interval=${interval}&range=${range}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${sym}`);
  const data = await res.json();

  if (!data || !data.chart || !data.chart.result || !data.chart.result[0].indicators.quote[0]) {
    throw new Error("Invalid data format from Yahoo Finance");
  }

  const result = data.chart.result[0];
  const quote = result.indicators.quote[0];
  const timestamps = result.timestamp || [];
  
  // Filter out nulls
  const closes = [], highs = [], lows = [], opens = [], volumes = [], ts = [];
  for (let i = 0; i < quote.close.length; i++) {
    if (quote.close[i] !== null && quote.high[i] !== null && quote.low[i] !== null && quote.open[i] !== null) {
      closes.push(quote.close[i]);
      highs.push(quote.high[i]);
      lows.push(quote.low[i]);
      opens.push(quote.open[i]);
      volumes.push(quote.volume[i] || 0);
      ts.push(timestamps[i]);
    }
  }

  if (closes.length === 0) throw new Error("No price data available");
  const cmp = closes[closes.length - 1];
  const meta = result.meta;

  return { ticker, sym, closes, highs, lows, opens, volumes, ts, meta, cmp };
}
