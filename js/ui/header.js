// ─── Unified Responsive Common Header ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const headerEl = document.getElementById('global-header') || document.querySelector('header.hud-bar');
  if (!headerEl) return;

  // Add global header style overrides for pixel-perfect responsiveness & compact layout
  const style = document.createElement('style');
  style.textContent = `
    .hud-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      background: var(--surface, #161b22);
      border-bottom: 1px solid var(--border, #30363d);
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .hud-brand {
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      text-decoration: none;
      letter-spacing: -0.02em;
    }
    .hud-nav-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
      margin-left: 24px;
    }
    .hud-menu {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .nav-tab {
      color: var(--text-muted, #8b949e);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 6px;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .nav-tab:hover {
      color: var(--text-main, #c9d1d9);
      background: rgba(255, 255, 255, 0.05);
    }
    .nav-tab.active {
      color: var(--text-main, #c9d1d9);
      background: rgba(59, 130, 246, 0.1);
      font-weight: 600;
    }
    .hud-stats {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }
    .hud-stats .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
      text-transform: none;
      letter-spacing: normal;
      height: 24px;
      display: inline-flex;
      align-items: center;
    }
    
    /* Hamburger Menu Toggle */
    .nav-toggle-label {
      display: none;
      cursor: pointer;
      font-size: 20px;
      color: var(--text-main, #c9d1d9);
      user-select: none;
      padding: 4px 8px;
    }
    .nav-toggle {
      display: none;
    }

    @media (max-width: 1080px) {
      .nav-toggle-label {
        display: block;
      }
      .hud-nav-container {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--surface, #161b22);
        border-bottom: 1px solid var(--border, #30363d);
        flex-direction: column;
        align-items: stretch;
        margin-left: 0;
        padding: 16px;
        gap: 16px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      }
      .nav-toggle:checked ~ .hud-nav-container {
        display: flex;
      }
      .hud-menu {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
        gap: 8px;
      }
      .nav-tab {
        padding: 8px 12px;
      }
      .hud-stats {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
        margin-left: 0;
        gap: 8px;
        padding-top: 12px;
        border-top: 1px dashed var(--border, #30363d);
      }
      .hud-stats .badge {
        justify-content: center;
        height: 30px;
      }
    }
  `;
  document.head.appendChild(style);

  // Detect Active Page
  const path = window.location.pathname.toLowerCase();
  const isActive = (pageName) => path.includes(pageName);

  // Build the Header DOM structure
  headerEl.innerHTML = `
    <div class="logo">
      <a href="index.html" class="hud-brand">StockScan Pro</a>
    </div>
    
    <input type="checkbox" id="nav-toggle" class="nav-toggle">
    <label for="nav-toggle" class="nav-toggle-label">☰</label>

    <div class="hud-nav-container">
      <div class="hud-menu">
        <a href="index.html#screener" id="tabScreener" class="nav-tab ${isActive('index.html') || path === '/' ? 'active' : ''}">Stock Screener</a>
        <a href="index.html#alerts" id="tabAlerts" class="nav-tab" style="display: inline-flex; align-items: center; gap: 6px;">
          🔔 Live Alerts
          <span id="alertBadge" class="badge badge-red hidden" style="padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; height: auto;">0</span>
        </a>
        <a href="options.html" class="nav-tab ${isActive('options.html') ? 'active' : ''}">Options (Gamma)</a>
        <a href="dna.html" class="nav-tab ${isActive('dna.html') ? 'active' : ''}">🧬 Stock DNA</a>
        <a href="index.html#scripts" id="tabScripts" class="nav-tab">Scripts</a>
      </div>
      <div class="hud-stats">
        <a href="lots.html?v=2" class="badge badge-amber ${isActive('lots.html') ? 'active' : ''}" style="text-decoration:none;">F&O Lot Sizes</a>
        <div id="mmiStatus" class="badge badge-muted" style="cursor: pointer;">Market: Loading... <span class="info-icon" style="margin-left:4px;">i</span></div>
        <div id="niftySrtStatus" class="badge badge-muted">Nifty SRT: Loading...</div>
        <div id="bankNiftySrtStatus" class="badge badge-muted">BNF SRT: Loading...</div>
        <div id="connStatus" class="badge badge-muted">Brokers: Offline</div>
      </div>
    </div>
  `;

  // Dynamic Status Fetching for MMI, Broker Connection & Indices SRT
  async function fetchHeaderStatus() {
    try {
      // 1. Connection Status
      const statusRes = await fetch('/fyers/status');
      const connBadge = document.getElementById('connStatus');
      if (connBadge && statusRes.ok) {
        const data = await statusRes.json();
        if (data.connected) {
          connBadge.className = 'badge badge-green';
          connBadge.innerText = 'Brokers: Connected (Fyers)';
        } else {
          connBadge.className = 'badge badge-red';
          connBadge.innerHTML = 'Brokers: Disconnected <a href="/fyers/login" style="margin-left:6px; color:inherit; text-decoration:underline;">Login</a>';
        }
      } else if (connBadge) {
        connBadge.className = 'badge badge-red';
        connBadge.innerHTML = 'Brokers: Disconnected <a href="/fyers/login" style="margin-left:6px; color:inherit; text-decoration:underline;">Login</a>';
      }
    } catch (_) {}

    try {
      // 2. Market Mood Index (MMI)
      const mmiRes = await fetch('/api/mmi');
      if (mmiRes.ok) {
        const mmiData = await mmiRes.json();
        const mmiBadge = document.getElementById('mmiStatus');
        if (mmiBadge) {
          mmiBadge.innerHTML = `MMI: ${mmiData.value || 'N/A'} <span class="info-icon" style="margin-left:4px; font-weight:normal;">i</span>`;
          if (mmiData.value < 30) mmiBadge.className = 'badge badge-green';
          else if (mmiData.value > 70) mmiBadge.className = 'badge badge-red';
          else mmiBadge.className = 'badge badge-amber';
        }
      }
    } catch (_) {}

    try {
      // 3. Indices SRT
      const srtIndicesRes = await fetch('/api/indices/srt');
      if (srtIndicesRes.ok) {
        const srtData = await srtIndicesRes.json();
        const niftySrtBadge = document.getElementById('niftySrtStatus');
        const bankNiftySrtBadge = document.getElementById('bankNiftySrtStatus');
        
        if (srtData.success) {
          if (niftySrtBadge && srtData.nifty) {
            const nVal = srtData.nifty.value;
            const nZone = srtData.nifty.zone;
            niftySrtBadge.innerHTML = `Nifty SRT: ${nVal}`;
            if (nZone === 'Buying Zone') niftySrtBadge.className = 'badge badge-green';
            else if (nZone === 'Selling Zone') niftySrtBadge.className = 'badge badge-red';
            else niftySrtBadge.className = 'badge badge-amber';
          }
          if (bankNiftySrtBadge && srtData.banknifty) {
            const bVal = srtData.banknifty.value;
            const bZone = srtData.banknifty.zone;
            bankNiftySrtBadge.innerHTML = `BNF SRT: ${bVal}`;
            if (bZone === 'Buying Zone') bankNiftySrtBadge.className = 'badge badge-green';
            else if (bZone === 'Selling Zone') bankNiftySrtBadge.className = 'badge badge-red';
            else bankNiftySrtBadge.className = 'badge badge-amber';
          }
        }
      }
    } catch (_) {}
  }

  // Intercept MMI Click for Info Modal
  const mmiBadge = document.getElementById('mmiStatus');
  if (mmiBadge) {
    mmiBadge.addEventListener('click', () => {
      // Check if Modal elements exist on current page, if so show details
      const modal = document.getElementById('strategyModal');
      const title = document.getElementById('modalTitle');
      const desc = document.getElementById('modalDescription');
      const ex = document.getElementById('modalExample');
      
      if (modal && title && desc && ex) {
        title.innerHTML = 'Market Mood Index (MMI)';
        desc.innerHTML = 'The Market Mood Index (MMI) tracks the sentiment of the overall market. It helps in timing your trades by identifying extreme greed or extreme fear phases.';
        ex.innerHTML = '<strong>&lt; 30 (Extreme Fear):</strong> High probability of a market bottom. Great time for Bottom Catch and Long Term strategies.<br><br><strong>&gt; 70 (Extreme Greed):</strong> High probability of a market top. Great time for Top Catch and Bearish Breakdown strategies.<br><br><span style="color:var(--text-muted)"><strong>Context:</strong> When MMI is in the middle (30-70), focus on stock-specific Trend Breakouts rather than betting on macro direction.</span>';
        modal.classList.remove('hidden');
      } else {
        alert('Market Mood Index (MMI):\n< 30: Extreme Fear (Good for buying)\n> 70: Extreme Greed (Good for selling/hedging)');
      }
    });
  }

  // Load and refresh
  fetchHeaderStatus();
  setInterval(fetchHeaderStatus, 30000);
});
