/**
 * E2E tests for the re-insert (repeat forgotten words) setting.
 *
 * Verifies:
 * - Toggle is visible in the menu and defaults to ON
 * - Toggle state persists across page reloads
 * - When ON: wrong-answered words reappear later in the session
 * - When OFF: wrong-answered words do NOT reappear
 */
import { test, expect } from '@playwright/test';
import { goHome, startGame } from './helpers.js';

const CARD = '.flashcards__scene .card';
const SWITCH = '.switch[data-setting="reinsertEnabled"]';

/**
 * Wait until term text changes from `prev`, return new text.
 */
async function waitForNewTerm(page, selector, prev, timeout = 5000) {
  await page.waitForFunction(
    ({ sel, p }) => {
      const el = document.querySelector(sel);
      return el && el.textContent.trim().length > 0 && el.textContent.trim() !== p;
    },
    { sel: selector, p: prev },
    { timeout },
  );
  return (await page.textContent(selector)).trim();
}

// ---------------------------------------------------------------------------
// Toggle visibility and state
// ---------------------------------------------------------------------------

test.describe('Re-insert setting — toggle', () => {
  test('toggle is visible in menu and defaults to ON', async ({ page }) => {
    await goHome(page);
    const toggle = page.locator(SWITCH);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveClass(/switch--on/);
  });

  test('clicking toggle switches it OFF', async ({ page }) => {
    await goHome(page);
    const toggle = page.locator(SWITCH);
    await toggle.click();
    await expect(toggle).not.toHaveClass(/switch--on/);
  });

  test('toggle state persists after page reload', async ({ page }) => {
    await goHome(page);
    const toggle = page.locator(SWITCH);

    // Turn OFF
    await toggle.click();
    await expect(toggle).not.toHaveClass(/switch--on/);

    // Reload
    await page.reload();
    await page.waitForSelector(SWITCH, { timeout: 10_000 });
    await expect(page.locator(SWITCH)).not.toHaveClass(/switch--on/);

    // Turn back ON
    await page.locator(SWITCH).click();
    await page.reload();
    await page.waitForSelector(SWITCH, { timeout: 10_000 });
    await expect(page.locator(SWITCH)).toHaveClass(/switch--on/);
  });
});

// ---------------------------------------------------------------------------
// Re-insert OFF: words never repeat
// ---------------------------------------------------------------------------

test.describe('Re-insert OFF — no repeats', () => {
  test('15 flashcards with "Don\'t know" produce all unique terms', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await goHome(page);

    // Turn OFF re-insert
    const toggle = page.locator(SWITCH);
    await expect(toggle).toHaveClass(/switch--on/); // default ON
    await toggle.click();
    await expect(toggle).not.toHaveClass(/switch--on/);

    // Start flashcards
    await page.click('.toggle__option[data-direction="en-sr"]');
    await page.click('.card[data-mode="flashcards"]');
    await page.click('.btn--primary.btn--block');
    await page.waitForSelector('.screen--active#play-screen', { timeout: 10_000 });
    await page.waitForSelector(CARD, { timeout: 5000 });

    const termSel = `${CARD} .card__term`;
    const terms = [];
    let prevTerm = '';

    for (let i = 0; i < 15; i++) {
      const term = await waitForNewTerm(page, termSel, prevTerm);
      terms.push(term);
      prevTerm = term;

      // Always "Don't know"
      await page.click('.flashcards__btn--dont');
    }

    // All 15 should be unique — no re-inserts
    const unique = new Set(terms);
    expect(unique.size).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Re-insert ON: forgotten words come back
// ---------------------------------------------------------------------------

test.describe('Re-insert ON — forgotten words reappear', () => {
  test('wrong-answered word reappears within next 15 cards', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await goHome(page);

    // Ensure re-insert is ON (default)
    await expect(page.locator(SWITCH)).toHaveClass(/switch--on/);

    // Start flashcards
    await page.click('.toggle__option[data-direction="en-sr"]');
    await page.click('.card[data-mode="flashcards"]');
    await page.click('.btn--primary.btn--block');
    await page.waitForSelector('.screen--active#play-screen', { timeout: 10_000 });
    await page.waitForSelector(CARD, { timeout: 5000 });

    const termSel = `${CARD} .card__term`;
    let prevTerm = '';

    // First card — mark "Don't know"
    const firstTerm = await waitForNewTerm(page, termSel, prevTerm);
    await page.click('.flashcards__btn--dont');
    prevTerm = firstTerm;

    // Go through the next cards with "Know", look for re-appearance
    let reinserted = false;
    for (let i = 0; i < 15; i++) {
      const term = await waitForNewTerm(page, termSel, prevTerm);
      if (term === firstTerm) {
        reinserted = true;
        break;
      }
      prevTerm = term;
      await page.click('.flashcards__btn--know');
    }

    expect(reinserted).toBe(true);
  });

  test('20 cards: "Don\'t know" words cause duplicates in the session', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await goHome(page);
    await expect(page.locator(SWITCH)).toHaveClass(/switch--on/);

    await page.click('.toggle__option[data-direction="en-sr"]');
    await page.click('.card[data-mode="flashcards"]');
    await page.click('.btn--primary.btn--block');
    await page.waitForSelector('.screen--active#play-screen', { timeout: 10_000 });
    await page.waitForSelector(CARD, { timeout: 5000 });

    const termSel = `${CARD} .card__term`;
    const terms = [];
    let prevTerm = '';

    for (let i = 0; i < 20; i++) {
      const term = await waitForNewTerm(page, termSel, prevTerm);
      terms.push(term);
      prevTerm = term;

      // Alternate: don't know / know
      const btn = i % 2 === 0
        ? '.flashcards__btn--dont'
        : '.flashcards__btn--know';
      await page.click(btn);
    }

    // With re-insert ON and alternating don't-know, we should see repeats
    const unique = new Set(terms);
    expect(unique.size).toBeLessThan(terms.length);
  });
});
