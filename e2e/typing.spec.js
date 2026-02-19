import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

test.describe('Typing Mode', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { direction: 'en', mode: 'typing' });
  });

  test('displays term and input field', async ({ page }) => {
    const term = await page.textContent('.typing__word-term');
    expect(term.length).toBeGreaterThan(0);

    const input = page.locator('.typing__input');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('shows progress and score', async ({ page }) => {
    const progress = await page.textContent('.typing__progress-label');
    expect(progress).toMatch(/\d+ \/ \d+/);

    const score = await page.textContent('.typing__score');
    expect(score).toContain('0');
  });

  test('empty submit shows error feedback', async ({ page }) => {
    await page.click('.typing__btn--submit');
    const feedback = page.locator('.typing__feedback');
    const text = await feedback.textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('wrong answer shows correct answer', async ({ page }) => {
    await page.fill('.typing__input', 'definitely_wrong_answer_xyz');
    await page.click('.typing__btn--submit');

    const feedback = page.locator('.typing__feedback--wrong');
    await expect(feedback).toBeVisible();
  });

  test('skip shows answer and enables next', async ({ page }) => {
    await page.click('.typing__btn--skip');

    const feedback = page.locator('.typing__feedback--wrong');
    await expect(feedback).toBeVisible();

    // Skip button should change to "next"
    const skipBtn = page.locator('.typing__btn--skip');
    await expect(skipBtn).toBeEnabled();
  });

  test('Enter key submits answer', async ({ page }) => {
    await page.fill('.typing__input', 'wrong_answer');
    await page.press('.typing__input', 'Enter');

    const feedback = page.locator('.typing__feedback');
    const text = await feedback.textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('hint button stage 1 shows masked word with stars', async ({ page }) => {
    await page.click('.typing__btn--hint');

    const maskedHint = page.locator('.typing__hint--masked');
    await expect(maskedHint).toBeVisible();

    const text = await maskedHint.textContent();
    expect(text).toContain('★');
  });

  test('hint button cycles through all 6 stages', async ({ page }) => {
    // Click hint 6 times
    for (let i = 0; i < 6; i++) {
      const hintBtn = page.locator('.typing__btn--hint');
      if (await hintBtn.isDisabled()) break;
      await hintBtn.click();
    }

    // After 6 clicks, hint button should be disabled
    const hintBtn = page.locator('.typing__btn--hint');
    await expect(hintBtn).toBeDisabled();

    // Should have masked hint (stages 1-4) and translation hints (stages 5-6)
    const maskedHint = page.locator('.typing__hint--masked');
    await expect(maskedHint).toBeVisible();

    // Stage 6 = Russian translation
    const ruHint = page.locator('.typing__hint--level-2');
    await expect(ruHint).toBeVisible();
  });

  test('hint stages reveal letters progressively', async ({ page }) => {
    // Stage 1
    await page.click('.typing__btn--hint');
    const hint1 = await page.textContent('.typing__hint--masked');
    const stars1 = (hint1.match(/★/g) || []).length;

    // Stage 2
    await page.click('.typing__btn--hint');
    const hint2 = await page.textContent('.typing__hint--masked');
    const stars2 = (hint2.match(/★/g) || []).length;

    // Each stage reveals letters, so stars should decrease
    expect(stars2).toBeLessThan(stars1);
  });

  test('stage 5 shows sister language translation', async ({ page }) => {
    // Click hint 5 times to reach stage 5
    for (let i = 0; i < 5; i++) {
      await page.click('.typing__btn--hint');
    }

    const sisterHint = page.locator('.typing__hint--level-1');
    await expect(sisterHint).toBeVisible();
  });

  test('back button returns to menu', async ({ page }) => {
    await page.click('.typing__back-btn');
    await expect(page.locator('#menu-screen')).toHaveClass(/screen--active/);
  });

  test('input is focused on load', async ({ page }) => {
    const input = page.locator('.typing__input');
    await expect(input).toBeFocused();
  });

  test('after wrong answer, skip button advances to next word', async ({ page }) => {
    await page.click('.typing__btn--skip');
    // Click skip again to advance
    await page.click('.typing__btn--skip');

    // Should show new word or summary
    const hasInput = await page.isVisible('.typing__input');
    const hasSummary = await page.isVisible('.typing__summary-title');
    expect(hasInput || hasSummary).toBe(true);
  });
});

test.describe('Typing — Serbian direction', () => {
  test('loads Serbian typing mode', async ({ page }) => {
    await startGame(page, { direction: 'sr', mode: 'typing' });
    const term = await page.textContent('.typing__word-term');
    expect(term.length).toBeGreaterThan(0);
  });
});
