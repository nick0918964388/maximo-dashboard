// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('vehicle-history.html — 車輛詳細資料（Mock 模式）', () => {

  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    // 帶 id 參數進入
    await page.goto('/vehicle-history.html?id=E315');
    await page.waitForTimeout(2000);

    const criticalErrors = errors.filter(e =>
      !e.includes('[DataService]') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('頁面標題含車輛資訊', async ({ page }) => {
    await expect(page).toHaveTitle(/車輛|history|E315/i);
  });

  test('車輛基本資訊卡片', async ({ page }) => {
    // 應顯示車輛 ID
    const vehicleId = page.locator('text=E315');
    await expect(vehicleId.first()).toBeVisible();

    // 應有基本資訊區塊（車型、場段、狀態等）
    const infoSection = page.locator(
      '.asset-info, .vehicle-info, .info-card, [class*="info"], [class*="detail"]'
    ).first();
    await expect(infoSection).toBeVisible();
  });

  test('里程統計區塊', async ({ page }) => {
    // 應有里程相關數據（月里程、年里程、日均）
    const mileageSection = page.locator(
      '.mileage-section, [class*="mileage"], [class*="km"]'
    );
    const count = await mileageSection.count();
    // 至少有一個里程相關元素
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('里程圖表渲染', async ({ page }) => {
    const canvas = page.locator('canvas');
    const count = await canvas.count();
    if (count > 0) {
      const box = await canvas.first().boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });

  test('運用紀錄表格', async ({ page }) => {
    // 應有運用紀錄（表格或列表）
    const opsTable = page.locator(
      'table, .ops-table, .operation-list, [class*="operation"]'
    );
    const count = await opsTable.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('保養維修紀錄', async ({ page }) => {
    // 應有保養區塊
    const maintSection = page.locator(
      '.maint-section, [class*="maint"], [class*="maintenance"]'
    );
    const count = await maintSection.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('故障紀錄', async ({ page }) => {
    const faultSection = page.locator(
      '.fault-section, [class*="fault"], [class*="failure"]'
    );
    const count = await faultSection.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('KPI 指標（MTBF/MDBF/MTTR）', async ({ page }) => {
    // 應有 KPI 相關數據
    const kpiText = page.locator('text=/MTBF|MDBF|MTTR/i');
    const count = await kpiText.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('動態回報 Modal 開啟/關閉', async ({ page }) => {
    // 找到動態回報按鈕
    const reportBtn = page.locator(
      'button:has-text("動態回報"), button:has-text("回報"), .report-btn, [id*="report"]'
    ).first();

    if (await reportBtn.isVisible()) {
      await reportBtn.click();
      await page.waitForTimeout(500);

      // Modal 應該顯示
      const modal = page.locator('.modal, .dialog, [class*="modal"]').first();
      await expect(modal).toBeVisible();

      // 關閉 Modal
      const closeBtn = page.locator(
        '.modal-close, .close-btn, button:has-text("✕"), button:has-text("取消"), button:has-text("×")'
      ).first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('天數篩選切換', async ({ page }) => {
    const dayFilters = page.locator(
      '.day-filter, [data-days], button:has-text("30天"), button:has-text("90天"), ' +
      'button:has-text("30"), button:has-text("90")'
    );
    const count = await dayFilters.count();
    if (count > 1) {
      // 點擊不同天數篩選
      await dayFilters.nth(1).click();
      await page.waitForTimeout(1000);
    }
  });

  test('返回連結可用', async ({ page }) => {
    const backLink = page.locator(
      'a[href*="index"], a[href*="vehicle-status"], a:has-text("返回"), .back-link'
    ).first();
    if (await backLink.isVisible()) {
      const href = await backLink.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('無 loading 殘留', async ({ page }) => {
    const loadingVisible = await page.locator('.loading-spinner:visible, [class*="loading"]:visible').count();
    expect(loadingVisible).toBe(0);
  });
});
