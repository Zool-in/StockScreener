

const DOM = {
  indexPills: document.getElementById('indexPills'),
  expiryPills: document.getElementById('expiryPills'),
  scanBtn: document.getElementById('scanBtn'),
  scanStatus: document.getElementById('scanStatus'),
  optionsBody: document.getElementById('optionsBody'),
  connStatus: document.getElementById('connStatus')
};

let activeIndex = 'NSE:NIFTY50-INDEX';

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

  DOM.indexPills.addEventListener('click', (e) => {
    if (!e.target.classList.contains('pill')) return;
    Array.from(DOM.indexPills.children).forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    activeIndex = e.target.dataset.val;
  });

  DOM.scanBtn.addEventListener('click', runScan);
}

async function runScan() {
  DOM.scanStatus.textContent = 'Scanning...';
  DOM.scanBtn.disabled = true;
  DOM.optionsBody.innerHTML = '<tr><td colspan="8" style="text-align:center">Loading Option Chain...</td></tr>';
  
  try {
    // Fetch underlying LTP
    let underlyingLtp = null;
    try {
      const qRes = await fetch(`/api/quotes?symbols=${activeIndex}`);
      if (qRes.ok) {
        const qData = await qRes.json();
        underlyingLtp = Object.values(qData)[0] || null;
      }
    } catch(e) { console.warn("Failed to fetch underlying LTP"); }

    const res = await fetch(`/api/options/chain?symbol=${activeIndex}&strikecount=40`);
    if (!res.ok) throw new Error(await res.text());
    
    const data = await res.json();
    if (data.s !== 'ok' || !data.data || !data.data.optionsChain) {
      throw new Error('Invalid data from FYERS');
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

function renderChain(chainData, underlyingLtp) {
  DOM.optionsBody.innerHTML = '';
  
  // Sort by strike price
  chainData.sort((a, b) => a.strike_price - b.strike_price);

  // 1. Find the highest OI to identify major support/resistance levels
  let maxCeOI = 1;
  let maxPeOI = 1;
  for (const row of chainData) {
    if (row.strike_price <= 0) continue; // Skip invalid strikes
    if (row.option_type === 'CE' && row.oi > maxCeOI) maxCeOI = row.oi;
    if (row.option_type === 'PE' && row.oi > maxPeOI) maxPeOI = row.oi;
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

    // Squeeze Logic: 
    // It must be a significant strike (OI > 20% of the max OI in the chain)
    // AND Volume must be abnormally high compared to OI (e.g., > 3x)
    if (ceOI > (maxCeOI * 0.20) && ceVol > (ceOI * 3)) {
        const info = "BULLISH SIGNAL: Call Writers (Resistance) are panicking and covering shorts. Momentum is moving UP. Suggestion: BUY ATM Call (CE).";
        alertMsg = `<div title="${info}" style="cursor:help; display:inline-flex; flex-direction:column; gap:4px; align-items:flex-end;">
            <span class="badge badge-purple">📈 BULLISH: CE Gamma Trap! ⓘ</span>
            <span style="font-size:10px; color:var(--text-green); font-weight:600; text-transform:uppercase;">Suggest: Buy CE</span>
        </div>`;
        tr.classList.add('gamma-alert');
    }
    if (peOI > (maxPeOI * 0.20) && peVol > (peOI * 3)) {
        const info = "BEARISH SIGNAL: Put Writers (Support) are panicking and covering shorts. Momentum is moving DOWN. Suggestion: BUY ATM Put (PE).";
        alertMsg = `<div title="${info}" style="cursor:help; display:inline-flex; flex-direction:column; gap:4px; align-items:flex-end;">
            <span class="badge badge-purple">📉 BEARISH: PE Gamma Trap! ⓘ</span>
            <span style="font-size:10px; color:var(--text-red); font-weight:600; text-transform:uppercase;">Suggest: Buy PE</span>
        </div>`;
        tr.classList.add('gamma-alert');
    }

    // Identify ITM/OTM
    const isCeItm = underlyingLtp && row.strike_price < underlyingLtp;
    const isPeItm = underlyingLtp && row.strike_price > underlyingLtp;
    
    // Highlight ATM row
    if (underlyingLtp && Math.abs(row.strike_price - underlyingLtp) < (activeIndex.includes('BANK') ? 50 : 25)) {
        tr.classList.add('atm-row');
    }
    
    // Attempt to extract the CE and PE symbols if FYERS provided them, to link to charts
    // Fyers Option Chain API typically returns symbol in the row like `row.symbol` or `ce.symbol`
    const ceSym = ce.symbol || '';
    const peSym = pe.symbol || '';
    const strikeLink = ceSym ? `https://trade.fyers.in/popout/index.html?symbol=${ceSym}&resolution=5&theme=dark` : '#';

    tr.innerHTML = `
      <td style="text-align:left; font-weight:bold">
        <a href="${strikeLink}" target="_blank" style="color:var(--text-main); text-decoration:none;" title="Open in Fyers Web">${row.strike_price || '-'} ↗</a>
      </td>
      <td class="call-side ${isCeItm ? 'itm-bg' : 'otm-bg'}">₹${ce.ltp || '-'}</td>
      <td class="${isCeItm ? 'itm-bg' : 'otm-bg'}">${ceVol}</td>
      <td class="${isCeItm ? 'itm-bg' : 'otm-bg'}">${ceOI}</td>
      <td class="put-side ${isPeItm ? 'itm-bg' : 'otm-bg'}">₹${pe.ltp || '-'}</td>
      <td class="${isPeItm ? 'itm-bg' : 'otm-bg'}">${peVol}</td>
      <td class="${isPeItm ? 'itm-bg' : 'otm-bg'}">${peOI}</td>
      <td>${alertMsg}</td>
    `;
    DOM.optionsBody.appendChild(tr);
  }
}

document.addEventListener('DOMContentLoaded', init);
