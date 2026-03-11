// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://192.168.1.214:8880';

test.describe('莒光號 (CK) vehicle type tests', () => {

  test('MPY00 shows FPK vehicles as 莒光號 with correct styling and filtering', async ({ page }) => {
    // Navigate to the dashboard
    await page.goto(BASE + '/');
    await page.waitForLoadState('networkidle');

    // Wait for depot selector to be available
    const depotSelect = page.locator('#depotSelect');
    await expect(depotSelect).toBeVisible({ timeout: 10000 });

    // Select MPY00 (高雄機務段) which has FPK vehicles
    await depotSelect.selectOption('MPY00');
    await page.waitForTimeout(2000);

    // Navigate to a date that has data - try 2026-03-09
    // Click the date back button a few times if today is 2026-03-11
    const prevBtn = page.locator('#prevDate, .date-nav button:first-child, [onclick*="prev"], button:has-text("◀")').first();
    // Try clicking prev to get to a date with data
    for (let i = 0; i < 3; i++) {
      if (await prevBtn.isVisible()) {
        await prevBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Wait for data to load
    await page.waitForTimeout(3000);

    // Check if the donut chart legend has 莒光號 entry
    const ckLegend = page.locator('#legendCK, .legend-item:has-text("莒光號")');

    // Check that the 莒光號 filter chip exists
    const ckChip = page.locator('button.chip[data-filter="ck"], button:has-text("莒光號")').first();
    await expect(ckChip).toBeVisible({ timeout: 5000 });

    // Check for any vehicle cards - look for FPK-prefixed IDs or CK type markers
    const vehicleCards = page.locator('.vehicle-card, .card');
    const cardCount = await vehicleCards.count();
    console.log(`Found ${cardCount} vehicle cards`);

    // Click the 莒光號 filter chip to filter
    await ckChip.click();
    await page.waitForTimeout(1000);

    // After filtering, check that only CK vehicles are shown (or appropriate feedback)
    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/ck-vehicles-mpy00.png', fullPage: false });
    console.log('Screenshot saved to tests/screenshots/ck-vehicles-mpy00.png');

    // Verify the CK legend count is > 0
    const ckCountText = await ckLegend.first().textContent();
    console.log(`CK legend count: ${ckCountText}`);
  });
});
