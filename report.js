'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPORT_TYPE_LABELS = { 0: '日报', 1: '周报', 2: '月报' };

/**
 * Format a decimal as percentage string, e.g. 0.753 -> "75.30%"
 */
function pct(val) {
  if (val == null || isNaN(val)) return '-';
  return (val * 100).toFixed(2) + '%';
}

/**
 * Format a number, rounding to 2 decimal places if needed.
 */
function num(val) {
  if (val == null || val === '') return '-';
  const n = Number(val);
  if (isNaN(n)) return '-';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/**
 * Build the HTML content for the report.
 * @param {object} params
 * @param {number} params.reportType  0=daily, 1=weekly, 2=monthly
 * @param {string} params.startDay
 * @param {string} params.endDay
 * @param {Array}  params.userData
 * @param {Array}  params.orderData
 * @param {Array}  params.playmateData
 */
function buildHtml({ reportType, startDay, endDay, userData, orderData, playmateData }) {
  const typeLabel = REPORT_TYPE_LABELS[reportType] ?? '报表';
  const ids = userData.map(r => JSON.stringify(r.id));

  const userRows = userData.map(r => `
    <tr>
      <td>${r.id ?? '-'}</td>
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
      <td>${r.id ?? '-'}</td>
      <td>¥${num(r.totalAmount)}</td>
      <td>${num(r.orderCount)}</td>
      <td>${num(r.statusOkCount)}</td>
      <td>${num(r.statusRefundCount)}</td>
      <td>${num(r.uniqueSellersCount)}</td>
      <td>${num(r.totalBuyers)}</td>
      <td>${num(r.completedBuyers)}</td>
      <td>${num(r.repeatCompletedBuyers)}</td>
      <td>¥${num(r.avgAmountPerBuyer)}</td>
      <td>${pct(r.repeatRate)}</td>
      <td>${pct(r.successRate)}</td>
      <td>${pct(r.refundRate)}</td>
    </tr>`).join('');

  const playmateRows = playmateData.map(r => `
    <tr>
      <td>${r.id ?? '-'}</td>
      <td>${num(r.totalPlaymateNum)}</td>
      <td>${num(r.newPlaymateNum)}</td>
      <td>${num(r.activePlaymateNum)}</td>
      <td>${num(r.acceptOrderPlaymateNum)}</td>
      <td>¥${num(r.totalOrderAmount)}</td>
      <td>${pct(r.acceptOrderRate)}</td>
      <td>¥${num(r.avgAmountAcceptOrder)}</td>
    </tr>`).join('');

  // ECharts series data
  const chartIds = JSON.stringify(userData.map(r => r.id ?? ''));
  const totalUserData = JSON.stringify(userData.map(r => r.totalUserNum ?? 0));
  const newUserData = JSON.stringify(userData.map(r => r.newRegisterUserNum ?? 0));
  const activeUserData = JSON.stringify(userData.map(r => r.activeUserNum ?? 0));
  const orderAmountData = JSON.stringify(orderData.map(r => Number((r.totalAmount ?? 0).toFixed(2))));
  const orderCountData = JSON.stringify(orderData.map(r => r.orderCount ?? 0));
  const avgAmountData = JSON.stringify(orderData.map(r => Number((r.avgAmountPerBuyer ?? 0).toFixed(2))));
  const repeatRateData = JSON.stringify(orderData.map(r => Number(((r.repeatRate ?? 0) * 100).toFixed(2))));
  const totalPlaymateData = JSON.stringify(playmateData.map(r => r.totalPlaymateNum ?? 0));
  const acceptRateData = JSON.stringify(playmateData.map(r => Number(((r.acceptOrderRate ?? 0) * 100).toFixed(2))));

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
    .table-wrap { overflow-x: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      font-size: 12px;
    }
    thead th {
      background: #1a73e8;
      color: #fff;
      padding: 10px 12px;
      border: 1px solid #1558b0;
      white-space: nowrap;
      font-weight: 600;
    }
    tbody td {
      padding: 9px 12px;
      border: 1px solid #e8eaed;
      text-align: center;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) td { background: #f8f9ff; }
    tbody tr:hover td { background: #e8f0fe; }
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }
    .chart-card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 16px;
    }
    .chart-box { width: 100%; height: 300px; }
    .footer {
      text-align: center;
      color: #999;
      font-size: 11px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>Gami 平台${typeLabel} · 数据报表</h1>
    <div class="subtitle">统计区间：${startDay} ～ ${endDay} &nbsp;|&nbsp; 生成时间：${new Date().toLocaleString('zh-CN')}</div>
  </div>

  <!-- Charts -->
  <div class="charts-grid">
    <div class="chart-card"><div id="chart-user" class="chart-box"></div></div>
    <div class="chart-card"><div id="chart-order-amount" class="chart-box"></div></div>
    <div class="chart-card"><div id="chart-order-rate" class="chart-box"></div></div>
    <div class="chart-card"><div id="chart-playmate" class="chart-box"></div></div>
  </div>

  <!-- User Table -->
  <div class="section">
    <div class="section-title">用户数据</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>总用户数</th>
            <th>新注册用户</th>
            <th>活跃用户</th>
            <th>活跃次日留存</th>
            <th>活跃3日留存</th>
            <th>活跃7日留存</th>
            <th>新用户次日留存</th>
            <th>新用户3日留存</th>
            <th>新用户7日留存</th>
          </tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Order Table -->
  <div class="section">
    <div class="section-title">订单数据</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>订单总金额</th>
            <th>总订单数</th>
            <th>已完成</th>
            <th>退款/取消</th>
            <th>接单陪玩(去重)</th>
            <th>下单用户(去重)</th>
            <th>有完成订单用户</th>
            <th>复购用户</th>
            <th>人均下单金额</th>
            <th>复购率</th>
            <th>成单率</th>
            <th>退款率</th>
          </tr>
        </thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Playmate Table -->
  <div class="section">
    <div class="section-title">陪玩师数据</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>陪玩师总数</th>
            <th>新增陪玩师</th>
            <th>活跃陪玩师</th>
            <th>接单陪玩师</th>
            <th>总订单金额</th>
            <th>接单率</th>
            <th>人均接单金额</th>
          </tr>
        </thead>
        <tbody>${playmateRows}</tbody>
      </table>
    </div>
  </div>

  <div class="footer">由 Gami Report Plugin (OpenClaw) 自动生成</div>

  <script>
    const xData = ${chartIds};

    // Chart 1: User Growth
    const c1 = echarts.init(document.getElementById('chart-user'));
    c1.setOption({
      title: { text: '用户增长趋势', left: 'center', textStyle: { fontSize: 13 } },
      tooltip: { trigger: 'axis' },
      legend: { data: ['总用户数', '新注册用户', '活跃用户'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 50, bottom: 50, left: 60, right: 20 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', name: '人数', nameTextStyle: { fontSize: 10 } },
      series: [
        { name: '总用户数', type: 'line', data: ${totalUserData}, smooth: true, symbolSize: 6, lineStyle: { width: 2 }, label: { show: true, fontSize: 10 } },
        { name: '新注册用户', type: 'bar', data: ${newUserData}, itemStyle: { color: '#34a853' }, label: { show: true, position: 'top', fontSize: 10 } },
        { name: '活跃用户', type: 'line', data: ${activeUserData}, smooth: true, symbolSize: 6, lineStyle: { width: 2, type: 'dashed' }, label: { show: true, fontSize: 10 } }
      ]
    });

    // Chart 2: Order Amount
    const c2 = echarts.init(document.getElementById('chart-order-amount'));
    c2.setOption({
      title: { text: '订单金额趋势', left: 'center', textStyle: { fontSize: 13 } },
      tooltip: { trigger: 'axis' },
      legend: { data: ['订单总金额', '人均下单金额'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 50, bottom: 50, left: 70, right: 60 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: [
        { type: 'value', name: '总金额(¥)', nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: '¥{value}', fontSize: 10 } },
        { type: 'value', name: '人均(¥)', nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: '¥{value}', fontSize: 10 } }
      ],
      series: [
        { name: '订单总金额', type: 'bar', data: ${orderAmountData}, itemStyle: { color: '#1a73e8' }, label: { show: true, position: 'top', formatter: '¥{c}', fontSize: 10 } },
        { name: '人均下单金额', type: 'line', yAxisIndex: 1, data: ${avgAmountData}, smooth: true, symbolSize: 6, itemStyle: { color: '#ff6d00' }, lineStyle: { width: 2 }, label: { show: true, fontSize: 10, formatter: '¥{c}' } }
      ]
    });

    // Chart 3: Order Rates
    const c3 = echarts.init(document.getElementById('chart-order-rate'));
    c3.setOption({
      title: { text: '订单转化率趋势', left: 'center', textStyle: { fontSize: 13 } },
      tooltip: { trigger: 'axis', formatter: function(p) { return p.map(i => i.seriesName + ': ' + i.value + '%').join('<br/>'); } },
      legend: { data: ['订单数', '复购率(%)'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 50, bottom: 50, left: 60, right: 60 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: [
        { type: 'value', name: '订单数', nameTextStyle: { fontSize: 10 } },
        { type: 'value', name: '复购率(%)', nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: '{value}%', fontSize: 10 } }
      ],
      series: [
        { name: '订单数', type: 'bar', data: ${orderCountData}, itemStyle: { color: '#34a853' }, label: { show: true, position: 'top', fontSize: 10 } },
        { name: '复购率(%)', type: 'line', yAxisIndex: 1, data: ${repeatRateData}, smooth: true, symbolSize: 6, itemStyle: { color: '#ea4335' }, lineStyle: { width: 2 }, label: { show: true, fontSize: 10, formatter: '{c}%' } }
      ]
    });

    // Chart 4: Playmate Stats
    const c4 = echarts.init(document.getElementById('chart-playmate'));
    c4.setOption({
      title: { text: '陪玩师数据趋势', left: 'center', textStyle: { fontSize: 13 } },
      tooltip: { trigger: 'axis' },
      legend: { data: ['陪玩师总数', '接单率(%)'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 50, bottom: 50, left: 60, right: 60 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: [
        { type: 'value', name: '人数', nameTextStyle: { fontSize: 10 } },
        { type: 'value', name: '接单率(%)', nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: '{value}%', fontSize: 10 } }
      ],
      series: [
        { name: '陪玩师总数', type: 'bar', data: ${totalPlaymateData}, itemStyle: { color: '#9c27b0' }, label: { show: true, position: 'top', fontSize: 10 } },
        { name: '接单率(%)', type: 'line', yAxisIndex: 1, data: ${acceptRateData}, smooth: true, symbolSize: 6, itemStyle: { color: '#ff9800' }, lineStyle: { width: 2 }, label: { show: true, fontSize: 10, formatter: '{c}%' } }
      ]
    });
  </script>
</body>
</html>`;
}

/**
 * Generate a report image from the provided data.
 * @param {object} params
 * @returns {Promise<string>} Absolute path to the generated PNG file
 */
async function generateReport({ reportType, startDay, endDay, userData, orderData, playmateData }) {
  const html = buildHtml({ reportType, startDay, endDay, userData, orderData, playmateData });

  const outDir = path.join(os.homedir(), '.openclaw', 'media', 'outbound', 'group-default');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const timestamp = Date.now();
  const outPath = path.join(outDir, `gami-report-${timestamp}.png`);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    // Width wide enough for the table + 2-column chart grid
    await page.setViewport({ width: 1200, height: 900 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Wait for ECharts animations to finish
    await new Promise(resolve => setTimeout(resolve, 2500));
    await page.screenshot({ path: outPath, fullPage: true });
  } finally {
    await browser.close();
  }

  return outPath;
}

module.exports = { generateReport };
