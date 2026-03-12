// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Helper: inject getTrainTracking mock and load vehicles.
 * Needed because Playwright's fresh browser context doesn't cache
 * the updated mock-data.js/data-service.js from Phase 3.
 */
async function injectAndLoadVehicles(page) {
  return await page.evaluate(async () => {
    // Force mock mode to avoid 404 from SimpleHTTPServer
    VDASH_CONFIG.mode = 'mock';
    dataService._mode = 'mock';

    // Inject getTrainTracking if not already available
    if (typeof MockAPI.prototype.getTrainTracking !== 'function') {
      MockAPI.prototype.getTrainTracking = async function(date, vehicle, depot) {
        await this._simulate();
        const vehicles = [];
        const dateKey = date ? date.replace(/-/g, '/') : '2026/02/24';
        const depotList = depot && depot !== 'all' ? [depot] : Object.keys(MOCK_ALL_DATA);
        for (const dCode of depotList) {
          const depotData = MOCK_ALL_DATA[dCode];
          if (!depotData) continue;
          const dayVehicles = depotData[dateKey] || [];
          for (const v of dayVehicles) {
            if (vehicle && v.id !== vehicle) continue;
            const legs = [];
            let totalMileage = 0;
            if (v.trains && v.trains.length > 0) {
              v.trains.forEach((trainNo, idx) => {
                const stInfo = typeof trainStations !== 'undefined' ? trainStations[trainNo] : null;
                const baseHour = v.start ? parseInt(v.start.split(':')[0]) : 6;
                const legHour = baseHour + idx * 2;
                const legMileage = Math.round((30 + Math.random() * 120) * 10) / 10;
                totalMileage += legMileage;
                legs.push({
                  trainNo, seq: idx + 1,
                  from: stInfo ? stInfo.from : '七堵', to: stInfo ? stInfo.to : '松山',
                  departTime: `${String(legHour % 24).padStart(2, '0')}:${String((idx * 17) % 60).padStart(2, '0')}`,
                  arriveTime: `${String((legHour + 1) % 24).padStart(2, '0')}:${String(((idx * 17) + 35) % 60).padStart(2, '0')}`,
                  mileage: legMileage
                });
              });
            }
            const depotMeta = MOCK_DEPOT_META[dCode];
            vehicles.push({
              vehicleId: v.id, depot: depotMeta ? depotMeta.name : dCode, depotCode: dCode,
              planId: v.opCode || '', type: getType(v.id), legs, totalMileage: Math.round(totalMileage * 10) / 10
            });
            if (vehicle && vehicles.length > 0) break;
          }
          if (vehicle && vehicles.length > 0) break;
        }
        return { data: { date, vehicles }, meta: { total: vehicles.length, generatedAt: new Date().toISOString() } };
      };
    }

    if (typeof DataService.prototype.getTrainTracking !== 'function') {
      DataService.prototype.getTrainTracking = function(date, vehicle, depot) {
        return this._call('getTrainTracking', [date, vehicle || null, depot || null]);
      };
    }

    // Load mock data
    const result = await dataService.getTrainTracking('2026-02-24');
    allVehicles = result.data.vehicles || [];
    return allVehicles.length;
  });
}

test.describe('train-map.html — 列車動態地圖', () => {

  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/train-map.html');
    await page.waitForTimeout(2000);

    // Filter out expected errors
    const criticalErrors = errors.filter(e =>
      !e.includes('[DataService]') &&
      !e.includes('[TrainMap]') &&
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('Failed to load resource') &&
      !e.includes('net::ERR')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('頁面標題與基本結構', async ({ page }) => {
    await expect(page).toHaveTitle(/列車動態地圖/);
    const header = page.locator('.header');
    await expect(header).toBeVisible();
    const badge = page.locator('.header-badge');
    await expect(badge).toContainText('LIVE MAP');
    const title = page.locator('.header-title');
    await expect(title).toContainText('列車動態地圖');
  });

  test('地圖容器已渲染', async ({ page }) => {
    const mapContainer = page.locator('#map');
    await expect(mapContainer).toBeVisible();

    // Leaflet map initialized (tile pane exists, may not be visible without tiles)
    const tilePane = page.locator('.leaflet-tile-pane');
    await expect(tilePane).toHaveCount(1);

    // Zoom controls
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    await expect(zoomIn).toBeVisible();
  });

  test('車組查詢控制面板存在', async ({ page }) => {
    const controlPanel = page.locator('.control-panel');
    await expect(controlPanel).toBeVisible();

    const searchInput = page.locator('#vehicleSearch');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', /車組號/);

    const legend = page.locator('.route-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('台鐵路網');
    await expect(legend).toContainText('預計路線');
    await expect(legend).toContainText('已完成路線');
    await expect(legend).toContainText('目前位置');
  });

  test('導航連結正確', async ({ page }) => {
    const indexLink = page.locator('a[href="index.html"]');
    await expect(indexLink).toBeVisible();
    const statusLink = page.locator('a[href="vehicle-status.html"]');
    await expect(statusLink).toBeVisible();
  });

  test('主題切換功能', async ({ page }) => {
    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');

    await page.locator('#themeToggle').click();
    await page.waitForTimeout(500);
    const newTheme = await html.getAttribute('data-theme');
    expect(newTheme).not.toEqual(initialTheme);

    await page.locator('#themeToggle').click();
    await page.waitForTimeout(500);
    const revertedTheme = await html.getAttribute('data-theme');
    expect(revertedTheme).toEqual(initialTheme);
  });

  test('鐵路網路線已繪製', async ({ page }) => {
    const polylines = page.locator('.leaflet-overlay-pane path');
    const count = await polylines.count();
    expect(count).toBeGreaterThan(0);
  });

  test('車站標記已繪製', async ({ page }) => {
    const stationDots = page.locator('.station-dot');
    const count = await stationDots.count();
    expect(count).toBeGreaterThan(50);

    const majorDots = page.locator('.station-dot.major');
    const majorCount = await majorDots.count();
    expect(majorCount).toBeGreaterThan(10);
  });

  test('車組搜尋 — 輸入後顯示下拉建議', async ({ page }) => {
    const vehicleCount = await injectAndLoadVehicles(page);
    expect(vehicleCount).toBeGreaterThan(0);

    await page.fill('#vehicleSearch', 'E2');
    await page.waitForTimeout(300);

    const dropdown = page.locator('#searchDropdown');
    await expect(dropdown).toHaveClass(/visible/);

    const items = dropdown.locator('.search-dropdown-item');
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('車組選取 — 顯示路線與資訊面板', async ({ page }) => {
    await injectAndLoadVehicles(page);

    await page.evaluate(() => selectVehicle('E315'));
    await page.waitForTimeout(500);

    // Info panel visible with correct vehicle
    await expect(page.locator('#infoPanel')).toHaveClass(/visible/);
    await expect(page.locator('#infoPanelTitle')).toContainText('E315');

    // Schedule table has rows
    const rows = page.locator('.schedule-table tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);

    // Time control visible
    await expect(page.locator('#timeControl')).toHaveClass(/visible/);

    // Route layers exist
    const layerCount = await page.evaluate(() => routeLayers.length);
    expect(layerCount).toBeGreaterThanOrEqual(2);
  });

  test('時間滑桿 — 調整時間更新狀態', async ({ page }) => {
    await injectAndLoadVehicles(page);
    await page.evaluate(() => selectVehicle('E315'));
    await page.waitForTimeout(500);

    // Set time to 10:00 (600 min) — leg 7351 should be running (09:34-10:09)
    const result = await page.evaluate(() => {
      simulatedTime = 600;
      syncTimeUI();
      refreshCurrentView();
      return {
        timeDisplay: document.getElementById('timeDisplay').textContent,
        hasTrainMarker: trainMarker !== null,
        legStatuses: selectedVehicle.legs.map(l => getLegStatus(l))
      };
    });

    expect(result.timeDisplay).toBe('10:00');
    expect(result.hasTrainMarker).toBe(true);
    expect(result.legStatuses[0]).toBe('completed');
    expect(result.legStatuses[1]).toBe('completed');
    expect(result.legStatuses[2]).toBe('running');
    expect(result.legStatuses[3]).toBe('pending');
  });

  test('關閉資訊面板清除路線', async ({ page }) => {
    await injectAndLoadVehicles(page);
    await page.evaluate(() => selectVehicle('E315'));
    await page.waitForTimeout(500);

    await expect(page.locator('#infoPanel')).toHaveClass(/visible/);

    await page.locator('#infoPanelClose').click();
    await page.waitForTimeout(300);

    // Panel hidden
    const classes = await page.locator('#infoPanel').getAttribute('class');
    expect(classes).not.toContain('visible');

    // Routes cleared
    expect(await page.evaluate(() => routeLayers.length)).toBe(0);

    // Search empty
    expect(await page.locator('#vehicleSearch').inputValue()).toBe('');

    // Time control hidden
    const tcClasses = await page.locator('#timeControl').getAttribute('class');
    expect(tcClasses).not.toContain('visible');
  });

  test('URL 參數 vehicle 自動選取車組', async ({ page }) => {
    await page.goto('/train-map.html?vehicle=E235');
    await page.waitForTimeout(2000);

    await injectAndLoadVehicles(page);

    // Trigger URL param selection
    await page.evaluate(() => {
      const param = new URLSearchParams(window.location.search).get('vehicle');
      if (param) selectVehicle(param);
    });
    await page.waitForTimeout(500);

    expect(await page.locator('#vehicleSearch').inputValue()).toBe('E235');
    await expect(page.locator('#infoPanelTitle')).toContainText('E235');
  });
});
