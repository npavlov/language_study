# Data Flow

## Architecture

```
data/vocabulary.db (SQLite — source of truth)
       │
       ├── scripts/copy-db-assets.js → public/data/vocabulary.db (for browser)
       │                                public/data/sql-wasm.wasm
       │
       ├── scripts/vocab-cli.js → CRUD on SQLite directly
       ├── scripts/enrich-vocabulary.js → AI enrichment via Claude API
       └── scripts/parse-words.js → parse .txt → SQLite

Browser loads vocabulary.db via sql.js (WASM):
  vocabulary-db.js → loadAllEntries() → { en: Entry[], sr: Entry[] }
```

## Browser Data Loading

**File**: `src/js/vocabulary-db.js`

```js
import initSqlJs from 'sql.js';

export async function loadAllEntries() → Promise<{ en: Entry[], sr: Entry[] }>
```

1. Loads sql-wasm.wasm from `data/sql-wasm.wasm`
2. Fetches `data/vocabulary.db` as ArrayBuffer
3. Opens with `SQL.Database(new Uint8Array(buffer))`
4. Queries all entries via `db.prepare(QUERY)` → `stmt.step()` → `stmt.getAsObject()`
5. Converts rows to Entry format via `rowToEntry()`
6. Splits into `en` and `sr` arrays by `source_language`
7. Caches result (loaded once per session)

**Important**: Uses `stmt.getAsObject()` NOT `db.exec()` — the browser build of sql.js minifies property names, breaking `exec()`.

## Build Pipeline

```bash
npm run predev / npm run prebuild
  → node scripts/copy-db-assets.js
  → Copies vocabulary.db + sql-wasm.wasm to public/data/

npm run build
  → vite build → dist/ (for GitHub Pages)
  → vocabulary.db and sql-wasm.wasm copied as static assets
```

## SQLite Schema

```sql
CREATE TABLE vocabulary (
  id               TEXT PRIMARY KEY,    -- 'en-0001', 'sr-0042'
  term             TEXT NOT NULL,
  source_language  TEXT NOT NULL,       -- 'en' or 'sr'
  type             TEXT NOT NULL,       -- 'word' or 'phrase'
  translation_en   TEXT,
  translation_sr   TEXT,
  translation_ru   TEXT,
  examples_en      TEXT DEFAULT '[]',   -- JSON array
  examples_sr      TEXT DEFAULT '[]',
  examples_ru      TEXT DEFAULT '[]',
  explanation      TEXT,
  pronunciation    TEXT,                -- JSON object or NULL
  category         TEXT,
  tags             TEXT DEFAULT '[]',   -- JSON array
  difficulty       INTEGER DEFAULT 3,
  enriched         INTEGER DEFAULT 0,
  date_added       TEXT,
  source_file      TEXT,
  reviewed         INTEGER DEFAULT 0,
  enriched_at      TEXT
);

CREATE VIRTUAL TABLE vocabulary_fts USING fts5(
  term, translation_en, translation_sr, translation_ru,
  content=vocabulary
);
```

## Entry Format (Browser Runtime)

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

## User Words

Stored in `localStorage` as JSON. Merged with built-in vocabulary at runtime via `mergeWithBuiltIn()` in `src/js/ui/add-words.js`.

## Progress

User session history stored in `localStorage` via `src/js/progress.js`:
- `recordSession()` — saves session results
- `loadProgress()` — reads streak days, mastery levels, session history
