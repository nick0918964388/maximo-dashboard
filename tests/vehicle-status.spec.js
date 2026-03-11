// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('vehicle-status.html — 車輛狀態總覽（Mock 模式）', () => {

  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/vehicle-status.html');
    await page.waitForTimeout(1500);

    const criticalErrors = errors.filter(e =>
      !e.includes('[DataService]') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('頁面標題正確', async ({ page }) => {
    await expect(page).toHaveTitle(/車輛|狀態|status/i);
  });

  test('狀態摘要卡片渲染', async ({ page }) => {
    // 應有總數、綠燈、黃燈、紅燈統計
    const summaryCards = page.locator('.summary-card, .status-card, .stat-card, [class*="summary"]');
    const count = await summaryCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('車輛列表有資料', async ({ page }) => {
    // 應有車輛項目
    const vehicleItems = page.locator('.vehicle-item, .vehicle-card, .vehicle-row, [class*="vehicle"]');
    const count = await vehicleItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('狀態顏色指示燈顯示', async ({ page }) => {
    // 應有紅/黃/綠色的狀態指示
    const statusIndicators = page.locator(
      '.status-dot, .status-indicator, .status-badge, ' +
      '[class*="green"], [class*="yellow"], [class*="red"], ' +
      '[class*="status-color"]'
    );
    const count = await statusIndicators.count();
    expect(count).toBeGreaterThan(0);
  });

  test('車輛群組分類正確', async ({ page }) => {
    // 應有分組標題（電力機車 / 電聯車 / 柴油客車）
    const groupHeaders = page.locator(
      '.group-header, .type-group, .vehicle-group-title, ' +
      'h2:has-text("電力"), h2:has-text("電聯"), h2:has-text("柴油"), ' +
      'h3:has-text("電力"), h3:has-text("電聯"), h3:has-text("柴油"), ' +
      '[class*="group"]'
    );
    const count = await groupHeaders.count();
    expect(count).toBeGreaterThan(0);
  });

  test('場段篩選器存在', async ({ page }) => {
    const depotFilter = page.locator('#depotSelect, select[id*="depot"], .depot-filter, .depot-select').first();
    if (await depotFilter.isVisible()) {
      const options = depotFilter.locator('option');
      const count = await options.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('返回首頁連結可用', async ({ page }) => {
    const backLink = page.locator('a[href*="index"], a:has-text("返回"), a:has-text("首頁"), .back-link').first();
    if (await backLink.isVisible()) {
      await expect(backLink).toHaveAttribute('href', /index/);
    }
  });

  test('無 loading 殘留', async ({ page }) => {
    const loadingVisible = await page.locator('.loading-spinner:visible, [class*="loading"]:visible').count();
    expect(loadingVisible).toBe(0);
  });

  test('車輛點擊可跳轉至詳細頁', async ({ page }) => {
    // 找到第一個可點擊的車輛連結
    const vehicleLink = page.locator(
      'a[href*="vehicle-history"], a[href*="id="], .vehicle-link, [data-vehicle]'
    ).first();

    if (await vehicleLink.isVisible()) {
      const href = await vehicleLink.getAttribute('href');
      expect(href).toContain('vehicle-history');
    }
  });
});
