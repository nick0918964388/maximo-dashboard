# Design System: 台鐵車輛運用管理系統
**Project:** car_statement — Railway Vehicle Fleet Operations Dashboard
**Pages:** index.html (主儀表板) / vehicle-status.html (狀態總覽) / vehicle-history.html (車輛歷程)

---

## 1. Visual Theme & Atmosphere

**Cinematic Command-Center Dark Theme** — 深邃的午夜海軍藍為基底，營造太空指揮中心般的科技感。整體氛圍是「資料密集但井然有序」，透過玻璃擬態 (Glassmorphism) 半透明面板建立視覺層次。

- 背景帶有極微弱的放射狀星雲漸層（左上藍光、右上銅暖、下方翡翠）
- 60px 工程格線覆蓋於背景上，幾近隱形
- 所有面板使用 `backdrop-filter: blur(24px)` 玻璃模糊效果
- 銅金色 (copper-gold) 作為主要強調色，貫穿全系統
- 支援 Dark / Light 雙主題切換，0.4s 漸變過渡

---

## 2. Color Palette & Roles

### 背景色系
| Token | Dark Value | Light Value | 用途 |
|-------|-----------|-------------|------|
| `--bg-primary` | `#06090f` | `#f0f2f7` | 頁面背景底色 |
| `--bg-card` | `rgba(14, 22, 38, 0.75)` | `rgba(255, 255, 255, 0.82)` | 玻璃面板/卡片背景 |
| `--bg-card-solid` | `#0e1626` | `#ffffff` | 不需模糊效果的面板 |
| `--bg-secondary` | `#0c1220` | `#e4e8f0` | 表格 header、深色區塊 |

### 強調色系
| Token | Dark Hex | Light Hex | 用途 |
|-------|----------|-----------|------|
| `--accent-copper` | `#e8a849` | `#c07818` | 主要 CTA、標題裝飾條、重要數據、hover 頂部漸層線 |
| `--accent-copper-dim` | `#e8a84933` | `rgba(180,120,40,0.2)` | 銅金色淡化底色 |

### 車型識別色系
| Token | Dark Hex | Light Hex | 車型 |
|-------|----------|-----------|------|
| `--color-e` | `#4a90d9` | `#2563eb` | E 系列 — 電力機車 |
| `--color-emu` | `#2dd4a0` | `#059669` | EMU 系列 — 電聯車 |
| `--color-dr` | `#f59e0b` | `#d97706` | DR 系列 — 柴油客車 |

### 狀態色系
| Token | Dark Hex | Light Hex | 語意 |
|-------|----------|-----------|------|
| `--color-green` | `#2dd4a0` | `#059669` | 可用、已完成、正向趨勢 |
| `--color-yellow` | `#f59e0b` | `#d97706` | 回送中、警告、持平趨勢 |
| `--color-red` | `#ef4444` | `#dc2626` | 不可用、檢修、負向趨勢 |
| `--color-purple` | `#8b5cf6` | — | 電器檢修類型標籤 |

### 文字色系
| Token | Dark Hex | Light Hex | 用途 |
|-------|----------|-----------|------|
| `--text-primary` | `#e8edf5` | `#1a2035` | 主要標題、重要數據 |
| `--text-secondary` | `#7a8ba8` | `#556178` | 副標題、標籤、圖例 |
| `--text-muted` | `#4a5873` | `#8d9bb5` | 頁尾、極次要資訊 |

### 邊框與光暈
| Token | Value | 用途 |
|-------|-------|------|
| `--border` | `rgba(255, 255, 255, 0.06)` | 所有面板邊框，1px inside stroke |
| Green Glow | `0 0 20px rgba(45, 212, 160, 0.4)` | 綠色狀態光暈 |
| Yellow Glow | `0 0 20px rgba(245, 158, 11, 0.4)` | 黃色狀態光暈 (帶 pulse) |
| Red Glow | `0 0 20px rgba(239, 68, 68, 0.4)` | 紅色狀態光暈 |
| Copper CTA Glow | `0 0 16px rgba(232, 168, 73, 0.27)` | CTA 按鈕光暈 |

---

## 3. Typography Rules

### 字型家族
| Token | 字型 | 角色 |
|-------|------|------|
| `--font-display` | **Outfit** | 標題、大型數據、車輛 ID |
| `--font-body` | **Noto Sans TC** | 繁體中文本文、標籤、說明 |
| `--font-mono` | **JetBrains Mono** | 車次編號、代碼、時間戳 |

### 字級與字重
| 用途 | 字型 | 大小 | 字重 | 顏色 |
|------|------|------|------|------|
| 頁面主標題 | Outfit | 38px | 800 | 漸層 white → slate-blue |
| 車輛 ID (歷程頁) | Outfit | 42px | 800 | 漸層 white → `#7a8ba8` |
| 大型數據數字 | Outfit | 32px | 700 | `--text-primary` 或對應色 |
| KPI 數據數字 | Outfit | 38px | 700 | `--text-primary` |
| Section 標題 | Outfit | 18px | 700 | `--text-primary` |
| 副標題 / 說明 | Noto Sans TC | 14px | Normal | `--text-secondary` |
| 標籤文字 | Noto Sans TC | 12-13px | Normal | `--text-secondary` |
| 頁尾文字 | Noto Sans TC | 11px | Normal | `--text-muted` |
| Badge 文字 | JetBrains Mono | 11-12px | 600 | 對應狀態色 |

---

## 4. Component Stylings

### Glassmorphic Card (主面板)
- Background: `--bg-card` (semi-transparent)
- Border: `--border`, 1px, inside stroke
- Corner radius: 20px
- Padding: 20-24px
- Blur: `backdrop-filter: blur(24px)`
- Shadow: `0 4px 24px rgba(0,0,0,0.3)`
- Hover: 頂部出現 2px 銅金色漸層線, lift 2px

### Summary Stat Card
- 同 Glassmorphic Card
- Layout: vertical, gap 12px
- Structure: Icon 框 (40x40, 8px corners, 車型色 20% 底) → 大數字 (Outfit 32px Bold) → 單位 → 變化 Badge

### Stat Box (里程統計用)
- Corner radius: 14px
- 同 Card 基底
- 數字色: `--accent-copper`
- Structure: 大數字 + 單位 → 標籤

### Badge / Pill
- Corner radius: 100px (pill)
- Padding: 4-6px / 8-14px
- Variants:
  - **Depot Badge**: copper 1px border, 透明底, 帶脈動綠點
  - **Filter Chip active**: copper 填色
  - **Filter Chip inactive**: glass 底, ghost border
  - **Status Badge**: 狀態色 10% 底 + 色文字 + 色 border
  - **Change Badge**: 色 20% 底 + 色文字
  - **KPI Trend**: 同 Status + ▲/▼ 箭頭
  - **Train Pill**: ghost border, mono 11px

### Vehicle Status Card (燈號卡)
- Width: 120px fixed
- Corner radius: 20px
- Padding: 16px
- Structure: 48px Status Orb (solid color + outer glow) → 車號 (mono bold) → 狀態文字
- Orb glow: `0 0 20px [color]66`; Yellow 帶 pulse 動畫

### Vehicle Operation Card (運用卡片)
- 三段結構, clip overflow
- Header: 4px 車型色直條 + 車輛 ID (Outfit 22px Bold) + mono 副標 + Pill badges
- Route Section: 水平時間軸，車次站點
- Footer: 深色底帶, 起迄時間 + 車次數 + 里程 (copper)

### KPI Card (可靠度指標卡)
- 頂部: 3px 漸層色條 (green/red/yellow)
- Left: KPI 名稱 pill + trend badge → 大數字 + 單位 → 說明 → 帶色點基準資訊
- Right: 72px Ring Gauge, 6px stroke, 中心 % + 「達標率」

### Section Title
- 3px copper 直條 + Outfit 18px Bold 標題, gap 8px

### Group Header (車型群組)
- 4px 車型色直條 + 群組標題 + 狀態數量 pills + 右側總數

### Buttons
- **Glass Back**: `--bg-card`, ghost border, 8px corners, 「← 返回總覽」
- **CTA**: gradient `#e8a849` → `#c07818`, 8px corners, outer glow

### Ring Gauge (環形進度表)
- Diameter: 72px, Stroke: 6px
- Background ring: `#ffffff0F`
- Progress: 對應狀態色
- Center: 百分比 (Outfit Bold) + 「達標率」

---

## 5. Layout Principles

### 頁面結構
- Width: 1480px
- Padding: 40px all sides
- Background: `--bg-primary`
- Section gap: 28-32px vertical
- Direction: vertical (column)

### Grid System
| 區塊 | 欄位配置 | Gap |
|------|---------|-----|
| Summary Cards | 4 equal columns | 20px |
| Charts | 340px fixed + flex | 20px |
| Vehicle Cards | auto-fill, min 440px | 16px |
| KPI Cards | 3 equal columns | 20px |
| Bottom Stats | 3 equal columns | 20px |
| Status Grid | auto-fill, 120px each | 12px |
| Top Row (歷程) | 340px fixed + flex | 20px |

### Radius Scale
| Token | Value | 用途 |
|-------|-------|------|
| `--radius-sm` | 8px | 按鈕、圖示框 |
| `--radius-md` | 14px | stat box、legend bar |
| `--radius-lg` | 20px | 主要卡片 |
| `--radius-xl` | 28px | 大型容器 (保留) |
| `--radius-pill` | 100px | Pill badges |

### Spacing
- Component padding: 16px / 20px / 24px
- Section gap: 28-32px
- Element gap: 6 / 8 / 10 / 12 / 16 / 20px
- Badge padding: 4-6px vertical, 8-14px horizontal

---

## 6. Design Variables (Pencil Tokens)

可直接匯入 Pencil Variables 系統：

```json
{
  "--bg-primary":        { "type": "color",  "value": "#06090f" },
  "--bg-card":           { "type": "color",  "value": "#0e1626BF" },
  "--bg-card-solid":     { "type": "color",  "value": "#0e1626" },
  "--border":            { "type": "color",  "value": "#ffffff0F" },
  "--accent-copper":     { "type": "color",  "value": "#e8a849" },
  "--accent-copper-dim": { "type": "color",  "value": "#e8a84933" },
  "--color-e":           { "type": "color",  "value": "#4a90d9" },
  "--color-emu":         { "type": "color",  "value": "#2dd4a0" },
  "--color-dr":          { "type": "color",  "value": "#f59e0b" },
  "--color-green":       { "type": "color",  "value": "#2dd4a0" },
  "--color-yellow":      { "type": "color",  "value": "#f59e0b" },
  "--color-red":         { "type": "color",  "value": "#ef4444" },
  "--color-purple":      { "type": "color",  "value": "#8b5cf6" },
  "--text-primary":      { "type": "color",  "value": "#e8edf5" },
  "--text-secondary":    { "type": "color",  "value": "#7a8ba8" },
  "--text-muted":        { "type": "color",  "value": "#4a5873" },
  "--font-display":      { "type": "string", "value": "Outfit" },
  "--font-body":         { "type": "string", "value": "Noto Sans TC" },
  "--font-mono":         { "type": "string", "value": "JetBrains Mono" },
  "--radius-sm":         { "type": "number", "value": 8 },
  "--radius-md":         { "type": "number", "value": 14 },
  "--radius-lg":         { "type": "number", "value": 20 },
  "--radius-xl":         { "type": "number", "value": 28 },
  "--radius-pill":       { "type": "number", "value": 100 }
}
```

---

## 7. Screen Specifications

### Screen 1: Dashboard — 車輛運用總覽 (index.html)

**尺寸**: 1480 x auto

1. **Header** — 左: Depot Badge (copper border pill + 脈動綠點 + 「七堵機務段 · 即時監控」) → 「車輛運用總覽」(Outfit 38px 800 漸層) → 副標; 右: 日期選擇器 (mono, 左右箭頭 flanking 2026/02/24) + 車型 filter chips + 主題切換
2. **Summary Cards ×4** — 配入編組 21輛(+2 green) / 總行駛里程 6307.9km(+890 green) / 運行中車輛 48%(-6.3 red) / 平均里程 300.4km/輛(▲ green)
3. **Charts 2欄** — 左340px: 車種分佈 donut (E:10 blue, EMU:8 emerald, DR:3 amber, center「21 總配置」) + legend; 右flex: 里程排行 horizontal bars by vehicle type color
4. **車輛運用卡片** — copper 標題條, grid of operation cards (E541, EMU3240 etc)
5. **Bottom Stats ×3** — 運用號碼分佈 (horizontal bars) / 控制模式 A/B/C (大字母+數量) / 機務段資訊 (name, location, stats)
6. **Footer** — 「七堵機務段 車輛運用總覽管理系統 — 資料更新時間 2026/02/24」

### Screen 2: Traffic Light — 車輛可用狀態總覽 (vehicle-status.html)

**尺寸**: 1480 x auto

1. **Header** — 左: Depot Badge + 「車輛可用狀態總覽」+ 副標「各車型紅綠燈狀態即時監控 — 可用 / 回送 / 不可用」; 右: glass back button + 段選擇器
2. **Summary Cards ×4** — 車輛總數 🚂 21 / 可用 ✅ 12 green / 回送中 🔄 2 yellow / 不可用 🚫 7 red
3. **Legend Bar** — 居中 glass 面板 (14px corners): 綠圓(glow)+「可用 — 可營運」, 黃圓(pulse glow)+「回送中 — 不可營運但可配駛」, 紅圓(glow)+「不可用 — 檢修/待料/待報廢」
4. **E 系列 — 電力機車** — blue 4px bar + title + badges (5可用/1回送/4不可用) + 「10 輛」; Grid 120px cards: E234(yellow/回送中), E235(green/可用), E236(green), E301(red/檢修), E315(red/檢修), E401(green), E505(green), E527(red/待報廢), E528(red/待料), E541(green)
5. **EMU 系列 — 電聯車** — emerald bar; 5可用/1回送/2不可用/8輛; EMU3230(red/待報廢), EMU3240(green), EMU3250(yellow/回送中), EMU3270(green), EMU3280(green), EMU3300(red/待料), EMU3310(green), EMU3340(green)
6. **DR 系列 — 柴油客車** — amber bar; 2可用/1不可用/3輛; DR1617(green), DR1029(red/檢修), DR1033(green)
7. **Footer** — 「七堵機務段 車輛可用狀態管理系統 — 資料更新時間 2026/02/24 00:31」

### Screen 3: Vehicle History — 車輛運用歷程 (vehicle-history.html)

**尺寸**: 1480 x auto

1. **Header** — 左: glass back btn「← 返回總覽」+ 「E315」(Outfit 42px 800 gradient white→#7a8ba8) + 「電力機車」blue pill + 「檢修」red badge (紅脈動點); 右: copper gradient CTA「📋 開立動態回報」(glow shadow)
2. **Top Row 2欄** — 左340px「基本資料」: copper bar + title, 6 rows with ghost border (車號 E315 mono / 車型 電力機車 / 運用號碼 18 / 配屬段 七堵機務段 / 維運代碼 CTE18 / 目前狀態 檢修 red); 右flex「里程統計」: 3 stat boxes 14px corners (本月 8256km copper / 本年 99.1千km copper / 日均 275.2km white)
3. **KPI Section ×3** — copper bar + 「維修可靠度指標」
   - **MTBF**: green 3px top strip, green pill + ▲11% green trend, 「429 小時」, 「兩次故障平均間隔時間」, green dot 「基準 720 hr，共 6 次故障」, 72px ring 60% green
   - **MDBF**: red strip, red pill + ▼2% red trend, 「13.9k km」, 「兩次故障平均里程」, red dot 「基準 50k km，年估 99k km」, ring 28% red
   - **MTTR**: red strip, red pill + 「— 持平」yellow trend, 「4.2 小時」, 「修復平均維修時間」, red dot 「目標 4 hr，共 6 次維修」, ring 48% yellow
4. **Footer** — 「E315 車輛運用歷程 — 台鐵車輛管理系統」

---

## 8. Pencil AI Prompts (逐頁獨立 Prompt)

以下可直接貼入 Pencil 桌面版 AI 功能來產生畫面。

### Prompt A: Dashboard

```
Design a full-page railway vehicle fleet operations dashboard in Traditional Chinese (zh-TW) with a cinematic command-center dark theme. Width 1480px, vertical layout, padding 40px.

Background: Deep midnight navy (#06090f) with subtle radial gradient nebulae and 60px grid overlay.

Header (horizontal, space-between): Left side — copper-gold pill badge (#e8a849 border, 100px radius) with pulsing green dot and monospace text "七堵機務段 · 即時監控", large title "車輛運用總覽" in Outfit 38px weight 800 with gradient text fill (white to #7a8ba8), subtitle "每日機組組運用管理與指標一覽" in #7a8ba8 14px. Right side — date picker with arrows flanking "2026/02/24" in monospace, filter chips ("全部" in copper #e8a849, "E 電力機車" in #4a90d9, "EMU 電聯車" in #2dd4a0, "DR 柴油客車" in #f59e0b), pill-shaped theme toggle.

Summary Cards Row (4 equal columns, gap 20px): Four glassmorphic cards — background rgba(14,22,38,0.75) with blur(24px), border rgba(255,255,255,0.06) 1px inside, 20px corners, padding 20px. Each card: tinted icon box (40x40px, 8px corners) → large number Outfit 32px bold → unit text → small change badge (100px pill, colored 20% bg). Cards: (1) blue icon "配入編組" value "21" unit "輛" badge "+2 較昨日" green, (2) copper icon "總行駛里程" value "6307.9" unit "km" badge "+890 Fri" green, (3) emerald icon "運行中車輛" value "48" unit "%" badge "-6.3 較昨日" red, (4) amber icon "平均里程" value "300.4" unit "km/輛" badge "▲ 持平" green.

Charts Section (2 columns: 340px fixed + flexible, height 340px, gap 20px): Left panel "車種分佈" — glassmorphic card, donut chart 180px with center text "21 總配置", segments: E 10 blue #4a90d9, EMU 8 emerald #2dd4a0, DR 3 amber #f59e0b. Legend below with colored square dots. Right panel "里程排行" — glassmorphic card, scrollable horizontal bar chart listing vehicles (E541, E505, EMU3300, EMU3240, E236, EMU3270, EMU3340) with gradient-filled bars colored by vehicle type.

Vehicle Cards Section: Section title with 3px copper bar + "車輛運用卡片" Outfit 18px bold. Grid of 2 vehicle operation cards, each: glassmorphic card, clip overflow, header with 4px blue/emerald vertical bar + vehicle ID Outfit 22px bold + monospace subtitle + pill badges, route section with train numbers, dark footer with time "06:04 → 09:56", "車次 8", "里程 356.7km" in copper #e8a849.

Bottom Stats (3 equal columns, gap 20px): (1) "運用號碼分佈" — glassmorphic card with horizontal bar rows, (2) "控制模式" — large letters A (#4a90d9) / B (#2dd4a0) / C (#f59e0b) with counts, (3) "機務段資訊" — depot info with label-value rows.

Footer: Centered text "七堵機務段 車輛運用總覽管理系統 — 資料更新時間 2026/02/24" in #4a5873 Noto Sans TC 11px.
```

### Prompt B: Traffic Light

```
Design a railway vehicle availability status board in Traditional Chinese (zh-TW) with a cinematic command-center dark theme. Width 1480px, vertical layout, padding 40px.

Background: Deep midnight navy (#06090f). Traffic light metaphor: green=available, yellow=in-transit, red=unavailable.

Header (horizontal, space-between): Left — copper pill badge "七堵機務段 · 狀態監控" (#e8a849 border) with pulsing green dot, title "車輛可用狀態總覽" Outfit 38px weight 800 gradient text white to #7a8ba8, subtitle "各車型紅綠燈狀態即時監控 — 可用 / 回送 / 不可用" #7a8ba8 14px. Right — glass back button "← 返回總覽" (rgba(14,22,38,0.75) bg, ghost border, 8px corners).

Summary Cards (4 equal columns, gap 20px): Glassmorphic cards 20px corners. (1) "🚂" + "21" white bold + "車輛總數", (2) "✅" + "12" #2dd4a0 bold + "可用", (3) "🔄" + "2" #f59e0b bold + "回送中", (4) "🚫" + "7" #ef4444 bold + "不可用".

Legend Bar: Centered glassmorphic bar (14px corners, padding 12px 24px, gap 32px) with three entries: (1) Green circle 16px with glow shadow "0 0 20px rgba(45,212,160,0.4)" + "可用 — 可營運", (2) Yellow circle 16px with pulsing glow + "回送中 — 不可營運但可配駛", (3) Red circle 16px with glow + "不可用 — 檢修 / 待料 / 待報廢". Text in #7a8ba8 13px.

E Series Group: Header with 4px blue #4a90d9 vertical bar + "E 系列 — 電力機車" Outfit 18px bold + pill badges ("5 可用" green bg, "1 回送" yellow bg, "4 不可用" red bg) + right "10 輛". Vehicle grid (gap 12px) of 10 cards, each 120px wide, glassmorphic, padding 16px, centered vertical layout: 48px status orb circle (solid fill + outer glow shadow 0 0 20px at 40% opacity) + vehicle ID monospace bold + status label in matching color. Vehicles: E234 yellow "回送中", E235 green "可用", E236 green "可用", E301 red "檢修", E315 red "檢修", E401 green "可用", E505 green "可用", E527 red "待報廢", E528 red "待料", E541 green "可用".

EMU Series Group: Same layout, emerald #2dd4a0 bar. "EMU 系列 — 電聯車", badges "5 可用" "1 回送" "2 不可用" + "8 輛". 8 vehicles: EMU3230 red "待報廢", EMU3240 green "可用", EMU3250 yellow "回送中", EMU3270 green "可用", EMU3280 green "可用", EMU3300 red "待料", EMU3310 green "可用", EMU3340 green "可用".

DR Series Group: Amber #f59e0b bar. "DR 系列 — 柴油客車", badges "2 可用" "1 不可用" + "3 輛". 3 vehicles: DR1617 green "可用", DR1029 red "檢修", DR1033 green "可用".

Footer: Centered "七堵機務段 車輛可用狀態管理系統 — 資料更新時間 2026/02/24 00:31" #4a5873 11px.
```

### Prompt C: Vehicle History

```
Design a railway vehicle detail and operation history page in Traditional Chinese (zh-TW) with a cinematic command-center dark theme. Width 1480px, vertical layout, padding 40px, gap 28px.

Background: Deep midnight navy (#06090f).

Header (single row, space-between, center-aligned): Left side — glass back button "← 返回總覽" (rgba(14,22,38,0.75) bg, ghost border, 8px corners, padding 8px 14px) + large "E315" Outfit 42px weight 800 with gradient text fill (white at top to #7a8ba8 at bottom) + pill badge "電力機車" (background #4a90d918, blue #4a90d9 border, blue text, 100px radius, padding 6px 12px) + red status badge (background #ef444418, red dot with glow + "檢修" in #ef4444, 100px radius). Right side — copper-gold gradient CTA button "📋 開立動態回報" (linear-gradient #e8a849 to #c07818, 8px corners, padding 10px 20px, outer glow shadow rgba(232,168,73,0.27) blur 16px, white bold text).

Top Row (2 columns: 340px + flexible, gap 20px): Left panel "基本資料" — glassmorphic card (20px corners, padding 24px), 3px copper bar + title "基本資料" Outfit 18px bold. Info grid with rows separated by bottom ghost border rgba(255,255,255,0.06): "車號" → "E315" monospace bold, "車型" → "電力機車", "運用號碼" → "18", "配屬段" → "七堵機務段", "維運代碼" → "CTE18", "目前狀態" → "檢修" in red #ef4444. Each row: justify space-between, padding 8px 0. Right panel "里程統計" — glassmorphic card, 3px copper bar + title. Three stat boxes in row (gap 16px, each fill-container width): glassmorphic sub-card with 14px corners, centered vertical layout — (1) "8256" copper #e8a849 Outfit bold + "km" copper + label "本月里程（預估）" #7a8ba8, (2) "99.1" copper + "千km" + "本年里程（預估）", (3) "275.2" white + "km" + "日均里程".

KPI Section: Section title with 3px copper bar + "維修可靠度指標" Outfit 18px bold. Row of 3 equal glassmorphic cards (gap 20px):

Card 1 MTBF: 3px green gradient strip at top border. Horizontal layout (space-between, center-aligned). Left side vertical: "MTBF" pill (green #2dd4a0 bg 20%, green text, 100px radius) + "▲ 11%" green trend badge → large "429" Outfit 38px bold + "小時" unit → "兩次故障平均間隔時間" secondary text → green dot + "基準 720 hr，共 6 次故障" muted text. Right side: 72px ring gauge SVG circle, 6px stroke, background ring rgba(255,255,255,0.06), progress arc green #2dd4a0 at 60%, center "60%" bold + "達標率" label.

Card 2 MDBF: 3px red gradient strip. Same layout. "MDBF" red pill + "▼ 2%" red trend → "13.9k" + "km" → "兩次故障平均里程" → red dot "基準 50k km，年估 99k km". Ring 28% red #ef4444.

Card 3 MTTR: 3px red gradient strip. "MTTR" red pill + "— 持平" yellow #f59e0b trend → "4.2" + "小時" → "修復平均維修時間" → red dot "目標 4 hr，共 6 次維修". Ring 48% yellow/amber #f59e0b.

Footer: Centered "E315 車輛運用歷程 — 台鐵車輛管理系統" #4a5873 11px.
```
