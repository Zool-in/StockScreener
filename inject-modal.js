const fs = require('fs');
let html = fs.readFileSync('options.html', 'utf8');

// 1. Update pills to include info icon
const oldPills = `<button class="pill on" data-strat="cc">Covered Call</button>
      <button class="pill" data-strat="csp">Cash Secured Put</button>
      <button class="pill" data-strat="bps">Bull Put Spread</button>
      <button class="pill" data-strat="strangle">Short Strangle</button>
      <button class="pill" data-strat="wheel">The Wheel</button>`;
const newPills = `<div class="pill-wrapper"><button class="pill on" data-strat="cc">Covered Call</button><span class="info-icon" onclick="openStratModal('cc')">ℹ️</span></div>
      <div class="pill-wrapper"><button class="pill" data-strat="csp">Cash Secured Put</button><span class="info-icon" onclick="openStratModal('csp')">ℹ️</span></div>
      <div class="pill-wrapper"><button class="pill" data-strat="bps">Bull Put Spread</button><span class="info-icon" onclick="openStratModal('bps')">ℹ️</span></div>
      <div class="pill-wrapper"><button class="pill" data-strat="strangle">Short Strangle</button><span class="info-icon" onclick="openStratModal('strangle')">ℹ️</span></div>
      <div class="pill-wrapper"><button class="pill" data-strat="wheel">The Wheel</button><span class="info-icon" onclick="openStratModal('wheel')">ℹ️</span></div>`;

html = html.replace(oldPills, newPills);

// 2. Add CSS for modal and info-icon
const cssInject = `
.pills { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pill-wrapper { display: flex; align-items: center; gap: 4px; }
.info-icon { cursor: pointer; font-size: 14px; opacity: 0.6; transition: 0.2s; }
.info-icon:hover { opacity: 1; transform: scale(1.1); }

/* Modal CSS */
.modal-overlay {
  display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.modal-overlay.active { display: flex; }
.modal-content {
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  width: 90%; max-width: 600px; max-height: 85vh; overflow-y: auto;
  padding: 24px; position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.modal-close {
  position: absolute; top: 16px; right: 16px; background: none; border: none;
  color: var(--text-muted); font-size: 24px; cursor: pointer; line-height: 1;
}
.modal-close:hover { color: var(--text); }
.modal-title { margin-top: 0; margin-bottom: 16px; font-size: 1.5rem; color: var(--accent); }
.modal-body h4 { margin-top: 16px; margin-bottom: 8px; color: var(--text); border-bottom: 1px solid var(--border); padding-bottom: 4px; }
.modal-body p { margin-bottom: 12px; line-height: 1.5; color: var(--text-muted); }
.modal-body ul { margin-bottom: 16px; padding-left: 20px; color: var(--text-muted); }
.modal-body li { margin-bottom: 6px; }
.modal-example { background: var(--bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border); margin-top: 12px; }
`;
html = html.replace('</style>', cssInject + '\n</style>');

// 3. Add Modal HTML at the end of body
const modalHtml = `
<!-- Strategy Info Modal -->
<div class="modal-overlay" id="stratModal" onclick="if(event.target===this) closeStratModal()">
  <div class="modal-content">
    <button class="modal-close" onclick="closeStratModal()">×</button>
    <h2 class="modal-title" id="modalTitle">Strategy</h2>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>
`;
html = html.replace('</body>', modalHtml + '\n</body>');

// 4. Add Modal JS logic
const modalJs = `
// ─── Strategy Modal Logic ───────────────────────────────────────────────────
const stratDetails = {
  'cc': {
    title: 'Covered Call',
    body: \`
      <p>A <b>Covered Call</b> is an income strategy where you own 100 shares (or 1 lot) of a stock and sell a Call option against it.</p>
      <h4>How it works</h4>
      <ul>
        <li>You collect a cash premium upfront.</li>
        <li>If the stock stays below the strike price, you keep the premium and your shares.</li>
        <li>If the stock goes above the strike price, you keep the premium, but you are forced to sell your shares at the strike price (capping your upside).</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Neutral to slightly bullish markets. Best used on stocks you already own and wouldn't mind selling at a target profit price.</p>
      <div class="modal-example">
        <b>Example:</b> You own 500 shares of INFY trading at ₹1500. You sell a ₹1600 Call for ₹30.<br><br>
        You immediately collect ₹15,000 (500 * ₹30). <br>
        If INFY stays under ₹1600, you keep the ₹15k. If INFY skyrockets to ₹1800, you still only get to sell your shares for ₹1600, plus the ₹15k premium you kept.
      </div>\`
  },
  'csp': {
    title: 'Cash Secured Put',
    body: \`
      <p>A <b>Cash Secured Put</b> is an income strategy where you sell a Put option and hold enough cash in your account to buy the shares if assigned.</p>
      <h4>How it works</h4>
      <ul>
        <li>You get paid a cash premium upfront to promise to buy the stock at a lower price.</li>
        <li>If the stock stays above your strike, the put expires worthless and you keep the premium (and your cash is freed up).</li>
        <li>If the stock drops below your strike, you are forced to buy the shares at the strike price using your secured cash.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Neutral to bullish markets. It is the best way to "get paid to wait" for a stock to drop to your desired entry price.</p>
      <div class="modal-example">
        <b>Example:</b> HDFC is trading at ₹1600. You want to buy it at ₹1500. You sell a ₹1500 Put for ₹40.<br><br>
        You collect ₹20,000 upfront (assuming lot size 500) and lock ₹7.5L in cash.<br>
        If HDFC stays above ₹1500, you keep the ₹20k for doing nothing. If it drops to ₹1400, you must buy HDFC at ₹1500, but your "effective" cost is only ₹1460 (₹1500 - ₹40 premium).
      </div>\`
  },
  'bps': {
    title: 'Bull Put Spread (Credit Spread)',
    body: \`
      <p>A <b>Bull Put Spread</b> is a defined-risk alternative to the Cash Secured Put. You sell a Put, and simultaneously buy a cheaper Put further down to act as insurance.</p>
      <h4>How it works</h4>
      <ul>
        <li>Because you bought insurance (the lower put), your broker requires vastly less margin/capital to put on the trade.</li>
        <li>Your maximum loss is strictly capped to the width of the spread.</li>
        <li>You collect less premium than a naked Put, but your Return on Investment (ROI) is much higher because the capital required is tiny.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Strong uptrends where you want high leverage without the risk of a black-swan market crash wiping you out.</p>
      <div class="modal-example">
        <b>Example:</b> TCS is at ₹4000. You sell a ₹3800 Put for ₹60, and buy a ₹3700 Put for ₹20.<br><br>
        Net premium collected: ₹40. Spread width: ₹100.<br>
        Max risk: ₹60 per share (₹100 spread - ₹40 premium).<br>
        Instead of needing ₹19 Lakhs to secure a naked put, you only need ~₹30k margin. If TCS stays above ₹3800, you keep the premium. If it crashes to ₹3000, the lower put kicks in and your loss stops at exactly ₹60/share.
      </div>\`
  },
  'strangle': {
    title: 'Short Strangle',
    body: \`
      <p>A <b>Short Strangle</b> involves selling an Out-of-the-Money Call AND an Out-of-the-Money Put at the same time.</p>
      <h4>How it works</h4>
      <ul>
        <li>You collect premium from both the Call buyer and the Put buyer.</li>
        <li>You have a wide "profit zone" between the two strikes.</li>
        <li>The risk is theoretically unlimited on the upside (Call) and substantial on the downside (Put).</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Range-bound, sideways markets where Implied Volatility is exceptionally high (overpriced options) and you expect it to drop.</p>
      <div class="modal-example">
        <b>Example:</b> Stock ABC is bouncing between ₹950 and ₹1050. You sell a ₹1100 Call and a ₹900 Put, collecting ₹30 from each (Total ₹60).<br><br>
        If the stock stays anywhere between ₹900 and ₹1100, both options expire worthless and you keep the double premium. If it breaks out past ₹1100 or drops below ₹900, you start losing money.
      </div>\`
  },
  'wheel': {
    title: 'The Wheel Tracker',
    body: \`
      <p><b>The Wheel</b> is a systematic, multi-stage strategy that generates continuous cash flow by cycling between Puts and Calls.</p>
      <h4>The Cycle</h4>
      <ul>
        <li><b>Phase 1:</b> Sell Cash Secured Puts on a stock you want to own. Keep collecting premium until you get assigned.</li>
        <li><b>Phase 2:</b> You get assigned and buy the stock (at a discount, thanks to the premium).</li>
        <li><b>Phase 3:</b> Sell Covered Calls on your new shares to generate more income. Keep doing this until the shares are called away.</li>
        <li><b>Phase 4:</b> Start over at Phase 1.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Fundamentally strong blue-chip dividend stocks that you would be happy holding for 5+ years even if the market crashes.</p>
      <div class="modal-example">
        <b>Example:</b> You sell Puts on ITC for 3 months, collecting ₹5k each month. Month 4, ITC drops and you are assigned shares at ₹400. Your true cost is ₹385 (₹400 - ₹15k collected).<br><br>
        Now you own ITC. You sell Covered Calls at ₹420 for 3 months, collecting another ₹5k/month. Month 7, ITC rallies to ₹430. Your shares are sold for ₹420. You made profit on the shares, plus 6 months of premium. Now you start selling Puts again!
      </div>\`
  }
};

function openStratModal(stratId) {
  const data = stratDetails[stratId];
  if (!data) return;
  document.getElementById('modalTitle').innerText = data.title;
  document.getElementById('modalBody').innerHTML = data.body;
  document.getElementById('stratModal').classList.add('active');
}

function closeStratModal() {
  document.getElementById('stratModal').classList.remove('active');
}
`;
html = html.replace('</script>', modalJs + '\n</script>');

fs.writeFileSync('options.html', html);
console.log("Injected modal HTML, CSS, and JS.");
