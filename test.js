    const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    const fmtWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
    
    let rawData = [];
    let currentSort = { col: 'value', asc: false };

    async function init() {
      try {
        // 1. Fetch Lots
        const lotRes = await fetch('/api/lots');
        const lotJson = await lotRes.json();
        const lots = lotJson.lots || {};
        const symbols = Object.keys(lots);
        
        if (symbols.length === 0) {
          document.getElementById('loadingText').innerText = 'No F&O lots found.';
          return;
        }

        document.getElementById('loadingText').innerText = `Fetching quotes for ${symbols.length} symbols...`;

        // 2. Fetch Quotes (chunked if necessary, but /api/quotes can usually handle 200)
        const quoteRes = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
        const quoteJson = await quoteRes.json();
        
        // 3. Assemble Data
        rawData = symbols.map(sym => {
          const price = quoteJson.quotes?.[sym] || 0;
          const lot = lots[sym];
          return {
            symbol: sym,
            price: price,
            lot: lot,
            value: price * lot
          };
        });

        // 4. Initial Render
        renderTable();
        
      } catch (err) {
        console.error(err);
        document.getElementById('loadingText').innerText = 'Error loading data: ' + err.message;
      }
    }

    function renderTable() {
      const q = document.getElementById('searchInput').value.trim().toLowerCase();
      
      // Filter
      let viewData = rawData.filter(d => d.symbol.toLowerCase().includes(q));
      
      // Sort
      viewData.sort((a, b) => {
        let valA = a[currentSort.col];
        let valB = b[currentSort.col];
        if (typeof valA === 'string') {
          return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return currentSort.asc ? (valA - valB) : (valB - valA);
      });

      // Update DOM
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = viewData.map(d => `
        <tr>
          <td class="sym-name">${d.symbol}</td>
          <td class="numeric">${d.price > 0 ? fmt.format(d.price) : '—'}</td>
          <td class="numeric">${fmtWhole.format(d.lot)}</td>
          <td class="numeric" style="color: ${d.value > 1000000 ? 'var(--brand)' : 'inherit'}">${d.value > 0 ? fmtWhole.format(d.value) : '—'}</td>
        </tr>
      `).join('');
      
      if (viewData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading-state">No matching symbols found.</td></tr>`;
      }
      
      // Update Sort Icons
      document.querySelectorAll('th').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        if (th.dataset.sort === currentSort.col) {
          icon.innerHTML = currentSort.asc ? '&#9650;' : '&#9660;';
        } else {
          icon.innerHTML = '';
        }
      });
    }

    // Events
    document.getElementById('searchInput').addEventListener('input', renderTable);
    
    document.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (currentSort.col === col) {
          currentSort.asc = !currentSort.asc;
        } else {
          currentSort.col = col;
          currentSort.asc = (col === 'symbol'); // Default to ASC for strings, DESC for numbers
        }
        renderTable();
      });
    });

    init();
