const results = [
  { ticker: 'ADANIENT', curr: 3165.8, ema200: 2491, ema50: 2855, ema20: 3055, rsiVal: 61, adxVal: 28, macdHist: 10, vr: 0.14 },
  { ticker: 'ADANIPORTS', curr: 1842.5, ema200: 1591, ema50: 1766, ema20: 1821, rsiVal: 55, adxVal: 12, macdHist: 1, vr: 0.13 },
  { ticker: 'APOLLOHOSP', curr: 8828.5, ema200: 7805, ema50: 8360, ema20: 8645, rsiVal: 66, adxVal: 35, macdHist: 20, vr: 0.12 },
  { ticker: 'ASIANPAINT', curr: 2722.4, ema200: 2552, ema50: 2638, ema20: 2695, rsiVal: 55, adxVal: 17, macdHist: 5, vr: 0.10 }
];

results.forEach(r => {
  let calcScore = 0;
  if (r.curr > r.ema200) calcScore += 10;
  if (r.curr > r.ema50) calcScore += 10;
  if (r.curr > r.ema20) calcScore += 10;
  
  if (r.rsiVal > 40 && r.rsiVal < 70) calcScore += 20;
  else if (r.rsiVal >= 70) calcScore += 10;
  else if (r.rsiVal <= 30) calcScore += 5;

  if (r.adxVal > 25) calcScore += 20;
  else if (r.adxVal > 20) calcScore += 10;

  if (r.macdHist > 0) calcScore += 15;
  else if (r.macdHist > -1) calcScore += 5;

  if (r.vr > 2.0) calcScore += 15;
  else if (r.vr > 1.2) calcScore += 10;
  else if (r.vr > 0.8) calcScore += 5;

  r.score = r.score || calcScore;
});

results.sort((a, b) => b.score - a.score);

console.log(results.map(r => `${r.ticker}: ${r.score}`));
