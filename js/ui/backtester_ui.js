// ─── TradingView Strategy Tester UI ──────────────────────────────────────────

let currentChart = null;
let currentCandleSeries = null;
let currentEquitySeries = null;
let currentResults = null;

export function openStrategyTester(ticker, timeframe, strategyId, backtestResults, rawData) {
  currentResults = backtestResults;
  
  // Show modal with premium animation
  if (window.openBacktester) {
    window.openBacktester();
  } else {
    const modal = document.getElementById('backtesterModal');
    modal.style.display = 'block';
  }
  
  // Update Header
  document.getElementById('btTitle').innerText = `Strategy Tester: ${strategyId.toUpperCase()}`;
  document.getElementById('btSubtitle').innerText = `${ticker} • ${timeframe}`;
  
  // Destroy old chart if exists
  const chartContainer = document.getElementById('btChart');
  chartContainer.innerHTML = '';
  if (currentChart) {
    currentChart.remove();
    currentChart = null;
  }
  
  // Dynamically load premium theme colors from design_tokens.css
  const style = getComputedStyle(document.documentElement);
  const bgPrimary = style.getPropertyValue('--bg-primary').trim() || '#0D1117';
  const textPrimary = style.getPropertyValue('--text-primary').trim() || '#E6EDF3';
  const gridColor = style.getPropertyValue('--border-color').trim() || '#30363D';
  const profitColor = style.getPropertyValue('--profit-color').trim() || '#2EA043';
  const lossColor = style.getPropertyValue('--loss-color').trim() || '#F85149';

  // Initialize TradingView Lightweight Chart
  currentChart = LightweightCharts.createChart(chartContainer, {
    layout: {
      background: { type: 'solid', color: 'transparent' }, // Use container background
      textColor: textPrimary,
    },
    grid: {
      vertLines: { color: gridColor },
      horzLines: { color: gridColor },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: gridColor,
    },
    timeScale: {
      borderColor: gridColor,
      timeVisible: true,
    },
  });

  // Add Candlestick Series
  currentCandleSeries = currentChart.addCandlestickSeries({
    upColor: profitColor,
    downColor: lossColor,
    borderDownColor: lossColor,
    borderUpColor: profitColor,
    wickDownColor: lossColor,
    wickUpColor: profitColor,
  });

  // Format historical data for chart
  let candleData = [];
  for (let i = 0; i < rawData.closes.length; i++) {
    candleData.push({
      time: rawData.ts[i],
      open: rawData.opens[i],
      high: rawData.highs[i],
      low: rawData.lows[i],
      close: rawData.closes[i],
    });
  }
  
  // Lightweight charts strictly requires data to be ascending by time
  candleData.sort((a, b) => a.time - b.time);
  
  // Remove duplicate timestamps
  const uniqueCandles = [];
  for (let i = 0; i < candleData.length; i++) {
    if (i > 0 && candleData[i].time === candleData[i-1].time) continue;
    uniqueCandles.push(candleData[i]);
  }
  
  try {
    currentCandleSeries.setData(uniqueCandles);
  } catch(e) {
    console.error("Chart setData error:", e);
  }

  // Generate Buy/Sell Markers from Trades
  const markers = [];
  const validTimes = new Set(uniqueCandles.map(c => c.time));
  
  backtestResults.trades.forEach(t => {
    // Only add markers if the time exists in the candle data (required by lightweight-charts)
    if (validTimes.has(t.entryDate)) {
      markers.push({
        time: t.entryDate,
        position: t.isShort ? 'aboveBar' : 'belowBar',
        color: t.isShort ? lossColor : profitColor,
        shape: t.isShort ? 'arrowDown' : 'arrowUp',
        text: t.isShort ? 'Sell' : 'Buy'
      });
    }
    
    if (validTimes.has(t.exitDate)) {
      markers.push({
        time: t.exitDate,
        position: t.isShort ? 'belowBar' : 'aboveBar',
        color: '#e1bee7',
        shape: t.isShort ? 'arrowUp' : 'arrowDown',
        text: 'Exit'
      });
    }
  });
  
  // Sort markers by time as required by lightweight-charts
  markers.sort((a, b) => a.time - b.time);
  try {
    currentCandleSeries.setMarkers(markers);
  } catch(e) {
    console.error("Chart setMarkers error:", e);
  }

  // Switch to Summary Tab by default
  window.switchBtTab('summary');
  
  // Handle resize
  new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== chartContainer) { return; }
    const newRect = entries[0].contentRect;
    currentChart.applyOptions({ height: newRect.height, width: newRect.width });
  }).observe(chartContainer);
}

// Global function to render tab content
window.renderBtTab = function(tab) {
  const content = document.getElementById('btContentArea');
  const res = currentResults;
  if (!res) return;

  if (tab === 'summary') {
    const isProfitable = res.totalReturn >= 0;
    const pfColor = isProfitable ? 'var(--profit-color)' : 'var(--loss-color)';
    content.innerHTML = `
      <div class="bt-summary-grid">
        <div class="bt-summary-card">
          <div style="color:var(--text-muted); font-size:12px;">Net Profit</div>
          <div class="bt-summary-val" style="color:${pfColor}">${isProfitable ? '+' : ''}${res.totalReturn}%</div>
        </div>
        <div class="bt-summary-card">
          <div style="color:var(--text-muted); font-size:12px;">Total Trades</div>
          <div class="bt-summary-val">${res.totalTrades}</div>
        </div>
        <div class="bt-summary-card">
          <div style="color:var(--text-muted); font-size:12px;">Percent Profitable</div>
          <div class="bt-summary-val" style="color:${res.winRate >= 50 ? 'var(--profit-color)' : 'var(--loss-color)'}">${res.winRate}%</div>
        </div>
        <div class="bt-summary-card">
          <div style="color:var(--text-muted); font-size:12px;">Max Drawdown</div>
          <div class="bt-summary-val" style="color:var(--loss-color)">${res.maxDrawdown}%</div>
        </div>
      </div>
    `;
  } else if (tab === 'trades') {
    let tableHtml = `
      <table class="bt-trade-table">
        <thead>
          <tr>
            <th>Trade #</th>
            <th>Type</th>
            <th>Entry Date</th>
            <th>Entry Price</th>
            <th>Exit Date</th>
            <th>Exit Price</th>
            <th>Profit %</th>
            <th>Days Held</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    // Reverse to show newest trades first
    const reversedTrades = [...res.trades].reverse();
    
    reversedTrades.forEach((t, i) => {
      const isWin = t.result === 'WIN';
      const pColor = isWin ? 'var(--profit-color)' : 'var(--loss-color)';
      tableHtml += `
        <tr>
          <td>${res.trades.length - i}</td>
          <td style="color:${t.isShort ? 'var(--loss-color)' : 'var(--profit-color)'}">${t.isShort ? 'Short' : 'Long'}</td>
          <td>${new Date(t.entryDate * 1000).toLocaleDateString()}</td>
          <td>₹${t.entryPrice.toFixed(2)}</td>
          <td>${new Date(t.exitDate * 1000).toLocaleDateString()}</td>
          <td>₹${t.exitPrice.toFixed(2)}</td>
          <td style="color:${pColor}; font-weight:bold;">${t.pnlPct > 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%</td>
          <td>${t.daysHeld}</td>
        </tr>
      `;
    });
    
    tableHtml += `</tbody></table>`;
    content.innerHTML = tableHtml;
  }
};
