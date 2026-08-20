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

// ─── Global Error Handlers ───────────────────────────────────────────────────
process.on('uncaughtException', err => {
  console.error('[Server Uncaught Exception]:', err.message || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server Unhandled Rejection]:', reason);
});

// ─── Load .env (Zero dependency) ──────────────────────────────────────────
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
} catch (_) {}


const fyers = require('./fyers');
const bhavcopy = require('./bhavcopy');
const symbols = require('./symbols');
const livequote = require('./livequote');
const lots = require('./lots');
const db = require('./db');
const alertsStore = require('./alerts_store');
alertsStore.initDb();

function isNSEMarketHours() {
  const options = { timeZone: 'Asia/Kolkata', hour12: false };
  const d = new Date();
  const weekdayStr = d.toLocaleDateString('en-US', { ...options, weekday: 'short' });
  const timeStr = d.toLocaleTimeString('en-US', { ...options, hour: '2-digit', minute: '2-digit' });
  
  if (weekdayStr === 'Sat' || weekdayStr === 'Sun') return false;
  
  const [hrs, mins] = timeStr.split(':').map(Number);
  const timeVal = hrs * 100 + mins;
  return timeVal >= 915 && timeVal <= 1530;
}

const PORT = 5174;
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
function httpsGet(urlStr, headers = {}, timeoutMs = 25000) {
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

  if (!symbol || !/^[A-Za-z0-9.\-&:^]+$/.test(symbol)) {
    return sendJSON(res, 400, { error: 'Invalid or missing symbol' });
  }

  // Check if NSE market is currently active
  const isMarketOpen = isNSEMarketHours();

  // OFF-MARKET FAST LOCK: If market is closed and we have a fresh cached copy (less than 12 hours old), serve it immediately
  if (!isMarketOpen) {
    const age = cacheAge(symbol, interval, range);
    if (age < 12 * 60 * 60 * 1000) {
      const offMarketCache = readCache(symbol, interval, range);
      if (offMarketCache) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Data-Source': 'cache-offmarket-lock',
        });
        return res.end(offMarketCache);
      }
    }
  }

  // 0) PRIMARY HIGH-FIDELITY SOURCES: Fyers or Kite
  let firstErr = '';
  
  if (fyers.isConfigured() && fyers.hasValidSession()) {
    try {
      const fbody = await fyers.fetchChart(symbol, interval, range);
      writeCache(symbol, interval, range, fbody);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Data-Source': 'fyers',
      });
      return res.end(fbody);
    } catch (e) {
      firstErr = `fyers: ${e.message}`;
    }
  }

  // 1) PRIMARY (default) source: NSE official Bhavcopy
  if (interval === '1d') {
    try {
      const bbody = await bhavcopy.fetchChart(symbol, interval, range);
      writeCache(symbol, interval, range, bbody);
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

  // Prevent serving sensitive files (configs, dotfiles, cache)
  const filename = path.basename(filePath);
  if (filename.startsWith('.') || filename.endsWith('-config.json') || rel.startsWith('/.cache') || filename === 'server.js') {
    return sendText(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream'
    };
    
    // Disable caching for code/data files to ensure live updates are loaded immediately
    if (['.html', '.js', '.css', '.json'].includes(ext)) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    
    res.writeHead(200, headers);
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

const norm = s => s.replace(/\.NS$/i, '').toUpperCase();

async function handleQuotes(res, reqUrl) {
  const raw = (reqUrl.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!raw.length) return sendJSON(res, 400, { error: 'No symbols given' });
  const list = raw.slice(0, 500);
  const out = {};

  let misses = list.slice();

  // 3) Fyers for anything else
  if (misses.length && fyers.isConfigured() && fyers.hasValidSession()) {
      try { Object.assign(out, await fyers.getLtp(misses)); } catch (_) {}
      misses = list.filter(s => out[norm(s)] == null);
  }

  // 4) Google (~15 min delayed) for whatever remains, but bounded by a strict 4-second timeout
  if (misses.length) {
    try {
      const getGq = livequote.getQuotes(misses.slice(0, 300), 10);
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Google fallback timeout')), 4000));
      const res = await Promise.race([getGq, timeout]);
      Object.assign(out, res);
    } catch (e) {
      console.error('Google fallback error/timeout:', e.message);
    }
  }

  const source = (fyers.isConfigured() && fyers.hasValidSession()) ? 'fyers' : 'google-delayed';
  sendJSON(res, 200, { quotes: out, source, asOf: Date.now() });
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
// Reports the public IP this server calls external APIs FROM — this is the IP
// to whitelist in FYERS/Kite (they check the caller's outbound IP).
async function handleWhoami(res) {
  try {
    const r = await httpsGet('https://api.ipify.org?format=json', { 'User-Agent': UA }, 8000);
    const ip = JSON.parse(r.body).ip;
    sendJSON(res, 200, { egressIp: ip, note: 'Whitelist this IP in FYERS (it is the IP the app calls broker APIs from).' });
  } catch (e) {
    sendJSON(res, 502, { error: e.message || 'Could not determine egress IP' });
  }
}

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

// ─── Stock DNA Library ───────────────────────────────────────────────────────
async function handleDna(res, reqUrl) {
  const symbol = reqUrl.searchParams.get('symbol');
  const dnaPath = path.join(__dirname, 'js', 'data', 'stock_dna.json');
  
  try {
    if (!fs.existsSync(dnaPath)) {
      return sendJSON(res, 404, { error: 'Stock DNA database not found. Please run the generation script.' });
    }
    
    const raw = fs.readFileSync(dnaPath, 'utf8');
    const db = JSON.parse(raw);
    
    if (symbol) {
      const upperSym = symbol.toUpperCase().replace(/\.NS$/i, '');
      if (db[upperSym]) {
        return sendJSON(res, 200, { success: true, data: db[upperSym] });
      } else {
        return sendJSON(res, 404, { error: `Stock DNA not found for symbol: ${upperSym}` });
      }
    }
    
    // Return list of available symbols and their basic personalities
    const summary = Object.keys(db).map(k => ({
      symbol: k,
      companyName: db[k].companyName,
      sector: db[k].sector,
      personality: db[k].personality,
      ratings: {
        trendStrength: db[k].ratings.trendStrength,
        volatility: db[k].ratings.volatility,
        pullbackReliability: db[k].ratings.pullbackReliability,
        swingQuality: db[k].ratings.swingQuality,
        optionsLiquidity: db[k].ratings.optionsLiquidity
      },
      srt: db[k].srt,
      indices: db[k].indices || []
    }));
    
    return sendJSON(res, 200, { success: true, count: summary.length, data: summary });
  } catch (e) {
    return sendJSON(res, 500, { error: e.message });
  }
}

async function handleDnaGenerate(res) {
  const { exec } = require('child_process');
  console.log('[DNA] Received asynchronous request to regenerate DNA Library.');
  
  // Kick off generation asynchronously
  const scriptPath = path.join(__dirname, 'scripts', 'generate_fundamentals.js');
  const analyzePath = path.join(__dirname, 'scripts', 'analyze_dna.js');
  
  exec(`node "${scriptPath}" && node "${analyzePath}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('[DNA Generation Error]:', err.message);
      return;
    }
    console.log('[DNA Generation Output]:', stdout);
    if (stderr) console.error('[DNA Generation Stderr]:', stderr);
  });
  
  return sendJSON(res, 202, { success: true, message: 'DNA Library generation started in background. Refresh in a few minutes.' });
}

async function handleDnaNews(res, reqUrl) {
  const symbol = reqUrl.searchParams.get('symbol');
  if (!symbol) return sendJSON(res, 400, { error: 'Symbol parameter is required' });

  const cleanSym = symbol.toUpperCase().replace(/\.NS$/i, '');
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanSym)}+stock&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const r = await httpsGet(rssUrl, { 'User-Agent': UA }, 8000);
    if (r.status !== 200) {
      throw new Error(`Yahoo returned status ${r.status}`);
    }

    const items = [];
    const matches = r.body.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of matches) {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
      const source = item.match(/<source>([\s\S]*?)<\/source>/)?.[1] || '';
      
      const cleanText = (str) => {
        return str
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .trim();
      };

      if (title) {
        items.push({
          title: cleanText(title),
          link: cleanText(link),
          pubDate: cleanText(pubDate),
          source: cleanText(source) || 'Yahoo Finance'
        });
      }
    }

    return sendJSON(res, 200, { success: true, count: items.length, data: items });
  } catch (e) {
    return sendJSON(res, 500, { error: e.message || 'Failed to fetch news feed' });
  }
}


async function handleFyersCallback(res, reqUrl) {
  const code = reqUrl.searchParams.get('auth_code');
  const okPage = (title, msg) => `<!DOCTYPE html><meta charset="utf-8">
    <body style="font-family:sans-serif;background:#0f1117;color:#e8eaf0;padding:40px">
    <h2>${title}</h2><p>${msg}</p>
    <p><a href="/" style="color:#4f7cff">← Back to the screener</a></p>
    <script>setTimeout(()=>location.href='/',2500)</script></body>`;
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(okPage('Fyers login failed', 'No auth_code in the callback.'));
  }
  try {
    const d = await fyers.exchangeToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(okPage('Fyers connected ✓', `Logged in successfully. Redirecting…`));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(okPage('Fyers login failed', e.message));
  }
}

function parseCloses(body) {
  try {
    const data = JSON.parse(body);
    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const closes = [];
    for (let i = 0; i < quote.close.length; i++) {
      if (quote.close[i] !== null && quote.high[i] !== null && quote.low[i] !== null && quote.open[i] !== null) {
        closes.push(quote.close[i]);
      }
    }
    return closes;
  } catch (e) {
    return null;
  }
}

async function fetchClosesInternal(symbol, interval, range) {
  const cached = readCache(symbol, interval, range);
  if (cached) {
    const c = parseCloses(cached);
    if (c && c.length > 0) return c;
  }

  if (fyers.isConfigured() && fyers.hasValidSession()) {
    try {
      const fbody = await fyers.fetchChart(symbol, interval, range);
      writeCache(symbol, interval, range, fbody);
      const c = parseCloses(fbody);
      if (c && c.length > 0) return c;
    } catch (e) {}
  }

  if (interval === '1d' && !symbol.includes('INDEX') && !symbol.startsWith('^')) {
    try {
      const bbody = await bhavcopy.fetchChart(symbol, interval, range);
      writeCache(symbol, interval, range, bbody);
      const c = parseCloses(bbody);
      if (c && c.length > 0) return c;
    } catch (e) {}
  }

  let body = null;
  try {
    body = await fetchDirect(symbol, interval, range);
  } catch (e) {
    try {
      body = await fetchViaProxy(symbol, interval, range);
    } catch (e2) {}
  }

  if (body && body.includes('"chart"')) {
    writeCache(symbol, interval, range, body);
    return parseCloses(body);
  }
  return null;
}

async function handleIndicesSrt(res) {
  try {
    const niftyCloses = await fetchClosesInternal('^NSEI', '1d', '2y');
    const bnfCloses = await fetchClosesInternal('^NSEBANK', '1d', '2y');

    const calcSRT = (closes) => {
      if (!closes || closes.length < 124) return null;
      const n = closes.length;
      const curr = closes[n - 1];
      const sum124 = closes.slice(-124).reduce((a, b) => a + b, 0);
      const sma124 = sum124 / 124;
      const value = parseFloat((curr / sma124).toFixed(3));
      let zone = 'Neutral Zone';
      if (value < 0.9) zone = 'Buying Zone';
      else if (value <= 1.3) zone = 'Neutral Zone';
      else zone = 'Selling Zone';
      return { value, zone, curr, sma124 };
    };

    return sendJSON(res, 200, {
      success: true,
      nifty: calcSRT(niftyCloses),
      banknifty: calcSRT(bnfCloses)
    });
  } catch (e) {
    return sendJSON(res, 500, { error: e.message });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const p = reqUrl.pathname;
  console.log(`[HTTP] ${req.method} ${req.url}`);

  // Set GIGW, GDPR, and OWASP compliance security headers
  res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:;");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  if (p === '/api/chart') return handleChart(res, reqUrl);
  if (p === '/api/symbols') return handleSymbols(res, reqUrl);
  if (p === '/api/quotes') return handleQuotes(res, reqUrl);
  if (p === '/api/lots') return handleLots(res);
  if (p === '/api/mmi') return handleMmi(res);
  if (p === '/api/whoami') return handleWhoami(res);
  if (p === '/api/options/chain') return handleOptionsChain(res, reqUrl);
  if (p === '/api/dna') return handleDna(res, reqUrl);
  if (p === '/api/dna/generate') return handleDnaGenerate(res);
  if (p === '/api/dna/news') return handleDnaNews(res, reqUrl);
  if (p === '/api/indices/srt') return handleIndicesSrt(res);

  // ─── Local Alerts Endpoints ─────────────────────────────────────────────
  if (p === '/api/alerts' && req.method === 'GET') {
    try {
      const limit = parseInt(reqUrl.searchParams.get('limit')) || 100;
      const strategyId = reqUrl.searchParams.get('strategy') || 'all';
      const data = alertsStore.getAlerts(limit, strategyId);
      return sendJSON(res, 200, { success: true, ...data });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  if (p === '/api/alerts/read' && req.method === 'POST') {
    try {
      alertsStore.markAlertsAsRead();
      return sendJSON(res, 200, { success: true });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  if (p === '/api/alerts/clear' && req.method === 'POST') {
    try {
      alertsStore.clearAlerts();
      return sendJSON(res, 200, { success: true });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  if (p === '/api/alerts/trigger' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const insertedId = alertsStore.insertAlert(payload);
        return sendJSON(res, 200, { success: true, insertedId });
      } catch (e) {
        return sendJSON(res, 500, { error: e.message });
      }
    });
    return;
  }

  if (p === '/fyers/status') {
    const s = fyers.status();
    s.debugEnv = Object.keys(process.env).filter(k => k.includes('FYERS'));
    
    // Add a live test fetch to diagnose why getLtp is failing
    if (s.connected) {
      try {
        const url = 'https://api-t1.fyers.in/data/quotes?symbols=NSE:RELIANCE-EQ';
        const session = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fyers.session.json')));
        const auth = `${process.env.FYERS_APP_ID}:${session.access_token}`;
        
        // Use promise chain since this is a synchronous request listener
        fetch(url, { headers: { 'Authorization': auth } })
          .then(r => r.text())
          .then(raw => {
            s.debugQuoteRaw = raw;
            sendJSON(res, 200, s);
          })
          .catch(e => {
            s.debugQuoteError = e.message;
            sendJSON(res, 200, s);
          });
        return; // wait for fetch to complete before sending response
      } catch (e) {
        s.debugQuoteError = e.message;
      }
    }
    
    return sendJSON(res, 200, s);
  }

  if (p === '/api/db/screener') {
    try {
      const strategyId = reqUrl.searchParams.get('strategy') || 'all';
      if (!db.isAvailable()) {
        return sendJSON(res, 503, { error: 'Database not available', rows: [] });
      }
      const rows = await db.queryStrategy(strategyId);
      return sendJSON(res, 200, { success: true, count: rows.length, rows });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  if (p === '/fyers/login') {
    if (!fyers.isConfigured()) return sendJSON(res, 400, { error: 'Fyers not configured' });
    res.writeHead(302, { Location: fyers.loginUrl() });
    return res.end();
  }
  if (p === '/fyers/callback') return handleFyersCallback(res, reqUrl);

  serveStatic(res, p);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ⚠  Port ${PORT} is already in use — the app is probably already running.`);
    console.error(`     Open it at:  http://localhost:${PORT}`);
    console.error(`     If it's stuck, restart with:  pkill -f "node (index|server).js" && npm start\n`);
    process.exit(0); // clean exit, no scary stack trace
  }
  console.error('Server error:', err.message);
  process.exit(1);
});

// ─── Background Strategy Alert Scanner ─────────────────────────────────────
function startBackgroundAlertScanner() {
  console.log('[Alert Scanner] Local background strategy alert engine activated ✓');
  const scanIntervalMs = 3 * 60 * 1000; // 3 minutes
  
  const alertScannerLoop = async () => {
    try {
      const isMarketHours = isNSEMarketHours();
      if (!isMarketHours) {
        console.log('[Alert Scanner] Outside market hours — running EOD alert check...');
      } else {
        console.log('[Alert Scanner] Market session active — scanning top stocks for triggers...');
      }

      // 1. Load DNA profiles to get historical context (like SMA124)
      let dnaData = {};
      try {
        const dnaPath = path.join(__dirname, 'js', 'data', 'stock_dna.json');
        if (fs.existsSync(dnaPath)) {
          const content = fs.readFileSync(dnaPath, 'utf8');
          dnaData = JSON.parse(content);
        } else {
          console.warn('[Alert Scanner] stock_dna.json database not found. Skipping scan.');
          return;
        }
      } catch (err) {
        console.error('[Alert Scanner] Error loading stock_dna.json:', err.message);
        return;
      }

      const symbols = Object.keys(dnaData);
      if (symbols.length === 0) return;

      console.log(`[Alert Scanner] Step 1: Fetching live prices for all ${symbols.length} symbols via Google Finance...`);
      let allLiveLtps = {};
      try {
        allLiveLtps = await livequote.getQuotes(symbols, 10);
      } catch (err) {
        console.error('[Alert Scanner] Google Finance quote fetch failed:', err.message);
      }

      console.log(`[Alert Scanner] Step 2: Fetching full quote details for top active symbols via Yahoo proxy...`);
      const topActiveSymbols = [
        'RELIANCE', 'TCS', 'INFY', 'SBIN', 'HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK', 
        'TATAMOTORS', 'BHARTIARTL', 'HAL', 'MCX', 'LT', 'ITC', 'COALINDIA', 'ONGC', 'NTPC', 
        'SUNPHARMA', 'TRENT', 'TATAPOWER', 'MARUTI', 'JSWSTEEL', 'LTIM', 'ADANIENT', 'JIOFIN'
      ];
      
      const yahooQuotes = [];
      const fetchQuotesViaProxy = async (batchSymbols) => {
        const urlSymbols = batchSymbols.map(s => `${s}.NS`).join(',');
        const yf = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${urlSymbols}`;
        const urls = [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(yf)}`,
          `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(yf)}`
        ];

        let lastErr = 'unknown';
        for (const u of urls) {
          try {
            const r = await httpsGet(u, { 'User-Agent': 'curl/8.4.0' }, 5000);
            if (r.status === 200) {
              let parsedData = null;
              try {
                const outer = JSON.parse(r.body);
                if (outer.contents) {
                  parsedData = JSON.parse(outer.contents);
                } else {
                  parsedData = outer;
                }
              } catch (_) {
                try { parsedData = JSON.parse(r.body); } catch (_) {}
              }

              if (parsedData && parsedData.quoteResponse && parsedData.quoteResponse.result) {
                return parsedData.quoteResponse.result;
              }
            }
            lastErr = `status ${r.status}`;
          } catch (e) {
            lastErr = e.message;
          }
        }
        return [];
      };

      const batch1 = topActiveSymbols.slice(0, 13);
      const batch2 = topActiveSymbols.slice(13);
      
      const q1 = await fetchQuotesViaProxy(batch1);
      await new Promise(r => setTimeout(r, 1200));
      const q2 = await fetchQuotesViaProxy(batch2);
      yahooQuotes.push(...q1, ...q2);

      console.log(`[Alert Scanner] Fetched ${yahooQuotes.length} full quotes from Yahoo. Evaluating strategies...`);

      // 3. Evaluate strategies
      for (const ticker of symbols) {
        const price = allLiveLtps[ticker];
        if (!price) continue;
        
        const dna = dnaData[ticker];
        if (!dna) continue;

        // Strategy A: SRT Buying Zone
        const sma124 = dna.srt ? dna.srt.sma124 : null;
        if (sma124 && sma124 > 0 && price / sma124 <= 0.90) {
          const srtVal = (price / sma124).toFixed(3);
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'srt_buying_zone',
            timeframe: '1d',
            price: parseFloat(price.toFixed(2)),
            reason: `🟢 SRT Buying Zone: ${ticker} is trading at ₹${price.toFixed(2)}, which is below its 124-day SMA (₹${sma124}) with an undervalued SRT score of ${srtVal}.`
          });
        }

        // Strategy G: Minervini VCP
        if (dna.cmp && dna.cmp > 0) {
          const chgPct = ((price - dna.cmp) / dna.cmp) * 100;
          if (dna.ratings && dna.ratings.trendStrength >= 8 && chgPct > 2.0 && dna.personality.character === 'Breakout Machine') {
            alertsStore.insertAlert({
              ticker,
              strategy_id: 'minervini',
              timeframe: '1d',
              price: parseFloat(price.toFixed(2)),
              reason: `📈 Minervini VCP Trend: High momentum constituent ${ticker} is showing VCP breakout characteristics, up +${chgPct.toFixed(2)}% at ₹${price.toFixed(2)}.`
            });
          }
        }
      }

      for (const quote of yahooQuotes) {
        if (!quote.symbol) continue;
        const ticker = quote.symbol.replace('.NS', '');
        const dna = dnaData[ticker];
        if (!dna) continue;

        const price = quote.regularMarketPrice;
        const open = quote.regularMarketOpen;
        const high = quote.regularMarketDayHigh;
        const low = quote.regularMarketDayLow;
        const prevClose = quote.regularMarketPreviousClose;
        const volume = quote.regularMarketVolume;

        if (!price || !open || !high || !low || !prevClose) continue;

        const body = Math.abs(price - open);
        const range = high - low;
        const bodyPct = open > 0 ? (body / open) * 100 : 0;
        const chgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

        // Strategy B: Open = Low (ohl_bullish)
        if (Math.abs(open - low) / open < 0.0005 && chgPct >= 1.2) {
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'ohl_bullish',
            timeframe: '15m',
            price: parseFloat(price.toFixed(2)),
            reason: `⚡ Open=Low (Bullish): ${ticker} opened at ₹${open.toFixed(2)} and made a low of ₹${low.toFixed(2)}. Momentum driving price up +${chgPct.toFixed(2)}% at ₹${price.toFixed(2)}.`
          });
        }

        // Strategy C: Open = High (ohl_bearish)
        if (Math.abs(open - high) / open < 0.0005 && chgPct <= -1.2) {
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'ohl_bearish',
            timeframe: '15m',
            price: parseFloat(price.toFixed(2)),
            reason: `🚨 Open=High (Bearish): ${ticker} opened at ₹${open.toFixed(2)} and made a high of ₹${high.toFixed(2)}. Heavy selling pressure pushing price down ${chgPct.toFixed(2)}% at ₹${price.toFixed(2)}.`
          });
        }

        // Strategy D: Oliver Velez Elephant Bullish (elephant_bullish)
        const isGreen = price > open;
        const closeNearHigh = range > 0 ? (high - price) / range < 0.15 : false;
        if (isGreen && bodyPct >= 3.0 && closeNearHigh) {
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'elephant_bullish',
            timeframe: '15m',
            price: parseFloat(price.toFixed(2)),
            reason: `🐘 Oliver Velez Elephant Bullish: ${ticker} has printed a giant green candle (+${bodyPct.toFixed(2)}% body) closing near the absolute high of the day at ₹${price.toFixed(2)}.`
          });
        }

        // Strategy E: Oliver Velez Elephant Bearish (elephant_bearish)
        const isRed = price < open;
        const closeNearLow = range > 0 ? (price - low) / range < 0.15 : false;
        if (isRed && bodyPct >= 3.0 && closeNearLow) {
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'elephant_bearish',
            timeframe: '15m',
            price: parseFloat(price.toFixed(2)),
            reason: `🐘 Oliver Velez Elephant Bearish: ${ticker} has printed a giant red candle (-${bodyPct.toFixed(2)}% body) closing near the absolute low of the day at ₹${price.toFixed(2)}.`
          });
        }

        // Strategy F: Gap Expansion Momentum (gap_momentum)
        if (open > prevClose * 1.015 && price > open) {
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'gap_momentum',
            timeframe: '15m',
            price: parseFloat(price.toFixed(2)),
            reason: `🚀 Gap Momentum: ${ticker} opened with a gap-up of +${(((open - prevClose)/prevClose)*100).toFixed(2)}% and continues to trade higher at ₹${price.toFixed(2)}.`
          });
        }

        // Strategy H: SMC Sweep Bullish (smc_bullish)
        if (low < open * 0.985 && price > open && chgPct > 0.5) {
          alertsStore.insertAlert({
            ticker,
            strategy_id: 'smc_bullish',
            timeframe: '15m',
            price: parseFloat(price.toFixed(2)),
            reason: `🛡️ SMC Sweep (Bullish): ${ticker} swept low liquidity below ₹${(open * 0.985).toFixed(2)} and reversed back strongly to trade at ₹${price.toFixed(2)}.`
          });
        }
      }

      console.log('[Alert Scanner] Strategy check completed successfully.');
    } catch (e) {
      console.error('[Alert Scanner Error]:', e.message);
    }
  };

  // Run once immediately on start
  setTimeout(alertScannerLoop, 5000);
  // Then run every 3 minutes
  setInterval(alertScannerLoop, scanIntervalMs);
}


server.listen(PORT, () => {
  console.log(`\n  NSE Swing Screener running on ${PORT}\n`);
  console.log('  Press Ctrl+C to stop.\n');
  db.initDb().catch(err => console.error('[MySQL] Non-critical init error:', err.message));
  startBackgroundAlertScanner();
});

// ─── API: Options Chain ──────────────────────────────────────────────────────────
async function handleOptionsChain(res, reqUrl) {
  try {
    const symbol = reqUrl.searchParams.get('symbol');
    const strikecount = reqUrl.searchParams.get('strikecount') || 30;
    if (!symbol) return res.writeHead(400).end('Missing symbol');

    if (!fyers.isConfigured()) {
      return res.writeHead(503).end(JSON.stringify({ error: 'FYERS not configured' }));
    }
    
    // Fallback if not connected: try public Yahoo (though options chain is harder via Yahoo, Fyers is primary)
    if (!fyers.hasValidSession()) {
      return res.writeHead(401).end(JSON.stringify({ error: 'FYERS not connected' }));
    }

    const data = await fyers.fetchOptionChain(symbol, strikecount, reqUrl.searchParams.get('expiry'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('Options Chain error:', err.message);
    res.writeHead(500).end(err.message);
  }
}
