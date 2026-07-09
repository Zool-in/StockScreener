// ─── Main App Entry Point ───────────────────────────────────────────────────
import { AppState } from '../core/state.js';
import { fetchOHLCV } from '../core/api.js';

// Strategy Modules (We will create these next)
import * as swingStrats from '../strategies/swing.js';
import * as intradayStrats from '../strategies/intraday.js';
import * as optionStrats from '../strategies/options.js';
import * as btstStrats from '../strategies/btst.js';
import * as longTermStrats from '../strategies/longterm.js';
import * as shortStrats from '../strategies/short.js';

const DOM = {
  tickerInput: document.getElementById('tickerInput'),
  universePills: document.getElementById('universePills'),
  customTickerWrapper: document.getElementById('customTickerWrapper'),
  strategyPills: document.getElementById('strategyPills'),
  timeframeSelect: document.getElementById('timeframeSelect'),
  capitalInput: document.getElementById('capitalInput'),
  scanBtn: document.getElementById('scanBtn'),
  resultsArea: document.getElementById('resultsArea'),
};

// ─── Initialize ─────────────────────────────────────────────────────────────
async function init() {
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
      DOM.timeframeSelect.value = tf;
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

  DOM.timeframeSelect.addEventListener('change', e => AppState.setTimeframe(e.target.value));
  DOM.capitalInput.addEventListener('input', e => AppState.setCapital(e.target.value));
  DOM.scanBtn.addEventListener('click', runScan);

  // Initial Data Load (Nifty 50)
  AppState.setStrategy('ttm_orb');
  AppState.setTimeframe('15m');
  
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

// ─── Scan Runner ────────────────────────────────────────────────────────────
async function runScan() {
  if (AppState.tickers.length === 0) return;
  
  DOM.scanBtn.disabled = true;
  DOM.scanBtn.innerHTML = `<div class="spinner"></div> <span>Scanning...</span>`;
  DOM.resultsArea.innerHTML = '';
  
  const results = [];
  const strategyId = AppState.strategy;

  for (let ticker of AppState.tickers) {
    try {
      const data = await fetchOHLCV(ticker, AppState.timeframe);
      
      let res = null;
      // Route to correct strategy module
      if (['ttm_orb'].includes(strategyId)) res = intradayStrats.run(strategyId, data);
      else if (['minervini', 'darvas', 'rs', 'crsi'].includes(strategyId)) res = swingStrats.run(strategyId, data);
      else if (['bps', 'strangle', 'iv_crush', 'wheel', 'csp'].includes(strategyId)) res = optionStrats.run(strategyId, data);
      else if (['btst'].includes(strategyId)) res = btstStrats.run(strategyId, data);
      else if (['weinstein', 'wyckoff'].includes(strategyId)) res = longTermStrats.run(strategyId, data);
      else if (['vcp_down', 'bear_call'].includes(strategyId)) res = shortStrats.run(strategyId, data);

      if (res && res.isMatch) {
        results.push({ ticker, data, ...res });
      }
    } catch (e) {
      console.error(`Skipping ${ticker}: `, e);
    }
  }

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

  let html = '';
  results.forEach(r => {
    // Determine position sizing based on AppState.capital and r.riskPerShare
    let sizingHtml = '';
    if (r.risk) {
      const maxLoss = AppState.capital * 0.01; // 1% risk rule
      const shares = Math.floor(maxLoss / r.risk);
      sizingHtml = `<div class="kv"><div class="k">1% Risk Size</div><div class="v v-accent">${shares} shares</div></div>`;
    } else if (r.margin) {
      const lots = Math.floor(AppState.capital / r.margin);
      sizingHtml = `<div class="kv"><div class="k">Max Lots</div><div class="v v-accent">${lots} lots</div></div>`;
    }

    html += `
      <div class="card">
        <div class="flex justify-between items-center" style="margin-bottom: 16px;">
          <h2 style="color: var(--accent); font-size: 1.5rem;">${r.ticker}</h2>
          <div class="badge badge-green">MATCH</div>
        </div>
        <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 12px;">CMP: ₹${r.data.cmp.toFixed(2)}</div>
        
        <div style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
          ${r.reason}
        </div>

        <div class="kv-grid">
          ${sizingHtml}
          ${r.metrics ? r.metrics.map(m => `<div class="kv"><div class="k">${m.name}</div><div class="v">${m.value}</div></div>`).join('') : ''}
        </div>
      </div>
    `;
  });

  DOM.resultsArea.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', init);
