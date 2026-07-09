const fs = require('fs');
const https = require('https');

async function fetchFromYF(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?interval=1d&range=3mo`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const chart = json?.chart?.result?.[0];
          if (!chart) return reject("no data");
          resolve(chart);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function ema(arr, p) { const k = 2 / (p + 1); let e = arr[0]; for (let i = 0; i < arr.length; i++) e = arr[i] * k + e * (1 - k); return e; }

function rsi(c, p = 14) {
  let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p; }
  if (al === 0) return 100; return Math.round(100 - 100 / (1 + ag / al));
}

function adx(hs, ls, cs, p = 14) {
  const n = cs.length; if (n < p + 2) return 20; const pDM = [], mDM = [], trs = [];
  for (let i = 1; i < n; i++) { const up = hs[i] - hs[i - 1], dn = ls[i - 1] - ls[i]; pDM.push(up > dn && up > 0 ? up : 0); mDM.push(dn > up && dn > 0 ? dn : 0); trs.push(Math.max(hs[i] - ls[i], Math.abs(hs[i] - cs[i - 1]), Math.abs(ls[i] - cs[i - 1]))); }
  let sTR = trs.slice(0, p).reduce((a, b) => a + b, 0), sP = pDM.slice(0, p).reduce((a, b) => a + b, 0), sM = mDM.slice(0, p).reduce((a, b) => a + b, 0); const dx = [];
  for (let i = p; i < trs.length; i++) { sTR = sTR - sTR / p + trs[i]; sP = sP - sP / p + pDM[i]; sM = sM - sM / p + mDM[i]; const dp = sP / sTR * 100, dm = sM / sTR * 100; dx.push(Math.abs(dp - dm) / (dp + dm) * 100); }
  return Math.round(dx.slice(-p).reduce((a, b) => a + b, 0) / p);
}

function hv30(closes) {
  if (closes.length < 31) return 0.2;
  const rets = [];
  for (let i = closes.length - 30; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / 30;
  let variance = 0;
  for (let r of rets) variance += Math.pow(r - mean, 2);
  return Math.sqrt(variance / 30) * Math.sqrt(252);
}

const NIFTY50 = ['ADANIENT', 'ASIANPAINT', 'BAJAJ-AUTO', 'HDFCBANK', 'RELIANCE', 'TCS', 'INFY', 'ITC', 'TITAN', 'KOTAKBANK'];

async function run() {
  console.log("Starting Live Scanner Audit...");
  const results = { cc: [], csp: [], bps: [], strangle: [], wheel: [], vcp: [], breakout: [], rs: [] };
  
  for (let t of NIFTY50) {
    try {
      const chart = await fetchFromYF(t);
      const q = chart.indicators.quote[0];
      const closes = q.close.filter(c => c !== null);
      const highs = q.high.filter(h => h !== null);
      const lows = q.low.filter(l => l !== null);
      const volumes = q.volume.filter(v => v !== null);
      
      if (closes.length < 50) continue;
      
      const cmp = closes[closes.length - 1];
      const rsiVal = rsi(closes);
      const e200 = ema(closes, 200) || cmp * 0.9; // mock if array too short
      const e50 = ema(closes, 50);
      const e20 = ema(closes, 20);
      const adxVal = adx(highs, lows, closes);
      const vol = hv30(closes);
      
      // -- OPTIONS LOGIC AUDIT --
      if (cmp > e200 && rsiVal > 55 && rsiVal < 80) results.cc.push(t);
      if (cmp > e200 && cmp < e50 && rsiVal < 45) results.csp.push(t);
      if (cmp > e50 && cmp > e200 && adxVal > 25 && vol > 0.25) results.bps.push(t);
      if (adxVal < 22 && vol > 0.35) results.strangle.push(t);
      if (cmp > e200 && rsiVal < 55) results.wheel.push(t);
      
      // -- SWING SCREENER LOGIC AUDIT --
      const hlPct = (highs[highs.length-1] - lows[lows.length-1]) / lows[lows.length-1] * 100;
      if (hlPct < 2.5 && cmp > e200 && adxVal < 25) results.vcp.push(t);
      
      const avgVol = volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
      if (cmp > closes[closes.length-2] * 1.04 && volumes[volumes.length-1] > avgVol * 1.5) results.breakout.push(t);
      
      if (cmp > e200 && cmp > e50 && cmp > e20 && rsiVal > 55 && adxVal > 22) results.rs.push(t);
      
    } catch(e) {
      console.log(`Failed ${t}:`, e);
    }
  }
  
  console.log("=== AUDIT RESULTS (Snapshot of NIFTY50 sample) ===");
  console.log(JSON.stringify(results, null, 2));
}

run();
