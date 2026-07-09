const fs = require('fs');
let html = fs.readFileSync('options.html', 'utf8');

// 1. Add pill
const oldPills = `<button class="pill" data-strat="strangle">Short Strangle</button>`;
const newPills = `<button class="pill" data-strat="strangle">Short Strangle</button>
      <button class="pill" data-strat="wheel">The Wheel</button>`;
html = html.replace(oldPills, newPills);

// 2. Add to runDynamicScan
const oldScanStrangle = `} else if (strategy === 'strangle') {
          // Short Strangle: Sideways/Flat trend (ADX < 20, between EMAs) + very high IV
          const adx = d.adx ? d.adx[d.adx.length-1].adx : 0;
          if (adx < 22 && vol > 0.35) {
            score = vol * 100 - adx; reason = \`Flat ADX \${adx.toFixed(0)} · Massive HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        }`;
const newScanWheel = `} else if (strategy === 'strangle') {
          // Short Strangle: Sideways/Flat trend (ADX < 20, between EMAs) + very high IV
          const adx = d.adx ? d.adx[d.adx.length-1].adx : 0;
          if (adx < 22 && vol > 0.35) {
            score = vol * 100 - adx; reason = \`Flat ADX \${adx.toFixed(0)} · Massive HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        } else if (strategy === 'wheel') {
          // The Wheel: Look for strong blue-chip stocks on a dip (RSI < 50, near 50 EMA)
          if (d.cmp > e200 && rsiVal < 55) {
            score = (100 - rsiVal) + (vol * 50); // prioritize dip + decent IV
            reason = \`RSI Dip \${rsiVal} · Long-term uptrend intact\`;
            results.push({ ticker, score, reason });
          }
        }`;
html = html.replace(oldScanStrangle, newScanWheel);

// 3. Update title
const oldTitle = `const title = strategy === 'cc' ? 'Top Covered Calls:' : strategy === 'csp' ? 'Top Cash Secured Puts:' : strategy === 'bps' ? 'Top Bull Put Spreads:' : 'Top Short Strangles:';`;
const newTitle = `const title = strategy === 'cc' ? 'Top Covered Calls:' : strategy === 'csp' ? 'Top Cash Secured Puts:' : strategy === 'bps' ? 'Top Bull Put Spreads:' : strategy === 'strangle' ? 'Top Short Strangles:' : 'Top Wheel Candidates:';`;
html = html.replace(oldTitle, newTitle);

// 4. Update routing
const oldRouter = `else if (strategy === 'strangle') out += shortStrangle(b);

  document.getElementById('out').innerHTML = out;`;
const newRouter = `else if (strategy === 'strangle') out += shortStrangle(b);
  else if (strategy === 'wheel') out += theWheel(b);

  document.getElementById('out').innerHTML = out;`;
html = html.replace(oldRouter, newRouter);

// 5. Append the function
const func = `
// ════════════════════════════════════════════════════════════════════════════
//  THE WHEEL
// ════════════════════════════════════════════════════════════════════════════
function theWheel(b) {
  const lot = LOT[b.ticker] || 500;
  const K_put = round50(b.cmp * 0.95);
  
  const put_prem = 0.4 * b.cmp * b.hv * Math.sqrt(T); 
  const put_total = put_prem * lot;
  const cash_req = K_put * lot;
  const roi_put = (put_total / cash_req) * 100;
  const eff_buy = K_put - put_prem;
  
  let s = 8;
  const reasons = ['Generates continuous income', 'You get paid to buy the stock at a discount'];
  const flags = ['Requires substantial capital to secure the put', 'Only run on stocks you actually want to own for 5+ years'];
  const why = \`The Wheel is the ultimate cash-flow generator. Start by selling a \${inr(K_put)} Put. If assigned, sell Covered Calls.\`;

  const setup = \`<div class="card">
    <h2><span class="num">3</span> The Wheel Timeline</h2>
    <div class="scenario">
      <h3>Phase 1: Sell Cash Secured Put (Start Here)</h3>
      <table class="tbl">
        <tr><td>Sell the \${inr(K_put)} Put</td><td class="num v-green">+\${inr(put_total)} collected</td></tr>
        <tr><td>Capital required to secure</td><td class="num">\${inr(cash_req)}</td></tr>
        <tr><td>Yield on capital</td><td class="num v-green">\${roi_put.toFixed(1)}%</td></tr>
      </table>
      <div class="muted-note">Keep selling this put every month. If the stock stays above \${inr(K_put)}, you keep the premium and repeat Phase 1.</div>
    </div>
    
    <div class="scenario">
      <h3>Phase 2: Assignment & Pivot (If stock crashes)</h3>
      <table class="tbl">
        <tr><td>Buy shares at strike</td><td class="num">\${inr(K_put)}</td></tr>
        <tr><td>Minus Phase 1 premium</td><td class="num v-green">-\${inr2(put_prem)}</td></tr>
        <tr><td><b>Effective Buy Price</b></td><td class="num v-accent"><b>\${inr2(eff_buy)}</b></td></tr>
      </table>
      <div class="muted-note">You were forced to buy the shares, but you got them at a massive discount compared to today's price. You now own \${lot} shares.</div>
    </div>

    <div class="scenario">
      <h3>Phase 3: Sell Covered Calls</h3>
      <div class="muted-note">Now that you own the shares, you immediately switch to selling Covered Calls (e.g. selling a call 5% OTM) to generate more income. If the stock rallies and gets called away, you sell the shares for a profit, keep the call premium, and immediately restart Phase 1. The Wheel turns!</div>
    </div>
  </div>\`;

  return verdictCard('The Wheel', s, why, flags) + setup;
}
`;

html = html.replace('</script>', func + '\n</script>');
fs.writeFileSync('options.html', html);
console.log("Injected the wheel.");
