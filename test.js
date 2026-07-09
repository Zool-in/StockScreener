const dom = { style: { display: 'none' }, className: '', innerHTML: '' };
const data = { configured: true, connected: null };

if (!data.configured) return;
dom.style.display = 'block';
if (data.connected) {
  dom.className = 'kite-status kite-connected';
  dom.innerHTML = 'Fyers: connected';
} else {
  dom.className = 'kite-status kite-disconnected';
  dom.innerHTML = '<a href="/fyers/login" style="color:inherit">Connect Fyers</a>';
}
console.log(dom);
