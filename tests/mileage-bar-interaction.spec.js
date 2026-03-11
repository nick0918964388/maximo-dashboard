// @ts-check
/**
 * 里程排行欄位點擊互動測試
 * Mileage Bar Click Interaction E2E Test
 *
 * 測試說明：
 * - 遠端群組：測試 http://192.168.1.214:8880（當前已部署版本）
 * - 本地群組：測試 http://localhost:8765（新功能版本，透過 route 攔截強制 mock fallback）
 *
 * 測試場景：
 * 1. 初始狀態：里程列表有項目、無 active class
 * 2. 點擊里程欄位 → active class 套用、搜尋輸入框填入車輛 ID、車輛卡片過濾
 * 3. 再次點擊同一欄位 → toggle off：搜尋清除、所有車輛恢復顯示
 * 4. bar 寬度動畫已完成
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const REMOTE_URL = 'http://192.168.1.214:8880';
const LOCAL_URL = 'http://localhost:8765';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results');

// 等待里程列表出現的 helper
async function waitForMileageList(page, timeout = 20000) {
  await page.waitForSelector('#mileageList .mileage-item', {
    state: 'visible',
    timeout,
  });
  // 額外等待 bar 寬度動畫完成
  await page.waitForTimeout(700);
}

// ═══════════════════════════════════════════════
// 遠端伺服器測試群組（當前部署版本）
// ═══════════════════════════════════════════════
test.describe('里程排行欄位點擊互動 — 遠端伺服器 (192.168.1.214:8880)', () => {

  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(REMOTE_URL + '/index.html');
    await waitForMileageList(page);
  });

  test('初始狀態截圖 — 里程列表有項目且無 active 狀態', async ({ page }) => {
    await page.screenshot({
      path: path.join(RESULTS_DIR, '01-remote-mileage-initial-state.png'),
      fullPage: false,
    });

    const items = page.locator('#mileageList .mileage-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    console.log('[遠端] 里程列表共 ' + count + ' 個項目');

    // 無 active 項目
    const activeItems = page.locator('#mileageList .mileage-item.active');
    await expect(activeItems).toHaveCount(0);

    // 搜尋框為空
    await expect(page.locator('#vehicleSearchInput')).toHaveValue('');
  });

  test('點擊里程欄位 — 功能狀態偵測', async ({ page }) => {
    const items = page.locator('#mileageList .mileage-item');
    const firstItem = items.first();

    // 取得車輛識別資訊
    const vehicleId = await firstItem.getAttribute('data-vehicle-id');
    const vehicleLabel = await firstItem.locator('.mileage-label').textContent();
    const targetId = (vehicleId || vehicleLabel || '').trim();
    console.log('[遠端] 點擊車輛：' + targetId + ' (data-vehicle-id: ' + vehicleId + ')');

    // 點擊
    await firstItem.click();
    await page.waitForTimeout(500);

    // 截圖：點擊後
    await page.screenshot({
      path: path.join(RESULTS_DIR, '02-remote-mileage-after-click.png'),
      fullPage: false,
    });

    // 偵測是否有新功能（active class）
    const hasActive = await firstItem.evaluate(function(el) { return el.classList.contains('active'); });
    if (hasActive) {
      await expect(firstItem).toHaveClass(/active/);
      console.log('[遠端] active class 已套用 — 新功能已部署');

      // 其他項目無 active
      const itemCount = await items.count();
      for (let i = 1; i < itemCount; i++) {
        const cls = await items.nth(i).getAttribute('class') || '';
        expect(cls).not.toContain('active');
      }

      // 搜尋框填入車輛 ID
      const searchInput = page.locator('#vehicleSearchInput');
      const searchVal = await searchInput.inputValue();
      console.log('[遠端] 搜尋框值：' + searchVal);
      expect(searchVal).toBeTruthy();

      // 車輛卡片過濾
      const vehicleCards = page.locator('.vehicle-card');
      const visibleCount = await vehicleCards.count();
      console.log('[遠端] 過濾後顯示 ' + visibleCount + ' 張車輛卡片');
      expect(visibleCount).toBeGreaterThanOrEqual(1);
    } else {
      console.warn('[遠端] 點擊後無 active class — 遠端版本不支援 toggle 功能');
      console.warn('[遠端] 需要將本地 index.html 部署到伺服器後重新測試');
      test.info().annotations.push({
        type: 'warning',
        description: '遠端版本缺少 toggle 功能（data-vehicle-id + click handler），需部署 index.html 後重新測試'
      });
    }
  });

  test('Toggle off 功能（需新版）— 再次點擊清除搜尋、恢復所有車輛', async ({ page }) => {
    const firstItem = page.locator('#mileageList .mileage-item').first();
    const vehicleCards = page.locator('.vehicle-card');
    const totalCardsBefore = await vehicleCards.count();

    // 第一次點擊
    await firstItem.click();
    await page.waitForTimeout(500);

    const hasActive = await firstItem.evaluate(function(el) { return el.classList.contains('active'); });
    if (!hasActive) {
      test.skip(true, '遠端版本不支援 active/toggle 功能，略過此測試（需部署新版 index.html）');
      return;
    }

    // 截圖：已過濾
    await page.screenshot({
      path: path.join(RESULTS_DIR, '03-remote-mileage-filtered.png'),
      fullPage: false,
    });

    // 第二次點擊：toggle off
    await firstItem.click();
    await page.waitForTimeout(500);

    // 截圖：toggle off 後
    await page.screenshot({
      path: path.join(RESULTS_DIR, '04-remote-mileage-toggled-off.png'),
      fullPage: false,
    });

    // active class 移除
    const classList = await firstItem.getAttribute('class') || '';
    expect(classList).not.toContain('active');

    // 搜尋框清空
    await expect(page.locator('#vehicleSearchInput')).toHaveValue('');

    // 車輛卡片恢復
    const totalCardsAfter = await vehicleCards.count();
    console.log('[遠端] Toggle off 後：' + totalCardsAfter + ' 張（初始：' + totalCardsBefore + ' 張）');
    expect(totalCardsAfter).toBe(totalCardsBefore);
  });

  test('里程欄位 bar 寬度動畫已完成', async ({ page }) => {
    const bars = page.locator('#mileageList .mileage-bar-fill');
    const count = await bars.count();
    expect(count).toBeGreaterThan(0);

    const firstBar = bars.first();
    const width = await firstBar.evaluate(function(el) { return parseFloat(el.style.width); });
    expect(width).toBeGreaterThan(0);
    console.log('[遠端] 最高里程 bar 寬度：' + width + '%');
  });

});

// ═══════════════════════════════════════════════
// 本地版本測試群組（新功能完整性驗證）
// 透過攔截 API 呼叫返回 5xx，讓 DataService fallback 到 Mock
// ═══════════════════════════════════════════════
test.describe('里程排行欄位點擊互動 — 本地新版功能驗證', () => {

  test.beforeEach(async ({ page }) => {
    // 攔截 API 呼叫，強制返回 503，讓 DataService 切換到 mock fallback
    await page.route('**/api/v1/**', async function(route) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'service_unavailable', message: 'playwright test mock' } }),
      });
    });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(LOCAL_URL + '/index.html');
    // 等待 fallback 到 mock 並渲染（最多 15 秒）
    await waitForMileageList(page, 15000);
  });

  test('[本地] 初始狀態截圖', async ({ page }) => {
    await page.screenshot({
      path: path.join(RESULTS_DIR, '05-local-mileage-initial-state.png'),
      fullPage: false,
    });

    const items = page.locator('#mileageList .mileage-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    console.log('[本地] 里程列表共 ' + count + ' 個項目');

    // 確認 data-vehicle-id 存在（新功能標誌）
    const firstItem = items.first();
    const vehicleId = await firstItem.getAttribute('data-vehicle-id');
    console.log('[本地] 第一項 data-vehicle-id：' + vehicleId);
    expect(vehicleId).toBeTruthy();

    // 無 active 狀態
    await expect(page.locator('#mileageList .mileage-item.active')).toHaveCount(0);
    await expect(page.locator('#vehicleSearchInput')).toHaveValue('');
  });

  test('[本地] 點擊里程欄位：active class + 搜尋框填入 + 車輛卡片過濾', async ({ page }) => {
    const firstItem = page.locator('#mileageList .mileage-item').first();
    const vehicleId = await firstItem.getAttribute('data-vehicle-id');
    console.log('[本地] 點擊車輛：' + vehicleId);
    expect(vehicleId).toBeTruthy();

    // 點擊
    await firstItem.click();
    await page.waitForTimeout(500);

    // 截圖：點擊後
    await page.screenshot({
      path: path.join(RESULTS_DIR, '06-local-mileage-after-click.png'),
      fullPage: false,
    });

    // A. active class 套用
    await expect(firstItem).toHaveClass(/active/);

    // B. 其他項目無 active
    const items = page.locator('#mileageList .mileage-item');
    const count = await items.count();
    for (let i = 1; i < count; i++) {
      const cls = await items.nth(i).getAttribute('class') || '';
      expect(cls).not.toContain('active');
    }

    // C. 搜尋框填入車輛 ID
    const searchInput = page.locator('#vehicleSearchInput');
    await expect(searchInput).toHaveValue(vehicleId);

    // D. 車輛卡片過濾（只顯示對應車輛）
    const vehicleCards = page.locator('.vehicle-card');
    const visibleCount = await vehicleCards.count();
    console.log('[本地] 過濾後顯示 ' + visibleCount + ' 張車輛卡片');
    expect(visibleCount).toBeGreaterThanOrEqual(1);

    // 確認顯示的卡片包含目標車輛
    let found = false;
    for (let i = 0; i < Math.min(visibleCount, 10); i++) {
      const text = await vehicleCards.nth(i).textContent();
      if (text && text.includes(vehicleId)) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  test('[本地] Toggle off：再次點擊清除搜尋、恢復所有車輛', async ({ page }) => {
    const firstItem = page.locator('#mileageList .mileage-item').first();
    const vehicleId = await firstItem.getAttribute('data-vehicle-id');
    const vehicleCards = page.locator('.vehicle-card');
    const searchInput = page.locator('#vehicleSearchInput');

    const totalBefore = await vehicleCards.count();
    console.log('[本地] 初始車輛卡片：' + totalBefore + ' 張');

    // 第一次點擊：過濾
    await firstItem.click();
    await page.waitForTimeout(500);
    await expect(firstItem).toHaveClass(/active/);
    await expect(searchInput).toHaveValue(vehicleId);

    await page.screenshot({
      path: path.join(RESULTS_DIR, '07-local-mileage-filtered.png'),
      fullPage: false,
    });

    // 第二次點擊：toggle off
    await firstItem.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(RESULTS_DIR, '08-local-mileage-toggled-off.png'),
      fullPage: false,
    });

    // E. active class 移除
    const cls = await firstItem.getAttribute('class') || '';
    expect(cls).not.toContain('active');

    // F. 搜尋框清空
    await expect(searchInput).toHaveValue('');

    // G. 車輛卡片恢復
    const totalAfter = await vehicleCards.count();
    console.log('[本地] Toggle off 後：' + totalAfter + ' 張（初始：' + totalBefore + ' 張）');
    expect(totalAfter).toBe(totalBefore);
  });

  test('[本地] Bar 寬度動畫完成', async ({ page }) => {
    const bars = page.locator('#mileageList .mileage-bar-fill');
    const count = await bars.count();
    expect(count).toBeGreaterThan(0);

    const firstBar = bars.first();
    const width = await firstBar.evaluate(function(el) { return parseFloat(el.style.width); });
    expect(width).toBeGreaterThan(0);
    console.log('[本地] 最高里程 bar 寬度：' + width + '%');
  });

});
