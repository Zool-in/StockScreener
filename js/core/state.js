// ─── Global State Management ────────────────────────────────────────────────
export const AppState = {
  capital: 100000,
  timeframe: '1d',
  strategy: 'squeeze', // default
  tickers: [],
  isScanning: false,
  results: [],

  setCapital(c) {
    this.capital = Number(c) || 100000;
    this.notify();
  },
  setTimeframe(tf) {
    this.timeframe = tf;
    this.notify();
  },
  setStrategy(strat) {
    this.strategy = strat;
    this.notify();
  },
  setTickers(list) {
    this.tickers = list;
    this.notify();
  },
  setScanning(status) {
    this.isScanning = status;
    this.notify();
  },
  setResults(res) {
    this.results = res;
    this.notify();
  },

  listeners: [],
  subscribe(fn) {
    this.listeners.push(fn);
  },
  notify() {
    for (let fn of this.listeners) {
      fn(this);
    }
  }
};
