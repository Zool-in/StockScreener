const fs = require('fs');
let html = fs.readFileSync('nse-swing-screener.html', 'utf8');

// 1. Update pills to include info icon
const oldPills = `<div class="filter-bar" id="filterBar" style="display:none">
  <button class="filter-pill on" data-f="all">All</button>
  <button class="filter-pill" data-f="VCP / Coiled">VCP / Coiled</button>
  <button class="filter-pill" data-f="VCP Breakdown">VCP Breakdown</button>
  <button class="filter-pill" data-f="Breakout">Breakout</button>
  <button class="filter-pill" data-f="Pullback">Pullback</button>
  <button class="filter-pill" data-f="RS Leader">RS Leader</button>
  <button class="filter-pill" data-f="Weak">Skip</button>`;
  
const newPills = `<div class="filter-bar" id="filterBar" style="display:none">
  <div class="pill-wrapper"><button class="filter-pill on" data-f="all">All</button></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="VCP / Coiled">VCP / Coiled</button><span class="info-icon" onclick="openStratModal('vcp')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="VCP Breakdown">VCP Breakdown</button><span class="info-icon" onclick="openStratModal('vcp_down')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="Breakout">Breakout</button><span class="info-icon" onclick="openStratModal('breakout')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="Pullback">Pullback</button><span class="info-icon" onclick="openStratModal('pullback')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="RS Leader">RS Leader</button><span class="info-icon" onclick="openStratModal('rs')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="Weak">Skip</button></div>`;

html = html.replace(oldPills, newPills);

// 2. Add CSS for modal and info-icon
const cssInject = `
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pill-wrapper { display: flex; align-items: center; gap: 4px; }
.info-icon { cursor: pointer; font-size: 14px; opacity: 0.6; transition: 0.2s; margin-left: -2px; }
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
  'vcp': {
    title: 'VCP / Coiled (Volatility Contraction Pattern)',
    body: \`
      <p>A <b>VCP (Volatility Contraction Pattern)</b> occurs when a stock's price fluctuations get tighter and tighter while volume dries up.</p>
      <h4>How it works</h4>
      <ul>
        <li>Institutional accumulation happens quietly. The stock stops making wild swings.</li>
        <li>We look for a "tight" daily range (low High-to-Low percentage) combined with exceptionally low volume.</li>
        <li>The moving averages (20, 50, 200 EMA) are usually stacked tightly or acting as support.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Before a major breakout. It's like a coiled spring waiting for a catalyst (earnings, news) to trigger a massive explosive move upward.</p>
      <div class="modal-example">
        <b>Example:</b> A stock was swinging 10% daily a month ago. Two weeks ago, it swung 5%. This week, it's barely moving 1.5% a day and volume is 50% below average. This is the "coil". You buy here with a tight stop-loss right below the base, anticipating a 20%+ breakout.
      </div>\`
  },
  'vcp_down': {
    title: 'VCP Breakdown',
    body: \`
      <p>A <b>VCP Breakdown</b> is the exact opposite of a VCP breakout. The stock was tightly coiled, but the support level failed.</p>
      <h4>How it works</h4>
      <ul>
        <li>The stock was consolidating tightly, but instead of breaking out upward, it broke downward.</li>
        <li>Usually accompanied by a surge in selling volume.</li>
        <li>Often signals the start of a new downtrend or a deep correction.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Bear markets or poor sector performance. Used by short sellers, or as a warning signal for long investors to exit.</p>
      <div class="modal-example">
        <b>Example:</b> Stock ABC was hovering at ₹500 for weeks. Suddenly it closes at ₹480 on massive volume. The coil has snapped in the wrong direction. You would exit any long positions immediately or consider initiating a short position.
      </div>\`
  },
  'breakout': {
    title: 'Momentum Breakout',
    body: \`
      <p>A <b>Breakout</b> strategy catches stocks exactly as they are exploding upward out of a base.</p>
      <h4>How it works</h4>
      <ul>
        <li>The stock must be up significantly today (e.g., +4% or more).</li>
        <li>The trading volume must be a "volume surge" (e.g., 200%+ of its normal average).</li>
        <li>It must be pushing near or past recent highs (very high RSI).</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Strong bull markets. Breakouts in weak markets tend to fail and reverse. You want to buy the strength and ride the momentum wave.</p>
      <div class="modal-example">
        <b>Example:</b> A stock has been trading under ₹1000 for a year. Today, it blasts through ₹1020, up 6% for the day on 3x normal volume. The scanner flags this. You buy the breakout, expecting the momentum to carry it to ₹1100 over the next few days.
      </div>\`
  },
  'pullback': {
    title: 'Moving Average Pullback',
    body: \`
      <p>A <b>Pullback</b> strategy looks to buy strong, fundamentally sound stocks when they go on temporary "sale".</p>
      <h4>How it works</h4>
      <ul>
        <li>The stock must be in a long-term uptrend (above the 200-day EMA).</li>
        <li>However, it has recently dropped in the short term (oversold RSI below 40).</li>
        <li>It is currently bouncing off or testing a key support level like the 50-day EMA.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Steady, grinding bull markets. It's the classic "buy the dip" strategy.</p>
      <div class="modal-example">
        <b>Example:</b> INFY is in a massive uptrend. It hits ₹1600, then the whole market has a bad week and INFY drops to ₹1500, right on its 50-day moving average. The RSI shows it is oversold. You buy at ₹1500, expecting it to resume its uptrend back to ₹1600+.
      </div>\`
  },
  'rs': {
    title: 'Relative Strength (RS) Leader',
    body: \`
      <p>An <b>RS Leader</b> is a stock that is ignoring market weakness and blasting higher anyway.</p>
      <h4>How it works</h4>
      <ul>
        <li>It has a very high ADX (strong trend).</li>
        <li>It is trading very close to its 50-day high.</li>
        <li>All moving averages are perfectly aligned (CMP > 20 EMA > 50 EMA > 200 EMA).</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Any market. If the Nifty is down 1% but a specific stock is up 2%, that stock is an RS Leader. Institutions are buying it regardless of broader market conditions.</p>
      <div class="modal-example">
        <b>Example:</b> The banking sector is crashing, but one specific bank is making new 52-week highs every day. The scanner flags it as an RS Leader. You buy it because the institutional demand is overwhelmingly strong.
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

fs.writeFileSync('nse-swing-screener.html', html);
console.log("Injected modal HTML, CSS, and JS to screener.");
