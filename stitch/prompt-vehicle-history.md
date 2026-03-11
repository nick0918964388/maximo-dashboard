# Stitch Prompt — vehicle-history.html (車輛運用歷程)

## Screen: 車輛運用歷程 (Vehicle Detail & History)

Design a railway vehicle detail and operation history page in Traditional Chinese (zh-TW) with a cinematic command-center dark theme.

### Overall Atmosphere
- Deep midnight navy background (#06090f) with subtle radial gradient nebulae and 60px grid overlay
- Glassmorphic translucent panels throughout
- Data-dense but well-organized layout with clear visual hierarchy

### Header Section (single row, centered vertically)
- "← 返回總覽" glass button with arrow
- Large vehicle ID "E315" in Outfit 42px weight 800, gradient text fill
- Pill badge "電力機車" in blue tint (#4a90d9 bg at 10%, blue text, blue border)
- Status badge with red glowing dot + "檢修" in red (#ef4444)
- Right side: copper-gold gradient CTA button "📋 開立動態回報" with glow shadow
- Theme toggle pill

### Top Row (2 columns: 340px + flexible)

#### Left Panel — 基本資料
- Section title with 3px copper bar: "基本資料"
- Info grid with label-value rows separated by ghost border lines:
  - 車號: E315 (monospace bold)
  - 車型: 電力機車
  - 運用號碼: 18
  - 配屬段: 七堵機務段
  - 維運代碼: CTE18
  - 目前狀態: 檢修 (in red)

#### Right Panel — 里程統計
- Section title: "里程統計"
- Three stat items in a row (equal columns), each in glass-tinted boxes with 14px rounded corners:
  - "8256" + "km" in copper (#e8a849), label "本月里程（預估）"
  - "99.1" + "千km" in copper, label "本年里程（預估）"
  - "275.2" + "km" in white, label "日均里程"
- Below: bar chart showing daily mileage for past 30 days, blue vertical bars on transparent background

### Operation Records Table
- Section title: "運用紀錄"
- Right-aligned filter chips: "顯示" label + "7天", "14天", "30天" (active, copper fill), "全部"
- Glass panel containing data table:
  - Sticky header: dark navy background, uppercase muted labels (日期, 運用號, 車次, 起迄時間, 里程(KM), 控制模式)
  - Row 1: 2026/02/24 | 18 | train pills [7350A][7350][7351][7532][7353][7354][7355][7356] | 05:30 → 21:00 | 356.7 | "A 主控" in blue
  - Row 2: 2026/02/23 | 18 | train pills [7538A][7538] | 10:13 → 18:54 | 193.7 | "A 主控" in blue
  - Train pills: monospace 11px in small glass pill badges with ghost borders
  - Alternating row tints, hover highlight

### KPI Section — 維修可靠度指標 (3 equal columns)
- Section title: "維修可靠度指標"

#### MTBF Card
- Glass card with 3px green gradient strip at top
- Header: "MTBF" pill badge in green tint + "▲ 11%" trend badge in green
- Large value: "429" in Outfit 38px bold + "小時" unit
- Label: "兩次故障平均間隔時間"
- Sub info with green dot: "基準 720 hr，共 6 次故障"
- Right side: 72px SVG ring gauge showing 60% in green, "60%" centered text, "達標率" label

#### MDBF Card
- Same structure but with red gradient strip
- "MDBF" pill in red + "▼ 2%" trend in red
- "13.9k" + "km"
- "兩次故障平均里程"
- Red dot: "基準 50k km，年估 99k km"
- Ring gauge: 28% in red

#### MTTR Card
- Red gradient strip
- "MTTR" pill in red + "— 持平" trend in yellow
- "4.2" + "小時"
- "修復平均維修時間"
- Red dot: "目標 4 hr，共 6 次維修"
- Ring gauge: 48% in yellow/amber

### Bottom Row (2 equal columns)

#### Left Panel — 近期保養紀錄
- Section title: "近期保養紀錄"
- Data table with columns: 日期, 類型, 描述, 狀態
- Type badges: "定期保養" in blue, "車輪檢修" in amber, "煞車檢查" in emerald, "電器檢修" in purple (#8b5cf6), "車體檢修" in copper
- Status badges: "已完成" in green, "已排程" in blue
- 6 rows of maintenance records

#### Right Panel — 近期故障紀錄
- Section title: "近期故障紀錄"
- Data table with columns: 日期, 代碼, 描述, 嚴重度, 狀態
- Severity badges: "高" in red with red dot, "中" in yellow, "低" in green
- Status badges: "已修復" in green, "處理中" in red
- 4 rows of fault records

### Footer
Centered: "E315 車輛運用歷程 — 台鐵車輛管理系統"

### Design Tokens
- Fonts: Outfit (display), Noto Sans TC (body), JetBrains Mono (data)
- Accent: #e8a849 (copper-gold)
- Vehicle type E: #4a90d9 (blue)
- Status: green=#2dd4a0, yellow=#f59e0b, red=#ef4444
- Extra: purple=#8b5cf6 (electrical maintenance)
- Card bg: rgba(14, 22, 38, 0.75) with blur(24px)
- Border: rgba(255, 255, 255, 0.06)
- KPI ring gauge: 72px diameter, 6px stroke width
- Radius: cards=20px, badges=100px, stat boxes=14px
