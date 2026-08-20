const fs = require('fs');
const { calculateRRG } = require('./js/core/math.js');

const nseiRaw = JSON.parse(fs.readFileSync('.cache/_NSEI_1wk_5y.json'));
const autoRaw = JSON.parse(fs.readFileSync('.cache/_CNXAUTO_1wk_5y.json'));

const bData = nseiRaw.chart.result[0].indicators.quote[0].close;
const sData = autoRaw.chart.result[0].indicators.quote[0].close;

try {
  const result = calculateRRG([{ symbol: '^CNXAUTO', close: sData }], bData, 14);
  console.log('RRG Success:', result.length);
} catch (e) {
  console.log('RRG Error:', e.message);
}
