export function run(strategyId, data) {
  if (strategyId === 'btst') return btstMomentum(data);
  return { isMatch: false };
}

function btstMomentum(data) {
  const { closes, highs, lows, volumes, cmp } = data;
  
  const high = highs[highs.length - 1];
  const low = lows[lows.length - 1];
  const close = cmp;
  
  if (high === low) return { isMatch: false };
  
  const closingStrength = ((close - low) / (high - low)) * 100;
  
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;
  const currentVol = volumes[volumes.length - 1];
  const volSurge = currentVol > avgVol * 1.2;

  // Delivery percentage tracking (requires meta object)
  const deliv = data.meta && data.meta.delivPer ? data.meta.delivPer : 0;

  if (closingStrength > 90 && volSurge) {
    const risk = cmp * 0.015; // standard BTST stop loss
    return {
      isMatch: true,
      reason: 'Institutional accumulation at the bell. Closing at the absolute high of the day.',
      risk: risk,
      metrics: [
        { name: 'Closing Strength', value: `${closingStrength.toFixed(1)}%` },
        { name: 'Vol vs Avg', value: `${(currentVol/avgVol).toFixed(1)}x` }
      ]
    };
  }

  return { isMatch: false };
}
