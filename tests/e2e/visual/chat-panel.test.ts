/**
 * Chat Panel Visual Tests
 */

import { test, expect } from '@playwright/test';
import { visualConfig } from '../../visual-config';

test.describe('Chat Panel - Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('should render chat panel', async ({ page }, testInfo) => {
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('chat-panel.png', {
      threshold: visualConfig.threshold,
    });
    await testInfo.attach('chat-panel', { body: screenshot, contentType: 'image/png' });
  });
});
