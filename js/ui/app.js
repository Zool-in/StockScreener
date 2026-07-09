// ─── Main App Entry Point ───────────────────────────────────────────────────
import { AppState } from '../core/state.js?v=6';
import { fetchOHLCV } from '../core/api.js?v=6';
import { ema, rsi, adx } from '../core/math.js?v=6';

// Strategy Modules (We will create these next)
import * as swingStrats from '../strategies/swing.js?v=6';
import * as intradayStrats from '../strategies/intraday.js?v=6';
import * as optionStrats from '../strategies/options.js?v=6';
import * as btstStrats from '../strategies/btst.js?v=6';
import * as longTermStrats from '../strategies/longterm.js?v=6';
import * as shortStrats from '../strategies/short.js?v=6';

const DOM = {
  tickerInput: document.getElementById('tickerInput'),
  universePills: document.getElementById('universePills'),
  customTickerWrapper: document.getElementById('customTickerWrapper'),
  strategyPills: document.getElementById('strategyPills'),
  timeframePills: document.getElementById('timeframePills'),
  capitalInput: document.getElementById('capitalInput'),
  scanBtn: document.getElementById('scanBtn'),
  scanBtn: document.getElementById('scanBtn'),
  resultsArea: document.getElementById('resultsArea'),
};

const STRATEGY_INFO = {
  ttm_orb: {
    name: 'TTM Squeeze + ORB',
    desc: 'Combines the TTM Squeeze (Bollinger Bands narrowing inside Keltner Channels indicating low volatility) with an Opening Range Breakout (ORB) on surging volume. It looks for explosive moves out of tight consolidation.',
    example: '<strong>Entry:</strong> Breakout of current High<br><strong>Stop:</strong> 1% below entry<br><strong>Target:</strong> High momentum intraday run<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., ITC has been trading flat between ₹400-₹405 for 2 weeks (Squeeze). Today at 9:30 AM, it breaks ₹406 on 3x normal volume (ORB).</span>'
  },
  btst: {
    name: 'BTST Momentum',
    desc: 'Buy Today, Sell Tomorrow (BTST). Looks for stocks closing at the absolute high of the day on surging volume. This indicates institutional accumulation at the closing bell, which often gaps up the next morning.',
    example: '<strong>Entry:</strong> Buy at Market Close<br><strong>Stop:</strong> 1.5% below entry<br><strong>Target:</strong> Sell next morning on gap up<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., At 3:25 PM, TATA MOTORS surges to close at the absolute high of the day (₹1050) on massive volume. Buy now to sell on the likely gap-up tomorrow at 9:15 AM.</span>'
  },
  crsi: {
    name: 'Connors RSI',
    desc: 'A mean-reversion strategy that looks for statistically oversold conditions in a long-term uptrend. It uses a 3-period RSI and streak counting to find "rubber band" setups that are stretched too far down.',
    example: '<strong>Entry:</strong> Buy on the close<br><strong>Stop:</strong> 4% below entry<br><strong>Target:</strong> Sell after 2-4 day snapback bounce<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., L&T is in a long-term uptrend but drops 3 days in a row due to market panic, pushing its 3-period RSI below 10. You buy the dip expecting a sharp bounce.</span>'
  },
  minervini: {
    name: 'Minervini VCP',
    desc: 'Volatility Contraction Pattern. Looks for stocks in a Stage 2 uptrend (above 150 & 200 EMA) that are consolidating in a tight coil near 52-week highs, with volume drying up dramatically.',
    example: '<strong>Entry:</strong> Breakout of current tight range high<br><strong>Stop:</strong> 5% risk<br><strong>Target:</strong> Multi-week swing trade<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., HAL rallied 50%, then consolidated for 6 weeks. The swings get tighter (15% drop, then 8%, then 3%), and volume disappears. You buy the breakout of the 3% tight range.</span>'
  },
  darvas: {
    name: 'Darvas Box',
    desc: 'Identifies stocks that have been trading in a tight horizontal range (< 15%) for multiple months, and are suddenly breaking out of the "Box" top on massive volume.',
    example: '<strong>Entry:</strong> Breakout of Box Top<br><strong>Stop:</strong> Right below the Box Top line<br><strong>Target:</strong> Ride the trend until a new box forms<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., RELIANCE bounces between ₹2300 and ₹2500 for 4 months (The Box). Today, it rips above ₹2500 on huge volume. You buy the breakout.</span>'
  },
  rs: {
    name: 'Relative Strength',
    desc: 'Focuses on stocks showing extreme internal momentum and ignoring market weakness. Looks for ADX > 30 and RSI > 60 in a strong established trend.',
    example: '<strong>Entry:</strong> Buy breakout<br><strong>Stop:</strong> 5% risk<br><strong>Target:</strong> Ride the runaway trend<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., NIFTY is down 2% today, but ZOMATO is up 4% making new 52-week highs with an ADX of 35. You buy the strength because it is ignoring market gravity.</span>'
  },
  vcp_down: {
    name: 'VCP Breakdown',
    desc: 'The bearish inverse of VCP. Looks for tight consolidation below the 200 EMA that suddenly snaps downwards on massive volume.',
    example: '<strong>Entry:</strong> Breakdown of current low<br><strong>Stop:</strong> 3% risk<br><strong>Target:</strong> Heavy drop acceleration<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., WIPRO is in a long downtrend below its 200 EMA. It consolidates tightly for 3 weeks, then suddenly breaks the support level on high volume. You short the breakdown.</span>'
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
    example: '<strong>Action:</strong> Sell ATM or slightly OTM Put.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., ICICI BANK is a great long-term hold but temporarily drops to ₹1050. You sell the 1000 Put for ₹20 premium. If it stays above 1000, you keep the ₹20. If it drops, you buy it at ₹1000!</span>'
  },
  cc: {
    name: 'Covered Call',
    desc: 'For stocks you already own. Identifies when a strong stock becomes temporarily overbought (RSI > 70). A great time to sell calls against your shares to collect premium.',
    example: '<strong>Action:</strong> Sell short-term OTM Call.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., You own 500 shares of SBI. It suddenly rockets to ₹850 (RSI 80) and looks exhausted. You sell the 900 Call, collecting premium while keeping your shares.</span>'
  },
  weinstein: {
    name: 'Stan Weinstein Stage 2',
    desc: 'A classic long-term strategy. Looks for a stock breaking out of a flat Stage 1 base, crossing its 30-period MA on massive (200%+) volume into a Stage 2 markup.',
    example: '<strong>Entry:</strong> Buy at market<br><strong>Stop:</strong> Below the 30-period MA<br><strong>Target:</strong> Multi-month / multi-year hold<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., SUZLON did nothing for 2 years (Stage 1 base). Suddenly, it crosses its 30-week Moving Average on record volume. You buy and hold for a multi-year Stage 2 uptrend.</span>'
  },
  wyckoff: {
    name: 'Wyckoff Stopping Vol',
    desc: 'Identifies institutional accumulation. Looks for a massive volume spike during a downtrend where the price refuses to drop further (e.g. Doji or Hammer), indicating smart money is absorbing all selling pressure.',
    example: '<strong>Entry:</strong> Buy near close<br><strong>Stop:</strong> Below the stopping candle low<br><strong>Target:</strong> Reversal swing trade<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> E.g., PAYTM is crashing for weeks. Today, volume is 5x normal, but the price forms a perfect Doji (it stops going down). This is "Stopping Volume"—institutions are quietly buying the panic.</span>'
  }
};

// ─── Initialize ─────────────────────────────────────────────────────────────
async function init() {
  fetchStatus();
  setInterval(fetchStatus, 30000); // refresh every 30s
  
  // Setup Universe Pills
  DOM.universePills.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('pill')) return;
    
    // UI Update
    Array.from(DOM.universePills.children).forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    
    const val = e.target.dataset.val;
    if (val === 'custom') {
      DOM.customTickerWrapper.classList.remove('hidden');
      AppState.setTickers(DOM.tickerInput.value.split(',').map(s=>s.trim()).filter(Boolean));
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
    
    AppState.setStrategy(pill.dataset.val);
    
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
      AppState.setTickers(e.target.value.split(',').map(s=>s.trim()).filter(Boolean));
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
  
  // Auto-run the scan on initial load
  runScan();
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
      mmiBadge.innerText = `MMI: ${mmiData.value || 'N/A'}`;
      if (mmiData.value < 30) mmiBadge.className = 'badge badge-green';
      else if (mmiData.value > 70) mmiBadge.className = 'badge badge-red';
      else mmiBadge.className = 'badge badge-amber';
    }
  } catch (e) {
    console.error('Failed to fetch status:', e);
  }
}

// ─── Scan Runner ────────────────────────────────────────────────────────────
async function runScan() {
  if (AppState.tickers.length === 0) return;
  
  DOM.scanBtn.disabled = true;
  DOM.scanBtn.innerHTML = `<div class="spinner"></div> <span>Scanning...</span>`;
  DOM.resultsArea.innerHTML = '';
  document.getElementById('adStrip').style.display = 'none';
  document.getElementById('summaryBar').style.display = 'none';
  
  const results = [];
  const strategyId = AppState.strategy;

  for (let ticker of AppState.tickers) {
    try {
      const data = await fetchOHLCV(ticker, AppState.timeframe);
      const n = data.closes.length;
      if (n < 200) continue; // Need data

      const curr = data.closes[n - 1];
      const prev = data.closes[n - 2];
      const chgPct = parseFloat(((curr - prev) / prev * 100).toFixed(2));
      
      let res = null;
      let matchedStrategies = [];

      if (strategyId === 'all') {
        const allStrategies = ['ttm_orb', 'minervini', 'darvas', 'rs', 'crsi', 'bps', 'strangle', 'iv_crush', 'wheel', 'btst', 'weinstein', 'wyckoff', 'vcp_down', 'bear_call'];
        for (const s of allStrategies) {
          let tempRes = null;
          if (['ttm_orb'].includes(s)) tempRes = intradayStrats.run(s, data);
          else if (['minervini', 'darvas', 'rs', 'crsi'].includes(s)) tempRes = swingStrats.run(s, data);
          else if (['bps', 'strangle', 'iv_crush', 'wheel', 'csp'].includes(s)) tempRes = optionStrats.run(s, data);
          else if (['btst'].includes(s)) tempRes = btstStrats.run(s, data);
          else if (['weinstein', 'wyckoff'].includes(s)) tempRes = longTermStrats.run(s, data);
          else if (['vcp_down', 'bear_call'].includes(s)) tempRes = shortStrats.run(s, data);
          
          if (tempRes && tempRes.isMatch) {
            matchedStrategies.push(s);
          }
        }
        res = { isMatch: true, reason: 'Unfiltered metrics view', matches: matchedStrategies };
      } else {
        if (['ttm_orb'].includes(strategyId)) res = intradayStrats.run(strategyId, data);
        else if (['minervini', 'darvas', 'rs', 'crsi'].includes(strategyId)) res = swingStrats.run(strategyId, data);
        else if (['bps', 'strangle', 'iv_crush', 'wheel', 'csp'].includes(strategyId)) res = optionStrats.run(strategyId, data);
        else if (['btst'].includes(strategyId)) res = btstStrats.run(strategyId, data);
        else if (['weinstein', 'wyckoff'].includes(strategyId)) res = longTermStrats.run(strategyId, data);
        else if (['vcp_down', 'bear_call'].includes(strategyId)) res = shortStrats.run(strategyId, data);
      }

      if (res && res.isMatch) {
        // Compute standard technicals for the card
        const ema20 = ema(data.closes, 20);
        const ema50 = ema(data.closes, 50);
        const ema200 = ema(data.closes, 200);
        const rsiVal = rsi(data.closes);
        const adxVal = adx(data.highs, data.lows, data.closes);
        
        const recentVol = data.volumes[n - 1];
        const avgVol = data.volumes.slice(n - 21, n - 1).reduce((a,b)=>a+b,0) / 20;
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
        // If the strategy doesn't provide a specific trigger price, default to the previous candle's close
        // so the Entry price remains a static reference point instead of fluctuating identically with the Live Price.
        const prevClose = data.closes[n - 2] || curr;
        const entry = res.entry || prevClose;
        const stop = res.risk ? entry - res.risk : entry * 0.95;
        const riskAmount = entry - stop;
        const t1 = entry + (riskAmount * 1.5);
        const t2 = entry + (riskAmount * 3);

        results.push({
          ticker, data, ...res, 
          chgPct, curr, ema20, ema50, ema200, rsiVal, adxVal, vr, 
          entry, stop, t1, t2, s1, s2, s3, r1, r2, r3
        });
      }
    } catch (e) {
      console.error(`Skipping ${ticker}: `, e);
    }
  }

  // Overlay Live Prices
  try {
    const symbolsParam = results.map(r => r.ticker).join(',');
    if (symbolsParam) {
      DOM.scanBtn.innerHTML = `<div class="spinner"></div> <span>Fetching Live Prices...</span>`;
      const qRes = await fetch(`/api/quotes?symbols=${symbolsParam}`);
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
  } catch (e) {
    console.error("Failed to fetch live quotes", e);
  }

  AppState.setResults(results);
  renderResults(results);
  
  DOM.scanBtn.disabled = false;
  DOM.scanBtn.innerHTML = `<span>Run Scan</span>`;
}

// ─── UI Renderer ────────────────────────────────────────────────────────────
function renderResults(results) {
  if (results.length === 0) {
    DOM.resultsArea.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 64px 0;">No matching setups found for the selected strategy.</div>`;
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
      <div class="ad-green" style="width:${(advances/total)*100}%"></div>
      <div class="ad-red" style="width:${(declines/total)*100}%"></div>
    `;

    const sumBar = document.getElementById('summaryBar');
    sumBar.style.display = 'flex';
    sumBar.innerHTML = `
      <div class="sum-chip"><div class="sk">Scanned / Matched</div><div class="sv">${AppState.tickers.length} / ${results.length}</div></div>
      <div class="sum-chip"><div class="sk">Advance / Decline</div><div class="sv"><span style="color:var(--green)">${advances}</span> : <span style="color:var(--red)">${declines}</span></div></div>
      <div class="sum-chip"><div class="sk">Avg RSI</div><div class="sv">${Math.round(results.reduce((a,b)=>a+b.rsiVal,0)/results.length)}</div></div>
    `;
  }

  let html = '';
  results.forEach(r => {
    const chgClass = r.chgPct >= 0 ? 'chg-pos' : 'chg-neg';
    const chgSign = r.chgPct >= 0 ? '+' : '';
    
    const rsiOk = r.rsiVal > 50 && r.rsiVal < 70, rsiWarn = r.rsiVal >= 70;
    const adxOk = r.adxVal > 25, adxWarn = r.adxVal > 20;
    const vrOk = r.vr >= 1.5, vrWarn = r.vr >= 1.0;
    
    // Default score visualizer if strategy doesn't return one
    const score = r.score || 75; 
    const barW = score;
    const barCol = score >= 75 ? '#22d08a' : score >= 55 ? '#f5a623' : '#f05a5a';
    const dotClass = (ok, warn) => ok ? 'dy' : warn ? 'dm' : 'dn';

    const strategyLabels = {
      all: 'All Stocks',
      ttm_orb: 'TTM Squeeze + ORB',
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
      wyckoff: 'Wyckoff Stopping Vol'
    };
    
    let tagsHtml = '';
    if (AppState.strategy === 'all' && r.matches && r.matches.length > 0) {
      r.matches.forEach(m => {
        tagsHtml += `<span class="setup-tag tag-breakout">${strategyLabels[m] || m.toUpperCase()}</span>`;
      });
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
    
    tagsHtml = `<div class="tags-container" style="margin-bottom:8px;">${tagsHtml}</div>`;

    // Calculate Position Sizing
    let positionHtml = '';
    const cap = parseFloat(AppState.capital) || 0;
    if (cap > 0 && r.entry > 0) {
      // If options strategy (margin provided), size based on margin, else size based on cash capital
      if (r.margin) {
        const lots = Math.floor(cap / r.margin);
        const investment = lots * r.margin;
        positionHtml = `
          <div class="levels" style="grid-template-columns: repeat(2, 1fr); margin-bottom: 6px; background: rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59, 130, 246, 0.3);">
            <div class="lv"><div class="lk">Suggested Lots</div><div class="lv2">${lots} Lots</div></div>
            <div class="lv"><div class="lk">Est. Margin Reqd</div><div class="lv2">₹${investment.toLocaleString('en-IN', {maximumFractionDigits: 0})}</div></div>
          </div>
        `;
      } else {
        const qty = Math.floor(cap / r.entry);
        const investment = qty * r.entry;
        const riskAmt = qty * (r.entry - r.stop);
        const projReturn = qty * (r.t1 - r.entry);
        if (qty > 0) {
          positionHtml = `
            <div class="levels" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 6px; background: rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59, 130, 246, 0.3);">
              <div class="lv"><div class="lk">Qty (Pos Size)</div><div class="lv2">${qty}</div></div>
              <div class="lv"><div class="lk">Investment</div><div class="lv2">₹${investment.toLocaleString('en-IN', {maximumFractionDigits: 0})}</div></div>
              <div class="lv"><div class="lk">Risk / Reward (T1)</div><div class="lv2"><span style="color:var(--red)">-₹${Math.abs(riskAmt).toLocaleString('en-IN', {maximumFractionDigits:0})}</span> / <span style="color:var(--green)">+₹${projReturn.toLocaleString('en-IN', {maximumFractionDigits:0})}</span></div></div>
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
            <div class="scard-ticker">${r.ticker}</div>
            <div class="scard-name">${r.data.meta?.shortName || r.ticker}</div>
          </div>
          <span class="score-badge ${score >= 75 ? 'score-s' : 'score-m'}">${score}/100</span>
        </div>
        <div class="price-row">
          <span class="price">₹${r.curr.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
          <span class="chg ${chgClass}">${chgSign}${r.chgPct}%</span>
        </div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${barW}%;background:${barCol}"></div></div>
        
        ${tagsHtml}
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.3;">${r.reason}</div>
        
        ${positionHtml}

        <div class="indicator-grid">
          <div class="ind"><div class="ik">RSI 14</div><div class="iv" style="color:${rsiOk?'var(--green)':rsiWarn?'var(--red)':'var(--muted)'}">${r.rsiVal}</div></div>
          <div class="ind"><div class="ik">ADX 14</div><div class="iv" style="color:${adxOk?'var(--green)':adxWarn?'var(--amber)':'var(--muted)'}">${r.adxVal}</div></div>
          <div class="ind"><div class="ik">Vol ×</div><div class="iv" style="color:${vrOk?'var(--green)':vrWarn?'var(--amber)':'var(--muted)'}">${r.vr}×</div></div>
          <div class="ind"><div class="ik">EMA 20</div><div class="iv">₹${r.ema20.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="ind"><div class="ik">EMA 50</div><div class="iv">₹${r.ema50.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="ind"><div class="ik">EMA 200</div><div class="iv">₹${r.ema200.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
        </div>
        <div class="signal-dots">
          <span class="dot-row"><span class="dot ${r.curr > r.ema200?'dy':'dn'}"></span>200 EMA</span>
          <span class="dot-row"><span class="dot ${r.curr > r.ema50?'dy':'dn'}"></span>50 EMA</span>
          <span class="dot-row"><span class="dot ${r.curr > r.ema20?'dy':'dn'}"></span>20 EMA</span>
          <span class="dot-row"><span class="dot ${dotClass(rsiOk,rsiWarn)}"></span>RSI</span>
          <span class="dot-row"><span class="dot ${dotClass(adxOk,adxWarn)}"></span>ADX</span>
        </div>
        
        <div class="levels" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 6px;">
          <div class="lv lv-entry"><div class="lk">Entry</div><div class="lv2">₹${r.entry.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv lv-stop"><div class="lk">Stop</div><div class="lv2">₹${r.stop.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv lv-target"><div class="lk">Target 1</div><div class="lv2">₹${r.t1.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv lv-target"><div class="lk">Target 2</div><div class="lv2">₹${r.t2.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
        </div>
        
        <div class="levels" style="grid-template-columns: repeat(3, 1fr);">
          <div class="lv"><div class="lk">S1</div><div class="lv2">₹${r.s1.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv"><div class="lk">S2</div><div class="lv2">₹${r.s2.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv"><div class="lk">S3</div><div class="lv2">₹${r.s3.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv"><div class="lk">R1</div><div class="lv2">₹${r.r1.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv"><div class="lk">R2</div><div class="lv2">₹${r.r2.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
          <div class="lv"><div class="lk">R3</div><div class="lv2">₹${r.r3.toLocaleString('en-IN', {maximumFractionDigits: 1})}</div></div>
        </div>
      </div>
    `;
  });

  DOM.resultsArea.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', init);
