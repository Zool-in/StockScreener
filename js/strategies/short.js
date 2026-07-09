import { ema, rsi, adx } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'vcp_down') return vcpBreakdown(data);
  if (strategyId === 'bear_call') return bearCallSpread(data);
  return { isMatch: false };
}

function vcpBreakdown(data) {
  const { closes, highs, lows, volumes, cmp } = data;
  const hlPct = ((highs[highs.length-1] - lows[lows.length-1]) / lows[lows.length-1]) * 100;
  
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const currentVol = volumes[volumes.length-1];

  // A stock that was tight, but breaks DOWN on massive volume
  const e200 = ema(closes, 200);
  
  if (hlPct > 4 && cmp < closes[closes.length-2] * 0.96 && currentVol > avgVol * 1.5 && cmp < e200) {
    return {
      isMatch: true,
      reason: 'Tight consolidation snapped downwards on massive volume below the 200 EMA.',
      risk: cmp * 0.03,
      metrics: [
        { name: 'Drop', value: \`\${(((cmp / closes[closes.length-2])-1)*100).toFixed(1)}%\` },
        { name: 'Vol Surge', value: \`\${(currentVol/avgVol).toFixed(1)}x\` }
      ]
    };
  }
  return { isMatch: false };
}

function bearCallSpread(data) {
  const { closes, highs, lows, cmp } = data;
  const e200 = ema(closes, 200);
  const rsiVal = rsi(closes);
  const adxVal = adx(highs, lows, closes);
  
  // Bear Call Spread: Stock failing at 200 EMA, downtrending, weak RSI
  if (cmp < e200 && cmp > e200 * 0.95 && rsiVal < 45 && adxVal > 25) {
    return {
      isMatch: true,
      reason: 'Failing right at the 200-day moving average resistance in a strong downtrend.',
      risk: cmp * 0.05,
      metrics: [
        { name: 'RSI', value: rsiVal },
        { name: 'ADX', value: adxVal }
      ]
    };
  }
  return { isMatch: false };
}
