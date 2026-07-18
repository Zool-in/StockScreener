import { bollingerBands, keltnerChannels } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'ttm_orb') return ttmSqueezeORB(data);
  if (strategyId === 'intraday_retest') return smcIntradayRetest(data);
  return { isMatch: false };
}

function ttmSqueezeORB(data) {
  const { closes, highs, lows } = data;
  
  // TTM Squeeze logic: Bollinger Bands entirely inside Keltner Channels
  const bb = bollingerBands(closes, 20, 2);
  const kc = keltnerChannels(highs, lows, closes, 20, 1.5);
  
  if (!bb.upper || !kc.upper) return { isMatch: false };

  const isSqueeze = (bb.upper < kc.upper) && (bb.lower > kc.lower);
  
  // ORB logic: For a 15m timeframe, the current candle volume should be surging
  const currentVol = data.volumes[data.volumes.length - 1];
  const avgVol = data.volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const isVolSurge = currentVol > avgVol * 1.5;

  if (isSqueeze && isVolSurge) {
    const risk = data.cmp * 0.01; // 1% stop loss for intraday
    return {
      isMatch: true,
      reason: 'Bollinger Bands inside Keltner Channels (Squeeze) + Volume Surge.',
      entry: highs[highs.length-1], // Trigger is breaking today's high
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
  const { ohlcv, closes, highs, lows, opens, cmp } = data;
  const n = ohlcv.length;
  if (n < 25) return { isMatch: false }; 

  // 1. Find a recent external liquidity pool (Pivot High) in the window [n-25 to n-5]
  let pivotHigh = 0;
  for (let i = n - 25; i <= n - 5; i++) {
    if (i < 0) continue;
    if (highs[i] > pivotHigh) pivotHigh = highs[i];
  }
  if (pivotHigh === 0) return { isMatch: false };

  // 2. Liquidity Sweep: Price must have broken above the pivot high in the last 4 candles
  let didSweep = false;
  let highestAfterSweep = 0;
  for (let i = n - 4; i <= n - 1; i++) {
     if (highs[i] > pivotHigh) {
         didSweep = true;
         if (highs[i] > highestAfterSweep) highestAfterSweep = highs[i];
     }
  }
  if (!didSweep) return { isMatch: false };

  // 3. The Retest (Internal Liquidity): Price must pull back to within 0.5% of the original Pivot High
  // It shouldn't fall significantly below it (which would invalidate the setup)
  const diffPct = (cmp - pivotHigh) / pivotHigh;
  const isRetesting = diffPct >= -0.002 && diffPct <= 0.005; // -0.2% to +0.5% zone
  if (!isRetesting) return { isMatch: false };

  // 4. Entry Trigger: Reversal candle (Green close or long lower wick)
  const isGreen = closes[n-1] > opens[n-1];
  const lowerWick = Math.min(opens[n-1], closes[n-1]) - lows[n-1];
  const body = Math.abs(closes[n-1] - opens[n-1]);
  const isRejection = lowerWick >= body;

  if (isGreen || isRejection) {
     return {
        isMatch: true,
        reason: 'SMC Setup: Swept external liquidity (recent high), and has now pulled back to test internal liquidity (previous pivot). Bullish rejection detected.',
        entry: pivotHigh,
        risk: cmp * 0.005, // 0.5% stop loss for intraday
        metrics: [
           { name: 'Pivot (Liq)', value: pivotHigh.toFixed(1) },
           { name: 'Sweep Peak', value: highestAfterSweep.toFixed(1) }
        ]
     };
  }

  return { isMatch: false };
}
