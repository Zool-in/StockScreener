import { ema, rsi, adx, hv } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'bps') return bullPutSpread(data);
  if (strategyId === 'strangle') return shortStrangle(data);
  if (strategyId === 'iv_crush') return ivCrushCondor(data);
  if (strategyId === 'wheel' || strategyId === 'csp') return wheel(data);
  return { isMatch: false };
}

function bullPutSpread(data) {
  const { closes, highs, lows, cmp } = data;
  const e200 = ema(closes, 200);
  const e50 = ema(closes, 50);
  const adxVal = adx(highs, lows, closes);
  const vol = hv(closes, 30);

  if (cmp > e50 && cmp > e200 && adxVal > 25 && vol > 0.25) {
    return {
      isMatch: true,
      reason: 'Strong verified uptrend (ADX > 25) with high Historical Volatility. Great premium for Credit Spread.',
      margin: 40000, // Roughly 40k INR margin per spread lot
      metrics: [
        { name: 'ADX', value: adxVal },
        { name: 'HV', value: \`\${(vol*100).toFixed(1)}%\` }
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
      margin: 120000, // Naked strangle margin
      metrics: [
        { name: 'ADX', value: adxVal },
        { name: 'HV', value: \`\${(vol*100).toFixed(1)}%\` }
      ]
    };
  }
  return { isMatch: false };
}

function ivCrushCondor(data) {
  const { closes, cmp } = data;
  const vol = hv(closes, 30);
  
  // Proxy for IV crush: Look for extremely unusual short term volatility spikes
  const shortVol = hv(closes, 10);
  if (shortVol > vol * 1.5 && shortVol > 0.40) {
    return {
      isMatch: true,
      reason: 'Massive short-term volatility spike detected (likely pending earnings/event). Sell Iron Condor to capture IV crush.',
      margin: 50000, // Margin for Iron Condor
      metrics: [
        { name: 'Short Vol', value: \`\${(shortVol*100).toFixed(1)}%\` },
        { name: 'Base Vol', value: \`\${(vol*100).toFixed(1)}%\` }
      ]
    };
  }
  return { isMatch: false };
}

function wheel(data) {
  const { closes, cmp } = data;
  const e200 = ema(closes, 200);
  const rsiVal = rsi(closes);

  // Wheel Phase 1 / CSP: Strong stock on a temporary dip
  if (cmp > e200 && rsiVal < 45) {
    return {
      isMatch: true,
      reason: 'Fundamentally strong stock (Above 200 EMA) on a short-term oversold dip. Perfect to sell a CSP to get paid to wait.',
      margin: Math.round(cmp * 500 * 0.20), // Proxy margin approx 20% of contract value
      metrics: [
        { name: 'RSI', value: rsiVal },
        { name: 'Trend', value: 'Intact' }
      ]
    };
  }
  return { isMatch: false };
}
