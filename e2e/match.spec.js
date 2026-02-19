import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

test.describe('Match Mode', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { direction: 'en', mode: 'match' });
  });

  test('displays grid with left and right columns', async ({ page }) => {
    const leftItems = page.locator('.match__column--left .match__item');
    const rightItems = page.locator('.match__column--right .match__item');

    const leftCount = await leftItems.count();
    const rightCount = await rightItems.count();

    expect(leftCount).toBeGreaterThanOrEqual(4);
    expect(rightCount).toBeGreaterThanOrEqual(4);
    expect(leftCount).toBe(rightCount);
  });

  test('shows round label and timer', async ({ page }) => {
    const round = await page.textContent('.match__round');
    expect(round).toContain('1');

    const timer = await page.textContent('.match__timer');
    expect(timer).toBe('0:00');
  });

  test('clicking left item selects it', async ({ page }) => {
    const leftItem = page.locator('.match__column--left .match__item').first();
    await leftItem.click();
    await expect(leftItem).toHaveClass(/match__item--selected/);
  });

  test('clicking another left item changes selection', async ({ page }) => {
    const items = page.locator('.match__column--left .match__item');
    await items.first().click();
    await expect(items.first()).toHaveClass(/match__item--selected/);

    await items.nth(1).click();
    await expect(items.first()).not.toHaveClass(/match__item--selected/);
    await expect(items.nth(1)).toHaveClass(/match__item--selected/);
  });

  test('clicking same left item deselects it', async ({ page }) => {
    const item = page.locator('.match__column--left .match__item').first();
    await item.click();
    await expect(item).toHaveClass(/match__item--selected/);

    await item.click();
    await expect(item).not.toHaveClass(/match__item--selected/);
  });

  test('correct match shows green and fades', async ({ page }) => {
    // Find a matching pair by data-id
    const leftItems = page.locator('.match__column--left .match__item');
    const firstLeft = leftItems.first();
    const pairId = await firstLeft.getAttribute('data-id');

    // Click left item
    await firstLeft.click();

    // Find matching right item
    const rightMatch = page.locator(
      `.match__column--right .match__item[data-id="${pairId}"]`,
    );
    await rightMatch.click();

    // Both should get correct class
    await expect(firstLeft).toHaveClass(/match__item--correct/);
    await expect(rightMatch).toHaveClass(/match__item--correct/);

    // After delay, both should get matched class (faded)
    await page.waitForTimeout(700);
    await expect(firstLeft).toHaveClass(/match__item--matched/);
    await expect(rightMatch).toHaveClass(/match__item--matched/);
  });

  test('wrong match flashes red', async ({ page }) => {
    const leftItems = page.locator('.match__column--left .match__item');
    const rightItems = page.locator('.match__column--right .match__item');

    const leftId = await leftItems.first().getAttribute('data-id');

    // Click left item
    await leftItems.first().click();

    // Find a RIGHT item with a different id
    const rightCount = await rightItems.count();
    for (let i = 0; i < rightCount; i++) {
      const rightId = await rightItems.nth(i).getAttribute('data-id');
      if (rightId !== leftId) {
        await rightItems.nth(i).click();
        // Should flash wrong
        await expect(rightItems.nth(i)).toHaveClass(/match__item--wrong/);
        break;
      }
    }
  });

  test('clicking right item without left selection does nothing', async ({ page }) => {
    const rightItem = page.locator('.match__column--right .match__item').first();
    await rightItem.click();
    // Should not have any selection or error class
    await expect(rightItem).not.toHaveClass(/match__item--selected/);
    await expect(rightItem).not.toHaveClass(/match__item--wrong/);
  });

  test('matched items cannot be clicked again', async ({ page }) => {
    const leftItems = page.locator('.match__column--left .match__item');
    const firstLeft = leftItems.first();
    const pairId = await firstLeft.getAttribute('data-id');

    await firstLeft.click();
    const rightMatch = page.locator(
      `.match__column--right .match__item[data-id="${pairId}"]`,
    );
    await rightMatch.click();

    // Wait for matched state
    await page.waitForTimeout(700);
    await expect(firstLeft).toHaveClass(/match__item--matched/);

    // Matched items should have pointer-events: none
    const pointerEvents = await firstLeft.evaluate(
      (el) => getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe('none');
  });

  test('completing all pairs shows round summary', async ({ page }) => {
    // Match all pairs by data-id
    const leftItems = page.locator('.match__column--left .match__item');
    const count = await leftItems.count();

    for (let i = 0; i < count; i++) {
      const left = page.locator(
        `.match__column--left .match__item:not(.match__item--matched)`,
      ).first();
      const isVisible = await left.isVisible().catch(() => false);
      if (!isVisible) break;

      const pairId = await left.getAttribute('data-id');
      await left.click();

      const right = page.locator(
        `.match__column--right .match__item[data-id="${pairId}"]`,
      );
      await right.click();

      await page.waitForTimeout(700);
    }

    // Summary should appear
    await page.waitForSelector('.match__summary', { timeout: 5000 });
    const title = await page.textContent('.match__summary-title');
    expect(title.length).toBeGreaterThan(0);
  });

  test('back button returns to menu', async ({ page }) => {
    await page.click('.match__back-btn');
    await expect(page.locator('#menu-screen')).toHaveClass(/screen--active/);
  });

  test('timer increments while playing', async ({ page }) => {
    await page.waitForTimeout(1500);
    const timer = await page.textContent('.match__timer');
    expect(timer).not.toBe('0:00');
  });
});

test.describe('Match — Serbian direction', () => {
  test('loads Serbian match mode', async ({ page }) => {
    await startGame(page, { direction: 'sr', mode: 'match' });
    const leftItems = page.locator('.match__column--left .match__item');
    const count = await leftItems.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
