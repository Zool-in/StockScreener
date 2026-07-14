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

  if (strategyId === 'hm_bottom') return bottomCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp);
  if (strategyId === 'hm_top') return topCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp);
  if (strategyId === 'hm_bullish') return bullishTrend(curRSI, curEMA, curVWMA, prevRSI, cmp);
  if (strategyId === 'hm_bearish') return bearishBreakdown(curRSI, curEMA, curVWMA, prevRSI, cmp);
  if (strategyId === 'hm_chop') return consolidation(curRSI, curEMA, curVWMA, cmp);

  return { isMatch: false };
}

function bottomCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp) {
  const wasBelow = prevRSI < prevVWMA || prevEMA < prevVWMA;
  const isAbove = curRSI > curVWMA && curEMA > curVWMA;
  const isOversold = curRSI < 55; 

  if (wasBelow && isAbove && isOversold) {
    return {
      isMatch: true,
      reason: 'Hilega Milega Bottom Catch: RSI & 3-EMA crossing above 21-VWMA from oversold region.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI },
        { name: '3-EMA', value: curEMA.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

function topCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp) {
  const wasAbove = prevRSI > prevVWMA || prevEMA > prevVWMA;
  const isBelow = curRSI < curVWMA && curEMA < curVWMA;
  const isOverbought = curRSI > 45;

  if (wasAbove && isBelow && isOverbought) {
    return {
      isMatch: true,
      reason: 'Hilega Milega Top Catch: RSI & 3-EMA crossing below 21-VWMA from overbought region.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI },
        { name: '3-EMA', value: curEMA.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

function bullishTrend(curRSI, curEMA, curVWMA, prevRSI, cmp) {
  if (curRSI > 50 && curRSI > curEMA && curEMA > curVWMA && prevRSI <= 50) {
    return {
      isMatch: true,
      reason: 'Hilega Milega Bullish Breakout: Lines stacked bullishly (Black > Blue > Red) and crossed 50.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI },
        { name: '3-EMA', value: curEMA.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

function bearishBreakdown(curRSI, curEMA, curVWMA, prevRSI, cmp) {
  if (curRSI < 50 && curVWMA > curEMA && curEMA > curRSI && prevRSI >= 50) {
    return {
      isMatch: true,
      reason: 'Hilega Milega Bearish Breakdown: Lines stacked bearishly (Red > Blue > Black) and crossed below 50.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI },
        { name: '3-EMA', value: curEMA.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

function consolidation(curRSI, curEMA, curVWMA, cmp) {
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
        { name: 'RSI(9)', value: curRSI },
        { name: '3-EMA', value: curEMA.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}
