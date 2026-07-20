import { findOrderBlocks } from '../core/math.js?v=43';

export function run(strategyId, data) {
  if (strategyId === 'smc_bullish') return smcBullish(data);
  if (strategyId === 'smc_bearish') return smcBearish(data);
  return { isMatch: false };
}

function smcBullish(data) {
  const { ohlcv, closes, opens, highs, lows, volumes, cmp } = data;
  const n = ohlcv.length;
  if (n < 50) return { isMatch: false };

  const obs = findOrderBlocks(ohlcv, 5);
  const { bullishOBs, bearishOBs } = obs;

  if (bullishOBs.length === 0) return { isMatch: false };

  // Find the closest unmitigated Bullish OB below current price
  let closestOB = null;
  let minDiff = Infinity;
  for (const ob of bullishOBs) {
    if (cmp >= ob.bottom) { // Price must not have broken the bottom
      const diff = cmp - ob.top;
      if (diff > -50 && diff < minDiff) { 
        minDiff = diff;
        closestOB = ob;
      }
    }
  }

  if (!closestOB) return { isMatch: false };

  const currentLow = lows[n-1];
  const currentClose = closes[n-1];
  const currentOpen = opens[n-1];
  const currentHigh = highs[n-1];
  
  if (currentLow > closestOB.top * 1.01) return { isMatch: false }; 
  if (currentClose < closestOB.bottom) return { isMatch: false }; 

  // STRICT FILTER: Reversal Candle Check & Volume
  const isGreen = currentClose > currentOpen;
  const candleRange = currentHigh - currentLow;
  const closePercent = (currentClose - currentLow) / (candleRange || 1); 

  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;

  // Requires a green candle that closes in the top 40% of its range, AND above average volume
  const isStrongCandle = isGreen && closePercent >= 0.6;
  const isVolumeSupported = currentVol > avgVol * 1.1;

  if (!isStrongCandle || !isVolumeSupported) return { isMatch: false };

  let targetOB = null;
  let targetDiff = Infinity;
  for (const ob of bearishOBs) {
    if (ob.bottom > cmp) {
      const diff = ob.bottom - cmp;
      if (diff < targetDiff) {
        targetDiff = diff;
        targetOB = ob;
      }
    }
  }

  const targetPrice = targetOB ? targetOB.bottom : currentClose * 1.05;
  const stopLoss = closestOB.bottom * 0.99; 
  
  const risk = currentClose - stopLoss;
  const reward = targetPrice - currentClose;
  if (risk > 0 && (reward / risk) < 1.0) return { isMatch: false };

  return {
    isMatch: true,
    score: 95,
    metrics: [
      { label: 'Zone', value: `₹${closestOB.bottom.toFixed(1)} - ₹${closestOB.top.toFixed(1)}`, color: 'text-blue-400' },
      { label: 'Def Volume', value: `${(currentVol/avgVol).toFixed(1)}x`, color: 'text-green-400' },
      { label: 'Target', value: `₹${targetPrice.toFixed(1)}`, color: 'text-green-400' }
    ]
  };
}


function smcBearish(data) {
  const { ohlcv, closes, opens, highs, lows, volumes, cmp } = data;
  const n = ohlcv.length;
  if (n < 50) return { isMatch: false };

  const obs = findOrderBlocks(ohlcv, 5);
  const { bullishOBs, bearishOBs } = obs;

  if (bearishOBs.length === 0) return { isMatch: false };

  let closestOB = null;
  let minDiff = Infinity;
  for (const ob of bearishOBs) {
    if (cmp <= ob.top) { 
      const diff = ob.bottom - cmp;
      if (diff > -50 && diff < minDiff) { 
        minDiff = diff;
        closestOB = ob;
      }
    }
  }

  if (!closestOB) return { isMatch: false };

  const currentHigh = highs[n-1];
  const currentClose = closes[n-1];
  const currentOpen = opens[n-1];
  const currentLow = lows[n-1];
  
  if (currentHigh < closestOB.bottom * 0.99) return { isMatch: false }; 
  if (currentClose > closestOB.top) return { isMatch: false }; 

  // STRICT FILTER: Reversal Candle Check & Volume
  const isRed = currentClose < currentOpen;
  const candleRange = currentHigh - currentLow;
  const closePercent = (currentHigh - currentClose) / (candleRange || 1); 

  const currentVol = volumes[n-1];
  const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20;

  // Requires a red candle that closes in the bottom 40% of its range, AND above average volume
  const isStrongCandle = isRed && closePercent >= 0.6;
  const isVolumeSupported = currentVol > avgVol * 1.1;

  if (!isStrongCandle || !isVolumeSupported) return { isMatch: false };

  let targetOB = null;
  let targetDiff = Infinity;
  for (const ob of bullishOBs) {
    if (ob.top < cmp) {
      const diff = cmp - ob.top;
      if (diff < targetDiff) {
        targetDiff = diff;
        targetOB = ob;
      }
    }
  }

  const targetPrice = targetOB ? targetOB.top : currentClose * 0.95;
  const stopLoss = closestOB.top * 1.01; 
  
  const risk = stopLoss - currentClose;
  const reward = currentClose - targetPrice;
  if (risk > 0 && (reward / risk) < 1.0) return { isMatch: false };

  return {
    isMatch: true,
    score: 95,
    metrics: [
      { label: 'Zone', value: `₹${closestOB.bottom.toFixed(1)} - ₹${closestOB.top.toFixed(1)}`, color: 'text-red-400' },
      { label: 'Def Volume', value: `${(currentVol/avgVol).toFixed(1)}x`, color: 'text-red-400' },
      { label: 'Target', value: `₹${targetPrice.toFixed(1)}`, color: 'text-green-400' }
    ]
  };
}
