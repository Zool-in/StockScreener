import { emaSeries, rsiSeries, t3Series } from '../core/math.js';

export function run(strategyId, data) {
  const { closes, cmp } = data;
  const n = closes.length;
  if (n < 60) return { isMatch: false }; // Requires sufficient bars for nested EMAs

  // Calculate Short Term Xtrender
  const ema5 = emaSeries(closes, 5);
  const ema20 = emaSeries(closes, 20);
  const diff = ema5.map((v, i) => v - ema20[i]);
  const rsiDiff = rsiSeries(diff, 15);
  const shortTermXtrender = rsiDiff.map(v => v - 50);

  // Calculate Tillson T3 of Short Term Xtrender
  const t3Line = t3Series(shortTermXtrender, 5);

  const curT3 = t3Line[n - 1];
  const prevT3 = t3Line[n - 2];
  const prevT3_2 = t3Line[n - 3];

  if (strategyId === 'xtrender_bullish') {
    // Bullish Trigger: Pivot low (turn up) below 0 line
    const isPivotLow = curT3 > prevT3 && prevT3 < prevT3_2;
    const isBelowZero = prevT3 < 0;

    if (isPivotLow && isBelowZero) {
      return {
        isMatch: true,
        reason: `B-Xtrender Bullish (🟢): Tillson T3 line turned UP below the 0 level (Pivot: ${prevT3.toFixed(1)}). Reversal momentum active.`,
        entry: cmp,
        risk: cmp * 0.02,
        metrics: [
          { name: 'T3 Value', value: curT3.toFixed(1) },
          { name: 'Pivot Low', value: prevT3.toFixed(1) }
        ]
      };
    }
  }

  if (strategyId === 'xtrender_bearish') {
    // Bearish Trigger: Pivot high (turn down) above 0 line
    const isPivotHigh = curT3 < prevT3 && prevT3 > prevT3_2;
    const isAboveZero = prevT3 > 0;

    if (isPivotHigh && isAboveZero) {
      return {
        isMatch: true,
        isShort: true,
        reason: `B-Xtrender Bearish (🔴): Tillson T3 line turned DOWN above the 0 level (Pivot: ${prevT3.toFixed(1)}). Downside momentum active.`,
        entry: cmp,
        risk: cmp * 0.02,
        metrics: [
          { name: 'T3 Value', value: curT3.toFixed(1) },
          { name: 'Pivot High', value: prevT3.toFixed(1) }
        ]
      };
    }
  }

  return { isMatch: false };
}
