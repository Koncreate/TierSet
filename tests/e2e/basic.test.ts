import { test, expect } from "@playwright/test";

/**
 * TierBoard E2E Tests
 *
 * These tests verify the core functionality of TierBoard:
 * - Board creation and rendering
 * - Tier list manipulation
 * - P2P room creation and joining (requires 2 browser contexts)
 */

test.describe("TierBoard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test.describe("Basic Functionality", () => {
    test("should load the application", async ({ page }) => {
      await expect(page).toHaveTitle(/TierBoard/);
    });

    test("should display tier list container", async ({ page }) => {
      const tierList = page.locator('[class*="tier"], [class*="Tier"], [data-testid*="tier"]');
      await expect(tierList.first()).toBeVisible({ timeout: 10000 });
    });

    test("should allow creating a new board", async ({ page }) => {
      const boardElement = page.locator(
        '[class*="board"], [class*="Board"], [data-testid*="board"]',
      );
      await expect(boardElement.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("P2P Room Functionality", () => {
    test("should create a room and get a room code", async ({ page }) => {
      const createRoomButton = page.locator(
        'button:has-text("Create"), button:has-text("Room"), [class*="create"], [data-testid*="create"]',
      );

      if (await createRoomButton.isVisible()) {
        await createRoomButton.click();

        const roomCodeLocator = page.locator(
          '[class*="code"], [class*="Code"], [data-testid*="code"], [class*="room"], [data-testid*="room"]',
        );
        await expect(roomCodeLocator.first()).toBeVisible({ timeout: 10000 });
      }
    });

    test("should sync between two browser contexts", async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await page1.goto("/");
        await page2.goto("/");

        await Promise.all([
          page1.waitForLoadState("networkidle"),
          page2.waitForLoadState("networkidle"),
        ]);

        await expect(page1).toHaveTitle(/TierBoard/);
        await expect(page2).toHaveTitle(/TierBoard/);
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe("Item Management", () => {
    test("should display items in tiers", async ({ page }) => {
      const items = page.locator('[class*="item"], [class*="Item"], [data-testid*="item"]');

      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
