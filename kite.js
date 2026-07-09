// ─── Kite Connect (Zerodha) data source ───────────────────────────────────
// Reliable NSE OHLCV straight from your broker — unaffected by Yahoo/NSE IP
// blocks. Used as the PRIMARY source when configured; server.js falls back to
// Yahoo + public proxies otherwise.
//
// Setup (one-time):
//   1. Create a Kite Connect app at https://developers.kite.trade/apps
//      (Kite Connect is a paid subscription; historical data is included).
//   2. Set the app's Redirect URL to exactly:  http://127.0.0.1:5173/kite/callback
//   3. Provide credentials to this server via env vars or kite-config.json:
//        KITE_API_KEY, KITE_API_SECRET
//   4. Start the server, open the app, click "Connect Kite", log in.
//      Access tokens expire daily (~6am IST) — just click Connect again.
//
// Zero external dependencies — Node core only.

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, '.cache');
const SESSION_FILE = path.join(CACHE_DIR, 'kite-session.json');
const INSTR_FILE = path.join(CACHE_DIR, 'kite-instruments-NSE.csv');

const KITE_BASE = 'https://api.kite.trade';
const KITE_VERSION = '3';

// ─── Credentials ──────────────────────────────────────────────────────────
function loadConfig() {
  let cfg = {
    apiKey: process.env.KITE_API_KEY || '',
    apiSecret: process.env.KITE_API_SECRET || '',
  };
  // Optional kite-config.json overrides/supplements env vars.
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'kite-config.json'), 'utf8'));
    cfg.apiKey = cfg.apiKey || j.api_key || j.apiKey || '';
    cfg.apiSecret = cfg.apiSecret || j.api_secret || j.apiSecret || '';
  } catch (_) { /* file is optional */ }
  return cfg;
}
const CONFIG = loadConfig();

function isConfigured() {
  return Boolean(CONFIG.apiKey && CONFIG.apiSecret);
}

// ─── Small HTTPS helper (GET/POST) ────────────────────────────────────────
function request(method, urlStr, { headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      host: u.host,
      path: u.pathname + u.search,
      method,
      headers: { 'X-Kite-Version': KITE_VERSION, ...headers },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

// ─── Session (access token) ───────────────────────────────────────────────
// Access tokens are valid for one trading day. We store the token with the
// IST date it was minted and treat a different IST date as expired.
function istDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}
function readSession() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); }
  catch (_) { return null; }
}
function hasValidSession() {
  const s = readSession();
  return Boolean(s && s.access_token && s.date === istDate() && s.api_key === CONFIG.apiKey);
}
function saveSession(obj) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2));
}

// The URL the user visits to authorize. Kite redirects back to the app's
// registered Redirect URL with ?request_token=... on success.
function loginUrl() {
  return `https://kite.trade/connect/login?api_key=${encodeURIComponent(CONFIG.apiKey)}&v=3`;
}

// Exchange a request_token (from the redirect) for an access_token.
async function exchangeToken(requestToken) {
  const checksum = crypto.createHash('sha256')
    .update(CONFIG.apiKey + requestToken + CONFIG.apiSecret)
    .digest('hex');
  const form = `api_key=${encodeURIComponent(CONFIG.apiKey)}`
    + `&request_token=${encodeURIComponent(requestToken)}`
    + `&checksum=${checksum}`;
  const r = await request('POST', `${KITE_BASE}/session/token`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  let parsed;
  try { parsed = JSON.parse(r.body); } catch (_) { parsed = {}; }
  if (r.status !== 200 || parsed.status !== 'success') {
    throw new Error(parsed.message || `Token exchange failed (${r.status})`);
  }
  const d = parsed.data;
  saveSession({
    api_key: CONFIG.apiKey,
    access_token: d.access_token,
    user_id: d.user_id,
    user_name: d.user_name,
    date: istDate(),
  });
  return d;
}

// ─── Instruments (symbol → instrument_token) ──────────────────────────────
let instrumentMap = null; // { TRADINGSYMBOL: token }

async function ensureInstruments() {
  // Refresh the NSE instruments dump at most once per IST day.
  let fresh = false;
  try {
    const stat = fs.statSync(INSTR_FILE);
    fresh = new Date(stat.mtimeMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === istDate();
  } catch (_) { fresh = false; }

  if (!fresh) {
    const r = await request('GET', `${KITE_BASE}/instruments/NSE`, { timeoutMs: 25000 });
    if (r.status === 200 && r.body.includes('instrument_token')) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(INSTR_FILE, r.body);
    }
  }
  if (instrumentMap && fresh) return instrumentMap;

  const csv = fs.readFileSync(INSTR_FILE, 'utf8');
  const map = {};
  const lines = csv.split('\n');
  // Columns: instrument_token(0),exchange_token(1),tradingsymbol(2),name(3),
  //   last_price(4),expiry(5),strike(6),tick_size(7),lot_size(8),
  //   instrument_type(9),segment(10),exchange(11)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 10) continue;
    if (cols[9] !== 'EQ') continue; // equities only
    map[cols[2]] = Number(cols[0]);
  }
  instrumentMap = map;
  return map;
}

// ─── Fetch history and shape it like a Yahoo chart payload ────────────────
function rangeToDays(range) {
  const m = { '1mo': 40, '3mo': 100, '6mo': 190, '1y': 370, '2y': 740 };
  return m[range] || 100;
}
function fmtDate(d) {
  // Kite expects 'YYYY-MM-DD HH:MM:SS'
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Returns a JSON string in Yahoo-chart shape (so the front-end is unchanged),
// or throws with a clear message.
async function fetchChart(symbol, interval, range) {
  if (!isConfigured()) throw new Error('Kite not configured');
  if (!hasValidSession()) throw new Error('Kite session expired — click Connect Kite');

  const tradingsymbol = symbol.replace(/\.NS$/i, '').toUpperCase();
  const map = await ensureInstruments();
  const token = map[tradingsymbol];
  if (!token) throw new Error(`Symbol ${tradingsymbol} not found on NSE`);

  const s = readSession();
  const to = new Date();
  const from = new Date(to.getTime() - rangeToDays(range) * 86400000);
  const url = `${KITE_BASE}/instruments/historical/${token}/day`
    + `?from=${encodeURIComponent(fmtDate(from))}&to=${encodeURIComponent(fmtDate(to))}`;

  const r = await request('GET', url, {
    headers: { 'Authorization': `token ${CONFIG.apiKey}:${s.access_token}` },
    timeoutMs: 15000,
  });
  let parsed;
  try { parsed = JSON.parse(r.body); } catch (_) { parsed = {}; }
  if (r.status === 403) {
    // token invalidated — force re-login
    try { fs.unlinkSync(SESSION_FILE); } catch (_) {}
    throw new Error('Kite session rejected — click Connect Kite');
  }
  if (r.status !== 200 || parsed.status !== 'success') {
    throw new Error(parsed.message || `Kite historical failed (${r.status})`);
  }
  const candles = parsed.data.candles || [];
  if (!candles.length) throw new Error(`No candles for ${tradingsymbol}`);

  const timestamp = [], open = [], high = [], low = [], close = [], volume = [];
  for (const c of candles) {
    timestamp.push(Math.floor(Date.parse(c[0]) / 1000));
    open.push(c[1]); high.push(c[2]); low.push(c[3]); close.push(c[4]); volume.push(c[5]);
  }
  const lastClose = close[close.length - 1];

  // Look up a display name from the instruments CSV (best-effort).
  let name = tradingsymbol;
  try {
    const line = fs.readFileSync(INSTR_FILE, 'utf8').split('\n')
      .find(l => l.split(',')[2] === tradingsymbol);
    if (line) name = (line.split(',')[3] || '').replace(/"/g, '') || tradingsymbol;
  } catch (_) {}

  const payload = {
    chart: {
      result: [{
        meta: {
          currency: 'INR', symbol: `${tradingsymbol}.NS`, exchangeName: 'NSI',
          instrumentType: 'EQUITY', regularMarketPrice: lastClose,
          longName: name, shortName: name, dataGranularity: '1d', range,
        },
        timestamp,
        indicators: { quote: [{ open, high, low, close, volume }] },
      }],
      error: null,
    },
  };
  return JSON.stringify(payload);
}

// ─── Real-time LTP (last traded price) ────────────────────────────────────
// Exchange-accurate, real-time prices straight from the broker feed — this is
// what makes the displayed price match your Kite/Zerodha terminal exactly.
// Returns { TRADINGSYMBOL: last_price }.
async function getLtp(symbols) {
  if (!isConfigured() || !hasValidSession()) throw new Error('Kite not connected');
  const s = readSession();
  const uniq = [...new Set(symbols.map(x => x.replace(/\.NS$/i, '').toUpperCase()))];
  const out = {};
  // The LTP endpoint takes repeated i=EXCH:SYMBOL params; batch to stay safe.
  for (let i = 0; i < uniq.length; i += 400) {
    const batch = uniq.slice(i, i + 400);
    const qs = batch.map(sy => `i=NSE:${encodeURIComponent(sy)}`).join('&');
    const r = await request('GET', `${KITE_BASE}/quote/ltp?${qs}`, {
      headers: { 'Authorization': `token ${CONFIG.apiKey}:${s.access_token}` },
    });
    let parsed; try { parsed = JSON.parse(r.body); } catch (_) { parsed = {}; }
    if (r.status === 403) { try { fs.unlinkSync(SESSION_FILE); } catch (_) {} throw new Error('Kite session rejected'); }
    if (r.status !== 200 || parsed.status !== 'success') throw new Error(parsed.message || `Kite LTP failed (${r.status})`);
    for (const [key, val] of Object.entries(parsed.data || {})) {
      const sym = key.replace(/^NSE:/, '');
      if (val && val.last_price != null) out[sym] = val.last_price;
    }
  }
  return out;
}

function status() {
  const s = readSession();
  return {
    configured: isConfigured(),
    connected: hasValidSession(),
    user: s && s.date === istDate() ? (s.user_name || s.user_id || null) : null,
    loginUrl: isConfigured() ? '/kite/login' : null,
  };
}

module.exports = {
  isConfigured, hasValidSession, loginUrl, exchangeToken, fetchChart, getLtp, status,
};
