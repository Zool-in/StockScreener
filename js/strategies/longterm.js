import { rsi } from '../core/math.js';

export function run(strategyId, data) {
  if (strategyId === 'weinstein') return stanWeinstein(data);
  if (strategyId === 'wyckoff') return wyckoffStoppingVolume(data);
  if (strategyId === 'rsi70_monthly') return rsi70Monthly(data);
  return { isMatch: false };
}

function getCandleAnatomy(high, low, close, open) {
  const range = high - low || 1;
  const closePercent = (close - low) / range;
  const isGreen = close > open;
  
  const lowerWick = Math.min(open, close) - low;
  const lowerWickPercent = lowerWick / range;
  
  return { closePercent, isGreen, lowerWickPercent };
}

function stanWeinstein(data) {
  const { opens, closes, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 35) return { isMatch: false };
  
  const sma30 = closes.slice(-30).reduce((a,b)=>a+b,0) / 30;
  const prevSma = closes.slice(-31, -1).reduce((a,b)=>a+b,0) / 30;
  const isFlat = Math.abs(sma30 - prevSma) / prevSma < 0.05;
  
  const avgVol = volumes.slice(-30).reduce((a,b)=>a+b,0) / 30;
  const currentVol = volumes[n-1];
  
  const breakout = cmp > sma30 && closes[n-2] < prevSma;
  const volumeSurge = currentVol > avgVol * 2.0;

  // STRICT FILTER: No massive upper wicks on Stage 2 transition
  const { closePercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isStrongClose = isGreen && closePercent >= 0.6; // Top 40% close

  if (isFlat && breakout && volumeSurge && isStrongClose) {
    return {
      isMatch: true,
      reason: 'Stan Weinstein Stage 2 Markup detected. Price crossing 30-period MA on 200%+ volume with a strong conviction close.',
      entry: cmp, 
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
  const { closes, opens, highs, lows, volumes, cmp } = data;
  const n = closes.length;
  if (n < 50) return { isMatch: false };

  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-50).reduce((a,b)=>a+b,0) / 50;
  
  const isHighVol = currentVol > avgVol * 3.0;
  const isDowntrend = cmp < closes[n-20]; // Overall stock has been dropping

  // STRICT FILTER: Institutional Absorption Check
  // A down day with massive volume must have a long lower wick (min 70% of candle body) indicating absorption
  const { lowerWickPercent, isGreen } = getCandleAnatomy(highs[n-1], lows[n-1], closes[n-1], opens[n-1]);
  const isAbsorbing = lowerWickPercent >= 0.7 || (isGreen && lowerWickPercent >= 0.5);

  if (isDowntrend && isHighVol && isAbsorbing) {
    return {
      isMatch: true,
      reason: 'Downtrend halting on massive relative volume. Long lower wick proves Smart money accumulation absorbed retail panic.',
      entry: cmp, 
      risk: lows[n-1] * 0.98, 
      metrics: [
        { name: 'Vol Anomaly', value: `${(currentVol/avgVol).toFixed(1)}x` },
        { name: 'Price Action', value: 'Absorption Wick' }
      ]
    };
  }
  return { isMatch: false };
}

function rsi70Monthly(data) {
  const { closes, highs, lows, opens, volumes, cmp } = data;
  const n = closes.length;
  if (n < 15) return { isMatch: false };

  const rsiVal = rsi(closes, 14);
  
  // Match stocks with Monthly RSI >= 60 (Highlights both >70 leaders and 60-69 near-breakout candidates)
  if (rsiVal >= 60) {
    const prevRsi = rsi(closes.slice(0, -1), 14);
    const isAbove70 = rsiVal >= 70;
    const isFreshCross = prevRsi < 70 && rsiVal >= 70;
    
    const currentVol = volumes[n - 1];
    const avgVol = (volumes.slice(-12, -1).reduce((a, b) => a + b, 0) / 11) || 1;
    const volRatio = currentVol / avgVol;

    let reasonMsg = '';
    if (isFreshCross) {
      reasonMsg = `Fresh Monthly RSI > 70 Crossover (🚀): Monthly RSI crossed above 70 (${rsiVal.toFixed(1)} vs prev ${prevRsi.toFixed(1)}). Structural multi-bagger momentum ignition!`;
    } else if (isAbove70) {
      reasonMsg = `Monthly RSI Super-Trend 🔥 (${rsiVal.toFixed(1)} >= 70): Stock is in an active power-mode monthly trend expansion regime.`;
    } else {
      reasonMsg = `Monthly RSI Near-Breakout ⚡ (${rsiVal.toFixed(1)} >= 60): High-momentum leader building energy near the 70 breakout zone.`;
    }

    return {
      isMatch: true,
      reason: reasonMsg,
      entry: cmp,
      risk: cmp * 0.05,
      metrics: [
        { name: 'Monthly RSI', value: `${rsiVal.toFixed(1)}` },
        { name: 'Status', value: isAbove70 ? (isFreshCross ? 'Fresh >70 🚀' : 'Active >70 🔥') : 'Near 70 (60-69) ⚡' },
        { name: 'Monthly Vol', value: `${volRatio.toFixed(1)}x` }
      ]
    };
  }

  return { isMatch: false };
}
