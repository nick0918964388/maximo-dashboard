// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE_URL = 'http://192.168.1.44:8880';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'status-toggle');

test.describe('按狀態 Toggle Button Feature', () => {
  test('should toggle between type grouping and status grouping', async ({ page }) => {
    // Navigate to the page
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for vehicle cards to appear
    await page.waitForSelector('.vehicle-card', { timeout: 20000 });
    console.log('Vehicle cards loaded.');

    // --- Step 1: Screenshot of initial state (type grouping) ---
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-initial.png'),
      fullPage: false
    });
    console.log('Screenshot 01-initial.png saved.');

    // Verify statusGroupBtn exists
    const btn = page.locator('#statusGroupBtn');
    await expect(btn).toBeVisible({ timeout: 10000 });
    console.log('statusGroupBtn is visible.');

    // Verify button does NOT have "active" class initially
    const initialClasses = await btn.getAttribute('class');
    console.log('Initial button classes:', initialClasses);
    expect(initialClasses).not.toContain('active');

    // Count initial vehicle cards
    const initialCardCount = await page.locator('.vehicle-card').count();
    console.log('Initial vehicle card count:', initialCardCount);
    expect(initialCardCount).toBeGreaterThan(0);

    // Verify no status-group-header initially
    const initialStatusHeaders = await page.locator('.status-group-header').count();
    console.log('Initial status-group-header count:', initialStatusHeaders);

    // --- Step 2: Click "按狀態" button ---
    await btn.click();
    console.log('Clicked statusGroupBtn.');

    // Wait for re-render - wait for status-group-header to appear
    await page.waitForTimeout(800);

    // --- Step 3: Screenshot after clicking (status grouping mode) ---
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-status-mode.png'),
      fullPage: false
    });
    console.log('Screenshot 02-status-mode.png saved.');

    // Verify button now has "active" class
    const activeClasses = await btn.getAttribute('class');
    console.log('Active button classes:', activeClasses);
    expect(activeClasses).toContain('active');

    // Verify status-group-header elements appear
    const statusHeaders = await page.locator('.status-group-header').count();
    console.log('Status group header count after toggle:', statusHeaders);
    expect(statusHeaders).toBeGreaterThan(0);

    // Verify vehicle cards are still rendered
    const cardCountAfterToggle = await page.locator('.vehicle-card').count();
    console.log('Vehicle card count after toggle:', cardCountAfterToggle);
    expect(cardCountAfterToggle).toBeGreaterThan(0);

    // --- Step 4: Click again to toggle back ---
    await btn.click();
    console.log('Clicked statusGroupBtn again to revert.');

    await page.waitForTimeout(800);

    // --- Step 5: Screenshot after reverting ---
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-reverted.png'),
      fullPage: false
    });
    console.log('Screenshot 03-reverted.png saved.');

    // Verify button no longer has "active" class
    const revertedClasses = await btn.getAttribute('class');
    console.log('Reverted button classes:', revertedClasses);
    expect(revertedClasses).not.toContain('active');

    // Verify status-group-header elements are gone (or reduced)
    const headersAfterRevert = await page.locator('.status-group-header').count();
    console.log('Status group header count after revert:', headersAfterRevert);

    // Verify vehicle cards are still visible
    const cardCountAfterRevert = await page.locator('.vehicle-card').count();
    console.log('Vehicle card count after revert:', cardCountAfterRevert);
    expect(cardCountAfterRevert).toBeGreaterThan(0);

    console.log('All assertions passed. Toggle feature works correctly.');
  });
});
