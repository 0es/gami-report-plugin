---
name: gami-report
description: Generate and send Gami platform statistical report images in four modes — daily (10 days), weekly (8 weeks), monthly (6 months), or a custom date range — covering user, order, and playmate data.
---

## Overview

Use this skill when the user asks for a Gami platform data report, statistical summary, or asks the bot to send a report image. This skill calls the `generate_gami_report` tool to fetch live data from the Gami API, renders it as a styled image, and then sends the image as a media message.

## When to trigger

Trigger this skill when the user says any of the following (in Chinese or English):
- "发报表"、"发日报"、"发周报"、"发月报"
- "生成报表"、"生成日报/周报/月报"
- "数据报表"、"运营数据"、"统计报告"
- "send report", "generate report", "daily/weekly/monthly report"

---

## Four report modes

### Mode 1 — 自定义时间范围 (Custom range)

User provides an explicit start and end date. Use those dates directly.

- `reportType`: infer from context — if the range spans days use `0`, weeks use `1`, months use `2`. Default to `0` when unclear.
- `startDay`: user-supplied date (format `yyyy-MM-dd`)
- `endDay`: user-supplied date (format `yyyy-MM-dd`)

---

### Mode 2 — 日报模式 (Daily, last 10 days)

Triggered when user asks for "日报" without specifying a custom range.

- `reportType`: `0`
- `startDay`: today minus 9 days (inclusive)
- `endDay`: today

Date computation (today = `T`):
```
startDay = T - 9 days
endDay   = T
```

Example — today is 2024-03-08:
```
startDay = 2024-02-28
endDay   = 2024-03-08
```

---

### Mode 3 — 周报模式 (Weekly, last 8 weeks)

Triggered when user asks for "周报" without specifying a custom range.

- `reportType`: `1`
- `startDay`: Monday of the ISO week that is 7 weeks before the current ISO week
- `endDay`: today

**ISO 8601 week rules (important):**
- A week always starts on **Monday** and ends on Sunday.
- The first ISO week of a year (`W01`) is the week containing the **first Thursday** of that year (equivalently, the week containing January 4th).
- Consequence: the last few days of December may belong to **W01 of the next year**, and the first few days of January may belong to **W52 or W53 of the previous year**.

Date computation:
```js
// 1. Find Monday of the current ISO week
const day = today.getDay();                     // 0=Sun … 6=Sat
const diff = (day === 0) ? -6 : 1 - day;       // shift so Monday = 0
const currentWeekMonday = today + diff days;

// 2. Go back 7 full ISO weeks to get startDay
startDay = currentWeekMonday - 49 days;
endDay   = today;
```

Example — today is 2024-03-08 (Friday), current ISO week Monday = 2024-03-04:
```
startDay = 2024-01-15   (7 ISO weeks before 2024-03-04)
endDay   = 2024-03-08
```

Year-boundary example — today is 2025-01-02 (Thursday):
- ISO week of 2025-01-02 is **2025-W01** (Monday = 2024-12-30)
- currentWeekMonday = 2024-12-30
- startDay = 2024-12-30 − 49 days = **2024-11-11**
- endDay = 2025-01-02

---

### Mode 4 — 月报模式 (Monthly, last 6 months)

Triggered when user asks for "月报" without specifying a custom range.

- `reportType`: `2`
- `startDay`: 1st day of the month that is 5 months before the current month
- `endDay`: last day of the current month (or today if the month is not yet complete)

Date computation:
```
startDay = first day of (currentMonth - 5 months)
endDay   = today
```

Example — today is 2024-03-08:
```
startDay = 2023-10-01   (5 months before March 2024)
endDay   = 2024-03-08
```

---

## Step-by-step instructions

1. Identify the mode from the user's message:
   - Explicit dates provided → **Mode 1 (Custom)**
   - "日报" or no specific type → **Mode 2 (Daily)**
   - "周报" → **Mode 3 (Weekly)**
   - "月报" → **Mode 4 (Monthly)**
2. Compute `startDay` and `endDay` using the rules above. Always use today's actual date — do **not** hard-code dates.
3. Call the `generate_gami_report` tool:
   ```json
   { "reportType": <0|1|2>, "startDay": "yyyy-MM-dd", "endDay": "yyyy-MM-dd" }
   ```
4. Parse the tool result (JSON string in `content[0].text`):
   - On success: `imagePath` is the absolute path to the PNG file.
   - On error: surface the error message to the user.
5. Send the image file at `imagePath` as a media/image message.
6. Accompany the image with a brief text summary, for example:
   - "已发送日报（2024-02-28 ~ 2024-03-08，共10天），包含用户、订单、陪玩师三类数据。"

---

## Example interactions

**日报模式** — today is 2024-03-08:
```
User: 发日报
→ reportType=0, startDay=2024-02-28, endDay=2024-03-08
→ Call generate_gami_report({ reportType: 0, startDay: "2024-02-28", endDay: "2024-03-08" })
→ Send image + "已发送日报（2024-02-28 ~ 2024-03-08，共10天数据）"
```

**周报模式** — today is 2024-03-08:
```
User: 发周报
→ reportType=1, startDay=2024-01-15, endDay=2024-03-08
→ Call generate_gami_report({ reportType: 1, startDay: "2024-01-15", endDay: "2024-03-08" })
→ Send image + "已发送周报（2024-01-15 ~ 2024-03-08，共8周数据）"
```

**月报模式** — today is 2024-03-08:
```
User: 发月报
→ reportType=2, startDay=2023-10-01, endDay=2024-03-08
→ Call generate_gami_report({ reportType: 2, startDay: "2023-10-01", endDay: "2024-03-08" })
→ Send image + "已发送月报（2023-10-01 ~ 2024-03-08，共6个月数据）"
```

**自定义范围**:
```
User: 发一下2024年1月到2月的月报
→ reportType=2, startDay=2024-01-01, endDay=2024-02-29
→ Call generate_gami_report({ reportType: 2, startDay: "2024-01-01", endDay: "2024-02-29" })
```

---

## Notes

- Always compute dates using today's actual date. Never hard-code date strings.
- For weekly mode, always use **ISO 8601 weeks** (Monday-first). The `id` field in weekly API responses uses the format `yyyy-Www` (e.g. `2025-W01`), which follows the same standard. Year-boundary weeks (e.g. 2024-12-30 belongs to 2025-W01) must be handled correctly.
- The image is saved to `~/.openclaw/media/outbound/group-default/`. OpenClaw picks it up automatically for outbound delivery.
- If the user requests the test environment, pass `env: "test"` to the tool; otherwise omit it (defaults to `"prod"`).
- The tool fetches all paginated records within the date range automatically.
- If there is no data for the requested period, the tool returns a message instead of an image path — surface that to the user.
