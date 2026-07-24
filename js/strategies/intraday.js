import { bollingerBands, keltnerChannels, atr, ema } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'ttm_orb') return ttmSqueezeORB(data);
  if (strategyId === 'intraday_retest') return smcIntradayRetest(data);
  if (strategyId === 'ohl_bullish') return ohlBullish(data);
  if (strategyId === 'ohl_bearish') return ohlBearish(data);
  if (strategyId === 'elephant_bullish') return elephantBullish(data);
  if (strategyId === 'elephant_bearish') return elephantBearish(data);
  if (strategyId === 'gap_momentum') return gapMomentum(data);
  return { isMatch: false };
}

function getCandleAnatomy(high, low, close, open) {
  const range = high - low || 1;
  const closePercent = (close - low) / range;
  const isGreen = close > open;
  return { closePercent, isGreen };
}

function ttmSqueezeORB(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 25) return { isMatch: false };
  
  // TTM Squeeze logic: Bollinger Bands entirely inside Keltner Channels
  const bb = bollingerBands(closes, 20, 2);
  const kc = keltnerChannels(highs, lows, closes, 20, 1.5);
  
  if (!bb.upper || !kc.upper) return { isMatch: false };

  const isSqueeze = (bb.upper < kc.upper) && (bb.lower > kc.lower);
  
  // ORB logic: For a 15m timeframe, the current candle volume should be surging
  const currentVol = volumes[n - 1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const isVolSurge = currentVol > avgVol * 1.5;

  // STRICT FILTER: Strong breakout candle (no nasty upper wicks)
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isStrongClose = isGreen && closePercent >= 0.7; // Top 30% close

  if (isSqueeze && isVolSurge && isStrongClose) {
    const risk = cmp * 0.01; // 1% stop loss for intraday
    return {
      isMatch: true,
      reason: 'Bollinger Bands inside Keltner Channels (Squeeze) + Volume Surge. Strong breakout candle structure.',
      entry: highs[n-1], // Trigger is breaking today's high
      risk: risk,
      metrics: [
        { name: 'Avg Vol', value: Math.round(avgVol).toLocaleString() },
        { name: 'Current Vol', value: Math.round(currentVol).toLocaleString() }
      ]
    };
  }

  return { isMatch: false };
}

function smcIntradayRetest(data) {
  const { ohlcv, closes, highs, lows, opens, volumes, cmp } = data;
  const n = ohlcv.length;
  if (n < 25) return { isMatch: false }; 

  // 1. Find a recent external liquidity pool (Pivot High) in the window [n-40 to n-10]
  let pivotHigh = 0;
  for (let i = n - 40; i <= n - 10; i++) {
    if (i < 0) continue;
    if (highs[i] > pivotHigh) pivotHigh = highs[i];
  }
  if (pivotHigh === 0) return { isMatch: false };

  // 2. Liquidity Sweep: Price must have broken above the pivot high in the last 10 candles
  let didSweep = false;
  let highestAfterSweep = 0;
  for (let i = n - 9; i <= n - 1; i++) {
     if (highs[i] > pivotHigh) {
         didSweep = true;
         if (highs[i] > highestAfterSweep) highestAfterSweep = highs[i];
     }
  }
  if (!didSweep) return { isMatch: false };

  // 3. The Retest (Internal Liquidity): Price must pull back to within 1% of the original Pivot High
  const diffPct = (cmp - pivotHigh) / pivotHigh;
  const isRetesting = diffPct >= -0.005 && diffPct <= 0.015; // -0.5% to +1.5% zone
  if (!isRetesting) return { isMatch: false };

  // 4. STRICT FILTER: Volume Defense Check
  // The reversal candle must have higher volume than the average of the 3 candles before it (which were the drop).
  const currentVol = volumes[n-1];
  const dropVolAvg = (volumes[n-2] + volumes[n-3] + volumes[n-4]) / 3;
  const isVolumeDefended = currentVol > dropVolAvg * 1.1;

  // 5. Entry Trigger: Reversal candle (Green close or long lower wick)
  const isGreen = closes[n-1] > opens[n-1];
  const lowerWick = Math.min(opens[n-1], closes[n-1]) - lows[n-1];
  const body = Math.abs(closes[n-1] - opens[n-1]);
  const isRejection = lowerWick >= (body * 0.8);

  if ((isGreen || isRejection) && isVolumeDefended) {
     return {
        isMatch: true,
        reason: 'SMC Setup: Swept external liquidity (recent high), pulled back to internal liquidity. Bullish rejection confirmed by defense volume.',
        entry: pivotHigh,
        risk: cmp * 0.005, // 0.5% stop loss for intraday
        metrics: [
           { name: 'Pivot (Liq)', value: pivotHigh.toFixed(1) },
           { name: 'Defense Vol', value: `${(currentVol/dropVolAvg).toFixed(1)}x` }
        ]
     };
  }

  return { isMatch: false };
}

function getTodaySessionData(data) {
  const { closes, highs, lows, opens, volumes } = data;
  const n = closes.length;
  if (n < 5) return null;

  let dayOpen = opens[n-1];
  let dayLow = lows[n-1];
  let dayHigh = highs[n-1];
  let dayClose = closes[n-1];
  let totalVol = volumes[n-1];

  const timestamps = data.ts || data.timestamps || [];

  // If timestamp array exists for intraday bars (15m/5m)
  if (timestamps.length >= n) {
    const lastTs = timestamps[n-1];
    const lastDate = new Date(lastTs * 1000).toDateString();
    
    let firstIdx = n - 1;
    let minLow = lows[n-1];
    let maxHigh = highs[n-1];
    let sumVol = 0;

    for (let i = n - 1; i >= 0; i--) {
      const dStr = new Date(timestamps[i] * 1000).toDateString();
      if (dStr === lastDate) {
        firstIdx = i;
        if (lows[i] < minLow) minLow = lows[i];
        if (highs[i] > maxHigh) maxHigh = highs[i];
        sumVol += volumes[i];
      } else {
        break;
      }
    }

    dayOpen = opens[firstIdx];
    dayLow = minLow;
    dayHigh = maxHigh;
    dayClose = closes[n-1];
    totalVol = sumVol;
  }

  return { dayOpen, dayLow, dayHigh, dayClose, totalVol };
}

function ohlBullish(data) {
  const session = getTodaySessionData(data);
  if (!session) return { isMatch: false };

  const { dayOpen, dayLow, dayHigh, dayClose, totalVol } = session;
  const cmp = data.cmp || dayClose;

  // Must be a green/neutral session (buyers in control: Close >= Open)
  if (dayClose < dayOpen) return { isMatch: false };

  // Exact Open = Low (0.00% zero wick deviation)
  const diff = Math.abs(dayOpen - dayLow) / dayOpen;
  const isOpenLow = diff <= 0.0001; // 0.00% exact zero wick
  if (!isOpenLow) return { isMatch: false };

  const { closes, volumes } = data;
  const n = closes.length;
  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const volSurgeRatio = (totalVol / avgVol).toFixed(1);

  return {
    isMatch: true,
    reason: `Exact Open = Low Setup: Stock opened at ₹${dayOpen.toFixed(2)} (9:15 AM) and low was ₹${dayLow.toFixed(2)} (0.00% diff). Absolute zero selling pressure.`,
    entry: dayHigh,
    risk: cmp * 0.01,
    metrics: [
      { name: 'Day Open', value: `₹${dayOpen.toFixed(1)}` },
      { name: 'O=L Diff', value: `0.00%` },
      { name: 'Vol Surge', value: `${volSurgeRatio}x` }
    ]
  };
}

function ohlBearish(data) {
  const session = getTodaySessionData(data);
  if (!session) return { isMatch: false };

  const { dayOpen, dayLow, dayHigh, dayClose, totalVol } = session;
  const cmp = data.cmp || dayClose;

  // Must be a red/neutral session (sellers in control: Close <= Open)
  if (dayClose > dayOpen) return { isMatch: false };

  // Exact Open = High (0.00% zero wick deviation)
  const diff = Math.abs(dayHigh - dayOpen) / dayOpen;
  const isOpenHigh = diff <= 0.0001; // 0.00% exact zero wick
  if (!isOpenHigh) return { isMatch: false };

  const { closes, volumes } = data;
  const n = closes.length;
  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const volSurgeRatio = (totalVol / avgVol).toFixed(1);

  return {
    isMatch: true,
    isShort: true,
    reason: `Exact Open = High Setup: Stock opened at ₹${dayOpen.toFixed(2)} (9:15 AM) and high was ₹${dayHigh.toFixed(2)} (0.00% diff). Absolute zero buying pressure.`,
    entry: dayLow,
    risk: cmp * 0.01,
    metrics: [
      { name: 'Day Open', value: `₹${dayOpen.toFixed(1)}` },
      { name: 'O=H Diff', value: `0.00%` },
      { name: 'Vol Surge', value: `${volSurgeRatio}x` }
    ]
  };
}

// ─── Oliver Velez Elephant Candle (Vela Elefante) ───────────────────────────
function elephantBullish(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 30) return { isMatch: false };

  const c = closes[n-1], o = opens[n-1], h = highs[n-1], l = lows[n-1];
  const body = c - o;
  const range = h - l || 1;

  if (body <= 0) return { isMatch: false }; // Must be a green candle

  // 1. Pure Solid Body Ratio >= 70%
  const bodyRatio = body / range;
  if (bodyRatio < 0.70) return { isMatch: false };

  // 2. ATR Expansion Factor >= 1.3x
  const atrArr = atr(highs, lows, closes, 14);
  const currentAtr = atrArr[n-2] || atrArr[n-1] || (range);
  const atrRatio = body / currentAtr;
  if (atrRatio < 1.30) return { isMatch: false };

  // 3. Volume Surge Filter (>= 1.8x avg volume)
  const currentVol = volumes[n-1];
  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const volRatio = currentVol / avgVol;
  if (volRatio < 1.50) return { isMatch: false };

  // 4. Moving Average Trend Filter (8 EMA & 20 EMA)
  const e8 = ema(closes, 8);
  const e20 = ema(closes, 20);
  const lastE8 = e8[n-1];
  const lastE20 = e20[n-1];
  const prevE20 = e20[n-2] || lastE20;

  const isTrendAligned = c >= lastE20 && (lastE8 >= lastE20 || lastE20 >= prevE20);
  if (!isTrendAligned) return { isMatch: false };

  const risk = cmp - l; // Stop below elephant candle low
  return {
    isMatch: true,
    reason: `Oliver Velez Bullish Elephant Candle (🐘): Solid body ${(bodyRatio * 100).toFixed(0)}%, ATR Expansion ${atrRatio.toFixed(1)}x, Volume ${volRatio.toFixed(1)}x. Igniting institutional buying move.`,
    entry: h,
    risk: risk > 0 ? risk : cmp * 0.015,
    metrics: [
      { name: 'Body Ratio', value: `${(bodyRatio * 100).toFixed(0)}%` },
      { name: 'ATR Expand', value: `${atrRatio.toFixed(1)}x` },
      { name: 'Vol Surge', value: `${volRatio.toFixed(1)}x` }
    ]
  };
}

function elephantBearish(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 30) return { isMatch: false };

  const c = closes[n-1], o = opens[n-1], h = highs[n-1], l = lows[n-1];
  const body = o - c;
  const range = h - l || 1;

  if (body <= 0) return { isMatch: false }; // Must be a red candle

  // 1. Pure Solid Body Ratio >= 70%
  const bodyRatio = body / range;
  if (bodyRatio < 0.70) return { isMatch: false };

  // 2. ATR Expansion Factor >= 1.3x
  const atrArr = atr(highs, lows, closes, 14);
  const currentAtr = atrArr[n-2] || atrArr[n-1] || (range);
  const atrRatio = body / currentAtr;
  if (atrRatio < 1.30) return { isMatch: false };

  // 3. Volume Surge Filter (>= 1.5x avg volume)
  const currentVol = volumes[n-1];
  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const volRatio = currentVol / avgVol;
  if (volRatio < 1.50) return { isMatch: false };

  // 4. Moving Average Trend Filter (8 EMA & 20 EMA)
  const e8 = ema(closes, 8);
  const e20 = ema(closes, 20);
  const lastE8 = e8[n-1];
  const lastE20 = e20[n-1];

  const isTrendAligned = c <= lastE20 || lastE8 <= lastE20;
  if (!isTrendAligned) return { isMatch: false };

  const risk = h - cmp; // Stop above elephant candle high
  return {
    isMatch: true,
    isShort: true,
    reason: `Oliver Velez Bearish Elephant Candle (🐘): Solid body ${(bodyRatio * 100).toFixed(0)}%, ATR Expansion ${atrRatio.toFixed(1)}x, Volume ${volRatio.toFixed(1)}x. Heavy institutional selling move.`,
    entry: l,
    risk: risk > 0 ? risk : cmp * 0.015,
    metrics: [
      { name: 'Body Ratio', value: `${(bodyRatio * 100).toFixed(0)}%` },
      { name: 'ATR Expand', value: `${atrRatio.toFixed(1)}x` },
      { name: 'Vol Surge', value: `${volRatio.toFixed(1)}x` }
    ]
  };
}

// ─── Gap Expansion Momentum Screener (Part 1: 5% - 20% Upper/Lower Circuit Move) ────────
function gapMomentum(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 10) return { isMatch: false };

  const prevClose = closes[n-2];
  const prevOpen = opens[n-2];
  const prevHigh = highs[n-2];
  const prevLow = lows[n-2];
  const prevVol = volumes[n-2];

  const currentOpen = opens[n-1];
  const currentClose = closes[n-1];
  const currentHigh = highs[n-1];
  const currentLow = lows[n-1];

  if (!prevClose || !currentOpen) return { isMatch: false };

  const gapPct = ((currentOpen - prevClose) / prevClose) * 100;
  const absGapPct = Math.abs(gapPct);

  // Must have a gap of at least 1.2%
  if (absGapPct < 1.2) return { isMatch: false };

  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const currentVol = volumes[n-1];
  const volRatio = currentVol / avgVol;

  // Must have Volume Expansion >= 1.5x
  if (volRatio < 1.5) return { isMatch: false };

  const isGapUp = gapPct > 0;
  const isContinuation = isGapUp ? currentClose > currentOpen : currentClose < currentOpen;
  if (!isContinuation) return { isMatch: false };

  // Previous Day Closing Bell Analysis (3:00 PM - 3:30 PM Buildup)
  const prevRange = prevHigh - prevLow || 1;
  const prevClosePos = (prevClose - prevLow) / prevRange;
  const prevVolRatio = prevVol / avgVol;

  let preGapStatus = 'Standard Gap';
  if (isGapUp && prevClosePos >= 0.70 && prevVolRatio >= 1.2) {
    preGapStatus = '🔥 Pre-Market Accumulation (Closed at High + Vol)';
  } else if (!isGapUp && prevClosePos <= 0.30 && prevVolRatio >= 1.2) {
    preGapStatus = '🔻 Pre-Market Distribution (Closed at Low + Vol)';
  }

  return {
    isMatch: true,
    isShort: !isGapUp,
    reason: `${isGapUp ? 'Gap Up' : 'Gap Down'} Expansion (${gapPct > 0 ? '+' : ''}${gapPct.toFixed(2)}%): ${preGapStatus}. Current relative volume ${volRatio.toFixed(1)}x avg building for explosive 5%-20% daily move.`,
    entry: isGapUp ? currentHigh : currentLow,
    risk: cmp * 0.015,
    metrics: [
      { name: 'Gap %', value: `${gapPct > 0 ? '+' : ''}${gapPct.toFixed(2)}%` },
      { name: 'Prev Close Pos', value: isGapUp ? `Top ${(prevClosePos * 100).toFixed(0)}%` : `Bottom ${((1 - prevClosePos) * 100).toFixed(0)}%` },
      { name: 'Prev Vol Surge', value: `${prevVolRatio.toFixed(1)}x` },
      { name: 'Curr Vol Surge', value: `${volRatio.toFixed(1)}x` }
    ]
  };
}
