import { ema, emaSeries, rsi, adx, connorsRSI, macd, cci } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'minervini') return minerviniVCP(data);
  if (strategyId === 'darvas') return darvasBox(data);
  if (strategyId === 'rs') return rsLeader(data);
  if (strategyId === 'crsi') return crsiMeanReversion(data);
  if (strategyId === 'xmomentum') return extremeMomentum(data);
  return { isMatch: false };
}

function getCandleAnatomy(high, low, close, open) {
  const range = high - low || 1;
  const closePercent = (close - low) / range;
  const isGreen = close > open;
  return { closePercent, isGreen };
}

function extremeMomentum(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  const rsiVal = rsi(closes);
  const macdData = macd(closes);
  const cciVal = cci(highs, lows, closes, 34);
  
  const e9 = emaSeries(closes, 9);
  const e21 = emaSeries(closes, 21);
  const e50 = emaSeries(closes, 50);
  
  const curE9 = e9[n-1];
  const curE21 = e21[n-1];
  const curE50 = e50[n-1];
  
  // MACD Bullish Crossover / Above 0
  const macdBullish = macdData.macd > 0 && macdData.hist > 0;
  
  // RSI > 70
  const rsiBullish = rsiVal > 70;
  
  // CCI(34) > 100
  const cciBullish = cciVal > 100;
  
  // Sideways Chop Filter (Price Action Breakout > 20-day High & Tight Range)
  const recentHighs = highs.slice(-21, -1);
  const recentLows = lows.slice(-21, -1);
  const twentyDayHigh = Math.max(...recentHighs);
  const twentyDayLow = Math.min(...recentLows);
  const isBreakout = cmp >= twentyDayHigh;
  
  // The box must have been relatively tight (e.g. less than 12% from high to low)
  const isTight = ((twentyDayHigh - twentyDayLow) / twentyDayLow) <= 0.12;

  // EMA Conjunction (Squeeze) Filter
  const maxEma = Math.max(curE9, curE21, curE50);
  const minEma = Math.min(curE9, curE21, curE50);
  const emaConjunction = (maxEma - minEma) / minEma <= 0.05;
  
  // Not Overextended Filter
  const notOverextended = cmp <= curE9 * 1.06;

  // Volume Surge Filter
  const currentVol = volumes[n - 1];
  const avgVol = volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20;
  const volSurge = currentVol > avgVol * 1.5;

  // STRICT FILTER: No massive upper wicks on breakout
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isStrongClose = isGreen && closePercent >= 0.75; // Must close in top 25% of range

  if (macdBullish && rsiBullish && cciBullish && isBreakout && isTight && emaConjunction && notOverextended && volSurge && isStrongClose) {
    return {
      isMatch: true,
      reason: 'Fresh Momentum Breakout: EMAs pinched, tight range, volume surge, and a strong close without upper wick rejection.',
      entry: twentyDayHigh, 
      risk: cmp * 0.04,
      metrics: [
        { name: 'RSI', value: rsiVal.toFixed(1) },
        { name: 'CCI 34', value: cciVal.toFixed(1) },
        { name: 'Vol Surge', value: `${(currentVol/avgVol).toFixed(1)}x` }
      ]
    };
  }
  return { isMatch: false };
}

function minerviniVCP(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 200) return { isMatch: false };

  const e200 = ema(closes, 200);
  const e150 = ema(closes, 150);
  const e50 = ema(closes, 50);

  // Stage 2 Uptrend Criteria
  const stage2 = (cmp > e150) && (e150 > e200) && (e50 > e150);
  if (!stage2) return { isMatch: false };

  const week52High = Math.max(...highs.slice(-250));
  const nearHigh = cmp >= week52High * 0.75; 

  const hlPct = ((highs[n-1] - lows[n-1]) / lows[n-1]) * 100;
  
  // Either we are tight and dry (setup phase) OR we are breaking out (action phase)
  const tightRange = hlPct < 2.5;
  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-50).reduce((a,b)=>a+b,0) / 50;
  const volumeDryUp = currentVol < avgVol * 0.8;

  // ACTION PHASE: Breakout with massive volume and strong close
  const isBreakout = cmp >= week52High * 0.98; // Very close to or breaking 52-week high
  const volSurge = currentVol > avgVol * 1.5;
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isStrongClose = isGreen && closePercent >= 0.75;

  if (nearHigh) {
    if (isBreakout && volSurge && isStrongClose) {
      return {
        isMatch: true,
        reason: 'Minervini VCP Breakout: Breaking 52-week high on massive volume with a strong conviction close.',
        entry: cmp, 
        risk: cmp * 0.05,
        metrics: [
          { name: 'Vol Surge', value: `${(currentVol/avgVol).toFixed(1)}x` },
          { name: 'Breakout', value: 'Confirmed' }
        ]
      };
    } else if (tightRange && volumeDryUp) {
      return {
        isMatch: true,
        reason: 'Minervini Stage 2 VCP Setup: Extreme volume and price contraction. Coil is tight (watch for breakout).',
        entry: highs[n-1], 
        risk: cmp * 0.05,
        metrics: [
          { name: 'Daily Range', value: `${hlPct.toFixed(1)}%` },
          { name: 'Vol vs Avg', value: `${(currentVol/avgVol).toFixed(2)}x` }
        ]
      };
    }
  }
  return { isMatch: false };
}

function darvasBox(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 60) return { isMatch: false };

  const recentHighs = highs.slice(-60, -1);
  const recentLows = lows.slice(-60, -1);
  
  const boxTop = Math.max(...recentHighs);
  const boxBottom = Math.min(...recentLows);
  const boxSizePct = ((boxTop - boxBottom) / boxBottom) * 100;

  const isBoxed = boxSizePct < 15;

  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-60).reduce((a,b)=>a+b,0) / 60;
  const isBreakout = cmp > boxTop && currentVol > avgVol * 2.5;

  // STRICT FILTER: Candle Structure
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isStrongClose = isGreen && closePercent >= 0.8; // Must close in top 20%

  if (isBoxed && isBreakout && isStrongClose) {
    return {
      isMatch: true,
      reason: 'Exploding out of a multi-month flat Darvas Box on massive volume, closing strongly near the high.',
      entry: boxTop, 
      risk: cmp - boxTop,
      metrics: [
        { name: 'Box Duration', value: '> 60 days' },
        { name: 'Box Size', value: `${boxSizePct.toFixed(1)}%` },
        { name: 'Vol Surge', value: `${(currentVol/avgVol).toFixed(1)}x` }
      ]
    };
  }
  return { isMatch: false };
}

function rsLeader(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  const adxVal = adx(highs, lows, closes);
  const rsiVal = rsi(closes);
  
  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;

  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isStrongClose = isGreen && closePercent >= 0.6; // No massive rejection wicks
  const hasVolume = currentVol > avgVol * 1.2;

  if (cmp > ema(closes, 20) && ema(closes, 20) > ema(closes, 50) && adxVal > 30 && rsiVal > 60 && hasVolume && isStrongClose) {
    return {
      isMatch: true,
      reason: 'Extreme internal Relative Strength with volume confirmation. ADX > 30 indicates a runaway trend.',
      entry: highs[n-1],
      risk: cmp * 0.05,
      metrics: [
        { name: 'ADX Trend', value: adxVal.toFixed(1) },
        { name: 'RSI', value: rsiVal.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

function crsiMeanReversion(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 200) return { isMatch: false };

  const crsiVal = connorsRSI(closes);
  const e200 = ema(closes, 200);

  // STRICT FILTER: We don't buy a falling knife blindly. 
  // We need evidence of buyers stepping in (e.g., a long lower wick / hammer or a green close on volume).
  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  // A "hammer" means it closes in the top 30% of its range (long lower wick)
  const isHammer = closePercent >= 0.7; 
  const isVolumeSupported = currentVol > avgVol * 1.1;

  if (cmp > e200 && crsiVal < 10 && (isHammer || (isGreen && isVolumeSupported))) {
    return {
      isMatch: true,
      reason: 'Connors RSI < 10. Statistically oversold dip in uptrend, confirmed by lower wick rejection / buying volume.',
      entry: cmp, 
      risk: cmp * 0.04,
      metrics: [
        { name: 'Connors RSI', value: crsiVal.toFixed(1) },
        { name: 'Rejection', value: 'Confirmed' }
      ]
    };
  }
  return { isMatch: false };
}
