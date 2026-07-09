const fs = require('fs');
let html = fs.readFileSync('options.html', 'utf8');

const target1 = `const adx = d.adx ? d.adx[d.adx.length-1].adx : 0;
          if (d.cmp > e50 && d.cmp > e200 && adx > 25 && vol > 0.25) {
            score = vol * 100 + adx; reason = \`ADX \${adx.toFixed(0)} · HV \${(vol*100).toFixed(1)}%\`;`;
const replace1 = `const adxVal = adx(d.highs, d.lows, d.closes);
          if (d.cmp > e50 && d.cmp > e200 && adxVal > 25 && vol > 0.25) {
            score = vol * 100 + adxVal; reason = \`ADX \${adxVal.toFixed(0)} · HV \${(vol*100).toFixed(1)}%\`;`;

const target2 = `const adx = d.adx ? d.adx[d.adx.length-1].adx : 0;
          if (adx < 22 && vol > 0.35) {
            score = vol * 100 - adx; reason = \`Flat ADX \${adx.toFixed(0)} · Massive HV \${(vol*100).toFixed(1)}%\`;`;
const replace2 = `const adxVal = adx(d.highs, d.lows, d.closes);
          if (adxVal < 22 && vol > 0.35) {
            score = vol * 100 - adxVal; reason = \`Flat ADX \${adxVal.toFixed(0)} · Massive HV \${(vol*100).toFixed(1)}%\`;`;

html = html.replace(target1, replace1).replace(target2, replace2);
fs.writeFileSync('options.html', html);
