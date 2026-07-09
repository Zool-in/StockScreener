# NSE Toolkit — Swing Screener + Options Analyzer

> **How this runs: it's a Node application, not a plain HTML file.**
> Start the server with `npm start`, then open <http://localhost:5173>.
> Two tabs share one backend: **📊 Screener** (`/`) and **⚙ Options** (`/options.html`).
> Opening the HTML files directly (double-click) will **not** work for the app —
> `index.html`/`options.html` call the local server's `/api/*` endpoints.
>
> A separate **portable, no-server** copy also exists (`nse-swing-screener.html`,
> `nse-options-analyzer.html`) that runs by opening in a browser via the public
> allorigins proxy — handy with zero setup, but less reliable (Yahoo/proxy
> rate-limits). Prefer the app.

Live NSE swing-trade screener. Fetches daily OHLCV, computes technicals
(EMA 20/50/200, RSI, ADX, **MACD**, **Bollinger Bands**, ATR, volume ratio),
classifies setups (Breakout / Pullback / RS Leader), and scores each stock
0–100 with entry / stop / target levels, an **estimated days-to-target**
(ATR + ADX based), and a **risk-based position size**.

Set your **Capital** and **Risk per trade %** in the sizing bar; each card then
shows how many shares to buy so your loss-at-stop stays within that risk
(capped by available capital), with the ₹ risk and reward. Settings persist
across reloads.

## Project layout

**The application (run via `npm start`):**

| File | Purpose |
|------|---------|
| `server.js` | Zero-dependency Node server: static files + `/api/chart`, `/api/quotes`, `/api/symbols`, `/kite/*` |
| `index.html` + `technicals.js` + `styles.css` | Screener tab (`/`) |
| `options.html` | Options tab (`/options.html`) — Covered Call & Cash Secured Put, same backend |
| `btst.html` | BTST tab (`/btst.html`) — Buy-Today-Sell-Tomorrow momentum scanner (closing strength, volume surge, delivery %, breakout) |
| `bhavcopy.js` | NSE Bhavcopy (official EOD) — the default data source |
| `livequote.js` | Live price overlay (Google, or Kite when connected) |
| `kite.js` | Zerodha Kite Connect — history + real-time LTP (optional) |
| `symbols.js` | Index constituent lists (Nifty 50/100/500/all) |
| `lots.js` | Live NSE F&O lot sizes (`/api/lots`, from Kite's public NFO dump) — used by the Options tab so lot sizes never go stale |
| `kite-config.example.json` | Template for Kite credentials |

**Portable standalone copies (no server — open in a browser):**

| File | Purpose |
|------|---------|
| `nse-swing-screener.html` | Single-file screener via allorigins proxy |
| `nse-options-analyzer.html` | Single-file options analyzer via allorigins proxy |

## Run

```bash
npm start          # → http://localhost:5173
# or: node server.js
```

Open the URL, then either type NSE tickers (e.g. `RELIANCE`, `BLUESTARCO`) or
click a **Load** preset — **Nifty 50 / 100 / 500** or **All NSE** (~2,400
stocks) — and hit **Run scan**. Large scans use a bounded worker pool and only
render results at the end, so even a full-market scan stays responsive
(~1–2 min for all of NSE; a few seconds for Nifty 50).

## Data sources (in priority order)

The server tries each in turn so the app keeps working:

0. **Zerodha Kite** — used first when configured and connected (see below).
1. **NSE official Bhavcopy** (`bhavcopy.js`) — **the default.** Free, official
   end-of-day OHLCV for every NSE stock, downloaded from `nsearchives.nseindia.com`
   and cached in `.cache/bhav/`. This is the same data commercial screeners'
   vendors resell, and it works even from IPs that Yahoo/NSE-web block.
2. **Yahoo Finance (direct)** — session cookie + crumb; works from un-blocked IPs.
3. **Public proxies** — allorigins / codetabs fetch Yahoo from their own IPs.
4. **Disk cache** (`.cache/`) — last good copy, served if all live paths fail.

> Bhavcopy is **end-of-day** (published ~6–7 pm IST after close), which is
> exactly right for a daily/swing screener. Prices are unadjusted for
> splits/bonuses. The first scan downloads ~90 daily files (a few seconds);
> after that they're cached and re-scans are instant.

### Live price overlay

Because Bhavcopy is EOD, during market hours the last candle is the *previous*
close. Toggle **Live prices** (on by default, `livequote.js`) to overlay a
fresher last-traded price from Google Finance on the displayed price and trade
math (entry/stop/target, days-to-target, position size). The **indicators stay
on completed daily candles** (correct). Google's NSE quotes are delayed
~15 min; for tick-real-time, connect Kite. Auto-overlay is skipped for scans
larger than 150 stocks — filter down first.

## Optional: Zerodha Kite (recommended for reliability)

Kite Connect is a paid Zerodha subscription; historical data is included.

1. Create an app at <https://developers.kite.trade/apps>.
2. Set the app's **Redirect URL** to exactly:
   `http://127.0.0.1:5173/kite/callback`
3. Provide credentials either way:
   - copy `kite-config.example.json` → `kite-config.json` and fill in
     `api_key` / `api_secret`, **or**
   - export `KITE_API_KEY` and `KITE_API_SECRET` in your shell.
4. Run on the matching port: `PORT=5173 npm start`
   (the redirect URL and port must agree).
5. Open the app — a **Connect Kite** badge appears in the header. Click it,
   log in, done. Access tokens expire daily (~6 am IST); just click again.

When Kite is connected, cards are sourced live from your broker and labelled
"Zerodha Kite".

## Disclaimer

Scores are algorithmic, **not financial advice**. Educational/research use only.
Always verify at Screener.in or TradingView before trading.
