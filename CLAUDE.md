# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

台鐵車輛運用管理儀表板 (TRA Vehicle Fleet Operations Dashboard) — a static frontend dashboard for monitoring railway vehicle fleet operations. Data comes from IBM Maximo via Automation Scripts, with a mock mode for offline development.

## Commands

```bash
# Serve locally (Python required)
npm run serve          # or: python -m http.server 8765

# Run all Playwright tests (auto-starts server)
npm test

# Run tests with browser visible
npm run test:headed

# Run a single test file
npx playwright test tests/index.spec.js

# Run a specific test by name
npx playwright test -g "頁面標題與基本結構"
```

## Architecture

### Pages (all self-contained HTML with inline CSS/JS)
- `index.html` — 每日營運儀表板: fleet summary, daily ops by depot/date, vehicle cards with status
- `vehicle-status.html` — 車輛狀態總覽: all vehicles across depots, filterable by type
- `vehicle-history.html` — 車輛歷程: individual vehicle detail, maintenance/fault history, KPI charts

### Data Layer (`js/`)
Three-tier architecture with unified interface:

1. **`config.js`** — `VDASH_CONFIG` singleton. Set `mode: 'mock'` (default) or `mode: 'api'` to switch data source.
2. **`api-client.js`** — `MaximoAPI` class. REST client with retry logic (retries on 5xx, not 4xx), timeout via AbortController.
3. **`mock-data.js`** — `MockAPI` class. Same interface as MaximoAPI, returns hardcoded data matching `docs/API_DESIGN.md` schema. Contains `MOCK_ALL_DATA` and `MOCK_DEPOT_META`.
4. **`data-service.js`** — `DataService` class (instantiated as global `dataService`). Routes calls to MaximoAPI or MockAPI based on config. Auto-fallbacks to mock on 5xx/network errors with a yellow banner.
5. **`shared.js`** — Shared utilities: vehicle type detection (`getType`), color/label helpers, sorting, station data.

**Script load order** (all pages): `config.js` → `shared.js` → `api-client.js` → `mock-data.js` → `data-service.js`

### Backend Scripts (`autoscripts/`)
IBM Maximo Jython Automation Scripts (reference only, deployed to Maximo server):
- `VDASH_DEPOTS.py`, `VDASH_FLEET_SUMMARY.py`, `VDASH_DAILY_OPS.py`, `VDASH_VEHICLE_STATUS.py`, `VDASH_VEHICLE_DETAIL.py`, `VDASH_MAINT_HISTORY.py`, `VDASH_FAULT_HISTORY.py`, `VDASH_VEHICLE_KPI.py`, `VDASH_DYNAMIC_REPORT.py`

### API Design
- Full API contract documented in `docs/API_DESIGN.md`
- Endpoints: `/depots`, `/fleet-summary`, `/daily-ops`, `/vehicle-status`, `/vehicle-detail`, `/maint-history`, `/fault-history`, `/vehicle-kpi`, `/dynamic-report`, `/latest-data-date`

## Design System
- Dark/Light theme toggle via `data-theme` attribute on `<html>`
- Glassmorphism panels with `backdrop-filter: blur(24px)`
- Copper-gold accent color (`--accent-copper: #e8a849`)
- Vehicle type colors: E series (blue `--color-e`), EMU (green `--color-emu`), DR (amber `--color-dr`)
- Status colors: green (available), yellow (returning), red (maintenance)
- Full design spec in `DESIGN.md`

## Key Conventions
- All UI text is in 繁體中文 (Traditional Chinese)
- No build step — plain HTML/CSS/JS served via static file server
- Chart.js 4.x loaded from CDN for data visualizations
- Mock data date range centers around 2026/02/24
- Playwright tests run against `http://localhost:8765` (Chromium only, sequential)
- Tests are in `tests/` directory with `.spec.js` extension

## Deployment (PCM: 192.168.1.44)

Dashboard runs as Docker containers on PCM at port 8880.
Cloudflare Tunnel maps `https://dashboard.nickai.cc/` → `localhost:8880`.

```bash
# 1. Sync files to PCM
rsync -avz \
  --exclude '.git' --exclude 'node_modules' --exclude '.env' \
  --exclude '__pycache__' --exclude 'tests' --exclude 'playwright.config.js' \
  --exclude 'stitch' --exclude 'autoscripts' --exclude 'docs' \
  --exclude 'CLAUDE.md' --exclude 'DESIGN.md' --exclude 'README_DEPLOY.md' \
  -e "sshpass -p 'zaq1xsW2' ssh" \
  ./ root@192.168.1.44:/root/car_statement/

# 2. Fix permissions (REQUIRED — rsync from macOS creates 600 files, nginx needs read)
sshpass -p 'zaq1xsW2' ssh root@192.168.1.44 \
  "chmod -R a+rX /root/car_statement/"

# 3. Rebuild and restart containers
sshpass -p 'zaq1xsW2' ssh root@192.168.1.44 \
  "cd /root/car_statement && docker compose up -d --build"
```

### ⚠️ File Permissions
rsync from macOS creates files with 600 (owner-only). Nginx in Docker runs as
`nginx` user and needs read access. Step 2 above is **mandatory** — without it
all JS/HTML files will return 403 Forbidden.
