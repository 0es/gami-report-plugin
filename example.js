const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const data = {
  weeks: [1, 2, 3, 4],
  user: {
    total: [173, 215, 280, 350],
    new: [45, 42, 65, 70],
    active: [110, 135, 180, 220],
    retention: ["65%", "68%", "72%", "75%"],
    newRetention: ["40%", "42%", "45%", "48%"]
  },
  order: {
    amount: [5200, 7800, 11500, 15800],
    count: [85, 120, 190, 260],
    users: [65, 90, 135, 180],
    trainers: [25, 32, 45, 58],
    perAmount: [80, 86, 85, 87],
    repurchase: [0.25, 0.28, 0.32, 0.35],
    success: ["95%", "96%", "94%", "97%"],
    refund: ["2.1%", "1.8%", "2.3%", "1.5%"]
  },
  trainer: {
    total: [45, 58, 80, 110],
    new: [8, 13, 22, 30],
    active: [35, 45, 65, 90],
    orderTaking: [25, 32, 45, 58],
    rate: ["71%", "71%", "69%", "64%"],
    perAmount: [208, 243, 255, 272]
  }
};

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1600 });

  const htmlContent = `
    <html>
    <head>
      <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
      <style>
        body { padding: 40px; background: #f8f9fa; font-family: "PingFang SC", sans-serif; color: #333; }
        h2 { border-left: 5px solid #007bff; padding-left: 15px; margin: 30px 0 15px; }
        table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 30px; }
        th { background: #007bff; color: #fff; padding: 12px; border: 1px solid #dee2e6; }
        td { padding: 10px; border: 1px solid #dee2e6; text-align: center; }
        .chart-container { display: flex; flex-direction: column; gap: 30px; margin-top: 40px; }
        .chart-box { width: 100%; height: 400px; padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); box-sizing: border-box; }
      </style>
    </head>
    <body>
      <h2>用户数据</h2>
      <table>
        <thead><tr><th>周数</th><th>总用户数</th><th>新注册用户数</th><th>活跃用户数</th><th>活跃用户留存率</th><th>新注册活跃用户留存率</th></tr></thead>
        <tbody>
          ${data.weeks.map(i => `<tr><td>${i}</td><td>${data.user.total[i-1]}</td><td>${data.user.new[i-1]}</td><td>${data.user.active[i-1]}</td><td>${data.user.retention[i-1]}</td><td>${data.user.newRetention[i-1]}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>订单数据</h2>
      <table>
        <thead><tr><th>周数</th><th>订单金额</th><th>订单量</th><th>下单用户数</th><th>接单陪玩师</th><th>人均下单金额</th><th>复购率</th><th>支付成功率</th><th>退款率</th></tr></thead>
        <tbody>
          ${data.weeks.map(i => `<tr><td>${i}</td><td>${data.order.amount[i-1]}</td><td>${data.order.count[i-1]}</td><td>${data.order.users[i-1]}</td><td>${data.order.trainers[i-1]}</td><td>${data.order.perAmount[i-1]}</td><td>${(data.order.repurchase[i-1]*100).toFixed(0)}%</td><td>${data.order.success[i-1]}</td><td>${data.order.refund[i-1]}</td></tr>`).join('')}
        </tbody>
      </table>

      <div class="chart-container">
        <div id="chart1" class="chart-box"></div>
        <div id="chart2" class="chart-box"></div>
      </div>

      <h2>陪玩师数据</h2>
      <table>
        <thead><tr><th>周数</th><th>陪玩师总数</th><th>新增陪玩师数量</th><th>活跃陪玩师总数</th><th>接单陪玩师人数</th><th>接单率</th><th>人均接单金额</th></tr></thead>
        <tbody>
          ${data.weeks.map(i => `<tr><td>${i}</td><td>${data.trainer.total[i-1]}</td><td>${data.trainer.new[i-1]}</td><td>${data.trainer.active[i-1]}</td><td>${data.trainer.orderTaking[i-1]}</td><td>${data.trainer.rate[i-1]}</td><td>${data.trainer.perAmount[i-1]}</td></tr>`).join('')}
        </tbody>
      </table>

      <script>
        const weeks = ${JSON.stringify(data.weeks.map(w => '第' + w + '周'))};
        
        const chart1 = echarts.init(document.getElementById('chart1'));
        chart1.setOption({
          title: { text: '下单金额情况', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { data: ['订单金额', '人均下单金额'], bottom: 0 },
          grid: { top: 60, bottom: 60 },
          xAxis: { type: 'category', data: weeks },
          yAxis: [
            { type: 'value', name: '金额', axisLabel: { formatter: '¥{value}' } },
            { type: 'value', name: '人均', axisLabel: { formatter: '¥{value}' } }
          ],
          series: [
            { 
              name: '订单金额', 
              type: 'bar', 
              data: ${JSON.stringify(data.order.amount)}, 
              itemStyle: { color: '#007bff' },
              label: { show: true, position: 'top', formatter: '¥{c}' }
            },
            { 
              name: '人均下单金额', 
              type: 'line', 
              yAxisIndex: 1, 
              data: ${JSON.stringify(data.order.perAmount)}, 
              itemStyle: { color: '#ff7f50' }, 
              symbolSize: 8, 
              lineStyle: { width: 3 },
              label: { show: true, position: 'bottom', formatter: '¥{c}' }
            }
          ]
        });

        const chart2 = echarts.init(document.getElementById('chart2'));
        chart2.setOption({
          title: { text: '下单用户情况', left: 'center' },
          tooltip: { trigger: 'axis' },
          legend: { data: ['下单用户数', '复购率'], bottom: 0 },
          grid: { top: 60, bottom: 60 },
          xAxis: { type: 'category', data: weeks },
          yAxis: [
            { type: 'value', name: '人数' },
            { type: 'value', name: '率', axisLabel: { formatter: '{value}%' } }
          ],
          series: [
            { 
              name: '下单用户数', 
              type: 'bar', 
              data: ${JSON.stringify(data.order.users)}, 
              itemStyle: { color: '#28a745' },
              label: { show: true, position: 'top' }
            },
            { 
              name: '复购率', 
              type: 'line', 
              yAxisIndex: 1, 
              data: ${JSON.stringify(data.order.repurchase.map(v => v * 100))}, 
              itemStyle: { color: '#dc3545' }, 
              symbolSize: 8, 
              lineStyle: { width: 3 },
              label: { show: true, position: 'right', formatter: '{c}%' }
            }
          ]
        });
      </script>
    </body>
    </html>
  `;

  await page.setContent(htmlContent);
  // 等待 ECharts 动画渲染完成
  await new Promise(resolve => setTimeout(resolve, 2000));
  const outPath = path.join('/Users/gamimac/.openclaw/media/outbound/group-default', 'report.png');
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log('Report generated at:', outPath);
})();