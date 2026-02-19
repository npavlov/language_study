import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'vocabulary.db');

/**
 * Convert a SQLite row to the JSON entry format.
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

function loadEntries(lang) {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare(
    'SELECT * FROM vocabulary WHERE source_language = ? ORDER BY id'
  ).all(lang);
  db.close();
  return rows.map(rowToEntry);
}

describe('parsed English vocabulary (SQLite)', () => {
  const entries = loadEntries('en');

  it('has more than 1000 entries', () => {
    expect(entries.length).toBeGreaterThan(1000);
  });

  it('all entries have required fields', () => {
    for (const entry of entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.term).toBeTruthy();
      expect(entry.source_language).toBe('en');
      expect(['word', 'phrase']).toContain(entry.type);
      expect(entry.translations).toBeDefined();
      expect(entry.difficulty).toBeGreaterThanOrEqual(1);
      expect(entry.difficulty).toBeLessThanOrEqual(5);
      expect(entry.metadata).toBeDefined();
    }
  });

  it('has no ???? noise entries', () => {
    const noise = entries.filter((e) => e.term.includes('????'));
    expect(noise.length).toBe(0);
  });

  it('does not self-reference term as own translation', () => {
    const selfRef = entries.filter((e) => e.translations.en === e.term);
    expect(selfRef.length).toBe(0);
  });

  it('extracts Russian translations from dash-separated lines', () => {
    const humble = entries.find((e) => e.term.toLowerCase() === 'humble');
    expect(humble).toBeDefined();
    expect(humble.translations.ru).toBe('скромный');
  });

  it('extracts pronunciation from bracket notation', () => {
    const withPron = entries.filter((e) => e.pronunciation !== null);
    expect(withPron.length).toBeGreaterThan(5);
  });

  it('classifies single words and phrases correctly', () => {
    const words = entries.filter((e) => e.type === 'word');
    const phrases = entries.filter((e) => e.type === 'phrase');
    expect(words.length).toBeGreaterThan(100);
    expect(phrases.length).toBeGreaterThan(100);
  });

  it('has unique ids', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parsed Serbian vocabulary (SQLite)', () => {
  const entries = loadEntries('sr');

  it('has more than 400 entries', () => {
    expect(entries.length).toBeGreaterThan(400);
  });

  it('all entries have source_language sr', () => {
    for (const entry of entries) {
      expect(entry.source_language).toBe('sr');
    }
  });

  it('has entries with English translations', () => {
    const withEn = entries.filter((e) => e.translations.en !== null);
    expect(withEn.length).toBeGreaterThan(10);
  });

  it('has unique ids', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
