#!/usr/bin/env python3
import sys
import os
import json
import urllib.request
import urllib.error

# Paths
ENV_FILE = '/Volumes/Workspace/Projects/2026/StockScan/.env'
SESSION_FILE = '/Volumes/Workspace/Projects/2026/StockScan/fyers.session.json'
LOG_FILE = '/Volumes/Workspace/Projects/2026/StockScan/scripts/order_execution.log'

def log_message(msg):
    print(msg)
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, 'a') as f:
            f.write(msg + '\n')
    except Exception as e:
        print(f"Failed to write to log file: {e}")

def load_env():
    env = {}
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        parts = line.split('=', 1)
                        if len(parts) == 2:
                            env[parts[0].strip()] = parts[1].strip()
        except Exception as e:
            log_message(f"[ERROR] Failed to read .env: {e}")
    return env

def load_session():
    if os.path.exists(SESSION_FILE):
        try:
            with open(SESSION_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            log_message(f"[ERROR] Failed to read session file: {e}")
    return None

def get_trade_side(strategy_id):
    strategy_id = strategy_id.lower()
    buy_strats = ['hm_bottom', 'hm_bullish', 'ohl_bullish', 'elephant_bullish', 'gap_momentum', 'mast_breakout', 'mast_dip', 'smc_bullish', 'ha_donchian_bullish', 'xtrender_bullish']
    sell_strats = ['hm_top', 'hm_bearish', 'ohl_bearish', 'elephant_bearish', 'mast_breakdown', 'mast_rally_short', 'smc_bearish', 'ha_donchian_bearish', 'xtrender_bearish']
    
    if any(b in strategy_id for b in buy_strats):
        return 1  # BUY
    elif any(s in strategy_id for s in sell_strats):
        return -1 # SELL
    return 0      # Neutral / Skip

def execute_trade(symbol, strategy_id, price, qty=1):
    log_message(f"\n--- New Trade Request: {symbol} | Strategy: {strategy_id} | Price: {price} ---")
    
    side = get_trade_side(strategy_id)
    if side == 0:
        log_message(f"[SKIP] Strategy {strategy_id} does not map to BUY or SELL side. Skipping execution.")
        return False

    env = load_env()
    session = load_session()
    
    app_id = env.get('FYERS_APP_ID')
    access_token = session.get('access_token') if session else None
    
    if not app_id or not access_token:
        log_message("[ERROR] Fyers credentials or session token missing. Please login via browser callback.")
        return False
        
    # Format Fyers Symbol (e.g. NSE:RELIANCE-EQ)
    fyers_symbol = symbol.upper()
    if not fyers_symbol.startswith("NSE:") and not fyers_symbol.endswith("-EQ"):
        fyers_symbol = f"NSE:{fyers_symbol}-EQ"

    # API Request configuration
    url = "https://api-t1.fyers.in/api/v3/orders/sync"
    headers = {
        "Authorization": f"{app_id}:{access_token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "symbol": fyers_symbol,
        "qty": int(qty),
        "side": side,
        "type": 2,                # Market Order
        "productType": "INTRADAY", # Intraday (MIS)
        "limitPrice": 0,
        "stopPrice": 0,
        "validity": "DAY",
        "disclosedQty": 0,
        "offlineOrder": False,
        "stopLoss": 0,
        "takeProfit": 0
    }
    
    side_str = "BUY" if side == 1 else "SELL"
    log_message(f"[INFO] Dispatching {side_str} order for {qty} share(s) of {fyers_symbol} via Fyers API...")
    
    try:
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode('utf-8')
            res_data = json.loads(res_body)
            
            if response.status == 200 and res_data.get('s') == 'ok':
                order_id = res_data.get('id')
                log_message(f"[SUCCESS] Order Executed Successfully! Order ID: {order_id}")
                return True
            else:
                msg = res_data.get('message', 'Unknown Fyers error')
                log_message(f"[FAILURE] Order Rejected by Fyers: {msg} (Payload: {res_data})")
                return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        log_message(f"[ERROR] HTTP Request failed with code {e.code}: {err_body}")
        return False
    except Exception as e:
        log_message(f"[ERROR] Request failed: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        log_message("[USAGE] python3 execute_order.py <ticker> <strategy_id> <price> [qty]")
        sys.exit(1)
        
    ticker = sys.argv[1]
    strat = sys.argv[2]
    pr = sys.argv[3]
    quantity = sys.argv[4] if len(sys.argv) > 4 else 1
    
    success = execute_trade(ticker, strat, pr, quantity)
    sys.exit(0 if success else 1)
