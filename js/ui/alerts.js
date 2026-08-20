export function initAlerts() {
  const btnMarkRead = document.getElementById('btnMarkReadAlerts');
  const btnClear = document.getElementById('btnClearAlerts');
  const btnTestAlert = document.getElementById('btnTestAlert');
  const filterSelect = document.getElementById('alertStrategyFilter');

  if (btnMarkRead) {
    btnMarkRead.addEventListener('click', async () => {
      try {
        await fetch('/api/alerts/read', { method: 'POST' });
        loadAlerts();
        const tab = document.getElementById('tabAlerts');
        if (tab) tab.innerHTML = `Live Alerts 🔴`;
      } catch (e) {
        console.error('Error marking alerts read:', e);
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all alerts?')) return;
      try {
        await fetch('/api/alerts/clear', { method: 'POST' });
        loadAlerts();
        const tab = document.getElementById('tabAlerts');
        if (tab) tab.innerHTML = `Live Alerts 🔴`;
      } catch (e) {
        console.error('Error clearing alerts:', e);
      }
    });
  }

  if (btnTestAlert) {
    btnTestAlert.addEventListener('click', async () => {
      try {
        await fetch('/api/alerts/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: 'TEST_STOCK',
            strategy_id: 'elephant_bullish',
            timeframe: '15m',
            price: 150.25,
            reason: '🐘 Test Alert: This is a simulated alert to test the local storage system.'
          })
        });
        loadAlerts();
      } catch (e) {
        console.error('Error triggering test alert:', e);
      }
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      loadAlerts();
    });
  }

  // Auto-refresh every 30 seconds if tab is active
  setInterval(() => {
    const alertsView = document.getElementById('alerts-view');
    if (alertsView && alertsView.style.display !== 'none') {
      loadAlerts();
    }
  }, 30000);
}

export function onAlertsTabActivated() {
  loadAlerts();
}

async function loadAlerts() {
  const container = document.getElementById('alertsTableContainer');
  if (!container) return;

  const filterSelect = document.getElementById('alertStrategyFilter');
  const strategyId = filterSelect ? filterSelect.value : 'all';

  try {
    const res = await fetch(`/api/alerts?limit=100&strategy=${strategyId}`);
    if (!res.ok) throw new Error('Failed to fetch alerts');
    const data = await res.json();
    
    // Update unread count badge on tab
    const tab = document.getElementById('tabAlerts');
    if (tab) {
      if (data.unreadCount > 0) {
        tab.innerHTML = `Live Alerts <span class="badge badge-red" style="padding:2px 6px; margin-left:6px; font-size:11px;">${data.unreadCount}</span>`;
      } else {
        tab.innerHTML = `Live Alerts 🔴`;
      }
    }

    renderAlertsTable(data.rows || []);
  } catch (err) {
    console.error('Failed to load alerts:', err);
    container.innerHTML = `<div style="padding:20px; color:var(--red);">Error loading alerts: ${err.message}</div>`;
  }
}

function renderAlertsTable(alerts) {
  const container = document.getElementById('alertsTableContainer');
  if (!container) return;

  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">📭</div>
        <h3 style="margin: 0 0 8px 0; color: var(--text-main);">No recent alerts</h3>
        <p style="margin: 0; font-size: 13px;">Background scanner is running. Signals will appear here when strategies trigger.</p>
      </div>
    `;
    return;
  }

  const thead = `
    <thead>
      <tr>
        <th style="width:120px;">Time</th>
        <th style="width:100px;">Scrip</th>
        <th style="width:80px;">Price</th>
        <th>Trigger Reason</th>
      </tr>
    </thead>
  `;

  const tbody = alerts.map(a => {
    const date = new Date(a.triggered_at);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isUnread = a.is_read === 0;
    
    // Parse JSON metrics if present for debugging/advanced views
    let extraHTML = '';
    if (a.metrics_json) {
      try {
        const metrics = typeof a.metrics_json === 'string' ? JSON.parse(a.metrics_json) : a.metrics_json;
        if (metrics.execution_status) {
           extraHTML = `<div style="margin-top:4px; font-size:11px; color:var(--accent);">${metrics.execution_status}</div>`;
        }
      } catch (e) {}
    }

    return `
      <tr style="background: ${isUnread ? 'rgba(59, 130, 246, 0.08)' : 'transparent'};">
        <td style="color:var(--text-muted); font-size:12px; white-space:nowrap;">
          <div>${dateStr}</div>
          <div>${timeStr} ${isUnread ? '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--v-accent); margin-left:2px;" title="New"></span>' : ''}</div>
        </td>
        <td><strong>${a.ticker}</strong></td>
        <td>₹${a.price.toFixed(2)}</td>
        <td style="font-size:13px; color:var(--text-main); line-height:1.4;">
          ${a.reason}
          ${extraHTML}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `<table class="screener-table">${thead}<tbody>${tbody}</tbody></table>`;
}
