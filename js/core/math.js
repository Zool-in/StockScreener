// ─── Core Mathematical Indicators ─────────────────────────────────────────────

// Exponential Moving Average
export function ema(arr, period) {
  if (arr.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = arr[0];
  for (let i = 0; i < arr.length; i++) {
    e = arr[i] * k + e * (1 - k);
  }
  return e;
}

// Relative Strength Index (RSI)
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  
  if (avgLoss === 0) return 100;
  return Math.round(100 - (100 / (1 + (avgGain / avgLoss))));
}

// Average Directional Index (ADX)
export function adx(highs, lows, closes, period = 14) {
  const n = closes.length;
  if (n < period * 2) return 20; // Default if insufficient data
  
  const plusDM = [0];
  const minusDM = [0];
  const tr = [0];
  
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    if (upMove > downMove && upMove > 0) plusDM.push(upMove);
    else plusDM.push(0);
    
    if (downMove > upMove && downMove > 0) minusDM.push(downMove);
    else minusDM.push(0);
    
    const trueRange = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    tr.push(trueRange);
  }
  
  let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dx = [];
  for (let i = period; i < n; i++) {
    smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
    
    const diPlus = (smoothedPlusDM / smoothedTR) * 100;
    const diMinus = (smoothedMinusDM / smoothedTR) * 100;
    
    if (diPlus + diMinus === 0) dx.push(0);
    else dx.push((Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100);
  }
  
  if (dx.length < period) return 20;
  const adxVal = dx.slice(-period).reduce((a, b) => a + b, 0) / period;
  return Math.round(adxVal);
}

// Historical Volatility (Annualized)
export function hv(closes, period = 30) {
  if (closes.length < period + 1) return 0.2;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / period;
  let variance = 0;
  for (let r of rets) variance += Math.pow(r - mean, 2);
  return Math.sqrt(variance / period) * Math.sqrt(252);
}

// Average True Range (ATR)
export function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return (highs[highs.length-1]-lows[lows.length-1]);
  const tr = [highs[0]-lows[0]];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  // Simple moving average of TR
  let atrVal = tr.slice(0, period).reduce((a,b)=>a+b,0)/period;
  for (let i=period; i<tr.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]) / period;
  }
  return atrVal;
}

// Bollinger Bands
export function bollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return { upper: null, lower: null, middle: null };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a,b)=>a+b,0) / period;
  let variance = 0;
  for (let c of slice) variance += Math.pow(c - mean, 2);
  const stdDev = Math.sqrt(variance / period);
  return {
    middle: mean,
    upper: mean + (stdDev * multiplier),
    lower: mean - (stdDev * multiplier)
  };
}

// Keltner Channels
export function keltnerChannels(highs, lows, closes, period = 20, atrMultiplier = 1.5) {
  if (closes.length < period) return { upper: null, lower: null, middle: null };
  const middle = ema(closes, period);
  const atrVal = atr(highs, lows, closes, period);
  return {
    middle: middle,
    upper: middle + (atrVal * atrMultiplier),
    lower: middle - (atrVal * atrMultiplier)
  };
}

// Connors RSI
export function connorsRSI(closes) {
  // 3-period RSI
  const rsi3 = rsi(closes, 3);
  
  // 2-period Streak RSI
  const streaks = [0];
  let currentStreak = 0;
  for (let i=1; i<closes.length; i++) {
    if (closes[i] > closes[i-1]) {
      currentStreak = currentStreak < 0 ? 1 : currentStreak + 1;
    } else if (closes[i] < closes[i-1]) {
      currentStreak = currentStreak > 0 ? -1 : currentStreak - 1;
    } else {
      currentStreak = 0;
    }
    streaks.push(currentStreak);
  }
  const streakRsi = rsi(streaks, 2);
  
  // Percent Rank of 1-day return over last 100 days
  const period = 100;
  if (closes.length < period + 1) return (rsi3 + streakRsi) / 2;
  const currentRet = (closes[closes.length-1] - closes[closes.length-2]) / closes[closes.length-2];
  let rankCount = 0;
  for (let i = closes.length - period; i < closes.length - 1; i++) {
    const ret = (closes[i] - closes[i-1]) / closes[i-1];
    if (ret < currentRet) rankCount++;
  }
  const pctRank = (rankCount / period) * 100;
  
  return (rsi3 + streakRsi + pctRank) / 3;
}

// MACD
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow) return { macd: 0, signal: 0, hist: 0 };
  const macdLine = [];
  
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);
  let eFast = closes[0];
  let eSlow = closes[0];
  
  for(let i=0; i<closes.length; i++) {
    eFast = closes[i] * kFast + eFast * (1 - kFast);
    eSlow = closes[i] * kSlow + eSlow * (1 - kSlow);
    macdLine.push(eFast - eSlow);
  }
  
  const macdVal = macdLine[macdLine.length - 1];
  
  const kSig = 2 / (signal + 1);
  let eSig = macdLine[0];
  for(let i=0; i<macdLine.length; i++) {
    eSig = macdLine[i] * kSig + eSig * (1 - kSig);
  }
  
  return {
    macd: macdVal,
    signal: eSig,
    hist: macdVal - eSig
  };
}

// CCI
export function cci(highs, lows, closes, period = 34) {
  const n = closes.length;
  if (n < period) return 0;
  
  const tp = [];
  for(let i=0; i<n; i++) {
    tp.push((highs[i] + lows[i] + closes[i]) / 3);
  }
  
  const currentTP = tp[n-1];
  
  let sumTP = 0;
  for(let i=n-period; i<n; i++) {
    sumTP += tp[i];
  }
  const smaTP = sumTP / period;
  
  let meanDev = 0;
  for(let i=n-period; i<n; i++) {
    meanDev += Math.abs(tp[i] - smaTP);
  }
  meanDev = meanDev / period;
  
  if (meanDev === 0) return 0;
  return (currentTP - smaTP) / (0.015 * meanDev);
}

// ─── Mathematical Time Series Functions ────────────────────────────────────────

// Exponential Moving Average (Series)
export function emaSeries(arr, period) {
  if (arr.length === 0) return [];
  const k = 2 / (period + 1);
  const out = new Array(arr.length);
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// Relative Strength Index (Series)
export function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return out;
  
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : Math.round(100 - (100 / (1 + (avgGain / avgLoss))));
  
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : Math.round(100 - (100 / (1 + (avgGain / avgLoss))));
  }
  return out;
}

// Weighted Moving Average (Series)
export function wmaSeries(arr, period) {
  const out = new Array(arr.length).fill(0);
  const denom = (period * (period + 1)) / 2;
  
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      const weight = period - j;
      sum += arr[i - j] * weight;
    }
    out[i] = sum / denom;
  }
  return out;
}

// Volume Weighted Moving Average (Series)
export function vwmaSeries(arr, volumes, period) {
  const out = new Array(arr.length).fill(0);
  
  for (let i = period - 1; i < arr.length; i++) {
    let sumValVol = 0;
    let sumVol = 0;
    for (let j = 0; j < period; j++) {
      const val = arr[i - j];
      const vol = volumes[i - j] || 1; // Fallback to 1 if missing
      sumValVol += val * vol;
      sumVol += vol;
    }
    out[i] = sumVol === 0 ? arr[i] : sumValVol / sumVol;
  }
  return out;
}

// ─── Smart Money Concepts (SMC) ───────────────────────────────────────────────

/**
 * Finds Swing Highs and Swing Lows (Pivots)
 */
export function findPivots(highs, lows, leftBars = 5, rightBars = 5) {
  const pivots = { highs: [], lows: [] };
  const n = highs.length;
  
  for (let i = leftBars; i < n - rightBars; i++) {
    let isHigh = true;
    let isLow = true;
    
    for (let j = 1; j <= leftBars; j++) {
      if (highs[i - j] >= highs[i]) isHigh = false;
      if (lows[i - j] <= lows[i]) isLow = false;
    }
    
    for (let j = 1; j <= rightBars; j++) {
      if (highs[i + j] >= highs[i]) isHigh = false;
      if (lows[i + j] <= lows[i]) isLow = false;
    }
    
    if (isHigh) pivots.highs.push({ index: i, price: highs[i] });
    if (isLow) pivots.lows.push({ index: i, price: lows[i] });
  }
  
  return pivots;
}

/**
 * Finds Unmitigated Order Blocks based on Break of Structure (BOS)
 */
export function findOrderBlocks(ohlcv, pivotLength = 5) {
  if (ohlcv.length < pivotLength * 2) return { bullishOBs: [], bearishOBs: [] };
  
  const highs = ohlcv.map(c => c.h);
  const lows = ohlcv.map(c => c.l);
  const closes = ohlcv.map(c => c.c);
  const opens = ohlcv.map(c => c.o);
  
  const pivots = findPivots(highs, lows, pivotLength, pivotLength);
  
  const bullishOBs = [];
  const bearishOBs = [];
  
  let currentSwingHigh = null;
  let currentSwingLow = null;
  
  const findLastBearishCandle = (endIndex, maxLookback = 15) => {
    for (let i = endIndex - 1; i >= Math.max(0, endIndex - maxLookback); i--) {
      if (closes[i] < opens[i]) {
        return { index: i, top: highs[i], bottom: lows[i] };
      }
    }
    return null;
  };
  
  const findLastBullishCandle = (endIndex, maxLookback = 15) => {
    for (let i = endIndex - 1; i >= Math.max(0, endIndex - maxLookback); i--) {
      if (closes[i] > opens[i]) {
        return { index: i, top: highs[i], bottom: lows[i] };
      }
    }
    return null;
  };

  let activeHighPivotIdx = 0;
  let activeLowPivotIdx = 0;
  
  for (let i = pivotLength * 2; i < ohlcv.length; i++) {
    while (activeHighPivotIdx < pivots.highs.length && pivots.highs[activeHighPivotIdx].index <= i - pivotLength) {
      currentSwingHigh = pivots.highs[activeHighPivotIdx];
      activeHighPivotIdx++;
    }
    while (activeLowPivotIdx < pivots.lows.length && pivots.lows[activeLowPivotIdx].index <= i - pivotLength) {
      currentSwingLow = pivots.lows[activeLowPivotIdx];
      activeLowPivotIdx++;
    }
    
    // Bullish BOS
    if (currentSwingHigh && closes[i] > currentSwingHigh.price) {
      const ob = findLastBearishCandle(i);
      if (ob) bullishOBs.push(ob);
      currentSwingHigh = null; // Wait for next swing high
    }
    
    // Bearish BOS
    if (currentSwingLow && closes[i] < currentSwingLow.price) {
      const ob = findLastBullishCandle(i);
      if (ob) bearishOBs.push(ob);
      currentSwingLow = null; // Wait for next swing low
    }
  }
  
  // Filter for unmitigated (not closed beyond the OB zone)
  const unmitigatedBullish = bullishOBs.filter(ob => {
    for (let i = ob.index + 1; i < ohlcv.length; i++) {
      if (closes[i] < ob.bottom) return false; 
    }
    return true;
  });
  
  const unmitigatedBearish = bearishOBs.filter(ob => {
    for (let i = ob.index + 1; i < ohlcv.length; i++) {
      if (closes[i] > ob.top) return false; 
    }
    return true;
  });

  return { bullishOBs: unmitigatedBullish, bearishOBs: unmitigatedBearish };
}

// ─── Black-Scholes Option Pricing & Greeks ────────────────────────────────────

// Standard Normal cumulative distribution function (CDF)
function normCDF(x) {
  let sign = 1;
  if (x < 0) {
    sign = -1;
    x = -x;
  }
  const b1 =  0.319381530;
  const b2 = -0.356563782;
  const b3 =  1.781477937;
  const b4 = -1.821255978;
  const b5 =  1.330274429;
  const p  =  0.2316419;
  const c  =  0.39894228;

  const t = 1.0 / (1.0 + p * x);
  const e = c * Math.exp(-x * x / 2.0);
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const cdf = 1.0 - e * poly;
  return sign === 1 ? cdf : 1.0 - cdf;
}

// Standard Normal probability density function (PDF)
function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Calculate d1 and d2
function getD1D2(S, K, T, r, v) {
  if (v <= 0 || T <= 0) return { d1: 0, d2: 0 };
  const d1 = (Math.log(S / K) + (r + 0.5 * v * v) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);
  return { d1, d2 };
}

// Calculate Option Price
export function bsPrice(S, K, T, r, v, type = 'CE') {
  if (T <= 0) return type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  const { d1, d2 } = getD1D2(S, K, T, r, v);
  if (type === 'CE') {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
  }
}

// Calculate Option Greeks
export function bsGreeks(S, K, T, r, v, type = 'CE') {
  if (T <= 0 || v <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, iv: v };
  }
  
  const { d1, d2 } = getD1D2(S, K, T, r, v);
  
  const delta = type === 'CE' ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = normPDF(d1) / (S * v * Math.sqrt(T));
  
  let theta;
  if (type === 'CE') {
    theta = -(S * normPDF(d1) * v) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCDF(d2);
  } else {
    theta = -(S * normPDF(d1) * v) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normCDF(-d2);
  }
  
  // Convert theta to daily decay
  theta = theta / 365;
  
  // Vega per 1% change in volatility
  const vega = (S * normPDF(d1) * Math.sqrt(T)) / 100;
  
  return { delta, gamma, theta, vega, iv: v };
}

// Implied Volatility calculation using Newton-Raphson
export function computeIV(targetPrice, S, K, T, r, type = 'CE') {
  if (T <= 0) return 0;
  
  const MAX_ITER = 100;
  const TOLERANCE = 1e-4;
  
  let v = 0.3; // Initial guess: 30% volatility
  
  for (let i = 0; i < MAX_ITER; i++) {
    const price = bsPrice(S, K, T, r, v, type);
    const diff = price - targetPrice;
    
    if (Math.abs(diff) < TOLERANCE) return v;
    
    const { d1 } = getD1D2(S, K, T, r, v);
    const vega = S * normPDF(d1) * Math.sqrt(T); // raw vega
    
    if (vega === 0) break; // Derivative is zero, can't continue
    
    v = v - (diff / vega);
    if (v <= 0) {
      v = 0.01; // Avoid negative volatility
    }
  }
  
  return v > 0 ? v : 0.20; // Fallback to 20% IV if computation completely fails
}
