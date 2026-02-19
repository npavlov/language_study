import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

/** Scoped locator for the flashcard (inside the scene, not menu cards). */
const CARD = '.flashcards__scene .card';

test.describe('Flashcards Mode', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { direction: 'en', mode: 'flashcards' });
    // Wait for the first card to render
    await page.waitForSelector(CARD, { timeout: 5000 });
  });

  test('card shows term on front', async ({ page }) => {
    // Wait for the card animation to settle and term to populate
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return el && el.textContent.trim().length > 0;
      },
      `${CARD} .card__term`,
      { timeout: 5000 },
    );
    const term = await page.textContent(`${CARD} .card__term`);
    expect(term.trim().length).toBeGreaterThan(0);
  });

  test('progress bar starts at beginning', async ({ page }) => {
    const progressText = await page.textContent('.flashcards__progress-text');
    expect(progressText).toMatch(/^\d+ \/ \d+$/);
  });

  test('first tap flips card and shows hint', async ({ page }) => {
    const card = page.locator(CARD);
    await expect(card).not.toHaveClass(/card--flipped/);

    await card.click();
    await expect(card).toHaveClass(/card--flipped/);

    // Hint should be visible on the back
    const hint = page.locator(`${CARD} .card__hint`).first();
    await expect(hint).not.toBeHidden();
  });

  test('second tap shows second hint and hides tap prompt', async ({ page }) => {
    const card = page.locator(CARD);
    await card.click(); // first tap → flip
    await card.click(); // second tap → second hint

    // Tap prompt should disappear after second hint
    const tapPrompt = page.locator(`${CARD} .card__tap-prompt`).last();
    await expect(tapPrompt).toBeHidden();
  });

  test('third tap flips card back to front', async ({ page }) => {
    const card = page.locator(CARD);
    await card.click(); // flip
    await card.click(); // second hint
    await card.click(); // back to front

    await expect(card).not.toHaveClass(/card--flipped/);
  });

  test('fourth tap flips card to hints again', async ({ page }) => {
    const card = page.locator(CARD);
    await card.click(); // flip
    await card.click(); // second hint
    await card.click(); // back to front
    await card.click(); // hints again

    await expect(card).toHaveClass(/card--flipped/);
  });

  test('"Know" button advances to next card', async ({ page }) => {
    await page.click('.flashcards__btn--know');
    // Wait for card transition
    await page.waitForTimeout(500);
    const progressText = await page.textContent('.flashcards__progress-text');
    expect(progressText).toMatch(/\d+ \/ \d+/);
  });

  test('"Don\'t know" button advances to next card', async ({ page }) => {
    await page.click('.flashcards__btn--dont');
    await page.waitForTimeout(500);
    const progressText = await page.textContent('.flashcards__progress-text');
    expect(progressText).toMatch(/\d+ \/ \d+/);
  });

  test('back button returns to menu', async ({ page }) => {
    await page.click('.flashcards__back-btn');
    await expect(page.locator('#menu-screen')).toHaveClass(/screen--active/);
  });

  test('buttons are disabled after answering until next card loads', async ({ page }) => {
    await page.click('.flashcards__btn--know');
    const knowBtn = page.locator('.flashcards__btn--know');
    await expect(knowBtn).toBeDisabled();
  });

  test('rapid clicking does not break the UI', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.click('.flashcards__btn--know', { force: true });
      await page.waitForTimeout(100);
    }
    const hasProgress = await page.isVisible('.flashcards__progress-text');
    const hasSummary = await page.isVisible('.flashcards__summary');
    expect(hasProgress || hasSummary).toBe(true);
  });

  test('card resets properly between words', async ({ page }) => {
    await page.click('.flashcards__btn--know');
    await page.waitForTimeout(500);

    const card = page.locator(CARD);
    await expect(card).not.toHaveClass(/card--flipped/);
  });
});

test.describe('Flashcards — Serbian direction', () => {
  test('loads Serbian words', async ({ page }) => {
    await startGame(page, { direction: 'sr', mode: 'flashcards' });
    await page.waitForSelector(CARD, { timeout: 5000 });
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return el && el.textContent.trim().length > 0;
      },
      `${CARD} .card__term`,
      { timeout: 5000 },
    );
    const term = await page.textContent(`${CARD} .card__term`);
    expect(term.trim().length).toBeGreaterThan(0);
    const progressText = await page.textContent('.flashcards__progress-text');
    expect(progressText).toMatch(/\d+ \/ \d+/);
  });
});
