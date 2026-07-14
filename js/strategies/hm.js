import { rsiSeries, emaSeries, vwmaSeries, adx, ema } from '../core/math.js';

export function run(strategyId, data) {
  const { closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  // 1. Global Volume Spike Filter (1.5x 20-period average)
  const currentVol = volumes[n - 1];
  const avgVol = volumes.slice(Math.max(0, n - 21), n - 1).reduce((a,b)=>a+b, 0) / 20;
  if (currentVol < avgVol * 1.5) {
    return { isMatch: false }; // Strict filter: No volume, no trade.
  }

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

  // ADX for trend filtering
  const currentAdx = adx(highs, lows, closes, 14);
  
  // 9-EMA for price confirmation
  const priceEma9 = ema(closes, 9);

  if (strategyId === 'hm_bottom') return bottomCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp, priceEma9);
  if (strategyId === 'hm_top') return topCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp, priceEma9);
  if (strategyId === 'hm_bullish') return bullishTrend(curRSI, curEMA, curVWMA, prevRSI, cmp, currentAdx);
  if (strategyId === 'hm_bearish') return bearishBreakdown(curRSI, curEMA, curVWMA, prevRSI, cmp, currentAdx);
  if (strategyId === 'hm_chop') return consolidation(curRSI, curEMA, curVWMA, cmp);

  return { isMatch: false };
}

function bottomCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp, priceEma9) {
  const wasBelow = prevRSI < prevVWMA || prevEMA < prevVWMA;
  const isAbove = curRSI > curVWMA && curEMA > curVWMA;
  const isOversold = curRSI < 55; 
  const isPriceConfirmed = cmp > priceEma9;

  if (wasBelow && isAbove && isOversold && isPriceConfirmed) {
    return {
      isMatch: true,
      reason: 'HM Bottom Catch: RSI & 3-EMA crossing above 21-VWMA from oversold region, confirmed by price > 9-EMA and volume spike.',
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

function topCatch(curRSI, curEMA, curVWMA, prevRSI, prevEMA, prevVWMA, cmp, priceEma9) {
  const wasAbove = prevRSI > prevVWMA || prevEMA > prevVWMA;
  const isBelow = curRSI < curVWMA && curEMA < curVWMA;
  const isOverbought = curRSI > 45;
  const isPriceConfirmed = cmp < priceEma9;

  if (wasAbove && isBelow && isOverbought && isPriceConfirmed) {
    return {
      isMatch: true,
      reason: 'HM Top Catch: RSI & 3-EMA crossing below 21-VWMA from overbought region, confirmed by price < 9-EMA and volume spike.',
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

function bullishTrend(curRSI, curEMA, curVWMA, prevRSI, cmp, currentAdx) {
  if (curRSI > 50 && curRSI > curEMA && curEMA > curVWMA && prevRSI <= 50 && currentAdx > 20) {
    return {
      isMatch: true,
      reason: 'HM Bullish Breakout: Lines stacked bullishly (Black > Blue > Red), ADX > 20, and volume spiked.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI },
        { name: 'ADX', value: currentAdx.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

function bearishBreakdown(curRSI, curEMA, curVWMA, prevRSI, cmp, currentAdx) {
  if (curRSI < 50 && curVWMA > curEMA && curEMA > curRSI && prevRSI >= 50 && currentAdx > 20) {
    return {
      isMatch: true,
      reason: 'HM Bearish Breakdown: Lines stacked bearishly (Red > Blue > Black), ADX > 20, and volume spiked.',
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI(9)', value: curRSI },
        { name: 'ADX', value: currentAdx.toFixed(1) },
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
