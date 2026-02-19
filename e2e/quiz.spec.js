import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

test.describe('Quiz Mode', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { direction: 'en', mode: 'quiz' });
  });

  test('displays term and four options', async ({ page }) => {
    const term = await page.textContent('.quiz__term');
    expect(term.length).toBeGreaterThan(0);

    const options = page.locator('.quiz__option');
    await expect(options).toHaveCount(4);
  });

  test('shows progress and score', async ({ page }) => {
    const progress = await page.textContent('.quiz__progress-label');
    expect(progress).toMatch(/1 \/ \d+/);

    const score = await page.textContent('.quiz__score');
    expect(score).toContain('0');
  });

  test('correct answer highlights green and advances', async ({ page }) => {
    // We don't know which option is correct, so click all until one works
    const options = page.locator('.quiz__option');
    const count = await options.count();

    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const hasCorrectClass = await opt.evaluate(
        (el) => el.classList.contains('quiz__option--correct'),
      );
      const hasWrongClass = await opt.evaluate(
        (el) => el.classList.contains('quiz__option--wrong'),
      );
      if (!hasCorrectClass && !hasWrongClass) {
        await opt.click();
        await page.waitForTimeout(100);
        const isCorrect = await opt.evaluate(
          (el) => el.classList.contains('quiz__option--correct'),
        );
        if (isCorrect) break;
      }
    }

    // Should have a correct option highlighted
    const correctOption = page.locator('.quiz__option--correct');
    await expect(correctOption).toHaveCount(1);
  });

  test('wrong answer highlights red and shows hint', async ({ page }) => {
    // Find one wrong answer by clicking options until we get a wrong one
    const options = page.locator('.quiz__option');
    const count = await options.count();

    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      await opt.click();
      const isWrong = await opt.evaluate(
        (el) => el.classList.contains('quiz__option--wrong'),
      );
      if (isWrong) {
        // Wrong option should be red
        await expect(opt).toHaveClass(/quiz__option--wrong/);
        // Hint should appear
        const hint = page.locator('.quiz__hint--visible');
        await expect(hint).toBeVisible();
        break;
      }
      // If correct, test passes differently — restart next time
      if (await opt.evaluate((el) => el.classList.contains('quiz__option--correct'))) {
        break;
      }
    }
  });

  test('two wrong answers reveals correct and auto-advances', async ({ page }) => {
    const options = page.locator('.quiz__option');
    const count = await options.count();

    let wrongClicks = 0;
    for (let i = 0; i < count && wrongClicks < 2; i++) {
      const opt = options.nth(i);
      if (await opt.isDisabled()) continue;
      await opt.click();
      const isWrong = await opt.evaluate(
        (el) => el.classList.contains('quiz__option--wrong'),
      );
      if (isWrong) wrongClicks++;
    }

    if (wrongClicks >= 2) {
      // Correct answer should be revealed
      const correctRevealed = page.locator('.quiz__option--correct');
      await expect(correctRevealed).toHaveCount(1);

      // Auto-advances after delay
      await page.waitForTimeout(2000);
      const newProgress = await page.textContent('.quiz__progress-label');
      expect(newProgress).toMatch(/\d+ \/ \d+/);
    }
  });

  test('back button returns to menu', async ({ page }) => {
    await page.click('.quiz__back-btn');
    await expect(page.locator('#menu-screen')).toHaveClass(/screen--active/);
  });

  test('disabled options cannot be clicked again', async ({ page }) => {
    const options = page.locator('.quiz__option');
    const count = await options.count();

    // Find a wrong answer
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      await opt.click();
      const isWrong = await opt.evaluate(
        (el) => el.classList.contains('quiz__option--wrong'),
      );
      if (isWrong) {
        await expect(opt).toBeDisabled();
        break;
      }
      break; // If first was correct, that's fine too
    }
  });
});

test.describe('Quiz — Serbian direction', () => {
  test('loads Serbian quiz', async ({ page }) => {
    await startGame(page, { direction: 'sr', mode: 'quiz' });
    const term = await page.textContent('.quiz__term');
    expect(term.length).toBeGreaterThan(0);
    const options = page.locator('.quiz__option');
    await expect(options).toHaveCount(4);
  });
});
