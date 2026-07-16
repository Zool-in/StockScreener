import * as swingStrats from '../strategies/swing.js?v=6';
import * as intradayStrats from '../strategies/intraday.js?v=6';
import * as optionStrats from '../strategies/options.js?v=6';
import * as btstStrats from '../strategies/btst.js?v=6';
import * as longTermStrats from '../strategies/longterm.js?v=6';
import * as shortStrats from '../strategies/short.js?v=6';
import * as hmStrats from '../strategies/hm.js?v=1';

function runStrategy(strategyId, data) {
  if (['ttm_orb'].includes(strategyId)) return intradayStrats.run(strategyId, data);
  if (['minervini', 'darvas', 'rs', 'crsi', 'xmomentum'].includes(strategyId)) return swingStrats.run(strategyId, data);
  if (['bps', 'strangle', 'iv_crush', 'csp', 'cc', 'wheel'].includes(strategyId)) return optionStrats.run(strategyId, data);
  if (['btst'].includes(strategyId)) return btstStrats.run(strategyId, data);
  if (['weinstein', 'wyckoff'].includes(strategyId)) return longTermStrats.run(strategyId, data);
  if (['vcp_down', 'bear_call'].includes(strategyId)) return shortStrats.run(strategyId, data);
  if (strategyId.startsWith('hm_')) return hmStrats.run(strategyId, data);
  return { isMatch: false };
}

export function runBacktest(strategyId, data, targetPct, slPct) {
  const n = data.closes.length;
  // Use a minimum bar limit that supports long-term strategies, but start checking ASAP
  const minBars = 50; 
  
  const trades = [];
  let openTrade = null;

  for (let i = minBars; i < n; i++) {
    const currentHigh = data.highs[i];
    const currentLow = data.lows[i];
    const currentClose = data.closes[i];
    const currentDate = data.ts[i];

    // 1. Manage existing open trade
    if (openTrade) {
      // Check Stop Loss hit
      if (currentLow <= openTrade.slPrice) {
        openTrade.exitPrice = openTrade.slPrice;
        openTrade.exitDate = currentDate;
        openTrade.pnlPct = -slPct;
        openTrade.result = 'LOSS';
        openTrade.daysHeld = i - openTrade.entryIndex;
        trades.push(openTrade);
        openTrade = null;
      } 
      // Check Target hit
      else if (currentHigh >= openTrade.tpPrice) {
        openTrade.exitPrice = openTrade.tpPrice;
        openTrade.exitDate = currentDate;
        openTrade.pnlPct = targetPct;
        openTrade.result = 'WIN';
        openTrade.daysHeld = i - openTrade.entryIndex;
        trades.push(openTrade);
        openTrade = null;
      }
      
      // If trade is still open, we don't open new ones in this simple backtester
      continue;
    }

    // 2. Check for new entry
    const slicedData = {
      opens: data.opens.slice(0, i + 1),
      highs: data.highs.slice(0, i + 1),
      lows: data.lows.slice(0, i + 1),
      closes: data.closes.slice(0, i + 1),
      volumes: data.volumes.slice(0, i + 1),
      ts: data.ts.slice(0, i + 1),
      cmp: currentClose
    };

    const res = runStrategy(strategyId, slicedData);
    if (res && res.isMatch) {
      // For short strategies, the SL is higher than entry and TP is lower than entry
      const isShort = ['vcp_down', 'bear_call', 'hm_bearish'].includes(strategyId);
      
      let slPrice, tpPrice;
      if (isShort) {
        slPrice = currentClose * (1 + (slPct / 100));
        tpPrice = currentClose * (1 - (targetPct / 100));
      } else {
        slPrice = currentClose * (1 - (slPct / 100));
        tpPrice = currentClose * (1 + (targetPct / 100));
      }

      openTrade = {
        entryDate: currentDate,
        entryIndex: i,
        entryPrice: currentClose,
        slPrice: slPrice,
        tpPrice: tpPrice,
        isShort: isShort
      };
    }
  }

  // Calculate metrics
  let wins = 0;
  let losses = 0;
  let totalReturn = 0;
  
  let peakReturn = 0;
  let maxDrawdown = 0;
  let equityCurve = [];
  
  trades.forEach(t => {
    if (t.result === 'WIN') wins++;
    if (t.result === 'LOSS') losses++;
    totalReturn += t.pnlPct;
    
    if (totalReturn > peakReturn) peakReturn = totalReturn;
    const drawdown = peakReturn - totalReturn;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    equityCurve.push({ time: t.exitDate, value: parseFloat(totalReturn.toFixed(2)) });
  });

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;

  return {
    trades,
    totalTrades,
    winRate,
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    equityCurve,
    wins,
    losses,
    openTrade,
    startDate: data.ts[minBars] ? new Date(data.ts[minBars] * 1000).toLocaleDateString() : 'Unknown',
    endDate: data.ts[n - 1] ? new Date(data.ts[n - 1] * 1000).toLocaleDateString() : 'Unknown'
  };
}
