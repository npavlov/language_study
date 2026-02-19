# Language Study — trilingual vocabulary game (EN/SR/RU) on GitHub Pages

## Project Purpose

Static HTML game for a Russian-native speaker learning English and Serbian.
Words are stored in SQLite (source of truth) and loaded directly in the browser via sql.js (WASM).
The app runs entirely client-side on GitHub Pages.
All UI text is in Russian. English and Serbian are study languages only.

## Tech Stack

- **JS**: vanilla ES modules (`import`/`export`). No frameworks, no jQuery, no React/Vue/Svelte.
- **HTML**: semantic HTML5 (`<main>`, `<section>`, `<nav>`, `<button>`).
- **CSS**: custom properties for theming, BEM naming, mobile-first media queries.
- **Node.js**: dev tooling only (tests, linting, build scripts). Never served at runtime.
- **Data**: SQLite database (`data/vocabulary.db`) → copied to `public/data/` and loaded directly in browser via sql.js.
- **SQLite**: `better-sqlite3` (devDependency) for data pipeline scripts. `sql.js` (dependency) for browser runtime. FTS5 full-text search.

## Directory Structure

```
index.html              # app shell (viewport meta, CSS links, #app div)
CLAUDE.md               # this file — AI-first project docs
AGENTS.md               # beads workflow instructions for agents
data/
  vocabulary.db         # SQLite database — source of truth for all vocabulary
src/
  js/
    main.js             # app entry — wires router, screens, game modes
    engine.js           # core game engine — sessions, scoring, hints, word selection
    vocabulary-db.js    # browser data layer — loads SQLite via sql.js WASM
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
    vocabulary.db       # copied from data/ — served to browser
    sql-wasm.wasm       # sql.js WASM runtime — copied from node_modules
scripts/
  lib/
    db.js               # shared DB helper (openDb, row converters, UPSERT_SQL)
  parse-words.js        # parse .txt word files → SQLite
  enrich-vocabulary.js  # AI-enrich vocabulary via Claude API (reads/writes SQLite)
  cleanup-vocabulary.js # deduplicate/validate vocabulary in SQLite
  copy-db-assets.js     # copy .db and .wasm to public/data/ (predev/prebuild)
  vocab-cli.js          # CRUD CLI: add, remove, edit, search, list, stats
  migrate-to-sqlite.js  # one-time JSON → SQLite migration
tests/                  # unit tests (vitest)
  engine.test.js        # GameEngine, levenshtein, fuzzyMatch, transliteration
  schema.test.js        # vocabulary JSON schema validation
  sqlite.test.js        # SQLite schema, integrity, FTS tests
  parser.test.js        # parse-words script tests
  word-selection.test.js # shuffle, filterIds, session tests
  vocabulary-integrity.test.js # cross-language contamination checks
  setup.test.js         # test environment setup
e2e/                    # E2E tests (Playwright)
  helpers.js            # shared helpers: goHome, startGame, selectDirection, getText
  navigation.spec.js    # home screen, tabs, language toggle, refresh redirect
  flashcards.spec.js    # flip cycle, know/don't know, progress, summary, Serbian
  quiz.spec.js          # correct/wrong, auto-advance, 2-wrong reveal, disabled
  typing.spec.js        # input/submit, skip, Enter key, 6 hint stages, Serbian
  match.spec.js         # select/deselect, correct/wrong pairs, timer, Serbian
DOCS/                   # AI-agent documentation (keep in sync with code)
  engine.md             # GameEngine API, events, session state
  modes.md              # all 4 game modes: interactions, BEM classes
  data-flow.md          # SQLite → browser pipeline, sql.js, Entry format
  testing.md            # unit + E2E test suites, helpers, selectors
  i18n.md               # Russian string map, langLabel(), rules
  routing.md            # hash router, screens, game launch flow
```

## Build & Run Commands

```bash
# Development
npm run dev        # start local dev server (vite)
npm run build      # vite build → dist/ (for GitHub Pages deploy)
npm run test       # vitest run (108 tests)
npm run test:watch # vitest (watch mode)
npm run test:e2e   # Playwright E2E (55 tests)
npm run lint       # eslint src/js/

# Data pipeline (SQLite-based)
npm run vocab -- search "word"    # full-text search
npm run vocab -- add --term "hello" --lang en --translation-sr "zdravo" --translation-ru "привет"
npm run vocab -- remove --id en-0042
npm run vocab -- edit --id en-0042 --difficulty 4
npm run vocab -- list --lang en --limit 20
npm run vocab -- stats            # counts, enrichment %, difficulty distribution
npm run vocab -- export           # copy DB assets to public/data/
npm run parse      # parse .txt word files → SQLite
npm run enrich     # AI-enrich vocabulary (needs ANTHROPIC_API_KEY)
npm run migrate    # one-time JSON → SQLite migration (use --force to overwrite)
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
| SQL columns | snake_case          | `source_language`          |

## Architecture

### Data Flow

```
data/vocabulary.db (SQLite, source of truth)
       │
       ├── predev/prebuild ──→ public/data/vocabulary.db (copy for browser)
       │                       public/data/sql-wasm.wasm (sql.js WASM runtime)
       │
       ├── npm run vocab ──→ CRUD operations directly on SQLite
       │
       └── npm run enrich ──→ AI enrichment reads/writes SQLite
```

Browser loads `vocabulary.db` via `fetch()` and opens it read-only with sql.js (WASM).
Data is queried once, converted to JS objects, and cached in memory.

### Event-Driven Decoupling

The engine and UI communicate via events (EventEmitter pattern):

- **Engine → UI events**: `session:started`, `word:loaded`, `session:ended`, `hint:revealed`, `answer:correct`, `answer:wrong`
- **UI → Engine calls**: `startSession()`, `getCurrentWord()`, `getHint()`, `checkAnswer()`, `nextWord()`, `endSession()`
- **Navigation event**: `mode:done` — emitted by mode UI, listened in `main.js` to navigate back to `#home`

**Critical**: `getCurrentWord()` is a **pure getter** (no side effects). The `word:loaded` event is emitted only by `startSession()` and `nextWord()` via the private `_emitWordLoaded()` method.

### Session Behavior

Sessions include **all playable entries** (no sessionSize limit). Words are shuffled using Fisher-Yates. `startSession(filterIds?)` accepts optional ID array for review sessions (e.g., flashcards "review mistakes").

### Routing

Hash-based SPA: `#home`, `#play`, `#stats`, `#add-words`. Router class in `router.js`. Game modes render into the `#play` screen.

### Localization (i18n)

All user-facing UI text is in Russian, stored in `src/js/i18n.js`. Import `{ t }` for strings, `{ langLabel }` for language name display.

**Rule**: Never hardcode English UI text in mode files. Always use `t.key_name` from i18n.js.

## Data Format

### SQLite Schema (source of truth)

```sql
CREATE TABLE vocabulary (
  id               TEXT PRIMARY KEY,    -- 'en-0001', 'sr-0042'
  term             TEXT NOT NULL,       -- the word/phrase being studied
  source_language  TEXT NOT NULL,       -- 'en' or 'sr'
  type             TEXT NOT NULL,       -- 'word' or 'phrase'
  translation_en   TEXT,                -- NULL for English entries
  translation_sr   TEXT,                -- NULL for Serbian entries
  translation_ru   TEXT,                -- Russian translation (hint)
  examples_en      TEXT DEFAULT '[]',   -- JSON array of strings
  examples_sr      TEXT DEFAULT '[]',
  examples_ru      TEXT DEFAULT '[]',
  explanation      TEXT,                -- Russian explanation
  pronunciation    TEXT,                -- JSON object or NULL
  category         TEXT,
  tags             TEXT DEFAULT '[]',   -- JSON array of strings
  difficulty       INTEGER DEFAULT 3,   -- 1-5
  enriched         INTEGER DEFAULT 0,   -- 0 or 1
  date_added       TEXT,
  source_file      TEXT,
  reviewed         INTEGER DEFAULT 0,
  enriched_at      TEXT
);

-- FTS5 full-text search on term and all translations
CREATE VIRTUAL TABLE vocabulary_fts USING fts5(...);
```

### In-Memory Entry Format (browser runtime)

Generated by `vocabulary-db.js` from SQLite rows. Same format used by the game engine:

```json
{
  "id": "en-042",
  "term": "persevere",
  "source_language": "en",
  "type": "word",
  "translations": { "en": null, "sr": "istrajati", "ru": "упорствовать" },
  "examples": { "en": ["..."], "sr": ["..."], "ru": ["..."] },
  "explanation": "Проявлять настойчивость...",
  "pronunciation": { "en": "ˌpɜːrsəˈvɪr" },
  "category": "character",
  "tags": ["character", "resilience"],
  "difficulty": 2,
  "enriched": true,
  "metadata": { "date_added": "2026-02-18", "source_file": "english_words.txt", "reviewed": false }
}
```

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

1. **Parse** raw .txt files → SQLite: `npm run parse`
2. **Enrich** with AI translations, examples, explanations: `ANTHROPIC_API_KEY=sk-... npm run enrich`
3. **Copy assets** to public/: runs automatically via `predev`/`prebuild` hooks, or manually via `npm run vocab -- export`
4. Enrichment is idempotent — skips entries where `enriched = 1`. Safe to re-run.
5. Batches of 5, saves after each batch, auto-retries on failure.
6. `--dry-run` flag previews without API calls.

## Agent Workflow — Vocabulary CRUD

For Claude agents or human devs editing vocabulary data:

### Quick reference

```bash
# Search
npm run vocab -- search "word"

# Add a word
npm run vocab -- add --term "hello" --lang en --translation-sr "zdravo" --translation-ru "привет"

# Remove
npm run vocab -- remove --id en-0042

# Edit
npm run vocab -- edit --id en-0042 --difficulty 4 --category "greetings"

# After ANY database change, copy DB to public/:
npm run vocab -- export

# Verify
npm run test
```

### Direct SQL (for bulk operations)

```bash
# Via better-sqlite3 in Node.js one-liner:
node -e '
import Database from "better-sqlite3";
const db = new Database("data/vocabulary.db");
db.prepare("UPDATE vocabulary SET difficulty = 4 WHERE category = ?").run("advanced");
db.close();
'
```

### Important rules

- **Always run `npm run vocab -- export` after modifying the database** — copies .db to public/ for browser.
- **Always run `npm test` after changes** — verifies data integrity.
- The shared DB module is at `scripts/lib/db.js` — use `openDb()`, `jsonEntryToRow()`, `rowToJsonEntry()`, `UPSERT_SQL`.
- SQLite file is committed to git. The `predev`/`prebuild` hooks auto-copy it to `public/data/`.

## Coding Conventions

- Prefer pure functions. Avoid global mutable state.
- Use `import`/`export` only. Never `require()`.
- Event delegation over per-element listeners.
- No inline `<script>` or `<style>` blocks.
- No `!important` in CSS.
- Keep functions under 40 lines. Extract when longer.
- Use `const` by default, `let` when reassignment is needed, never `var`.
- All UI strings must go through `i18n.js` — never hardcode Russian/English text in mode files.
- **After changing code, update the corresponding `DOCS/*.md` files** — keep documentation in sync with implementation.

## Documentation

AI-agent-friendly docs live in `DOCS/`:

| File | Scope |
|------|-------|
| `engine.md` | GameEngine API, events, session state, entry format |
| `modes.md` | All 4 game modes — lifecycle, interactions, BEM classes |
| `data-flow.md` | SQLite → browser pipeline, sql.js usage, schemas |
| `testing.md` | Unit + E2E test suites, helpers, selectors, how to run |
| `i18n.md` | Russian string map, langLabel(), rules |
| `routing.md` | Hash router, screens, tab bar, game launch flow |

**Rule**: When modifying any `src/js/` or `src/css/` file, update the relevant `DOCS/*.md`.

## Testing

- 108 unit tests (vitest) across 7 test files + 55 E2E tests (Playwright).
- Unit tests for pure JS logic: data parsing, scoring, hint state machine, word selection.
- SQLite tests: schema validation, data integrity, FTS search.
- E2E tests: all 4 game modes, navigation, corner cases.
- Use vitest for unit tests (`tests/`), Playwright for E2E (`e2e/`).
- Run: `npm test` (unit), `npm run test:e2e` (E2E).
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
- Modify `public/data/vocabulary.db` directly — always edit `data/vocabulary.db` and run `npm run vocab -- export`.
