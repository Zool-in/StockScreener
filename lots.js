// ─── NSE F&O lot sizes (live, official) ───────────────────────────────────
// Lot sizes change every contract cycle, so hardcoding them goes stale fast.
// This pulls the current lot size for every F&O underlying from Kite's public
// NFO instruments dump (no auth needed, reachable where NSE-web is blocked) and
// caches it for the day.
//
// Zero external dependencies — Node core only.

const https = require('https');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'kite-instruments-NFO.csv');
const URL_NFO = 'https://api.kite.trade/instruments/NFO';

function istDay() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }

function get(urlStr, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      host: u.host, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', 'X-Kite-Version': '3', 'Accept': 'text/csv,*/*' },
    }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

let cache = null; // { day, lots }

// Returns { UNDERLYING: lotSize } for all NSE F&O names.
async function getLots() {
  if (cache && cache.day === istDay()) return cache.lots;

  let csv = null;
  // Reuse today's cached NFO dump if fresh.
  try {
    const stat = fs.statSync(CACHE_FILE);
    const fresh = new Date(stat.mtimeMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === istDay();
    if (fresh) csv = fs.readFileSync(CACHE_FILE, 'utf8');
  } catch (_) {}

  if (!csv) {
    const r = await get(URL_NFO);
    if (r.status !== 200 || !r.body.includes('lot_size')) {
      throw new Error(`Could not fetch NFO instruments (${r.status})`);
    }
    csv = r.body;
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(CACHE_FILE, csv); } catch (_) {}
  }

  // Columns: instrument_token,exchange_token,tradingsymbol,name,last_price,
  //          expiry,strike,tick_size,lot_size,instrument_type,segment,exchange
  const lots = {};
  const lines = csv.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 10) continue;
    if (c[9] !== 'FUT') continue;              // futures rows carry the underlying's lot
    const name = (c[3] || '').replace(/"/g, '').trim();
    const lot = parseInt(c[8], 10);
    if (name && Number.isFinite(lot) && lot > 0) lots[name] = lot;
  }
  cache = { day: istDay(), lots };
  return lots;
}

module.exports = { getLots };
