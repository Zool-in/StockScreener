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
