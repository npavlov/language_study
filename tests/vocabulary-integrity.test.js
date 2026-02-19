/**
 * Vocabulary data integrity tests.
 *
 * Detects cross-language contamination and data quality issues:
 * - Serbian/Russian words accidentally in the English vocabulary
 * - English words accidentally in the Serbian vocabulary
 * - Entries with garbage or overly long terms
 * - Missing required translations for game playability
 * - Duplicate IDs or terms
 */

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

// ---------------------------------------------------------------------------
// Character detection helpers
// ---------------------------------------------------------------------------

/** Cyrillic block (Russian + Serbian Cyrillic) */
const CYRILLIC_RE = /[а-яА-ЯёЁђЂљЉњЊћЋџЏ]/;

/** Serbian-specific Latin diacritics */
const SERBIAN_DIACRITICS_RE = /[čćžšđČĆŽŠĐ]/;

/** Maximum reasonable term length (words/short phrases) */
const MAX_TERM_LENGTH = 80;

// ---------------------------------------------------------------------------
// English vocabulary integrity
// ---------------------------------------------------------------------------

describe('English vocabulary integrity', () => {
  const entries = loadEntries('en');

  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('all entries have source_language = "en"', () => {
    const wrong = entries.filter((e) => e.source_language !== 'en');
    expect(wrong).toEqual([]);
  });

  it('all entries have non-empty terms', () => {
    const empty = entries.filter((e) => !e.term || e.term.trim().length === 0);
    expect(empty).toEqual([]);
  });

  it('no English terms contain Cyrillic characters (cross-language contamination)', () => {
    const contaminated = entries.filter((e) => CYRILLIC_RE.test(e.term));
    if (contaminated.length > 0) {
      const examples = contaminated.slice(0, 10).map((e) => `  ${e.id}: "${e.term}"`);
      console.warn(
        `Found ${contaminated.length} English entries with Cyrillic in term:\n${examples.join('\n')}`
      );
    }
    expect(contaminated).toEqual([]);
  });

  it('no English terms are excessively long (likely sentences, not words)', () => {
    const tooLong = entries.filter((e) => e.term.length > MAX_TERM_LENGTH);
    if (tooLong.length > 0) {
      const examples = tooLong.slice(0, 5).map((e) => `  ${e.id}: "${e.term.slice(0, 80)}..."`);
      console.warn(
        `Found ${tooLong.length} entries with term > ${MAX_TERM_LENGTH} chars:\n${examples.join('\n')}`
      );
    }
    expect(tooLong).toEqual([]);
  });

  it('no duplicate IDs', () => {
    const ids = entries.map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('no duplicate terms (case-insensitive)', () => {
    const seen = new Map();
    const dupes = [];
    for (const e of entries) {
      const key = e.term.toLowerCase().trim();
      if (seen.has(key)) {
        dupes.push({ id: e.id, term: e.term, firstId: seen.get(key) });
      } else {
        seen.set(key, e.id);
      }
    }
    if (dupes.length > 0) {
      const examples = dupes.slice(0, 10).map((d) => `  "${d.term}" (${d.id} vs ${d.firstId})`);
      console.warn(`Found ${dupes.length} duplicate terms:\n${examples.join('\n')}`);
    }
    expect(dupes).toEqual([]);
  });

  it('all entries have valid difficulty (1-5)', () => {
    const invalid = entries.filter((e) => e.difficulty < 1 || e.difficulty > 5);
    expect(invalid).toEqual([]);
  });

  it('all entries have a Serbian or Russian translation (playable)', () => {
    const unplayable = entries.filter((e) => !e.translations?.sr && !e.translations?.ru);
    if (unplayable.length > 0) {
      console.warn(
        `${unplayable.length} entries missing both SR and RU translations (unplayable)`
      );
    }
    expect(unplayable).toEqual([]);
  });

  it('no Serbian diacritics in English terms (likely Serbian word in EN vocab)', () => {
    const suspicious = entries.filter((e) => SERBIAN_DIACRITICS_RE.test(e.term));
    if (suspicious.length > 0) {
      const examples = suspicious.slice(0, 10).map((e) => `  ${e.id}: "${e.term}"`);
      console.warn(
        `Found ${suspicious.length} English entries with Serbian diacritics:\n${examples.join('\n')}`
      );
    }
    expect(suspicious).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Serbian vocabulary integrity
// ---------------------------------------------------------------------------

describe('Serbian vocabulary integrity', () => {
  const entries = loadEntries('sr');

  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('all entries have source_language = "sr"', () => {
    const wrong = entries.filter((e) => e.source_language !== 'sr');
    expect(wrong).toEqual([]);
  });

  it('all entries have non-empty terms', () => {
    const empty = entries.filter((e) => !e.term || e.term.trim().length === 0);
    expect(empty).toEqual([]);
  });

  it('no duplicate IDs', () => {
    const ids = entries.map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('no duplicate terms (case-insensitive)', () => {
    const seen = new Map();
    const dupes = [];
    for (const e of entries) {
      const key = e.term.toLowerCase().trim();
      if (seen.has(key)) {
        dupes.push({ id: e.id, term: e.term, firstId: seen.get(key) });
      } else {
        seen.set(key, e.id);
      }
    }
    if (dupes.length > 0) {
      const examples = dupes.slice(0, 10).map((d) => `  "${d.term}" (${d.id} vs ${d.firstId})`);
      console.warn(`Found ${dupes.length} duplicate terms:\n${examples.join('\n')}`);
    }
    expect(dupes).toEqual([]);
  });

  it('all entries have valid difficulty (1-5)', () => {
    const invalid = entries.filter((e) => e.difficulty < 1 || e.difficulty > 5);
    expect(invalid).toEqual([]);
  });

  it('all entries have an English or Russian translation (playable)', () => {
    const unplayable = entries.filter((e) => !e.translations?.en && !e.translations?.ru);
    if (unplayable.length > 0) {
      console.warn(
        `${unplayable.length} entries missing both EN and RU translations (unplayable)`
      );
    }
    expect(unplayable).toEqual([]);
  });

  it('no excessively long terms', () => {
    const tooLong = entries.filter((e) => e.term.length > MAX_TERM_LENGTH);
    expect(tooLong).toEqual([]);
  });

  it('Serbian terms do not look like Russian-only words (no ы, э, ё)', () => {
    const RUSSIAN_ONLY_RE = /[ыэёЫЭЁ]/;
    const russianOnly = entries.filter((e) => RUSSIAN_ONLY_RE.test(e.term));
    if (russianOnly.length > 0) {
      const examples = russianOnly.slice(0, 10).map((e) => `  ${e.id}: "${e.term}"`);
      console.warn(
        `Found ${russianOnly.length} Serbian entries with Russian-only chars:\n${examples.join('\n')}`
      );
    }
    expect(russianOnly).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cross-vocabulary checks
// ---------------------------------------------------------------------------

describe('Cross-vocabulary integrity', () => {
  const enEntries = loadEntries('en');
  const srEntries = loadEntries('sr');

  it('no ID collisions between English and Serbian vocabularies', () => {
    const enIds = new Set(enEntries.map((e) => e.id));
    const srIds = new Set(srEntries.map((e) => e.id));
    const collisions = [...enIds].filter((id) => srIds.has(id));
    expect(collisions).toEqual([]);
  });

  it('English IDs start with "en-"', () => {
    const wrong = enEntries.filter((e) => !e.id.startsWith('en-'));
    expect(wrong.map((e) => e.id)).toEqual([]);
  });

  it('Serbian IDs start with "sr-"', () => {
    const wrong = srEntries.filter((e) => !e.id.startsWith('sr-'));
    expect(wrong.map((e) => e.id)).toEqual([]);
  });

  it('no English term appears as a Serbian term (exact match)', () => {
    const enTerms = new Set(enEntries.map((e) => e.term.toLowerCase().trim()));
    const overlap = srEntries.filter((e) => enTerms.has(e.term.toLowerCase().trim()));

    if (overlap.length > 0) {
      const examples = overlap.slice(0, 10).map((e) => `  ${e.id}: "${e.term}"`);
      console.warn(
        `${overlap.length} Serbian terms also appear in English vocab:\n${examples.join('\n')}`
      );
    }
    const overlapPct = (overlap.length / srEntries.length) * 100;
    expect(overlapPct).toBeLessThan(5);
  });
});
