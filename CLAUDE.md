# Language Study — trilingual vocabulary game (EN/SR/RU) on GitHub Pages

## Project Purpose

Static HTML game for a Russian-native speaker learning English and Serbian.
Words are stored as structured JSON. The app runs entirely client-side on GitHub Pages.
All UI text is in Russian. English and Serbian are study languages only.

## Tech Stack

- **JS**: vanilla ES modules (`import`/`export`). No frameworks, no jQuery, no React/Vue/Svelte.
- **HTML**: semantic HTML5 (`<main>`, `<section>`, `<nav>`, `<button>`).
- **CSS**: custom properties for theming, BEM naming, mobile-first media queries.
- **Node.js**: dev tooling only (tests, linting, build scripts). Never served at runtime.
- **Data**: static JSON files loaded via `fetch()`.

## Directory Structure

```
index.html              # app shell (viewport meta, CSS links, #app div)
CLAUDE.md               # this file — AI-first project docs
AGENTS.md               # beads workflow instructions for agents
src/
  js/
    main.js             # app entry — wires router, screens, game modes
    engine.js           # core game engine — sessions, scoring, hints, word selection
    event-emitter.js    # lightweight pub/sub (on/off/emit)
    router.js           # hash-based SPA router (#home, #play, #stats, #add-words)
    progress.js         # localStorage read/write for user progress
    export.js           # Excel export (lazy-loads xlsx)
    i18n.js             # Russian UI string map — ALL user-facing text lives here
    modes/
      flashcards.js     # flip-card mode with swipe gestures
      quiz.js           # 4-option multiple choice
      typing.js         # keyboard input with progressive 5-stage hints
      match.js          # tap-to-match pairs
    ui/
      menu.js           # home screen with mode selection
      stats.js          # session history & charts
      add-words.js      # user word management
  css/
    base.css            # reset, custom properties, typography, dark mode
    components.css      # BEM component styles for all modes
    responsive.css      # mobile-first media queries
  assets/               # images, icons, fonts
public/
  data/
    vocabulary-en.json  # English word entries (served as static assets)
    vocabulary-sr.json  # Serbian word entries (served as static assets)
scripts/
  parse-words.js        # parse .txt word files → structured JSON
  enrich-vocabulary.js  # AI-enrich vocabulary via Claude API
  cleanup-vocabulary.js # deduplicate/validate vocabulary files
tests/                  # unit tests (vitest)
  engine.test.js        # GameEngine, levenshtein, fuzzyMatch, transliteration
  schema.test.js        # vocabulary JSON schema validation
  parser.test.js        # parse-words script tests
  setup.test.js         # test environment setup
```

## Build & Run Commands

```bash
npm run dev       # start local dev server (vite)
npm run build     # vite build → dist/ (for GitHub Pages deploy)
npm run test      # vitest run
npm run test:watch # vitest (watch mode)
npm run lint      # eslint src/js/
npm run parse     # parse .txt word files → public/data/*.json (idempotent)
npm run enrich    # AI-enrich vocabulary via Claude API (needs ANTHROPIC_API_KEY)
```

## Naming Conventions

| Scope       | Convention          | Example                    |
|-------------|---------------------|----------------------------|
| Files       | kebab-case          | `add-words.js`             |
| JS funcs    | camelCase           | `getNextWord()`            |
| JS classes  | PascalCase          | `GameEngine`               |
| CSS classes | BEM                 | `.card__front--flipped`    |
| CSS vars    | kebab-case          | `--color-primary`          |
| JSON keys   | snake_case          | `source_language`          |

## Architecture

### Event-Driven Decoupling

The engine and UI communicate via events (EventEmitter pattern):

- **Engine → UI events**: `session:started`, `word:loaded`, `session:ended`, `hint:revealed`, `answer:correct`, `answer:wrong`
- **UI → Engine calls**: `startSession()`, `getCurrentWord()`, `getHint()`, `checkAnswer()`, `nextWord()`, `endSession()`
- **Navigation event**: `mode:done` — emitted by mode UI, listened in `main.js` to navigate back to `#home`

**Critical**: `getCurrentWord()` is a **pure getter** (no side effects). The `word:loaded` event is emitted only by `startSession()` and `nextWord()` via the private `_emitWordLoaded()` method.

### Routing

Hash-based SPA: `#home`, `#play`, `#stats`, `#add-words`. Router class in `router.js`. Game modes render into the `#play` screen.

### Localization (i18n)

All user-facing UI text is in Russian, stored in `src/js/i18n.js`. Import `{ t }` for strings, `{ langLabel }` for language name display.

**Rule**: Never hardcode English UI text in mode files. Always use `t.key_name` from i18n.js.

## Data Format

Each vocabulary entry follows this schema:

```json
{
  "id": "en-042",
  "term": "persevere",
  "source_language": "en",
  "type": "word",
  "translations": {
    "en": null,
    "sr": "istrajati",
    "ru": "упорствовать"
  },
  "examples": {
    "en": ["You must persevere despite the difficulties."],
    "sr": ["Morate istrajati uprkos poteškoćama."],
    "ru": ["Вы должны упорствовать, несмотря на трудности."]
  },
  "explanation": "Проявлять настойчивость, не сдаваться перед трудностями.",
  "pronunciation": { "en": "ˌpɜːrsəˈvɪr" },
  "category": "character",
  "tags": ["character", "resilience"],
  "difficulty": 2,
  "enriched": true,
  "metadata": {
    "date_added": "2026-02-18",
    "source_file": "english_words.txt",
    "reviewed": false
  }
}
```

- `term` = the word or phrase being studied. Field in source language.
- `translations.{lang}` = translation to that language. `null` for the source language itself.
- `examples.{lang}` = **array of strings** (example sentences). Empty array `[]` if none.
- `enriched` = `true` after AI enrichment fills translations/examples/explanation.
- `ru` translations serve as **fallback hints only** — not a primary display language.
- `null` for any missing field. The game engine and UI must handle `null` gracefully.

## Hint Systems

### Flashcards (2-tier tap reveal)
1. **First tap** → flip card, show sister language (SR when learning EN, EN when learning SR)
2. **Second tap** → show Russian fallback
3. Swipe right = "Знаю", swipe left = "Не знаю"

### Typing mode (5-stage progressive button)
Single "Подсказка" button cycles through stages:
1. `★★★★★★` — word length as stars (+ letter count)
2. `и★★★★★` — reveal first letter
3. `и★★★★и` — reveal first + last letter
4. Sister language translation (SR or EN)
5. Russian fallback meaning

### Quiz mode (on wrong answer)
Hints auto-reveal on wrong attempts. After 2 wrong attempts, correct answer is shown.

### Match mode
No hints — visual matching only.

## Game Modes

| Mode | File | Description |
|------|------|-------------|
| Flashcards | `modes/flashcards.js` | 3D flip cards, swipe gestures, know/don't-know |
| Quiz | `modes/quiz.js` | 4-option multiple choice, auto-advance |
| Typing | `modes/typing.js` | Type translation, fuzzy matching, progressive hints |
| Match | `modes/match.js` | Tap-to-match pairs, timed rounds, difficulty scaling |

All modes follow the same lifecycle: `constructor()` → `init(container, engine)` → `start()` → `destroy()`.

All modes emit `mode:done` via `this._engine.emit('mode:done')` for back-to-menu navigation.

## Mobile UX

- Touch targets: 48px minimum (Material Design standard)
- Input font-size: `max(1rem, 16px)` to prevent iOS Safari auto-zoom
- Safe area insets respected via `env(safe-area-inset-*)`
- Bottom tab bar with fixed positioning
- Swipe gestures on flashcards (50px threshold, horizontal > vertical check)

## Data Pipeline

1. **Parse** raw .txt files → structured JSON: `npm run parse -- --english english_words.txt --output public/data/`
2. **Enrich** with AI translations, examples, explanations: `ANTHROPIC_API_KEY=sk-... npm run enrich`
3. Enrichment is idempotent — skips entries where `enriched === true`. Safe to re-run.
4. Batches of 30, saves after each batch, auto-retries on failure.
5. `--dry-run` flag previews without API calls.

## Coding Conventions

- Prefer pure functions. Avoid global mutable state.
- Use `import`/`export` only. Never `require()`.
- Event delegation over per-element listeners.
- No inline `<script>` or `<style>` blocks.
- No `!important` in CSS.
- Keep functions under 40 lines. Extract when longer.
- Use `const` by default, `let` when reassignment is needed, never `var`.
- All UI strings must go through `i18n.js` — never hardcode Russian/English text in mode files.

## Testing

- Unit tests for pure JS logic: data parsing, scoring, hint state machine, word selection.
- Use vitest. Place tests in `tests/` mirroring `src/js/` structure.
- No DOM/browser tests unless unavoidable.
- Target coverage: core modules (engine, progress, modes) above 80%.

## Do NOT

- Use jQuery, React, Vue, Svelte, or any UI framework.
- Use Webpack. Vite is acceptable only as a dev server and build tool.
- Add inline scripts or styles to HTML.
- Store large data blobs in localStorage. Keep it for user progress only.
- Use absolute paths (`/src/...`). All paths must be relative for GitHub Pages subdirectory hosting.
- Commit `node_modules/`, `dist/`, `.env`, or `.DS_Store`.
- Hardcode UI text in mode files — use `i18n.js`.
- Emit events from `getCurrentWord()` — it must be a pure getter.
