

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
    const res = await fetch(`/api/options/chain?symbol=${activeIndex}&strikecount=30`);
    if (!res.ok) throw new Error(await res.text());
    
    const data = await res.json();
    if (data.s !== 'ok' || !data.data || !data.data.optionsChain) {
      throw new Error('Invalid data from FYERS');
    }

    renderChain(data.data.optionsChain);
    DOM.scanStatus.textContent = `Updated at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    DOM.scanStatus.textContent = 'Error';
    DOM.optionsBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red">${err.message}</td></tr>`;
  } finally {
    DOM.scanBtn.disabled = false;
  }
}

function renderChain(chainData) {
  DOM.optionsBody.innerHTML = '';
  
  // chainData is an array of objects representing strikes
  // For each strike, we have CE and PE data
  // Sort by strike price
  chainData.sort((a, b) => a.strikePrice - b.strikePrice);

  for (const row of chainData) {
    const tr = document.createElement('tr');
    
    // Analyze for Gamma Squeeze Alerts
    let alertMsg = '';
    
    // Simplified Gamma Squeeze Logic:
    // If volume is extremely high relative to OI (e.g. > 100%) and price is up significantly
    const ce = row.optionType === 'CE' ? row : chainData.find(r => r.strikePrice === row.strikePrice && r.optionType === 'CE') || {};
    const pe = row.optionType === 'PE' ? row : chainData.find(r => r.strikePrice === row.strikePrice && r.optionType === 'PE') || {};
    
    // Skip duplicate iterations (since we combine CE/PE into one row based on strike)
    if (row.optionType === 'PE' && chainData.some(r => r.strikePrice === row.strikePrice && r.optionType === 'CE')) continue;
    
    const ceVol = ce.volume || 0;
    const ceOI = ce.oi || 1;
    const peVol = pe.volume || 0;
    const peOI = pe.oi || 1;

    if (ceVol > ceOI * 2 && ceOI > 10000) {
        alertMsg = '<span class="badge badge-purple">CE Gamma Squeeze!</span>';
        tr.classList.add('gamma-alert');
    }
    if (peVol > peOI * 2 && peOI > 10000) {
        alertMsg = '<span class="badge badge-purple">PE Gamma Squeeze!</span>';
        tr.classList.add('gamma-alert');
    }

    tr.innerHTML = `
      <td style="text-align:left; font-weight:bold">${row.strikePrice || '-'}</td>
      <td class="call-side">₹${ce.ltp || '-'}</td>
      <td>${ceVol}</td>
      <td>${ceOI}</td>
      <td class="put-side">₹${pe.ltp || '-'}</td>
      <td>${peVol}</td>
      <td>${peOI}</td>
      <td>${alertMsg}</td>
    `;
    DOM.optionsBody.appendChild(tr);
  }
}

document.addEventListener('DOMContentLoaded', init);
