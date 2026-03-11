# Stitch Prompt — index.html (主儀表板)

## Screen: 車輛運用總覽 Dashboard

Design a full-page railway vehicle fleet operations dashboard in Traditional Chinese (zh-TW) with a cinematic command-center aesthetic.

### Overall Atmosphere
- Dark theme with deep midnight navy background (#06090f)
- Subtle radial gradient nebulae: blue glow top-left, copper warmth top-right, emerald bottom-center
- Fine 60px engineering grid overlay at near-invisible opacity
- Glassmorphic translucent panels with backdrop-filter blur

### Header Section
- Top-left: a small copper-gold pill badge with a pulsing green dot, monospace text "七堵機務段 · 即時監控" in uppercase letter-spacing
- Large page title "車輛運用總覽" in Outfit font 38px weight 800, rendered with a gradient text fill (white to slate-blue)
- Subtitle in light gray: "每日機組組運用管理與指標一覽"
- Top-right controls: date picker (left/right arrows flanking "2026/02/24" in monospace), filter chips ("全部" in copper, "E 電力機車" in blue, "EMU 電聯車" in emerald, "DR 柴油客車" in amber), and a pill-shaped dark/light theme toggle

### Summary Cards Row (4 columns, equal width)
Four glassmorphic cards with 20px rounded corners, semi-transparent dark background, thin ghost borders:
1. "配入編組" — icon in blue tint box, large number "21" in Outfit 32px bold, subtitle "輛", small green change badge "+2 較昨日"
2. "總行駛里程" — icon in copper tint box, "6307.9" with "km" unit, small green badge "+890 Fri"
3. "運行中車輛" — icon in emerald tint box, "48" with "%" unit, red badge "-6.3 較昨日"
4. "平均里程" — icon in amber tint box, "300.4" with "km/輛" unit, green badge "▲ 持平"
Each card has a hidden copper gradient line at top that appears on hover.

### Charts Section (2 columns: 340px fixed + flexible)
- Left panel: "車種分佈" donut chart showing E:10, EMU:8, DR:3 with blue/emerald/amber colors. Center text: "21 總配置". Below: legend with colored square dots and counts.
- Right panel: "里程排行" horizontal bar chart listing all vehicles (E541, E505, EMU3300, etc.) with gradient-filled bars colored by vehicle type. Bars have soft glow shadows. Scrollable if needed with 4px custom scrollbar.

### Vehicle Operation Cards Grid (auto-fill, min 440px)
Each vehicle card:
- Glass panel, zero padding structure with header/route/footer zones
- Header: 4px colored vertical bar (blue for E, emerald for EMU, amber for DR) + vehicle ID in Outfit 22px bold + monospace subtitle (operation code, MA code, type) + pill badges (ctrl mode A/B/C, day count)
- Route section: horizontal line with dot stops showing train numbers (first and last stops highlighted)
- Footer: dark tinted background showing "起迄時間 06:04 → 09:56", "車次數 8", "里程 356.7km" in copper accent

### Gantt Timeline Section
- Section title "每日運行時序" with 3px copper vertical bar indicator
- Full-width horizontal gantt chart, time axis from 04:00 to next day 01:00
- Horizontal bars for each vehicle colored by type (blue/emerald/amber) with operation code labels inside
- Red vertical "current time" indicator line
- Vehicle IDs as Y-axis labels in monospace

### Bottom Stats Row (3 equal columns)
- "運用號碼分佈" — horizontal bar chart listing op codes with counts
- "控制模式" — three large letter displays A/B/C with counts below
- "機務段資訊" — depot info card with name, location, stats

### Footer
Centered small text: "七堵機務段 車輛運用總覽管理系統 — 資料更新時間 2026/02/24"

### Design Tokens
- Fonts: Outfit (display), Noto Sans TC (body), JetBrains Mono (data)
- Accent: #e8a849 (copper-gold)
- Vehicle colors: E=#4a90d9, EMU=#2dd4a0, DR=#f59e0b
- Card bg: rgba(14, 22, 38, 0.75) with blur(24px)
- Border: rgba(255, 255, 255, 0.06)
- Radius: 8px/14px/20px/28px, pills=100px
- Shadows: 0 4px 24px rgba(0,0,0,0.3)
- Text: primary=#e8edf5, secondary=#7a8ba8, muted=#4a5873
