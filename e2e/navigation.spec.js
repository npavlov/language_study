import { test, expect } from '@playwright/test';
import { goHome, selectDirection, selectMode } from './helpers.js';

test.describe('Navigation & Menu', () => {
  test('home screen loads with word count', async ({ page }) => {
    await goHome(page);
    const wordCount = await page.textContent('.menu__word-count');
    expect(wordCount).not.toContain('0 ');
  });

  test('language toggle switches direction', async ({ page }) => {
    await goHome(page);
    // Default is English
    const enBtn = page.locator('.toggle__option[data-direction="en-sr"]');
    await expect(enBtn).toHaveClass(/toggle__option--active/);

    // Switch to Serbian
    await selectDirection(page, 'sr');
    const srBtn = page.locator('.toggle__option[data-direction="sr-en"]');
    await expect(srBtn).toHaveClass(/toggle__option--active/);
    await expect(enBtn).not.toHaveClass(/toggle__option--active/);
  });

  test('mode card selection highlights', async ({ page }) => {
    await goHome(page);
    // Default is flashcards
    const flashcard = page.locator('.card[data-mode="flashcards"]');
    await expect(flashcard).toHaveClass(/card--selected/);

    // Select quiz
    await selectMode(page, 'quiz');
    const quiz = page.locator('.card[data-mode="quiz"]');
    await expect(quiz).toHaveClass(/card--selected/);
    await expect(flashcard).not.toHaveClass(/card--selected/);
  });

  test('tab bar navigates between screens', async ({ page }) => {
    await goHome(page);

    // Navigate to stats
    await page.click('.tab-bar__item:nth-child(2)');
    await expect(page.locator('#stats-screen')).toHaveClass(/screen--active/);

    // Navigate to add-words
    await page.click('.tab-bar__item:nth-child(3)');
    await expect(page.locator('#add-words-screen')).toHaveClass(/screen--active/);

    // Back to home
    await page.click('.tab-bar__item:nth-child(1)');
    await expect(page.locator('#menu-screen')).toHaveClass(/screen--active/);
  });

  test('refresh on #play redirects to #home', async ({ page }) => {
    await page.goto('/language_study/#play');
    // Should redirect to #home since no active game
    await page.waitForSelector('.menu', { timeout: 10_000 });
    expect(page.url()).toContain('#home');
  });

  test('refresh on #home preserves menu', async ({ page }) => {
    await goHome(page);
    await page.reload();
    await page.waitForSelector('.menu', { timeout: 10_000 });
    const wordCount = await page.textContent('.menu__word-count');
    expect(wordCount).toBeTruthy();
  });

  test('direct navigation to #stats works', async ({ page }) => {
    await page.goto('/language_study/#stats');
    await expect(page.locator('#stats-screen')).toHaveClass(/screen--active/);
  });
});
