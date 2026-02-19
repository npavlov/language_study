/**
 * vocabulary-db.js — Load vocabulary from SQLite in the browser via sql.js.
 *
 * Fetches data/vocabulary.db, opens it read-only with sql.js WASM,
 * queries all entries, converts to the JSON entry format the engine expects,
 * and caches the result. The DB is opened once, read, then closed.
 */

import initSqlJs from 'sql.js';

let cached = null;

/**
 * Convert a row object (from stmt.getAsObject) to the entry format.
 */
function rowToEntry(row) {
  return {
    id: row.id,
    term: row.term,
    source_language: row.source_language,
    type: row.type,
    translations: {
      en: row.translation_en,
      sr: row.translation_sr,
      ru: row.translation_ru,
    },
    examples: {
      en: JSON.parse(row.examples_en || '[]'),
      sr: JSON.parse(row.examples_sr || '[]'),
      ru: JSON.parse(row.examples_ru || '[]'),
    },
    explanation: row.explanation,
    pronunciation: row.pronunciation ? JSON.parse(row.pronunciation) : null,
    category: row.category,
    tags: JSON.parse(row.tags || '[]'),
    difficulty: row.difficulty,
    enriched: row.enriched === 1,
    metadata: {
      date_added: row.date_added,
      source_file: row.source_file,
      reviewed: row.reviewed === 1,
      ...(row.enriched_at ? { enriched_at: row.enriched_at } : {}),
    },
  };
}

const QUERY = `
  SELECT id, term, source_language, type,
         translation_en, translation_sr, translation_ru,
         examples_en, examples_sr, examples_ru,
         explanation, pronunciation,
         category, tags, difficulty, enriched,
         date_added, source_file, reviewed, enriched_at
  FROM vocabulary
  ORDER BY id
`;

/**
 * Load all vocabulary entries from SQLite.
 * @returns {Promise<{en: Array, sr: Array}>}
 */
export async function loadAllEntries() {
  if (cached) return cached;

  const SQL = await initSqlJs({
    locateFile: () => 'data/sql-wasm.wasm',
  });

  const response = await fetch('data/vocabulary.db');
  if (!response.ok) {
    throw new Error(`Failed to load vocabulary.db: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));

  const entries = { en: [], sr: [] };

  // Use stmt.getAsObject() to get proper {column: value} objects,
  // avoiding reliance on result property names that may be minified
  // in the sql.js browser build (e.g. 'columns' → 'lc').
  const stmt = db.prepare(QUERY);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const entry = rowToEntry(row);
    if (entry.source_language === 'en') {
      entries.en.push(entry);
    } else if (entry.source_language === 'sr') {
      entries.sr.push(entry);
    }
  }
  stmt.free();

  db.close();

  cached = entries;
  return entries;
}
