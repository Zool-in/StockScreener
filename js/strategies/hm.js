import { rsiSeries, emaSeries, vwmaSeries } from '../core/math.js';

export function run(strategyId, data) {
  const { closes, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  // Core Hilega Milega indicator calculations:
  // RSI(9), 3-EMA of RSI, and 21-VWMA of RSI
  const rsiArr = rsiSeries(closes, 9);
  const ema3Arr = emaSeries(rsiArr, 3);
  const vwma21Arr = vwmaSeries(rsiArr, volumes, 21);

  const curRSI = rsiArr[n - 1];
  const curEMA = ema3Arr[n - 1];
  const curVWMA = vwma21Arr[n - 1];
  
  const prevRSI = rsiArr[n - 2];
  const prevEMA = ema3Arr[n - 2];
  const prevVWMA = vwma21Arr[n - 2];

  if (strategyId === 'hm_bottom') return bottomCatch(rsiArr, ema3Arr, vwma21Arr, data);
  if (strategyId === 'hm_top') return topCatch(rsiArr, ema3Arr, vwma21Arr, data);
  if (strategyId === 'hm_bullish') return bullishTrend(rsiArr, ema3Arr, vwma21Arr, data);
  if (strategyId === 'hm_bearish') return bearishBreakdown(rsiArr, ema3Arr, vwma21Arr, data);
  if (strategyId === 'hm_chop') return consolidation(rsiArr, ema3Arr, vwma21Arr, data);

  return { isMatch: false };
}

/**
 * 1. Bottom Catch (Bullish Crossover / Bottom entry):
 * - WMA (21-VWMA) crosses above 50 (or was below 50 and is now above)
 * - RSI is above 50
 * - Confirmation candle: Current close > previous high
 */
function bottomCatch(rsiArr, ema3Arr, vwma21Arr, data) {
  const n = data.closes.length;
  const curRSI = rsiArr[n - 1];
  const curVWMA = vwma21Arr[n - 1];

  // Chop Filter Check
  const last7VWMA = vwma21Arr.slice(-7);
  const isFlat = last7VWMA.every(v => v >= 47.5 && v <= 52.5);
  const isChop = isFlat && (curVWMA >= 47.5 && curVWMA <= 52.5);

  // Trigger: Green line crosses above Red line OR Red line crosses above 50 (with memory)
  const emaCrossAbove = (ema3Arr[n - 1] > vwma21Arr[n - 1] && ema3Arr[n - 2] <= vwma21Arr[n - 2]) ||
                        (ema3Arr[n - 2] > vwma21Arr[n - 2] && ema3Arr[n - 3] <= vwma21Arr[n - 3]);
  const wmaCrossAbove = (vwma21Arr[n - 1] > 50 && vwma21Arr[n - 2] <= 50) ||
                        (vwma21Arr[n - 1] > 50 && vwma21Arr[n - 3] <= 50) ||
                        (vwma21Arr[n - 1] > 50 && vwma21Arr[n - 4] <= 50);

  const buyTrigger = emaCrossAbove || wmaCrossAbove;
  const rsiAbove = curRSI > 50;
  const candleConfirm = data.closes[n - 1] > data.highs[n - 2];

  if (buyTrigger && rsiAbove && candleConfirm && !isChop) {
    const entryPrice = data.closes[n - 1];
    const sl = data.lows[n - 1];
    return {
      isMatch: true,
      reason: 'HM Bottom Catch: Green line crossed above Red line or 50-line with RSI > 50 and breakout confirmation.',
      entry: entryPrice,
      risk: Math.max(entryPrice * 0.02, entryPrice - sl),
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) },
        { name: 'SL Level', value: `₹ ${sl.toFixed(1)}` }
      ]
    };
  }
  return { isMatch: false };
}

/**
 * 2. Top Catch (Bearish Crossover / Top entry):
 * - Green line (EMA 3) crosses below Red line (WMA 21) OR Red line crosses below 50
 * - RSI is below 50
 * - Confirmation candle: Current close < previous low
 */
function topCatch(rsiArr, ema3Arr, vwma21Arr, data) {
  const n = data.closes.length;
  const curRSI = rsiArr[n - 1];
  const curVWMA = vwma21Arr[n - 1];

  // Chop Filter Check
  const last7VWMA = vwma21Arr.slice(-7);
  const isFlat = last7VWMA.every(v => v >= 47.5 && v <= 52.5);
  const isChop = isFlat && (curVWMA >= 47.5 && curVWMA <= 52.5);

  // Trigger: Green line crosses below Red line OR Red line crosses below 50 (with memory)
  const emaCrossBelow = (ema3Arr[n - 1] < vwma21Arr[n - 1] && ema3Arr[n - 2] >= vwma21Arr[n - 2]) ||
                        (ema3Arr[n - 2] < vwma21Arr[n - 2] && ema3Arr[n - 3] >= vwma21Arr[n - 3]);
  const wmaCrossBelow = (vwma21Arr[n - 1] < 50 && vwma21Arr[n - 2] >= 50) ||
                        (vwma21Arr[n - 1] < 50 && vwma21Arr[n - 3] >= 50) ||
                        (vwma21Arr[n - 1] < 50 && vwma21Arr[n - 4] >= 50);

  const sellTrigger = emaCrossBelow || wmaCrossBelow;
  const rsiBelow = curRSI < 50;
  const candleConfirm = data.closes[n - 1] < data.lows[n - 2];

  if (sellTrigger && rsiBelow && candleConfirm && !isChop) {
    const entryPrice = data.closes[n - 1];
    const sl = data.highs[n - 1];
    return {
      isMatch: true,
      isShort: true,
      reason: 'HM Top Catch: Green line crossed below Red line or 50-line with RSI < 50 and breakdown confirmation.',
      entry: entryPrice,
      risk: Math.max(entryPrice * 0.02, sl - entryPrice),
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) },
        { name: 'SL Level', value: `₹ ${sl.toFixed(1)}` }
      ]
    };
  }
  return { isMatch: false };
}

/**
 * 3. Bullish Retracement/Continuation:
 * - WMA and RSI already in uptrend (> 50)
 * - WMA pulls back toward 50 (approaches but doesn't cross below 48)
 * - WMA turns back up
 * - Close > previous high
 */
function bullishTrend(rsiArr, ema3Arr, vwma21Arr, data) {
  const n = data.closes.length;
  const curRSI = rsiArr[n - 1];
  const curVWMA = vwma21Arr[n - 1];
  const prevVWMA = vwma21Arr[n - 2];

  const inBullishZone = curRSI > 50 && curVWMA > 50;
  const didPullback = prevVWMA <= vwma21Arr[n - 3] && prevVWMA < 55 && prevVWMA >= 48;
  const turnedUp = curVWMA > prevVWMA;
  const candleConfirm = data.closes[n - 1] > data.highs[n - 2];

  if (inBullishZone && didPullback && turnedUp && candleConfirm) {
    const entryPrice = data.closes[n - 1];
    return {
      isMatch: true,
      reason: 'HM Bullish Retracement: WMA pulled back near 50 centerline and turned up under active bullish bias.',
      entry: entryPrice,
      risk: entryPrice * 0.03,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

/**
 * 4. Bearish Retracement/Continuation:
 * - WMA and RSI already in downtrend (< 50)
 * - WMA rallies toward 50 (approaches but doesn't cross above 52)
 * - WMA turns back down
 * - Close < previous low
 */
function bearishBreakdown(rsiArr, ema3Arr, vwma21Arr, data) {
  const n = data.closes.length;
  const curRSI = rsiArr[n - 1];
  const curVWMA = vwma21Arr[n - 1];
  const prevVWMA = vwma21Arr[n - 2];

  const inBearishZone = curRSI < 50 && curVWMA < 50;
  const didPullback = prevVWMA >= vwma21Arr[n - 3] && prevVWMA > 45 && prevVWMA <= 52;
  const turnedDown = curVWMA < prevVWMA;
  const candleConfirm = data.closes[n - 1] < data.lows[n - 2];

  if (inBearishZone && didPullback && turnedDown && candleConfirm) {
    const entryPrice = data.closes[n - 1];
    return {
      isMatch: true,
      isShort: true,
      reason: 'HM Bearish Retracement: WMA rallied near 50 centerline and turned down under active bearish bias.',
      entry: entryPrice,
      risk: entryPrice * 0.03,
      metrics: [
        { name: 'RSI(9)', value: curRSI.toFixed(1) },
        { name: '21-VWMA', value: curVWMA.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}

/**
 * 5. No-Trade Zone (Chop filter):
 * - WMA remains tightly compressed near 50 without clear breakout direction.
 */
function consolidation(rsiArr, ema3Arr, vwma21Arr, data) {
  const n = data.closes.length;
  const curVWMA = vwma21Arr[n - 1];
  const last7VWMA = vwma21Arr.slice(-7);

  // If WMA has been oscillating tightly inside the 48-52 zone for the past 7 candles
  const isChopZone = last7VWMA.every(v => v >= 47.5 && v <= 52.5);

  if (isChopZone) {
    return {
      isMatch: true,
      reason: 'HM Chop Filter: WMA lines are oscillating flatly near the 50 centerline. High whipsaw risk.',
      entry: data.closes[n - 1],
      risk: 0,
      metrics: [
        { name: '21-VWMA', value: curVWMA.toFixed(1) },
        { name: 'Status', value: 'NO-TRADE ZONE' }
      ]
    };
  }
  return { isMatch: false };
}

