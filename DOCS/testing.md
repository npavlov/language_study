# Testing

## Test Suites

### Unit Tests (Vitest)

**Location**: `tests/`
**Run**: `npm test` (108 tests)

| File | Tests | Scope |
|------|-------|-------|
| `engine.test.js` | 28 | GameEngine, levenshtein, fuzzyMatch, transliteration, duplicate hint prevention |
| `word-selection.test.js` | 22 | Shuffle, filterIds, source language filtering, randomization quality, re-insert limits |
| `schema.test.js` | 5 | Vocabulary schema validation |
| `sqlite.test.js` | 17 | SQLite schema, data integrity, FTS search |
| `vocabulary-integrity.test.js` | 23 | Cross-language contamination, translation completeness |
| `parser.test.js` | 12 | Word file parsing |
| `setup.test.js` | 1 | Test environment |

### E2E Tests (Playwright)

**Location**: `e2e/`
**Run**: `npm run test:e2e` (55 tests)
**Config**: `playwright.config.js`

| File | Tests | Scope |
|------|-------|-------|
| `navigation.spec.js` | 7 | Home screen, language toggle, mode selection, tab bar, refresh redirect |
| `flashcards.spec.js` | 13 | Card flip cycle (4 taps), know/don't know, progress, summary, rapid click, Serbian |
| `quiz.spec.js` | 8 | Correct/wrong answers, auto-advance, hint on wrong, 2-wrong reveal, disabled buttons |
| `typing.spec.js` | 13 | Input/submit, wrong answer, skip, Enter key, 6 hint stages, progressive reveal, Serbian |
| `match.spec.js` | 12 | Select/deselect, correct/wrong pairs, matched disabled, complete round, timer, Serbian |

### Playwright Setup

- Viewport: 390×844 (iPhone 14)
- Browser: Chromium headless
- Web server: `npm run build && npm run preview --port 4173`
- Retries: 1

### Shared Helpers (`e2e/helpers.js`)

```js
goHome(page)          // Navigate to home, wait for vocab load
selectDirection(page, 'en' | 'sr')
selectMode(page, 'flashcards' | 'quiz' | 'typing' | 'match')
startGame(page, { direction, mode })  // Full setup: home → select → start → wait
getText(page, selector)
```

## Running Tests

```bash
# Unit tests
npm test              # Run once
npm run test:watch    # Watch mode

# E2E tests
npm run test:e2e      # All E2E (builds + starts preview server)
npx playwright test e2e/flashcards.spec.js  # Single file
npx playwright test --headed                # With browser visible
npx playwright test --debug                 # Step-by-step debug

# All tests
npm test && npm run test:e2e
```

## Writing New Tests

### Unit Test Template

```js
import { describe, it, expect } from 'vitest';

describe('Feature', () => {
  it('does something', () => {
    expect(result).toBe(expected);
  });
});
```

### E2E Test Template

```js
import { test, expect } from '@playwright/test';
import { startGame } from './helpers.js';

test.describe('Mode Name', () => {
  test.beforeEach(async ({ page }) => {
    await startGame(page, { direction: 'en', mode: 'modeName' });
  });

  test('action produces result', async ({ page }) => {
    await page.click('.selector');
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

### Key Selectors for E2E

| Element | Selector |
|---------|----------|
| Flashcard | `.flashcards__scene .card` (scoped, not just `.card`) |
| Quiz option | `.quiz__option` |
| Typing input | `.typing__input` |
| Match item | `.match__item` |
| Menu mode card | `.card[data-mode="flashcards"]` |
| Direction toggle | `.toggle__option[data-direction="en-sr"]` |
| Tab bar items | `.tab-bar__item:nth-child(N)` |
| Play screen | `#play-screen` |

**Warning**: `.card` alone matches menu cards + add-words sections. Always scope flashcard selectors with `.flashcards__scene .card`.
