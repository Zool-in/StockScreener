import { ema, rsi, adx, hv } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'bps') return bullPutSpread(data);
  if (strategyId === 'strangle') return shortStrangle(data);
  if (strategyId === 'iv_crush') return ivCrushCondor(data);
  if (strategyId === 'csp' || strategyId === 'wheel') return csp(data);
  if (strategyId === 'cc') return coveredCall(data);
  return { isMatch: false };
}

function getCandleAnatomy(high, low, close, open) {
  const range = high - low || 1;
  const closePercent = (close - low) / range;
  const isGreen = close > open;
  const isRed = close < open;
  return { closePercent, isGreen, isRed };
}

function bullPutSpread(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  const e200 = ema(closes, 200);
  const e50 = ema(closes, 50);
  const adxVal = adx(highs, lows, closes);
  const vol = hv(closes, 30);
  
  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;

  // STRICT FILTER: Check that the uptrend is currently being supported (not breaking down)
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isSupported = isGreen || closePercent >= 0.5; // Avoid entering BPS if today is a massive red dump
  const hasVolume = currentVol > avgVol * 0.9;

  if (cmp > e50 && cmp > e200 && adxVal > 25 && vol > 0.25 && isSupported && hasVolume) {
    return {
      isMatch: true,
      reason: 'Strong verified uptrend (ADX > 25) with high Historical Volatility, showing daily support. Great premium for Credit Spread.',
      entry: cmp, 
      margin: 40000, 
      metrics: [
        { name: 'ADX', value: adxVal.toFixed(1) },
        { name: 'HV', value: `${(vol*100).toFixed(1)}%` }
      ]
    };
  }
  return { isMatch: false };
}

function shortStrangle(data) {
  const { closes, highs, lows, cmp } = data;
  const adxVal = adx(highs, lows, closes);
  const vol = hv(closes, 30);

  if (adxVal < 20 && vol > 0.35) {
    return {
      isMatch: true,
      reason: 'Dead sideways trend (ADX < 20) but massive volatility pricing. Perfect for premium decay.',
      entry: cmp, 
      margin: 120000, 
      metrics: [
        { name: 'ADX', value: adxVal.toFixed(1) },
        { name: 'HV', value: `${(vol*100).toFixed(1)}%` }
      ]
    };
  }
  return { isMatch: false };
}

function ivCrushCondor(data) {
  const { closes, cmp } = data;
  const vol = hv(closes, 30);
  
  const shortVol = hv(closes, 10);
  if (shortVol > vol * 1.5 && shortVol > 0.40) {
    return {
      isMatch: true,
      reason: 'Massive short-term volatility spike detected (likely pending earnings/event). Sell Iron Condor to capture IV crush.',
      entry: cmp, 
      margin: 50000, 
      metrics: [
        { name: 'Short Vol', value: `${(shortVol*100).toFixed(1)}%` },
        { name: 'Base Vol', value: `${(vol*100).toFixed(1)}%` }
      ]
    };
  }
  return { isMatch: false };
}

function csp(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  const e200 = ema(closes, 200);
  const rsiVal = rsi(closes);

  const { closePercent, isRed } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  // Avoid selling puts on days with a massive red candle closing near its absolute low
  const isRejection = !isRed || closePercent >= 0.3; 

  if (cmp > e200 && rsiVal < 45 && isRejection) {
    return {
      isMatch: true,
      reason: 'Fundamentally strong stock (Above 200 EMA) on a short-term oversold dip showing support. Perfect to sell a Cash Secured Put.',
      entry: cmp,
      margin: Math.round(cmp * 500 * 0.20), 
      metrics: [
        { name: 'RSI', value: rsiVal.toFixed(1) },
        { name: 'Trend', value: 'Supported Dip' }
      ]
    };
  }
  return { isMatch: false };
}

function coveredCall(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  const e200 = ema(closes, 200);
  const rsiVal = rsi(closes);

  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  // Wait for the rally to show weakness before selling calls (e.g. red candle or long upper wick)
  const isWeakness = !isGreen || closePercent <= 0.6;

  if (cmp > e200 && rsiVal > 70 && isWeakness) {
    return {
      isMatch: true,
      reason: 'Stock is in a strong uptrend but overbought (RSI > 70) and showing daily weakness. Great time to sell a Covered Call to collect premium.',
      entry: cmp,
      margin: Math.round(cmp * 500), 
      metrics: [
        { name: 'RSI', value: rsiVal.toFixed(1) },
        { name: 'Trend', value: 'Overbought / Weak' }
      ]
    };
  }
  return { isMatch: false };
}
