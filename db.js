// ─── Hostinger MySQL Database Module ──────────────────────────────────────────
const mysql = require('mysql2/promise');

let pool = null;
let isConfigured = false;

function initPool() {
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const password = process.env.DB_PASS || process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const port = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306');

  if (!host || !user || !database) {
    console.log('[MySQL] Database credentials not set in .env. Running in Memory/Live API mode.');
    return null;
  }

  try {
    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000
    });
    isConfigured = true;
    console.log(`[MySQL] Initialized pool for ${user}@${host}/${database}`);
    return pool;
  } catch (err) {
    console.error('[MySQL] Pool initialization failed:', err.message);
    return null;
  }
}

async function initDb() {
  if (!pool) initPool();
  if (!pool) return false;

  try {
    const conn = await pool.getConnection();
    console.log('[MySQL] Connected successfully to Hostinger MySQL Database!');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS stock_screeners (
        ticker VARCHAR(30) PRIMARY KEY,
        timeframe VARCHAR(10) DEFAULT '1d',
        cmp DECIMAL(10,2),
        chg_pct DECIMAL(5,2),
        rsi14 DECIMAL(5,2),
        adx14 DECIMAL(5,2),
        vr DECIMAL(5,2),
        ema20 DECIMAL(10,2),
        ema50 DECIMAL(10,2),
        ema200 DECIMAL(10,2),
        macd_val DECIMAL(10,2),
        macd_hist DECIMAL(10,2),
        cci_val DECIMAL(10,2),
        
        -- Strategy match flags
        ohl_bullish TINYINT DEFAULT 0,
        ohl_bearish TINYINT DEFAULT 0,
        minervini TINYINT DEFAULT 0,
        darvas TINYINT DEFAULT 0,
        xmomentum TINYINT DEFAULT 0,
        rs TINYINT DEFAULT 0,
        vcp_down TINYINT DEFAULT 0,
        smc_bullish TINYINT DEFAULT 0,
        smc_bearish TINYINT DEFAULT 0,
        ha_donchian_bullish TINYINT DEFAULT 0,
        ha_donchian_bearish TINYINT DEFAULT 0,
        hm_bullish TINYINT DEFAULT 0,
        hm_bearish TINYINT DEFAULT 0,
        hm_bottom TINYINT DEFAULT 0,
        hm_top TINYINT DEFAULT 0,
        btst TINYINT DEFAULT 0,
        
        meta_json JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_ohl_bullish (ohl_bullish),
        INDEX idx_ohl_bearish (ohl_bearish),
        INDEX idx_minervini (minervini),
        INDEX idx_smc_bullish (smc_bullish),
        INDEX idx_smc_bearish (smc_bearish)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    conn.release();
    console.log('[MySQL] Schema verified & ready.');
    return true;
  } catch (err) {
    console.error('[MySQL] Connection or Schema creation error:', err.message);
    return false;
  }
}

async function upsertStock(record) {
  if (!pool) return false;
  try {
    const sql = `
      INSERT INTO stock_screeners (
        ticker, timeframe, cmp, chg_pct, rsi14, adx14, vr, ema20, ema50, ema200, macd_val, macd_hist, cci_val,
        ohl_bullish, ohl_bearish, minervini, darvas, xmomentum, rs, vcp_down, smc_bullish, smc_bearish,
        ha_donchian_bullish, ha_donchian_bearish, hm_bullish, hm_bearish, hm_bottom, hm_top, btst, meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        cmp=VALUES(cmp), chg_pct=VALUES(chg_pct), rsi14=VALUES(rsi14), adx14=VALUES(adx14), vr=VALUES(vr),
        ema20=VALUES(ema20), ema50=VALUES(ema50), ema200=VALUES(ema200), macd_val=VALUES(macd_val),
        macd_hist=VALUES(macd_hist), cci_val=VALUES(cci_val), ohl_bullish=VALUES(ohl_bullish),
        ohl_bearish=VALUES(ohl_bearish), minervini=VALUES(minervini), darvas=VALUES(darvas),
        xmomentum=VALUES(xmomentum), rs=VALUES(rs), vcp_down=VALUES(vcp_down), smc_bullish=VALUES(smc_bullish),
        smc_bearish=VALUES(smc_bearish), ha_donchian_bullish=VALUES(ha_donchian_bullish),
        ha_donchian_bearish=VALUES(ha_donchian_bearish), hm_bullish=VALUES(hm_bullish),
        hm_bearish=VALUES(hm_bearish), hm_bottom=VALUES(hm_bottom), hm_top=VALUES(hm_top),
        btst=VALUES(btst), meta_json=VALUES(meta_json), updated_at=CURRENT_TIMESTAMP;
    `;
    const params = [
      record.ticker, record.timeframe || '1d', record.cmp || 0, record.chg_pct || 0,
      record.rsi14 || 0, record.adx14 || 0, record.vr || 0, record.ema20 || 0, record.ema50 || 0, record.ema200 || 0,
      record.macd_val || 0, record.macd_hist || 0, record.cci_val || 0,
      record.ohl_bullish ? 1 : 0, record.ohl_bearish ? 1 : 0, record.minervini ? 1 : 0, record.darvas ? 1 : 0,
      record.xmomentum ? 1 : 0, record.rs ? 1 : 0, record.vcp_down ? 1 : 0, record.smc_bullish ? 1 : 0,
      record.smc_bearish ? 1 : 0, record.ha_donchian_bullish ? 1 : 0, record.ha_donchian_bearish ? 1 : 0,
      record.hm_bullish ? 1 : 0, record.hm_bearish ? 1 : 0, record.hm_bottom ? 1 : 0, record.hm_top ? 1 : 0,
      record.btst ? 1 : 0, JSON.stringify(record.meta_json || {})
    ];
    await pool.query(sql, params);
    return true;
  } catch (err) {
    console.error(`[MySQL] Error upserting ${record.ticker}:`, err.message);
    return false;
  }
}

async function queryStrategy(strategyId) {
  if (!pool) return [];
  const colMap = {
    ohl_bullish: 'ohl_bullish',
    ohl_bearish: 'ohl_bearish',
    minervini: 'minervini',
    darvas: 'darvas',
    xmomentum: 'xmomentum',
    rs: 'rs',
    vcp_down: 'vcp_down',
    smc_bullish: 'smc_bullish',
    smc_bearish: 'smc_bearish',
    ha_donchian_bullish: 'ha_donchian_bullish',
    ha_donchian_bearish: 'ha_donchian_bearish',
    hm_bullish: 'hm_bullish',
    hm_bearish: 'hm_bearish',
    hm_bottom: 'hm_bottom',
    hm_top: 'hm_top',
    btst: 'btst'
  };

  const col = colMap[strategyId];
  let sql = 'SELECT * FROM stock_screeners';
  if (col) {
    sql += ` WHERE ${col} = 1`;
  }
  sql += ' ORDER BY chg_pct DESC';

  try {
    const [rows] = await pool.query(sql);
    return rows;
  } catch (err) {
    console.error('[MySQL] Query error:', err.message);
    return [];
  }
}

module.exports = {
  initPool,
  initDb,
  isAvailable,
  upsertStock,
  queryStrategy,
  getPool: () => pool
};
