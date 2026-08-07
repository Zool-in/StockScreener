// ─── Stock DNA Library Client Logic ───────────────────────────────────────
// Handles state management, list filtering, asynchronous API fetches,
// rendering detailed scorecard cards, and comparison cards.

document.addEventListener('DOMContentLoaded', () => {
  let dnaSummaryList = [];
  let selectedSymbol = null;
  let activeView = 'explorer'; // 'explorer' or 'compare'

  // DOM Elements
  const btnDnaView = document.getElementById('btnDnaView');
  const btnCompareView = document.getElementById('btnCompareView');
  const dnaExplorerTab = document.getElementById('dnaExplorerTab');
  const dnaComparisonTab = document.getElementById('dnaComparisonTab');
  
  const symbolSearch = document.getElementById('symbolSearch');
  const universeFilter = document.getElementById('universeFilter');
  const strategyFilter = document.getElementById('strategyFilter');
  const personalityFilter = document.getElementById('personalityFilter');
  const stockListContainer = document.getElementById('stockListContainer');
  
  const compareStockA = document.getElementById('compareStockA');
  const compareStockB = document.getElementById('compareStockB');
  const compareDetailsA = document.getElementById('compareDetailsA');
  const compareDetailsB = document.getElementById('compareDetailsB');
  
  const btnRegen = document.getElementById('btnRegen');
  const connStatus = document.getElementById('connStatus');

  // Inner Tabs and Panels
  const tabQuant = document.getElementById('tabQuant');
  const tabBusiness = document.getElementById('tabBusiness');
  const tabSwot = document.getElementById('tabSwot');
  const tabNews = document.getElementById('tabNews');

  const panelQuant = document.getElementById('panelQuant');
  const panelBusiness = document.getElementById('panelBusiness');
  const panelSwot = document.getElementById('panelSwot');
  const panelNews = document.getElementById('panelNews');

  let activeInnerTab = 'quant';

  function switchInnerTab(tabName) {
    activeInnerTab = tabName;
    const tabs = [tabQuant, tabBusiness, tabSwot, tabNews];
    const panels = [panelQuant, panelBusiness, panelSwot, panelNews];
    
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.style.display = 'none');
    
    if (tabName === 'quant') {
      tabQuant.classList.add('active');
      panelQuant.style.display = 'grid';
    } else if (tabName === 'business') {
      tabBusiness.classList.add('active');
      panelBusiness.style.display = 'grid';
    } else if (tabName === 'swot') {
      tabSwot.classList.add('active');
      panelSwot.style.display = 'grid';
    } else if (tabName === 'news') {
      tabNews.classList.add('active');
      panelNews.style.display = 'block';
      fetchNews(selectedSymbol);
    }
  }

  tabQuant.addEventListener('click', () => switchInnerTab('quant'));
  tabBusiness.addEventListener('click', () => switchInnerTab('business'));
  tabSwot.addEventListener('click', () => switchInnerTab('swot'));
  tabNews.addEventListener('click', () => switchInnerTab('news'));

  async function fetchNews(symbol) {
    if (!symbol) return;
    const listEl = document.getElementById('newsFeedList');
    const statusEl = document.getElementById('newsStatus');
    listEl.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Loading feed...</div>';
    statusEl.textContent = 'Polling...';
    
    try {
      const res = await fetch(`/api/dna/news?symbol=${symbol}`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        statusEl.textContent = `${data.count} items`;
        listEl.innerHTML = '';
        data.data.forEach(item => {
          const row = document.createElement('div');
          row.className = 'news-item';
          
          const cleanLink = item.link || '#';
          const pubDateStr = item.pubDate ? new Date(item.pubDate).toLocaleString('en-US') : 'Recent';

          row.innerHTML = `
            <div class="news-title">
              <a href="${cleanLink}" target="_blank" rel="noopener noreferrer">${item.title}</a>
            </div>
            <div class="news-meta">
              <span>Source: ${item.source}</span>
              <span>•</span>
              <span>${pubDateStr}</span>
            </div>
          `;
          listEl.appendChild(row);
        });
      } else {
        statusEl.textContent = 'Offline';
        listEl.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No news available for this ticker.</div>';
      }
    } catch (e) {
      statusEl.textContent = 'Error';
      listEl.innerHTML = `<div style="color: var(--loss-color); padding: 20px; text-align: center;">Failed to load news: ${e.message}</div>`;
    }
  }

  // Toggle between Views
  btnDnaView.addEventListener('click', () => {
    activeView = 'explorer';
    btnDnaView.classList.add('active');
    btnCompareView.classList.remove('active');
    dnaExplorerTab.style.display = 'grid';
    dnaComparisonTab.style.display = 'none';
  });

  btnCompareView.addEventListener('click', () => {
    activeView = 'compare';
    btnCompareView.classList.add('active');
    btnDnaView.classList.remove('active');
    dnaExplorerTab.style.display = 'none';
    dnaComparisonTab.style.display = 'grid';
    
    // Populate dropdowns if not already populated
    populateCompareDropdowns();
  });

  // Fetch all summaries
  async function fetchSummaryList() {
    try {
      const res = await fetch('/api/dna');
      const data = await res.json();
      if (data.success && data.data) {
        dnaSummaryList = data.data;
        renderSidebarList(dnaSummaryList);
        
        // Auto select first stock if available
        if (dnaSummaryList.length > 0) {
          selectStock(dnaSummaryList[0].symbol);
        }
      }
    } catch (e) {
      console.error('Error fetching DNA list:', e);
      stockListContainer.innerHTML = `<div style="color: var(--loss-color); padding: 12px;">Failed to load DNA database. Make sure generator has run.</div>`;
    }
  }

  // Populate Dropdowns
  function populateCompareDropdowns() {
    const defaultA = compareStockA.value;
    const defaultB = compareStockB.value;

    compareStockA.innerHTML = '<option value="">Select Stock A...</option>';
    compareStockB.innerHTML = '<option value="">Select Stock B...</option>';

    dnaSummaryList.forEach(s => {
      const optionA = document.createElement('option');
      optionA.value = s.symbol;
      optionA.textContent = `${s.symbol} - ${s.companyName}`;
      compareStockA.appendChild(optionA);

      const optionB = document.createElement('option');
      optionB.value = s.symbol;
      optionB.textContent = `${s.symbol} - ${s.companyName}`;
      compareStockB.appendChild(optionB);
    });

    if (defaultA) compareStockA.value = defaultA;
    if (defaultB) compareStockB.value = defaultB;
  }

  // Render Sidebar constituent list
  function renderSidebarList(list) {
    stockListContainer.innerHTML = '';
    
    if (list.length === 0) {
      stockListContainer.innerHTML = '<div style="color: var(--text-muted); padding: 12px; font-size:13px;">No stocks match the filters.</div>';
      return;
    }

    list.forEach(stock => {
      const item = document.createElement('div');
      item.className = `stock-item ${selectedSymbol === stock.symbol ? 'active' : ''}`;
      item.dataset.symbol = stock.symbol;
      
      const charTag = stock.personality?.character || 'Calm';
      
      item.innerHTML = `
        <div>
          <div class="stock-symbol">${stock.symbol}</div>
          <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">
            ${stock.companyName}
          </div>
        </div>
        <div class="stock-tag">${charTag}</div>
      `;

      item.addEventListener('click', () => {
        // Toggle active style
        document.querySelectorAll('.stock-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        selectStock(stock.symbol);
      });

      stockListContainer.appendChild(item);
    });
  }

  // Filtering Logic
  function applyFilters() {
    const query = symbolSearch.value.toUpperCase();
    const universe = universeFilter.value;
    const strat = strategyFilter.value;
    const pers = personalityFilter.value;

    const filtered = dnaSummaryList.filter(s => {
      const matchesSymbol = s.symbol.includes(query) || s.companyName.toUpperCase().includes(query);
      
      const matchesUniverse = universe === 'all' || (s.indices && s.indices.includes(universe));
      
      // Since strategy lists are fully fetched only on specific selection,
      // the summary contains basic personality. We can estimate or filter based on it.
      const matchesPers = !pers || s.personality?.character === pers || s.personality?.trendType === pers;
      
      // Filter by best strategy (win rates generally map to personality)
      let matchesStrat = true;
      if (strat) {
        if (strat === '20 EMA Pullback' && s.ratings.pullbackReliability < 7) matchesStrat = false;
        if (strat === '52W High Breakout' && s.ratings.swingQuality < 7) matchesStrat = false;
      }

      return matchesSymbol && matchesUniverse && matchesPers && matchesStrat;
    });

    renderSidebarList(filtered);
  }

  symbolSearch.addEventListener('input', applyFilters);
  universeFilter.addEventListener('change', applyFilters);
  strategyFilter.addEventListener('change', applyFilters);
  personalityFilter.addEventListener('change', applyFilters);

  // Load and Render Single Stock Profile
  async function selectStock(symbol) {
    selectedSymbol = symbol;
    try {
      const res = await fetch(`/api/dna?symbol=${symbol}`);
      const data = await res.json();
      if (data.success && data.data) {
        renderDnaProfile(data.data);
      }
    } catch (e) {
      console.error('Error fetching stock details:', e);
    }
  }

  function renderDnaProfile(dna) {
    // Hero details
    document.getElementById('heroSymbol').textContent = `${dna.symbol}.NS`;
    document.getElementById('heroName').textContent = dna.companyName;
    document.getElementById('heroSummary').textContent = dna.aiSummary;

    // Badges
    const badges = document.getElementById('heroBadges');
    badges.innerHTML = `
      <span class="badge-personality">${dna.personality.trendType}</span>
      <span class="badge-personality">${dna.personality.character}</span>
      <span class="badge-sector">${dna.sector}</span>
    `;

    // Core Ratings progress bars
    const matrix = document.getElementById('matrixSection');
    matrix.innerHTML = '';
    
    const keyRatings = [
      { label: 'Trend Strength', val: dna.ratings.trendStrength },
      { label: 'Pullback Reliability', val: dna.ratings.pullbackReliability },
      { label: 'Breakout Success', val: dna.ratings.breakoutSuccess },
      { label: 'Options Liquidity', val: dna.ratings.optionsLiquidity },
      { label: 'Swing Quality', val: dna.ratings.swingQuality },
      { label: 'Volatility Score', val: dna.ratings.volatility }
    ];

    keyRatings.forEach(r => {
      const card = document.createElement('div');
      card.className = 'matrix-card';
      
      const pct = (r.val / 10) * 100;
      
      card.innerHTML = `
        <div class="matrix-label">${r.label}</div>
        <div class="matrix-value">${r.val}/10</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${pct}%;"></div>
        </div>
      `;
      matrix.appendChild(card);
    });

    // Add SRT to Core matrix card list
    if (dna.srt && dna.srt.value != null) {
      const srtCard = document.createElement('div');
      srtCard.className = 'matrix-card';
      const srtVal = dna.srt.value;
      const srtPct = Math.min(100, Math.max(0, Math.round(((srtVal - 0.6) / (1.5 - 0.6)) * 100)));
      let barColor = 'var(--accent-color)'; // default neutral
      if (dna.srt.zone === 'Buying Zone') barColor = 'var(--profit-color)';
      else if (dna.srt.zone === 'Selling Zone') barColor = 'var(--loss-color)';
      
      srtCard.innerHTML = `
        <div class="matrix-label">Speculation Territory (SRT)</div>
        <div class="matrix-value" style="color: ${barColor}">${srtVal} <span style="font-size:11px; font-weight:normal; color:var(--text-secondary);">(${dna.srt.zone})</span></div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${srtPct}%; background-color: ${barColor};"></div>
        </div>
      `;
      matrix.appendChild(srtCard);
    }

    // EMA Stats
    const maBody = document.getElementById('maStatsBody');
    maBody.innerHTML = '';
    
    const mas = dna.movingAverages.metrics;
    for (const [key, m] of Object.entries(mas)) {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
      
      const formattedKey = key.toUpperCase().replace('EMA', 'EMA ');
      const isBest = key === dna.movingAverages.bestEMA;
      
      row.innerHTML = `
        <td style="padding: 8px 0; font-weight: ${isBest ? '700' : '400'}; color: ${isBest ? 'var(--accent-color)' : 'inherit'}">
          ${formattedKey} ${isBest ? '★' : ''}
        </td>
        <td style="text-align: right; font-weight: 600;">${m.respectRatePct}%</td>
        <td style="text-align: right; color: var(--text-muted);">${m.sliceRatePct}%</td>
      `;
      maBody.appendChild(row);
    }
    
    document.getElementById('bestMAExplanation').innerHTML = `
      <strong>Best EMA: ${dna.movingAverages.bestEMA.toUpperCase()}</strong>. Price respects this moving average with a bounce reliability of <strong>${mas[dna.movingAverages.bestEMA].respectRatePct}%</strong>, making it the premier zone for pullback entries.
    `;

    // Opening & Structural behavior
    document.getElementById('statGapUpCont').textContent = `${dna.openingBehavior.gapUpContinuationPct}%`;
    document.getElementById('statGapDownRec').textContent = `${dna.openingBehavior.gapDownRecoveryPct}%`;
    document.getElementById('statOpenHigh').textContent = `${dna.openingBehavior.openEqualsHighPct}%`;
    document.getElementById('statOpenLow').textContent = `${dna.openingBehavior.openEqualsLowPct}%`;
    document.getElementById('statMarubozu').textContent = `${dna.candlePersonality.marubozuPct}%`;

    const insideEl = document.getElementById('statInsideCandles');
    if (insideEl) insideEl.textContent = `${dna.candlePersonality.insideCandlePct}%`;

    // Strategies
    const stratContainer = document.getElementById('strategiesContainer');
    stratContainer.innerHTML = '';
    
    dna.strategies.forEach(s => {
      const row = document.createElement('div');
      row.className = 'strategy-row';
      row.innerHTML = `
        <div>
          <div class="strategy-name">${s.name}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top:2px;">Backtest Horizon: 1 Year</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="strategy-rate" style="color: ${parseInt(s.winRate) > 75 ? 'var(--profit-color)' : 'inherit'}">${s.winRate} Win</span>
          <span class="confidence-tag confidence-${s.confidence}">${s.confidence}</span>
        </div>
      `;
      stratContainer.appendChild(row);
    });

    // Timeframes
    const tfStatsBody = document.getElementById('timeframeStatsBody');
    if (tfStatsBody) {
      tfStatsBody.innerHTML = '';
      if (dna.timeframeRankings) {
        dna.timeframeRankings.forEach(tf => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td style="text-align: left; padding: 6px 0;">#${tf.rank}</td>
            <td style="text-align: right; padding: 6px 0; font-weight: 600;">${tf.timeframe}</td>
          `;
          tfStatsBody.appendChild(row);
        });
      }
    }

    // Styles
    const styleStatsBody = document.getElementById('styleStatsBody');
    if (styleStatsBody) {
      styleStatsBody.innerHTML = '';
      if (dna.styleRankings) {
        dna.styleRankings.forEach(style => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td style="text-align: left; padding: 6px 0;">#${style.rank}</td>
            <td style="text-align: right; padding: 6px 0; font-weight: 600;">${style.style}</td>
          `;
          styleStatsBody.appendChild(row);
        });
      }
    }

    // Fundamentals & Risk
    document.getElementById('statMarketCap').textContent = dna.marketCapCr ? `₹ ${dna.marketCapCr.toLocaleString('en-IN')} Cr` : 'Insufficient Data';
    document.getElementById('statSector').textContent = dna.sector;
    document.getElementById('statPromoter').textContent = typeof dna.promoterHoldingPct === 'number' ? `${dna.promoterHoldingPct}%` : dna.promoterHoldingPct;
    document.getElementById('statInstitution').textContent = typeof dna.institutionHoldingPct === 'number' ? `${dna.institutionHoldingPct}%` : dna.institutionHoldingPct;
    document.getElementById('statBeta').textContent = dna.beta;
    document.getElementById('statHV').textContent = `${dna.historicalVolatilityPct}%`;
    document.getElementById('statATR').textContent = `₹ ${dna.atr}`;
    document.getElementById('statStopLoss').textContent = `${dna.riskProfile.stopLoss} (${dna.riskProfile.averageRetracementPct}% avg swing)`;
    
    // Render SRT Value and Zone
    const srtVal = dna.srt ? dna.srt.value : 'N/A';
    const srtZone = dna.srt ? dna.srt.zone : 'Insufficient Data';
    let srtColor = 'inherit';
    if (srtZone === 'Buying Zone') srtColor = 'var(--profit-color)';
    else if (srtZone === 'Selling Zone') srtColor = 'var(--loss-color)';
    
    const srtEl = document.getElementById('statSRT');
    if (srtEl) {
      srtEl.textContent = `${srtVal} (${srtZone})`;
      srtEl.style.color = srtColor;
    }

    // Populate Business & Moat Tab Content
    document.getElementById('businessModelText').textContent = dna.businessModel || 'N/A';
    document.getElementById('moatText').textContent = dna.moat || 'N/A';
    document.getElementById('specialtyText').textContent = dna.specialty || 'N/A';

    const advList = document.getElementById('advantagesList');
    advList.innerHTML = '';
    if (dna.advantages) {
      dna.advantages.forEach(a => {
        const li = document.createElement('li');
        li.textContent = a;
        advList.appendChild(li);
      });
    }

    const disList = document.getElementById('disadvantagesList');
    disList.innerHTML = '';
    if (dna.disadvantages) {
      dna.disadvantages.forEach(d => {
        const li = document.createElement('li');
        li.textContent = d;
        disList.appendChild(li);
      });
    }

    // Populate SWOT Tab Content
    const strengthsList = document.getElementById('swotStrengths');
    strengthsList.innerHTML = '';
    if (dna.swot && dna.swot.strengths) {
      dna.swot.strengths.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s;
        strengthsList.appendChild(li);
      });
    }

    const weaknessesList = document.getElementById('swotWeaknesses');
    weaknessesList.innerHTML = '';
    if (dna.swot && dna.swot.weaknesses) {
      dna.swot.weaknesses.forEach(w => {
        const li = document.createElement('li');
        li.textContent = w;
        weaknessesList.appendChild(li);
      });
    }

    const opportunitiesList = document.getElementById('swotOpportunities');
    opportunitiesList.innerHTML = '';
    if (dna.swot && dna.swot.opportunities) {
      dna.swot.opportunities.forEach(o => {
        const li = document.createElement('li');
        li.textContent = o;
        opportunitiesList.appendChild(li);
      });
    }

    const threatsList = document.getElementById('swotThreats');
    threatsList.innerHTML = '';
    if (dna.swot && dna.swot.threats) {
      dna.swot.threats.forEach(t => {
        const li = document.createElement('li');
        li.textContent = t;
        threatsList.appendChild(li);
      });
    }

    document.getElementById('financialGrowthText').textContent = dna.financialGrowth || 'N/A';
    document.getElementById('futureGrowthText').textContent = dna.futureGrowth || 'N/A';

    // Auto-fetch news if current tab is active
    if (activeInnerTab === 'news') {
      fetchNews(dna.symbol);
    }
  }

  // Compare Mode Selection
  compareStockA.addEventListener('change', async () => {
    const val = compareStockA.value;
    if (!val) {
      compareDetailsA.style.display = 'none';
      return;
    }
    
    try {
      const res = await fetch(`/api/dna?symbol=${val}`);
      const data = await res.json();
      if (data.success && data.data) {
        renderComparePanel(data.data, 'A');
      }
    } catch (e) {
      console.error(e);
    }
  });

  compareStockB.addEventListener('change', async () => {
    const val = compareStockB.value;
    if (!val) {
      compareDetailsB.style.display = 'none';
      return;
    }
    
    try {
      const res = await fetch(`/api/dna?symbol=${val}`);
      const data = await res.json();
      if (data.success && data.data) {
        renderComparePanel(data.data, 'B');
      }
    } catch (e) {
      console.error(e);
    }
  });

  function renderComparePanel(dna, slot) {
    const container = slot === 'A' ? compareDetailsA : compareDetailsB;
    container.style.display = 'block';

    const bestStrat = dna.strategies.sort((a,b) => parseInt(b.winRate) - parseInt(a.winRate))[0];
    const bestEMA = dna.movingAverages.bestEMA.toUpperCase();
    const respectRate = dna.movingAverages.metrics[dna.movingAverages.bestEMA].respectRatePct;

    container.innerHTML = `
      <div style="border-bottom: 1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">
        <h2 style="margin:0; font-size: 22px; color: var(--text-primary);">${dna.symbol}</h2>
        <span class="badge-personality" style="font-size:10px; padding:2px 6px;">${dna.personality.trendType}</span>
        <span class="badge-sector" style="font-size:10px; padding:2px 6px;">${dna.sector}</span>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: var(--text-muted); background: rgba(0,0,0,0.15); padding: 10px; border-radius: 6px;">
        ${dna.aiSummary}
      </p>

      <table class="stats-table" style="margin-top: 16px;">
        <tbody>
          <tr>
            <td>Trend Strength</td>
            <td><strong>${dna.ratings.trendStrength}/10</strong></td>
          </tr>
          <tr>
            <td>Volatility Score</td>
            <td><strong>${dna.ratings.volatility}/10</strong></td>
          </tr>
          <tr>
            <td>Pullback Reliability</td>
            <td><strong>${dna.ratings.pullbackReliability}/10</strong></td>
          </tr>
          <tr>
            <td>Breakout Success</td>
            <td><strong>${dna.ratings.breakoutSuccess}/10</strong></td>
          </tr>
          <tr>
            <td>Options Liquidity</td>
            <td><strong>${dna.ratings.optionsLiquidity}/10</strong></td>
          </tr>
          <tr>
            <td>Best EMA Bounce</td>
            <td><strong>${bestEMA} (${respectRate}%)</strong></td>
          </tr>
          <tr>
            <td>Best Strategy</td>
            <td><strong style="color: var(--profit-color)">${bestStrat.name} (${bestStrat.winRate})</strong></td>
          </tr>
          <tr>
            <td>Beta (Volatility Index)</td>
            <td><strong>${dna.beta}</strong></td>
          </tr>
          <tr>
            <td>Historical Volatility</td>
            <td><strong>${dna.historicalVolatilityPct}%</strong></td>
          </tr>
          <tr>
            <td>Avg Delivery %</td>
            <td><strong>${dna.deliveryPct || 'N/A'}%</strong></td>
          </tr>
          <tr>
            <td>Speculation Ratio Territory (SRT)</td>
            <td style="color: ${dna.srt && dna.srt.zone === 'Buying Zone' ? 'var(--profit-color)' : dna.srt && dna.srt.zone === 'Selling Zone' ? 'var(--loss-color)' : 'inherit'}">
              <strong>${dna.srt ? dna.srt.value : 'N/A'} (${dna.srt ? dna.srt.zone : 'N/A'})</strong>
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  // Database Regeneration Trigger
  btnRegen.addEventListener('click', async () => {
    btnRegen.textContent = 'Generating...';
    btnRegen.disabled = true;
    
    try {
      const res = await fetch('/api/dna/generate');
      const data = await res.json();
      alert(data.message || 'Generation started in background.');
      
      // Poll every 5 seconds to see when it finishes
      const interval = setInterval(async () => {
        const check = await fetch('/api/dna');
        const checkData = await check.json();
        if (checkData.success && checkData.data && checkData.data.length > 0) {
          clearInterval(interval);
          btnRegen.textContent = 'Regenerate Library';
          btnRegen.disabled = false;
          dnaSummaryList = checkData.data;
          renderSidebarList(dnaSummaryList);
          alert('Stock DNA Library updated successfully!');
        }
      }, 5000);
      
    } catch (e) {
      alert('Error triggering regeneration: ' + e.message);
      btnRegen.textContent = 'Regenerate Library';
      btnRegen.disabled = false;
    }
  });
  fetchSummaryList();
});
