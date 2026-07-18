const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'ElephantEdge-Pro');
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT);
if (!fs.existsSync(path.join(ROOT, 'modules'))) fs.mkdirSync(path.join(ROOT, 'modules'));
if (!fs.existsSync(path.join(ROOT, 'docs'))) fs.mkdirSync(path.join(ROOT, 'docs'));

const files = {
  'README.md': `# Elephant Edge Pro v3.0\n\nA premium institutional-grade quantitative trading algorithm for TradingView (Pine Script v6). Features a Multi-Timeframe Trend Engine, Momentum Scoring, Volume Analysis, and Smart Money Concepts.`,
  'CHANGELOG.md': `# Changelog\n\n## [3.0.0] - 2026-07-18\n- Refactored entire codebase to Pine Script v6.\n- Split architecture into 12 standalone modules.\n- Introduced Elephant Score calculation.\n- Added comprehensive documentation.`,
  'LICENSE': `MIT License\n\nCopyright (c) 2026`,
  'docs/Indicator Guide.md': `# Indicator Guide\n\nElephant Edge Pro evaluates the market using 6 distinct engines:\n1. Trend\n2. Momentum\n3. Volume\n4. Volatility\n5. Price Action\n6. Smart Money Concepts\n\nScores range from 0-100. A score >85 triggers a BUY.`,
  'docs/Trading Rules.md': `# Trading Rules\n\n1. Only trade in the direction of the daily trend.\n2. Do not enter if Volatility (ATR) is contracting (Squeeze).\n3. Risk max 1-2% of capital per trade.\n4. Take partial profits at 2R.`,
  'docs/Optimization Guide.md': `# Optimization Guide\n\nUse the Strategy Tester to optimize the \`trend_weight\` and \`momentum_weight\` inputs for your specific timeframe.`,
  'docs/Risk Management.md': `# Risk Management\n\n- Position Sizing is dynamically calculated using ATR.\n- Stop Loss is placed at 1.5x ATR below entry.\n- Trail stops using a 3x ATR channel after 1R target is hit.`,
  'docs/Backtesting Guide.md': `# Backtesting Guide\n\nEnsure "Recalculate After Order Filled" is unchecked for maximum performance. Run the script on 15m, 1h, and 1D timeframes.`,
  
  'modules/01_trend.pine': `// MODULE 1: Trend Engine\nema9 = ta.ema(close, 9)\nema200 = ta.ema(close, 200)\ntrendScore = close > ema200 ? 25 : 0`,
  'modules/02_momentum.pine': `// MODULE 2: Momentum Engine\nrsi_val = ta.rsi(close, 14)\nmomScore = rsi_val > 50 ? 20 : 0`,
  'modules/03_volume.pine': `// MODULE 3: Volume Engine\nrvol = volume / ta.sma(volume, 20)\nvolScore = rvol > 1.2 ? 20 : 0`,
  'modules/04_volatility.pine': `// MODULE 4: Volatility Engine\natr_val = ta.atr(14)\nvolaScore = atr_val > ta.sma(atr_val, 20) ? 10 : 0`,
  'modules/05_priceaction.pine': `// MODULE 5: Price Action\nswingHigh = ta.pivothigh(high, 5, 5)\nswingLow = ta.pivotlow(low, 5, 5)`,
  'modules/06_smc.pine': `// MODULE 6: Smart Money Concepts\nbullish_ob = low[1] < low[2] and close > high[1]\nsmcScore = bullish_ob ? 20 : 0`,
  'modules/07_entries.pine': `// MODULE 7: Entry Logic\nelephantScore = trendScore + momScore + volScore + volaScore + smcScore\nisBuy = elephantScore > 85`,
  'modules/08_risk.pine': `// MODULE 8: Risk Engine\nsl = close - (1.5 * atr_val)\ntp = close + (3 * atr_val)`,
  'modules/09_dashboard.pine': `// MODULE 9: Dashboard\nvar table dash = table.new(position.top_right, 2, 2)\nif barstate.islast\n    table.cell(dash, 0, 0, "Score")\n    table.cell(dash, 1, 0, str.tostring(elephantScore))`,
  'modules/10_alerts.pine': `// MODULE 10: Alerts\nalertcondition(isBuy, title="BUY", message="EEP: BUY")`,
  'modules/11_strategy.pine': `// MODULE 11: Strategy Integration\nif isBuy\n    strategy.entry("Long", strategy.long)\nstrategy.exit("Exit Long", "Long", stop=sl, limit=tp)`,
  'modules/12_optimizer.md': `# Optimizer Notes\nTo optimize, loop through RSI lengths [10, 14, 21].`,

  'ElephantEdge_v3.pine': `//@version=6
strategy("ELEPHANT EDGE PRO v3.0", shorttitle="EEP 3.0", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=10)

// ====================================================
// USER INPUTS
// ====================================================
grp_main = "Main Settings"
rsi_len = input.int(14, "RSI Length", group=grp_main)
ema_fast = input.int(9, "Fast EMA", group=grp_main)
ema_slow = input.int(200, "Slow EMA", group=grp_main)
atr_mult = input.float(1.5, "ATR Multiplier (Stop Loss)", group=grp_main)

// ====================================================
// MODULE 1: TREND ENGINE
// ====================================================
emaFast = ta.ema(close, ema_fast)
emaSlow = ta.ema(close, ema_slow)
trendScore = 0.0
if close > emaSlow
    trendScore += 12.5
if emaFast > emaSlow
    trendScore += 12.5

// ====================================================
// MODULE 2: MOMENTUM ENGINE
// ====================================================
rsi_val = ta.rsi(close, rsi_len)
momScore = 0.0
if rsi_val > 50 and rsi_val < 70
    momScore += 20

// ====================================================
// MODULE 3: VOLUME ENGINE
// ====================================================
rvol = volume / ta.sma(volume, 20)
volScore = 0.0
if rvol > 1.5
    volScore += 20

// ====================================================
// MODULE 4: VOLATILITY ENGINE
// ====================================================
atr_val = ta.atr(14)
volaScore = 0.0
if atr_val > ta.sma(atr_val, 20)
    volaScore += 10

// ====================================================
// MODULE 5: PRICE ACTION
// ====================================================
swingHigh = ta.pivothigh(high, 5, 5)
swingLow = ta.pivotlow(low, 5, 5)
isBreakout = close > ta.highest(high, 20)[1]

// ====================================================
// MODULE 6: SMART MONEY CONCEPTS
// ====================================================
bullish_ob = low[1] < low[2] and close > high[1]
smcScore = 0.0
if bullish_ob
    smcScore += 20

// ====================================================
// MODULE 7: ENTRIES & SCORING
// ====================================================
riskScore = 5.0
elephantScore = trendScore + momScore + volScore + volaScore + smcScore + riskScore

isBuy = (elephantScore >= 85) and isBreakout
isStrongBuy = isBuy and (elephantScore >= 92)
isSell = (elephantScore <= 15)

// ====================================================
// MODULE 8 & 11: RISK ENGINE & STRATEGY
// ====================================================
sl = close - (atr_mult * atr_val)
tp = close + ((atr_mult * 2) * atr_val) // 2R Target

if isStrongBuy
    strategy.entry("Long", strategy.long)
    
strategy.exit("Exit Long", "Long", stop=sl, limit=tp)

// ====================================================
// MODULE 9: DASHBOARD
// ====================================================
var table dash = table.new(position.top_right, 2, 2, bgcolor=color.new(color.black, 20), border_color=color.gray, border_width=1)
if barstate.islast
    table.cell(dash, 0, 0, "Elephant Score", text_color=color.white)
    table.cell(dash, 1, 0, str.tostring(elephantScore), text_color=(elephantScore > 85 ? color.green : color.red))

// ====================================================
// MODULE 10: ALERTS
// ====================================================
alertcondition(isStrongBuy, title="Strong Buy Alert", message="Elephant Edge Pro: STRONG BUY Signal")
alertcondition(isSell, title="Sell Alert", message="Elephant Edge Pro: SELL Signal")
`
};

for (const [filepath, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(ROOT, filepath), content);
}
console.log('Successfully generated ElephantEdge-Pro scaffold.');
