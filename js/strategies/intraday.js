import { bollingerBands, keltnerChannels } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'ttm_orb') return ttmSqueezeORB(data);
  if (strategyId === 'intraday_retest') return smcIntradayRetest(data);
  if (strategyId === 'ohl_bullish') return ohlBullish(data);
  if (strategyId === 'ohl_bearish') return ohlBearish(data);
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

function ohlBullish(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 5) return { isMatch: false };
  
  const currentOpen = opens[n-1];
  const currentLow = lows[n-1];
  const currentHigh = highs[n-1];
  const currentClose = closes[n-1];
  
  // Open = Low (Allowing 0.15% buffer for data noise)
  const diff = (currentOpen - currentLow) / currentOpen;
  const isOpenLow = diff <= 0.0015; // 0.15% max deviation
  if (!isOpenLow) return { isMatch: false };
  
  const currentVol = volumes[n-1];
  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const volSurgeRatio = (currentVol / avgVol).toFixed(1);
  
  const { closePercent } = getCandleAnatomy(currentHigh, currentLow, currentClose, currentOpen);
  
  return {
    isMatch: true,
    reason: `Open = Low Setup: Stock opened at low (diff ${(diff * 100).toFixed(2)}%). Buyers defended open level.`,
    entry: currentHigh,
    risk: cmp * 0.01,
    metrics: [
      { name: 'O=L Diff', value: `${(diff*100).toFixed(2)}%` },
      { name: 'Vol Surge', value: `${volSurgeRatio}x` },
      { name: 'Candle Close', value: `Top ${(closePercent*100).toFixed(0)}%` }
    ]
  };
}

function ohlBearish(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 5) return { isMatch: false };
  
  const currentOpen = opens[n-1];
  const currentLow = lows[n-1];
  const currentHigh = highs[n-1];
  const currentClose = closes[n-1];
  
  // Open = High (Allowing 0.15% buffer for data noise)
  const diff = (currentHigh - currentOpen) / currentOpen;
  const isOpenHigh = diff <= 0.0015; // 0.15% max deviation
  if (!isOpenHigh) return { isMatch: false };
  
  const currentVol = volumes[n-1];
  const avgVol = (volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20) || 1;
  const volSurgeRatio = (currentVol / avgVol).toFixed(1);
  
  const { closePercent } = getCandleAnatomy(currentHigh, currentLow, currentClose, currentOpen);
  
  return {
    isMatch: true,
    isShort: true,
    reason: `Open = High Setup: Stock opened at high (diff ${(diff * 100).toFixed(2)}%). Sellers dominated from open.`,
    entry: currentLow,
    risk: cmp * 0.01,
    metrics: [
      { name: 'O=H Diff', value: `${(diff*100).toFixed(2)}%` },
      { name: 'Vol Surge', value: `${volSurgeRatio}x` },
      { name: 'Candle Close', value: `Bottom ${((1 - closePercent)*100).toFixed(0)}%` }
    ]
  };
}
