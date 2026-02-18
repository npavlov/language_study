# Language Study

Trilingual vocabulary game for learning English and Serbian with Russian hints.
Live at: https://npavlov.github.io/language_study/

## Quick Start

```bash
npm install
npm run dev          # local dev server at http://localhost:5173
```

## Game Modes

- **Flashcards** — flip cards, mark known/unknown
- **Quiz** — 4-option multiple choice
- **Typing** — type the translation (fuzzy matching, Cyrillic/Latin support)
- **Match** — connect word-translation pairs

## Adding New Words

There are **3 ways** to add words:

### Way 1: In the App (UI)

1. Open the app and go to the **Words** tab (bottom nav)
2. **Single word**: fill in the form (word, language, translation) and click "Add"
3. **Bulk paste**: paste multiple words (one per line) into the bulk textarea
4. **Import file**: drag-and-drop a `.txt` file with words (one per line)

Words added via the UI are saved in `localStorage` and merged with the built-in vocabulary at runtime. They persist across sessions but are not part of the git repo.

### Way 2: Edit Source Text Files + Re-parse

1. Add words to `english_words.txt` or `serbian_words.txt` (one per line)
2. Run the parser:
   ```bash
   npm run parse -- --english english_words.txt --output data/vocabulary-en.json
   npm run parse -- --serbian serbian_words.txt --output data/vocabulary-sr.json
   ```
3. The parser is **idempotent** — existing entries are preserved, only new words are added

**Supported formats in .txt files:**
```
word                          # bare word (language auto-detected)
hello - привет                # word + translation (dash separator)
persevere [ˌpɜːrsəˈvɪr]      # word + pronunciation in brackets
abandon = оставить            # word + translation (equals separator)
```

### Way 3: Edit JSON Directly

Edit `data/vocabulary-en.json` or `data/vocabulary-sr.json` directly. Each entry follows this structure:

```json
{
  "id": "en-1410",
  "term": "resilience",
  "source_language": "en",
  "type": "word",
  "translations": { "en": null, "sr": "otpornost", "ru": "устойчивость" },
  "examples": {
    "en": ["She showed great resilience after the setback."],
    "sr": ["Pokazala je veliku otpornost nakon neuspeha."],
    "ru": ["Она проявила большую устойчивость после неудачи."]
  },
  "explanation": "Способность быстро восстанавливаться после трудностей.",
  "pronunciation": { "en": "rɪˈzɪliəns" },
  "category": "character",
  "tags": ["noun", "character"],
  "difficulty": 3,
  "enriched": true,
  "metadata": {
    "date_added": "2026-02-18",
    "source_file": null,
    "reviewed": false
  }
}
```

**Key rules:**
- `id` must be unique (`en-NNNN` for English, `sr-NNNN` for Serbian)
- `translations` — set to `null` for the source language, fill the others
- `examples` — arrays of strings (can be empty `[]`)
- `enriched` — set to `true` if all translations/examples are filled

## AI Enrichment Pipeline

The project includes an AI enrichment script that uses Claude API to automatically fill in translations, examples, and explanations for all words.

### Running Enrichment

```bash
# Preview what will be enriched (no API calls):
npm run enrich -- --dry-run

# Run enrichment (requires API key):
ANTHROPIC_API_KEY=sk-ant-... npm run enrich
```

### How It Works

1. Reads `data/vocabulary-en.json` and `data/vocabulary-sr.json`
2. Skips entries where `enriched === true` (safe to re-run)
3. Sends batches of 30 entries to Claude Haiku
4. For each entry, fills: translations (all 3 languages), example sentences, explanation (in Russian), category, difficulty
5. Saves progress after each batch (interrupt-safe)
6. Failed batches are logged to `errors.json` for review

### Cost Estimate

~1,863 entries / 30 per batch = ~62 API calls. Using Claude Haiku, this costs approximately $0.10-0.30 total.

## Build & Deploy

```bash
npm run build        # build to dist/
npm run lint         # check code quality
npm run test         # run 48 unit tests
```

Deployment is automatic via GitHub Actions — push to `main` triggers build + deploy to GitHub Pages.

## Project Structure

```
index.html              # app shell
src/js/                 # ES modules
  engine.js             # game engine, scoring, hints, spaced repetition
  progress.js           # localStorage progress tracking
  export.js             # Excel export (lazy-loads SheetJS)
  modes/                # flashcards.js, quiz.js, typing.js, match.js
  ui/                   # menu.js, stats.js, add-words.js
src/css/                # base.css, components.css, responsive.css
data/                   # vocabulary JSON + schema
scripts/                # parse-words.js, enrich-vocabulary.js
tests/                  # vitest unit tests
```
