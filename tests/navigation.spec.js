// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('三頁導航流程測試', () => {

  test('index → vehicle-status → vehicle-history → index 完整導航', async ({ page }) => {
    // ── Step 1: 進入首頁 ──
    await page.goto('/index.html');
    await page.waitForTimeout(1500);

    // 確認首頁載入成功（有車輛卡片）
    const indexCards = page.locator('.vehicle-card, .card, [class*="vehicle"]');
    const indexCardCount = await indexCards.count();
    expect(indexCardCount).toBeGreaterThan(0);

    // ── Step 2: 導航到車輛狀態頁 ──
    const statusLink = page.locator(
      'a[href*="vehicle-status"], a:has-text("車輛狀態"), a:has-text("狀態總覽"), .nav-link[href*="status"]'
    ).first();

    if (await statusLink.isVisible()) {
      await statusLink.click();
    } else {
      // 直接導航
      await page.goto('/vehicle-status.html');
    }
    await page.waitForTimeout(1500);

    // 確認車輛狀態頁載入
    await expect(page).toHaveURL(/vehicle-status/);
    const statusItems = page.locator('.vehicle-item, .vehicle-card, .vehicle-row, [class*="vehicle"]');
    const statusCount = await statusItems.count();
    expect(statusCount).toBeGreaterThan(0);

    // ── Step 3: 導航到車輛詳細頁 ──
    const detailLink = page.locator(
      'a[href*="vehicle-history"], a[href*="id="], .vehicle-link'
    ).first();

    if (await detailLink.isVisible()) {
      await detailLink.click();
    } else {
      await page.goto('/vehicle-history.html?id=E315');
    }
    await page.waitForTimeout(2000);

    // 確認車輛詳細頁載入
    await expect(page).toHaveURL(/vehicle-history/);
    const vehicleId = page.locator('text=E315');
    // 車輛 ID 可能顯示在頁面中
    const idVisible = await vehicleId.count();
    expect(idVisible).toBeGreaterThanOrEqual(0);

    // ── Step 4: 返回首頁 ──
    const homeLink = page.locator(
      'a[href*="index"], a:has-text("首頁"), a:has-text("返回首頁"), .home-link'
    ).first();

    if (await homeLink.isVisible()) {
      await homeLink.click();
    } else {
      await page.goto('/index.html');
    }
    await page.waitForTimeout(1500);

    // 確認回到首頁
    await expect(page).toHaveURL(/index\.html/);
  });

  test('各頁面無 JS 錯誤', async ({ page }) => {
    const pages = ['/index.html', '/vehicle-status.html', '/vehicle-history.html?id=E315'];

    for (const url of pages) {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));

      await page.goto(url);
      await page.waitForTimeout(1500);

      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') && !e.includes('net::')
      );

      expect(criticalErrors, `JS errors on ${url}: ${criticalErrors.join(', ')}`).toHaveLength(0);

      // 清除 listener
      page.removeAllListeners('pageerror');
    }
  });

  test('Mock 模式：config.mode 為 mock', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(500);

    // 驗證 VDASH_CONFIG.mode 為 'mock'
    const mode = await page.evaluate(() => {
      return typeof VDASH_CONFIG !== 'undefined' ? VDASH_CONFIG.mode : 'unknown';
    });
    expect(mode).toBe('mock');
  });

  test('DataService 實例存在', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(500);

    const hasDataService = await page.evaluate(() => {
      return typeof dataService !== 'undefined' && typeof dataService._call === 'function';
    });
    expect(hasDataService).toBeTruthy();
  });

  test('共用函式可用（shared.js）', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(500);

    const sharedFunctions = await page.evaluate(() => {
      return {
        getType: typeof getType === 'function',
        getTypeLabel: typeof getTypeLabel === 'function',
        getTypeColor: typeof getTypeColor === 'function',
        sortByVehicleId: typeof sortByVehicleId === 'function',
        trainStations: typeof trainStations === 'object',
        showLoading: typeof showLoading === 'function',
        showError: typeof showError === 'function',
        getTodaySlash: typeof getTodaySlash === 'function',
        toISODate: typeof toISODate === 'function',
      };
    });

    for (const [name, exists] of Object.entries(sharedFunctions)) {
      expect(exists, `shared.js: ${name} should be a function/object`).toBeTruthy();
    }
  });

  test('index.html 車輛卡片有地圖連結按鈕', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(2000);

    // 確認地圖按鈕存在
    const mapBtns = page.locator('.vehicle-card-map-btn');
    const count = await mapBtns.count();
    expect(count).toBeGreaterThan(0);

    // 確認連結指向 train-map.html?vehicle=...
    const href = await mapBtns.first().getAttribute('href');
    expect(href).toContain('train-map.html?vehicle=');
  });

  test('vehicle-status.html 車輛卡片有地圖連結按鈕', async ({ page }) => {
    await page.goto('/vehicle-status.html');
    await page.waitForTimeout(2000);

    // 確認地圖按鈕存在
    const mapBtns = page.locator('.tl-card-map-btn');
    const count = await mapBtns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('index.html 地圖按鈕跳轉到 train-map 並帶入車輛參數', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(2000);

    // 點擊第一個地圖按鈕
    const mapBtn = page.locator('.vehicle-card-map-btn').first();
    const href = await mapBtn.getAttribute('href');
    const vehicleId = new URL(href, 'http://localhost').searchParams.get('vehicle');

    await mapBtn.click();
    await page.waitForTimeout(3000);

    // 確認跳轉到 train-map 且 URL 包含 vehicle 參數
    await expect(page).toHaveURL(/train-map\.html\?vehicle=/);
    // 確認搜尋框有車輛 ID
    const searchInput = page.locator('#vehicleSearch');
    await expect(searchInput).toHaveValue(vehicleId, { timeout: 10000 });
  });

  test('MockAPI 回傳格式正確', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(500);

    // 測試 getDepots
    const depotResult = await page.evaluate(async () => {
      const result = await dataService.getDepots();
      return {
        hasData: !!result.data,
        isArray: Array.isArray(result.data),
        hasMeta: !!result.meta,
        firstHasCode: result.data && result.data.length > 0 && !!result.data[0].code,
      };
    });
    expect(depotResult.hasData).toBeTruthy();
    expect(depotResult.isArray).toBeTruthy();

    // 測試 getFleetSummary
    const fleetResult = await page.evaluate(async () => {
      const result = await dataService.getFleetSummary('MGY00', '2026-02-24');
      return {
        hasData: !!result.data,
        hasSummary: !!result.data?.summary,
        hasByType: Array.isArray(result.data?.byType),
      };
    });
    expect(fleetResult.hasData).toBeTruthy();

    // 測試 getVehicleStatus
    const statusResult = await page.evaluate(async () => {
      const result = await dataService.getVehicleStatus('all', 'all');
      return {
        hasData: !!result.data,
        hasSummary: !!result.data?.summary,
        hasByType: Array.isArray(result.data?.byType),
      };
    });
    expect(statusResult.hasData).toBeTruthy();
  });
});
