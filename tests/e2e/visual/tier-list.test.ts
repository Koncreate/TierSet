/**
 * Tier List Visual Tests
 */

import { test, expect } from '@playwright/test';
import { visualConfig } from '../../visual-config';

test.describe('Tier List - Visual Tests', () => {
  test('should render empty tier list', async ({ page }, testInfo) => {
    await page.goto('/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.fill('Tier Test');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('tier-list-empty.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('tier-list-empty', { body: screenshot, contentType: 'image/png' });
  });

  test('should render tier list with items', async ({ page }, testInfo) => {
    await page.goto('/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.fill('Items Test');

    // Add items
    for (const name of ['S Tier', 'A Tier', 'B Tier', 'C Tier']) {
      const itemInput = page.locator('#new-item-name');
      if (await itemInput.isVisible()) {
        await itemInput.fill(name);
        await itemInput.press('Enter');
        await page.waitForTimeout(500);
      }
    }

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('tier-list-with-items.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('tier-list-with-items', { body: screenshot, contentType: 'image/png' });
  });
});
