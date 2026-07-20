import { ema, rsi, adx } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'vcp_down') return vcpBreakdown(data);
  if (strategyId === 'bear_call') return bearCallSpread(data);
  return { isMatch: false };
}

function getCandleAnatomy(high, low, close, open) {
  const range = high - low || 1;
  const closePercent = (close - low) / range;
  const isRed = close < open;
  return { closePercent, isRed };
}

function vcpBreakdown(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  const hlPct = ((highs[n-1] - lows[n-1]) / lows[n-1]) * 100;
  
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const currentVol = volumes[n-1];

  const e200 = ema(closes, 200);
  
  // STRICT FILTER: Check candle structure to avoid Bear Traps
  const { closePercent, isRed } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  // A true breakdown must close in the bottom 25% of its range (no long lower wicks buying the dip)
  const isWeakClose = isRed && closePercent <= 0.25;
  const hasVolume = currentVol > avgVol * 1.5;

  if (hlPct > 4 && cmp < closes[n-2] * 0.96 && hasVolume && cmp < e200 && isWeakClose) {
    return {
      isMatch: true,
      isShort: true,
      reason: 'Tight consolidation snapped downwards on massive volume below the 200 EMA with weak candle close.',
      entry: lows[n-1], 
      risk: cmp * 0.03,
      metrics: [
        { name: 'Drop', value: `${(((cmp / closes[n-2])-1)*100).toFixed(1)}%` },
        { name: 'Vol Surge', value: `${(currentVol/avgVol).toFixed(1)}x` }
      ]
    };
  }
  return { isMatch: false };
}

function bearCallSpread(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  const e200 = ema(closes, 200);
  const rsiVal = rsi(closes);
  const adxVal = adx(highs, lows, closes);
  
  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;

  // STRICT FILTER: Bear call spreads should be initiated when sellers are proving control
  const { closePercent, isRed } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isWeakClose = isRed && closePercent <= 0.4;
  const hasVolume = currentVol > avgVol * 1.1;

  if (cmp < e200 && cmp > e200 * 0.95 && rsiVal < 45 && adxVal > 25 && isWeakClose && hasVolume) {
    return {
      isMatch: true,
      isShort: true,
      reason: 'Bear Call Spread: Trend is solidly down. Good setup to sell Out-of-the-Money Call Spreads above resistance (confirmed by volume).',
      entry: cmp, 
      margin: 40000, 
      metrics: [
        { name: 'RSI', value: rsiVal.toFixed(1) },
        { name: 'ADX', value: adxVal.toFixed(1) }
      ]
    };
  }
  return { isMatch: false };
}
