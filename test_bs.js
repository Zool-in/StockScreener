import { computeIV, bsGreeks } from './js/core/math.js';
const T = 3.0 / 365.0; 
const R = 0.10;
const S = 24000;
const K = 24000;
const targetPrice = 176.65;
const iv = computeIV(targetPrice, S, K, T, R, 'CE');
const greeks = bsGreeks(S, K, T, R, iv, 'CE');
console.log("IV:", iv, "Greeks:", greeks);
