'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPORT_TYPE_LABELS = { 0: '日报', 1: '周报', 2: '月报' };

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Display value in table: null → '-', number → formatted string */
function num(val) {
  if (val == null || val === '') return '-';
  const n = Number(val);
  if (isNaN(n)) return '-';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/** Display percentage in table: null → '-', 0.753 → "75.30%" */
function pct(val) {
  if (val == null || isNaN(val)) return '-';
  return (val * 100).toFixed(2) + '%';
}

/** Chart numeric value: null → null (ECharts renders a gap), number → rounded */
function cv(val, decimals = 2) {
  if (val == null) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  return decimals === 0 ? n : Number(n.toFixed(decimals));
}

/** Chart percentage value (×100): null → null */
function cpct(val) {
  if (val == null) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  return Number((n * 100).toFixed(2));
}

// ─── Period generation & data alignment ──────────────────────────────────────

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * ISO 8601 week: week starts Monday, W01 is the week containing the first Thursday.
 * Returns { year, week } where year may differ from the calendar year at boundaries.
 */
function isoWeekOf(date) {
  // Work in UTC to avoid DST shifts
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = d.getUTCDay() || 7; // 1=Mon … 7=Sun
  d.setUTCDate(d.getUTCDate() + 4 - dow); // shift to Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function isoWeekId(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Generate the complete ordered list of period IDs between startDay and endDay.
 * type 0 → 'yyyy-MM-dd', type 1 → 'yyyy-Www' (ISO 8601), type 2 → 'yyyy-MM'
 */
function generatePeriodIds(reportType, startDay, endDay) {
  const ids = [];

  if (reportType === 0) {
    // Daily
    let cur = parseLocalDate(startDay);
    const end = parseLocalDate(endDay);
    while (cur <= end) {
      ids.push(formatDate(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
  } else if (reportType === 1) {
    // Weekly (ISO 8601) — advance Monday-by-Monday
    let cur = parseLocalDate(startDay);
    const end = parseLocalDate(endDay);
    // Rewind to Monday of the startDay's ISO week
    const dow = cur.getDay() || 7; // 1=Mon … 7=Sun
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - (dow - 1));

    const seen = new Set();
    while (cur <= end) {
      const { year, week } = isoWeekOf(cur);
      const id = isoWeekId(year, week);
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    }
  } else {
    // Monthly
    let [sy, sm] = startDay.split('-').map(Number);
    const [ey, em] = endDay.split('-').map(Number);
    while (sy < ey || (sy === ey && sm <= em)) {
      ids.push(`${sy}-${String(sm).padStart(2, '0')}`);
      sm++;
      if (sm > 12) { sm = 1; sy++; }
    }
  }

  return ids;
}

const EMPTY_USER = {
  totalUserNum: null, newRegisterUserNum: null, activeUserNum: null,
  activeUserRetentionRate1Day: null, activeUserRetentionRate3Day: null, activeUserRetentionRate7Day: null,
  newRegisterUserRetentionRate1Day: null, newRegisterUserRetentionRate3Day: null, newRegisterUserRetentionRate7Day: null,
};
const EMPTY_ORDER = {
  totalAmount: null, orderCount: null, statusOkCount: null, statusRefundCount: null,
  uniqueSellersCount: null, totalBuyers: null, completedBuyers: null, repeatCompletedBuyers: null,
  avgAmountPerBuyer: null, repeatRate: null, successRate: null, refundRate: null, cancelRate: null, rejectRate: null,
};
const EMPTY_PLAYMATE = {
  totalPlaymateNum: null, newPlaymateNum: null, activePlaymateNum: null,
  acceptOrderPlaymateNum: null, totalOrderAmount: null, acceptOrderRate: null, avgAmountAcceptOrder: null,
};

/**
 * Align a dataset to allIds: fill missing periods with null-valued records,
 * and return records in the same order as allIds (ascending time).
 */
function alignToIds(data, allIds, emptyTemplate) {
  const map = new Map(data.map(r => [r.id, r]));
  return allIds.map(id => map.has(id) ? map.get(id) : { ...emptyTemplate, id });
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml({ reportType, startDay, endDay, userData, orderData, playmateData, allIds }) {
  const typeLabel = REPORT_TYPE_LABELS[reportType] ?? '报表';

  const userRows = userData.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${num(r.totalUserNum)}</td>
      <td>${num(r.newRegisterUserNum)}</td>
      <td>${num(r.activeUserNum)}</td>
      <td>${pct(r.activeUserRetentionRate1Day)}</td>
      <td>${pct(r.activeUserRetentionRate3Day)}</td>
      <td>${pct(r.activeUserRetentionRate7Day)}</td>
      <td>${pct(r.newRegisterUserRetentionRate1Day)}</td>
      <td>${pct(r.newRegisterUserRetentionRate3Day)}</td>
      <td>${pct(r.newRegisterUserRetentionRate7Day)}</td>
    </tr>`).join('');

  const orderRows = orderData.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${num(r.totalAmount)}</td>
      <td>${num(r.orderCount)}</td>
      <td>${num(r.statusOkCount)}</td>
      <td>${num(r.statusRefundCount)}</td>
      <td>${num(r.uniqueSellersCount)}</td>
      <td>${num(r.totalBuyers)}</td>
      <td>${num(r.completedBuyers)}</td>
      <td>${num(r.repeatCompletedBuyers)}</td>
      <td>${num(r.avgAmountPerBuyer)}</td>
      <td>${pct(r.repeatRate)}</td>
      <td>${pct(r.successRate)}</td>
      <td>${pct(r.refundRate)}</td>
      <td>${pct(r.cancelRate)}</td>
      <td>${pct(r.rejectRate)}</td>
    </tr>`).join('');

  const playmateRows = playmateData.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${num(r.totalPlaymateNum)}</td>
      <td>${num(r.newPlaymateNum)}</td>
      <td>${num(r.activePlaymateNum)}</td>
      <td>${num(r.acceptOrderPlaymateNum)}</td>
      <td>${num(r.totalOrderAmount)}</td>
      <td>${pct(r.acceptOrderRate)}</td>
      <td>${num(r.avgAmountAcceptOrder)}</td>
    </tr>`).join('');

  // Chart series — null values render as gaps in ECharts line/bar charts
  const xData              = JSON.stringify(allIds);
  const orderAmtSeries     = JSON.stringify(orderData.map(r => cv(r.totalAmount)));
  const avgAmtSeries       = JSON.stringify(orderData.map(r => cv(r.avgAmountPerBuyer)));
  const totalBuyersSeries  = JSON.stringify(orderData.map(r => cv(r.totalBuyers, 0)));
  const repeatRateSeries   = JSON.stringify(orderData.map(r => cpct(r.repeatRate)));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: 32px 40px;
      background: #f0f2f5;
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #333;
      font-size: 13px;
    }
    .report-header {
      background: linear-gradient(135deg, #1a73e8, #0d47a1);
      color: #fff;
      border-radius: 10px;
      padding: 24px 32px;
      margin-bottom: 28px;
    }
    .report-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .report-header .subtitle { font-size: 13px; opacity: 0.85; }
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #1a73e8;
      border-left: 4px solid #1a73e8;
      padding-left: 12px;
      margin-bottom: 12px;
    }
    .table-wrap { overflow-x: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); background: #fff; }
    table { width: max-content; min-width: 100%; border-collapse: collapse; background: #fff; font-size: 12px; }
    thead th {
      background: #1a73e8; color: #fff;
      padding: 10px 12px; border: 1px solid #1558b0;
      white-space: nowrap; font-weight: 600;
    }
    tbody td {
      padding: 9px 12px; border: 1px solid #e8eaed;
      text-align: center; white-space: nowrap;
    }
    tbody tr:nth-child(even) td { background: #f8f9ff; }
    tbody tr:hover td { background: #e8f0fe; }
    .charts-grid {
      display: flex; flex-direction: column;
      gap: 30px; margin-bottom: 28px;
    }
    .chart-card {
      background: #fff; border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 20px;
      box-sizing: border-box;
    }
    .chart-box { width: 100%; height: 400px; }
    .footer { text-align: center; color: #999; font-size: 11px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>Gami 平台${typeLabel} · 数据报表</h1>
    <div class="subtitle">统计区间：${startDay} ～ ${endDay} &nbsp;|&nbsp; 生成时间：${new Date().toLocaleString('zh-CN')}</div>
  </div>

  <div class="charts-grid">
    <div class="chart-card"><div id="chart1" class="chart-box"></div></div>
    <div class="chart-card"><div id="chart2" class="chart-box"></div></div>
  </div>

  <div class="section">
    <div class="section-title">用户数据</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>日期</th><th>总用户数</th><th>新注册用户</th><th>活跃用户</th>
          <th>活跃次日留存</th><th>活跃3日留存</th><th>活跃7日留存</th>
          <th>新用户次日留存</th><th>新用户3日留存</th><th>新用户7日留存</th>
        </tr></thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">订单数据</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>日期</th><th>订单总金额</th><th>总订单数</th><th>已完成</th><th>退款/取消</th>
          <th>接单陪玩(去重)</th><th>下单用户(去重)</th><th>有完成订单用户</th><th>复购用户</th>
          <th>人均下单金额</th><th>复购率</th><th>成单率</th><th>退款率</th><th>取消率</th><th>拒绝率</th>
        </tr></thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">陪玩师数据</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>日期</th><th>陪玩师总数</th><th>新增陪玩师</th><th>活跃陪玩师</th>
          <th>接单陪玩师</th><th>总订单金额</th><th>接单率</th><th>人均接单金额</th>
        </tr></thead>
        <tbody>${playmateRows}</tbody>
      </table>
    </div>
  </div>

  <div class="footer">由 Gami Report Plugin (OpenClaw) 自动生成</div>

  <script>
    const xData = ${xData};

    const chart1 = echarts.init(document.getElementById('chart1'));
    chart1.setOption({
      title: { text: '下单金额情况', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { data: ['订单金额', '人均下单金额'], bottom: 0 },
      grid: { top: 60, bottom: 60 },
      xAxis: { type: 'category', data: xData },
      yAxis: [
        { type: 'value', name: '金额', axisLabel: { formatter: '¥{value}' } },
        { type: 'value', name: '人均', axisLabel: { formatter: '¥{value}' } }
      ],
      series: [
        { name: '订单金额', type: 'bar', data: ${orderAmtSeries}, itemStyle: { color: '#007bff' }, label: { show: true, position: 'top', formatter: '¥{c}' } },
        { name: '人均下单金额', type: 'line', yAxisIndex: 1, data: ${avgAmtSeries}, itemStyle: { color: '#ff7f50' }, symbolSize: 8, lineStyle: { width: 3 }, label: { show: true, position: 'bottom', formatter: '¥{c}' } }
      ]
    });

    const chart2 = echarts.init(document.getElementById('chart2'));
    chart2.setOption({
      title: { text: '下单用户情况', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { data: ['下单用户数', '复购率'], bottom: 0 },
      grid: { top: 60, bottom: 60 },
      xAxis: { type: 'category', data: xData },
      yAxis: [
        { type: 'value', name: '人数' },
        { type: 'value', name: '率', axisLabel: { formatter: '{value}%' } }
      ],
      series: [
        { name: '下单用户数', type: 'bar', data: ${totalBuyersSeries}, itemStyle: { color: '#28a745' }, label: { show: true, position: 'top' } },
        { name: '复购率', type: 'line', yAxisIndex: 1, data: ${repeatRateSeries}, itemStyle: { color: '#dc3545' }, symbolSize: 8, lineStyle: { width: 3 }, label: { show: true, position: 'right', formatter: '{c}%' } }
      ]
    });
  </script>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a report image from the provided raw API data.
 * @returns {Promise<string>} Absolute path to the generated PNG
 */
async function generateReport({ reportType, startDay, endDay, userData, orderData, playmateData, outDir: customOutDir }) {
  // 1. Build complete ascending period list
  const allIds = generatePeriodIds(reportType, startDay, endDay);

  // 2. Align each dataset: fill gaps with null-valued records, sort ascending
  const filledUser     = alignToIds(userData,     allIds, EMPTY_USER);
  const filledOrder    = alignToIds(orderData,    allIds, EMPTY_ORDER);
  const filledPlaymate = alignToIds(playmateData, allIds, EMPTY_PLAYMATE);

  const html = buildHtml({
    reportType, startDay, endDay,
    allIds,
    userData:     filledUser,
    orderData:    filledOrder,
    playmateData: filledPlaymate,
  });

  const outDir = customOutDir ?? path.join(os.homedir(), '.openclaw', 'media', 'outbound', 'group-default');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `gami-report-${Date.now()}.png`);

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1300, height: 1300 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2500));
    await page.screenshot({ path: outPath, fullPage: true });
  } finally {
    await browser.close();
  }

  return outPath;
}

module.exports = { generateReport, generatePeriodIds };
