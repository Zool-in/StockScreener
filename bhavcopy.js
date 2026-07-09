// ─── NSE Bhavcopy data source (official, free, EOD) ───────────────────────
// NSE publishes a daily "full Bhavcopy" — one CSV per trading day containing
// OHLCV for every security. We download the last ~90 trading days, cache them
// on disk (historical files never change, so they're fetched once), assemble a
// per-symbol daily series, and return it in the same Yahoo-chart shape the
// front-end already consumes.
//
// Why this is the reliable default here: nsearchives.nseindia.com serves plain
// static files and — unlike www.nseindia.com/api — is NOT IP-blocked. It's the
// same official data the commercial screeners' vendors resell.
//
// Trade-off: this is END-OF-DAY data (published ~6–7pm IST after close), which
// is exactly right for a daily/swing screener. Prices are unadjusted for
// splits/bonuses.
//
// Zero external dependencies — Node core only.

const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CACHE_DIR = path.join(ROOT, '.cache', 'bhav');
const BASE = 'https://nsearchives.nseindia.com/products/content/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TRADING_DAYS_TARGET = 250;  // ~1 trading year → genuine 200-day EMA
const MAX_CALENDAR_LOOKBACK = 420; // enough calendar days to reach ~250 sessions
const DOWNLOAD_BATCH = 12;         // parallel downloads per round

// ─── Date helpers (NSE works in IST) ──────────────────────────────────────
function istToday() {
  // A Date whose local getters reflect IST wall-clock.
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(s);
}
const p2 = n => String(n).padStart(2, '0');
function ddmmyyyy(d) { return `${p2(d.getDate())}${p2(d.getMonth() + 1)}${d.getFullYear()}`; }
function isWeekend(d) { const g = d.getDay(); return g === 0 || g === 6; }
function tsForDate(d) {
  // Midnight IST for that calendar day, as a UNIX seconds value.
  return Math.floor(Date.parse(
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T00:00:00+05:30`) / 1000);
}

// ─── HTTPS GET ────────────────────────────────────────────────────────────
function get(urlStr, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      host: u.host, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/csv,*/*' },
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

// ─── One day's CSV (disk cache first, then network) ───────────────────────
function fileFor(dateStr) { return path.join(CACHE_DIR, `sec_bhavdata_full_${dateStr}.csv`); }

async function getDayCsv(dateStr) {
  const fp = fileFor(dateStr);
  try {
    const cached = fs.readFileSync(fp, 'utf8');
    if (cached.includes('SYMBOL')) return cached;
  } catch (_) { /* not cached yet */ }

  const r = await get(`${BASE}sec_bhavdata_full_${dateStr}.csv`).catch(() => null);
  if (r && r.status === 200 && r.body.includes('SYMBOL')) {
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(fp, r.body); } catch (_) {}
    return r.body;
  }
  return null; // holiday / not published yet / error
}

// ─── Parse a day's CSV → Map(symbol → {o,h,l,c,v}) ────────────────────────
// Header: SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE,
//         LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS,
//         NO_OF_TRADES, DELIV_QTY, DELIV_PER
function parseDay(text) {
  const map = new Map();
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(',');
    if (c.length < 11) continue;
    const series = c[1].trim();
    if (series !== 'EQ') continue; // primary equity series
    const sym = c[0].trim();
    const o = parseFloat(c[4]), h = parseFloat(c[5]), l = parseFloat(c[6]);
    const cl = parseFloat(c[8]), v = parseFloat(c[10]);
    const dp = c.length > 14 ? parseFloat(c[14]) : NaN; // DELIV_PER (delivery %)
    if (!isFinite(cl)) continue;
    map.set(sym, { o, h, l, c: cl, v, dp: isFinite(dp) ? dp : null });
  }
  return map;
}

// ─── Assemble the last N trading days into an in-memory index ─────────────
// Memoized per IST day so a 10-symbol scan builds it once, not ten times.
let indexPromise = null;
let indexDay = null;

async function buildIndex() {
  // Candidate trading days: walk back from today, skipping weekends.
  const candidates = [];
  const cursor = istToday();
  for (let i = 0; i < MAX_CALENDAR_LOOKBACK && candidates.length < TRADING_DAYS_TARGET + 20; i++) {
    if (!isWeekend(cursor)) candidates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }

  // Download/parse in parallel batches (cached files resolve instantly).
  const days = []; // { date, ts, map }
  for (let i = 0; i < candidates.length; i += DOWNLOAD_BATCH) {
    const batch = candidates.slice(i, i + DOWNLOAD_BATCH);
    const results = await Promise.all(batch.map(async d => {
      const csv = await getDayCsv(ddmmyyyy(d));
      return csv ? { date: d, ts: tsForDate(d), map: parseDay(csv) } : null;
    }));
    for (const r of results) if (r && r.map.size) days.push(r);
    if (days.length >= TRADING_DAYS_TARGET) break; // enough history
  }

  days.sort((a, b) => a.ts - b.ts); // oldest → newest
  return days.slice(-TRADING_DAYS_TARGET);
}

async function ensureIndex() {
  const today = ddmmyyyy(istToday());
  if (indexPromise && indexDay === today) return indexPromise;
  indexDay = today;
  indexPromise = buildIndex().catch(err => { indexPromise = null; throw err; });
  return indexPromise;
}

// ─── Public: fetch a symbol's chart in Yahoo shape ────────────────────────
async function fetchChart(symbol, interval, range) {
  const tradingsymbol = symbol.replace(/\.NS$/i, '').toUpperCase();
  const days = await ensureIndex();
  if (!days.length) throw new Error('NSE Bhavcopy unavailable (no trading days fetched)');

  const timestamp = [], open = [], high = [], low = [], close = [], volume = [], delivPer = [];
  for (const d of days) {
    const row = d.map.get(tradingsymbol);
    if (!row) continue;
    timestamp.push(d.ts);
    open.push(row.o); high.push(row.h); low.push(row.l); close.push(row.c); volume.push(row.v);
    delivPer.push(row.dp);
  }
  if (close.length < 2) throw new Error(`Symbol ${tradingsymbol} not found in NSE Bhavcopy`);

  // Delivery %: latest day + 20-day average (BTST conviction signal).
  const dpVals = delivPer.filter(x => x != null);
  const latestDp = delivPer[delivPer.length - 1];
  const dpRecent = delivPer.slice(-21, -1).filter(x => x != null);
  const dpAvg = dpRecent.length ? dpRecent.reduce((a, b) => a + b, 0) / dpRecent.length : null;

  const payload = {
    chart: {
      result: [{
        meta: {
          currency: 'INR', symbol: `${tradingsymbol}.NS`, exchangeName: 'NSI',
          instrumentType: 'EQUITY', regularMarketPrice: close[close.length - 1],
          longName: tradingsymbol, shortName: tradingsymbol,
          dataGranularity: '1d', range,
          delivPer: latestDp != null ? +latestDp.toFixed(1) : null,
          delivPerAvg20: dpAvg != null ? +dpAvg.toFixed(1) : null,
        },
        timestamp,
        indicators: { quote: [{ open, high, low, close, volume, delivPer }] },
      }],
      error: null,
    },
  };
  return JSON.stringify(payload);
}

// All EQ symbols traded on the most recent day we have.
async function listSymbols() {
  const days = await ensureIndex();
  if (!days.length) return [];
  return [...days[days.length - 1].map.keys()].sort();
}

// Lightweight readiness probe (does not force a full build).
function status() {
  return { source: 'nse-bhavcopy', cacheDir: CACHE_DIR };
}

module.exports = { fetchChart, listSymbols, status };
