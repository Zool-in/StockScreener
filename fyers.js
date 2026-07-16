// ─── Fyers API v3 data source ───────────────────────────────────────────────
// Reliable NSE OHLCV straight from your broker. Used as a PRIMARY source
// alongside Kite. 
//
// Setup (one-time):
//   1. Create an app at https://myapi.fyers.in/dashboard
//   2. Set the Redirect URL to exactly:  https://stockscreener.fly.dev/fyers/callback
//   3. Provide credentials to this server via env vars or fyers-config.json:
//        FYERS_APP_ID, FYERS_APP_SECRET
//
// Zero external dependencies — Node core only.

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, '.cache');
const SESSION_FILE = path.join(ROOT, 'fyers.session.json');

const FYERS_BASE = 'https://api-t1.fyers.in';
const REDIRECT_URI = process.env.FYERS_REDIRECT_URI || 'https://goldenrod-locust-579147.hostingersite.com/fyers/callback';

// ─── Credentials ──────────────────────────────────────────────────────────
function loadConfig() {
  let cfg = {
    appId: process.env.FYERS_APP_ID || '',
    appSecret: process.env.FYERS_APP_SECRET || '',
  };
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'fyers-config.json'), 'utf8'));
    cfg.appId = cfg.appId || j.appId || j.app_id || '';
    cfg.appSecret = cfg.appSecret || j.appSecret || j.app_secret || '';
  } catch (_) { /* file is optional */ }
  return cfg;
}
const CONFIG = loadConfig();

function isConfigured() {
  return Boolean(CONFIG.appId && CONFIG.appSecret);
}

// ─── Small HTTPS helper (GET/POST) ────────────────────────────────────────
let fyersQueue = Promise.resolve();

function request(method, endpoint, body = null, headers = {}) {
  const p = fyersQueue.then(() => new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : FYERS_BASE + endpoint);
    const reqHeaders = { 'User-Agent': 'Node/StockScan', ...headers };
    if (body) {
      if (typeof body === 'object') body = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(url, { method, headers: reqHeaders }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 429) {
            return reject(new Error('FYERS_RATE_LIMIT'));
          }
          if (res.statusCode >= 400 || parsed.s === 'error') {
            return reject(new Error(`Fyers error ${res.statusCode}: ${parsed.message || data}`));
          }
          resolve(parsed);
        } catch (e) {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          else resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  }));

  // Enforce global 10 req/sec limit across all concurrent requests
  fyersQueue = p.catch(() => {}).then(() => new Promise(r => setTimeout(r, 110)));
  return p;
}

// ─── Session Management ───────────────────────────────────────────────────
let currentSession = null;
let lastSessionDay = null;

function getIstDay() {
  const d = new Date(new Date().getTime() + 330 * 60000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function loadSession() {
  try {
    const d = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (d.day === getIstDay()) {
      currentSession = d;
      lastSessionDay = d.day;
      return;
    }
  } catch (_) {}
  
  // Fallback: if deployment wiped the file, try reading from .env
  try {
    const envPath = path.join(ROOT, '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/FYERS_ACCESS_TOKEN=(.*)/);
    if (match && match[1]) {
      // Use the file modification time of .env to determine if it was set today
      const stat = fs.statSync(envPath);
      const d = new Date(stat.mtimeMs + 330 * 60000);
      const fileDay = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      if (fileDay === getIstDay()) {
        currentSession = { access_token: match[1].trim() };
        lastSessionDay = fileDay;
      }
    }
  } catch (_) {}
}

function saveSession(data) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  data.day = getIstDay();
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2)); } catch(e){}
  currentSession = data;
  lastSessionDay = data.day;
  
  // Also save to .env to survive aggressive deployments that wipe untracked files
  try {
    const envPath = path.join(ROOT, '.env');
    let content = '';
    try { content = fs.readFileSync(envPath, 'utf8'); } catch(e){}
    const tokenLine = `FYERS_ACCESS_TOKEN=${data.access_token}`;
    if (content.includes('FYERS_ACCESS_TOKEN=')) {
      content = content.replace(/FYERS_ACCESS_TOKEN=.*/g, tokenLine);
    } else {
      content += `\n${tokenLine}\n`;
    }
    fs.writeFileSync(envPath, content);
  } catch(e) {
    console.error("Could not write Fyers token to .env", e);
  }
}

function hasValidSession() {
  if (!currentSession) loadSession();
  return currentSession && lastSessionDay === getIstDay();
}

function getAuthHeader() {
  if (!hasValidSession()) throw new Error('Fyers session expired or missing');
  return `${CONFIG.appId}:${currentSession.access_token}`;
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────
function loginUrl() {
  return `${FYERS_BASE}/api/v3/generate-authcode?client_id=${CONFIG.appId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&state=fyers`;
}

async function exchangeToken(authCode) {
  const appIdHash = crypto.createHash('sha256').update(`${CONFIG.appId}:${CONFIG.appSecret}`).digest('hex');
  const res = await request('POST', '/api/v3/validate-authcode', {
    grant_type: 'authorization_code',
    appIdHash: appIdHash,
    code: authCode
  });
  if (res.s === 'ok' && res.access_token) {
    saveSession(res);
    return res;
  }
  throw new Error('Failed to exchange Fyers token: ' + JSON.stringify(res));
}

// ─── Data Fetching ────────────────────────────────────────────────────────
// Yahoo returns Yahoo format. We must map Fyers history to Yahoo format.
async function fetchChart(symbol, interval = '1d', range = '3mo') {
  // Convert symbol (e.g. RELIANCE.NS) to Fyers format (NSE:RELIANCE-EQ)
  const basename = symbol.replace(/\.NS$/i, '').toUpperCase();
  // Simple check for Indices vs Equities. (NIFTY 50 -> NSE:NIFTY50-INDEX)
  let fyersSym = `NSE:${basename}-EQ`;
  if (basename.includes('NIFTY')) {
    fyersSym = `NSE:${basename.replace(/\s+/g, '')}-INDEX`;
  }

  // Map interval to Fyers resolution
  const resMap = { '5m': '5', '15m': '15', '60m': '60', '1h': '60', '1d': '1D', '1wk': '1W', '1mo': '1M' };
  const resolution = resMap[interval] || '1D';

  // Calculate range_from and range_to (Epoch seconds)
  const to = Math.floor(Date.now() / 1000);
  let days = 90; // Default 3mo
  if (range === '60d') days = 60;
  if (range === '1y') days = 365;
  if (range === '5y') days = 365 * 5;
  if (range === '10y') days = 365 * 10;
  const from = to - (days * 24 * 60 * 60);

  // Use 360 instead of 365 to safely avoid Fyers rejecting chunks that span a leap day or overlap time boundaries.
  const maxDays = ['1D', '1W', '1M'].includes(resolution) ? 360 : 90;
  const chunkSecs = maxDays * 24 * 60 * 60;
  
  let allCandles = [];
  let currentTo = to;

  while (currentTo > from) {
    let currentFrom = currentTo - chunkSecs;
    if (currentFrom < from) currentFrom = from;

    const url = `${FYERS_BASE}/data/history?symbol=${encodeURIComponent(fyersSym)}&resolution=${resolution}&date_format=0&range_from=${currentFrom}&range_to=${currentTo}&cont_flag=1`;
    
    let res;
    let success = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        res = await request('GET', url, null, { Authorization: getAuthHeader() });
        success = true;
        break;
      } catch (e) {
        if (e.message === 'FYERS_RATE_LIMIT' && attempt < 4) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw e;
      }
    }

    if (!success || res.s !== 'ok' || !res.candles || res.candles.length === 0) {
      if (allCandles.length > 0) break; // Reached listing date of a newer stock
      throw new Error('No history found');
    }
    
    allCandles = res.candles.concat(allCandles); // prepend older data
    currentTo = currentFrom - 1;
    
    // Throttle to respect Fyers strict rate limit when making multiple requests per stock
    if (currentTo > from) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Convert to Yahoo format: { chart: { result: [{ timestamp:[], indicators:{quote:[{open:[], high:[], low:[], close:[], volume:[]}]} }] } }
  const t = [], o = [], h = [], l = [], c = [], v = [];
  for (const row of allCandles) {
    // Fyers timestamp is in epoch seconds
    t.push(row[0]);
    o.push(row[1]);
    h.push(row[2]);
    l.push(row[3]);
    c.push(row[4]);
    v.push(row[5]);
  }

  return JSON.stringify({
    chart: {
      result: [{
        timestamp: t,
        indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] }
      }]
    }
  });
}

// Fetch live quotes for multiple symbols
async function getLtp(symbols) {
  if (!symbols || !symbols.length) return {};
  
  // Format chunk of 50 symbols max per request
  const quotes = {};
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const fyersSyms = chunk.map(s => {
      const b = s.replace(/\.NS$/i, '').toUpperCase();
      return b.includes('NIFTY') ? `NSE:${b.replace(/\s+/g, '')}-INDEX` : `NSE:${b}-EQ`;
    }).join(',');
    let res = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const url = `${FYERS_BASE}/data/quotes?symbols=${encodeURIComponent(fyersSyms)}`;
        res = await request('GET', url, null, { Authorization: getAuthHeader() });
        break; // success
      } catch (e) {
        if (e.message === 'FYERS_RATE_LIMIT' && attempt < 4) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        console.error(`Fyers getLtp exception (attempt ${attempt}):`, e.message);
        break; // permanent error
      }
    }

    if (res && res.s === 'ok' && res.d) {
      res.d.forEach(item => {
        if (item.v && item.v.lp) {
          // map back to standard symbol (without .NS) so server.js can map it correctly
          const origin = item.n.replace('NSE:', '').replace('-EQ', '').replace('-INDEX', '');
          quotes[origin] = item.v.lp;
        }
      });
    } else if (res) {
      console.error('Fyers getLtp error:', res);
    }
  }
  return quotes;
}

function status() {
  return {
    configured: isConfigured(),
    connected: hasValidSession(),
    user: currentSession?.name || ''
  };
}

module.exports = {
  isConfigured, hasValidSession, loginUrl, exchangeToken, fetchChart, getLtp, status
};

