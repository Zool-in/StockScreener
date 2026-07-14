const fs = require('fs');
const path = require('path');
const symbols = require('../symbols');

async function main() {
  const bseCsvPath = path.join(__dirname, '..', 'bse_list.csv');
  const outPath = path.join(__dirname, '..', 'js', 'data', 'bse_exclusives.json');

  if (!fs.existsSync(bseCsvPath)) {
    console.error('❌ Error: bse_list.csv not found in the project root.');
    console.error('Please download the "List of Scrips" CSV from: https://www.bseindia.com/corporates/List_Scrips.html');
    console.error('Make sure to select: Segment = Equity, Status = Active. Rename it to bse_list.csv and place it in the root folder.');
    process.exit(1);
  }

  console.log('Fetching ALL NSE stocks to cross-reference...');
  // Force a fetch of all NSE stocks
  const nseStocks = new Set(await symbols.getList('all'));
  console.log(`Loaded ${nseStocks.size} NSE stocks.`);

  const bseRaw = fs.readFileSync(bseCsvPath, 'utf8').split('\n');
  const bseExclusives = [];

  // Assuming headers: Security Code, Security Id, Security Name, Status, Group, Face Value, ISIN No, Industry, Instruments
  // We need Security Id (index 1) and Group (index 4)
  for (let i = 1; i < bseRaw.length; i++) {
    const line = bseRaw[i].trim();
    if (!line) continue;
    
    // Parse CSV line properly (handling quotes)
    const cols = line.split(','); 
    if (cols.length < 5) continue;
    
    const secId = cols[1].trim().toUpperCase();
    const group = cols[4].trim().toUpperCase();
    const status = cols[3].trim().toUpperCase();

    // Only want Active stocks in highly liquid groups A and B
    if (status !== 'ACTIVE') continue;
    if (group !== 'A' && group !== 'B') continue;

    // Check if it exists in NSE
    if (!nseStocks.has(secId)) {
      bseExclusives.push(secId + '.BO');
    }
  }

  console.log(`Found ${bseExclusives.length} highly liquid BSE-Exclusive stocks (Groups A & B).`);
  
  // Ensure the directory exists
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outPath, JSON.stringify(bseExclusives, null, 2));
  console.log(`✅ Saved to ${outPath}`);
}

main().catch(console.error);
