import { rsiSeries, emaSeries, vwmaSeries } from '../core/math.js';

export function run(strategyId, data) {
  const { closes, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  // Core Hilega Milega calculations
  const rsiArr = rsiSeries(closes, 9);
  const ema3Arr = emaSeries(rsiArr, 3);
  const vwma21Arr = vwmaSeries(rsiArr, volumes, 21);

  const curRSI = rsiArr[n - 1];
  const curEMA = ema3Arr[n - 1];
  const curVWMA = vwma21Arr[n - 1];
  
  const prevRSI = rsiArr[n - 2];
  const prevEMA = ema3Arr[n - 2];
  const prevVWMA = vwma21Arr[n - 2];

  if (strategyId === 'hm_bottom') return bottomCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, data);
  if (strategyId === 'hm_top') return topCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, data);
  if (strategyId === 'hm_bullish') return bullishTrend(curRSI, curEMA, curVWMA, prevRSI, data);
  if (strategyId === 'hm_bearish') return bearishBreakdown(curRSI, curEMA, curVWMA, prevRSI, data);
  if (strategyId === 'hm_chop') return consolidation(curRSI, curEMA, curVWMA, data);

  return { isMatch: false };
}

function getVsaAndCandle(data) {
  const n = data.closes.length;
  const curVol = data.volumes[n-1];
  const avgVol = data.volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20;
  
  const open = data.opens[n-1];
  const high = data.highs[n-1];
  const low = data.lows[n-1];
  const close = data.closes[n-1];
  
  const isGreen = close > open;
  const isRed = close < open;
  const range = high - low || 1;
  const closePercent = (close - low) / range; // 1 is absolute high, 0 is absolute low
  
  return { curVol, avgVol, isGreen, isRed, closePercent };
}

function bottomCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, data) {
  const { curVol, avgVol, isGreen, closePercent } = getVsaAndCandle(data);
  const { cmp } = data;
  
  const wasBelow = prevRSI < prevVWMA || prevEMA < prevVWMA;
  const isAbove = curRSI > curVWMA && curEMA > curVWMA;
  const isOversold = curRSI < 55; 

  // Strict Institutional Filters: Needs volume surge & strong bullish close (top 40%)
  const hasVolume = curVol > avgVol * 1.2;
  const isStrongCandle = isGreen && closePercent >= 0.6;

  if (wasBelow && isAbove && isOversold && hasVolume && isStrongCandle) {
    return {
      isMatch: true,
      reason: 'HM Bottom Catch: RSI & 3-EMA crossing 21-VWMA with volume surge and strong bullish rejection.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: 'Vol Surge', value: `${(curVol/avgVol).toFixed(1)}x` },
        { name: 'Candle Close', value: `Top ${(100 - closePercent*100).toFixed(0)}%` }
      ]
    };
  }
  return { isMatch: false };
}

function topCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, data) {
  const { curVol, avgVol, isRed, closePercent } = getVsaAndCandle(data);
  const { cmp } = data;

  const wasAbove = prevRSI > prevVWMA || prevEMA > prevVWMA;
  const isBelow = curRSI < curVWMA && curEMA < curVWMA;
  const isOverbought = curRSI > 45;

  // Strict Institutional Filters: Needs volume surge & strong bearish close (bottom 40%)
  const hasVolume = curVol > avgVol * 1.2;
  const isStrongCandle = isRed && closePercent <= 0.4;

  if (wasAbove && isBelow && isOverbought && hasVolume && isStrongCandle) {
    return {
      isMatch: true,
      reason: 'HM Top Catch: RSI & 3-EMA crossing below 21-VWMA with volume surge and strong bearish rejection.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: 'Vol Surge', value: `${(curVol/avgVol).toFixed(1)}x` },
        { name: 'Candle Close', value: `Bottom ${(closePercent*100).toFixed(0)}%` }
      ]
    };
  }
  return { isMatch: false };
}

function bullishTrend(curRSI, curEMA, curVWMA, prevRSI, data) {
  const { curVol, avgVol, isGreen, closePercent } = getVsaAndCandle(data);
  const { cmp } = data;

  // 0-Line Crossover Logic: The RSI crossover must happen near the 50 centerline (50 to 55)
  const isFreshCrossover = curRSI > 50 && prevRSI <= 50;
  const isNearCenterline = curRSI <= 55; // Prevent buying extended breakouts
  const isStacked = curRSI > curEMA && curEMA > curVWMA;

  // Institutional Filters: Massive volume required for center-line breaks
  const hasVolume = curVol > avgVol * 1.5;
  const isStrongCandle = isGreen && closePercent >= 0.7; // Top 30% close

  if (isFreshCrossover && isNearCenterline && isStacked && hasVolume && isStrongCandle) {
    return {
      isMatch: true,
      reason: 'HM Bullish Breakout: Fresh 50-Line Crossover on massive volume with strong candle close.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: 'Vol Surge', value: `${(curVol/avgVol).toFixed(1)}x` },
        { name: 'Centerline', value: 'Fresh 50-Cross' }
      ]
    };
  }
  return { isMatch: false };
}

function bearishBreakdown(curRSI, curEMA, curVWMA, prevRSI, data) {
  const { curVol, avgVol, isRed, closePercent } = getVsaAndCandle(data);
  const { cmp } = data;

  // 0-Line Crossover Logic: The RSI crossover must happen near the 50 centerline (45 to 50)
  const isFreshCrossover = curRSI < 50 && prevRSI >= 50;
  const isNearCenterline = curRSI >= 45; // Prevent shorting extended breakdowns
  const isStacked = curVWMA > curEMA && curEMA > curRSI;

  const hasVolume = curVol > avgVol * 1.5;
  const isStrongCandle = isRed && closePercent <= 0.3; // Bottom 30% close

  if (isFreshCrossover && isNearCenterline && isStacked && hasVolume && isStrongCandle) {
    return {
      isMatch: true,
      isShort: true,
      reason: 'HM Bearish Breakdown: Fresh 50-Line Crossover downwards on high volume with weak close.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: 'Vol Surge', value: `${(curVol/avgVol).toFixed(1)}x` },
        { name: 'Centerline', value: 'Fresh 50-Cross' }
      ]
    };
  }
  return { isMatch: false };
}

function consolidation(curRSI, curEMA, curVWMA, data) {
  const { cmp } = data;
  const maxLine = Math.max(curRSI, curEMA, curVWMA);
  const minLine = Math.min(curRSI, curEMA, curVWMA);
  const spread = maxLine - minLine;
  
  if (spread < 3 && maxLine < 55 && minLine > 45) {
    return {
      isMatch: true,
      reason: 'Hilega Milega Chop: Lines are tightly intertwined near the 50 centerline. Avoid trading / watch for squeeze.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: '3-EMA', value: curEMA.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}
