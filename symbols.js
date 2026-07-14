// ─── NSE symbol lists (index constituents + full universe) ────────────────
// Serves the ticker lists behind the "Load Nifty 50 / 500 / All NSE" buttons.
// Index constituents come from NSE's published CSVs on nsearchives (reachable
// where the /api endpoints are blocked); "all" comes from the latest Bhavcopy.
//
// Zero external dependencies — Node core only.

const https = require('https');
const fs = require('fs');
const path = require('path');
const bhavcopy = require('./bhavcopy');

const CACHE_DIR = path.join(__dirname, '.cache', 'indices');
const BASE = 'https://nsearchives.nseindia.com/content/indices/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Friendly key → NSE constituent CSV basename.
const INDEX_FILES = {
  nifty50: 'ind_nifty50list',
  nifty100: 'ind_nifty100list',
  nifty200: 'ind_nifty200list',
  nifty500: 'ind_nifty500list',
  niftytotal: 'ind_niftytotalmarket_list',
};

// Curated liquid NSE ETFs (all trade in the EQ series, so Bhavcopy covers them).
const ETF_LIST = [
  'NIFTYBEES', 'BANKBEES', 'JUNIORBEES', 'GOLDBEES', 'SILVERBEES', 'ITBEES',
  'CPSEETF', 'SETFNIF50', 'MON100', 'SETFGOLD', 'PSUBNKBEES', 'PHARMABEES',
  'ICICIB22', 'MAFANG', 'HNGSNGBEES', 'AUTOBEES', 'CONSUMBEES', 'INFRABEES',
  'DIVOPPBEES', 'MOM100', 'NV20', 'HDFCSML250', 'MASPTOP50', 'GOLDCASE',
  'HDFCGOLD', 'MOSMALL250', 'MOREALTY',
];

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

function istDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Fetch (and day-cache) an index constituent CSV, return its Symbol column.
async function fetchIndex(key) {
  const base = INDEX_FILES[key];
  const fp = path.join(CACHE_DIR, `${base}.csv`);
  let csv = null;
  try {
    const stat = fs.statSync(fp);
    const fresh = new Date(stat.mtimeMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === istDay();
    if (fresh) csv = fs.readFileSync(fp, 'utf8');
  } catch (_) {}

  if (!csv) {
    const r = await get(`${BASE}${base}.csv`);
    if (r.status !== 200 || !/Symbol/i.test(r.body)) {
      throw new Error(`Could not load ${key} list (${r.status})`);
    }
    csv = r.body;
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(fp, csv); } catch (_) {}
  }

  // Header: Company Name,Industry,Symbol,Series,ISIN Code
  const lines = csv.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 3) continue;
    const sym = (cols[2] || '').trim();
    if (sym) out.push(sym);
  }
  return out;
}

// index: 'nifty50' | 'nifty100' | 'nifty200' | 'nifty500' | 'niftytotal' | 'etf' | 'fno' | 'all' | 'bse_exclusive'
async function getList(index) {
  if (index === 'bse_exclusive') {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, 'js', 'data', 'bse_exclusives.json'), 'utf8'));
    } catch (e) {
      throw new Error('bse_exclusives.json not found. Please run the generation script.');
    }
  }
  if (index === 'all') return bhavcopy.listSymbols();
  if (index === 'etf') return ETF_LIST.slice();
  if (index === 'fno') return Object.keys(await require('./lots').getLots());
  if (!INDEX_FILES[index]) throw new Error(`Unknown index "${index}"`);
  return fetchIndex(index);
}

module.exports = { getList, INDEX_FILES };
