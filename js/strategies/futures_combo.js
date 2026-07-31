import { smaSeries, rsiSeries, vwapSeries } from '../core/math.js';

export function run(strategyId, data, tuner = null) {
  if (strategyId === 'futures_combo') return runFuturesCombo(data);
  return { isMatch: false };
}

function runFuturesCombo(data) {
  // data parameter is expected to be an object with both daily and hourly datasets
  // { daily: dData, hourly: hData }
  const { daily, hourly } = data;
  if (!daily || !hourly) return { isMatch: false };

  const dCloses = daily.closes;
  const dOpens = daily.opens;
  const dHighs = daily.highs;
  const dLows = daily.lows;
  const dVolumes = daily.volumes;
  const dTs = daily.ts;
  const nd = dCloses.length;

  const hCloses = hourly.closes;
  const hOpens = hourly.opens;
  const hHighs = hourly.highs;
  const hLows = hourly.lows;
  const hVolumes = hourly.volumes;
  const hTs = hourly.ts;
  const nh = hCloses.length;

  // We need at least 30 daily bars and 30 hourly bars to compute indicators safely
  if (nd < 30 || nh < 30) return { isMatch: false };

  // Calculate indicators for Daily
  const dSma20 = smaSeries(dCloses, 20);
  const dRsi14 = rsiSeries(dCloses, 14);

  // Calculate indicators for Hourly
  const hSma20 = smaSeries(hCloses, 20);
  const hOpensSma20 = smaSeries(hOpens, 20);
  const hRsi14 = rsiSeries(hCloses, 14);
  const hVwap = vwapSeries(hTs, hHighs, hLows, hCloses, hVolumes);

  // Evaluate Daily criteria
  const condD1 = dCloses[nd - 1] > dSma20[nd - 1]; // Daily Close > Daily SMA(20)
  const condD2 = dCloses[nd - 2] < dSma20[nd - 2]; // 1 day ago Close < 1 day ago SMA(20)
  const condD3 = dCloses[nd - 1] > dHighs[nd - 2];  // Daily Close > 1 day ago High
  const condD4 = dCloses[nd - 1] > dHighs[nd - 3];  // Daily Close > 2 days ago High
  const condD5 = dCloses[nd - 1] > dHighs[nd - 4];  // Daily Close > 3 days ago High
  const condD6 = dCloses[nd - 1] > dHighs[nd - 5];  // Daily Close > 4 days ago High
  const condD7 = dCloses[nd - 1] > dHighs[nd - 6];  // Daily Close > 5 days ago High
  const condD8 = dCloses[nd - 2] < dOpens[nd - 2];  // 1 day ago Close < 1 day ago Open
  const condD9 = dCloses[nd - 3] < dSma20[nd - 3]; // 2 days ago Close < 2 days ago SMA(20)
  const condD10 = dCloses[nd - 4] < dSma20[nd - 4]; // 3 days ago Close < 3 days ago SMA(20)
  const condD22 = dCloses[nd - 1] > 50;             // Daily Close > 50
  const condD23 = dRsi14[nd - 1] > 60;              // Daily RSI(14) > 60

  const dailyPassed = condD1 && condD2 && condD3 && condD4 && condD5 && condD6 && condD7 && 
                      condD8 && condD9 && condD10 && condD22 && condD23;

  if (!dailyPassed) return { isMatch: false };

  // Evaluate Hourly criteria
  const condH11 = hCloses[nh - 1] > hSma20[nh - 1];        // [0] 1 hour Close > [0] 1 hour SMA(20)
  const condH12 = hOpens[nh - 1] < hOpensSma20[nh - 1];   // [0] 1 hour Open < [0] 1 hour SMA(Open, 20)
  const condH13 = hCloses[nh - 1] > hHighs[nh - 2];        // [0] 1 hour Close > [-1] 1 hour High
  const condH14 = hCloses[nh - 1] > hHighs[nh - 3];        // [0] 1 hour Close > [-2] 1 hour High
  const condH15 = hCloses[nh - 1] > hHighs[nh - 4];        // [0] 1 hour Close > [-3] 1 hour High
  const condH16 = hCloses[nh - 1] > hHighs[nh - 5];        // [0] 1 hour Close > [-4] 1 hour High
  const condH17 = hCloses[nh - 1] > hHighs[nh - 6];        // [0] 1 hour Close > [-5] 1 hour High
  const condH18 = hCloses[nh - 2] < hOpens[nh - 2];        // [-1] 1 hour Close < [-1] 1 hour Open
  const condH19 = hCloses[nh - 2] < hLows[nh - 3];         // [-1] 1 hour Close < [-2] 1 hour Low
  const condH20 = hCloses[nh - 3] < hSma20[nh - 3];        // [-2] 1 hour Close < [-2] 1 hour SMA(20)
  const condH21 = hCloses[nh - 1] > hVwap[nh - 1];         // [0] 1 hour Close > [0] 1 hour VWAP
  const condH24 = hRsi14[nh - 1] > 60;                     // [0] 1 hour RSI(14) > 60

  const hourlyPassed = condH11 && condH12 && condH13 && condH14 && condH15 && condH16 && condH17 && 
                       condH18 && condH19 && condH20 && condH21 && condH24;

  if (!hourlyPassed) return { isMatch: false };

  const entry = dCloses[nd - 1];
  const lowestLow5Days = Math.min(...dLows.slice(-5));
  const stop = lowestLow5Days < entry ? lowestLow5Days : entry * 0.95;
  const t1 = entry + 2 * (entry - stop);

  return {
    isMatch: true,
    score: 95,
    reason: 'Explosive Momentum Confluence: All 24 criteria for the Daily & 1-Hour breakout are fully met.',
    entry,
    stop,
    t1,
    metrics: [
      { name: 'Daily RSI', value: dRsi14[nd - 1].toFixed(1) },
      { name: '1H RSI', value: hRsi14[nh - 1].toFixed(1) },
      { name: '1H Close vs VWAP', value: `+${((hCloses[nh - 1] - hVwap[nh - 1]) / hVwap[nh - 1] * 100).toFixed(2)}%` }
    ]
  };
}
