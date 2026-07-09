import { bollingerBands, keltnerChannels } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'ttm_orb') return ttmSqueezeORB(data);
  return { isMatch: false };
}

function ttmSqueezeORB(data) {
  const { closes, highs, lows } = data;
  
  // TTM Squeeze logic: Bollinger Bands entirely inside Keltner Channels
  const bb = bollingerBands(closes, 20, 2);
  const kc = keltnerChannels(highs, lows, closes, 20, 1.5);
  
  if (!bb.upper || !kc.upper) return { isMatch: false };

  const isSqueeze = (bb.upper < kc.upper) && (bb.lower > kc.lower);
  
  // ORB logic: For a 15m timeframe, the current candle volume should be surging
  const currentVol = data.volumes[data.volumes.length - 1];
  const avgVol = data.volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const isVolSurge = currentVol > avgVol * 1.5;

  if (isSqueeze && isVolSurge) {
    const risk = data.cmp * 0.01; // 1% stop loss for intraday
    return {
      isMatch: true,
      reason: 'Bollinger Bands inside Keltner Channels (Squeeze) + Volume Surge.',
      entry: highs[highs.length-1], // Trigger is breaking today's high
      risk: risk,
      metrics: [
        { name: 'Avg Vol', value: Math.round(avgVol).toLocaleString() },
        { name: 'Current Vol', value: Math.round(currentVol).toLocaleString() }
      ]
    };
  }

  return { isMatch: false };
}
