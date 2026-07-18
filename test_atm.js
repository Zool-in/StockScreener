const chainData = [{strike_price: 24000}, {strike_price: 24050}, {strike_price: 24100}];
let underlyingLtp = 24040;
let atmStrike = null;
let minDiff = Infinity;
for (const row of chainData) {
    if (underlyingLtp) {
      const diff = Math.abs(row.strike_price - underlyingLtp);
      if (diff < minDiff) {
        minDiff = diff;
        atmStrike = row.strike_price;
      }
    }
}
console.log("atmStrike:", atmStrike);
for (const row of chainData) {
    const isAtm = (row.strike_price === atmStrike);
    console.log(row.strike_price, "isAtm:", isAtm);
}
