# Stitch Prompt — vehicle-status.html (車輛可用狀態總覽)

## Screen: 車輛可用狀態總覽 (Traffic Light Board)

Design a railway vehicle availability status board in Traditional Chinese (zh-TW) with a cinematic command-center dark theme.

### Overall Atmosphere
- Deep midnight navy background (#06090f) with subtle radial gradient nebulae and 60px grid overlay
- Glassmorphic translucent panels throughout
- Traffic light metaphor: green=available, yellow=in-transit, red=unavailable

### Header Section
- Top-left: copper-gold pill badge "七堵機務段 · 狀態監控" with pulsing dot
- Large title "車輛可用狀態總覽" in Outfit 38px weight 800, gradient text fill
- Subtitle: "各車型紅綠燈狀態即時監控 — 可用 / 回送 / 不可用"
- Top-right: "← 返回總覽" glass button, depot selector dropdown "七堵機務段", theme toggle

### Summary Cards Row (4 columns)
Four glassmorphic cards with 20px rounded corners:
1. "車輛總數" — blue-tinted icon (🚂), large "21" in bold, "輛" unit
2. "可用" — green-tinted icon (✅), large "12" in green color (#2dd4a0), "輛" unit
3. "回送中" — yellow-tinted icon (🔄), large "2" in yellow (#f59e0b), "輛" unit
4. "不可用" — red-tinted icon (🚫), large "7" in red (#ef4444), "輛" unit

### Status Legend Bar
A centered glassmorphic bar containing three legend entries:
- Green circle (16px, glowing) + "可用 — 可營運"
- Yellow circle (16px, pulsing glow) + "回送中 — 不可營運但可配駛"
- Red circle (16px, glowing) + "不可用 — 檢修 / 待料 / 待報廢"

### Vehicle Groups (3 sections)

#### E 系列 — 電力機車
- Group header: 4px blue vertical bar + "E 系列 — 電力機車" in Outfit 18px bold + pill badges showing "5 可用" (green), "1 回送" (yellow), "4 不可用" (red) + right-aligned "10 輛" count
- Vehicle grid (auto-fill, min 110px): Each vehicle is a glass card containing:
  - Large status orb (48px circle): green=solid glow, yellow=pulsing glow, red=intense glow
  - Vehicle ID below in monospace bold (e.g. "E234", "E235")
  - Status label in matching color (e.g. "可用" in green, "檢修" in red, "回送中" in yellow)
- Vehicles: E234(yellow/回送中), E235(green/可用), E236(green/可用), E301(red/檢修), E315(red/檢修), E401(green/可用), E505(green/可用), E527(red/待報廢), E528(red/待料), E541(green/可用)

#### EMU 系列 — 電聯車
- Same layout with emerald (#2dd4a0) group indicator
- "5 可用", "1 回送", "2 不可用" + "8 輛"
- Vehicles: EMU3230(red/待報廢), EMU3240(green/可用), EMU3250(yellow/回送中), EMU3270(green/可用), EMU3280(green/可用), EMU3300(red/待料), EMU3310(green/可用), EMU3340(green/可用)

#### DR 系列 — 柴油客車
- Same layout with amber (#f59e0b) group indicator
- "2 可用", "1 不可用" + "3 輛"
- Vehicles: DR1617(green/可用), DR1029(red/檢修), DR1033(green/可用)

### Footer
Centered: "七堵機務段 車輛可用狀態管理系統 — 資料更新時間 2026/02/24 00:31"

### Design Tokens
- Fonts: Outfit (display), Noto Sans TC (body), JetBrains Mono (data)
- Accent: #e8a849 (copper-gold)
- Status: green=#2dd4a0, yellow=#f59e0b, red=#ef4444
- Green glow: 0 0 20px rgba(45, 212, 160, 0.4)
- Yellow glow: 0 0 20px rgba(245, 158, 11, 0.4) with pulse animation
- Red glow: 0 0 20px rgba(239, 68, 68, 0.4)
- Card bg: rgba(14, 22, 38, 0.75) with blur(24px)
- Border: rgba(255, 255, 255, 0.06)
- Radius: cards=20px, badges=100px
