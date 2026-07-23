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

function isAvailable() {
  return isConfigured && pool !== null;
}

module.exports = {
  initPool,
  initDb,
  isAvailable,
  getPool: () => pool
};
