const https = require('https');
function httpsGet(urlStr, headers = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const { URL } = require('url');
    const u = new URL(urlStr);
    const req = https.request(u, { headers, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

(async () => {
  const urls = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent('https://query1.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS,TCS.NS')}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent('https://query1.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS,TCS.NS')}`
  ];
  for (const u of urls) {
    console.log("Fetching", u);
    try {
      const r = await httpsGet(u, { 'User-Agent': 'curl/8.4.0' }, 5000);
      console.log("Status:", r.status);
      console.log("Body preview:", r.body.substring(0, 150));
    } catch (e) {
      console.log("Error:", e.message);
    }
  }
})();
