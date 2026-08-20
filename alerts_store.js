const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'js', 'data', 'alerts_db.json');

// Initialize local DB
function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    saveDb([]);
  }
}

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[Alerts Store] Error reading DB:', e.message);
  }
  return [];
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[Alerts Store] Error writing DB:', e.message);
  }
}

let nextId = Date.now();

function insertAlert(alert) {
  const { ticker, strategy_id, timeframe = '1d', price = 0, reason = '', metrics_json = {} } = alert;
  const db = loadDb();
  
  // Check duplicate in last 2 hours
  const now = Date.now();
  const duplicate = db.find(a => a.ticker === ticker && a.strategy_id === strategy_id && (now - new Date(a.triggered_at).getTime()) < 2 * 3600 * 1000);
  if (duplicate) return null;

  const record = {
    id: nextId++,
    ticker,
    strategy_id,
    timeframe,
    price,
    reason,
    metrics_json,
    is_read: 0,
    triggered_at: new Date().toISOString()
  };
  
  db.unshift(record); // Add to beginning
  if (db.length > 500) db.pop(); // Keep top 500
  
  saveDb(db);
  return record.id;
}

function getAlerts(limit = 100, strategyId = null) {
  const db = loadDb();
  let filtered = db;
  if (strategyId && strategyId !== 'all') {
    filtered = db.filter(a => a.strategy_id === strategyId);
  }
  const unreadCount = db.filter(a => a.is_read === 0).length;
  return { rows: filtered.slice(0, limit), unreadCount };
}

function markAlertsAsRead() {
  const db = loadDb();
  db.forEach(a => a.is_read = 1);
  saveDb(db);
  return true;
}

function clearAlerts() {
  saveDb([]);
  return true;
}

module.exports = {
  initDb,
  insertAlert,
  getAlerts,
  markAlertsAsRead,
  clearAlerts
};
