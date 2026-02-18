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
data/
  vocabulary-en.json    # English word entries
  vocabulary-sr.json    # Serbian word entries
scripts/                # Node.js utility scripts (parse-words, enrich-vocabulary)
tests/                  # unit tests (vitest)
```

## Build & Run Commands

```bash
npm run dev       # start local dev server (vite or live-server)
npm run lint      # eslint src/js/**
npm run test      # vitest
npm run build     # vite build → dist/ (for GitHub Pages deploy)
```

## Naming Conventions

| Scope       | Convention          | Example                    |
|-------------|---------------------|----------------------------|
| Files       | kebab-case          | `flash-cards.js`           |
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
  "word": "persevere",
  "source_language": "en",
  "type": "word",
  "translations": {
    "en": "persevere",
    "sr": "istrajati",
    "ru": "упорствовать"
  },
  "examples": {
    "en": "You must persevere despite the difficulties.",
    "sr": "Morate istrajati uprkos poteškoćama.",
    "ru": "Вы должны упорствовать, несмотря на трудности."
  },
  "explanation": "Проявлять настойчивость, не сдаваться перед трудностями.",
  "pronunciation": { "en": "ˌpɜːrsəˈvɪr" },
  "tags": ["character", "resilience"],
  "difficulty": 2
}
```

- `ru` translations serve as **fallback hints only** — not a primary display language.
- `null` for any missing field. The game engine and UI must handle `null` gracefully.

## Hint System

Two-tier progressive reveal when learning English:

1. **First hint** → show Serbian translation (`sr`)
2. **Second hint** → show Russian meaning (`ru`)

When learning Serbian, reverse: first hint is English (`en`), second is Russian (`ru`).
Never auto-reveal hints. User must explicitly request each level.

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
