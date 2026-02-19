# GameEngine — Core Game Logic

**File**: `src/js/engine.js`

## Overview

GameEngine manages vocabulary sessions — shuffling words, tracking score/streaks, providing hints, and checking answers. It extends `EventEmitter` for UI decoupling.

## Constructor

```js
new GameEngine({ entries: Array, direction: 'en-sr' | 'sr-en' })
```

| Param | Description |
|-------|-------------|
| `entries` | All vocabulary entries (both languages) |
| `direction` | `'en-sr'` = learn English with Serbian hints; `'sr-en'` = learn Serbian with English hints |

### Derived Properties

| Property | From `direction` | Example |
|----------|-----------------|---------|
| `targetLang` | First part | `'en'` |
| `hintLang` | Second part | `'sr'` |
| `fallbackLang` | Always | `'ru'` |

## Public API

### `getPlayableEntries() → Entry[]`

Filters `allEntries` by:
- `source_language === targetLang`
- Has a non-empty `term`
- Has at least one translation (`hintLang` or `fallbackLang`)

### `startSession(filterIds?) → Entry`

1. Gets playable entries, optionally filtered by `filterIds`
2. Fisher-Yates shuffles them
3. Creates `session` state object
4. Emits `session:started`
5. Emits `word:loaded` for the first word
6. Returns the first entry

### `getCurrentWord() → Entry | null`

Pure getter — returns `session.words[session.currentIndex]`. **No side effects.**

### `getHint() → { level, text, lang } | null`

Two-tier hint system:
- **First call** (level 1): sister language translation (`hintLang`)
- **Second call** (level 2): Russian fallback (`fallbackLang`)
- If sister language is missing, jumps directly to level 2 and sets `hintsUsed = 2` (prevents duplicate hints)

Tracks usage in `session.hintsUsed` Map. Affects scoring: `hintsUsed === 0` gives +5 bonus.

### `checkAnswer(answer, targetLang?) → { correct, expected, hintsUsed }`

- Normalizes and compares `answer` to `expected` translation
- Correct: increments streak, calculates score (`10 × streak_multiplier + hint_bonus`)
- Wrong: resets streak, adds to `wrongWords`, re-queues word once (5 positions ahead)
- Re-queue limited to **once per word per session** via `reinsertedWords` Set

### `nextWord() → Entry | Summary`

Advances `currentIndex`. Returns next entry, or `endSession()` summary if done.

### `endSession() → Summary`

Returns `{ score, totalWords, totalAnswered, totalCorrect, accuracy, bestStreak, wrongWords, elapsedTime }`.

## Events

| Event | Payload | When |
|-------|---------|------|
| `session:started` | `{ totalWords, direction }` | `startSession()` |
| `word:loaded` | `{ index, total, term, type, id }` | `startSession()`, `nextWord()` |
| `hint:revealed` | `{ level, text, lang, wordId }` | `getHint()` |
| `answer:correct` | `{ wordId, points, streak, score }` | `checkAnswer()` correct |
| `answer:wrong` | `{ wordId, expected, given }` | `checkAnswer()` wrong |
| `session:ended` | Summary object | `endSession()` |
| `mode:done` | (none) | UI → navigate back to menu |

## Session State

```js
session = {
  words: Entry[],           // shuffled playable entries
  currentIndex: number,
  score: number,
  streak: number,
  bestStreak: number,
  hintsUsed: Map<id, count>,
  wrongWords: string[],     // entry IDs
  reinsertedWords: Set<id>, // limits re-queue to 1x per word
  startTime: number,
  elapsedTime: number,
  totalAnswered: number,
  totalCorrect: number,
}
```

## Exported Utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `levenshtein(a, b)` | `→ number` | Edit distance |
| `fuzzyMatch(answer, expected, maxDist?)` | `→ { exact, close, distance }` | Fuzzy comparison |
| `serbianCyrillicToLatin(text)` | `→ string` | Cyrillic→Latin transliteration |

## Entry Format

```js
{
  id: 'en-042',
  term: 'persevere',
  source_language: 'en',
  type: 'word',
  translations: { en: null, sr: 'istrajati', ru: 'упорствовать' },
  examples: { en: [...], sr: [...], ru: [...] },
  explanation: '...',
  pronunciation: { en: '...' },
  category: 'character',
  tags: ['character'],
  difficulty: 2,
  enriched: true,
  metadata: { date_added: '...', source_file: '...', reviewed: false },
}
```
