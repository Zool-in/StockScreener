const fs = require('fs');

function fixPineScript(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  content = content.replace(/trendScore = 0\.0\nif close > emaSlow\n    trendScore \+= 12\.5\nif emaFast > emaSlow\n    trendScore \+= 12\.5/g, 
    'trendScore = (close > emaSlow ? 12.5 : 0.0) + (emaFast > emaSlow ? 12.5 : 0.0)');
    
  content = content.replace(/momScore = 0\.0\nif rsi_val > 50 and rsi_val < 70\n    momScore \+= 20/g,
    'momScore = (rsi_val > 50 and rsi_val < 70 ? 20.0 : 0.0)');
    
  content = content.replace(/volScore = 0\.0\nif rvol > 1\.5\n    volScore \+= 20/g,
    'volScore = (rvol > 1.5 ? 20.0 : 0.0)');
    
  content = content.replace(/volaScore = 0\.0\nif atr_val > ta\.sma\(atr_val, 20\)\n    volaScore \+= 10/g,
    'volaScore = (atr_val > ta.sma(atr_val, 20) ? 10.0 : 0.0)');
    
  content = content.replace(/smcScore = 0\.0\nif bullish_ob\n    smcScore \+= 20/g,
    'smcScore = (bullish_ob ? 20.0 : 0.0)');
    
  // also fix scripts.js which might have slightly different += numbers
  content = content.replace(/trendScore = 0\.0\nif \(close > ema200\) trendScore \+= 5\nif \(close > ema50\) trendScore \+= 5\nif \(ema9 > ema21\) trendScore \+= 5\nif \(ema9_slope > 0\) trendScore \+= 5\nif \(ema50 > ema200\) trendScore \+= 5/g,
    'trendScore = (close > ema200 ? 5 : 0) + (close > ema50 ? 5 : 0) + (ema9 > ema21 ? 5 : 0) + (ema9_slope > 0 ? 5 : 0) + (ema50 > ema200 ? 5 : 0)');
    
  content = content.replace(/momScore = 0\.0\nif \(rsi_val > 50 and rsi_val < 70\) momScore \+= 5\nif \(histLine > 0\) momScore \+= 5\nif \(histLine > histLine\[1\]\) momScore \+= 5 \/\/ Acceleration\nif \(adx_val > 25 and diplus > diminus\) momScore \+= 5/g,
    'momScore = (rsi_val > 50 and rsi_val < 70 ? 5 : 0) + (histLine > 0 ? 5 : 0) + (histLine > histLine[1] ? 5 : 0) + (adx_val > 25 and diplus > diminus ? 5 : 0)');
    
  content = content.replace(/volScore = 0\.0\nif \(rvol > 1\.2\) volScore \+= 10\nif \(volume > vol50\) volScore \+= 10/g,
    'volScore = (rvol > 1.2 ? 10 : 0) + (volume > vol50 ? 10 : 0)');
    
  content = content.replace(/volaScore = 0\.0\nif \(isExpansion\) volaScore \+= 5\nif \(not isSqueeze\) volaScore \+= 5/g,
    'volaScore = (isExpansion ? 5 : 0) + (not isSqueeze ? 5 : 0)');
    
  content = content.replace(/smcScore = 0\.0\nif \(bullish_ob\) smcScore \+= 10\nif \(close > swingLow\) smcScore \+= 10 \/\/ Holding discount zone/g,
    'smcScore = (bullish_ob ? 10 : 0) + (close > swingLow ? 10 : 0)');

  fs.writeFileSync(filepath, content);
}

fixPineScript('ElephantEdge-Pro/ElephantEdge_v3.pine');
fixPineScript('js/data/scripts.js');
console.log('Fixed syntax!');
