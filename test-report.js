'use strict';

/**
 * Local test script — generates daily, weekly, and monthly report images
 * using mock data that mirrors real API response shapes.
 *
 * Usage:
 *   node test-report.js           # all three reports
 *   node test-report.js daily     # daily only
 *   node test-report.js weekly    # weekly only
 *   node test-report.js monthly   # monthly only
 */

const { generateReport, generatePeriodIds } = require('./report');
const fs   = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'opt');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const TODAY = new Date();

// Daily: last 10 days (including today)
const dailyEnd   = TODAY;
const dailyStart = addDays(TODAY, -9);

// Weekly: last 8 ISO weeks — Monday of the week 7 weeks ago → today
const dow         = TODAY.getDay() || 7;            // 1=Mon … 7=Sun
const thisMonday  = addDays(TODAY, -(dow - 1));
const weeklyStart = addDays(thisMonday, -49);        // 7 × 7 days back
const weeklyEnd   = TODAY;

// Monthly: last 6 months — 1st of month 5 months ago → today
const monthlyStart = dateStr(new Date(TODAY.getFullYear(), TODAY.getMonth() - 5, 1));
const monthlyEnd   = dateStr(TODAY);

// ─── Mock data builders ───────────────────────────────────────────────────────

function rnd(min, max)  { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rndF(min, max) { return parseFloat((Math.random() * (max - min) + min).toFixed(4)); }

function mockUserData(ids) {
  let total = rnd(300, 400);
  return ids.map(id => {
    total += rnd(5, 30);
    return {
      id,
      totalUserNum:                    total,
      newRegisterUserNum:              rnd(5, 60),
      activeUserNum:                   rnd(30, 120),
      activeUserRetentionRate1Day:     rndF(0.5, 1.0),
      activeUserRetentionRate3Day:     rndF(0.3, 0.8),
      activeUserRetentionRate7Day:     rndF(0.1, 0.5),
      newRegisterUserRetentionRate1Day: rndF(0.2, 0.7),
      newRegisterUserRetentionRate3Day: rndF(0.1, 0.5),
      newRegisterUserRetentionRate7Day: rndF(0.0, 0.3),
    };
  });
}

/** Skip ~25% of IDs to create intentional gaps, testing the fill logic. */
function mockOrderData(ids) {
  return ids.filter((_, i) => i % 4 !== 2).map(id => {
    const orderCount  = rnd(1, 20);
    const totalAmount = parseFloat((orderCount * rndF(30, 200)).toFixed(2));
    const totalBuyers = rnd(1, orderCount);
    return {
      id,
      totalAmount,
      orderCount,
      statusOkCount:          rnd(0, orderCount),
      statusRefundCount:      rnd(0, Math.floor(orderCount * 0.2)),
      uniqueSellersCount:     rnd(1, Math.min(5, orderCount)),
      totalBuyers,
      completedBuyers:        rnd(0, totalBuyers),
      repeatCompletedBuyers:  rnd(0, Math.floor(totalBuyers * 0.3)),
      avgAmountPerBuyer:      parseFloat((totalAmount / totalBuyers).toFixed(4)),
      repeatRate:             rndF(0, 0.4),
      successRate:            rndF(0.3, 1.0),
      refundRate:             rndF(0, 0.3),
      cancelRate:             rndF(0, 0.3),
      rejectRate:             rndF(0, 0.3),
    };
  });
}

/** Skip ~33% of IDs to create intentional gaps. */
function mockPlaymateData(ids) {
  let totalPM = rnd(30, 50);
  return ids.filter((_, i) => i % 3 !== 0).map(id => {
    totalPM += rnd(0, 3);
    const acceptCount      = rnd(1, Math.min(10, totalPM));
    const totalOrderAmount = parseFloat((acceptCount * rndF(20, 150)).toFixed(2));
    return {
      id,
      totalPlaymateNum:      totalPM,
      newPlaymateNum:        rnd(0, 5),
      activePlaymateNum:     rnd(1, Math.floor(totalPM * 0.3)),
      acceptOrderPlaymateNum: acceptCount,
      totalOrderAmount,
      acceptOrderRate:       rndF(0.1, 0.6),
      avgAmountAcceptOrder:  parseFloat((totalOrderAmount / acceptCount).toFixed(4)),
    };
  });
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const CASES = {
  daily: {
    label:      '日报 (last 10 days)',
    reportType: 0,
    startDay:   dateStr(dailyStart),
    endDay:     dateStr(dailyEnd),
  },
  weekly: {
    label:      '周报 (last 8 ISO weeks)',
    reportType: 1,
    startDay:   dateStr(weeklyStart),
    endDay:     dateStr(weeklyEnd),
  },
  monthly: {
    label:      '月报 (last 6 months)',
    reportType: 2,
    startDay:   monthlyStart,
    endDay:     monthlyEnd,
  },
};

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runCase(key) {
  const c = CASES[key];
  console.log(`\n[${key}] ${c.label}`);
  console.log(`  startDay=${c.startDay}  endDay=${c.endDay}`);

  // Generate the full period ID list (same logic used inside generateReport)
  const allIds = generatePeriodIds(c.reportType, c.startDay, c.endDay);
  console.log(`  periods: ${allIds.length} (${allIds[0]} … ${allIds[allIds.length - 1]})`);

  // Build mock data using the same IDs (with intentional gaps for order/playmate)
  const userData     = mockUserData(allIds);
  const orderData    = mockOrderData(allIds);
  const playmateData = mockPlaymateData(allIds);

  console.log(`  mock rows: user=${userData.length}  order=${orderData.length}  playmate=${playmateData.length}`);

  const imagePath = await generateReport({
    reportType:   c.reportType,
    startDay:     c.startDay,
    endDay:       c.endDay,
    userData,
    orderData,
    playmateData,
    outDir:       OUT_DIR,
  });

  console.log(`  saved → ${imagePath}`);
}

(async () => {
  const arg  = process.argv[2]?.toLowerCase();
  const keys = arg && CASES[arg] ? [arg] : Object.keys(CASES);

  for (const key of keys) {
    await runCase(key);
  }

  console.log('\nAll done.');
})();
