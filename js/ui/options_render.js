// Options Rendering Engine (Migrated from deprecated options.html)

const DTE = 25;                 // days to expiry assumed for estimates
const T = DTE / 365;            // in years
const RF = 0.07;                // India risk-free ~7%

// Fallback LOT sizes if API fails
const LOT = {
  RELIANCE:500, TCS:175, INFY:400, HDFCBANK:550, ICICIBANK:700, SBIN:750,
  AXISBANK:625, WIPRO:3000, HCLTECH:350, MARUTI:50, TITAN:175, ITC:1600,
  SUNPHARMA:350, BAJFINANCE:750, BLUESTARCO:325, BEL:1425, TATAMOTORS:700,
  ULTRACEMCO:50, ADANIPORTS:400, COALINDIA:1350, ONGC:1150, NTPC:1500,
  POWERGRID:3600, LT:175
};

const inr  = n => '₹' + Math.round(n).toLocaleString('en-IN');
const inr2 = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round50 = x => Math.round(x / 50) * 50;

// Greeks
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function normCDF(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function bsGreeks(S, K, sigma, type) {
  const sq = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RF + sigma * sigma / 2) * T) / sq;
  const pdf = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
  const gamma = pdf / (S * sq);
  const vega = S * pdf * Math.sqrt(T) / 100;              
  const delta = type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
  return { delta, gamma, vega };
}

// Compute Technicals for rendering (since raw just has arrays)
function hv30(closes) {
  if (!closes || closes.length < 31) return 0.25;
  const c = closes.slice(-31); const rets = [];
  for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

function computeBase(raw, metrics, chgPct) {
  const cmp = raw.cmp;
  const wk52hi = raw.meta?.fiftyTwoWeekHigh || Math.max(...(raw.highs || []));
  const wk52lo = raw.meta?.fiftyTwoWeekLow || Math.min(...(raw.lows || []));
  const hv = hv30(raw.closes);
  const ivPct = +(hv * 100).toFixed(1);
  const rangePos = wk52hi !== wk52lo ? Math.round((cmp - wk52lo) / (wk52hi - wk52lo) * 100) : 50;
  
  // Extract e20, e50, e200, rsi, adx from metrics array if possible, else approximate
  const getMetric = (name, def) => {
    if (!metrics) return def;
    const m = metrics.find(x => x.name.includes(name));
    return m ? parseFloat(m.value) : def;
  };
  
  const ema = (arr, period) => { 
    if(!arr || arr.length < period) return cmp;
    const k = 2 / (period + 1); let e = arr[0]; 
    for (let i = 0; i < arr.length; i++) e = arr[i] * k + e * (1 - k); 
    return e; 
  };
  
  const e20 = ema(raw.closes, 20);
  const e50 = ema(raw.closes, 50);
  const e200 = ema(raw.closes, 200);
  const rsiVal = getMetric('RSI', 50);
  const adxVal = getMetric('ADX', 20);
  const vr = getMetric('Vol', 1);

  const nearHi = (wk52hi - cmp) / wk52hi;
  const nearLo = (cmp - wk52lo) / wk52lo;
  
  let tr = { t: 'Sideways', cls: 't-side' };
  if (cmp > e20 && cmp > e50 && cmp > e200 && e20 >= e50) tr = { t: 'Bullish', cls: 't-bull' };
  else if (cmp < e200 && cmp < e50) tr = { t: 'Bearish', cls: 't-bear' };

  return { 
    ticker: raw.ticker,
    cmp, wk52hi, wk52lo, e20, e50, e200, rsiVal, adxVal, vr, hv, ivPct, chgPct, rangePos, nearHi, nearLo, tr,
    aboveAll: cmp > e20 && cmp > e50 && cmp > e200, above200: cmp > e200 
  };
}

// ─── UI Helpers ───
function snapshotCard(b) {
  const chgCls = b.chgPct >= 0 ? 'v-green' : 'v-red';
  return `<div class="card">
    <h2><span class="num">1</span> Stock Snapshot</h2>
    <div class="kv-grid">
      <div class="kv"><div class="k">Live CMP</div><div class="v">${inr2(b.cmp)}</div></div>
      <div class="kv"><div class="k">Day change</div><div class="v ${chgCls}">${b.chgPct >= 0 ? '+' : ''}${b.chgPct}%</div></div>
      <div class="kv"><div class="k">52-wk high</div><div class="v">${inr(b.wk52hi)}</div></div>
      <div class="kv"><div class="k">52-wk low</div><div class="v">${inr(b.wk52lo)}</div></div>
      <div class="kv"><div class="k">Range position</div><div class="v v-accent">${b.rangePos}%</div></div>
      <div class="kv"><div class="k">EMA 20</div><div class="v">${inr(b.e20)}</div></div>
      <div class="kv"><div class="k">EMA 50</div><div class="v">${inr(b.e50)}</div></div>
      <div class="kv"><div class="k">EMA 200</div><div class="v">${inr(b.e200)}</div></div>
      <div class="kv"><div class="k">RSI 14</div><div class="v">${b.rsiVal}</div></div>
      <div class="kv"><div class="k">ADX 14</div><div class="v">${b.adxVal}</div></div>
      <div class="kv"><div class="k">Volume ratio</div><div class="v">${b.vr}×</div></div>
      <div class="kv"><div class="k">IV proxy (HV30)</div><div class="v v-accent">${b.ivPct}%</div></div>
    </div>
    <div style="margin-top:12px"><span class="trend-tag ${b.tr.cls}">Trend: ${b.tr.t}</span></div>
  </div>`;
}

function verdictBadge(score) {
  if (score >= 8) return { txt: 'Strong Sell', cls: 'b-strong', col: 'var(--green)' };
  if (score >= 6) return { txt: 'Good', cls: 'b-good', col: '#7faaff' };
  if (score >= 4) return { txt: 'Wait', cls: 'b-wait', col: 'var(--amber)' };
  return { txt: 'Avoid', cls: 'b-avoid', col: 'var(--red)' };
}
function verdictCard(title, score, why, flags) {
  const v = verdictBadge(score);
  const ringBg = score >= 8 ? 'var(--green-dim)' : score >= 6 ? 'var(--accent-dim)' : score >= 4 ? 'var(--amber-dim)' : 'var(--red-dim)';
  return `<div class="card">
    <h2><span class="num">2</span> ${title}</h2>
    <div class="verdict">
      <div class="score-ring" style="background:${ringBg};color:${v.col}">${score}/10</div>
      <div><div class="vtext" style="color:${v.col}">${v.txt}</div>
        <span class="badge ${v.cls}">${v.txt}</span></div>
      <div class="why">${why}</div>
    </div>
    ${flags.length ? flags.map(f => `<div class="note">${f}</div>`).join('') : ''}
  </div>`;
}

function decayRows(premium) {
  let rows = '';
  for (let d = DTE; d >= 1; d--) {
    if (d <= 7 || d === DTE || d % 5 === 0) {
      const rem = premium * Math.sqrt(d / DTE);
      const remPrev = premium * Math.sqrt((d + 1) / DTE);
      const dayTheta = remPrev - rem;
      const hot = d <= 7;
      rows += `<tr>${hot ? '<td class="evt-red">' : '<td>'}Day ${d}${d <= 7 ? ' ⚡' : ''}</td>
        <td class="num">${inr2(rem)}</td><td class="num">${inr2(dayTheta)}</td></tr>`;
    }
  }
  return rows;
}

function greeksSection(b, K, premium, lot, greek, forPut) {
  const dailyTheta0 = (premium - premium * Math.sqrt((DTE - 1) / DTE)) * lot;
  const ivUp = premium * (b.ivPct + 5) / b.ivPct;
  const deltaTxt = forPut
    ? `<h4>DELTA <span class="gval">${greek.delta.toFixed(2)} (negative)</span></h4>
       <div class="desc">Rate the option price changes per ₹1 move in the stock.</div>
       <div class="gline"><span class="for">FOR you:</span> Stock rises → put goes worthless → you keep the premium.</div>
       <div class="gline"><span class="against">AGAINST you:</span> Stock falls → put delta grows more negative → your short put loses money.</div>
       <div class="gline"><span class="trig">Trigger:</span> Stock moves within 2% of your ${inr(K)} strike. <b>Roll down when |delta| &gt; 0.50.</b></div>`
    : `<h4>DELTA <span class="gval">${greek.delta.toFixed(2)}</span></h4>
       <div class="desc">Rate the option price changes per ₹1 move in the stock (~0.25–0.35 for a 5% OTM call).</div>
       <div class="gline"><span class="for">FOR you:</span> Stock flat or down → delta stays low → the call you sold loses value.</div>
       <div class="gline"><span class="against">AGAINST you:</span> Stock surges → delta rises toward 1 → call price explodes.</div>
       <div class="gline"><span class="trig">Trigger:</span> Stock within 2% of your ${inr(K)} strike. <b>Roll up immediately when delta &gt; 0.50.</b></div>`;
  return `<details class="coll">
    <summary><span class="num" style="background:var(--accent-dim)">5</span> Greeks — Real-Time Impact</summary>
    <div class="coll-body">
      <div class="greek">${deltaTxt}</div>
      <div class="greek">
        <h4>THETA <span class="gval">≈ ${inr(dailyTheta0)}/day now</span></h4>
        <div class="desc">Time decay — your income engine. Every day the option loses value, you profit.</div>
        <div class="gline"><span class="for">FOR you:</span> Each day that passes bleeds premium in your favour. Accelerates in the last 7 days.</div>
        <div class="gline"><span class="against">AGAINST you:</span> Only if the stock moves against you faster than time decays.</div>
        <table class="tbl">
          <tr><th>Day to expiry</th><th class="num">Est. premium left</th><th class="num">Theta that day</th></tr>
          ${decayRows(premium)}
        </table>
      </div>
      <div class="greek">
        <h4>VEGA <span class="gval">${greek.vega.toFixed(2)} / +1% IV</span></h4>
        <div class="desc">Sensitivity to implied volatility. Current IV proxy: <b>${b.ivPct}%</b>.</div>
        <div class="gline"><span class="for">FOR you:</span> IV drops post-event → option price collapses → buy back cheap.</div>
        <div class="gline"><span class="against">AGAINST you:</span> IV spikes on news → option inflates → expensive to exit.</div>
        <div class="gline"><span class="trig">A +5% IV spike</span> would move this option from ~${inr2(premium)} to ~<b>${inr2(ivUp)}</b> per share. Trigger events: RBI policy, Budget, US Fed, results, geopolitics, INR moves.</div>
      </div>
      <div class="greek">
        <h4>GAMMA <span class="gval">${greek.gamma.toFixed(4)}</span></h4>
        <div class="desc">Acceleration of delta — the hidden danger near expiry.</div>
        <div class="gline"><span class="against">AGAINST you:</span> When the stock is near the strike AND expiry is near, gamma explodes — delta swings violently.</div>
        <div class="gline"><span class="trig">HIGH GAMMA ALERT:</span> Last 5 days + stock within 3% of ${inr(K)}. <b>Exit or roll before entering this zone.</b></div>
      </div>
    </div>
  </details>`;
}

function eventRiskSection(b, forPut) {
  const rs = { txt: 'Not set', cls: 'evt-green' }; // Optional enhancement later
  const impact = forPut
    ? 'IV spikes before → put premium inflates → wait & sell AFTER results. IV crush after → premium collapses → best time to sell puts.'
    : 'IV spikes before → premium inflates → wait, sell AFTER results. IV crushes after → premium collapses → best time to sell calls.';
  return `<details class="coll">
    <summary><span class="num" style="background:var(--accent-dim)">6</span> News &amp; Event Risk Assessment</summary>
    <div class="coll-body">
      <table class="tbl">
        <tr><th>Event</th><th>Status</th><th>Impact on premium</th><th>Action</th></tr>
        <tr><td>Results (±14 days)</td><td class="${rs.cls}">${rs.txt}</td>
          <td>IV inflates before, crushes after</td><td>Clear window</td></tr>
        <tr><td>RBI Policy</td><td class="evt-green">Not imminent</td>
          <td>Banking/NBFC delta risk spikes</td><td>Roll/close bank names before meeting</td></tr>
        <tr><td>Global (Fed / oil)</td><td class="evt-amber">Monitor</td>
          <td>VIX spike inflates all premiums</td><td>Opportunity to sell into spike; watch delta</td></tr>
      </table>
      <div class="muted-note">${impact}</div>
    </div>
  </details>`;
}

function positionSizing(b, lot, perLotCash, premiumTotal, forPut) {
  const capital = window.capitalInput ? +window.capitalInput.value : 500000;
  const maxLots = Math.floor(capital / (perLotCash||1));
  const income = maxLots * premiumTotal;
  const deployed = maxLots * perLotCash;
  const depPct = capital > 0 ? (deployed / capital * 100) : 0;
  const risk10 = maxLots * lot * b.cmp * 0.10;
  const risk20 = maxLots * lot * b.cmp * 0.20;
  const ctx = forPut ? 'cash-secured' : 'covered';
  return `<div class="card">
    <h2><span class="num">8</span> Position Sizing Calculator</h2>
    <div class="kv-grid">
      <div class="kv"><div class="k">Capital needed / lot</div><div class="v">${inr(perLotCash)}</div></div>
      <div class="kv"><div class="k">Max lots (${ctx})</div><div class="v v-accent">${maxLots}</div></div>
      <div class="kv"><div class="k">Premium income (all lots)</div><div class="v v-green">${inr(income)}</div></div>
      <div class="kv"><div class="k">Capital deployed</div><div class="v">${inr(deployed)} (${depPct.toFixed(0)}%)</div></div>
      <div class="kv"><div class="k">Risk / lot if −10%</div><div class="v v-red">${inr(risk10 / (maxLots || 1))}</div></div>
      <div class="kv"><div class="k">Risk / lot if −20%</div><div class="v v-red">${inr(risk20 / (maxLots || 1))}</div></div>
    </div>
    <div class="muted-note">With ${inr(capital)}, you can comfortably run <b>${maxLots} lot${maxLots === 1 ? '' : 's'}</b> deploying <b>${depPct.toFixed(0)}%</b> of capital, collecting <b class="v-green">${inr(income)}</b> in estimated premium this cycle.</div>
  </div>`;
}

function rollingSection(b, K, premium, lot, forPut) {
  const buyback = premium * 1.6;
  const newStrike = forPut ? round50(K * 0.97) : round50(K * 1.03);
  const newCredit = premium * 1.15;
  const net = newCredit - buyback;
  const rollOutCredit = premium * 1.9;
  const rollOutNet = rollOutCredit - buyback;
  return `<div class="card">
    <h2><span class="num">7</span> Rolling Strategy (when the trade goes wrong)</h2>
    <div class="scenario">
      <h3>${forPut ? 'Roll Down' : 'Roll Up'} ${forPut ? '(stock falling)' : '(stock approaching strike)'}</h3>
      <table class="tbl">
        <tr><td>Buy back current ${inr(K)} option</td><td class="num v-red">−${inr(buyback * lot)}</td></tr>
        <tr><td>Sell new ${inr(newStrike)} option</td><td class="num v-green">+${inr(newCredit * lot)}</td></tr>
        <tr><td><b>Net ${net >= 0 ? 'credit' : 'debit'}</b></td><td class="num ${net >= 0 ? 'v-green' : 'v-red'}"><b>${net >= 0 ? '+' : '−'}${inr(Math.abs(net) * lot)}</b></td></tr>
      </table>
    </div>
  </div>`;
}

function wheelSection(b, lot, premTotal, phase) {
  const nodes = ['Sell CSP', 'Assigned', 'Sell Covered Call', 'Called Away', '↺ Sell CSP'];
  const activeIdx = phase === 'csp' ? 0 : 2;
  const diagram = nodes.map((n, i) => `<div class="wheel-node ${i === activeIdx ? 'active' : ''}">${n}</div>`
  ).join('<span class="wheel-arrow">→</span>');
  return `<div class="card">
    <h2><span class="num">∞</span> The Wheel Strategy</h2>
    <div class="muted-note">Current phase: <b class="v-accent">${phase === 'csp' ? 'Cash Secured Put' : 'Covered Call'}</b></div>
    <div class="wheel-diagram">${diagram}</div>
  </div>`;
}


// ─── STRATEGY SPECIFIC TEMPLATES ───

function renderCashSecuredPut(b) {
  const lot = LOT[b.ticker] || 1000;
  const K = round50(b.cmp * 0.95);
  const premium = 0.4 * b.cmp * b.hv * Math.sqrt(T);
  const premTotal = premium * lot;
  const cashReq = K * lot;
  const premYield = premium / K * 100;
  const effBuy = K - premium;
  const greek = bsGreeks(b.cmp, K, b.hv, 'put');

  let s = 8;
  const why = `Ideal setup to get paid while waiting to buy ${b.ticker} at a discount.`;

  const setup = `<div class="card">
    <h2><span class="num">3</span> Strategy Setup — 5% OTM Cash Secured Put</h2>
    <div class="kv-grid">
      <div class="kv"><div class="k">Lot size</div><div class="v">${lot.toLocaleString('en-IN')}</div></div>
      <div class="kv"><div class="k">Suggested strike</div><div class="v v-accent">${inr(K)}</div></div>
      <div class="kv"><div class="k">Premium / lot</div><div class="v v-green">${inr(premTotal)}</div></div>
      <div class="kv"><div class="k">Cash to secure</div><div class="v">${inr(cashReq)}</div></div>
      <div class="kv"><div class="k">Eff. buy if assigned</div><div class="v">${inr2(effBuy)}</div></div>
    </div>
  </div>`;

  return snapshotCard(b) + verdictCard('Is this a good time to sell a Cash Secured Put?', s, why, []) + setup + greeksSection(b, K, premium, lot, greek, true) + positionSizing(b, lot, cashReq, premTotal, true) + wheelSection(b, lot, premTotal, 'csp');
}

function renderCoveredCall(b) {
  const lot = LOT[b.ticker] || 1000;
  const K = round50(b.cmp * 1.05);
  const premium = 0.4 * b.cmp * b.hv * Math.sqrt(T);
  const premTotal = premium * lot;
  const lotValue = b.cmp * lot;
  const effExit = K + premium;
  const greek = bsGreeks(b.cmp, K, b.hv, 'call');

  const setup = `<div class="card">
    <h2><span class="num">3</span> Strategy Setup — 5% OTM Covered Call</h2>
    <div class="kv-grid">
      <div class="kv"><div class="k">Lot size</div><div class="v">${lot.toLocaleString('en-IN')}</div></div>
      <div class="kv"><div class="k">Suggested strike</div><div class="v v-accent">${inr(K)}</div></div>
      <div class="kv"><div class="k">Premium / lot</div><div class="v v-green">${inr(premTotal)}</div></div>
      <div class="kv"><div class="k">Effective exit if called</div><div class="v">${inr2(effExit)}</div></div>
    </div>
  </div>`;

  return snapshotCard(b) + verdictCard('Is this a good time to sell a Covered Call?', 8, 'Generate passive income on existing shares.', []) + setup + greeksSection(b, K, premium, lot, greek, false) + positionSizing(b, lot, lotValue, premTotal, false) + wheelSection(b, lot, premTotal, 'cc');
}

function renderBullPutSpread(b) {
  return `<div class="card" style="padding:40px; text-align:center;">
    <h2 style="justify-content:center;">Bull Put Spread (Credit Spread)</h2>
    <p style="color:var(--text-muted); margin-top:12px;">The detailed template for Bull Put Spread is generated dynamically via math engine. See core summary above.</p>
  </div>`;
}

// Fallback template for other options
function renderGenericOption(b, stratId) {
  return `<div class="card" style="padding:40px; text-align:center;">
    <h2 style="justify-content:center; text-transform:uppercase;">${stratId}</h2>
    <p style="color:var(--text-muted); margin-top:12px;">Detailed UI template for this strategy is coming soon.</p>
  </div>`;
}

export function renderOptionCards(res, stratId) {
  if (!res.raw) return `<div class="error-box">Missing raw data for options rendering.</div>`;
  const b = computeBase(res.raw, res.metrics, res.chgPct);
  
  let content = '';
  if (stratId === 'csp' || stratId === 'wheel') content = renderCashSecuredPut(b);
  else if (stratId === 'cc') content = renderCoveredCall(b);
  else if (stratId === 'bps') content = snapshotCard(b) + renderBullPutSpread(b);
  else content = snapshotCard(b) + renderGenericOption(b, stratId);

  return `<div class="options-analysis-wrapper" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; background: rgba(0,0,0,0.2); padding: 24px; border-radius: 16px; border: 1px dashed var(--border2);">
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 8px;">
      <h2 style="font-size:18px; color:var(--text); margin:0;">Detailed Options Analysis: <span style="color:var(--accent)">${b.ticker}</span></h2>
      <span class="badge badge-amber" style="font-size:12px;">${stratId.toUpperCase()}</span>
    </div>
    ${content}
  </div>`;
}
