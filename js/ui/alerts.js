// ─── Live Alerts Manager Module ──────────────────────────────────────────────
let knownAlertIds = new Set();
let activeFilter = 'all';

export function initAlerts() {
  const tabAlerts = document.getElementById('tabAlerts');
  const alertsView = document.getElementById('alerts-view');
  const screenerView = document.getElementById('screener-view');
  const scriptsView = document.getElementById('scripts-view');
  const btView = document.getElementById('bt-view');

  // Navigation tab click handler
  if (tabAlerts) {
    tabAlerts.addEventListener('click', (e) => {
      e.preventDefault();

      // Reset tab active styles
      document.querySelectorAll('.nav-tab').forEach(t => t.style.color = 'var(--text-muted)');
      tabAlerts.style.color = 'var(--text-main)';

      // Hide other views
      if (screenerView) screenerView.style.display = 'none';
      if (scriptsView) scriptsView.style.display = 'none';
      if (btView) btView.style.display = 'none';
      if (alertsView) alertsView.style.display = 'block';

      // Mark alerts as read
      markAlertsAsRead();
      fetchAlerts();
    });
  }

  // Header controls handlers
  const filterSelect = document.getElementById('alertStrategyFilter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      activeFilter = e.target.value;
      fetchAlerts();
    });
  }

  const btnClear = document.getElementById('btnClearAlerts');
  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all historical alerts?')) {
        await fetch('/api/alerts/clear', { method: 'POST' });
        knownAlertIds.clear();
        fetchAlerts();
      }
    });
  }

  const btnMarkRead = document.getElementById('btnMarkReadAlerts');
  if (btnMarkRead) {
    btnMarkRead.addEventListener('click', () => {
      markAlertsAsRead();
    });
  }

  // Poll alerts every 15 seconds
  fetchAlerts();
  setInterval(fetchAlerts, 15000);
}

export async function fetchAlerts() {
  try {
    const res = await fetch(`/api/alerts?strategy=${activeFilter}&limit=100`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    const { rows = [], unreadCount = 0 } = data;

    // Update unread badge
    const badge = document.getElementById('alertBadge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Check for newly triggered alerts to show toast
    rows.forEach(alert => {
      if (!knownAlertIds.has(alert.id)) {
        knownAlertIds.add(alert.id);
        if (knownAlertIds.size > rows.length) {
          showToastAlert(alert);
        }
      }
    });

    renderAlertsTable(rows);
  } catch (err) {
    console.error('Error fetching alerts:', err);
  }
}

async function markAlertsAsRead() {
  try {
    await fetch('/api/alerts/read', { method: 'POST' });
    const badge = document.getElementById('alertBadge');
    if (badge) badge.classList.add('hidden');
  } catch (e) {
    console.error('Error marking alerts read:', e);
  }
}

function renderAlertsTable(rows) {
  const container = document.getElementById('alertsTableContainer');
  if (!container) return;

  if (rows.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">🔔</div>
        <div style="font-size: 16px; font-weight: 600;">No Alerts Triggered Yet</div>
        <div style="font-size: 13px; margin-top: 4px; opacity: 0.7;">Background engine automatically scans strategies during market hours. Signals will appear here in real-time.</div>
      </div>
    `;
    return;
  }

  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
      <thead>
        <tr style="background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border);">
          <th style="padding: 12px 16px; color: var(--text-muted);">Time</th>
          <th style="padding: 12px 16px; color: var(--text-muted);">Scrip</th>
          <th style="padding: 12px 16px; color: var(--text-muted);">Strategy</th>
          <th style="padding: 12px 16px; color: var(--text-muted); text-align: right;">Price (₹)</th>
          <th style="padding: 12px 16px; color: var(--text-muted);">Reason</th>
          <th style="padding: 12px 16px; color: var(--text-muted); text-align: center;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(r => {
    const timeStr = new Date(r.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = new Date(r.triggered_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const isUnread = !r.is_read;

    const stratNameMap = {
      elephant_bullish: 'Oliver Velez Elephant 🐘',
      elephant_bearish: 'Oliver Velez Elephant 🐘 (Short)',
      gap_momentum: 'Gap Expansion ⚡',
      mast_breakout: 'MAST Breakout 🚀',
      mast_dip: 'MAST Buy-on-Dip 🎯',
      mast_breakdown: 'MAST Breakdown 💥',
      mast_rally_short: 'MAST Sell-on-Rally 🔻',
      ohl_bullish: 'Open = Low',
      ohl_bearish: 'Open = High',
      ttm_orb: 'TTM Squeeze + ORB',
      minervini: 'Minervini VCP',
      darvas: 'Darvas Box',
      smc_bullish: 'SMC Sweep Bullish',
      smc_bearish: 'SMC Sweep Bearish',
      multi_tf: 'Multi-TF Confluence'
    };

    const stratLabel = stratNameMap[r.strategy_id] || r.strategy_id.toUpperCase();

    html += `
      <tr class="alert-row" data-id="${r.id}" style="border-bottom: 1px solid var(--border); ${isUnread ? 'background: rgba(36, 180, 126, 0.05); font-weight: 500;' : ''}">
        <td style="padding: 12px 16px; font-family: var(--mono); color: var(--text-muted); font-size: 12px;">
          ${timeStr} <span style="opacity: 0.6; font-size: 11px;">(${dateStr})</span>
        </td>
        <td style="padding: 12px 16px; font-weight: 700;">
          <a href="https://in.tradingview.com/chart/?symbol=NSE%3A${r.ticker}" target="_blank" style="color: var(--v-accent); text-decoration: none; border-bottom: 1px dashed var(--border);">
            ${r.ticker} ↗
          </a>
        </td>
        <td style="padding: 12px 16px;">
          <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: var(--surface-hover); border: 1px solid var(--border);">
            ${stratLabel}
          </span>
        </td>
        <td style="padding: 12px 16px; text-align: right; font-family: var(--mono); font-weight: 600;">
          ₹${Number(r.price).toFixed(2)}
        </td>
        <td style="padding: 12px 16px; color: var(--text-muted); font-size: 12px; max-width: 350px;">
          ${r.reason || 'Strategy signal triggered on volume expansion.'}
        </td>
        <td style="padding: 12px 16px; text-align: center;">
          <button class="btn-view-alert-detail" data-ticker="${r.ticker}" data-strategy="${r.strategy_id}" data-price="${r.price}" data-reason="${encodeURIComponent(r.reason || '')}" style="padding: 4px 10px; font-size: 11px; border-radius: 4px; background: var(--v-accent); color: #000; font-weight: 700; border: none; cursor: pointer;">
            Details ℹ
          </button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Attach click listener for detail buttons
  container.querySelectorAll('.btn-view-alert-detail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ticker = btn.dataset.ticker;
      const strategyId = btn.dataset.strategy;
      const price = btn.dataset.price;
      const reason = decodeURIComponent(btn.dataset.reason || '');

      const modalTitle = document.getElementById('modalTitle');
      const modalDesc = document.getElementById('modalDescription');
      const modalEx = document.getElementById('modalExample');
      const modal = document.getElementById('strategyModal');

      if (modalTitle && modalDesc && modal) {
        modalTitle.innerHTML = `${ticker} — Alert Details (${strategyId.toUpperCase()})`;
        modalDesc.innerHTML = `<b>Triggered Signal:</b> ${reason}`;
        if (modalEx) {
          modalEx.innerHTML = `
            <div style="background: rgba(0,0,0,0.2); padding: 14px; border-radius: 6px; border: 1px solid var(--border); margin-top: 10px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span>Ticker: <b>${ticker}</b></span>
                <span>Signal Price: <b style="color: var(--green);">₹${Number(price).toFixed(2)}</b></span>
              </div>
              <div style="margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
                TradingView Link: <a href="https://in.tradingview.com/chart/?symbol=NSE%3A${ticker}" target="_blank" style="color: var(--v-accent);">NSE:${ticker} Live Chart ↗</a>
              </div>
              <div style="color: var(--v-accent); font-weight: 600; font-size: 12px;">💡 Recommended Action: Verify volume breakout on 15m/Daily chart before entering position.</div>
            </div>
          `;
        }
        modal.classList.remove('hidden');
      }
    });
  });
}

function showToastAlert(alert) {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.style.cssText = 'background: #18181b; border: 1px solid var(--v-accent); border-radius: 8px; padding: 12px 16px; width: 320px; color: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.5); pointer-events: auto; font-size: 13px;';
  
  toast.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
      <span style="font-weight: 700; color: var(--v-accent); display: flex; align-items: center; gap: 6px;">
        🔔 Strategy Alert
      </span>
      <span style="font-size: 11px; opacity: 0.6;">Just now</span>
    </div>
    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
      ${alert.ticker} — ₹${Number(alert.price).toFixed(2)}
    </div>
    <div style="font-size: 12px; color: var(--text-muted);">
      ${alert.reason || alert.strategy_id}
    </div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s ease-out';
    setTimeout(() => toast.remove(), 500);
  }, 6000);
}
