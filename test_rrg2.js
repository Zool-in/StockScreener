const fs = require('fs');
const { calculateRRG } = require('./js/core/math.js');

const nseiRaw = JSON.parse(fs.readFileSync('.cache/_NSEI_1wk_5y.json'));

const http = require('http');
http.get('http://localhost:5174/api/chart?symbol=MARUTI.NS&interval=1wk&range=5y', (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const sData = JSON.parse(body).chart.result[0].indicators.quote[0].close;
    const bData = nseiRaw.chart.result[0].indicators.quote[0].close;
    try {
      const result = calculateRRG(sData, bData, 14);
      console.log('RRG Success:', result.length);
      console.log('Last point:', result[result.length - 1]);
    } catch (e) {
      console.log('RRG Error:', e.message);
    }
  });
});
