/**
 * E2E tests for UI language switching (RU / EN / SR).
 *
 * Verifies:
 * - Language selector is visible in the menu
 * - Default language is Russian (RU)
 * - Switching to English changes UI text
 * - Switching to Serbian changes UI text
 * - Language persists across page reloads
 * - Game modes show localized text
 */
import { test, expect } from '@playwright/test';
import { goHome, startGame } from './helpers.js';

const LANG_TOGGLE = '.menu__lang-selector .toggle';

/**
 * Set UI language by clicking a toggle button, wait for reload.
 */
async function setUiLanguage(page, langCode) {
  await page.click(`${LANG_TOGGLE} .toggle__option[data-uilang="${langCode}"]`);
  // Language change triggers a page reload
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#menu-screen.screen--active', { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Language selector visibility and default
// ---------------------------------------------------------------------------

test.describe('UI Language — selector', () => {
  test('language selector is visible in menu with 3 options', async ({ page }) => {
    await goHome(page);
    const toggle = page.locator(LANG_TOGGLE);
    await expect(toggle).toBeVisible();

    const options = toggle.locator('.toggle__option');
    await expect(options).toHaveCount(3);

    // Default active should be RU
    const active = toggle.locator('.toggle__option--active');
    await expect(active).toHaveText('RU');
  });

  test('default language is Russian', async ({ page }) => {
    await goHome(page);

    // Check a few Russian UI strings
    const subtitle = page.locator('.menu__subtitle');
    await expect(subtitle).toContainText('Учи английский и сербский');

    const startBtn = page.locator('.btn--primary.btn--block');
    await expect(startBtn).toHaveText('Начать');
  });
});

// ---------------------------------------------------------------------------
// Switching to English
// ---------------------------------------------------------------------------

test.describe('UI Language — English', () => {
  test('switching to EN changes menu text to English', async ({ page }) => {
    await goHome(page);
    await setUiLanguage(page, 'en');

    const subtitle = page.locator('.menu__subtitle');
    await expect(subtitle).toContainText('Learn English and Serbian');

    const startBtn = page.locator('.btn--primary.btn--block');
    await expect(startBtn).toHaveText('Start');

    // Active toggle should be EN
    const active = page.locator(`${LANG_TOGGLE} .toggle__option--active`);
    await expect(active).toHaveText('EN');
  });

  test('English flashcards shows English UI', async ({ page }) => {
    await goHome(page);
    await setUiLanguage(page, 'en');

    await page.click('.toggle__option[data-direction="en-sr"]');
    await page.click('.card[data-mode="flashcards"]');
    await page.click('.btn--primary.btn--block');
    await page.waitForSelector('.screen--active#play-screen', { timeout: 10_000 });

    // Check Know / Don't know buttons are in English
    const knowBtn = page.locator('.flashcards__btn--know');
    await expect(knowBtn).toContainText('Know');

    const dontKnowBtn = page.locator('.flashcards__btn--dont');
    await expect(dontKnowBtn).toContainText("Don't know");
  });
});

// ---------------------------------------------------------------------------
// Switching to Serbian
// ---------------------------------------------------------------------------

test.describe('UI Language — Serbian', () => {
  test('switching to SR changes menu text to Serbian', async ({ page }) => {
    await goHome(page);
    await setUiLanguage(page, 'sr');

    const subtitle = page.locator('.menu__subtitle');
    await expect(subtitle).toContainText('Uči engleski i srpski');

    const startBtn = page.locator('.btn--primary.btn--block');
    await expect(startBtn).toHaveText('Počni');

    // Active toggle should be SR
    const active = page.locator(`${LANG_TOGGLE} .toggle__option--active`);
    await expect(active).toHaveText('SR');
  });

  test('Serbian quiz shows Serbian UI', async ({ page }) => {
    await goHome(page);
    await setUiLanguage(page, 'sr');

    await page.click('.toggle__option[data-direction="en-sr"]');
    await page.click('.card[data-mode="quiz"]');
    await page.click('.btn--primary.btn--block');
    await page.waitForSelector('.screen--active#play-screen', { timeout: 10_000 });

    // Check quiz progress label — should show "Pitanje" (Serbian for Question)
    const progress = page.locator('.quiz__progress-label');
    await expect(progress).toContainText('Pitanje');
  });
});

// ---------------------------------------------------------------------------
// Persistence across reload
// ---------------------------------------------------------------------------

test.describe('UI Language — persistence', () => {
  test('language choice persists after page reload', async ({ page }) => {
    await goHome(page);

    // Switch to English
    await setUiLanguage(page, 'en');
    await expect(page.locator('.btn--primary.btn--block')).toHaveText('Start');

    // Reload
    await page.reload();
    await page.waitForSelector('#menu-screen.screen--active', { timeout: 10_000 });

    // Should still be English
    await expect(page.locator('.btn--primary.btn--block')).toHaveText('Start');
    const active = page.locator(`${LANG_TOGGLE} .toggle__option--active`);
    await expect(active).toHaveText('EN');

    // Switch back to Russian
    await setUiLanguage(page, 'ru');
    await expect(page.locator('.btn--primary.btn--block')).toHaveText('Начать');
  });

  test('tab bar labels change with language', async ({ page }) => {
    await goHome(page);

    // Default Russian tab labels
    const tabs = page.locator('.tab-bar__item');
    await expect(tabs.nth(0)).toContainText('Игра');
    await expect(tabs.nth(1)).toContainText('Статистика');
    await expect(tabs.nth(2)).toContainText('Слова');

    // Switch to English
    await setUiLanguage(page, 'en');
    await expect(tabs.nth(0)).toContainText('Game');
    await expect(tabs.nth(1)).toContainText('Stats');
    await expect(tabs.nth(2)).toContainText('Words');
  });
});
