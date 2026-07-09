// ─── NSE Swing Screener — local dev server + market-data proxy ─────────────
// Zero dependencies (Node core only). Run:  node server.js  (or npm start)
//
// Why this exists: the browser can't call market-data APIs directly — they
// don't send CORS headers, so the fetch is blocked. This server forwards
// /api/chart requests server-side (no CORS in Node) and serves the static
// front-end from the same origin, so the browser only ever talks to
// http://localhost:<PORT>.
//
// Data-source priority for /api/chart:
//   0. Zerodha Kite   — used first when configured + connected (see kite.js)
//   1. NSE Bhavcopy   — DEFAULT: official free EOD data, reliable here (bhavcopy.js)
//   2. Yahoo direct   — session cookie + crumb (works when this IP isn't blocked)
//   3. Public proxies — allorigins/codetabs fetch Yahoo from their own IPs
//   4. Disk cache     — last good copy, so the UI keeps working during outages

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const kite = require('./kite');
const bhavcopy = require('./bhavcopy');
const symbols = require('./symbols');
const livequote = require('./livequote');
const lots = require('./lots');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ─── Tiny promise wrapper around https.get ────────────────────────────────
function httpsGet(urlStr, headers = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      host: u.host,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...headers },
    }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body,
      }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

// ─── Yahoo session (cookie + crumb), cached ───────────────────────────────
let session = null; // { cookie, crumb, ts }
const SESSION_TTL = 30 * 60 * 1000; // 30 min

// Collect the `name=value` pairs from a Set-Cookie header array.
function collectCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return arr.map(c => c.split(';')[0]).join('; ');
}

async function getSession(force = false) {
  if (!force && session && (Date.now() - session.ts) < SESSION_TTL) {
    return session;
  }
  // 1) Prime a cookie from a normal Yahoo page.
  const home = await httpsGet('https://finance.yahoo.com/', {
    'Accept': 'text/html,application/xhtml+xml',
  });
  const cookie = collectCookies(home.headers['set-cookie']);
  if (!cookie) throw new Error('Could not obtain Yahoo session cookie');

  // 2) Exchange the cookie for a crumb token.
  const crumbRes = await httpsGet(
    'https://query1.finance.yahoo.com/v1/test/getcrumb',
    { 'Cookie': cookie, 'Accept': 'text/plain' },
  );
  const crumb = (crumbRes.body || '').trim();
  if (crumbRes.status !== 200 || !crumb || /\s/.test(crumb) || crumb.length > 40) {
    throw new Error('Yahoo is rate-limiting crumb requests (try again shortly)');
  }

  session = { cookie, crumb, ts: Date.now() };
  return session;
}

// ─── Direct Yahoo fetch (session cookie + crumb) ──────────────────────────
// Works when this machine's IP isn't blocked by Yahoo. Returns the raw chart
// JSON string, or throws.
async function fetchDirect(symbol, interval, range) {
  const buildUrl = crumb =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
    + `&crumb=${encodeURIComponent(crumb)}`;

  let s = await getSession();
  let up = await httpsGet(buildUrl(s.crumb), { 'Cookie': s.cookie });
  if (up.status === 401 || up.status === 429) {
    s = await getSession(true); // refresh once
    up = await httpsGet(buildUrl(s.crumb), { 'Cookie': s.cookie });
  }
  if (up.status !== 200) throw new Error(`Yahoo returned ${up.status}`);
  return up.body;
}

// ─── Fallback: public CORS proxies ────────────────────────────────────────
// These fetch Yahoo from THEIR OWN server IPs, so they work even when this
// machine's IP is rate-limited/blocked by Yahoo. They're individually flaky
// (Yahoo throttles them too → intermittent 5xx/timeouts) and respond best to a
// plain curl-style User-Agent, so we present that and retry patiently.
const PROXY_UA = 'curl/8.4.0';

function proxyUrls(yf) {
  const enc = encodeURIComponent(yf);
  return [
    `https://api.allorigins.win/raw?url=${enc}`,
    `https://api.codetabs.com/v1/proxy/?quest=${enc}`,
  ];
}

async function fetchViaProxy(symbol, interval, range) {
  const yf = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const urls = proxyUrls(yf);

  let lastErr = 'unknown';
  // Several rounds — the proxies succeed intermittently, so persistence pays.
  for (let round = 0; round < 4; round++) {
    for (const u of urls) {
      try {
        const r = await httpsGet(u, { 'User-Agent': PROXY_UA }, 9000);
        if (r.status === 200 && r.body.includes('"chart"')) return r.body;
        lastErr = `${new URL(u).host} → ${r.status}`;
      } catch (e) {
        lastErr = `${new URL(u).host} → ${e.message}`;
      }
    }
  }
  throw new Error(lastErr);
}

// ─── Disk cache ───────────────────────────────────────────────────────────
// Yahoo's throttling comes and goes. Once we successfully fetch a symbol we
// stash the payload; if every live path later fails, we serve the last good
// copy (flagged via X-Data-Source: cache) so the UI keeps working.
const CACHE_DIR = path.join(ROOT, '.cache');
function cacheFileFor(symbol, interval, range) {
  const safe = `${symbol}_${interval}_${range}`.replace(/[^\w.\-]/g, '_');
  return path.join(CACHE_DIR, safe + '.json');
}
function writeCache(symbol, interval, range, body) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFileFor(symbol, interval, range), body);
  } catch (_) { /* cache is best-effort */ }
}
function readCache(symbol, interval, range) {
  try { return fs.readFileSync(cacheFileFor(symbol, interval, range), 'utf8'); }
  catch (_) { return null; }
}
// Age of the cached copy in ms, or Infinity if absent.
function cacheAge(symbol, interval, range) {
  try { return Date.now() - fs.statSync(cacheFileFor(symbol, interval, range)).mtimeMs; }
  catch (_) { return Infinity; }
}
const CACHE_FRESH_MS = 15 * 60 * 1000; // serve cache outright if newer than this

// ─── Proxy: /api/chart?symbol=RELIANCE.NS&interval=1d&range=3mo ────────────
async function handleChart(res, reqUrl) {
  const symbol = reqUrl.searchParams.get('symbol');
  const interval = reqUrl.searchParams.get('interval') || '1d';
  const range = reqUrl.searchParams.get('range') || '3mo';

  if (!symbol || !/^[A-Za-z0-9.\-&]+$/.test(symbol)) {
    return sendJSON(res, 400, { error: 'Invalid or missing symbol' });
  }

  let firstErr = '';

  // 0) PRIMARY source: Kite (Zerodha), when configured and connected. This is
  // reliable NSE data straight from the broker, immune to Yahoo/NSE IP blocks.
  if (kite.isConfigured() && kite.hasValidSession()) {
    try {
      const kbody = await kite.fetchChart(symbol, interval, range);
      writeCache(symbol, interval, range, kbody);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Data-Source': 'kite',
      });
      return res.end(kbody);
    } catch (e) {
      // Fall through to Bhavcopy/Yahoo/cache below on any Kite error.
      firstErr = `kite: ${e.message}`;
    }
  }

  // 1) PRIMARY (default) source: NSE official Bhavcopy — free, authoritative,
  // end-of-day. Reliable even from IPs that Yahoo/NSE-web block. Perfect for a
  // daily/swing screener. See bhavcopy.js.
  // Note: Bhavcopy only provides 1d data. If requesting intraday/weekly, skip it.
  if (interval === '1d') {
    try {
      const bbody = await bhavcopy.fetchChart(symbol, interval, range);
      // No per-symbol cache write here: the Bhavcopy day-files are already cached
      // on disk, so re-assembling is cheap and this avoids thousands of tiny
      // writes during a full-market scan.
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Data-Source': 'nse-bhavcopy',
      });
      return res.end(bbody);
    } catch (e) {
      firstErr = firstErr ? `${firstErr}; bhav: ${e.message}` : `bhav: ${e.message}`;
    }
  }

  // Fast path: a recent cached copy is served immediately. Daily OHLCV that's
  // a few minutes old is fine for a swing screener, and this keeps the UI
  // snappy while dodging Yahoo's throttling.
  if (cacheAge(symbol, interval, range) < CACHE_FRESH_MS) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Data-Source': 'cache-fresh',
    });
    return res.end(readCache(symbol, interval, range));
  }

  let body = null;
  // 1) Try direct Yahoo. 2) Fall back to the public proxies.
  try {
    body = await fetchDirect(symbol, interval, range);
  } catch (e) {
    firstErr = firstErr ? `${firstErr}; direct: ${e.message}` : e.message;
    try {
      body = await fetchViaProxy(symbol, interval, range);
    } catch (e2) {
      // 3) Last resort: serve the last cached copy if we have one.
      const cached = readCache(symbol, interval, range);
      if (cached) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Data-Source': 'cache',
        });
        return res.end(cached);
      }
      return sendJSON(res, 502, {
        error: `Live fetch failed for ${symbol} (direct: ${firstErr}; proxy: ${e2.message})`,
      });
    }
  }

  // Guard: make sure we actually got chart JSON, not an HTML block page.
  if (!body || !body.includes('"chart"')) {
    const cached = readCache(symbol, interval, range);
    if (cached) {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Data-Source': 'cache',
      });
      return res.end(cached);
    }
    return sendJSON(res, 502, { error: `No chart data for ${symbol}` });
  }

  writeCache(symbol, interval, range, body); // refresh cache on success
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Data-Source': 'live',
  });
  res.end(body);
}

// ─── Static file serving ──────────────────────────────────────────────────
function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // Prevent path traversal — resolve and confirm it stays under ROOT.
  const filePath = path.normalize(path.join(ROOT, rel));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendText(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function sendText(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(msg);
}

// ─── Symbol lists (Nifty 50 / 100 / 500 / all NSE) ────────────────────────
async function handleSymbols(res, reqUrl) {
  const index = (reqUrl.searchParams.get('index') || 'nifty50').toLowerCase();
  try {
    const list = await symbols.getList(index);
    sendJSON(res, 200, { index, count: list.length, symbols: list });
  } catch (e) {
    sendJSON(res, 502, { error: e.message || 'Could not load symbol list' });
  }
}

// ─── Live-ish quotes (overlay fresher prices on the EOD series) ────────────
// ─── Kite bridge ───────────────────────────────────────────────────────────
// When Claude is logged into your Kite (the chat connector), it drops real-time
// quotes into .cache/kite-raw.json (raw Kite get_ltp/get_quotes shape). We read
// them here so the app shows EXACT Kite prices without its own Connect app.
// Fresh only while Claude keeps refreshing the file; falls back otherwise.
const KITE_RAW_FILE = path.join(CACHE_DIR, 'kite-raw.json');
const BRIDGE_FRESH_MS = 5 * 60 * 1000;
function readKiteBridge() {
  try {
    const st = fs.statSync(KITE_RAW_FILE);
    if (Date.now() - st.mtimeMs > BRIDGE_FRESH_MS) return null; // stale
    const raw = JSON.parse(fs.readFileSync(KITE_RAW_FILE, 'utf8'));
    const map = {};
    for (const [k, v] of Object.entries(raw)) {
      const price = (v && typeof v === 'object') ? v.last_price : v;
      if (price != null) map[k.replace(/^NSE:/i, '').toUpperCase()] = price;
    }
    return { map, ts: st.mtimeMs };
  } catch (_) { return null; }
}
const norm = s => s.replace(/\.NS$/i, '').toUpperCase();

async function handleQuotes(res, reqUrl) {
  const raw = (reqUrl.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!raw.length) return sendJSON(res, 400, { error: 'No symbols given' });
  const list = raw.slice(0, 500);
  const out = {};

  // 1) Kite bridge (real-time, from the chat connector) — first choice.
  const bridge = readKiteBridge();
  let bridgeHits = 0;
  if (bridge) for (const s of list) { const sym = norm(s); if (bridge.map[sym] != null) { out[sym] = bridge.map[sym]; bridgeHits++; } }

  // 2) App's own Kite Connect for anything the bridge missed.
  let misses = list.filter(s => out[norm(s)] == null);
  if (misses.length && kite.isConfigured() && kite.hasValidSession()) {
    try { Object.assign(out, await kite.getLtp(misses)); } catch (_) {}
    misses = list.filter(s => out[norm(s)] == null);
  }

  // 3) Google (~15 min delayed) for whatever remains.
  if (misses.length) {
    try { Object.assign(out, await livequote.getQuotes(misses.slice(0, 300), 10)); } catch (_) {}
  }

  const source = bridgeHits ? 'kite-live'
    : (kite.isConfigured() && kite.hasValidSession()) ? 'kite' : 'google-delayed';
  sendJSON(res, 200, { quotes: out, source, asOf: bridge ? bridge.ts : Date.now(), bridgeHits });
}

// ─── Live NSE F&O lot sizes ───────────────────────────────────────────────
async function handleLots(res) {
  try {
    const map = await lots.getLots();
    sendJSON(res, 200, { lots: map, count: Object.keys(map).length, asOf: Date.now() });
  } catch (e) {
    sendJSON(res, 502, { error: e.message || 'Could not load lot sizes' });
  }
}

// ─── Market Mood Index (MMI) ────────────────────────────────────────────────
async function handleMmi(res) {
  try {
    const r = await httpsGet('https://api.tickertape.in/mmi/now', {
      'User-Agent': UA,
      'Accept': 'application/json'
    }, 5000);
    if (r.status !== 200) throw new Error(`Tickertape returned ${r.status}`);
    const data = JSON.parse(r.body);
    if (!data.success) throw new Error('MMI API returned success: false');
    
    // Calculate mood string based on Tickertape's typical ranges
    // 0-30: Extreme Fear, 30-50: Fear, 50-70: Greed, 70-100: Extreme Greed
    const val = data.data.currentValue;
    let mood = 'Neutral';
    if (val < 30) mood = 'Extreme Fear';
    else if (val < 50) mood = 'Fear';
    else if (val < 70) mood = 'Greed';
    else mood = 'Extreme Greed';

    sendJSON(res, 200, { value: Math.round(val), mood, asOf: Date.now() });
  } catch (e) {
    sendJSON(res, 502, { error: e.message || 'Could not fetch MMI' });
  }
}

// ─── Kite auth routes ─────────────────────────────────────────────────────
async function handleKiteCallback(res, reqUrl) {
  const requestToken = reqUrl.searchParams.get('request_token');
  const okPage = (title, msg) => `<!DOCTYPE html><meta charset="utf-8">
    <body style="font-family:sans-serif;background:#0f1117;color:#e8eaf0;padding:40px">
    <h2>${title}</h2><p>${msg}</p>
    <p><a href="/" style="color:#4f7cff">← Back to the screener</a></p>
    <script>setTimeout(()=>location.href='/',2500)</script></body>`;
  if (!requestToken) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(okPage('Kite login failed', 'No request_token in the callback.'));
  }
  try {
    const d = await kite.exchangeToken(requestToken);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(okPage('Kite connected ✓', `Logged in as ${d.user_name || d.user_id}. Redirecting…`));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(okPage('Kite login failed', e.message));
  }
}

// ─── Router ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const p = reqUrl.pathname;

  if (p === '/api/chart') return handleChart(res, reqUrl);
  if (p === '/api/symbols') return handleSymbols(res, reqUrl);
  if (p === '/api/quotes') return handleQuotes(res, reqUrl);
  if (p === '/api/lots') return handleLots(res);
  if (p === '/api/mmi') return handleMmi(res);
  if (p === '/kite/status') return sendJSON(res, 200, kite.status());
  if (p === '/kite/login') {
    if (!kite.isConfigured()) return sendJSON(res, 400, { error: 'Kite not configured' });
    res.writeHead(302, { Location: kite.loginUrl() });
    return res.end();
  }
  if (p === '/kite/callback') return handleKiteCallback(res, reqUrl);

  serveStatic(res, p);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ⚠  Port ${PORT} is already in use — the app is probably already running.`);
    console.error(`     Open it at:  http://localhost:${PORT}`);
    console.error(`     If it's stuck, restart with:  pkill -f "node server.js" && npm start\n`);
    process.exit(0); // clean exit, no scary stack trace
  }
  console.error('Server error:', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  NSE Swing Screener running at  http://localhost:${PORT}\n`);
  console.log('  Press Ctrl+C to stop.\n');
});
