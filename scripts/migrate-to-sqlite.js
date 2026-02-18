#!/usr/bin/env node

/**
 * migrate-to-sqlite.js — Convert vocabulary JSON files to SQLite database.
 *
 * Reads public/data/vocabulary-en.json and vocabulary-sr.json,
 * creates data/vocabulary.db with a normalized schema.
 *
 * Usage:
 *   node scripts/migrate-to-sqlite.js [--force]
 *
 * Options:
 *   --force   Overwrite existing database file
 *
 * Idempotent: skips entries that already exist (by id).
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const DB_PATH = join(ROOT, 'data', 'vocabulary.db');
const JSON_FILES = [
  join(ROOT, 'public', 'data', 'vocabulary-en.json'),
  join(ROOT, 'public', 'data', 'vocabulary-sr.json'),
];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
-- Vocabulary entries — one row per word/phrase
CREATE TABLE IF NOT EXISTS vocabulary (
  id               TEXT PRIMARY KEY,
  term             TEXT NOT NULL,
  source_language  TEXT NOT NULL CHECK (source_language IN ('en', 'sr')),
  type             TEXT NOT NULL DEFAULT 'word' CHECK (type IN ('word', 'phrase')),

  -- Translations (NULL = source language itself)
  translation_en   TEXT,
  translation_sr   TEXT,
  translation_ru   TEXT,

  -- Examples (JSON arrays of strings)
  examples_en      TEXT NOT NULL DEFAULT '[]',
  examples_sr      TEXT NOT NULL DEFAULT '[]',
  examples_ru      TEXT NOT NULL DEFAULT '[]',

  explanation      TEXT,

  -- Pronunciation (JSON object or NULL)
  pronunciation    TEXT,

  category         TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  difficulty       INTEGER NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  enriched         INTEGER NOT NULL DEFAULT 0 CHECK (enriched IN (0, 1)),

  -- Metadata
  date_added       TEXT,
  source_file      TEXT,
  reviewed         INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  enriched_at      TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vocabulary_source_language ON vocabulary(source_language);
CREATE INDEX IF NOT EXISTS idx_vocabulary_difficulty ON vocabulary(difficulty);
CREATE INDEX IF NOT EXISTS idx_vocabulary_enriched ON vocabulary(enriched);
CREATE INDEX IF NOT EXISTS idx_vocabulary_type ON vocabulary(type);

-- Full-text search on term and translations
CREATE VIRTUAL TABLE IF NOT EXISTS vocabulary_fts USING fts5(
  id UNINDEXED,
  term,
  translation_en,
  translation_sr,
  translation_ru,
  explanation,
  content='vocabulary',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS vocabulary_ai AFTER INSERT ON vocabulary BEGIN
  INSERT INTO vocabulary_fts(rowid, id, term, translation_en, translation_sr, translation_ru, explanation)
  VALUES (new.rowid, new.id, new.term, new.translation_en, new.translation_sr, new.translation_ru, new.explanation);
END;

CREATE TRIGGER IF NOT EXISTS vocabulary_ad AFTER DELETE ON vocabulary BEGIN
  INSERT INTO vocabulary_fts(vocabulary_fts, rowid, id, term, translation_en, translation_sr, translation_ru, explanation)
  VALUES ('delete', old.rowid, old.id, old.term, old.translation_en, old.translation_sr, old.translation_ru, old.explanation);
END;

CREATE TRIGGER IF NOT EXISTS vocabulary_au AFTER UPDATE ON vocabulary BEGIN
  INSERT INTO vocabulary_fts(vocabulary_fts, rowid, id, term, translation_en, translation_sr, translation_ru, explanation)
  VALUES ('delete', old.rowid, old.id, old.term, old.translation_en, old.translation_sr, old.translation_ru, old.explanation);
  INSERT INTO vocabulary_fts(rowid, id, term, translation_en, translation_sr, translation_ru, explanation)
  VALUES (new.rowid, new.id, new.term, new.translation_en, new.translation_sr, new.translation_ru, new.explanation);
END;

-- Schema metadata
CREATE TABLE IF NOT EXISTS schema_info (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_info (key, value) VALUES ('version', '1');
INSERT OR REPLACE INTO schema_info (key, value) VALUES ('migrated_at', datetime('now'));
`;

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

function jsonEntryToRow(entry) {
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

function migrate({ force = false } = {}) {
  // Ensure data/ directory exists
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (existsSync(DB_PATH) && !force) {
    console.log(`Database already exists: ${DB_PATH}`);
    console.log('Use --force to overwrite.');
    process.exit(1);
  }

  // Read JSON files
  let allEntries = [];
  for (const file of JSON_FILES) {
    if (!existsSync(file)) {
      console.warn(`Warning: ${file} not found, skipping.`);
      continue;
    }
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    const entries = data.entries || [];
    console.log(`Read ${entries.length} entries from ${file}`);
    allEntries = allEntries.concat(entries);
  }

  if (allEntries.length === 0) {
    console.error('No entries found. Aborting.');
    process.exit(1);
  }

  // Create database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  db.exec(SCHEMA_SQL);

  // Insert entries
  const insertStmt = db.prepare(`
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
  `);

  const insertAll = db.transaction((entries) => {
    let inserted = 0;
    for (const entry of entries) {
      const row = jsonEntryToRow(entry);
      insertStmt.run(row);
      inserted++;
    }
    return inserted;
  });

  const count = insertAll(allEntries);
  console.log(`\nInserted ${count} entries into ${DB_PATH}`);

  // Verify
  const stats = db.prepare(`
    SELECT source_language, COUNT(*) as count
    FROM vocabulary
    GROUP BY source_language
  `).all();

  console.log('\nDatabase stats:');
  for (const row of stats) {
    console.log(`  ${row.source_language}: ${row.count} entries`);
  }

  const total = db.prepare('SELECT COUNT(*) as count FROM vocabulary').get();
  console.log(`  total: ${total.count} entries`);

  // Test FTS
  const ftsCount = db.prepare('SELECT COUNT(*) as count FROM vocabulary_fts').get();
  console.log(`  FTS index: ${ftsCount.count} entries`);

  db.close();
  console.log('\nMigration complete.');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const force = process.argv.includes('--force');
migrate({ force });
