// ─── Main App Entry Point ───────────────────────────────────────────────────
import { AppState } from '../core/state.js?v=6';
import { fetchOHLCV } from '../core/api.js?v=7';
import { ema, rsi, adx, macd, cci } from '../core/math.js?v=7';
import { runBacktest } from '../core/backtest.js?v=4';
import { openStrategyTester } from './backtester_ui.js?v=1';

// Strategy Modules (We will create these next)
import * as swingStrats from '../strategies/swing.js?v=6';
import * as intradayStrats from '../strategies/intraday.js?v=6';
import * as optionStrats from '../strategies/options.js?v=6';
import * as btstStrats from '../strategies/btst.js?v=6';
import * as longTermStrats from '../strategies/longterm.js?v=6';
import * as shortStrats from '../strategies/short.js?v=6';
import * as hmStrats from '../strategies/hm.js?v=1';
import * as smcStrats from '../strategies/smc.js?v=1';
import * as haDonchianStrats from '../strategies/ha_donchian.js?v=1';
import { renderOptionCards } from './options_render.js?v=1';
import { scriptLibrary } from '../data/scripts.js';
import { initAlerts } from './alerts.js?v=1';

const DOM = {
  tickerInput: document.getElementById('tickerInput'),
  universePills: document.getElementById('universePills'),
  customTickerWrapper: document.getElementById('customTickerWrapper'),
  strategyPills: document.getElementById('strategyPills'),
  timeframePills: document.getElementById('timeframePills'),
  capitalInput: document.getElementById('capitalInput'),
  scanBtn: document.getElementById('scanBtn'),
  resultsArea: document.getElementById('resultsArea'),
  progressArea: document.getElementById('progressArea'),
  progressText: document.getElementById('progressText'),
  progressPercent: document.getElementById('progressPercent'),
  progressBar: document.getElementById('progressBar'),
  lookbackInput: document.getElementById('lookbackInput'),
  lookbackWrapper: document.getElementById('lookbackWrapper'),
  progressTimer: document.getElementById('progressTimer'),
};

function renderScripts() {
  const tbody = document.getElementById('scriptsTableBody');
  if (!tbody) return;

  tbody.innerHTML = scriptLibrary.map(s => `
    <tr>
      <td style="font-weight: 500; color: var(--text-main);">${s.name}</td>
      <td><span class="badge badge-muted">${s.platform}</span></td>
      <td><span class="badge badge-green">${s.type}</span></td>
      <td style="color: var(--text-muted); max-width: 300px;">${s.description}</td>
      <td style="text-align: right;">
        <button class="btn btn-outline" style="padding: 4px 12px; font-size: 12px;" onclick="window.copyScript('${s.id}')">Copy Code</button>
      </td>
    </tr>
  `).join('');
}

window.copyScript = (id) => {
  const script = scriptLibrary.find(s => s.id === id);
  if (script && script.code) {
    navigator.clipboard.writeText(script.code).then(() => {
      alert(script.name + " copied to clipboard!");
    }).catch(err => console.error("Failed to copy", err));
  }
};

const STRATEGY_INFO = {
  ttm_orb: {
    name: 'TTM Squeeze + ORB',
    desc: 'Combines the TTM Squeeze (Bollinger Bands narrowing inside Keltner Channels indicating low volatility) with an Opening Range Breakout (ORB) on surging volume. It looks for explosive moves out of tight consolidation.',
    example: '<img src="/assets/ttm_orb_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Breakout of current High<br><strong>Stop:</strong> 1% below entry<br><strong>Target:</strong> High momentum intraday run<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., ITC has been trading flat between ₹400-₹405 for 2 weeks (Squeeze). Today at 9:30 AM, it breaks ₹406 on 3x normal volume (ORB).</span>'
  },
  intraday_retest: {
    name: 'SMC Intraday Sweep & Retest',
    desc: 'An Intraday Smart Money Concepts (SMC) strategy. It identifies when price sweeps external liquidity (a recent pivot high), and then pulls back to perfectly retest that same level (internal liquidity) before bouncing higher.',
    example: '<img src="/assets/smc_sweep_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> On the retest of the Pivot High<br><strong>Stop:</strong> 0.5% below entry<br><strong>Target:</strong> New highs above the sweep<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> Institutional players sweep breakout traders\' stops at the swing high, wait for price to drop to internal liquidity, and then initiate the real markup.</span>'
  },
  btst: {
    name: 'BTST Momentum',
    desc: 'Buy Today, Sell Tomorrow (BTST). Looks for stocks closing at the absolute high of the day on surging volume. This indicates institutional accumulation at the closing bell, which often gaps up the next morning.',
    example: '<img src="/assets/btst_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy at Market Close<br><strong>Stop:</strong> 1.5% below entry<br><strong>Target:</strong> Sell next morning on gap up<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., At 3:25 PM, TATA MOTORS surges to close at the absolute high of the day (₹1050) on massive volume. Buy now to sell on the likely gap-up tomorrow at 9:15 AM.</span>'
  },
  crsi: {
    name: 'Connors RSI',
    desc: 'A mean-reversion strategy that looks for statistically oversold conditions in a long-term uptrend. It uses a 3-period RSI and streak counting to find "rubber band" setups that are stretched too far down.',
    example: '<img src="/assets/crsi_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy on the close<br><strong>Stop:</strong> 4% below entry<br><strong>Target:</strong> Sell after 2-4 day snapback bounce<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., L&T is in a long-term uptrend but drops 3 days in a row due to market panic, pushing its 3-period RSI below 10. You buy the dip expecting a sharp bounce.</span>'
  },
  minervini: {
    name: 'Minervini VCP',
    desc: 'Volatility Contraction Pattern. Looks for stocks in a Stage 2 uptrend (above 150 & 200 EMA) that are consolidating in a tight coil near 52-week highs, with volume drying up dramatically.',
    example: '<img src="/assets/vcp_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Breakout of current tight range high<br><strong>Stop:</strong> 5% risk<br><strong>Target:</strong> Multi-week swing trade<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., HAL rallied 50%, then consolidated for 6 weeks. The swings get tighter (15% drop, then 8%, then 3%), and volume disappears. You buy the breakout of the 3% tight range.</span>'
  },
  darvas: {
    name: 'Darvas Box',
    desc: 'Identifies stocks that have been trading in a tight horizontal range (< 15%) for multiple months, and are suddenly breaking out of the "Box" top on massive volume.',
    example: '<img src="/assets/darvas_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Breakout of Box Top<br><strong>Stop:</strong> Right below the Box Top line<br><strong>Target:</strong> Ride the trend until a new box forms<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., RELIANCE bounces between ₹2300 and ₹2500 for 4 months (The Box). Today, it rips above ₹2500 on huge volume. You buy the breakout.</span>'
  },
  xmomentum: {
    name: 'Fresh Momentum Breakout',
    desc: 'Identifies explosive momentum right out of a tight coil. It requires the 21 and 50 EMAs to be tightly pinched (within 4%) and a tight 20-day price range. When MACD, RSI, and CCI turn extremely bullish on massive volume, it flags the start of the breakout, while strictly filtering out stocks that have already run away.',
    example: '<img src="/assets/xmomentum_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy breakout above 20-day high<br><strong>Stop:</strong> 4% below entry<br><strong>Target:</strong> Ride the trend until RSI drops below 50<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., TATA MOTORS tightens into a narrow range where its 21 and 50 EMAs converge. Suddenly it explodes above its 20-day high on 2x volume. You buy the explosive breakout early, rather than chasing it later.</span>'
  },
  rs: {
    name: 'Relative Strength',
    desc: 'Focuses on stocks showing extreme internal momentum and ignoring market weakness. Looks for ADX > 30 and RSI > 60 in a strong established trend.',
    example: '<img src="/assets/rs_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy breakout<br><strong>Stop:</strong> 5% risk<br><strong>Target:</strong> Ride the runaway trend<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., NIFTY is down 2% today, but ZOMATO is up 4% making new 52-week highs with an ADX of 35. You buy the strength because it is ignoring market gravity.</span>'
  },
  vcp_down: {
    name: 'VCP Breakdown',
    desc: 'The bearish inverse of VCP. Looks for tight consolidation below the 200 EMA that suddenly snaps downwards on massive volume.',
    example: '<img src="/assets/vcp_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1); filter: hue-rotate(180deg) invert(1);"><strong>Entry:</strong> Breakdown of current low<br><strong>Stop:</strong> 3% risk<br><strong>Target:</strong> Heavy drop acceleration<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., WIPRO is in a long downtrend below its 200 EMA. It consolidates tightly for 3 weeks, then suddenly breaks the support level on high volume. You short the breakdown.</span>'
  },
  bear_call: {
    name: 'Bear Call Spread',
    desc: 'An options credit spread strategy. Identifies stocks failing at major resistance (200 EMA) with weak RSI and strong downtrend ADX.',
    example: '<strong>Action:</strong> Sell Call slightly above 200 EMA, Buy further OTM Call for protection.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., INFY is in a downtrend and rallies up to its 200 EMA (₹1500) but stalls. You sell the 1520 Call and buy the 1540 Call, betting it won\'t cross 1500.</span>'
  },
  bps: {
    name: 'Bull Put Spread',
    desc: 'An options credit spread strategy. Identifies stocks in a strong, verified uptrend with high Historical Volatility, creating rich premium for selling puts below support.',
    example: '<strong>Action:</strong> Sell Put below 50 EMA, Buy further OTM Put for protection.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., HDFC BANK is in a strong uptrend (₹1600). You sell the 1500 Put and buy the 1480 Put to collect premium, betting it stays above ₹1500.</span>'
  },
  strangle: {
    name: 'Short Strangle',
    desc: 'An options premium decay strategy. Looks for "dead" sideways stocks (ADX < 20) that are inexplicably pricing in massive historical volatility (HV > 35%).',
    example: '<strong>Action:</strong> Sell OTM Call and OTM Put to capture IV crush.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., ASIAN PAINTS has been stuck at ₹3000 for months, but options premiums are extremely high. You sell the 3200 Call and 2800 Put, betting it stays flat.</span>'
  },
  iv_crush: {
    name: 'Earnings IV Crush',
    desc: 'Looks for extremely unusual short-term volatility spikes (often before earnings). Sells an Iron Condor to capture the rapid deflation of implied volatility after the event.',
    example: '<strong>Action:</strong> Sell Iron Condor.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., TCS reports earnings tomorrow. Implied Volatility (IV) spikes to 60%. You sell an Iron Condor. After earnings, IV crashes to 20% and the premium collapses for a quick profit.</span>'
  },
  csp: {
    name: 'Cash Secured Put',
    desc: 'Sells put options on fundamentally strong stocks (above 200 EMA) that are experiencing a short-term oversold dip (RSI < 45). You get paid to wait to buy a great stock at a discount.',
    example: '<strong>Action:</strong> Sell ATM or slightly OTM Put.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., ICICI BANK is a great long-term hold but temporarily drops to ₹1050. You want to buy it, but cheaper. You sell 1 lot of the 1000 Put and collect a ₹20 premium per share upfront. If it stays above 1000, you keep the premium as pure profit. If it drops below 1000, you are assigned and buy the shares at ₹1000 (making your effective cost basis only ₹980!)</span>'
  },
  cc: {
    name: 'Covered Call',
    desc: 'For stocks you already own. Identifies when a strong stock becomes temporarily overbought (RSI > 70). A great time to sell calls against your shares to collect premium.',
    example: '<strong>Action:</strong> Sell short-term OTM Call.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., You own 500 shares of SBI. It suddenly rockets to ₹850 (RSI 80) and looks exhausted. You sell the 900 Call, collecting premium while keeping your shares.</span>'
  },
  hm_bottom: {
    name: 'Hilega Milega: Bottom Catch',
    desc: 'Catches early upside reversals when the RSI and 3-EMA cross back above the 21-VWMA from an oversold condition.',
    example: '<img src="/assets/hm_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Action:</strong> Buy early reversal.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., The stock has been beaten down (RSI < 50), but momentum suddenly shifts. The RSI and EMA cross above the VWMA volume line. Buy early before the trend becomes obvious.</span>'
  },
  hm_top: {
    name: 'Hilega Milega: Top Catch',
    desc: 'Catches early downside reversals when the RSI and 3-EMA cross below the 21-VWMA from an overbought condition.',
    example: '<img src="/assets/hm_top_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Action:</strong> Short or Buy Puts.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., The stock is over-extended (RSI > 50), but momentum dies. The RSI and EMA cross below the VWMA volume line, indicating a top.</span>'
  },
  hm_bullish: {
    name: 'Hilega Milega: Bullish Trend',
    desc: 'Identifies strong upward momentum where the RSI > 50, and lines are stacked perfectly: RSI > 3-EMA > 21-VWMA.',
    example: '<img src="/assets/hm_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Action:</strong> Buy breakout/trend continuation.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., Volume and price are pushing higher. The green line is above the blue, which is above the red, confirming a very safe and strong uptrend.</span>'
  },
  hm_bearish: {
    name: 'Hilega Milega: Bearish Breakdown',
    desc: 'Identifies strong downward momentum where the RSI < 50, and lines are stacked perfectly for a drop: 21-VWMA > 3-EMA > RSI.',
    example: '<img src="/assets/hm_bearish_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Action:</strong> Short or Buy Puts.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., Volume is accelerating to the downside. The red volume line sits heavily on top of the blue and green lines, suppressing price.</span>'
  },
  hm_chop: {
    name: 'Hilega Milega: Consolidation',
    desc: 'Identifies when the RSI, EMA, and VWMA are tangled together tightly near the 50 centerline, indicating no clear trend (Chop).',
    example: '<img src="/assets/hm_chop_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Action:</strong> Avoid or watch for a squeeze breakout.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., The stock is bouncing sideways. The indicators are flat-lining on top of each other. Do not trade this until it breaks out into a trend.</span>'
  },
  weinstein: {
    name: 'Stan Weinstein Stage 2',
    desc: 'A classic long-term strategy. Looks for a stock breaking out of a flat Stage 1 base, crossing its 30-period MA on massive (200%+) volume into a Stage 2 markup.',
    example: '<img src="/assets/weinstein_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy at market<br><strong>Stop:</strong> Below the 30-period MA<br><strong>Target:</strong> Multi-month / multi-year hold<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., SUZLON did nothing for 2 years (Stage 1 base). Suddenly, it crosses its 30-week Moving Average on record volume. You buy and hold for a multi-year Stage 2 uptrend.</span>'
  },
  wyckoff: {
    name: 'Wyckoff Stopping Vol',
    desc: 'Identifies institutional accumulation. Looks for a massive volume spike during a downtrend where the price refuses to drop further (e.g. Doji or Hammer), indicating smart money is absorbing all selling pressure.',
    example: '<img src="/assets/wyckoff_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy near close<br><strong>Stop:</strong> Below the stopping candle low<br><strong>Target:</strong> Reversal swing trade<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., PAYTM is crashing for weeks. Today, volume is 5x normal, but the price forms a perfect Doji (it stops going down). This is "Stopping Volume"—institutions are quietly buying the panic.</span>'
  },
  smc_bullish: {
    name: 'SMC Bullish Bounce',
    desc: 'Smart Money Concepts. Price dips into an unmitigated Bullish Order Block (Support) and prints a bullish reversal candle.',
    example: '<img src="/assets/smc_bullish_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy near close<br><strong>Stop:</strong> Below the Order Block<br><strong>Target:</strong> Nearest Bearish Order Block<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> Institutions accumulated at a certain price level previously, creating a Bullish OB. Price returns to retest this zone and finds heavy buying pressure, confirming the bounce.</span>'
  },
  smc_bearish: {
    name: 'SMC Bearish Reversal',
    desc: 'Smart Money Concepts. Price rallies into an unmitigated Bearish Order Block (Resistance) and prints a bearish reversal candle.',
    example: '<img src="/assets/smc_bearish_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Short near close<br><strong>Stop:</strong> Above the Order Block<br><strong>Target:</strong> Nearest Bullish Order Block<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> Institutions sold off at this level previously, creating a Bearish OB. Price returns to retest this zone and faces heavy selling pressure, confirming the drop.</span>'
  },
  ha_donchian_bullish: {
    name: 'HA Donchian Bullish',
    desc: 'A mechanical trend-following strategy by Brijesh Bhatia. It uses smoothed Heikin-Ashi candles to filter market noise and identifies early bullish reversals when the Heikin-Ashi candle color flips green with a flat bottom (no lower shadow) after at least 3 red exhaustion candles. Trades are trailed dynamically using the Donchian Channel.',
    example: '<img src="/assets/ha_donchian_bullish_diagram.png?v=7" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy at the open of the next candle (once the confirmation green HA candle closes).<br><strong>Stop Loss:</strong> Trailing stop at the lower Donchian Channel band (lowest low of last 3 candles for swing, 5 candles for weekly positional, or 2 candles for scalping), OR initially at the low of the 1st green HA reversal candle for a tighter risk option.<br><strong>Target:</strong> Ride the trend until the trailing stop is hit (no fixed target).<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., RELIANCE drops for 4 days (3+ red HA candles). Today, it prints a green HA candle with no lower shadow (flat bottom). You buy at the open of the next candle and trail the lowest low of the last 3 days.</span>'
  },
  ha_donchian_bearish: {
    name: 'HA Donchian Bearish',
    desc: 'A mechanical trend-following strategy by Brijesh Bhatia. Identifies early bearish reversals when the Heikin-Ashi candle flips red with a flat top (no upper shadow) after at least 3 green exhaustion candles. Trades are trailed dynamically using the Donchian Channel.',
    example: '<img src="/assets/ha_donchian_bearish_diagram.png?v=7" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Short/Sell at the open of the next candle (once the confirmation red HA candle closes).<br><strong>Stop Loss:</strong> Trailing stop at the upper Donchian Channel band (highest high of last 3 candles for swing, 5 candles for weekly positional, or 2 candles for scalping), OR initially at the high of the 1st red HA reversal candle for a tighter risk option.<br><strong>Target:</strong> Ride the trend until the trailing stop is hit.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., SBIN rallies for 5 days (3+ green HA candles). Today, it prints a red HA candle with no upper shadow (flat top). You short at the open of the next candle and trail the highest high of the last 3 days.</span>'
  },
  multi_tf: {
    name: 'Multi-Timeframe Heikin-Ashi Confluence',
    desc: 'Analyzes Higher Timeframe alignment across Monthly, Weekly, and Daily charts using Heikin-Ashi candles and RSI + MACD momentum. When all three timeframes agree (+1 +1 +1 or -1 -1 -1), it indicates an extremely high-probability institutional trend confluence.',
    example: '<img src="/assets/multi_tf_diagram.png?v=1" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Bullish Confluence (+3):</strong> Monthly Green HA + Weekly Green HA + Daily RSI > 50 & MACD > 0.<br><strong>Bearish Confluence (-3):</strong> Monthly Red HA + Weekly Red HA + Daily RSI < 50 & MACD < 0.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., BAJAJ-AUTO has a green Monthly HA candle (+1), green Weekly HA candle (+1), and Daily RSI > 70 with positive MACD (+1). This 3-tier confluence filters out false counter-trend signals.</span>'
  },
  elephant_bullish: {
    name: 'Oliver Velez Bullish Elephant Candle (🐘)',
    desc: 'Oliver Velez (iFT Academy) Igniting Strategy. Identifies a massive solid green candle (> 70% pure body) that expands at least 1.3x larger than the 14-period ATR on surging relative volume (> 1.5x avg). It ignites an explosive 5% to 20% institutional trend out of moving average support (8 & 20 EMA).',
    example: '<img src="/assets/smc_bullish_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Buy breakout above Elephant Candle High<br><strong>Stop Loss:</strong> Right below Elephant Candle Low<br><strong>Target:</strong> Ride trend (1:2 to 1:4 risk/reward)<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., TATA MOTORS consolidates near its 20 EMA. Suddenly, a massive 80% solid green candle explodes on 2.5x volume, breaking 1.3x ATR. Buy the igniting elephant candle!</span>'
  },
  elephant_bearish: {
    name: 'Oliver Velez Bearish Elephant Candle (🐘)',
    desc: 'Oliver Velez (iFT Academy) Igniting Strategy (Short). Identifies a massive solid red candle (> 70% pure body) that expands at least 1.3x larger than the 14-period ATR on surging relative volume (> 1.5x avg). Signals aggressive institutional dumping.',
    example: '<img src="/assets/smc_bearish_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> Short breakdown below Elephant Candle Low<br><strong>Stop Loss:</strong> Right above Elephant Candle High<br><strong>Target:</strong> Heavy continuation drop<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., WIPRO fails at 20 EMA and prints an 85% solid red candle on massive volume. Short the breakdown for a 5% to 15% drop.</span>'
  },
  gap_momentum: {
    name: 'Gap Expansion Momentum (⚡ 5% - 20% Move)',
    desc: 'Captures pre-market & opening gap expansion setups. Identifies stocks opening with a significant Gap Up (+1.5%+) or Gap Down (-1.5%-) with explosive Relative Volume (> 1.5x avg) and momentum continuation.',
    example: '<img src="/assets/ttm_orb_diagram.png" style="width:100%; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.1);"><strong>Entry:</strong> High/Low of first 15m candle<br><strong>Stop Loss:</strong> 1.5% risk<br><strong>Target:</strong> 5% to 20% intraday circuit run<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., RELIANCE gaps up 2.2% at 9:15 AM on 4x volume and forms a solid green candle with no lower wick. Buy the momentum for a 10%+ day move.</span>'
  }
};

// ─── Initialize ─────────────────────────────────────────────────────────────
async function init() {
  fetchStatus();
  setInterval(fetchStatus, 30000); // refresh every 30s
  initAlerts();

  // Tab Switching
  const tabScreener = document.getElementById('tabScreener');
  const tabScripts = document.getElementById('tabScripts');
  const screenerView = document.getElementById('screener-view');
  const scriptsView = document.getElementById('scripts-view');

  if (tabScreener && tabScripts) {
    tabScreener.addEventListener('click', (e) => {
      e.preventDefault();
      tabScreener.style.color = 'var(--text-main)';
      tabScripts.style.color = 'var(--text-muted)';
      screenerView.style.display = 'block';
      scriptsView.style.display = 'none';
    });
    tabScripts.addEventListener('click', (e) => {
      e.preventDefault();
      tabScripts.style.color = 'var(--text-main)';
      tabScreener.style.color = 'var(--text-muted)';
      screenerView.style.display = 'none';
      scriptsView.style.display = 'block';
      renderScripts();
    });
  }

  // Setup Universe Pills
  const assetToggle = document.getElementById('assetToggle');
  if (assetToggle) {
    assetToggle.addEventListener('click', (e) => {
      if (!e.target.classList.contains('pill')) return;
      Array.from(assetToggle.children).forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      const asset = e.target.dataset.asset;

      // Filter Strategy Pills
      const stratPills = Array.from(DOM.strategyPills.children);
      stratPills.forEach(p => {
        if (p.dataset.type === asset) {
          p.style.display = 'inline-block';
        } else {
          p.style.display = 'none';
        }
      });

      // Auto-select first visible pill
      const firstVisible = stratPills.find(p => p.style.display !== 'none');
      if (firstVisible) firstVisible.click();
    });
  }

  DOM.universePills.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('pill')) return;

    // UI Update
    Array.from(DOM.universePills.children).forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');

    const val = e.target.dataset.val;
    if (val === 'custom') {
      DOM.customTickerWrapper.classList.remove('hidden');
      AppState.setTickers(DOM.tickerInput.value.split(',').map(s => s.trim()).filter(Boolean));
    } else {
      DOM.customTickerWrapper.classList.add('hidden');
      DOM.scanBtn.disabled = true;
      DOM.scanBtn.innerHTML = `<div class="spinner"></div> <span>Loading ${val.toUpperCase()}...</span>`;
      try {
        const res = await fetch(`/api/symbols?index=${val}`);
        const data = await res.json();
        if (data.symbols) {
          AppState.setTickers(data.symbols);
        }
      } catch (err) {
        console.error("Failed to load symbols", err);
      }
      DOM.scanBtn.disabled = false;
      DOM.scanBtn.innerHTML = `<span>Run Scan</span>`;
    }
  });

  // Setup Strategy Modal & Info Icons
  const modal = document.getElementById('strategyModal');
  const modalClose = document.getElementById('modalClose');
  const modalOverlay = modal.querySelector('.modal-overlay');

  const closeModal = () => modal.classList.add('hidden');
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);

  // MMI Info Modal
  const mmiStatusBadge = document.getElementById('mmiStatus');
  if (mmiStatusBadge) {
    mmiStatusBadge.addEventListener('click', () => {
      document.getElementById('modalTitle').innerHTML = 'Market Mood Index (MMI)';
      document.getElementById('modalDescription').innerHTML = 'The Market Mood Index (MMI) tracks the sentiment of the overall market. It helps in timing your trades by identifying extreme greed or extreme fear phases.';
      document.getElementById('modalExample').innerHTML = '<strong>< 30 (Extreme Fear):</strong> High probability of a market bottom. Great time for Bottom Catch and Long Term strategies.<br><br><strong>> 70 (Extreme Greed):</strong> High probability of a market top. Great time for Top Catch and Bearish Breakdown strategies.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> When MMI is in the middle (30-70), focus on stock-specific Trend Breakouts rather than betting on macro direction.</span>';
      modal.classList.remove('hidden');
    });
  }

  document.querySelectorAll('#strategyPills .pill:not([data-val="all"])').forEach(pill => {
    const icon = document.createElement('span');
    icon.className = 'info-icon';
    icon.innerHTML = 'i';
    pill.appendChild(icon);

    icon.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent pill click
      const val = pill.dataset.val;
      const info = STRATEGY_INFO[val];
      if (info) {
        document.getElementById('modalTitle').innerHTML = info.name;
        document.getElementById('modalDescription').innerHTML = info.desc;
        document.getElementById('modalExample').innerHTML = info.example;
        modal.classList.remove('hidden');
      }
    });
  });

  // Setup Strategy Pills
  DOM.strategyPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;

    Array.from(DOM.strategyPills.children).forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    const strategyVal = pill.dataset.val;
    AppState.setStrategy(strategyVal);

    if (DOM.lookbackWrapper) {
      DOM.lookbackWrapper.style.display = strategyVal === 'multi_tf' ? 'block' : 'none';
    }

    // Auto timeframe
    const tf = pill.dataset.tf;
    if (tf) {
      Array.from(DOM.timeframePills.children).forEach(p => p.classList.remove('active'));
      const activeTfPill = DOM.timeframePills.querySelector(`[data-val="${tf}"]`);
      if (activeTfPill) activeTfPill.classList.add('active');
      AppState.setTimeframe(tf);
    }
  });

  // Manual Ticker Input
  DOM.tickerInput.addEventListener('input', e => {
    const activeUniverse = DOM.universePills.querySelector('.active').dataset.val;
    if (activeUniverse === 'custom') {
      AppState.setTickers(e.target.value.split(',').map(s => s.trim()).filter(Boolean));
    }
  });

  const tfPills = document.getElementById('timeframePills');
  tfPills.addEventListener('click', (e) => {
    if (!e.target.classList.contains('pill')) return;
    Array.from(tfPills.children).forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    AppState.setTimeframe(e.target.dataset.val);
  });

  DOM.capitalInput.addEventListener('input', e => {
    AppState.setCapital(e.target.value);
    if (AppState.results && AppState.results.length > 0) {
      renderResults(AppState.results);
    }
  });
  DOM.scanBtn.addEventListener('click', runScan);

  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }

  // Initial Data Load (Nifty 50)
  AppState.setStrategy('all');
  AppState.setTimeframe('1d');

  DOM.scanBtn.disabled = true;
  DOM.scanBtn.innerHTML = `<div class="spinner"></div> <span>Loading NIFTY50...</span>`;
  try {
    const res = await fetch(`/api/symbols?index=nifty50`);
    const data = await res.json();
    if (data.symbols) AppState.setTickers(data.symbols);
  } catch (err) {
    console.error("Failed to load symbols", err);
  }
  DOM.scanBtn.disabled = false;
  DOM.scanBtn.innerHTML = `<span>Run Scan</span>`;
}

// ─── Status Checking ────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const fyersRes = await fetch('/fyers/status');
    const fyersData = await fyersRes.json();

    const connBadge = document.getElementById('connStatus');
    if (fyersData.connected) {
      connBadge.className = 'badge badge-green';
      connBadge.innerText = 'Brokers: Connected (Fyers)';
    } else {
      connBadge.className = 'badge badge-red';
      connBadge.innerHTML = 'Brokers: Disconnected <a href="/fyers/login" style="margin-left:8px; color:inherit; text-decoration:underline;">Login</a>';
    }

    const mmiRes = await fetch('/api/mmi');
    if (mmiRes.ok) {
      const mmiData = await mmiRes.json();
      const mmiBadge = document.getElementById('mmiStatus');
      mmiBadge.innerHTML = `MMI: ${mmiData.value || 'N/A'} <span class="info-icon" style="margin-left:4px;">i</span>`;
      if (mmiData.value < 30) mmiBadge.className = 'badge badge-green';
      else if (mmiData.value > 70) mmiBadge.className = 'badge badge-red';
      else mmiBadge.className = 'badge badge-amber';
    }
  } catch (e) {
    console.error('Failed to fetch status:', e);
  }
}

let currentScanId = 0;
let currentAbortController = null;

// ─── Scan Runner ────────────────────────────────────────────────────────────
async function runScan() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const scanId = ++currentScanId;

  if (!DOM.customTickerWrapper.classList.contains('hidden')) {
    const customList = DOM.tickerInput.value.split(',').map(s => s.trim()).filter(Boolean);
    if (customList.length > 0) AppState.setTickers(customList);
  }

  if (AppState.tickers.length === 0) return;

  DOM.scanBtn.disabled = true;
  DOM.scanBtn.style.display = 'none';
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'flex';

  DOM.progressArea.style.display = 'block';
  DOM.progressText.innerText = `Scanning starting...`;
  DOM.progressPercent.innerText = `0%`;
  DOM.progressBar.style.width = `0%`;
  if (DOM.progressTimer) DOM.progressTimer.innerText = '0.0s';

  const startTime = performance.now();
  const timerInterval = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    if (DOM.progressTimer) DOM.progressTimer.innerText = `${elapsed}s`;
  }, 100);

  document.getElementById('adStrip').style.display = 'none';
  document.getElementById('summaryBar').style.display = 'none';

  const results = [];
  const strategyId = AppState.strategy;

  try {
    // Use smaller batch size for historical APIs (1W/1M) to prevent 504 Gateway Timeouts
    // as they require multiple paginated requests to the broker.
    const isEOD = AppState.timeframe === '1d';
    const isMultiTF = strategyId === 'multi_tf';
    const BATCH_SIZE = isMultiTF ? 3 : (isEOD ? 25 : 6);
    const BATCH_DELAY = isMultiTF ? 600 : (isEOD ? 150 : 200);

    for (let i = 0; i < AppState.tickers.length; i += BATCH_SIZE) {
      if (signal.aborted) throw new Error('AbortError');

      const pct = Math.round((i / AppState.tickers.length) * 100);
      DOM.progressText.innerText = `Scanning (${i}/${AppState.tickers.length}) stocks...`;
      DOM.progressPercent.innerText = `${pct}%`;
      DOM.progressBar.style.width = `${pct}%`;

      const batch = AppState.tickers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (ticker) => {
        try {
          let data;
          let weeklyData = null;
          let monthlyData = null;

          if (isMultiTF) {
            const [dData, wData, mData] = await Promise.all([
              fetchOHLCV(ticker, '1d', signal),
              fetchOHLCV(ticker, '1wk', signal),
              fetchOHLCV(ticker, '1mo', signal)
            ]);
            data = dData;
            weeklyData = wData;
            monthlyData = mData;
          } else {
            data = await fetchOHLCV(ticker, AppState.timeframe, signal);
          }

          const n = data.closes.length;
          const minBars = 30;
          if (n < minBars) return; // Need minimum data

          const curr = data.closes[n - 1];
          const prev = data.closes[n - 2];
          const chgPct = parseFloat(((curr - prev) / prev * 100).toFixed(2));

          let res = null;
          let matchedStrategies = [];

          if (strategyId === 'all') {
            const allStrategies = ['ttm_orb', 'intraday_retest', 'ohl_bullish', 'ohl_bearish', 'elephant_bullish', 'elephant_bearish', 'gap_momentum', 'xmomentum', 'minervini', 'darvas', 'rs', 'crsi', 'bps', 'strangle', 'iv_crush', 'csp', 'cc', 'btst', 'weinstein', 'wyckoff', 'vcp_down', 'bear_call', 'hm_bottom', 'hm_top', 'hm_bullish', 'hm_bearish', 'hm_chop', 'smc_bullish', 'smc_bearish', 'ha_donchian_bullish', 'ha_donchian_bearish'];
            let combinedReasons = [];
            for (const s of allStrategies) {
              let tempRes = null;
              if (['ttm_orb', 'intraday_retest', 'ohl_bullish', 'ohl_bearish', 'elephant_bullish', 'elephant_bearish', 'gap_momentum'].includes(s)) tempRes = intradayStrats.run(s, data);
              else if (['minervini', 'darvas', 'rs', 'crsi', 'xmomentum'].includes(s)) tempRes = swingStrats.run(s, data);
              else if (['bps', 'strangle', 'iv_crush', 'csp', 'cc'].includes(s)) tempRes = optionStrats.run(s, data);
              else if (['btst'].includes(s)) tempRes = btstStrats.run(s, data);
              else if (['weinstein', 'wyckoff'].includes(s)) tempRes = longTermStrats.run(s, data);
              else if (['vcp_down', 'bear_call'].includes(s)) tempRes = shortStrats.run(s, data);
              else if (s.startsWith('hm_')) tempRes = hmStrats.run(s, data);
              else if (s.startsWith('smc_')) tempRes = smcStrats.run(s, data);
              else if (s.startsWith('ha_donchian_')) tempRes = haDonchianStrats.run(s, data, AppState.timeframe);

              if (tempRes && tempRes.isMatch) {
                matchedStrategies.push(s);
                if (tempRes.reason) combinedReasons.push(`<b>${s.toUpperCase()}:</b> ${tempRes.reason}`);
              }
            }

            const finalReason = combinedReasons.length > 0 ? combinedReasons.join('<br>') : 'Raw Technical Scan (Score Rank)';
            res = { isMatch: true, reason: finalReason, matches: matchedStrategies };
          } else {
            if (['ttm_orb', 'intraday_retest', 'ohl_bullish', 'ohl_bearish', 'elephant_bullish', 'elephant_bearish', 'gap_momentum'].includes(strategyId)) res = intradayStrats.run(strategyId, data);
            else if (['minervini', 'darvas', 'rs', 'crsi', 'xmomentum'].includes(strategyId)) res = swingStrats.run(strategyId, data);
            else if (['bps', 'strangle', 'iv_crush', 'csp', 'cc'].includes(strategyId)) {
              res = optionStrats.run(strategyId, data);
              if (res.isMatch) res.raw = data;
            }
            else if (['btst'].includes(strategyId)) res = btstStrats.run(strategyId, data);
            else if (['weinstein', 'wyckoff'].includes(strategyId)) res = longTermStrats.run(strategyId, data);
            else if (['vcp_down', 'bear_call'].includes(strategyId)) res = shortStrats.run(strategyId, data);
            else if (strategyId.startsWith('hm_')) res = hmStrats.run(strategyId, data);
            else if (strategyId.startsWith('smc_')) res = smcStrats.run(strategyId, data);
            else if (strategyId.startsWith('ha_donchian_')) res = haDonchianStrats.run(strategyId, data, AppState.timeframe);
            else if (strategyId === 'multi_tf') {
              const lookback = parseInt(DOM.lookbackInput.value) || 0;
              const dLen = data.closes.length;
              const wLen = weeklyData.closes.length;
              const mLen = monthlyData.closes.length;

              if (dLen - lookback >= 30 && wLen - lookback >= 15 && mLen - lookback >= 15) {
                const dCloses = data.closes.slice(0, dLen - lookback);
                const dOpens = data.opens.slice(0, dLen - lookback);
                const dHighs = data.highs.slice(0, dLen - lookback);
                const dLows = data.lows.slice(0, dLen - lookback);

                const wCloses = weeklyData.closes.slice(0, wLen - lookback);
                const wOpens = weeklyData.opens.slice(0, wLen - lookback);
                const wHighs = weeklyData.highs.slice(0, wLen - lookback);
                const wLows = weeklyData.lows.slice(0, wLen - lookback);

                const mCloses = monthlyData.closes.slice(0, mLen - lookback);
                const mOpens = monthlyData.opens.slice(0, mLen - lookback);
                const mHighs = monthlyData.highs.slice(0, mLen - lookback);
                const mLows = monthlyData.lows.slice(0, mLen - lookback);

                const dRsi = rsi(dCloses);
                const dMacd = macd(dCloses);

                const wRsi = rsi(wCloses);
                const wHa = calculateHeikinAshi(wOpens, wHighs, wLows, wCloses);
                const wHaClose = wHa.haClose[wHa.haClose.length - 1];
                const wHaOpen = wHa.haOpen[wHa.haOpen.length - 1];

                const mRsi = rsi(mCloses);
                const mHa = calculateHeikinAshi(mOpens, mHighs, mLows, mCloses);
                const mHaClose = mHa.haClose[mHa.haClose.length - 1];
                const mHaOpen = mHa.haOpen[mHa.haOpen.length - 1];

                const monthlyState = (mHaClose > mHaOpen) && (mRsi > 50) ? 1 : (mHaClose < mHaOpen) && (mRsi < 50) ? -1 : 0;
                const weeklyState = (wHaClose > wHaOpen) && (wRsi > 50) ? 1 : (wHaClose < wHaOpen) && (wRsi < 50) ? -1 : 0;
                const dailyState = (dRsi > 50) && (dMacd.hist > 0) ? 1 : (dRsi < 50) && (dMacd.hist < 0) ? -1 : 0;

                let score = 0;
                if (monthlyState === 1) score++; else if (monthlyState === -1) score--;
                if (weeklyState === 1) score++; else if (weeklyState === -1) score--;
                if (dailyState === 1) score++; else if (dailyState === -1) score--;

                res = {
                  isMatch: true,
                  multiTf: {
                    monthly: monthlyState,
                    weekly: weeklyState,
                    daily: dailyState,
                    rsi: dRsi,
                    macdVal: dMacd.macd,
                    macdSig: dMacd.signal,
                    macdHist: dMacd.hist,
                    score: score
                  }
                };
              } else {
                res = { isMatch: false };
              }
            }
          }

          if (res && res.isMatch) {
            // Compute standard technicals for the card
            const ema20 = ema(data.closes, 20);
            const ema50 = ema(data.closes, 50);
            const ema200 = ema(data.closes, 200);
            const rsiVal = rsi(data.closes);
            const adxVal = adx(data.highs, data.lows, data.closes);
            const macdData = macd(data.closes);
            const macdVal = macdData.macd;
            const macdHist = macdData.hist;
            const cciVal = cci(data.highs, data.lows, data.closes, 34);

            const recentVol = data.volumes[n - 1];
            const avgVol = data.volumes.slice(n - 21, n - 1).reduce((a, b) => a + b, 0) / 20;
            const vr = avgVol > 0 ? parseFloat((recentVol / avgVol).toFixed(2)) : 1;

            // Pivot Points (Classic) based on previous day High, Low, Close
            const pHigh = data.highs[n - 2];
            const pLow = data.lows[n - 2];
            const pClose = data.closes[n - 2];
            const pivot = (pHigh + pLow + pClose) / 3;
            const r1 = (2 * pivot) - pLow;
            const s1 = (2 * pivot) - pHigh;
            const r2 = pivot + (pHigh - pLow);
            const s2 = pivot - (pHigh - pLow);
            const r3 = pHigh + 2 * (pivot - pLow);
            const s3 = pLow - 2 * (pHigh - pivot);

            // Entry, Stop, Targets
            const prevClose = data.closes[n - 2] || curr;
            const entry = res.entry || prevClose;

            const SHORT_STRATEGIES = ['ohl_bearish', 'vcp_down', 'bear_call', 'hm_top', 'hm_bearish', 'smc_bearish', 'ha_donchian_bearish'];
            const isShort = Boolean(res.isShort) || SHORT_STRATEGIES.includes(strategyId) || SHORT_STRATEGIES.includes(AppState.strategy);

            let stop = res.stop;
            if (!stop) {
              stop = isShort
                ? (res.risk ? entry + res.risk : entry * 1.05)
                : (res.risk ? entry - res.risk : entry * 0.95);
            }
            const riskAmount = Math.abs(entry - stop);

            const t1 = res.t1 || (isShort ? entry - (riskAmount * 1.5) : entry + (riskAmount * 1.5));
            const t2 = res.t2 || (isShort ? entry - (riskAmount * 3) : entry + (riskAmount * 3));

            results.push({
              ticker, data, ...res,
              chgPct, curr, ema20, ema50, ema200, rsiVal, adxVal, vr, macdVal, macdHist, cciVal,
              entry, stop, t1, t2, s1, s2, s3, r1, r2, r3
            });
          }
        } catch (e) {
          console.error(`Skipping ${ticker}: `, e);
        }
      }));
      // Throttle between batches to avoid Hostinger 50req/s DDoS limit
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    // Overlay Live Prices
    try {
      const allSymbols = results.map(r => r.ticker);
      if (allSymbols.length > 0) {
        const BATCH_Q = 100;
        for (let i = 0; i < allSymbols.length; i += BATCH_Q) {
          const batchSyms = allSymbols.slice(i, i + BATCH_Q).join(',');
          const qRes = await fetch(`/api/quotes?symbols=${batchSyms}`);
          if (qRes.ok) {
            const qData = await qRes.json();
            if (qData.quotes) {
              results.forEach(r => {
                const livePrice = qData.quotes[r.ticker] || qData.quotes[r.ticker.toUpperCase()];
                if (livePrice) {
                  const prev = r.data.closes[r.data.closes.length - 2];
                  if (prev) {
                    r.curr = livePrice;
                    r.chgPct = parseFloat(((livePrice - prev) / prev * 100).toFixed(2));
                  }
                }
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch live quotes", e);
    }

    if (scanId !== currentScanId) return; // Drop stale results if a newer scan started

    AppState.setResults(results);
    renderResults(results);
  } catch (err) {
    if (err.message === 'AbortError' || err.name === 'AbortError') {
      DOM.resultsArea.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--red); padding: 64px 0;">Scan canceled by user.</div>`;
    } else {
      console.error(err);
    }
  } finally {
    if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    const totalElapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    window._lastScanDuration = totalElapsed;
    if (DOM.progressTimer) DOM.progressTimer.innerText = `${totalElapsed}s`;

    if (scanId === currentScanId) {
      DOM.progressText.innerText = `Scan completed in ${totalElapsed}s.`;
      DOM.progressPercent.innerText = `100%`;
      DOM.progressBar.style.width = `100%`;
      DOM.scanBtn.disabled = false;
      DOM.scanBtn.style.display = 'flex';
      if (cancelBtn) cancelBtn.style.display = 'none';
      setTimeout(() => {
        DOM.progressArea.style.display = 'none';
      }, 1500);
    }
  }
}

// ─── UI Renderer ────────────────────────────────────────────────────────────
window._cachedStockData = {};

let tableSortKey = 'confluence';
let tableSortDir = 'desc';
let lastMultiTfResults = null;

function renderResults(results) {
  if (results.length === 0) {
    DOM.resultsArea.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 64px 0;">No matching setups found for the selected strategy.</div>`;
    return;
  }

  if (AppState.strategy === 'multi_tf') {
    lastMultiTfResults = results;

    // Apply sorting
    results.sort((a, b) => {
      let valA, valB;
      if (tableSortKey === 'scrip') {
        return tableSortDir === 'asc' ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      } else if (tableSortKey === 'lcp') {
        valA = a.curr; valB = b.curr;
      } else if (tableSortKey === 'monthly') {
        valA = a.multiTf.monthly; valB = b.multiTf.monthly;
      } else if (tableSortKey === 'weekly') {
        valA = a.multiTf.weekly; valB = b.multiTf.weekly;
      } else if (tableSortKey === 'daily') {
        valA = a.multiTf.daily; valB = b.multiTf.daily;
      } else if (tableSortKey === 'rsi') {
        valA = a.multiTf.rsi; valB = b.multiTf.rsi;
      } else if (tableSortKey === 'macd') {
        valA = a.multiTf.macdHist; valB = b.multiTf.macdHist;
      } else {
        // Confluence score
        valA = a.multiTf.score; valB = b.multiTf.score;
      }

      if (tableSortDir === 'asc') return valA - valB;
      return valB - valA;
    });

    const getIcon = (key) => {
      if (tableSortKey !== key) return `<span style="opacity:0.3; margin-left:4px;">↕</span>`;
      return tableSortDir === 'asc' ? `<span style="color:var(--v-accent); margin-left:4px;">▲</span>` : `<span style="color:var(--v-accent); margin-left:4px;">▼</span>`;
    };

    let html = `
      <div style="grid-column: 1 / -1; width: 100%;">
        <div class="table-container" style="margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow-x: auto; width: 100%;">
          <table id="multiTfTable" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border);">
                <th style="padding: 12px 16px; font-weight: 600; color: var(--text-muted);">Sr No.</th>
                <th data-sort="scrip" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); cursor: pointer; user-select: none;">Scrip ${getIcon('scrip')}</th>
                <th data-sort="lcp" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: right; cursor: pointer; user-select: none;">LCP (₹) ${getIcon('lcp')}</th>
                <th data-sort="monthly" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: center; cursor: pointer; user-select: none;">Monthly (HA+RSI) ${getIcon('monthly')}</th>
                <th data-sort="weekly" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: center; cursor: pointer; user-select: none;">Weekly (HA+RSI) ${getIcon('weekly')}</th>
                <th data-sort="daily" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: center; cursor: pointer; user-select: none;">Daily (RSI+MACD) ${getIcon('daily')}</th>
                <th data-sort="rsi" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: right; cursor: pointer; user-select: none;">Daily RSI ${getIcon('rsi')}</th>
                <th data-sort="macd" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: right; cursor: pointer; user-select: none;">Daily MACD Hist ${getIcon('macd')}</th>
                <th data-sort="confluence" style="padding: 12px 16px; font-weight: 600; color: var(--text-muted); text-align: center; cursor: pointer; user-select: none;">Confluence ${getIcon('confluence')}</th>
              </tr>
            </thead>
            <tbody>
    `;

    results.forEach((r, i) => {
      const mt = r.multiTf;

      const badgeHtml = (val) => {
        if (val === 1) return `<span class="badge-status badge-1" style="background: var(--green-dim); color: var(--green); border: 1px solid rgba(36, 180, 126, 0.3); display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-weight: 700; font-size: 12px;">+1</span>`;
        if (val === -1) return `<span class="badge-status badge-0" style="background: var(--red-dim); color: var(--red); border: 1px solid rgba(239, 68, 68, 0.3); display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-weight: 700; font-size: 12px;">-1</span>`;
        return `<span class="badge-status badge-0" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.1); display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-weight: 700; font-size: 12px;">0</span>`;
      };

      const getBadgeInfo = (mtData) => {
        const { monthly, weekly, daily, score } = mtData;
        // Bullish Setups
        if (score === 3) return { label: 'Full Confluence (+3)', bg: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(36, 180, 126, 0.4)', title: 'Full Bullish Confluence (+3)', desc: 'All 3 timeframes (Monthly, Weekly, Daily) are aligned in a strong green uptrend. Highest probability momentum continuation setup.', action: 'Buy Breakouts & Ride Trend' };
        if (monthly === 1 && weekly === 1 && daily <= 0) return { label: 'Buy the Dip (+2)', bg: 'rgba(36, 180, 126, 0.15)', color: '#34d399', border: '1px dashed rgba(52, 211, 153, 0.5)', title: 'Buy the Dip Setup (+2)', desc: 'Macro (Monthly & Weekly) trends are strongly Bullish (+1), while Daily is temporarily cooling off in a pullback.', action: 'High-Reward Buy Dip at Support' };
        if (weekly === 1 && daily === 1 && monthly <= 0) return { label: 'Early Reversal (+2)', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.4)', title: 'Early Trend Reversal (+2)', desc: 'Weekly and Daily momentum turned Bullish (+1), while Monthly is still turning around from base.', action: 'Early Entry Before Crowd' };
        if (daily === 1 && monthly <= 0 && weekly <= 0) return { label: 'Fresh Daily Spark (+1)', bg: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(36, 180, 126, 0.2)', title: 'Fresh Daily Spark (+1)', desc: 'Daily timeframe broke out today on volume with RSI > 50 & MACD > 0, while higher timeframes remain neutral.', action: 'Intraday / Quick Momentum Swing' };

        // Bearish Setups (Symmetrical)
        if (score === -3) return { label: 'Full Bearish (-3)', bg: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.4)', title: 'Full Bearish Confluence (-3)', desc: 'All 3 timeframes (Monthly, Weekly, Daily) are aligned in a downward trend. High-probability shorting / put buying setup.', action: 'Short / Buy Puts / Avoid Longs' };
        if (monthly === -1 && weekly === -1 && daily >= 0) return { label: 'Sell the Rally (-2)', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px dashed rgba(248, 113, 113, 0.5)', title: 'Sell the Rally Setup (-2)', desc: 'Macro (Monthly & Weekly) trends are strongly Bearish (-1), while Daily is experiencing a temporary bounce/rally.', action: 'High-Reward Short / Bear Call Spread at Resistance' };
        if (weekly === -1 && daily === -1 && monthly >= 0) return { label: 'Early Breakdown (-2)', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', title: 'Early Bearish Breakdown (-2)', desc: 'Weekly and Daily momentum turned Bearish (-1), while Monthly is starting to break down.', action: 'Early Short / Puts Before Crowd' };
        if (daily === -1 && monthly >= 0 && weekly >= 0) return { label: 'Fresh Daily Drop (-1)', bg: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)', title: 'Fresh Daily Drop (-1)', desc: 'Daily timeframe broke down today on volume with RSI < 50 & MACD < 0, while higher timeframes remain neutral.', action: 'Intraday / Quick Short Swing' };

        // Neutral / Consolidation
        return { label: 'Consolidation (0)', bg: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255, 255, 255, 0.1)', title: 'Consolidation / Neutral (0)', desc: 'No clear trend direction. Timeframes are mixed or flat.', action: 'Wait for Breakout' };
      };

      const cBadge = getBadgeInfo(mt);
      const macdSign = mt.macdHist > 0 ? '+' : '';
      const macdColor = mt.macdHist > 0 ? 'var(--green)' : 'var(--red)';

      html += `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 12px 16px;">${i + 1}</td>
          <td style="padding: 12px 16px; font-weight: 600;">
            <a href="https://in.tradingview.com/chart/?symbol=NSE%3A${r.ticker}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dashed var(--border);">
              ${r.ticker}
            </a>
          </td>
          <td style="padding: 12px 16px; text-align: right; font-family: var(--mono);">${r.curr.toFixed(2)}</td>
          <td style="padding: 12px 16px; text-align: center;">${badgeHtml(mt.monthly)}</td>
          <td style="padding: 12px 16px; text-align: center;">${badgeHtml(mt.weekly)}</td>
          <td style="padding: 12px 16px; text-align: center;">${badgeHtml(mt.daily)}</td>
          <td style="padding: 12px 16px; text-align: right; font-family: var(--mono); color: ${mt.rsi > 50 ? 'var(--green)' : 'var(--red)'}">${Math.round(mt.rsi)}</td>
          <td style="padding: 12px 16px; text-align: right; font-family: var(--mono); color: ${macdColor}">${macdSign}${mt.macdHist.toFixed(2)}</td>
          <td style="padding: 12px 16px; text-align: center;">
            <span class="conf-badge-click" data-ticker="${r.ticker}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; background: ${cBadge.bg}; color: ${cBadge.color}; border: ${cBadge.border}; cursor: pointer;">
              ${cBadge.label} <span style="opacity: 0.6; font-size: 10px;">ℹ</span>
            </span>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    DOM.resultsArea.innerHTML = html;

    // Attach click handlers to headers
    const tbl = document.getElementById('multiTfTable');
    if (tbl) {
      tbl.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        if (tableSortKey === key) {
          tableSortDir = tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          tableSortKey = key;
          tableSortDir = key === 'scrip' ? 'asc' : 'desc';
        }
        renderResults(lastMultiTfResults);
      });
      tbl.querySelectorAll('.conf-badge-click').forEach(badgeEl => {
        badgeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const ticker = badgeEl.dataset.ticker;
          const match = lastMultiTfResults.find(r => r.ticker === ticker);
          if (match && match.multiTf) {
            const mt = match.multiTf;
            const info = getBadgeInfo(mt);
            document.getElementById('modalTitle').innerHTML = `${ticker} — ${info.title}`;
            document.getElementById('modalDescription').innerHTML = info.desc;
            document.getElementById('modalExample').innerHTML = `
              <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:6px; border:1px solid var(--border); margin-top:8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px;">
                  <span>Monthly (HA+RSI): <b style="color:${mt.monthly > 0 ? 'var(--green)' : (mt.monthly < 0 ? 'var(--red)' : 'var(--text-muted)')}">${mt.monthly > 0 ? '+1 (Bullish)' : (mt.monthly < 0 ? '-1 (Bearish)' : '0 (Neutral)')}</b></span>
                  <span>Weekly (HA+RSI): <b style="color:${mt.weekly > 0 ? 'var(--green)' : (mt.weekly < 0 ? 'var(--red)' : 'var(--text-muted)')}">${mt.weekly > 0 ? '+1 (Bullish)' : (mt.weekly < 0 ? '-1 (Bearish)' : '0 (Neutral)')}</b></span>
                </div>
                <div style="margin-bottom:12px; font-size:12px;">Daily (RSI+MACD): <b style="color:${mt.daily > 0 ? 'var(--green)' : (mt.daily < 0 ? 'var(--red)' : 'var(--text-muted)')}">${mt.daily > 0 ? '+1 (Bullish)' : (mt.daily < 0 ? '-1 (Bearish)' : '0 (Neutral)')}</b> (RSI: ${Math.round(mt.rsi)}, MACD: ${mt.macdHist.toFixed(2)})</div>
                <div style="color:var(--v-accent); font-weight:600; font-size:12px;">💡 Execution Guide: ${info.action}</div>
              </div>
            `;
            document.getElementById('strategyModal').classList.remove('hidden');
          }
        });
      });
    }
    return;
  }

  // A/D Calculation
  let advances = 0, declines = 0;
  results.forEach(r => {
    if (r.chgPct >= 0) advances++; else declines++;
  });
  const total = advances + declines;

  if (total > 0) {
    const adStrip = document.getElementById('adStrip');
    adStrip.style.display = 'flex';
    adStrip.innerHTML = `
      <div class="ad-green" style="width:${(advances / total) * 100}%"></div>
      <div class="ad-red" style="width:${(declines / total) * 100}%"></div>
    `;

    const sumBar = document.getElementById('summaryBar');
    sumBar.style.display = 'flex';
    sumBar.innerHTML = `
      <div class="sum-chip"><div class="sk">Scanned / Matched</div><div class="sv">${AppState.tickers.length} / ${results.length}</div></div>
      <div class="sum-chip"><div class="sk">Advance / Decline</div><div class="sv"><span style="color:var(--green)">${advances}</span> : <span style="color:var(--red)">${declines}</span></div></div>
      <div class="sum-chip"><div class="sk">Avg RSI</div><div class="sv">${Math.round(results.reduce((a, b) => a + b.rsiVal, 0) / results.length)}</div></div>
      <div class="sum-chip"><div class="sk">Scan Time</div><div class="sv">${window._lastScanDuration || '0.0'}s</div></div>
    `;
  }

  const isOptions = ['bps', 'strangle', 'iv_crush', 'csp', 'cc', 'bear_call'].includes(AppState.strategy);

  let html = '';
  if (isOptions) {
    html += '<div class="options-tabs" style="grid-column: 1 / -1; display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: thin;">';
    results.forEach((r, idx) => {
      html += `<button class="pill ${idx === 0 ? 'active' : ''}" onclick="switchOptionTab('${r.ticker}')" data-ticker="${r.ticker}" style="flex-shrink:0;">${r.ticker}</button>`;
    });
    html += '</div>';

    results.forEach((r, idx) => {
      html += `<div id="opt-tab-${r.ticker}" class="opt-tab-content" style="grid-column: 1 / -1; display: ${idx === 0 ? 'block' : 'none'};">`;
      html += renderOptionCards(r, AppState.strategy);
      html += `</div>`;
    });

    if (!window.switchOptionTab) {
      window.switchOptionTab = (ticker) => {
        document.querySelectorAll('.opt-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.options-tabs .pill').forEach(el => el.classList.remove('active'));
        const targetTab = document.getElementById('opt-tab-' + ticker);
        const targetPill = document.querySelector(`.options-tabs .pill[data-ticker="${ticker}"]`);
        if (targetTab) targetTab.style.display = 'block';
        if (targetPill) targetPill.classList.add('active');
      };
    }
  } else {
    // 1. Pre-calculate Scores and Sort (Highest to Lowest)
    results.forEach(r => {
      let calcScore = 0;
      if (r.curr > r.ema200) calcScore += 10;
      if (r.curr > r.ema50) calcScore += 10;
      if (r.curr > r.ema20) calcScore += 10;

      if (r.rsiVal > 40 && r.rsiVal < 70) calcScore += 20;
      else if (r.rsiVal >= 70) calcScore += 10;
      else if (r.rsiVal <= 30) calcScore += 5;

      if (r.adxVal > 25) calcScore += 20;
      else if (r.adxVal > 20) calcScore += 10;

      if (r.macdHist > 0) calcScore += 15;
      else if (r.macdHist > -1) calcScore += 5;

      if (r.vr > 2.0) calcScore += 15;
      else if (r.vr > 1.2) calcScore += 10;
      else if (r.vr > 0.8) calcScore += 5;

      r.score = r.score || calcScore;
    });

    // Sort Descending by Score
    results.sort((a, b) => b.score - a.score);

    // 2. Render Cards
    results.forEach(r => {
      const chgClass = r.chgPct >= 0 ? 'chg-pos' : 'chg-neg';
      const chgSign = r.chgPct >= 0 ? '+' : '';

      const rsiOk = r.rsiVal > 50 && r.rsiVal < 70, rsiWarn = r.rsiVal >= 70;
      const adxOk = r.adxVal > 25, adxWarn = r.adxVal > 20;
      const vrOk = r.vr >= 1.5, vrWarn = r.vr >= 1.0;

      const score = r.score;

      const barW = score;
      const barCol = score >= 75 ? '#22d08a' : score >= 55 ? '#f5a623' : '#f05a5a';
      const dotClass = (ok, warn) => ok ? 'dy' : warn ? 'dm' : 'dn';

      const strategyLabels = {
        all: 'All Stocks',
        ttm_orb: 'TTM Squeeze + ORB',
        intraday_retest: 'SMC Sweep & Retest',
        ohl_bullish: 'Open = Low',
        ohl_bearish: 'Open = High',
        btst: 'BTST Momentum',
        crsi: 'Connors RSI',
        minervini: 'Minervini VCP',
        darvas: 'Darvas Box',
        rs: 'Relative Strength',
        vcp_down: 'VCP Breakdown',
        bear_call: 'Bear Call Spread',
        bps: 'Bull Put Spread',
        strangle: 'Short Strangle',
        iv_crush: 'Earnings IV Crush',
        wheel: 'The Wheel / CSP',
        weinstein: 'Stan Weinstein Stage 2',
        wyckoff: 'Wyckoff Stopping Vol',
        hm_bottom: 'HM Bottom',
        hm_top: 'HM Top',
        hm_bullish: 'HM Bullish',
        hm_bearish: 'HM Bearish',
        hm_chop: 'HM Chop',
        xmomentum: 'Fresh Momentum',
        csp: 'Cash Secured Put',
        cc: 'Covered Call'
      };

      let tagsHtml = '';
      if (AppState.strategy === 'all') {
        if (r.matches && r.matches.length > 0) {
          r.matches.forEach(m => {
            tagsHtml += `<span class="setup-tag tag-breakout">${strategyLabels[m] || m.toUpperCase()}</span>`;
          });
        }
      } else {
        const setupName = strategyLabels[AppState.strategy] || AppState.strategy.toUpperCase();
        tagsHtml = `<span class="setup-tag tag-breakout">${setupName}</span>`;
      }

      // Add Dynamic Warning / Alert Tags
      if (r.rsiVal > 70) tagsHtml += `<span class="tag orange">RSI Overbought</span>`;
      if (r.rsiVal < 30) tagsHtml += `<span class="tag green">RSI Oversold</span>`;
      if (r.vr > 2.0) tagsHtml += `<span class="tag green">Vol Surge</span>`;
      if (r.curr < r.ema200) tagsHtml += `<span class="tag red">Below 200 EMA</span>`;
      if (r.curr > r.ema50 && r.ema50 > r.ema200) tagsHtml += `<span class="tag green">Strong Trend</span>`;
      if (r.chgPct < -3) tagsHtml += `<span class="tag red">Heavy Drop</span>`;
      if (r.macdHist > 0 && r.macdVal < 0) tagsHtml += `<span class="tag green">MACD Bullish Cross</span>`;
      if (r.cciVal > 100) tagsHtml += `<span class="tag orange">CCI Extremes (Overbought)</span>`;
      if (r.cciVal < -100) tagsHtml += `<span class="tag green">CCI Extremes (Oversold)</span>`;
      if (r.curr > r.ema50 && r.curr < r.ema50 * 1.02) tagsHtml += `<span class="tag green">Near 50 EMA Support</span>`;

      tagsHtml = `<div class="tags-container" style="margin-bottom:8px;">${tagsHtml}</div>`;

      // Calculate 14-day ATR for dynamic holding period estimation
      let estHold = 'Unknown';
      if (['ttm_orb', 'intraday_retest', 'ohl_bullish', 'ohl_bearish'].includes(AppState.strategy)) {
        estHold = 'Intraday';
      } else if (['btst'].includes(AppState.strategy)) {
        estHold = '1-2 Days';
      } else {
        // Dynamic ATR calculation
        let sumTr = 0;
        let validDays = 0;
        const nData = r.data.closes.length;
        const atrPeriod = 14;
        for (let i = Math.max(1, nData - atrPeriod); i < nData; i++) {
          const tr = Math.max(
            r.data.highs[i] - r.data.lows[i],
            Math.abs(r.data.highs[i] - r.data.closes[i - 1]),
            Math.abs(r.data.lows[i] - r.data.closes[i - 1])
          );
          sumTr += tr;
          validDays++;
        }
        const atr = validDays > 0 ? (sumTr / validDays) : (r.curr * 0.02); // fallback 2% daily move

        const targetDistance = Math.abs(r.t1 - r.entry);
        let days = Math.ceil(targetDistance / atr);
        if (days < 1) days = 1;

        if (days <= 5) {
          estHold = `${days}-${days + 2} Days`;
        } else if (days <= 15) {
          const wks = Math.ceil(days / 5);
          estHold = `${wks}-${wks + 1} Weeks`;
        } else {
          const mos = Math.ceil(days / 21);
          estHold = `${mos}-${mos + 1} Months`;
        }
      }

      // Calculate Position Sizing
      let positionHtml = '';
      const cap = parseFloat(AppState.capital) || 0;
      if (cap > 0 && r.entry > 0) {
        // If options strategy (margin provided), size based on margin, else size based on cash capital
        if (r.margin) {
          const lots = Math.floor(cap / r.margin);
          const investment = lots * r.margin;
          positionHtml = `
          <div style="margin-bottom: 12px; padding: 10px 12px; background: rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59, 130, 246, 0.3); border-radius: 6px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--text-muted)">Suggested Lots</span><span style="font-weight:600; color:var(--text-main)">${lots} Lots</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--text-muted)">Est. Margin Reqd</span><span style="font-weight:600; color:var(--text-main)">₹${investment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
          </div>
        `;
        } else {
          const qty = Math.floor(cap / r.entry);
          const investment = qty * r.entry;
          const riskAmt = qty * (r.entry - r.stop);
          const projReturn = qty * (r.t1 - r.entry);
          if (qty > 0) {
            positionHtml = `
            <div style="margin-bottom: 12px; padding: 10px 12px; background: rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59, 130, 246, 0.3); border-radius: 6px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--text-muted)">Qty (Pos Size)</span><span style="font-weight:600; color:var(--text-main)">${qty}</span></div>
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--text-muted)">Est. Hold Time</span><span style="font-weight:600; color:var(--text-main)">${estHold}</span></div>
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--text-muted)">Investment</span><span style="font-weight:600; color:var(--text-main)">₹${investment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
              <div style="display:flex; justify-content:space-between; font-size:12px;"><span style="color:var(--text-muted)">Risk / Reward (T1)</span><span style="font-weight:600"><span style="color:var(--red)">-₹${Math.abs(riskAmt).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> <span style="color:var(--text-muted)">/</span> <span style="color:var(--green)">+₹${projReturn.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></span></div>
            </div>
          `;
          }
        }
      }

      html += `
      <div class="scard">
        <div class="scard-accent" style="background:var(--accent)"></div>
        <div class="scard-top">
          <div>
            <div class="scard-ticker" style="display: flex; align-items: center; gap: 6px;">
              ${r.ticker}
              <a href="https://in.tradingview.com/chart/?symbol=NSE:${r.ticker}" target="_blank" title="View on TradingView" style="color: var(--text-muted); display: flex;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-5 5"/>
                </svg>
              </a>
            </div>
          </div>
          <span class="score-badge ${score >= 75 ? 'score-s' : 'score-m'}">${score}/100</span>
        </div>
        
        <div class="price-row" style="margin-bottom: 8px;">
          <span class="price">₹${r.curr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          <span class="chg ${chgClass}">${chgSign}${r.chgPct}%</span>
        </div>
        <div style="margin-bottom: 12px;">${tagsHtml}</div>
        
        <div class="score-bar"><div class="score-bar-fill" style="width:${barW}%;background:${barCol}"></div></div>
        
        <div class="scard-reason">${r.reason}</div>
        
        ${positionHtml}

        <div class="levels" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 6px; padding-bottom: 12px;">
          <div class="lv lv-entry"><div class="lk">Entry</div><div class="lv2">₹${r.entry.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div></div>
          <div class="lv lv-stop"><div class="lk">Stop Loss</div><div class="lv2">₹${r.stop.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div></div>
          <div class="lv lv-target"><div class="lk">Target 1</div><div class="lv2">₹${r.t1.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div></div>
        </div>
        
        <details class="scard-details">
          <summary>View Technicals ▼</summary>
          <div style="margin-top: 12px;">
            <div class="indicator-grid">
              <div class="ind"><div class="ik">RSI 14</div><div class="iv" style="color:${rsiOk ? 'var(--green)' : rsiWarn ? 'var(--red)' : 'var(--muted)'}">${r.rsiVal}</div></div>
              <div class="ind"><div class="ik">ADX 14</div><div class="iv" style="color:${adxOk ? 'var(--green)' : adxWarn ? 'var(--amber)' : 'var(--muted)'}">${r.adxVal}</div></div>
              <div class="ind"><div class="ik">Vol ×</div><div class="iv" style="color:${vrOk ? 'var(--green)' : vrWarn ? 'var(--amber)' : 'var(--muted)'}">${r.vr}×</div></div>
              <div class="ind"><div class="ik">EMA 20</div><div class="iv">₹${r.ema20.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div></div>
              <div class="ind"><div class="ik">EMA 50</div><div class="iv">₹${r.ema50.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div></div>
              <div class="ind"><div class="ik">EMA 200</div><div class="iv">₹${r.ema200.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</div></div>
              <div class="ind"><div class="ik">MACD</div><div class="iv" style="color:${r.macdHist >= 0 ? 'var(--green)' : 'var(--red)'}">${r.macdVal.toFixed(2)}</div></div>
              <div class="ind"><div class="ik">CCI 34</div><div class="iv" style="color:${r.cciVal > 100 ? 'var(--green)' : r.cciVal < -100 ? 'var(--red)' : 'var(--muted)'}">${r.cciVal.toFixed(1)}</div></div>
            </div>
            <div class="signal-dots">
              <span class="dot-row"><span class="dot ${r.curr > r.ema200 ? 'dy' : 'dn'}"></span>200 EMA</span>
              <span class="dot-row"><span class="dot ${r.curr > r.ema50 ? 'dy' : 'dn'}"></span>50 EMA</span>
              <span class="dot-row"><span class="dot ${r.curr > r.ema20 ? 'dy' : 'dn'}"></span>20 EMA</span>
              <span class="dot-row"><span class="dot ${dotClass(rsiOk, rsiWarn)}"></span>RSI</span>
              <span class="dot-row"><span class="dot ${dotClass(adxOk, adxWarn)}"></span>ADX</span>
            </div>
          </div>
        </details>
        
        <div class="backtest-bar" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 8px; align-items: center;">
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
            <span style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Target %</span>
            <input type="number" id="bt-tp-${r.ticker}" value="10" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 4px; padding: 4px 6px; font-size: 12px; width: 100%;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
            <span style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Stop %</span>
            <input type="number" id="bt-sl-${r.ticker}" value="5" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 4px; padding: 4px 6px; font-size: 12px; width: 100%;">
          </div>
          <button onclick="triggerBacktest('${r.ticker}', '${AppState.strategy === 'all' ? (r.matches && r.matches.length > 0 ? r.matches[0] : 'minervini') : AppState.strategy}', this)" style="background: var(--accent); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; align-self: flex-end; height: 26px; transition: opacity 0.2s;">Run Backtest</button>
        </div>
        <div id="bt-results-${r.ticker}" style="display: none; margin-top: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; border: 1px solid rgba(255,255,255,0.05); font-size: 11px;"></div>
      </div>
    `;

      // Cache data for backtesting
      window._cachedStockData[r.ticker] = r.data;
    });
  }

  DOM.resultsArea.innerHTML = html;
}

window.triggerBacktest = (ticker, strategyId, btn) => {
  const data = window._cachedStockData[ticker];
  if (!data) return alert("Data not found for backtest");

  const tpInput = document.getElementById(`bt-tp-${ticker}`);
  const slInput = document.getElementById(`bt-sl-${ticker}`);
  const resultsDiv = document.getElementById(`bt-results-${ticker}`);

  const targetPct = parseFloat(tpInput.value) || 10;
  const slPct = parseFloat(slInput.value) || 5;

  btn.innerText = "Running...";
  btn.style.opacity = "0.5";

  // Run backtest async to not block UI thread
  setTimeout(() => {
    try {
      const results = runBacktest(strategyId, data, targetPct, slPct, AppState.timeframe);
      const isProfitable = results.totalReturn >= 0;
      resultsDiv.style.display = "block";
      resultsDiv.innerHTML = `
        <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">
          Test Period: <b>${results.startDate}</b> — <b>${results.endDate}</b>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 6px;">
          <div><div style="color:var(--text-muted)">Win Rate</div><div style="font-weight:bold; color: ${results.winRate >= 50 ? 'var(--green)' : 'var(--red)'}">${results.winRate}%</div></div>
          <div><div style="color:var(--text-muted)">Trades</div><div style="font-weight:bold;">${results.totalTrades} (<span style="color:var(--green)">${results.wins}</span>/<span style="color:var(--red)">${results.losses}</span>)</div></div>
          <div><div style="color:var(--text-muted)">Net PnL</div><div style="font-weight:bold; color: ${isProfitable ? 'var(--green)' : 'var(--red)'}">${isProfitable ? '+' : ''}${results.totalReturn}%</div></div>
        </div>
        <div style="margin-top: 8px;">
          <button class="btn btn-primary" style="width: 100%; font-size: 12px; padding: 6px;" onclick="window._openBtUI('${ticker}', '${strategyId}')">View Detailed Report 📈</button>
        </div>
      `;

      // Expose function for the button
      window._openBtUI = (tck, str) => {
        openStrategyTester(tck, AppState.timeframe, str, results, data);
      };
    } catch (err) {
      console.error(err);
      alert("Backtest failed: " + err.message);
    } finally {
      btn.innerText = "Run Backtest";
      btn.style.opacity = "1";
    }
  }, 10);
};

document.addEventListener('DOMContentLoaded', init);

function calculateHeikinAshi(opens, highs, lows, closes) {
  const n = closes.length;
  const haClose = new Array(n);
  const haOpen = new Array(n);
  const haHigh = new Array(n);
  const haLow = new Array(n);

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
