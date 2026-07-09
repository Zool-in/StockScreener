const fs = require('fs');
let html = fs.readFileSync('btst.html', 'utf8');

// 1. Update pills to include info icon
const oldPills = `<div class="filter-bar" id="filterBar" style="display:none">
  <button class="filter-pill on" data-f="all">All</button>
  <button class="filter-pill" data-f="Strong">Strong</button>
  <button class="filter-pill" data-f="Good">Good</button>
  <button class="filter-pill" data-f="Watch">Watch</button>`;
  
const newPills = `<div class="filter-bar" id="filterBar" style="display:none">
  <div class="pill-wrapper"><button class="filter-pill on" data-f="all">All</button></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="Strong">Strong BTST</button><span class="info-icon" onclick="openStratModal('strong')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="Good">Good BTST</button><span class="info-icon" onclick="openStratModal('good')">ℹ️</span></div>
  <div class="pill-wrapper"><button class="filter-pill" data-f="Watch">Watch / Weak</button><span class="info-icon" onclick="openStratModal('watch')">ℹ️</span></div>`;

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
  'strong': {
    title: 'Strong BTST Signal',
    body: \`
      <p>A <b>Strong BTST</b> (Buy Today Sell Tomorrow) signal means the stock closed at the absolute peak of its daily momentum.</p>
      <h4>How it works</h4>
      <ul>
        <li>The stock closed very near its absolute High of the day (Closing Strength > 85%).</li>
        <li>The volume was significantly higher than average.</li>
        <li>There is unusually high delivery percentage, meaning institutions are taking shares home overnight.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Overall bullish market days. These stocks are heavily accumulated into the closing bell, which almost guarantees a gap-up or continued momentum at tomorrow's open.</p>
      <div class="modal-example">
        <b>Example:</b> Stock ABC opens at ₹100, drops to ₹95, and then steadily climbs all afternoon to close exactly at ₹105 (the high of the day). A massive block of shares was bought at 3:25 PM. You buy at 3:29 PM and sell it the next morning at 9:15 AM when it gaps up to ₹107.
      </div>\`
  },
  'good': {
    title: 'Good BTST Signal',
    body: \`
      <p>A <b>Good BTST</b> signal means the stock had a solid day with decent closing momentum, but lacked the explosive institutional buying of a "Strong" signal.</p>
      <h4>How it works</h4>
      <ul>
        <li>The stock closed in the upper quadrant of its daily range (Closing Strength between 60% and 85%).</li>
        <li>Volume and delivery data are positive but not record-breaking.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Can be traded, but relies more on the broader sector momentum. If the whole IT sector is gapping up tomorrow, a "Good" IT stock will likely follow.</p>
      <div class="modal-example">
        <b>Example:</b> Stock XYZ climbs steadily but pulls back slightly in the last 15 minutes of trading. It still closed strong, so it's a solid candidate, but you might hold it for the first hour tomorrow rather than just selling the opening gap.
      </div>\`
  },
  'watch': {
    title: 'Watch / Weak Signal',
    body: \`
      <p>A <b>Watch</b> signal indicates the stock surrendered its gains before the close. It is NOT a recommended BTST candidate.</p>
      <h4>How it works</h4>
      <ul>
        <li>The stock had a big intraday rally but faced heavy selling pressure in the afternoon (Closing Strength < 50%).</li>
        <li>It closed far away from the high of the day.</li>
      </ul>
      <h4>Best Environment</h4>
      <p>Avoid taking these overnight. The sellers are already in control, and it is highly likely to gap down or open flat tomorrow.</p>
      <div class="modal-example">
        <b>Example:</b> Stock climbs 5% by noon, but slowly bleeds out all afternoon and closes up only 1%. The people who bought in the morning are trapped and will likely sell at tomorrow's open, pushing the price down.
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

fs.writeFileSync('btst.html', html);
console.log("Injected modal HTML, CSS, and JS to BTST.");
