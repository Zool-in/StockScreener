// ─── Fundamentals Generator ──────────────────────────────────────────
// Resolves company name, sector, and industry from Nifty 500 list.
// Computes technical stats (Beta, ATR, HV, Avg Volume, Turnover, Delivery) 
// using official Bhavcopy data.
// For static financial data (Promoter Holding, Institution Holding, Market Cap),
// it provides a static metadata registry for top stocks and handles fallbacks gracefully.

const fs = require('fs');
const path = require('path');
const lots = require('../lots');
const bhavcopy = require('../bhavcopy');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
const OUTPUT_FILE = path.join(__dirname, '..', 'js', 'data', 'fundamentals.json');
const NIFTY500_CSV = path.join(CACHE_DIR, 'indices', 'ind_nifty500list.csv');

// Static fundamentals database for F&O stocks (Market Cap in ₹ Crores)
// This serves as the source of truth for structural/financial metrics.
const STATIC_REGISTRY = {
  'RELIANCE': { marketCap: 1750000, promoterHolding: 50.39, institutionHolding: 39.21 },
  'TCS': { marketCap: 1350000, promoterHolding: 72.41, institutionHolding: 22.12 },
  'HDFCBANK': { marketCap: 1100000, promoterHolding: 0.0, institutionHolding: 81.3 }, // HDFC Bank has no promoter holding post merger
  'BHARTIARTL': { marketCap: 820000, promoterHolding: 54.67, institutionHolding: 38.9 },
  'ICICIBANK': { marketCap: 780000, promoterHolding: 0.0, institutionHolding: 89.2 },
  'INFY': { marketCap: 640000, promoterHolding: 14.94, institutionHolding: 71.2 },
  'ITC': { marketCap: 520000, promoterHolding: 0.0, institutionHolding: 76.5 },
  'SBIN': { marketCap: 620000, promoterHolding: 57.49, institutionHolding: 34.2 },
  'LTI': { marketCap: 180000, promoterHolding: 68.6, institutionHolding: 21.3 },
  'LT': { marketCap: 450000, promoterHolding: 0.0, institutionHolding: 64.8 },
  'HINDUNILVR': { marketCap: 580000, promoterHolding: 61.9, institutionHolding: 27.5 },
  'BAJFINANCE': { marketCap: 420000, promoterHolding: 54.78, institutionHolding: 32.6 },
  'KOTAKBANK': { marketCap: 350000, promoterHolding: 25.89, institutionHolding: 60.1 },
  'M&M': { marketCap: 310000, promoterHolding: 19.32, institutionHolding: 68.4 },
  'AXISBANK': { marketCap: 340000, promoterHolding: 0.0, institutionHolding: 81.2 },
  'ASIANPAINT': { marketCap: 280000, promoterHolding: 52.63, institutionHolding: 26.8 },
  'ADANIENT': { marketCap: 320000, promoterHolding: 72.61, institutionHolding: 19.5 },
  'SUNPHARMA': { marketCap: 360000, promoterHolding: 54.48, institutionHolding: 35.2 },
  'TITAN': { marketCap: 290000, promoterHolding: 52.9, institutionHolding: 28.4 },
  'TATASTEEL': { marketCap: 160000, promoterHolding: 33.19, institutionHolding: 32.5 },
};

async function generate() {
  console.log('[Fundamentals] Starting generation...');
  
  // 1. Get F&O list
  const fnoLots = await lots.getLots();
  const fnoSymbols = Object.keys(fnoLots);
  console.log(`[Fundamentals] Loaded ${fnoSymbols.length} F&O symbols.`);

  // 2. Parse Nifty 500 list for Name and Industry
  const industryMap = {};
  const nameMap = {};
  if (fs.existsSync(NIFTY500_CSV)) {
    const csvContent = fs.readFileSync(NIFTY500_CSV, 'utf8');
    const lines = csvContent.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 3) continue;
      const symbol = cols[2].trim();
      const industry = cols[1].trim();
      const name = cols[0].trim();
      industryMap[symbol] = industry;
      nameMap[symbol] = name;
    }
    console.log('[Fundamentals] Parsed Nifty 500 index details.');
  } else {
    console.log('[Fundamentals] Nifty 500 CSV not found at:', NIFTY500_CSV);
  }

  // 3. Load Bhavcopy index to compute historical parameters (Beta, ATR, Volatility)
  console.log('[Fundamentals] Loading Bhavcopy cache for technical computations...');
  let n50Series = null;
  try {
    const rawN50 = await bhavcopy.fetchChart('NIFTY 50', '1d', '1y');
    const objN50 = JSON.parse(rawN50);
    const resN50 = objN50.chart.result[0];
    const qN50 = resN50.indicators.quote[0];
    n50Series = {
      close: qN50.close,
      timestamp: resN50.timestamp
    };
  } catch (e) {
    console.log('[Fundamentals] Warning: Could not fetch Nifty 50 for Beta calculation. Beta calculations will fall back.');
  }

  const output = {};

  for (const sym of fnoSymbols) {
    let base = sym.toUpperCase();
    
    // Parse name and industry
    const name = nameMap[base] || `${base} Limited`;
    const industry = industryMap[base] || 'Diversified';
    
    // Fetch chart data (1 year daily) to calculate ATR, Beta, and HV
    let chart = null;
    try {
      const raw = await bhavcopy.fetchChart(base, '1d', '1y');
      const obj = JSON.parse(raw);
      const res = obj.chart.result[0];
      const q = res.indicators.quote[0];
      chart = {
        close: q.close,
        open: q.open,
        high: q.high,
        low: q.low,
        volume: q.volume,
        timestamp: res.timestamp,
        delivPer: q.delivPer
      };
    } catch (_) {}

    let beta = 1.0;
    let atr = 0.0;
    let hv = 0.0;
    let avgVolume = 0;
    let avgTurnover = 0;
    let avgDelivery = 0;

    if (chart && chart.close && chart.close.length > 20) {
      const closes = chart.close;
      const opens = chart.open;
      const highs = chart.high;
      const lows = chart.low;
      const volumes = chart.volume;
      const deliveries = chart.delivPer || [];

      const n = closes.length;
      
      // Avg Volume & Delivery
      let volSum = 0;
      let delivSum = 0;
      let delivCount = 0;
      for (let i = 0; i < n; i++) {
        volSum += volumes[i] || 0;
        if (deliveries[i] != null && !isNaN(deliveries[i])) {
          delivSum += deliveries[i];
          delivCount++;
        }
      }
      avgVolume = Math.round(volSum / n);
      avgDelivery = delivCount > 0 ? parseFloat((delivSum / delivCount).toFixed(2)) : null;

      // Estimate Turnover in Lakhs (CMP * Avg Volume / 100,000)
      const cmp = closes[n - 1];
      avgTurnover = parseFloat(((cmp * avgVolume) / 100000).toFixed(2));

      // ATR (14-period)
      let trSum = 0;
      for (let i = n - 14; i < n; i++) {
        if (i <= 0) continue;
        const h = highs[i], l = lows[i], prevC = closes[i - 1];
        const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
        trSum += tr;
      }
      atr = parseFloat((trSum / 14).toFixed(2));

      // Historical Volatility (HV) - standard dev of daily log returns, annualized
      const returns = [];
      for (let i = 1; i < n; i++) {
        returns.push(Math.log(closes[i] / closes[i - 1]));
      }
      const rMean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const rVar = returns.reduce((a, b) => a + Math.pow(b - rMean, 2), 0) / (returns.length - 1);
      hv = parseFloat((Math.sqrt(rVar) * Math.sqrt(252) * 100).toFixed(2));

      // Beta calculation vs Nifty 50
      if (n50Series && n50Series.close && n50Series.close.length > 50) {
        // Match timestamps to align returns
        const alignedStock = [];
        const alignedIndex = [];
        const stockMap = new Map();
        chart.timestamp.forEach((ts, idx) => stockMap.set(ts, closes[idx]));

        n50Series.timestamp.forEach((ts, idx) => {
          if (stockMap.has(ts)) {
            alignedIndex.push(n50Series.close[idx]);
            alignedStock.push(stockMap.get(ts));
          }
        });

        if (alignedStock.length > 20) {
          const sRet = [], idxRet = [];
          for (let i = 1; i < alignedStock.length; i++) {
            sRet.push(Math.log(alignedStock[i] / alignedStock[i - 1]));
            idxRet.push(Math.log(alignedIndex[i] / alignedIndex[i - 1]));
          }
          const idxMean = idxRet.reduce((a, b) => a + b, 0) / idxRet.length;
          const sMean = sRet.reduce((a, b) => a + b, 0) / sRet.length;
          
          let covariance = 0;
          let idxVariance = 0;
          for (let i = 0; i < sRet.length; i++) {
            covariance += (sRet[i] - sMean) * (idxRet[i] - idxMean);
            idxVariance += Math.pow(idxRet[i] - idxMean, 2);
          }
          beta = idxVariance > 0 ? parseFloat((covariance / idxVariance).toFixed(2)) : 1.0;
        }
      }
    }

    // Load static fundamentals if available, else use placeholder estimates
    const sFund = STATIC_REGISTRY[base] || {};
    const marketCapVal = sFund.marketCap || null;
    const promoterHolding = sFund.promoterHolding != null ? sFund.promoterHolding : 'Insufficient Data';
    const institutionHolding = sFund.institutionHolding != null ? sFund.institutionHolding : 'Insufficient Data';

    output[base] = {
      symbol: base,
      companyName: name,
      sector: industry, // Nifty500 list has 'Industry' which works perfectly as sector/industry
      industry: industry,
      marketCapCr: marketCapVal,
      promoterHoldingPct: promoterHolding,
      institutionHoldingPct: institutionHolding,
      beta: beta,
      atr: atr,
      historicalVolatilityPct: hv,
      averageDailyVolume: avgVolume,
      averageDailyTurnoverLacs: avgTurnover,
      deliveryPct: avgDelivery,
    };
  }

  // Create directory if not exists
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[Fundamentals] Successfully generated fundamentals database at ${OUTPUT_FILE}`);
}

generate().catch(console.error);
