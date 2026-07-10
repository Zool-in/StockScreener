import { ema, rsi, adx, connorsRSI, macd, cci } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'minervini') return minerviniVCP(data);
  if (strategyId === 'darvas') return darvasBox(data);
  if (strategyId === 'rs') return rsLeader(data);
  if (strategyId === 'crsi') return crsiMeanReversion(data);
  if (strategyId === 'xmomentum') return extremeMomentum(data);
  return { isMatch: false };
}

function extremeMomentum(data) {
  const { closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  const rsiVal = rsi(closes);
  const macdData = macd(closes);
  const cciVal = cci(highs, lows, closes, 34);
  
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
  
  // The box must have been relatively tight (e.g. less than 15% from high to low)
  const isTight = ((twentyDayHigh - twentyDayLow) / twentyDayLow) <= 0.15;

  // Volume Surge Filter
  const currentVol = volumes[n - 1];
  const avgVol = volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20;
  const volSurge = currentVol > avgVol * 1.5;

  if (macdBullish && rsiBullish && cciBullish && isBreakout && isTight && volSurge) {
    return {
      isMatch: true,
      reason: 'Extreme Momentum Breakout: MACD bullish, RSI > 70, CCI > 100, breaking 20-day high on heavy volume.',
      entry: twentyDayHigh, 
      risk: cmp * 0.04, // 4% stop loss
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
  const { closes, highs, lows, volumes, cmp } = data;
  if (closes.length < 200) return { isMatch: false };

  const e200 = ema(closes, 200);
  const e150 = ema(closes, 150);
  const e50 = ema(closes, 50);

  // Stage 2 Uptrend Criteria
  const stage2 = (cmp > e150) && (e150 > e200) && (e50 > e150);
  if (!stage2) return { isMatch: false };

  const week52High = Math.max(...highs.slice(-250));
  const nearHigh = cmp >= week52High * 0.75; // Within 25% of 52-week high

  const hlPct = ((highs[highs.length-1] - lows[lows.length-1]) / lows[lows.length-1]) * 100;
  const tightRange = hlPct < 2.5;

  const currentVol = volumes[volumes.length-1];
  const avgVol = volumes.slice(-50).reduce((a,b)=>a+b,0) / 50;
  const volumeDryUp = currentVol < avgVol * 0.8;

  if (nearHigh && tightRange && volumeDryUp) {
    return {
      isMatch: true,
      reason: 'Minervini Stage 2 uptrend with extreme volume and price contraction. Coil is tight.',
      entry: highs[highs.length-1], // Entry trigger is breaking today's high
      risk: cmp * 0.05,
      metrics: [
        { name: 'Daily Range', value: `${hlPct.toFixed(1)}%` },
        { name: 'Vol vs Avg', value: `${(currentVol/avgVol).toFixed(2)}x` },
        { name: 'Vs 52w High', value: `-${(((week52High-cmp)/week52High)*100).toFixed(1)}%` }
      ]
    };
  }
  return { isMatch: false };
}

function darvasBox(data) {
  const { highs, lows, volumes, cmp } = data;
  if (highs.length < 60) return { isMatch: false };

  // Check last 60 days for range bound box (Top and bottom within 15%)
  const recentHighs = highs.slice(-60, -1);
  const recentLows = lows.slice(-60, -1);
  
  const boxTop = Math.max(...recentHighs);
  const boxBottom = Math.min(...recentLows);
  const boxSizePct = ((boxTop - boxBottom) / boxBottom) * 100;

  // The stock must have been trapped in a < 15% box for 60 days
  const isBoxed = boxSizePct < 15;

  // Today, it's piercing the top of the box on massive volume
  const currentVol = volumes[volumes.length-1];
  const avgVol = volumes.slice(-60).reduce((a,b)=>a+b,0) / 60;
  const isBreakout = cmp > boxTop && currentVol > avgVol * 2.5;

  if (isBoxed && isBreakout) {
    return {
      isMatch: true,
      reason: 'Exploding out of a multi-month flat Darvas Box on massive volume.',
      entry: boxTop, // The specific trigger level
      risk: cmp - boxTop, // Stop loss right below the top of the box
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
  const { closes, highs, lows, cmp } = data;
  const adxVal = adx(highs, lows, closes);
  const rsiVal = rsi(closes);
  
  // A true RS leader ignores the market. 
  // Without tracking Nifty dynamically here, we use pure extreme trend logic.
  if (cmp > ema(closes, 20) && ema(closes, 20) > ema(closes, 50) && adxVal > 30 && rsiVal > 60) {
    return {
      isMatch: true,
      reason: 'Extreme internal Relative Strength. ADX > 30 indicates a runaway trend.',
      entry: highs[highs.length-1], // Entry trigger is breaking today's high
      risk: cmp * 0.05,
      metrics: [
        { name: 'ADX Trend', value: adxVal },
        { name: 'RSI', value: rsiVal }
      ]
    };
  }
  return { isMatch: false };
}

function crsiMeanReversion(data) {
  const { closes, cmp } = data;
  const crsiVal = connorsRSI(closes);
  const e200 = ema(closes, 200);

  // Buy the extreme dip in a long term uptrend
  if (cmp > e200 && crsiVal < 10) {
    return {
      isMatch: true,
      reason: 'Connors RSI < 10. Statistically oversold rubber-band setup. Buy for a 2-4 day snapback.',
      entry: cmp, // Enter at market to catch the dip
      risk: cmp * 0.04,
      metrics: [
        { name: 'Connors RSI', value: crsiVal.toFixed(1) },
        { name: 'Trend', value: 'Above 200 EMA' }
      ]
    };
  }
  return { isMatch: false };
}
