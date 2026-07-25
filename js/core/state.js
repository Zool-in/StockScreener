// ─── Global State Management ────────────────────────────────────────────────
export const AppState = {
  capital: 100000,
  timeframe: '1d',
  strategy: 'squeeze', // default
  tickers: [],
  isScanning: false,
  results: [],

  tunerParams: {
    useSt: true,
    stPeriod: 10,
    stMult: 3.0,
    useRsi: true,
    rsiThreshold: 70,
    rsiFreshCross: false,
    useVol: true,
    minVolRatio: 1.5,
    useSma10: true,
    useMacd: false
  },
  setTunerParam(key, val) {
    this.tunerParams[key] = val;
    this.notify();
  },

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
