/**
 * Shared database helper for vocabulary scripts.
 *
 * Provides a single openDb() function and constants for the DB path.
 * All scripts import from here to avoid duplicating path logic.
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT = join(__dirname, '..', '..');
export const DB_PATH = join(ROOT, 'data', 'vocabulary.db');

/**
 * Open the vocabulary database.
 * @param {Object} [opts]
 * @param {boolean} [opts.readonly=false]
 * @returns {import('better-sqlite3').Database}
 */
export function openDb({ readonly = false } = {}) {
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(DB_PATH)) {
    throw new Error(`Database not found: ${DB_PATH}\nRun "npm run migrate" first.`);
  }

  const db = new Database(DB_PATH, { readonly });
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * Convert a SQLite row to the JSON entry format used by the browser.
 */
export function rowToJsonEntry(row) {
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
      en: JSON.parse(row.examples_en),
      sr: JSON.parse(row.examples_sr),
      ru: JSON.parse(row.examples_ru),
    },
    explanation: row.explanation,
    pronunciation: row.pronunciation ? JSON.parse(row.pronunciation) : null,
    category: row.category,
    tags: JSON.parse(row.tags),
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

/**
 * Convert a JSON entry to SQLite row parameters.
 */
export function jsonEntryToRow(entry) {
  return {
    id: entry.id,
    term: entry.term,
    source_language: entry.source_language,
    type: entry.type || 'word',
    translation_en: entry.translations?.en ?? null,
    translation_sr: entry.translations?.sr ?? null,
    translation_ru: entry.translations?.ru ?? null,
    examples_en: JSON.stringify(entry.examples?.en ?? []),
    examples_sr: JSON.stringify(entry.examples?.sr ?? []),
    examples_ru: JSON.stringify(entry.examples?.ru ?? []),
    explanation: entry.explanation ?? null,
    pronunciation: entry.pronunciation ? JSON.stringify(entry.pronunciation) : null,
    category: entry.category ?? null,
    tags: JSON.stringify(entry.tags ?? []),
    difficulty: entry.difficulty ?? 3,
    enriched: entry.enriched ? 1 : 0,
    date_added: entry.metadata?.date_added ?? null,
    source_file: entry.metadata?.source_file ?? null,
    reviewed: entry.metadata?.reviewed ? 1 : 0,
    enriched_at: entry.metadata?.enriched_at ?? null,
  };
}

/** SQL for INSERT OR REPLACE */
export const UPSERT_SQL = `
  INSERT OR REPLACE INTO vocabulary (
    id, term, source_language, type,
    translation_en, translation_sr, translation_ru,
    examples_en, examples_sr, examples_ru,
    explanation, pronunciation,
    category, tags, difficulty, enriched,
    date_added, source_file, reviewed, enriched_at
  ) VALUES (
    @id, @term, @source_language, @type,
    @translation_en, @translation_sr, @translation_ru,
    @examples_en, @examples_sr, @examples_ru,
    @explanation, @pronunciation,
    @category, @tags, @difficulty, @enriched,
    @date_added, @source_file, @reviewed, @enriched_at
  )
`;
