const fs = require('fs');
let html = fs.readFileSync('options.html', 'utf8');

const newFuncs = `
// ════════════════════════════════════════════════════════════════════════════
//  BULL PUT SPREAD
// ════════════════════════════════════════════════════════════════════════════
function bullPutSpread(b) {
  const lot = LOT[b.ticker] || 500;
  const K_sell = round50(b.cmp * 0.95);
  const K_buy = round50(b.cmp * 0.90);
  const spreadWidth = K_sell - K_buy;
  
  const p_sell = 0.4 * b.cmp * b.hv * Math.sqrt(T); 
  const p_buy = p_sell * 0.3; // arbitrary approx for OTM hedge
  const netPremium = p_sell - p_buy;
  
  const premTotal = netPremium * lot;
  const maxLoss = (spreadWidth - netPremium) * lot;
  const roi = (premTotal / maxLoss) * 100;
  
  let s = 6;
  const reasons = ['Limits downside risk', 'Much higher ROI than CSP'];
  const flags = [];
  const why = \`High-probability credit spread. Sell the \${inr(K_sell)} Put and buy the \${inr(K_buy)} Put to cap risk.\`;

  const setup = \`<div class="card">
    <h2><span class="num">3</span> Strategy Setup — Bull Put Spread</h2>
    <div class="kv-grid">
      <div class="kv"><div class="k">Sell Put (5% OTM)</div><div class="v v-accent">\${inr(K_sell)}</div></div>
      <div class="kv"><div class="k">Buy Put (10% OTM hedge)</div><div class="v v-accent">\${inr(K_buy)}</div></div>
      <div class="kv"><div class="k">Net Premium / share</div><div class="v">\${inr2(netPremium)}</div></div>
      <div class="kv"><div class="k">Net Credit / lot</div><div class="v v-green">\${inr(premTotal)}</div></div>
      <div class="kv"><div class="k">Max Risk (Capital Req)</div><div class="v v-red">\${inr(maxLoss)}</div></div>
      <div class="kv"><div class="k">ROI on Risk</div><div class="v v-green">\${roi.toFixed(1)}%</div></div>
    </div>
    <div class="muted-note">A highly leveraged income trade. Requires vastly less capital than a Cash Secured Put, pushing your ROI much higher, but caps your losses entirely if the stock crashes.</div>
  </div>\`;

  return verdictCard('Bull Put Spread', s, why, flags) + setup;
}

// ════════════════════════════════════════════════════════════════════════════
//  SHORT STRANGLE
// ════════════════════════════════════════════════════════════════════════════
function shortStrangle(b) {
  const lot = LOT[b.ticker] || 500;
  const K_call = round50(b.cmp * 1.07);
  const K_put = round50(b.cmp * 0.93);
  
  const premium = 0.4 * b.cmp * b.hv * Math.sqrt(T) * 1.5; // Combined approx
  const premTotal = premium * lot;
  
  let s = 7;
  const reasons = ['Double premium collected', 'Capitalizing on massive IV'];
  const flags = ['⚠ Unlimited upside risk if stock explodes higher'];
  const why = \`Sell both a \${inr(K_call)} Call and a \${inr(K_put)} Put. Perfect for range-bound sideways markets.\`;

  const setup = \`<div class="card">
    <h2><span class="num">3</span> Strategy Setup — Short Strangle</h2>
    <div class="kv-grid">
      <div class="kv"><div class="k">Sell Call (7% OTM)</div><div class="v v-accent">\${inr(K_call)}</div></div>
      <div class="kv"><div class="k">Sell Put (7% OTM)</div><div class="v v-accent">\${inr(K_put)}</div></div>
      <div class="kv"><div class="k">Combined Prem / share</div><div class="v">\${inr2(premium)}</div></div>
      <div class="kv"><div class="k">Total Credit / lot</div><div class="v v-green">\${inr(premTotal)}</div></div>
      <div class="kv"><div class="k">Profit Zone</div><div class="v v-accent">\${inr(K_put - premium)} – \${inr(K_call + premium)}</div></div>
    </div>
    <div class="muted-note">As long as the stock stays between \${inr(K_put)} and \${inr(K_call)}, you keep the massive combined premium. Watch out for earnings gaps!</div>
  </div>\`;

  return verdictCard('Short Strangle', s, why, flags) + setup;
}
`;

html = html.replace('</script>', newFuncs + '\n</script>');
fs.writeFileSync('options.html', html);
console.log("Injected strategies.");
