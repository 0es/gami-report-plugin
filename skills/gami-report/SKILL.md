---
name: gami-report
description: Generate and send Gami platform statistical report images (daily/weekly/monthly) covering user, order, and playmate data.
---

## Overview

Use this skill when the user asks for a Gami platform data report, statistical summary, or asks the bot to send a report image. This skill calls the `generate_gami_report` tool to fetch live data from the Gami API, renders it as a styled image, and then sends the image as a media message.

## When to trigger

Trigger this skill when the user says any of the following (in Chinese or English):
- "发报表"、"发日报"、"发周报"、"发月报"
- "生成报表"、"生成日报/周报/月报"
- "数据报表"、"运营数据"、"统计报告"
- "send report", "generate report", "daily/weekly/monthly report"

## Report types

| Type | Value | Period description |
|------|-------|-------------------|
| 日报  | 0     | Per-day statistics |
| 周报  | 1     | Per-week statistics |
| 月报  | 2     | Per-month statistics |

## Default date logic

If the user does not specify a date range, use these defaults based on today's date:

- **日报 (type=0)**: `startDay` = yesterday, `endDay` = yesterday
  - Example: today is 2024-03-08 → startDay=2024-03-07, endDay=2024-03-07
- **周报 (type=1)**: the full previous calendar week (Monday–Sunday)
  - Example: today is 2024-03-08 → startDay=2024-02-26, endDay=2024-03-03
- **月报 (type=2)**: the full previous calendar month
  - Example: today is 2024-03-08 → startDay=2024-02-01, endDay=2024-02-29

Always compute dates programmatically using JavaScript `Date` — do not hard-code them.

## Step-by-step instructions

1. Determine `reportType` from the user's message (0/1/2). Default to `0` (日报) if unclear.
2. Determine `startDay` and `endDay`:
   - Use the user-provided dates if present (format: `yyyy-MM-dd`).
   - Otherwise, compute them using the default logic above.
3. Call the `generate_gami_report` tool with `{ reportType, startDay, endDay }`.
4. Parse the tool result (JSON string in `content[0].text`):
   - On success: `imagePath` contains the absolute path to the PNG file.
   - On error: surface the error message to the user.
5. Send the image file at `imagePath` as a media/image message to the user.
6. Optionally accompany the image with a brief text summary:
   - Report type and date range
   - Number of data records included

## Example interaction

User: 发一下昨天的日报

Steps:
1. reportType = 0, startDay = yesterday's date, endDay = yesterday's date
2. Call `generate_gami_report({ reportType: 0, startDay: "2024-03-07", endDay: "2024-03-07" })`
3. Get back `{ success: true, imagePath: "/Users/.../.openclaw/media/outbound/group-default/gami-report-1234567890.png", ... }`
4. Send the image at that path
5. Reply: "已发送 2024-03-07 日报，包含用户、订单、陪玩师三类数据。"

## Notes

- The image is saved to `~/.openclaw/media/outbound/group-default/`. OpenClaw will pick it up automatically for outbound delivery.
- If the user requests the test environment, pass `env: "test"` to the tool; otherwise omit it (defaults to `"prod"`).
- The tool fetches all paginated records within the date range automatically.
- If there is no data for the requested period, the tool returns a message instead of an image path — surface that message to the user.
