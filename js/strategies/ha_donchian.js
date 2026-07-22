// Heikin-Ashi Donchian Channel Trading Strategy
// Based on Brijesh Bhatia's mechanical trend-following system.
// Identifies trend reversals when Heikin-Ashi candle color flips with no shadows after exhaustion,
// trailing the position using the Donchian Channel (lowest low/highest high of last N candles).

export function run(strategyId, data, timeframe = '1d') {
  if (strategyId === 'ha_donchian_bullish') return haDonchianBullish(data, timeframe);
  if (strategyId === 'ha_donchian_bearish') return haDonchianBearish(data, timeframe);
  return { isMatch: false };
}

// Helper to generate Heikin-Ashi candle series
function calculateHeikinAshi(opens, highs, lows, closes) {
  const n = closes.length;
  const haClose = new Array(n);
  const haOpen = new Array(n);
  const haHigh = new Array(n);
  const haLow = new Array(n);

  // Initialize first candle with standard OHLC
  haClose[0] = (opens[0] + highs[0] + lows[0] + closes[0]) / 4;
  haOpen[0] = (opens[0] + closes[0]) / 2;
  haHigh[0] = highs[0];
  haLow[0] = lows[0];

  for (let i = 1; i < n; i++) {
    haClose[i] = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
    haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
    haHigh[i] = Math.max(highs[i], haOpen[i], haClose[i]);
    haLow[i] = Math.min(lows[i], haOpen[i], haClose[i]);
  }

  return { haOpen, haHigh, haLow, haClose };
}

// Bullish Reversal: Color flips to green with NO lower tail after exhaustion (consecutive red candles)
function haDonchianBullish(data, timeframe) {
  const { opens, highs, lows, closes, cmp } = data;
  const n = closes.length;
  
  // Need enough candles to look back for Donchian Channel and Heikin-Ashi calculations
  const minRequired = 15;
  if (n < minRequired) return { isMatch: false };

  const { haOpen, haHigh, haLow, haClose } = calculateHeikinAshi(opens, highs, lows, closes);

  // Reversal Candle (Current Index n-1)
  const isCurrentGreen = haClose[n - 1] > haOpen[n - 1];
  
  // "open = low" condition for strong bullish momentum (no lower tail / flat bottom)
  // Float tolerance of 0.01% to prevent rounding discrepancies
  const tolerance = haOpen[n - 1] * 0.0001; 
  const hasNoLowerTail = Math.abs(haLow[n - 1] - haOpen[n - 1]) <= tolerance;

  // Exhaustion check: at least 3 consecutive red candles prior to current green candle
  let redStreak = 0;
  for (let i = n - 2; i >= n - 5 && i >= 0; i--) {
    if (haClose[i] < haOpen[i]) {
      redStreak++;
    } else {
      break;
    }
  }
  const isExhausted = redStreak >= 3;

  // Calculate 14-period ATR
  let sumTr = 0;
  for (let i = n - 14; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - (closes[i - 1] || closes[i])),
      Math.abs(lows[i] - (closes[i - 1] || closes[i]))
    );
    sumTr += tr;
  }
  const atr = sumTr / 14 || (closes[n - 1] * 0.02);

  // Consolidation filters:
  // 1. Exhaustion Trend Magnitude must drop by at least 1.0 * ATR
  const exhaustionDrop = opens[n - 1 - redStreak] - closes[n - 2];
  const hasSignificantExhaustion = exhaustionDrop >= atr;

  // 2. Reversal Candle Body must be at least 25% of ATR
  const bodySize = haClose[n - 1] - haOpen[n - 1];
  const hasSignificantReversalCandle = bodySize >= atr * 0.25;

  if (isCurrentGreen && hasNoLowerTail && isExhausted && hasSignificantExhaustion && hasSignificantReversalCandle) {
    // Donchian Channel period: 
    // - 5 for weekly/monthly positional setups
    // - 2 for 5m/15m scalping setups (trails the previous candle high/low)
    // - 3 for standard daily/hourly swing trades
    const dcPeriod = ['1wk', '1mo'].includes(timeframe) ? 5 : 
                     ['5m', '15m'].includes(timeframe) ? 2 : 3;
    
    // Initial stop loss is set at the low of the 1st green reversal candle (index n-1)
    const stopLoss = lows[n - 1];
    
    // Ensure risk profile is valid
    const entry = cmp || closes[n - 1];
    const risk = entry - stopLoss;
    
    if (risk > 0) {
      return {
        isMatch: true,
        isShort: false,
        reason: `HA-Donchian: Bullish reversal confirmed. Heikin-Ashi flipped green with a flat bottom (Open = Low) after a significant drop of ${exhaustionDrop.toFixed(1)} (>= 1 ATR) over ${redStreak} red candles. Trail using the ${dcPeriod}-period Donchian Channel lower band.`,
        entry: entry,
        risk: risk,
        metrics: [
          { name: 'Red Streak', value: `${redStreak} candles` },
          { name: 'Streak Drop', value: `₹${exhaustionDrop.toFixed(1)}` },
          { name: 'DC Stop Loss', value: `₹${stopLoss.toFixed(1)} (${dcPeriod}-pd)` },
          { name: 'ATR (14d)', value: `₹${atr.toFixed(1)}` }
        ]
      };
    }
  }

  return { isMatch: false };
}

// Bearish Reversal: Color flips to red with NO upper tail after exhaustion (consecutive green candles)
function haDonchianBearish(data, timeframe) {
  const { opens, highs, lows, closes, cmp } = data;
  const n = closes.length;
  
  const minRequired = 15;
  if (n < minRequired) return { isMatch: false };

  const { haOpen, haHigh, haLow, haClose } = calculateHeikinAshi(opens, highs, lows, closes);

  // Reversal Candle (Current Index n-1)
  const isCurrentRed = haClose[n - 1] < haOpen[n - 1];
  
  // "open = high" condition for strong bearish momentum (no upper tail / flat top)
  const tolerance = haOpen[n - 1] * 0.0001;
  const hasNoUpperTail = Math.abs(haHigh[n - 1] - haOpen[n - 1]) <= tolerance;

  // Exhaustion check: at least 3 consecutive green candles prior to current red candle
  let greenStreak = 0;
  for (let i = n - 2; i >= n - 5 && i >= 0; i--) {
    if (haClose[i] > haOpen[i]) {
      greenStreak++;
    } else {
      break;
    }
  }
  const isExhausted = greenStreak >= 3;

  // Calculate 14-period ATR
  let sumTr = 0;
  for (let i = n - 14; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - (closes[i - 1] || closes[i])),
      Math.abs(lows[i] - (closes[i - 1] || closes[i]))
    );
    sumTr += tr;
  }
  const atr = sumTr / 14 || (closes[n - 1] * 0.02);

  // Consolidation filters:
  // 1. Exhaustion Trend Magnitude must rise by at least 1.0 * ATR
  const exhaustionRise = closes[n - 2] - opens[n - 1 - greenStreak];
  const hasSignificantExhaustion = exhaustionRise >= atr;

  // 2. Reversal Candle Body must be at least 25% of ATR
  const bodySize = haOpen[n - 1] - haClose[n - 1];
  const hasSignificantReversalCandle = bodySize >= atr * 0.25;

  if (isCurrentRed && hasNoUpperTail && isExhausted && hasSignificantExhaustion && hasSignificantReversalCandle) {
    // Donchian Channel period: 
    // - 5 for weekly/monthly positional setups
    // - 2 for 5m/15m scalping setups (trails the previous candle high/low)
    // - 3 for standard daily/hourly swing trades
    const dcPeriod = ['1wk', '1mo'].includes(timeframe) ? 5 : 
                     ['5m', '15m'].includes(timeframe) ? 2 : 3;
    
    // Initial stop loss is set at the high of the 1st red reversal candle (index n-1)
    const stopLoss = highs[n - 1];
    
    // Ensure risk profile is valid
    const entry = cmp || closes[n - 1];
    const risk = stopLoss - entry;
    
    if (risk > 0) {
      return {
        isMatch: true,
        isShort: true,
        reason: `HA-Donchian: Bearish reversal confirmed. Heikin-Ashi flipped red with a flat top (Open = High) after a significant rise of ${exhaustionRise.toFixed(1)} (>= 1 ATR) over ${greenStreak} green candles. Trail using the ${dcPeriod}-period Donchian Channel upper band.`,
        entry: entry,
        risk: risk,
        metrics: [
          { name: 'Green Streak', value: `${greenStreak} candles` },
          { name: 'Streak Rise', value: `₹${exhaustionRise.toFixed(1)}` },
          { name: 'DC Stop Loss', value: `₹${stopLoss.toFixed(1)} (${dcPeriod}-pd)` },
          { name: 'ATR (14d)', value: `₹${atr.toFixed(1)}` }
        ]
      };
    }
  }

  return { isMatch: false };
}
