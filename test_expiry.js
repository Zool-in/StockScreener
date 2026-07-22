const http = require('http');
http.get('http://localhost:5173/api/options/chain?symbol=NSE:NIFTY50-INDEX', (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
        try {
            const json = JSON.parse(raw);
            console.log(json.data.expiryData);
        } catch(e) {}
    });
});
