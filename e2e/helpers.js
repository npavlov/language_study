/**
 * Shared E2E test helpers for Language Study app.
 */

/** Navigate to the app home screen and wait for vocab to load. */
export async function goHome(page) {
  await page.goto('/language_study/#home');
  // Wait for menu to render and vocab to load
  await page.waitForSelector('.menu', { timeout: 10_000 });
  // Wait for word count to become non-zero (vocab loaded)
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.menu__word-count');
      return el && !el.textContent.includes('0 ');
    },
    { timeout: 15_000 },
  );
}

/** Select a language direction. */
export async function selectDirection(page, direction) {
  const dirAttr = direction === 'en' ? 'en-sr' : 'sr-en';
  await page.click(`.toggle__option[data-direction="${dirAttr}"]`);
}

/** Select a game mode by clicking its card. */
export async function selectMode(page, modeId) {
  await page.click(`.card[data-mode="${modeId}"]`);
}

/** Click the start button and wait for the game screen. */
export async function startGame(page, { direction = 'en', mode = 'flashcards' } = {}) {
  await goHome(page);
  await selectDirection(page, direction);
  await selectMode(page, mode);
  await page.click('.btn--primary.btn--block');
  // Wait for play screen to become active
  await page.waitForSelector('.screen--active#play-screen', { timeout: 10_000 });
}

/** Get text content of an element, trimmed. */
export async function getText(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 5000 });
  return (await el.textContent()).trim();
}
