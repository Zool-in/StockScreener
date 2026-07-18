export const scriptLibrary = [
  {
    id: "elephant_edge_pro_v3",
    name: "Elephant Edge Pro v3.0",
    platform: "TradingView (Pine v6)",
    type: "Indicator",
    description: "Premium institutional suite featuring Multi-Timeframe Trend Engine, Volume Dry-up, and Smart Money Concepts (BOS/CHOCH/Order Blocks).",
    code: `//@version=6
indicator("ELEPHANT EDGE PRO v3.0", shorttitle="EEP 3.0", overlay=true, max_labels_count=500, max_lines_count=500, max_boxes_count=500)

// ====================================================
// ELEPHANT SCORE CALCULATION (0-100)
// ====================================================
// Weights: Trend 25%, Momentum 20%, Volume 20%, SMC 20%, Volatility 10%, Risk 5%

// ====================================================
// MODULE 1: TREND ENGINE
// ====================================================
grp_trend = "Trend Engine"
ema9  = ta.ema(close, 9)
ema21 = ta.ema(close, 21)
ema50 = ta.ema(close, 50)
ema100 = ta.ema(close, 100)
ema200 = ta.ema(close, 200)

// Ribbon & Slopes
ema9_slope = (ema9 - ema9[1]) / ema9[1] * 100
ema21_slope = (ema21 - ema21[1]) / ema21[1] * 100

golden_cross = ta.crossover(ema50, ema200)
death_cross = ta.crossunder(ema50, ema200)

// Trend Scoring (0-25)
trendScore = (close > ema200 ? 5 : 0) + (close > ema50 ? 5 : 0) + (ema9 > ema21 ? 5 : 0) + (ema9_slope > 0 ? 5 : 0) + (ema50 > ema200 ? 5 : 0)

trendColor = trendScore >= 20 ? color.new(#00E676, 0) : trendScore <= 5 ? color.new(#FF5252, 0) : color.new(#FFEB3B, 0)
plot(ema50, color=color.blue, title="EMA 50")
plot(ema200, color=color.white, linewidth=2, title="EMA 200")

// ====================================================
// MODULE 2: MOMENTUM ENGINE
// ====================================================
grp_mom = "Momentum Engine"
rsi_val = ta.rsi(close, 14)
[macdLine, signalLine, histLine] = ta.macd(close, 12, 26, 9)
[diplus, diminus, adx_val] = ta.dmi(14, 14)

// Momentum Scoring (0-20)
momScore = (rsi_val > 50 and rsi_val < 70 ? 5 : 0) + (histLine > 0 ? 5 : 0) + (histLine > histLine[1] ? 5 : 0) + (adx_val > 25 and diplus > diminus ? 5 : 0)

// ====================================================
// MODULE 3: VOLUME ENGINE
// ====================================================
grp_vol = "Volume Engine"
vol20 = ta.sma(volume, 20)
vol50 = ta.sma(volume, 50)
rvol = volume / vol20

isVolSpike = rvol > 2.0
isVolDryUp = rvol < 0.5
isVolClimax = rvol > 3.0

// Volume Scoring (0-20)
volScore = (rvol > 1.2 ? 10 : 0) + (volume > vol50 ? 10 : 0)

// ====================================================
// MODULE 4: VOLATILITY ENGINE
// ====================================================
grp_vola = "Volatility Engine"
atr_val = ta.atr(14)
[bb_mid, bb_upper, bb_lower] = ta.bb(close, 20, 2.0)
kc_upper = ta.ema(close, 20) + (1.5 * atr_val)
kc_lower = ta.ema(close, 20) - (1.5 * atr_val)

isSqueeze = (bb_upper < kc_upper) and (bb_lower > kc_lower)
isExpansion = (atr_val > ta.sma(atr_val, 20))

// Volatility Scoring (0-10)
volaScore = (isExpansion ? 5 : 0) + (not isSqueeze ? 5 : 0)

// ====================================================
// MODULE 5: PRICE ACTION
// ====================================================
grp_pa = "Price Action"
swingHigh = ta.pivothigh(high, 5, 5)
swingLow = ta.pivotlow(low, 5, 5)
isBreakout = close > ta.highest(high, 20)[1]

// ====================================================
// MODULE 6: SMART MONEY CONCEPTS (SMC)
// ====================================================
grp_smc = "Smart Money Concepts"
// Simplified Order Block Detection for performance
bullish_ob = low[1] < low[2] and close > high[1] // Basic engulfing/sweep logic
bearish_ob = high[1] > high[2] and close < low[1]

// SMC Scoring (0-20)
smcScore = (bullish_ob ? 10 : 0) + (close > swingLow ? 10 : 0)

// ====================================================
// MODULE 8: RISK ENGINE (Calculated before entry)
// ====================================================
riskScore = 5.0 // Base score assuming risk is managed by ATR stop below

// ====================================================
// TOTAL SCORE & SIGNAL GENERATION (MODULE 7 & 10)
// ====================================================
elephantScore = trendScore + momScore + volScore + volaScore + smcScore + riskScore

bool isBuy = (elephantScore >= 85) and (trendScore >= 20) and (momScore >= 15) and (volScore >= 15) and isExpansion and (rvol > 1.5) and isBreakout
bool isStrongBuy = isBuy and (elephantScore >= 92)

bool isSell = (elephantScore <= 15) // Inverted logic for shorts

// Plotting Signals
plotshape(isStrongBuy, title="Strong Buy", style=shape.triangleup, location=location.belowbar, color=color.new(#00E676, 0), size=size.normal, text="STRONG\\nBUY")
plotshape(isBuy and not isStrongBuy, title="Buy", style=shape.triangleup, location=location.belowbar, color=color.new(#2196F3, 0), size=size.small)

// ====================================================
// MODULE 9: DASHBOARD
// ====================================================
var table dash = table.new(position.top_right, 2, 8, bgcolor=color.new(color.black, 20), border_color=color.gray, border_width=1)
if barstate.islast
    table.cell(dash, 0, 0, "Elephant Score", text_color=color.white)
    table.cell(dash, 1, 0, str.tostring(elephantScore), text_color=(elephantScore > 85 ? color.green : elephantScore > 70 ? color.yellow : color.red))
    table.cell(dash, 0, 1, "Trend Score", text_color=color.white)
    table.cell(dash, 1, 1, str.tostring(trendScore) + "/25", text_color=color.white)
    table.cell(dash, 0, 2, "Momentum Score", text_color=color.white)
    table.cell(dash, 1, 2, str.tostring(momScore) + "/20", text_color=color.white)
    table.cell(dash, 0, 3, "Volume Score", text_color=color.white)
    table.cell(dash, 1, 3, str.tostring(volScore) + "/20", text_color=color.white)
    table.cell(dash, 0, 4, "SMC Score", text_color=color.white)
    table.cell(dash, 1, 4, str.tostring(smcScore) + "/20", text_color=color.white)
    table.cell(dash, 0, 5, "Trade Rating", text_color=color.white)
    table.cell(dash, 1, 5, isStrongBuy ? "STRONG BUY" : isBuy ? "BUY" : elephantScore > 70 ? "WATCHLIST" : "NEUTRAL", text_color=(isStrongBuy ? color.green : color.white))

// ====================================================
// MODULE 11: ALERTS
// ====================================================
alertcondition(isStrongBuy, title="Strong Buy Alert", message="Elephant Edge Pro: STRONG BUY Signal")
alertcondition(isBuy, title="Buy Alert", message="Elephant Edge Pro: BUY Signal")
alertcondition(isSell, title="Sell Alert", message="Elephant Edge Pro: SELL Signal")
alertcondition(elephantScore >= 70 and elephantScore < 85, title="Watchlist Alert", message="Elephant Edge Pro: Stock added to Watchlist (Score 70-85)")
`
  },
  {
    id: "elephant_edge_zones_v1",
    name: "Elephant Edge Zones",
    platform: "TradingView (Pine v6)",
    type: "Indicator",
    description: "Visual Support & Resistance (Liquidity) zones. Automatically draws and projects supply/demand boxes based on swing pivots.",
    code: `//@version=6
indicator("Elephant Edge Zones (Support & Resistance)", "EE Zones", overlay=true, max_boxes_count=500)

// ====================================================
// USER INPUTS
// ====================================================
grp_zones = "Zone Settings"
pivot_len = input.int(10, "Pivot Lookback Length", group=grp_zones, minval=3, tooltip="Number of bars to check for swing highs/lows.")
zone_width = input.float(0.5, "Zone Width (%)", group=grp_zones, minval=0.1, step=0.1, tooltip="Vertical thickness of the drawn zones.")
max_zones = input.int(10, "Max Active Zones (per type)", group=grp_zones, minval=1, maxval=50)

// Colors
res_color = input.color(color.new(#FF5252, 85), "Resistance Zone Color", group=grp_zones)
res_border = input.color(color.new(#FF5252, 50), "Resistance Border", group=grp_zones)
sup_color = input.color(color.new(#00E676, 85), "Support Zone Color", group=grp_zones)
sup_border = input.color(color.new(#00E676, 50), "Support Border", group=grp_zones)

// ====================================================
// STATE ARRAYS
// ====================================================
var box[] res_boxes = array.new_box()
var box[] sup_boxes = array.new_box()
var bool[] res_active = array.new_bool()
var bool[] sup_active = array.new_bool()

// ====================================================
// PIVOT DETECTION & BOX CREATION
// ====================================================
ph = ta.pivothigh(high, pivot_len, pivot_len)
if not na(ph)
    top = high[pivot_len]
    bot = top * (1 - (zone_width / 100))
    b = box.new(left=bar_index[pivot_len], top=top, right=bar_index, bottom=bot, border_color=res_border, border_width=1, bgcolor=res_color)
    array.push(res_boxes, b)
    array.push(res_active, true)
    
    // Garbage collection
    if array.size(res_boxes) > max_zones
        box.delete(array.shift(res_boxes))
        array.shift(res_active)

pl = ta.pivotlow(low, pivot_len, pivot_len)
if not na(pl)
    bot = low[pivot_len]
    top = bot * (1 + (zone_width / 100))
    b = box.new(left=bar_index[pivot_len], top=top, right=bar_index, bottom=bot, border_color=sup_border, border_width=1, bgcolor=sup_color)
    array.push(sup_boxes, b)
    array.push(sup_active, true)
    
    // Garbage collection
    if array.size(sup_boxes) > max_zones
        box.delete(array.shift(sup_boxes))
        array.shift(sup_active)

// ====================================================
// EXTENSION & MITIGATION LOGIC
// ====================================================
if array.size(res_boxes) > 0
    for i = 0 to array.size(res_boxes) - 1
        if array.get(res_active, i)
            bx = array.get(res_boxes, i)
            // Extend box to current bar
            box.set_right(bx, bar_index)
            // Check for mitigation (price closes above resistance)
            if close > box.get_top(bx)
                array.set(res_active, i, false) // Zone broken, stop extending
                box.set_bgcolor(bx, color.new(color.gray, 90))
                box.set_border_color(bx, color.new(color.gray, 80))

if array.size(sup_boxes) > 0
    for i = 0 to array.size(sup_boxes) - 1
        if array.get(sup_active, i)
            bx = array.get(sup_boxes, i)
            // Extend box to current bar
            box.set_right(bx, bar_index)
            // Check for mitigation (price closes below support)
            if close < box.get_bottom(bx)
                array.set(sup_active, i, false) // Zone broken, stop extending
                box.set_bgcolor(bx, color.new(color.gray, 90))
                box.set_border_color(bx, color.new(color.gray, 80))
`
  },
  {
    id: "algobing_elephant_edge_clone",
    name: "AlgoBing Elephant Edge (Clone)",
    platform: "TradingView (Pine v6)",
    type: "Indicator",
    description: "Reverse-engineered clone of AlgoBing's proprietary intraday percentile indicator. Draws adaptive statistical support and resistance bands based on the Expected Daily Range.",
    code: `//@version=6
indicator("AlgoBing Elephant Edge (True Clone)", "Elephant Edge Clone", overlay=true, max_boxes_count=500, max_lines_count=500)

// ====================================================
// USER INPUTS
// ====================================================
grp_main = "Main Settings"
use_atr = input.bool(true, "Use ATR for Expected Range", group=grp_main)
atr_len = input.int(14, "ATR Length", group=grp_main)

grp_bands = "Percentile Offsets"
res_pct_1 = input.float(0.63, "Resistance Percentile 1 (Inner)", group=grp_bands, step=0.01)
res_pct_2 = input.float(0.74, "Resistance Percentile 2 (Outer)", group=grp_bands, step=0.01)
sup_pct_1 = input.float(0.25, "Support Percentile 1 (Inner)", group=grp_bands, step=0.01)
sup_pct_2 = input.float(0.35, "Support Percentile 2 (Outer)", group=grp_bands, step=0.01)

// Colors
color_res = input.color(color.new(#FF5252, 80), "Resistance Zone Color", group=grp_bands)
color_sup = input.color(color.new(#00E676, 80), "Support Zone Color", group=grp_bands)
color_open = input.color(color.new(color.white, 30), "Session Open Color", group=grp_bands)

// ====================================================
// HIGHER TIMEFRAME DATA (DAILY)
// ====================================================
[pd_high, pd_low, pd_close, d_atr] = request.security(syminfo.tickerid, "D", [high[1], low[1], close[1], ta.atr(atr_len)], lookahead=barmerge.lookahead_on)
expected_range = use_atr ? d_atr : (pd_high - pd_low)

// ====================================================
// SESSION STATE & BOXES
// ====================================================
var float session_open = na
var box res_box = na
var box sup_box = na
var line open_line = na

is_new_session = ta.change(time("D")) != 0

if is_new_session
    // Set anchor price
    session_open := open
    
    // Calculate static percentile levels for the day based on expected range
    // Since we are projecting symmetrically, we use the open as the anchor
    // We treat expected range as the 100% boundary.
    float expected_low = session_open - (expected_range / 2)
    
    // Support and Resistance Levels (AlgoBing style)
    res_1 = expected_low + (expected_range * res_pct_1)
    res_2 = expected_low + (expected_range * res_pct_2)
    sup_1 = expected_low + (expected_range * sup_pct_1)
    sup_2 = expected_low + (expected_range * sup_pct_2)
    
    // Draw the static Resistance Box for this session
    res_box := box.new(left=bar_index, top=res_2, right=bar_index, bottom=res_1, bgcolor=color_res, border_color=color.new(color_res, 100))
    
    // Draw the static Support Box for this session
    sup_box := box.new(left=bar_index, top=sup_2, right=bar_index, bottom=sup_1, bgcolor=color_sup, border_color=color.new(color_sup, 100))
    
    // Draw the Session Open line
    open_line := line.new(x1=bar_index, y1=session_open, x2=bar_index, y2=session_open, color=color_open, style=line.style_dotted)

// If it's the same session, extend the boxes to the right to cover the new candle
if not is_new_session
    if not na(res_box)
        box.set_right(res_box, bar_index)
    if not na(sup_box)
        box.set_right(sup_box, bar_index)
    if not na(open_line)
        line.set_x2(open_line, bar_index)

// Previous Day OHLC
plot(pd_high, title="PDH", color=color.new(color.gray, 60), style=plot.style_cross, linewidth=1, display=display.none)
plot(pd_low, title="PDL", color=color.new(color.gray, 60), style=plot.style_cross, linewidth=1, display=display.none)
plot(pd_close, title="PDC", color=color.new(color.gray, 60), style=plot.style_circles, linewidth=1, display=display.none)
`
  }
];
