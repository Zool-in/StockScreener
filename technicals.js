// ─── NSE Swing Screener — technicals & UI logic ───────────────────────────
// Data is fetched through the local Node proxy (server.js) at /api/chart,
// which forwards to Yahoo Finance. This avoids the browser CORS block and
// removes the dependency on a public third-party proxy.

const API_BASE = '/api/chart';

let allResults = [];
let activeFilter = 'all';

let activeTimeframe = '1d';

// ─── Fetch OHLCV via local proxy ──────────────────────────────────────────
async function fetchOHLCV(ticker, tf = '1d') {
  const sym = ticker.trim().toUpperCase() + '.NS';
  let interval = '1d', range = '3mo';
  if (tf === '15m') { interval = '15m'; range = '60d'; }
  else if (tf === '1h') { interval = '60m'; range = '730d'; }
  else if (tf === '1d') { interval = '1d'; range = '1y'; }
  else if (tf === '1wk') { interval = '1wk'; range = '5y'; }
  else if (tf === '1mo') { interval = '1mo'; range = '10y'; }

  const url = `${API_BASE}?symbol=${encodeURIComponent(sym)}&interval=${interval}&range=${range}`;
  // Generous timeout: on a cache miss the server may retry flaky upstream
  // proxies for a while before it can answer.
  const res = await fetch(url, { signal: AbortSignal.timeout(75000) });
  if (!res.ok) {
    let msg = `Proxy error (${res.status})`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  const source = res.headers.get('X-Data-Source') || 'live';
  const data = await res.json();
  const chart = data?.chart?.result?.[0];
  if (!chart) throw new Error('No data returned');
  const ts = chart.timestamp;
  const q = chart.indicators.quote[0];
  const meta = chart.meta;
  const closes = q.close, highs = q.high, lows = q.low, volumes = q.volume, opens = q.open;
  return { ticker: ticker.toUpperCase(), sym, closes, highs, lows, volumes, opens, ts, meta, source };
}

// ─── EMA ──────────────────────────────────────────────────────────────────
function ema(arr, period) {
  const k = 2 / (period + 1);
  let emaArr = [];
  let e = arr[0];
  for (let i = 0; i < arr.length; i++) {
    e = arr[i] * k + e * (1 - k);
    emaArr.push(e);
  }
  return emaArr;
}

// ─── SMA (simple moving average, trailing) ────────────────────────────────
function sma(arr, period) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j];
    out.push(s / period);
  }
  return out;
}

// ─── RSI(14) ──────────────────────────────────────────────────────────────
function rsi(closes, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

// ─── ADX(14) simplified ───────────────────────────────────────────────────
function adx(highs, lows, closes, period = 14) {
  const n = closes.length;
  if (n < period + 2) return 20;
  let plusDMs = [], minusDMs = [], trs = [];
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs.push(tr);
  }
  let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlus = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinus = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let dxArr = [];
  for (let i = period; i < trs.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trs[i];
    smoothPlus = smoothPlus - smoothPlus / period + plusDMs[i];
    smoothMinus = smoothMinus - smoothMinus / period + minusDMs[i];
    const diPlus = (smoothPlus / smoothTR) * 100;
    const diMinus = (smoothMinus / smoothTR) * 100;
    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
    dxArr.push(dx);
  }
  const adxVal = dxArr.slice(-period).reduce((a, b) => a + b, 0) / period;
  return Math.round(adxVal);
}

// ─── MACD (12, 26, 9) ─────────────────────────────────────────────────────
// Returns the latest MACD line, signal line, histogram, and a cross flag.
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signalPeriod);
  const histArr = macdLine.map((v, i) => v - signalLine[i]);
  const n = closes.length;
  const line = macdLine[n - 1];
  const signal = signalLine[n - 1];
  const hist = histArr[n - 1];
  const prevHist = histArr[n - 2];

  // Bias + fresh-cross detection (histogram flipping sign)
  let bias = 'neutral';
  if (hist > 0 && line > signal) bias = 'bullish';
  else if (hist < 0 && line < signal) bias = 'bearish';
  const bullCross = prevHist <= 0 && hist > 0;
  const bearCross = prevHist >= 0 && hist < 0;

  return {
    line: parseFloat(line.toFixed(2)),
    signal: parseFloat(signal.toFixed(2)),
    hist: parseFloat(hist.toFixed(2)),
    bias, bullCross, bearCross,
  };
}

// ─── Bollinger Bands (20, 2σ) ─────────────────────────────────────────────
// Returns latest upper/mid/lower bands, %B, bandwidth, and a squeeze flag.
function bollinger(closes, period = 20, mult = 2) {
  const n = closes.length;
  const midArr = sma(closes, period);
  const bandwidths = [];
  let latest = null;
  for (let i = period - 1; i < n; i++) {
    const mid = midArr[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mid) ** 2;
    const sd = Math.sqrt(variance / period);
    const upper = mid + mult * sd;
    const lower = mid - mult * sd;
    const bandwidth = (upper - lower) / mid; // relative width
    bandwidths.push(bandwidth);
    if (i === n - 1) {
      const price = closes[n - 1];
      const pctB = (upper - lower) === 0 ? 0.5 : (price - lower) / (upper - lower);
      latest = { upper, mid, lower, pctB, bandwidth };
    }
  }
  if (!latest) return null;

  // Squeeze: current bandwidth is in the lowest quartile of the last ~40 readings.
  const recent = bandwidths.slice(-40);
  const sorted = [...recent].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const squeeze = latest.bandwidth <= q1;

  // Position bias relative to the bands.
  let pos = 'mid';
  if (latest.pctB >= 1) pos = 'above';       // riding/above upper band
  else if (latest.pctB >= 0.8) pos = 'upper';
  else if (latest.pctB <= 0) pos = 'below';  // at/below lower band
  else if (latest.pctB <= 0.2) pos = 'lower';

  return {
    upper: parseFloat(latest.upper.toFixed(2)),
    mid: parseFloat(latest.mid.toFixed(2)),
    lower: parseFloat(latest.lower.toFixed(2)),
    pctB: parseFloat(latest.pctB.toFixed(2)),
    bandwidth: parseFloat((latest.bandwidth * 100).toFixed(1)), // as %
    squeeze, pos,
  };
}

// ─── ATR(14) — average daily true range, in ₹ ─────────────────────────────
function atr(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const slice = trs.slice(-period).filter(Number.isFinite);
  if (!slice.length) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ─── Volume ratio (last day vs 20-day avg) ────────────────────────────────
function volRatio(volumes) {
  const recent = volumes[volumes.length - 1];
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  return parseFloat((recent / avg).toFixed(2));
}

// ─── 52-week position ─────────────────────────────────────────────────────
function weekPos(closes) {
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);
  const curr = closes[closes.length - 1];
  return Math.round(((curr - lo) / (hi - lo)) * 100);
}

// ─── Consolidation detection (low range in last 10 days) ──────────────────
function isConsolidating(closes, highs, lows) {
  const n = closes.length;
  const slice_hi = highs.slice(n - 12, n - 1);
  const slice_lo = lows.slice(n - 12, n - 1);
  const rangeHi = Math.max(...slice_hi);
  const rangeLo = Math.min(...slice_lo);
  return (rangeHi - rangeLo) / rangeLo < 0.06;
}

// ─── VCP / Coiled Spring detection ──────────────────────────────────────────
function isCoiledSpring(closes, highs, lows, volumes, ema50) {
  const n = closes.length;
  if (n < 60) return { vcpLong: false, vcpShort: false };
  
  const curr = closes[n - 1];
  const pastClose = closes[n - 40];
  
  // 1. Prior Trend
  const priorUptrend = curr > ema50 && curr > pastClose * 1.10;
  const priorDowntrend = curr < ema50 && curr < pastClose * 0.90;

  // 2. Tight Consolidation: 15-day range < 12%
  const recentHighs = highs.slice(n - 15, n - 1);
  const recentLows = lows.slice(n - 15, n - 1);
  const boxHigh = Math.max(...recentHighs);
  const boxLow = Math.min(...recentLows);
  const boxTight = (boxHigh - boxLow) / boxLow < 0.12;

  // Volatility contraction: recent 5 days tighter than 6%
  const ultraRecentHighs = highs.slice(n - 6, n - 1);
  const ultraRecentLows = lows.slice(n - 6, n - 1);
  const tightHigh = Math.max(...ultraRecentHighs);
  const tightLow = Math.min(...ultraRecentLows);
  const ultraTight = (tightHigh - tightLow) / tightLow < 0.06;
  
  // 3. Volume Drying Up: 5-day avg vol < 15-day avg vol
  const vol5 = volumes.slice(n - 6, n - 1).reduce((a,b)=>a+b, 0) / 5;
  const vol15 = volumes.slice(n - 21, n - 6).reduce((a,b)=>a+b, 0) / 15;
  const volDrying = vol5 < vol15 * 1.0; 
  
  const vcpLong = priorUptrend && boxTight && ultraTight && volDrying;
  const vcpShort = priorDowntrend && boxTight && ultraTight && volDrying;

  return { vcpLong, vcpShort };
}

// ─── Main compute ─────────────────────────────────────────────────────────
function compute(raw) {
  const { closes, highs, lows, volumes, ticker, meta, source } = raw;
  const n = closes.length;
  // Newly-listed stocks can have too few candles for meaningful indicators.
  if (closes.filter(Number.isFinite).length < 25) {
    throw new Error('Insufficient price history');
  }
  const curr = closes[n - 1];
  const prev = closes[n - 2];
  const chgPct = parseFloat(((curr - prev) / prev * 100).toFixed(2));

  const ema20arr = ema(closes, 20);
  const ema50arr = ema(closes, 50);
  const ema200arr = ema(closes, Math.min(200, n));
  const ema20 = ema20arr[n - 1];
  const ema50 = ema50arr[n - 1];
  const ema200 = ema200arr[n - 1];

  const rsiVal = rsi(closes);
  const adxVal = adx(highs, lows, closes);
  const macdVal = macd(closes);
  const bbVal = bollinger(closes);
  const vr = volRatio(volumes);
  const wkPos = weekPos(closes);
  const consol = isConsolidating(closes, highs, lows);

  const above20 = curr > ema20;
  const above50 = curr > ema50;
  const above200 = curr > ema200;

  const vcp = isCoiledSpring(closes, highs, lows, volumes, ema50);

  // Breakout signal: was below 20 EMA in last 3 days, now above, on volume
  const recentBreakout = closes[n - 2] < ema20arr[n - 2] && curr > ema20 && vr > 1.5;
  // Pullback: above 200 EMA, curr close to 20 EMA (within 2%)
  const pullback = above200 && Math.abs(curr - ema20) / curr < 0.025 && rsiVal < 60 && rsiVal > 40;
  // RS leader: above 200, RSI > 55, held well
  const rsLeader = above200 && rsiVal > 55 && adxVal > 22;

  // ── Setup classification ──
  let setup = 'Weak', direction = 'long';
  if (vcp.vcpLong) { setup = 'VCP / Coiled'; direction = 'long'; }
  else if (vcp.vcpShort) { setup = 'VCP Breakdown'; direction = 'short'; }
  else if (recentBreakout || (consol && vr > 1.8 && above50)) { setup = 'Breakout'; direction = 'long'; }
  else if (pullback) { setup = 'Pullback'; direction = 'long'; }
  else if (rsLeader) { setup = 'RS Leader'; direction = 'long'; }

  // ── Score (0–100) ──
  let score = 0;
  if (direction === 'short') {
    if (!above200) score += 18;
    if (!above50) score += 8;
    if (!above20) score += 4;
    if (rsiVal < 50 && rsiVal > 30) score += 12;
    else if (rsiVal <= 30) score += 4;
    if (adxVal > 25) score += 12;
    else if (adxVal > 20) score += 6;
    if (vr >= 1.5) score += 12;
    else if (vr >= 1.0) score += 6;
    if (macdVal.bias === 'bearish') score += 8;
    if (macdVal.bearCross) score += 4;
    else if (macdVal.bias === 'bullish') score -= 4;
    if (bbVal) {
      if (bbVal.squeeze) score += 6;
      if (bbVal.pos === 'lower' || bbVal.pos === 'below') score += 4;
      else if (bbVal.pos === 'upper') score -= 4;
    }
  } else {
    if (above200) score += 18;
    if (above50) score += 8;
    if (above20) score += 4;
    if (rsiVal > 50 && rsiVal < 70) score += 12;
    else if (rsiVal >= 70) score += 4;
    if (adxVal > 25) score += 12;
    else if (adxVal > 20) score += 6;
    if (vr >= 1.5) score += 12;
    else if (vr >= 1.0) score += 6;
    if (macdVal.bias === 'bullish') score += 8;
    if (macdVal.bullCross) score += 4;
    else if (macdVal.bias === 'bearish') score -= 4;
    if (bbVal) {
      if (bbVal.squeeze) score += 6;
      if (bbVal.pos === 'upper' || bbVal.pos === 'above') score += 4;
      else if (bbVal.pos === 'below') score -= 4;
    }
  }

  // Setup bonus
  if (setup === 'Breakout') score += 18;
  else if (setup === 'VCP / Coiled' || setup === 'VCP Breakdown') score += 20;
  else if (setup === 'Pullback') score += 14;
  else if (setup === 'RS Leader') score += 11;
  score = Math.max(0, Math.min(score, 100));



  // ── Levels — entry is strategy-aware, not just "current price" ──
  const recentLow = Math.min(...lows.slice(n - 5));
  const breakoutLevel = Math.max(...highs.slice(n - 21, n - 1)); // prior 20-day high
  // entryIsMarket = enter at the live price (tracks it); otherwise a fixed level.
  let entry, entryBasis, entryIsMarket;
  if (setup === 'Breakout') {
    if (curr >= breakoutLevel) { entry = curr; entryBasis = 'at market · breakout confirmed'; entryIsMarket = true; }
    else { entry = breakoutLevel; entryBasis = 'on break above 20d high'; entryIsMarket = false; }
  } else if (setup === 'VCP / Coiled') {
    const boxHigh = Math.max(...highs.slice(n - 15, n - 1));
    if (curr >= boxHigh) { entry = curr; entryBasis = 'at market · VCP breakout'; entryIsMarket = true; }
    else { entry = boxHigh; entryBasis = 'buy on box breakout'; entryIsMarket = false; }
  } else if (setup === 'VCP Breakdown') {
    const boxLow = Math.min(...lows.slice(n - 15, n - 1));
    if (curr <= boxLow) { entry = curr; entryBasis = 'at market · breakdown'; entryIsMarket = true; }
    else { entry = boxLow; entryBasis = 'sell on box breakdown'; entryIsMarket = false; }
  } else if (setup === 'Pullback') {
    entry = Math.min(curr, ema20); entryBasis = 'buy dip near 20-EMA'; entryIsMarket = false;
  } else if (setup === 'RS Leader') {
    entry = Math.max(ema20, curr * 0.98); entryBasis = 'minor dip (~2%) or 20-EMA'; entryIsMarket = false;
  } else { entry = curr; entryBasis = 'at market'; entryIsMarket = true; }
  entry = parseFloat(entry.toFixed(2));

  // ── Major Support / Resistance ──
  const lookback = Math.min(250, n);
  const yearHigh = Math.max(...highs.slice(n - lookback));
  const yearLow = Math.min(...lows.slice(n - lookback));
  const fib50 = yearLow + (yearHigh - yearLow) * 0.5;
  const majorSupport = parseFloat(Math.max(ema200, fib50, yearLow).toFixed(2));
  
  let majorResistance = yearHigh;
  if (curr >= yearHigh * 0.98) {
    majorResistance = yearLow + (yearHigh - yearLow) * 1.618;
  }
  majorResistance = parseFloat(majorResistance.toFixed(2));

  const atrVal = atr(highs, lows, closes);
  const atrPct = atrVal > 0 ? parseFloat((atrVal / entry * 100).toFixed(1)) : 0;

  // ── Stop & Target Logic (Direction Aware) ──
  let stop, risk, target, target2, rrRatio, distToTarget;
  const tenDayLow = Math.min(...lows.slice(Math.max(0, n - 10)));
  const tenDayHigh = Math.max(...highs.slice(Math.max(0, n - 10)));

  if (direction === 'short') {
    let atrStop = entry + (atrVal * 2);
    stop = Math.max(atrStop, tenDayHigh * 1.01);
    if (stop <= entry) stop = entry * 1.05;
    stop = parseFloat(stop.toFixed(2));
    risk = stop - entry;

    const recentLow = Math.min(...lows.slice(Math.max(0, n - 20)));
    const target1Min = entry - risk * 1.5;
    target = parseFloat(Math.min(recentLow, target1Min).toFixed(2));

    const target2Min = entry - risk * 2.5;
    target2 = parseFloat(Math.min(majorSupport, target2Min).toFixed(2));
  } else {
    let atrStop = entry - (atrVal * 2);
    stop = Math.min(atrStop, tenDayLow * 0.99);
    if (stop >= entry) stop = entry * 0.95;
    stop = parseFloat(stop.toFixed(2));
    risk = entry - stop;

    const recentHigh = Math.max(...highs.slice(Math.max(0, n - 20)));
    const target1Min = entry + risk * 1.5;
    target = parseFloat(Math.max(recentHigh, target1Min).toFixed(2));

    const target2Min = entry + risk * 2.5;
    target2 = parseFloat(Math.max(majorResistance, target2Min).toFixed(2));
  }

  rrRatio = parseFloat((Math.abs(target - entry) / risk).toFixed(1)) + '-' + parseFloat((Math.abs(target2 - entry) / risk).toFixed(1));
  distToTarget = Math.abs(target - entry);
  let etaLow = null, etaHigh = null;
  if (atrVal > 0) {
    const eff = Math.min(0.65, Math.max(0.30, adxVal / 60)); // net-move efficiency
    const mid = distToTarget / (eff * atrVal);
    etaLow = Math.max(1, Math.round(mid * 0.7));
    etaHigh = Math.max(etaLow + 1, Math.round(mid * 1.3));
  }

  // Name from meta
  const name = meta?.longName || meta?.shortName || ticker;

  return {
    ticker, name, curr: parseFloat(curr.toFixed(2)), chgPct,
    ema20: parseFloat(ema20.toFixed(2)), ema50: parseFloat(ema50.toFixed(2)), ema200: parseFloat(ema200.toFixed(2)),
    rsi: rsiVal, adx: adxVal, macd: macdVal, bb: bbVal, vr, wkPos, above20, above50, above200,
    setup, score, direction, entry, entryBasis, entryIsMarket, stop, target, target2, rrRatio,
    atrPct, atrVal, etaLow, etaHigh,
    majorSupport, majorResistance,
    currency: meta?.currency || 'INR',
    source: source || 'live',
    fetchedAt: new Date().toLocaleTimeString('en-IN')
  };
}

// ─── Render one card ──────────────────────────────────────────────────────
function scoreClass(s) { return s >= 75 ? 'score-s' : s >= 55 ? 'score-m' : 'score-w'; }
function setupTagClass(s) {
  return s === 'VCP / Coiled' ? 'tag-vcp' : s === 'VCP Breakdown' ? 'tag-vcp-short' : s === 'Breakout' ? 'tag-breakout' : s === 'Pullback' ? 'tag-pullback' : s === 'RS Leader' ? 'tag-rs' : 'tag-weak';
}
function accentColor(s) {
  return s === 'VCP / Coiled' ? '#f59e0b' : s === 'VCP Breakdown' ? '#f87171' : s === 'Breakout' ? '#2dcccc' : s === 'Pullback' ? '#7faaff' : s === 'RS Leader' ? '#c07fff' : '#384060';
}
function dotClass(ok, warn) { return ok ? 'dy' : warn ? 'dm' : 'dn'; }
function sourceLabel(src) {
  return src === 'kite' || src === 'kite-live' ? 'Zerodha Kite'
    : src === 'nse-bhavcopy' ? 'NSE Bhavcopy (EOD)'
    : src === 'cache' || src === 'cache-fresh' ? 'Cached'
    : 'Yahoo Finance';
}

// NSE trades Mon–Fri, 09:15–15:30 IST. When it's closed, prices are settled and
// won't move for anyone — so we stop pretending to be "live".
function marketOpen() {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(), mins = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}

// ─── Position sizing (risk-based) ──────────────────────────────────────────
function getCapital() { const v = parseFloat(document.getElementById('capitalInput')?.value); return isFinite(v) && v > 0 ? v : 100000; }
function getRisk() { const v = parseFloat(document.getElementById('riskInput')?.value); return isFinite(v) && v > 0 ? v : 1; }
function fmtINR(n) { return Math.round(n).toLocaleString('en-IN'); }

// How many shares keep the loss-at-stop within your risk budget, capped by the
// capital you actually have. Returns the card HTML line.
function positionHTML(d) {
  const capital = getCapital(), riskPct = getRisk();
  const entry = d.entry ?? d.curr;
  const riskPerShare = Math.abs(entry - d.stop);
  if (riskPerShare <= 0) return '';
  const riskBudget = capital * riskPct / 100;
  const maxByCapital = Math.floor(capital / entry);
  let shares = Math.floor(riskBudget / riskPerShare);
  let capped = false;
  if (shares > maxByCapital) { shares = maxByCapital; capped = true; }
  if (shares < 1) {
    return `<div class="pos"><span class="pos-ico">📐</span> <span class="pos-warn">0 shares</span> `
      + `<span class="pos-sub">— ₹${fmtINR(riskPerShare)}/share risk is too large for this budget</span></div>`;
  }
  const deployed = shares * entry;
  const riskAmt = shares * riskPerShare;
  const rewardAmt = shares * Math.abs(d.target - entry);
  const dirLabel = d.direction === 'short' ? '<span style="color:var(--red);font-weight:bold">SHORT</span>' : '<span style="color:var(--green);font-weight:bold">LONG</span>';
  return `<div class="pos"><span class="pos-ico">📐</span> ${dirLabel} <b>${shares}</b> shares · ₹${fmtINR(deployed)} deployed`
    + `<span class="pos-sub"> · risk ₹${fmtINR(riskAmt)} · reward ₹${fmtINR(rewardAmt)}</span>`
    + (capped ? `<span class="pos-cap"> · capped by capital</span>` : '') + `</div>`;
}

// MACD badge label/class from bias + cross
function macdBadge(m) {
  if (m.bullCross) return { cls: 'ob-bull', txt: 'BULL ✕' };
  if (m.bearCross) return { cls: 'ob-bear', txt: 'BEAR ✕' };
  if (m.bias === 'bullish') return { cls: 'ob-bull', txt: 'BULL' };
  if (m.bias === 'bearish') return { cls: 'ob-bear', txt: 'BEAR' };
  return { cls: 'ob-neut', txt: 'FLAT' };
}
// Bollinger badge from squeeze/position
function bbBadge(b) {
  if (b.squeeze) return { cls: 'ob-squeeze', txt: 'SQUEEZE' };
  if (b.pos === 'above' || b.pos === 'upper') return { cls: 'ob-bull', txt: 'UPPER' };
  if (b.pos === 'below' || b.pos === 'lower') return { cls: 'ob-bear', txt: 'LOWER' };
  return { cls: 'ob-neut', txt: 'MID' };
}

function cardHTML(d) {
  const chgClass = d.chgPct >= 0 ? 'chg-pos' : 'chg-neg';
  const chgSign = d.chgPct >= 0 ? '+' : '';
  const barW = d.score;
  const barCol = d.score >= 75 ? '#22d08a' : d.score >= 55 ? '#f5a623' : '#f05a5a';
  const rsiOk = d.rsi > 50 && d.rsi < 70, rsiWarn = d.rsi >= 70;
  const adxOk = d.adx > 25, adxWarn = d.adx > 20;
  const vrOk = d.vr >= 1.5, vrWarn = d.vr >= 1.0;

  const m = d.macd, b = d.bb;
  const mB = macdBadge(m);
  const macdColor = m.bias === 'bullish' ? 'var(--green)' : m.bias === 'bearish' ? 'var(--red)' : 'var(--muted)';
  const macdDotOk = m.bias === 'bullish', macdDotWarn = m.bias === 'neutral';

  let bbBlock = '';
  let bbDot = '<span class="dot-row"><span class="dot dm"></span>Bollinger</span>';
  if (b) {
    const bB = bbBadge(b);
    const bbColor = (b.pos === 'above' || b.pos === 'upper') ? 'var(--green)'
      : (b.pos === 'below' || b.pos === 'lower') ? 'var(--red)'
      : b.squeeze ? 'var(--amber)' : 'var(--muted)';
    bbBlock = `
      <div class="osc">
        <div class="ok">Bollinger 20,2 <span class="obadge ${bB.cls}">${bB.txt}</span></div>
        <div class="ov" style="color:${bbColor}">%B ${b.pctB}</div>
        <div class="osub">₹${b.lower.toLocaleString('en-IN')} · ₹${b.upper.toLocaleString('en-IN')} · BW ${b.bandwidth}%</div>
      </div>`;
    const bbOk = b.pos === 'above' || b.pos === 'upper', bbWarn = b.squeeze || b.pos === 'mid';
    bbDot = `<span class="dot-row"><span class="dot ${dotClass(bbOk, bbWarn)}"></span>Bollinger</span>`;
  }

  return `
  <div class="scard" data-setup="${d.setup}" data-score="${d.score}" data-rsi="${d.rsi}" data-chg="${d.chgPct}">
    <div class="scard-accent" style="background:${accentColor(d.setup)}"></div>
    <div class="scard-top">
      <div>
        <div style="display:flex; align-items:center;">
          <div class="scard-ticker">${d.ticker}</div>
          <a href="https://in.tradingview.com/chart/?symbol=NSE:${d.ticker}" target="_blank" title="View on TradingView" class="chart-link">
            <svg viewBox="0 0 28 21" xmlns="http://www.w3.org/2000/svg"><path d="M12 0h-3v21h3v-21zm5 6h-3v15h3v-15zm5-6h-3v21h3v-21z" fill="currentColor"/></svg>
          </a>
          <a href="https://kite.zerodha.com/chart/web/tvc/NSE/${d.ticker}" target="_blank" title="View on Kite" class="chart-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h4v4"/><path d="M20 4L10 14"/><path d="M4 14l5-5"/></svg>
          </a>
        </div>
        <div class="scard-name">${d.name.length > 28 ? d.name.slice(0,28)+'…' : d.name}</div>
      </div>
      <span class="score-badge ${scoreClass(d.score)}">${d.score}/100</span>
    </div>
    <div class="price-row">
      <span class="price">₹${d.curr.toLocaleString('en-IN')}</span>
      <span class="chg ${chgClass}">${chgSign}${d.chgPct}%</span>
      ${d.live ? `<span class="live-tag" style="${marketOpen() ? '' : 'color:var(--muted)'}">${marketOpen() ? '● LIVE' + ((d.liveSource === 'kite' || d.liveSource === 'kite-live') ? '' : ' ~15m') : '● CLOSED'}</span>` : ''}
    </div>
    <div class="score-bar"><div class="score-bar-fill" style="width:${barW}%;background:${barCol}"></div></div>
    <span class="setup-tag ${setupTagClass(d.setup)}">${d.setup}</span>
    <div class="indicator-grid">
      <div class="ind"><div class="ik">RSI 14</div><div class="iv" style="color:${rsiOk?'var(--green)':rsiWarn?'var(--red)':'var(--muted)'}">${d.rsi}</div></div>
      <div class="ind"><div class="ik">ADX 14</div><div class="iv" style="color:${adxOk?'var(--green)':adxWarn?'var(--amber)':'var(--muted)'}">${d.adx}</div></div>
      <div class="ind"><div class="ik">Vol ×</div><div class="iv" style="color:${vrOk?'var(--green)':vrWarn?'var(--amber)':'var(--muted)'}">${d.vr}×</div></div>
      <div class="ind"><div class="ik">EMA 20</div><div class="iv">₹${d.ema20.toLocaleString('en-IN')}</div></div>
      <div class="ind"><div class="ik">EMA 50</div><div class="iv">₹${d.ema50.toLocaleString('en-IN')}</div></div>
      <div class="ind"><div class="ik">EMA 200</div><div class="iv">₹${d.ema200.toLocaleString('en-IN')}</div></div>
    </div>
    <div class="osc-grid">
      <div class="osc">
        <div class="ok">MACD 12,26,9 <span class="obadge ${mB.cls}">${mB.txt}</span></div>
        <div class="ov" style="color:${macdColor}">${m.line} / ${m.signal}</div>
        <div class="osub">Hist ${m.hist >= 0 ? '+' : ''}${m.hist}</div>
      </div>
      ${bbBlock}
    </div>
    <div class="signal-dots">
      <span class="dot-row"><span class="dot ${d.above200?'dy':'dn'}"></span>200 EMA</span>
      <span class="dot-row"><span class="dot ${d.above50?'dy':'dn'}"></span>50 EMA</span>
      <span class="dot-row"><span class="dot ${d.above20?'dy':'dn'}"></span>20 EMA</span>
      <span class="dot-row"><span class="dot ${dotClass(rsiOk,rsiWarn)}"></span>RSI zone</span>
      <span class="dot-row"><span class="dot ${dotClass(adxOk,adxWarn)}"></span>ADX trend</span>
      <span class="dot-row"><span class="dot ${dotClass(vrOk,vrWarn)}"></span>Volume</span>
      <span class="dot-row"><span class="dot ${dotClass(macdDotOk,macdDotWarn)}"></span>MACD</span>
      ${bbDot}
    </div>
    <div class="levels">
      <div class="lv lv-entry"><div class="lk">Entry</div><div class="lv2">₹${d.entry.toLocaleString('en-IN')}</div><div class="rr">${d.entryBasis || ''}</div></div>
      <div class="lv lv-stop"><div class="lk">Stop</div><div class="lv2">₹${d.stop.toLocaleString('en-IN')}</div><div class="rr">${d.direction==='short'?'+':'−'}${(Math.abs((d.entry-d.stop)/d.entry)*100).toFixed(1)}%</div></div>
      <div class="lv lv-target"><div class="lk">Targets</div><div class="lv2">₹${d.target.toLocaleString('en-IN')} · ₹${d.target2 ? d.target2.toLocaleString('en-IN') : ''}</div><div class="rr">${d.rrRatio}× R:R</div></div>
    </div>
    ${d.etaLow ? `<div class="eta"><span class="eta-ico">🎯</span> Est. <b>${d.etaLow}–${d.etaHigh} trading periods</b> to target <span class="eta-sub">· ATR ${d.atrPct}%/period</span></div>` : ''}
    ${positionHTML(d)}
    <div class="source-note">${d.live ? sourceLabel(d.source) + ((d.liveSource === 'kite' || d.liveSource === 'kite-live') ? ' + Kite live' : ' + Google live') : sourceLabel(d.source)} · ${d.fetchedAt}</div>
  </div>`;
}

// ─── Render results ────────────────────────────────────────────────────────
function renderResults() {
  const grid = document.getElementById('resultsGrid');
  const sortBy = document.getElementById('sortSel')?.value || 'score';
  const validData = [...allResults].filter(d => d.type !== 'error' && d.type !== 'loading');
  let data = validData;
  const errors = allResults.filter(d => d.type === 'error');

  if (activeFilter !== 'all') data = data.filter(d => d.setup === activeFilter);

  data.sort((a, b) => {
    if (sortBy === 'score') return b.score - a.score;
    if (sortBy === 'rsi') return b.rsi - a.rsi;
    if (sortBy === 'chg') return b.chgPct - a.chgPct;
    return 0;
  });

  const strong = validData.filter(d => d.score >= 75).length;
  const breakouts = validData.filter(d => d.setup === 'Breakout').length;
  const above200 = validData.filter(d => d.above200).length;
  const rsis = validData.map(d => d.rsi).filter(Number.isFinite);
  const avgRsi = rsis.length ? Math.round(rsis.reduce((a,r)=>a+r,0)/rsis.length) : 0;
  
  const advances = validData.filter(d => d.chgPct > 0).length;
  const declines = validData.filter(d => d.chgPct < 0).length;
  const adColor = advances > declines ? 'var(--green)' : advances < declines ? 'var(--red)' : 'var(--muted)';

  const sumBar = document.getElementById('summaryBar');
  sumBar.innerHTML = `
    <div class="sum-chip"><div class="sk">A/D</div><div class="sv" style="color:${adColor}">${advances} / ${declines}</div></div>
    <div class="sum-chip"><div class="sk">Scanned</div><div class="sv">${allResults.filter(d=>d.type!=='loading').length}</div></div>
    <div class="sum-chip"><div class="sk">Strong (75+)</div><div class="sv" style="color:var(--green)">${strong}</div></div>
    <div class="sum-chip"><div class="sk">Breakouts</div><div class="sv" style="color:#2dcccc">${breakouts}</div></div>
    <div class="sum-chip"><div class="sk">Above 200 EMA</div><div class="sv">${above200}</div></div>
    <div class="sum-chip"><div class="sk">Avg RSI</div><div class="sv">${avgRsi || '—'}</div></div>
  `;

  const szNote = document.getElementById('sizNote');
  if (szNote) szNote.textContent = `Risking ₹${fmtINR(getCapital() * getRisk() / 100)} (${getRisk()}%) per trade`;

  let html = data.map(cardHTML).join('');
  if (activeFilter === 'all') {
    html += errors.map(e => `<div class="error-card"><div class="et">⚠ ${e.ticker}</div><div class="em">${e.msg}</div></div>`).join('');
  }
  if (!html) html = `<div class="empty" style="grid-column:1/-1"><div class="icon">🔍</div><p>No ${activeFilter !== 'all' ? activeFilter : ''} stocks found</p></div>`;
  grid.innerHTML = html;
}

// ─── Live price overlay ────────────────────────────────────────────────────
// Bhavcopy is EOD, so we overlay a fresher last price on the DISPLAYED price
// and trade math. Indicators keep using completed daily candles (correct), but
// the EMA-position dots are refreshed against the live price for consistency.
const LIVE_MAX = 150; // don't scrape live quotes for scans bigger than this

function liveEnabled() { return document.getElementById('liveToggle')?.checked; }

function applyLivePrice(d, price, liveSource) {
  if (!(price > 0) || d.type) return;
  const eodClose = d._eodClose ?? d.curr;   // remember the EOD close once
  d._eodClose = eodClose;
  d.curr = Math.round(price * 100) / 100;
  d.chgPct = parseFloat(((price - eodClose) / eodClose * 100).toFixed(2)); // vs prev day close
  d.live = true;
  d.liveSource = liveSource || 'google-delayed';
  // EMA-position dots against the live price
  d.above20 = price > d.ema20; d.above50 = price > d.ema50; d.above200 = price > d.ema200;
  // "At market" entries track the live price; fixed-level entries (pullback dip,
  // pending breakout) stay put. Stop is the technical swing low either way.
  const brokeStop = d.direction === 'short' ? price > d.stop : price < d.stop;
  if (d.entryIsMarket && !brokeStop) {
    d.entry = Math.round(price * 100) / 100;
    const risk = Math.abs(d.entry - d.stop);
    if (d.direction === 'short') {
      d.target = parseFloat((d.entry - 1.5 * risk).toFixed(2));
      d.target2 = parseFloat((d.entry - 2.5 * risk).toFixed(2));
    } else {
      d.target = parseFloat((d.entry + 1.5 * risk).toFixed(2));
      d.target2 = parseFloat((d.entry + 2.5 * risk).toFixed(2));
    }
    if (d.atrVal > 0) {
      const eff = Math.min(0.65, Math.max(0.30, d.adx / 60));
      const mid = Math.abs(d.target - d.entry) / (eff * d.atrVal);
      d.etaLow = Math.max(1, Math.round(mid * 0.7));
      d.etaHigh = Math.max(d.etaLow + 1, Math.round(mid * 1.3));
    }
  }
  d.stopHit = brokeStop;
}

async function overlayLivePrices() {
  const targets = allResults.filter(d => !d.type); // successful results only
  const noteEl = document.getElementById('liveNote');
  if (!liveEnabled()) { if (noteEl) noteEl.textContent = ''; return; }
  if (!targets.length) return;
  if (targets.length > LIVE_MAX) {
    if (noteEl) noteEl.textContent = `Live off (${targets.length} > ${LIVE_MAX}) — filter to fewer stocks`;
    return;
  }
  if (noteEl) noteEl.textContent = `Fetching live prices for ${targets.length}…`;
  try {
    const syms = targets.map(d => d.ticker + '.NS').join(',');
    const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(syms)}`);
    const data = await r.json();
    const q = data.quotes || {};
    const src = data.source || 'google-delayed';
    let n = 0;
    for (const d of targets) {
      const p = q[d.ticker.toUpperCase()];
      if (p != null) { applyLivePrice(d, p, src); n++; }
    }
    const t = new Date().toLocaleTimeString('en-IN');
    if (noteEl) {
      if (!marketOpen()) {
        noteEl.textContent = `● Market closed · showing today's close (live resumes 9:15 AM IST)`;
      } else {
        const label = (src === 'kite' || src === 'kite-live') ? 'Kite real-time' : 'Google, ~15m delay';
        noteEl.textContent = n ? `🟢 Live · ${n} updated ${t} (${label})` : 'Live prices unavailable right now';
      }
    }
    renderResults();
  } catch (e) {
    if (noteEl) noteEl.textContent = 'Live prices failed: ' + e.message;
  }
}

// Keep prices fresh: re-fetch on an interval while Live is on and results show.
let liveTimer = null;
const LIVE_REFRESH_MS = 30000; // keep displayed prices fresh automatically
function startLiveRefresh() {
  stopLiveRefresh();
  if (!liveEnabled() || !marketOpen()) return; // no point auto-refreshing a closed market
  liveTimer = setInterval(() => {
    if (liveEnabled() && allResults.some(d => !d.type)) overlayLivePrices();
    else stopLiveRefresh();
  }, LIVE_REFRESH_MS);
}
function stopLiveRefresh() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }

// ─── Run scan ─────────────────────────────────────────────────────────────
async function runScan() {
  const raw = document.getElementById('tickerInput').value;
  const tickers = raw.split(/[\n,]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
  if (!tickers.length) return;

  const btn = document.getElementById('scanBtn');
  const tfSelect = document.getElementById('timeframeSelect');
  if (tfSelect) activeTimeframe = tfSelect.value;
  btn.disabled = true;
  btn.textContent = 'Scanning…';

  allResults = tickers.map(t => ({ type: 'loading', ticker: t }));
  document.getElementById('filterBar').style.display = 'flex';
  document.getElementById('sizingBar').style.display = 'flex';
  document.getElementById('summaryBar').style.display = 'flex';
  document.getElementById('disclaimer').style.display = 'block';

  const grid = document.getElementById('resultsGrid');
  // For big scans, don't render thousands of individual spinners.
  grid.innerHTML = tickers.length > 60
    ? `<div class="loading-card"><div class="spinner"></div><div class="loading-text">Scanning ${tickers.length} stocks…</div></div>`
    : tickers.map(t => `
        <div class="loading-card">
          <div class="spinner"></div>
          <div class="loading-text">Fetching ${t}.NS…</div>
        </div>`).join('');

  // Rendering the whole grid repeatedly is O(n²). For large scans we skip the
  // live grid updates entirely (just advance the progress counter) and render
  // once at the end; small scans keep the nice incremental fill.
  let lastRender = 0, done = 0;
  const liveGrid = tickers.length <= 150;
  const renderThrottle = 500;
  const maybeRender = () => {
    if (liveGrid) {
      const now = Date.now();
      if (now - lastRender > renderThrottle) { lastRender = now; renderResults(); }
    }
    btn.textContent = `⏳ ${done}/${tickers.length}…`;
  };

  // Bounded concurrency pool — workers pull from a shared cursor.
  let cursor = 0;
  const POOL = Math.min(12, tickers.length);
  async function worker() {
    while (cursor < tickers.length) {
      const idx = cursor++;
      const ticker = tickers[idx];
      try {
        allResults[idx] = compute(await fetchOHLCV(ticker, activeTimeframe));
      } catch (e) {
        allResults[idx] = { type: 'error', ticker, msg: e.message || 'Fetch failed — check ticker or try again' };
      }
      done++;
      maybeRender();
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));

  btn.disabled = false;
  btn.textContent = '▶ Run scan';
  renderResults();
  await overlayLivePrices();
  startLiveRefresh();
}

function clearResults() {
  allResults = [];
  document.getElementById('resultsGrid').innerHTML = `<div class="empty"><div class="icon">📡</div><p>Enter NSE tickers and hit Run scan</p><small>Fetches live data · computes technicals · scores swing setups</small></div>`;
  document.getElementById('filterBar').style.display = 'none';
  document.getElementById('sizingBar').style.display = 'none';
  document.getElementById('summaryBar').style.display = 'none';
  document.getElementById('disclaimer').style.display = 'none';
}

// ─── Load ticker presets (Nifty 50 / 100 / 500 / all NSE) ──────────────────
async function loadPreset(index, btn) {
  const countEl = document.getElementById('presetsCount');
  const pills = document.querySelectorAll('.preset-pill');
  pills.forEach(p => p.disabled = true);
  if (countEl) countEl.textContent = 'loading…';
  try {
    const r = await fetch(`/api/symbols?index=${encodeURIComponent(index)}`);
    const data = await r.json();
    if (!r.ok || !data.symbols) throw new Error(data.error || 'Failed to load list');
    document.getElementById('tickerInput').value = data.symbols.join('\n');
    if (countEl) {
      countEl.textContent = `${data.count} loaded`
        + (data.count > 300 ? ' — big scan, give it a moment' : '');
    }
  } catch (e) {
    if (countEl) countEl.textContent = `error: ${e.message}`;
  } finally {
    pills.forEach(p => p.disabled = false);
  }
}
document.addEventListener('click', e => {
  const pill = e.target.closest('.preset-pill');
  if (pill) loadPreset(pill.dataset.idx, pill);
});

// ─── Auto-scan a default universe on load (show candidates immediately) ─────
async function autoScanDefault() {
  try { await loadPreset('nifty50'); await runScan(); }
  catch (_) { /* leave the empty state if the default scan fails */ }
}
document.addEventListener('DOMContentLoaded', autoScanDefault);

// ─── Market-status indicator in the header ─────────────────────────────────
function updateMarketDot() {
  const label = document.getElementById('mktLabel');
  const blip = document.getElementById('mktBlip');
  if (!label) return;
  if (marketOpen()) { label.textContent = 'Market open · live'; if (blip) blip.style.background = 'var(--green)'; }
  else { label.textContent = 'Market closed · today\'s close'; if (blip) blip.style.background = 'var(--muted)'; }
}
document.addEventListener('DOMContentLoaded', updateMarketDot);
setInterval(updateMarketDot, 60000);

// ─── Market Mood Index (MMI) ────────────────────────────────────────────────
async function fetchMMI() {
  const mmiContainer = document.getElementById('mmiStatus');
  const mmiValEl = document.getElementById('mmiVal');
  const mmiMoodEl = document.getElementById('mmiMood');
  if (!mmiContainer || !mmiValEl) return;

  try {
    const r = await fetch('/api/mmi');
    const data = await r.json();
    if (data.error) throw new Error(data.error);

    mmiContainer.style.display = 'flex';
    mmiValEl.textContent = data.value;
    mmiMoodEl.textContent = data.mood;

    if (data.value < 30) { mmiValEl.style.color = 'var(--red)'; }
    else if (data.value < 50) { mmiValEl.style.color = 'var(--amber)'; }
    else if (data.value < 70) { mmiValEl.style.color = 'var(--green)'; }
    else { mmiValEl.style.color = 'var(--accent)'; }
  } catch (e) {
    mmiContainer.style.display = 'none';
  }
}
document.addEventListener('DOMContentLoaded', fetchMMI);
setInterval(fetchMMI, 10 * 60 * 1000); // Refresh MMI every 10 mins

// ─── Kite connection status ────────────────────────────────────────────────
async function refreshKiteStatus() {
  const el = document.getElementById('kiteStatus');
  if (!el) return;
  try {
    const r = await fetch('/kite/status');
    const s = await r.json();
    if (!s.configured) { el.style.display = 'none'; return; } // Kite not set up → hide
    el.style.display = 'flex';
    if (s.connected) {
      el.className = 'kite-status on';
      el.innerHTML = `<span class="kdot"></span>Kite: ${s.user || 'connected'}`;
    } else {
      el.className = 'kite-status off';
      el.innerHTML = `<span class="kdot"></span>Kite session expired `
        + `<a class="kite-btn" href="/kite/login">Connect Kite</a>`;
    }
  } catch (_) { el.style.display = 'none'; }
}
document.addEventListener('DOMContentLoaded', refreshKiteStatus);

// ─── Position-sizing inputs (persisted, re-render on change) ────────────────
function initSizing() {
  const cap = document.getElementById('capitalInput');
  const risk = document.getElementById('riskInput');
  if (!cap || !risk) return;
  const savedCap = localStorage.getItem('ss_capital');
  const savedRisk = localStorage.getItem('ss_risk');
  if (savedCap) cap.value = savedCap;
  if (savedRisk) risk.value = savedRisk;
  const onChange = () => {
    localStorage.setItem('ss_capital', cap.value);
    localStorage.setItem('ss_risk', risk.value);
    if (allResults.length) renderResults();
  };
  cap.addEventListener('input', onChange);
  risk.addEventListener('input', onChange);

  const live = document.getElementById('liveToggle');
  if (live) live.addEventListener('change', () => {
    if (live.checked) { overlayLivePrices(); startLiveRefresh(); }
    else { stopLiveRefresh(); const n = document.getElementById('liveNote'); if (n) n.textContent = ''; }
  });
}
document.addEventListener('DOMContentLoaded', initSizing);

// ─── Filter pills ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (e.target.classList.contains('filter-pill')) {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('on'));
    e.target.classList.add('on');
    activeFilter = e.target.dataset.f;
    renderResults();
  }
});
