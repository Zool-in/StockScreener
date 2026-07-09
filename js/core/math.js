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
