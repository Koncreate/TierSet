/**
 * Mobile Layouts Visual Tests
 */

import { test, expect } from '@playwright/test';
import { visualConfig } from '../../visual-config';

test.describe('Mobile Layouts - Visual Tests', () => {
  test('should render mobile viewport', async ({ page }, testInfo) => {
    await page.setViewportSize(visualConfig.viewports.mobile);
    await page.goto('/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('mobile-view.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('mobile-view', { body: screenshot, contentType: 'image/png' });
  });

  test('should render tablet viewport', async ({ page }, testInfo) => {
    await page.setViewportSize(visualConfig.viewports.tablet);
    await page.goto('/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('tablet-view.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('tablet-view', { body: screenshot, contentType: 'image/png' });
  });

  test('should render mobile with board', async ({ page }, testInfo) => {
    await page.setViewportSize(visualConfig.viewports.mobile);
    await page.goto('/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const nameInput = page.locator('input[placeholder="Untitled Tier List"]');
    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.fill('Mobile Board');

    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('mobile-with-board.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('mobile-with-board', { body: screenshot, contentType: 'image/png' });
  });
});
