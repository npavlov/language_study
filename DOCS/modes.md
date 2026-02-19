# Game Modes

All modes follow the same lifecycle: `constructor()` → `init(container, engine)` → `start()` → `destroy()`.

All modes emit `mode:done` via `this._engine.emit('mode:done')` for back-to-menu navigation.

## Files

| Mode | File | Class |
|------|------|-------|
| Flashcards | `src/js/modes/flashcards.js` | `FlashcardsMode` |
| Quiz | `src/js/modes/quiz.js` | `QuizMode` |
| Typing | `src/js/modes/typing.js` | `TypingMode` |
| Match | `src/js/modes/match.js` | `MatchMode` |

---

## Flashcards (`FlashcardsMode`)

3D flip-card UI with swipe gestures.

### Tap Cycle

| Tap # | Action |
|-------|--------|
| 1 | Flip card → show sister language hint |
| 2 | Show Russian fallback, hide tap prompt |
| 3 | Flip back to front (term visible) |
| 4 | Flip to hints again (cycle 3↔4) |

### Interactions

- **Know** (`.flashcards__btn--know`): marks correct, calls `checkAnswer()` + `nextWord()`
- **Don't Know** (`.flashcards__btn--dont`): marks wrong, calls `checkAnswer('')` + `nextWord()`
- **Swipe right**: same as Know; **Swipe left**: same as Don't Know (50px threshold)
- Buttons disabled between answers until next card loads

### Card Animation

`card--slide-out` → reset content → `card--slide-in`. Fallback timeout at 200ms for first word.

### Summary

Shows known/unknown counts, accuracy %, score, best streak, time. "Review mistakes" button re-starts session with only wrong word IDs.

### BEM Classes

`flashcards`, `flashcards__scene`, `flashcards__back-btn`, `flashcards__progress-*`, `flashcards__btn--know/--dont/--review/--done`, `flashcards__summary-*`, `card`, `card__inner`, `card__front`, `card__back`, `card__term`, `card__hint`, `card__tap-prompt`, `card--flipped`, `card--slide-out/--slide-in`

---

## Quiz (`QuizMode`)

4-option multiple choice with auto-advance.

### Question Flow

1. Term displayed in `.quiz__term`
2. 4 buttons: 1 correct + 3 distractors (shuffled)
3. Click correct → green highlight, +score, auto-advance after 800ms
4. Click wrong → red highlight, button disabled, hint shown
5. After 2 wrong: correct revealed, auto-advance after 1600ms

### Distractor Selection

`buildDistractors()` picks from same `source_language` first, then other group. Shuffles combined pool.

### Summary

Score, accuracy, best streak, words seen, time. Mistakes list with term → correct answer. "Play again" re-calls `start()`.

### BEM Classes

`quiz`, `quiz__header`, `quiz__term`, `quiz__hint`, `quiz__options`, `quiz__option`, `quiz__option--correct/--wrong`, `quiz__score`, `quiz__progress-*`, `quiz__summary-*`, `quiz__back-btn`, `quiz__replay`, `quiz__menu-btn`

---

## Typing (`TypingMode`)

Keyboard input with fuzzy matching and 6-stage progressive hints.

### Answer Checking

1. Input normalized + Serbian Cyrillic→Latin transliterated
2. Exact match → correct (green flash, auto-advance 1s)
3. Fuzzy match (Levenshtein ≤ 2) → "close" warning (yellow), user retries
4. No match → wrong (red flash, correct answer shown)
5. Empty submit → shake feedback "Сначала напиши ответ"

### Hint Stages (Single Button)

| Stage | Content |
|-------|---------|
| 1 | Stars `★★★★` + letter count, 1–2 random letters revealed |
| 2 | 1–2 more random letters revealed |
| 3 | 1–2 more random letters revealed |
| 4 | 1–2 more random letters revealed |
| 5 | Sister language translation (Serbian or English) |
| 6 | Russian translation |

Letters per stage: 1 for words ≤5 chars, 2 for 6+ chars. Random positions from unrevealed pool.

### Skip Workflow

First skip: shows correct answer, button changes to "Дальше". Second click: advances.

### Keyboard

Enter key submits answer (or advances if already answered).

### BEM Classes

`typing`, `typing__header`, `typing__card`, `typing__word-term`, `typing__input`, `typing__btn--submit/--hint/--skip`, `typing__feedback--correct/--wrong/--close`, `typing__hint--masked/--level-1/--level-2`, `typing__hint-count`, `typing__actions`, `typing__summary-*`, `typing__mistakes-*`

---

## Match (`MatchMode`)

Tap-to-match pairs game with escalating difficulty.

### Rounds

- Round 1: 4 pairs
- Each round: +1 pair (capped at 8)
- Left column: target language terms
- Right column: sister language translations (shuffled)

### Interaction

1. Tap left item → selected (blue highlight)
2. Tap same left → deselect
3. Tap different left → switch selection
4. Tap right with no selection → nothing
5. Tap matching right → correct (green → fade out after 500ms)
6. Tap non-matching right → wrong (red flash 600ms)
7. All matched → round summary

### Timer

Updates every 500ms. Stops when all pairs matched.

### Summary

Time, wrong attempts, pairs matched. "Next round" and "Back to menu" buttons.

### BEM Classes

`match`, `match__header`, `match__grid`, `match__column--left/--right`, `match__item`, `match__item--selected/--correct/--wrong/--matched`, `match__round`, `match__timer`, `match__summary-*`, `match__back-btn`, `match__next-btn`, `match__menu-btn`
