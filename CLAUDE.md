# Language Study — trilingual vocabulary game (EN/SR/RU) on GitHub Pages

## Project Purpose

Static HTML game for a Russian-native speaker learning English and Serbian.
Words are stored as structured JSON. The app runs entirely client-side on GitHub Pages.

## Tech Stack

- **JS**: vanilla ES modules (`import`/`export`). No frameworks, no jQuery, no React/Vue/Svelte.
- **HTML**: semantic HTML5 (`<main>`, `<section>`, `<nav>`, `<button>`).
- **CSS**: custom properties for theming, BEM naming, mobile-first media queries.
- **Node.js**: dev tooling only (tests, linting, build scripts). Never served at runtime.
- **Data**: static JSON files loaded via `fetch()`.

## Directory Structure

```
index.html              # app shell
src/
  js/                   # ES modules — app entry: main.js
    engine.js           # core game engine, word selection, session state
    progress.js         # localStorage read/write for user progress
    export.js           # Excel export (lazy-loads xlsx)
    modes/              # one file per game mode (flashcards, quiz, typing, match)
    ui/                 # UI controllers (menu, stats, add-words)
  css/
    base.css            # reset, custom properties, typography
    components.css      # BEM component styles
    responsive.css      # media queries, dark mode
  assets/               # images, icons, fonts
public/
  data/
    vocabulary-en.json  # English word entries (served as static assets)
    vocabulary-sr.json  # Serbian word entries (served as static assets)
scripts/                # Node.js utility scripts (parse-words, enrich-vocabulary)
tests/                  # unit tests (vitest)
```

## Build & Run Commands

```bash
npm run dev       # start local dev server (vite)
npm run lint      # eslint src/js/**
npm run test      # vitest
npm run build     # vite build → dist/ (for GitHub Pages deploy)
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

## Hint System

Two-tier progressive reveal when learning English:

1. **First hint** → show Serbian translation (`sr`)
2. **Second hint** → show Russian meaning (`ru`)

When learning Serbian, reverse: first hint is English (`en`), second is Russian (`ru`).
Never auto-reveal hints. User must explicitly request each level.

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
