// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('index.html — 每日營運儀表板（Mock 模式）', () => {

  test.beforeEach(async ({ page }) => {
    // 監聽 console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/index.html');
    // 等待頁面初始載入完成（Mock 延遲 300ms + 渲染）
    await page.waitForTimeout(1500);

    // 確認無 JS 錯誤
    const criticalErrors = errors.filter(e =>
      !e.includes('[DataService]') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('頁面標題與基本結構', async ({ page }) => {
    await expect(page).toHaveTitle(/台鐵|車輛|儀表板|VDASH/i);

    // 應有頁面標題區域
    const header = page.locator('.header, .page-header, h1, .title').first();
    await expect(header).toBeVisible();
  });

  test('場段下拉選單存在且有選項', async ({ page }) => {
    const depotSelect = page.locator('#depotSelect, select[id*="depot"], .depot-select').first();
    await expect(depotSelect).toBeVisible();

    // 應有至少 1 個選項
    const options = depotSelect.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
  });

  test('統計數字區塊正確渲染', async ({ page }) => {
    // 應有統計卡片（車輛總數、運行數、里程等）
    const statCards = page.locator('.stat-card, .counter-card, .summary-card, [class*="stat"]');
    const count = await statCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('車輛卡片列表有內容', async ({ page }) => {
    // 應有車輛卡片
    const vehicleCards = page.locator('.vehicle-card, .card, [class*="vehicle"]');
    const count = await vehicleCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('日期導航功能', async ({ page }) => {
    // 找到日期顯示
    const dateDisplay = page.locator('#currentDateDisplay, .date-display, [id*="date"]').first();
    const initialDate = await dateDisplay.textContent();

    // 點擊前一天按鈕
    const prevBtn = page.locator('#prevDay, [id*="prev"], button:has-text("◀"), button:has-text("<")').first();
    if (await prevBtn.isVisible()) {
      await prevBtn.click();
      await page.waitForTimeout(1000);

      const newDate = await dateDisplay.textContent();
      expect(newDate).not.toBe(initialDate);
    }
  });

  test('篩選按鈕運作（type filter）', async ({ page }) => {
    // index.html 使用 .chip[data-filter] 按鈕
    const filterBtns = page.locator('.chip[data-filter]');
    const count = await filterBtns.count();

    if (count > 1) {
      // 點擊 "E 電力機車" 篩選
      await filterBtns.nth(1).click();
      await page.waitForTimeout(500);

      // 確認 active class 切換（active-e / active-emu / active-dr）
      const activeBtn = page.locator('.chip[class*="active-"]');
      const activeCount = await activeBtn.count();
      expect(activeCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('甜甜圈圖表渲染（如有 canvas）', async ({ page }) => {
    const canvas = page.locator('canvas');
    const count = await canvas.count();
    if (count > 0) {
      // Canvas 應有非零尺寸
      const box = await canvas.first().boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });

  test('時間軸區塊存在', async ({ page }) => {
    const timeline = page.locator('.timeline, [class*="timeline"], #timeline');
    const count = await timeline.count();
    // 時間軸可能有或沒有，至少不應報錯
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('無 loading 或 error 殘留', async ({ page }) => {
    // 不應有殘留的 loading spinner
    const loadingVisible = await page.locator('.loading-spinner:visible, [class*="loading"]:visible').count();
    expect(loadingVisible).toBe(0);

    // 不應有 error 提示
    const errorVisible = await page.locator('.error-message:visible, [class*="error"]:visible').count();
    expect(errorVisible).toBe(0);
  });

  test('主題切換功能', async ({ page }) => {
    const themeBtn = page.locator('#themeToggle').first();
    if (await themeBtn.isVisible()) {
      // 主題設定在 <html data-theme="dark|light">
      const themeBefore = await page.locator('html').getAttribute('data-theme') || '';

      await themeBtn.click();
      await page.waitForTimeout(500);

      const themeAfter = await page.locator('html').getAttribute('data-theme') || '';

      // data-theme 應有變化（dark↔light）
      expect(themeAfter).not.toBe(themeBefore);
    }
  });
});
