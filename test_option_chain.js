const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/FYERS_ACCESS_TOKEN=(.*)/);
if (!match) { console.error("No token"); process.exit(1); }
const appIdMatch = env.match(/FYERS_APP_ID=(.*)/);
const token = `${appIdMatch[1].trim()}:${match[1].trim()}`;

const https = require('https');

async function test() {
  const url = new URL('https://api-t1.fyers.in/data/options-chain-v3?symbol=NSE:NIFTY50-INDEX&strikecount=30');
  
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'GET',
    headers: { 'Authorization': token }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => console.log('Response:', res.statusCode, data.substring(0, 1000)));
  });
  req.on('error', console.error);
  req.end();
}
test();
