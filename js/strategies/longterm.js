export function run(strategyId, data) {
  if (strategyId === 'weinstein') return stanWeinstein(data);
  if (strategyId === 'wyckoff') return wyckoffStoppingVolume(data);
  return { isMatch: false };
}

function stanWeinstein(data) {
  const { closes, volumes, cmp } = data;
  
  // Weekly chart approximations (assuming data is weekly if this strategy is selected)
  // 30-week MA is roughly 150-day EMA if daily data is passed, but we'll assume it's weekly
  // We'll calculate a 30-period Simple Moving Average
  if (closes.length < 35) return { isMatch: false };
  
  const sma30 = closes.slice(-30).reduce((a,b)=>a+b,0) / 30;
  
  // Stage 1 to Stage 2 transition:
  // Price crosses above 30-week MA on massive volume after being flat
  const prevSma = closes.slice(-31, -1).reduce((a,b)=>a+b,0) / 30;
  const isFlat = Math.abs(sma30 - prevSma) / prevSma < 0.05; // MA is flat
  
  const avgVol = volumes.slice(-30).reduce((a,b)=>a+b,0) / 30;
  const currentVol = volumes[volumes.length-1];
  
  const breakout = cmp > sma30 && closes[closes.length-2] < prevSma;
  const volumeSurge = currentVol > avgVol * 2.0;

  if (isFlat && breakout && volumeSurge) {
    return {
      isMatch: true,
      reason: 'Stan Weinstein Stage 2 Markup detected. Price crossing 30-period MA on 200%+ volume.',
      entry: cmp, // Buy the breakout at market
      risk: cmp - sma30,
      metrics: [
        { name: 'MA Breakout', value: `Above ${sma30.toFixed(2)}` },
        { name: 'Vol Surge', value: `${(currentVol/avgVol).toFixed(1)}x` }
      ]
    };
  }
  return { isMatch: false };
}

function wyckoffStoppingVolume(data) {
  const { closes, opens, volumes, cmp } = data;
  if (closes.length < 50) return { isMatch: false };

  // Look for massive volume on a down day where the close is near the open (or higher)
  // indicating smart money bought everything the weak hands sold.
  const currentVol = volumes[volumes.length-1];
  const avgVol = volumes.slice(-50).reduce((a,b)=>a+b,0) / 50;

  const currentOpen = opens[opens.length-1];
  const currentClose = closes[closes.length-1];
  
  // High volume, but price barely dropped or ended as a doji/hammer
  const isHighVol = currentVol > avgVol * 3.0;
  const isStopping = Math.abs(currentClose - currentOpen) / currentOpen < 0.01;
  const isDowntrend = cmp < closes[closes.length-20]; // Overall stock has been dropping

  if (isDowntrend && isHighVol && isStopping) {
    return {
      isMatch: true,
      reason: 'Downtrend halting on massive relative volume. Smart money accumulation suspected.',
      entry: cmp, // Enter at market near the close
      risk: lows[lows.length-1] * 0.98, // Stop below the stopping candle low
      metrics: [
        { name: 'Vol Anomaly', value: `${(currentVol/avgVol).toFixed(1)}x` },
        { name: 'Price Action', value: 'Accumulation Doji' }
      ]
    };
  }
  return { isMatch: false };
}
