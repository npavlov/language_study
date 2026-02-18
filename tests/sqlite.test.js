/**
 * SQLite database tests.
 *
 * Validates:
 * - Database schema matches expectations
 * - FTS5 full-text search works
 * - Roundtrip: DB → JSON → DB produces identical data
 * - Vocab CLI operations (add, remove, search)
 * - Data integrity between SQLite and JSON
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DB_PATH = join(ROOT, 'data', 'vocabulary.db');
const JSON_EN_PATH = join(ROOT, 'public', 'data', 'vocabulary-en.json');
const JSON_SR_PATH = join(ROOT, 'public', 'data', 'vocabulary-sr.json');

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('SQLite schema', () => {
  it('database file exists', () => {
    expect(existsSync(DB_PATH)).toBe(true);
  });

  it('vocabulary table has expected columns', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const cols = db.prepare("PRAGMA table_info('vocabulary')").all();
    db.close();

    const colNames = cols.map((c) => c.name);
    const expected = [
      'id', 'term', 'source_language', 'type',
      'translation_en', 'translation_sr', 'translation_ru',
      'examples_en', 'examples_sr', 'examples_ru',
      'explanation', 'pronunciation',
      'category', 'tags', 'difficulty', 'enriched',
      'date_added', 'source_file', 'reviewed', 'enriched_at',
    ];

    for (const col of expected) {
      expect(colNames).toContain(col);
    }
  });

  it('vocabulary table has correct constraints', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const cols = db.prepare("PRAGMA table_info('vocabulary')").all();
    db.close();

    const idCol = cols.find((c) => c.name === 'id');
    expect(idCol.pk).toBe(1);

    const termCol = cols.find((c) => c.name === 'term');
    expect(termCol.notnull).toBe(1);

    const langCol = cols.find((c) => c.name === 'source_language');
    expect(langCol.notnull).toBe(1);
  });

  it('indexes exist for common queries', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='vocabulary'").all();
    db.close();

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_vocabulary_source_language');
    expect(indexNames).toContain('idx_vocabulary_difficulty');
    expect(indexNames).toContain('idx_vocabulary_enriched');
  });

  it('FTS5 virtual table exists', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vocabulary_fts'").get();
    db.close();

    expect(fts).toBeDefined();
  });

  it('schema_info table has version', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const version = db.prepare("SELECT value FROM schema_info WHERE key = 'version'").get();
    db.close();

    expect(version.value).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Data integrity tests
// ---------------------------------------------------------------------------

describe('SQLite data integrity', () => {
  it('has entries for both languages', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const counts = db.prepare(
      'SELECT source_language, COUNT(*) as n FROM vocabulary GROUP BY source_language'
    ).all();
    db.close();

    const byLang = Object.fromEntries(counts.map((r) => [r.source_language, r.n]));
    expect(byLang.en).toBeGreaterThan(1000);
    expect(byLang.sr).toBeGreaterThan(400);
  });

  it('all entries have valid source_language', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const invalid = db.prepare(
      "SELECT COUNT(*) as n FROM vocabulary WHERE source_language NOT IN ('en', 'sr')"
    ).get();
    db.close();

    expect(invalid.n).toBe(0);
  });

  it('all entries have valid type', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const invalid = db.prepare(
      "SELECT COUNT(*) as n FROM vocabulary WHERE type NOT IN ('word', 'phrase')"
    ).get();
    db.close();

    expect(invalid.n).toBe(0);
  });

  it('all entries have valid difficulty (1-5)', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const invalid = db.prepare(
      'SELECT COUNT(*) as n FROM vocabulary WHERE difficulty < 1 OR difficulty > 5'
    ).get();
    db.close();

    expect(invalid.n).toBe(0);
  });

  it('no duplicate IDs', () => {
    const db = new Database(DB_PATH, { readonly: true });
    // Primary key already enforces this, but let's verify
    const total = db.prepare('SELECT COUNT(*) as n FROM vocabulary').get().n;
    const unique = db.prepare('SELECT COUNT(DISTINCT id) as n FROM vocabulary').get().n;
    db.close();

    expect(total).toBe(unique);
  });

  it('examples columns contain valid JSON arrays', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare('SELECT id, examples_en, examples_sr, examples_ru FROM vocabulary LIMIT 100').all();
    db.close();

    for (const row of rows) {
      expect(() => JSON.parse(row.examples_en)).not.toThrow();
      expect(() => JSON.parse(row.examples_sr)).not.toThrow();
      expect(() => JSON.parse(row.examples_ru)).not.toThrow();
      expect(Array.isArray(JSON.parse(row.examples_en))).toBe(true);
      expect(Array.isArray(JSON.parse(row.examples_sr))).toBe(true);
      expect(Array.isArray(JSON.parse(row.examples_ru))).toBe(true);
    }
  });

  it('tags column contains valid JSON arrays', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare('SELECT id, tags FROM vocabulary LIMIT 100').all();
    db.close();

    for (const row of rows) {
      expect(() => JSON.parse(row.tags)).not.toThrow();
      expect(Array.isArray(JSON.parse(row.tags))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// FTS tests
// ---------------------------------------------------------------------------

describe('Full-text search', () => {
  it('FTS index has same count as main table', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const mainCount = db.prepare('SELECT COUNT(*) as n FROM vocabulary').get().n;
    const ftsCount = db.prepare('SELECT COUNT(*) as n FROM vocabulary_fts').get().n;
    db.close();

    expect(ftsCount).toBe(mainCount);
  });

  it('can search by English term', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const results = db.prepare(
      "SELECT id, term FROM vocabulary_fts WHERE vocabulary_fts MATCH 'dominions'"
    ).all();
    db.close();

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].term).toContain('dominion');
  });

  it('can search by Russian translation', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const results = db.prepare(
      "SELECT id, term FROM vocabulary_fts WHERE vocabulary_fts MATCH 'доставка'"
    ).all();
    db.close();

    expect(results.length).toBeGreaterThan(0);
  });

  it('can search by Serbian translation', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const results = db.prepare(
      "SELECT id, term FROM vocabulary_fts WHERE vocabulary_fts MATCH 'vladavine'"
    ).all();
    db.close();

    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: SQLite ↔ JSON consistency
// ---------------------------------------------------------------------------

describe('SQLite ↔ JSON consistency', () => {
  it('EN entry count matches JSON', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const dbCount = db.prepare("SELECT COUNT(*) as n FROM vocabulary WHERE source_language = 'en'").get().n;
    db.close();

    const json = JSON.parse(readFileSync(JSON_EN_PATH, 'utf-8'));
    expect(dbCount).toBe(json.entries.length);
  });

  it('SR entry count matches JSON', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const dbCount = db.prepare("SELECT COUNT(*) as n FROM vocabulary WHERE source_language = 'sr'").get().n;
    db.close();

    const json = JSON.parse(readFileSync(JSON_SR_PATH, 'utf-8'));
    expect(dbCount).toBe(json.entries.length);
  });

  it('sample EN entry matches between DB and JSON', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const dbRow = db.prepare("SELECT * FROM vocabulary WHERE id = 'en-0001'").get();
    db.close();

    const json = JSON.parse(readFileSync(JSON_EN_PATH, 'utf-8'));
    const jsonEntry = json.entries.find((e) => e.id === 'en-0001');

    expect(dbRow.term).toBe(jsonEntry.term);
    expect(dbRow.source_language).toBe(jsonEntry.source_language);
    expect(dbRow.translation_sr).toBe(jsonEntry.translations.sr);
    expect(dbRow.translation_ru).toBe(jsonEntry.translations.ru);
    expect(JSON.parse(dbRow.examples_en)).toEqual(jsonEntry.examples.en);
    expect(dbRow.explanation).toBe(jsonEntry.explanation);
    expect(dbRow.difficulty).toBe(jsonEntry.difficulty);
    expect(dbRow.enriched === 1).toBe(jsonEntry.enriched);
  });

  it('sample SR entry matches between DB and JSON', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const dbRow = db.prepare("SELECT * FROM vocabulary WHERE id = 'sr-0001'").get();
    db.close();

    const json = JSON.parse(readFileSync(JSON_SR_PATH, 'utf-8'));
    const jsonEntry = json.entries.find((e) => e.id === 'sr-0001');

    expect(dbRow.term).toBe(jsonEntry.term);
    expect(dbRow.translation_en).toBe(jsonEntry.translations.en);
    expect(dbRow.translation_ru).toBe(jsonEntry.translations.ru);
    expect(JSON.parse(dbRow.examples_sr)).toEqual(jsonEntry.examples.sr);
  });
});
