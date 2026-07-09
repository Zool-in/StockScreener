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
  strategySelect: document.getElementById('strategySelect'),
  timeframeSelect: document.getElementById('timeframeSelect'),
  capitalInput: document.getElementById('capitalInput'),
  scanBtn: document.getElementById('scanBtn'),
  resultsArea: document.getElementById('resultsArea'),
};

// ─── Initialize ─────────────────────────────────────────────────────────────
function init() {
  // Bind inputs to State
  DOM.tickerInput.addEventListener('input', e => AppState.setTickers(e.target.value.split(',').map(s=>s.trim()).filter(Boolean)));
  DOM.strategySelect.addEventListener('change', e => {
    AppState.setStrategy(e.target.value);
    // Auto-select timeframe based on strategy
    const strat = e.target.value;
    if (strat === 'ttm_orb') DOM.timeframeSelect.value = '15m';
    else if (['weinstein', 'wyckoff'].includes(strat)) DOM.timeframeSelect.value = '1wk';
    else DOM.timeframeSelect.value = '1d';
    AppState.setTimeframe(DOM.timeframeSelect.value);
  });
  DOM.timeframeSelect.addEventListener('change', e => AppState.setTimeframe(e.target.value));
  DOM.capitalInput.addEventListener('input', e => AppState.setCapital(e.target.value));

  DOM.scanBtn.addEventListener('click', runScan);

  // Initial State Sync
  AppState.setTickers(DOM.tickerInput.value.split(',').map(s=>s.trim()).filter(Boolean));
  AppState.setStrategy(DOM.strategySelect.value);
  AppState.setTimeframe(DOM.timeframeSelect.value);
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
      console.error(\`Skipping \${ticker}: \`, e);
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
      sizingHtml = `<div class="kv"><div class="k">1% Risk Size</div><div class="v v-accent">\${shares} shares</div></div>`;
    } else if (r.margin) {
      const lots = Math.floor(AppState.capital / r.margin);
      sizingHtml = `<div class="kv"><div class="k">Max Lots</div><div class="v v-accent">\${lots} lots</div></div>`;
    }

    html += `
      <div class="card">
        <div class="flex justify-between items-center" style="margin-bottom: 16px;">
          <h2 style="color: var(--accent); font-size: 1.5rem;">\${r.ticker}</h2>
          <div class="badge badge-green">MATCH</div>
        </div>
        <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 12px;">CMP: ₹\${r.data.cmp.toFixed(2)}</div>
        
        <div style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
          \${r.reason}
        </div>

        <div class="kv-grid">
          \${sizingHtml}
          \${r.metrics ? r.metrics.map(m => `<div class="kv"><div class="k">\${m.name}</div><div class="v">\${m.value}</div></div>`).join('') : ''}
        </div>
      </div>
    `;
  });

  DOM.resultsArea.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', init);
