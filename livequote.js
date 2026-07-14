// ─── Live(-ish) quote overlay ─────────────────────────────────────────────
// Bhavcopy is end-of-day, so during market hours the last candle is yesterday's
// close. This module fetches a fresher last-traded price to overlay on the
// displayed price and trade levels (the historical series still drives the
// indicators, which correctly use completed daily candles).
//
// Source: Google Finance quote page (reachable where Yahoo/NSE-api are blocked).
// NOTE: Google's NSE prices are delayed ~15 minutes — fresher than EOD, but not
// tick-real-time. For true real-time, use Kite LTP (requires a connected Kite
// session). This is intentionally a best-effort, no-key overlay.
//
// Zero external dependencies — Node core only.

const https = require('https');

// A plain curl-style UA: a browser UA makes Google 302-redirect to its "beta"
// quote page which doesn't carry the data-last-price attribute we parse.
const UA = 'curl/8.4.0';

const cache = new Map(); // SYMBOL -> { price, ts }
const TTL_MS = 20 * 1000; // short cache so the 30s auto-refresh gets fresh prices

function httpsGet(urlStr, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      host: u.host, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
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

// Fetch one symbol's last price (₹). Returns a number or null.
async function getQuote(symbol) {
  let sym = symbol.replace(/\.NS$/i, '').toUpperCase();
  
  // Google Finance index mapping
  if (sym === 'NIFTY') sym = 'NIFTY_50:INDEXNSE';
  else if (sym === 'BANKNIFTY') sym = 'NIFTY_BANK:INDEXNSE';
  else if (sym === 'FINNIFTY') sym = 'NIFTY_FIN_SRV25_50:INDEXNSE';
  else if (sym === 'MIDCPNIFTY') sym = 'NIFTY_MIDCAP_100:INDEXNSE';
  else sym = sym + ':NSE';

  const hit = cache.get(sym);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.price;

  try {
    const r = await httpsGet(`https://www.google.com/finance/quote/${sym}`);
    if (r.status !== 200) return null;
    const m = r.body.match(/data-last-price="([\d.]+)"/);
    if (!m) return null;
    const price = parseFloat(m[1]);
    if (!isFinite(price)) return null;
    cache.set(sym, { price, ts: Date.now() });
    return price;
  } catch (_) {
    return null;
  }
}

// Fetch many symbols with bounded concurrency. Returns { SYMBOL: price }.
async function getQuotes(symbols, concurrency = 8) {
  const list = [...new Set(symbols.map(s => s.replace(/\.NS$/i, '').toUpperCase()))];
  const out = {};
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const sym = list[cursor++];
      const p = await getQuote(sym);
      if (p != null) out[sym] = p;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return out;
}

module.exports = { getQuote, getQuotes };
