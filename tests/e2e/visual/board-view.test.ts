/**
 * Board View Visual Tests
 */

import { test, expect } from '@playwright/test';
import { visualConfig } from '../../visual-config';

test.describe('Board View - Visual Tests', () => {
  test('should render tier list with editable name', async ({ page }, testInfo) => {
    await page.goto('/board');
    await page.waitForLoadState('networkidle');

    // Wait for the editable name input to appear (board auto-creation takes 2-3 seconds)
    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1000);

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('board-creation-screen.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('board-creation-screen', { body: screenshot, contentType: 'image/png' });
  });

  test('should render board with items', async ({ page }, testInfo) => {
    await page.goto('/board');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(500);

    await nameInput.fill('Test Board');
    await page.waitForTimeout(500);

    // Add items
    for (const name of ['Item 1', 'Item 2', 'Item 3']) {
      const itemInput = page.locator('#new-item-name');
      if (await itemInput.isVisible()) {
        await itemInput.fill(name);
        await itemInput.press('Enter');
        await page.waitForTimeout(500);
      }
    }

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('board-with-items.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('board-with-items', { body: screenshot, contentType: 'image/png' });
  });

  test('should render board at desktop viewport', async ({ page }, testInfo) => {
    await page.setViewportSize(visualConfig.viewports.desktop);
    await page.goto('/board');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(500);

    await nameInput.fill('Desktop Board');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('board-desktop.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('board-desktop', { body: screenshot, contentType: 'image/png' });
  });
});
