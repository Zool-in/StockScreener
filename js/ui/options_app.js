
import { computeIV, bsGreeks } from '../core/math.js?v=2';

const DOM = {
  indexPills: document.getElementById('indexPills'),
  expiryPills: document.getElementById('expiryPills'),
  scanBtn: document.getElementById('scanBtn'),
  stockSelect: document.getElementById('stockSelect'),
  scanStatus: document.getElementById('scanStatus'),
  optionsBody: document.getElementById('optionsBody'),
  connStatus: document.getElementById('connStatus')
};

let activeIndex = 'NSE:NIFTY50-INDEX';
let selectedExpiry = null;
let lastIndexScanned = null;

async function init() {
  try {
    const res = await fetch('/fyers/status');
    const data = await res.json();
    if (data.connected) {
      DOM.connStatus.textContent = 'Brokers: Connected (Fyers)';
      DOM.connStatus.classList.remove('badge-muted', 'badge-red');
      DOM.connStatus.classList.add('badge-green');
    } else {
      DOM.connStatus.innerHTML = 'Brokers: Offline <a href="/fyers/login" style="margin-left:8px; color:inherit; text-decoration:underline;">Login</a>';
      DOM.connStatus.classList.add('badge-red');
    }
  } catch (e) {
    DOM.connStatus.textContent = 'Brokers: Error';
    DOM.connStatus.classList.add('badge-red');
  }

  initEventHandlers();
}

function initEventHandlers() {
  DOM.scanBtn.addEventListener('click', runScan);
  
  DOM.indexPills.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      DOM.indexPills.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      DOM.stockSelect.value = ""; // reset stock dropdown
    });
  });

  DOM.stockSelect.addEventListener('change', () => {
    if (DOM.stockSelect.value) {
      DOM.indexPills.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    } else {
      DOM.indexPills.querySelector('[data-val="NSE:NIFTY50-INDEX"]').classList.add('active');
    }
  });
}

async function runScan() {
  const activePill = DOM.indexPills.querySelector('.active');
  const currentIndex = DOM.stockSelect.value || (activePill ? activePill.dataset.val : 'NSE:NIFTY50-INDEX');
  
  if (currentIndex !== lastIndexScanned) {
      selectedExpiry = null; // reset expiry when switching symbols
      lastIndexScanned = currentIndex;
  }

  DOM.scanStatus.textContent = 'Scanning...';
  DOM.scanBtn.disabled = true;
  DOM.optionsBody.innerHTML = '<tr><td colspan="8" style="text-align:center">Loading Option Chain...</td></tr>';
  
  try {
    // Fetch underlying live price
    let underlyingLtp = null;
    try {
      const qRes = await fetch(`/api/quotes?symbols=${currentIndex}`);
      if (qRes.ok) {
        const qData = await qRes.json();
        const val = Object.values(qData)[0];
        if (typeof val === 'number' && !isNaN(val)) {
            underlyingLtp = val;
        } else if (val && val.ltp && !isNaN(val.ltp)) {
            underlyingLtp = val.ltp;
        }
      }
    } catch(e) { console.warn("Failed to fetch underlying LTP"); }

    let url = `/api/options/chain?symbol=${currentIndex}&strikecount=40`;
    if (selectedExpiry) url += `&expiry=${encodeURIComponent(selectedExpiry)}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    
    const data = await res.json();
    if (data.s !== 'ok' || !data.data || !data.data.optionsChain) {
      throw new Error('Invalid data from FYERS');
    }

    if (data.data.expiryData) {
      renderExpiryPills(data.data.expiryData);
    }

    renderChain(data.data.optionsChain, underlyingLtp);
    DOM.scanStatus.textContent = `Updated at ${new Date().toLocaleTimeString()} ${underlyingLtp ? `(Spot: ${underlyingLtp})` : ''}`;
  } catch (err) {
    DOM.scanStatus.textContent = 'Error';
    DOM.optionsBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red">${err.message}</td></tr>`;
  } finally {
    DOM.scanBtn.disabled = false;
  }
}

function renderExpiryPills(expiryData) {
  DOM.expiryPills.innerHTML = '';
  if (!expiryData || expiryData.length === 0) return;
  
  const expiries = expiryData.map(e => (typeof e === 'object' ? (e.expiry || e.date) : e)).filter(Boolean);
  
  expiries.slice(0, 8).forEach(exp => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    if (selectedExpiry === exp || (!selectedExpiry && exp === expiries[0])) {
      btn.classList.add('active');
    }
    btn.textContent = exp;
    btn.dataset.val = exp;
    btn.addEventListener('click', (e) => {
      DOM.expiryPills.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedExpiry = e.target.dataset.val;
      runScan(); // re-fetch with new expiry
    });
    DOM.expiryPills.appendChild(btn);
  });
}

function renderChain(chainData, underlyingLtp) {
  DOM.optionsBody.innerHTML = '';
  
  // Sort by strike price
  chainData.sort((a, b) => a.strike_price - b.strike_price);

  // 1. Find the highest OI to identify major support/resistance levels
  let maxCeOI = 1;
  let maxPeOI = 1;
  let atmStrike = null;
  let minDiff = Infinity;

  for (const row of chainData) {
    if (row.strike_price <= 0) continue; // Skip invalid strikes
    if (row.option_type === 'CE' && row.oi > maxCeOI) maxCeOI = row.oi;
    if (row.option_type === 'PE' && row.oi > maxPeOI) maxPeOI = row.oi;
    
    if (underlyingLtp) {
      const diff = Math.abs(row.strike_price - underlyingLtp);
      if (diff < minDiff) {
        minDiff = diff;
        atmStrike = row.strike_price;
      }
    }
  }

  for (const row of chainData) {
    if (row.strike_price <= 0) continue; // Skip invalid strikes
    
    const tr = document.createElement('tr');
    
    // Analyze for Gamma Squeeze Alerts
    let alertMsg = '';
    
    // Simplified Gamma Squeeze Logic:
    // If volume is extremely high relative to OI (e.g. > 100%) and price is up significantly
    const ce = row.option_type === 'CE' ? row : chainData.find(r => r.strike_price === row.strike_price && r.option_type === 'CE') || {};
    const pe = row.option_type === 'PE' ? row : chainData.find(r => r.strike_price === row.strike_price && r.option_type === 'PE') || {};
    
    // Skip duplicate iterations (since we combine CE/PE into one row based on strike)
    if (row.option_type === 'PE' && chainData.some(r => r.strike_price === row.strike_price && r.option_type === 'CE')) continue;
    
    const ceVol = ce.volume || 0;
    const ceOI = ce.oi || 1;
    const peVol = pe.volume || 0;
    const peOI = pe.oi || 1;

    // Identify ITM/OTM
    const isCeItm = underlyingLtp && row.strike_price < underlyingLtp;
    const isPeItm = underlyingLtp && row.strike_price > underlyingLtp;

    // Squeeze Logic (Trapped Writers)
    // A writer is trapped if their strike has significant OI (at least 15% of max) AND price moved against them (is ITM) AND volume is spiking
    if (ceOI > (maxCeOI * 0.15) && ceVol > (ceOI * 1.5) && isCeItm) {
        const info = "BULLISH SIGNAL: Call Writers (Resistance) are trapped! Strike is ITM. Suggestion: BUY ATM Call (CE).";
        alertMsg = `<div title="${info}" style="cursor:help; display:inline-flex; flex-direction:column; gap:4px; align-items:flex-end;">
            <span class="badge badge-purple" style="white-space:nowrap;">📈 BULLISH: CE Gamma Trap! ⓘ</span>
            <span style="font-size:10px; color:var(--text-green); font-weight:600; text-transform:uppercase; white-space:nowrap;">Suggest: Buy CE</span>
        </div>`;
        tr.classList.add('gamma-alert');
    } else if (peOI > (maxPeOI * 0.15) && peVol > (peOI * 1.5) && isPeItm) {
        const info = "BEARISH SIGNAL: Put Writers (Support) are trapped! Strike is ITM. Suggestion: BUY ATM Put (PE).";
        alertMsg = `<div title="${info}" style="cursor:help; display:inline-flex; flex-direction:column; gap:4px; align-items:flex-end;">
            <span class="badge badge-purple" style="white-space:nowrap;">📉 BEARISH: PE Gamma Trap! ⓘ</span>
            <span style="font-size:10px; color:var(--text-red); font-weight:600; text-transform:uppercase; white-space:nowrap;">Suggest: Buy PE</span>
        </div>`;
        tr.classList.add('gamma-alert');
    }
    
    // Highlight exact ATM row
    const isAtm = (row.strike_price === atmStrike);
    if (isAtm) {
        tr.classList.add('atm-row');
    }
    
    // Attempt to extract the CE and PE symbols if FYERS provided them, to link to charts
    const ceSym = ce.symbol || '';
    const peSym = pe.symbol || '';
    const strikeLink = ceSym ? `https://trade.fyers.in/popout/index.html?symbol=${ceSym}&resolution=5&theme=dark` : '#';

    // ─── CALCULATE GREEKS ───
    // Assume 3 days to expiry for a smoother Greek curve, Risk-Free Rate = 10%
    const T = 3.0 / 365.0; 
    const R = 0.10;
    const S = underlyingLtp || row.strike_price; // fallback to strike if spot unknown
    const K = row.strike_price;
    
    let ceDelta = '-', peDelta = '-';
    let ceGamma = '-', peGamma = '-';
    let ceTheta = '-', peTheta = '-';
    let ceIVStr = '-', peIVStr = '-';
    
    // Only calculate Greeks if there's an actual LTP to save CPU
    if (ce.ltp > 0) {
      const ceIV = computeIV(ce.ltp, S, K, T, R, 'CE');
      const ceGreeks = bsGreeks(S, K, T, R, ceIV, 'CE');
      ceDelta = ceGreeks.delta.toFixed(2);
      ceGamma = ceGreeks.gamma.toFixed(4);
      ceTheta = ceGreeks.theta.toFixed(2);
      ceIVStr = (ceIV * 100).toFixed(1);
    }
    if (pe.ltp > 0) {
      const peIV = computeIV(pe.ltp, S, K, T, R, 'PE');
      const peGreeks = bsGreeks(S, K, T, R, peIV, 'PE');
      peDelta = peGreeks.delta.toFixed(2);
      peGamma = peGreeks.gamma.toFixed(4);
      peTheta = peGreeks.theta.toFixed(2);
      peIVStr = (peIV * 100).toFixed(1);
    }

    // OI Visual Progress Bars
    const ceOiPct = maxCeOI > 0 ? (ceOI / maxCeOI) * 100 : 0;
    const peOiPct = maxPeOI > 0 ? (peOI / maxPeOI) * 100 : 0;

    const callItmClass = isCeItm ? 'itm-bg-call' : 'otm-bg';
    const putItmClass = isPeItm ? 'itm-bg-put' : 'otm-bg';

    tr.innerHTML = `
      <td style="font-size:11px; color:var(--text-muted)">${ceIVStr}</td>
      <td style="font-size:11px; color:var(--text-muted)">${ceTheta}</td>
      <td style="font-size:11px; color:var(--text-muted)">${ceGamma}</td>
      <td>${ceDelta}</td>
      <td class="call-side ${callItmClass}">₹${ce.ltp || '-'}</td>
      <td class="oi-cell ${callItmClass}">
        <div class="oi-bar oi-bar-call" style="width: ${ceOiPct}%"></div>
        <span style="position:relative; z-index:1">${ceOI}</span>
      </td>
      <td class="strike-cell" style="${isAtm ? 'background: var(--bg-surface);' : ''}">
        ${isAtm ? '<div style="font-size:9px; color:var(--text-main); font-weight:900; letter-spacing:1px; background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:2px; display:inline-block; margin-bottom:2px;">ATM</div><br>' : ''}
        <a href="${strikeLink}" target="_blank" style="color:var(--text-main); text-decoration:none;" title="Open in Fyers Web">${K} ↗</a>
      </td>
      <td class="oi-cell ${putItmClass}">
        <div class="oi-bar oi-bar-put" style="width: ${peOiPct}%"></div>
        <span style="position:relative; z-index:1">${peOI}</span>
      </td>
      <td class="put-side ${putItmClass}">₹${pe.ltp || '-'}</td>
      <td>${peDelta}</td>
      <td style="font-size:11px; color:var(--text-muted)">${peGamma}</td>
      <td style="font-size:11px; color:var(--text-muted)">${peTheta}</td>
      <td style="font-size:11px; color:var(--text-muted)">${peIVStr}</td>
      <td>${alertMsg}</td>
    `;
    DOM.optionsBody.appendChild(tr);
  }
}

document.addEventListener('DOMContentLoaded', init);
