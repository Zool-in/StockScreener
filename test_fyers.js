const fyers = require('./fyers.js');
console.log(Object.keys(fyers));
if (fyers.hasValidSession()) {
  fyers.fetchChart("RELIANCE.NS", "1wk", "5y").then(res => {
    console.log("Success! Length:", JSON.parse(res).chart.result[0].timestamp.length);
  }).catch(err => {
    console.log("Error:", err.message);
  });
} else {
  console.log("No valid session");
}
