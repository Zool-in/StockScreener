const fs = require('fs');
let html = fs.readFileSync('options.html', 'utf8');

// 1. Update the strategy pills
const oldPills = `<button class="pill on" data-strat="cc">Covered Call</button>
      <button class="pill" data-strat="csp">Cash Secured Put</button>`;
const newPills = `<button class="pill on" data-strat="cc">Covered Call</button>
      <button class="pill" data-strat="csp">Cash Secured Put</button>
      <button class="pill" data-strat="bps">Bull Put Spread</button>
      <button class="pill" data-strat="strangle">Short Strangle</button>`;
html = html.replace(oldPills, newPills);

// 2. Add scanner logic for bps and strangle
const oldScan = `if (strategy === 'cc') {
          // Covered Call: Want neutral/bullish trend (CMP > 200 EMA), good volatility, RSI moderately high (60-75)
          if (d.cmp > e200 && rsiVal > 55 && rsiVal < 80) {
            score = vol * 100; // prioritize high IV
            reason = \`RSI \${rsiVal} · HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        } else {
          // Cash Secured Put: Want strong stock (CMP > 200 EMA) on a short-term pullback (RSI < 45, CMP < 50 EMA)
          if (d.cmp > e200 && d.cmp < e50 && rsiVal < 45) {
            score = vol * 100; // prioritize high IV
            reason = \`RSI \${rsiVal} · HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        }`;

const newScan = `if (strategy === 'cc') {
          if (d.cmp > e200 && rsiVal > 55 && rsiVal < 80) {
            score = vol * 100; reason = \`RSI \${rsiVal} · HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        } else if (strategy === 'csp') {
          if (d.cmp > e200 && d.cmp < e50 && rsiVal < 45) {
            score = vol * 100; reason = \`RSI \${rsiVal} · HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        } else if (strategy === 'bps') {
          // Bull Put Spread: High confidence uptrend (above 50 & 200 EMA, high ADX) + high premium
          const adx = d.adx ? d.adx[d.adx.length-1].adx : 0;
          if (d.cmp > e50 && d.cmp > e200 && adx > 25 && vol > 0.25) {
            score = vol * 100 + adx; reason = \`ADX \${adx.toFixed(0)} · HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        } else if (strategy === 'strangle') {
          // Short Strangle: Sideways/Flat trend (ADX < 20, between EMAs) + very high IV
          const adx = d.adx ? d.adx[d.adx.length-1].adx : 0;
          if (adx < 22 && vol > 0.35) {
            score = vol * 100 - adx; reason = \`Flat ADX \${adx.toFixed(0)} · Massive HV \${(vol*100).toFixed(1)}%\`;
            results.push({ ticker, score, reason });
          }
        }`;
html = html.replace(oldScan, newScan);

// 3. Update title formatting
const oldTitle = `const title = strategy === 'cc' ? 'Top Covered Calls:' : 'Top Cash Secured Puts:';`;
const newTitle = `const title = strategy === 'cc' ? 'Top Covered Calls:' : strategy === 'csp' ? 'Top Cash Secured Puts:' : strategy === 'bps' ? 'Top Bull Put Spreads:' : 'Top Short Strangles:';`;
html = html.replace(oldTitle, newTitle);

// 4. Update the router in analyze()
const oldAnalyzeEnd = `  if (strategy === 'cc') out += coveredCall(b);
  else out += cashSecuredPut(b);

  document.getElementById('out').innerHTML = out;`;
const newAnalyzeEnd = `  if (strategy === 'cc') out += coveredCall(b);
  else if (strategy === 'csp') out += cashSecuredPut(b);
  else if (strategy === 'bps') out += bullPutSpread(b);
  else if (strategy === 'strangle') out += shortStrangle(b);

  document.getElementById('out').innerHTML = out;`;
html = html.replace(oldAnalyzeEnd, newAnalyzeEnd);

fs.writeFileSync('options.html', html);
console.log("Injected basic hooks. Next we will append the large strategy functions.");
