const fs = require('fs');
const path = require('path');
const bhavcopy = require('/Volumes/Workspace/Projects/2026/StockScan/bhavcopy.js');
const xtrender = require('/Volumes/Workspace/Projects/2026/StockScan/js/strategies/xtrender.js');

async function verify() {
  console.log("Loading chart data for verification...");
  const rawData = await bhavcopy.fetchChart('RELIANCE', '1d', '3mo');
  const data = JSON.parse(rawData);
  const resultObj = data.chart.result[0];
  const closes = resultObj.indicators.quote[0].close.filter(c => c !== null);
  const highs = resultObj.indicators.quote[0].high.filter(h => h !== null);
  const lows = resultObj.indicators.quote[0].low.filter(l => l !== null);
  const opens = resultObj.indicators.quote[0].open.filter(o => o !== null);
  const volumes = resultObj.indicators.quote[0].volume.filter(v => v !== null);

  const chartData = { ticker: 'RELIANCE', closes, highs, lows, opens, volumes, cmp: closes[closes.length - 1] };
  
  console.log("Running B-Xtrender Bullish Strategy check on RELIANCE...");
  const resBullish = xtrender.run('xtrender_bullish', chartData);
  console.log("Bullish result:", resBullish);

  console.log("Running B-Xtrender Bearish Strategy check on RELIANCE...");
  const resBearish = xtrender.run('xtrender_bearish', chartData);
  console.log("Bearish result:", resBearish);
}

verify();
