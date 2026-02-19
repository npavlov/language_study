#!/usr/bin/env node

/**
 * parse-words.js — Parse english_words.txt and serbian_words.txt
 * into structured vocabulary and insert into SQLite.
 *
 * Usage:
 *   node scripts/parse-words.js
 *   node scripts/parse-words.js --english path/to/en.txt --serbian path/to/sr.txt
 *   node scripts/parse-words.js --json    # also write JSON files (legacy)
 */

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { openDb, jsonEntryToRow, UPSERT_SQL, ROOT } from './lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const englishPath = getArg('--english', join(ROOT, 'english_words.txt'));
const serbianPath = getArg('--serbian', join(ROOT, 'serbian_words.txt'));
const writeJson = args.includes('--json');

// ---------------------------------------------------------------------------
// Character detection helpers
// ---------------------------------------------------------------------------
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const SERBIAN_DIACRITICS_RE = /[čćšžđČĆŠŽĐ]/;
const IPA_BRACKET_RE = /\[([^\]]+)\]/;
const PRONUNCIATION_HINT_RE = /[\u0250-\u02AF\u1D00-\u1D7Fˈˌːɪɛæɑɒʊʌəɜɔʃʒθðŋ]/;

function hasCyrillic(text) {
  return CYRILLIC_RE.test(text);
}

function hasSerbianDiacritics(text) {
  return SERBIAN_DIACRITICS_RE.test(text);
}

function isPronunciation(bracketContent) {
  if (PRONUNCIATION_HINT_RE.test(bracketContent)) return true;
  if (bracketContent.length <= 20 && hasCyrillic(bracketContent)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Line classification & parsing
// ---------------------------------------------------------------------------
const HEADER_LINES = new Set(['engleski reci', 'srpski reci']);

function isSkipLine(line) {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  if (HEADER_LINES.has(trimmed.toLowerCase())) return true;
  if (/^https?:\/\//.test(trimmed)) return true;
  if (/^[\s\p{P}\p{S}?!…]+$/u.test(trimmed) && trimmed.length < 10) return true;
  if (/\?{3,}/.test(trimmed) && trimmed.length < 40) return true;
  if (/^[\t•\s]+$/.test(trimmed)) return true;
  return false;
}

function splitSeparator(line) {
  const dashIdx = line.indexOf(' - ');
  if (dashIdx > 0) {
    return {
      left: line.substring(0, dashIdx).trim(),
      right: line.substring(dashIdx + 3).trim(),
      separator: ' - ',
    };
  }
  const eqIdx = line.indexOf(' = ');
  if (eqIdx > 0) {
    return {
      left: line.substring(0, eqIdx).trim(),
      right: line.substring(eqIdx + 3).trim(),
      separator: ' = ',
    };
  }
  return null;
}

function extractPronunciation(text) {
  const match = text.match(IPA_BRACKET_RE);
  if (!match) return { clean: text, pronunciation: null };
  const bracketContent = match[1];
  if (isPronunciation(bracketContent)) {
    return {
      clean: text.replace(match[0], '').trim(),
      pronunciation: bracketContent,
    };
  }
  return { clean: text, pronunciation: null };
}

function detectTranslationLanguage(text) {
  if (hasCyrillic(text)) return 'ru';
  if (hasSerbianDiacritics(text)) return 'sr';
  return 'en';
}

function isPhrase(term) {
  return term.includes(' ');
}

function canonicalize(term) {
  return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Entry creation & merging
// ---------------------------------------------------------------------------
function createEntry(id, term, sourceLang, sourceFile) {
  return {
    id,
    term,
    source_language: sourceLang,
    type: isPhrase(term) ? 'phrase' : 'word',
    translations: { en: null, sr: null, ru: null },
    examples: { en: [], sr: [], ru: [] },
    explanation: null,
    pronunciation: null,
    category: null,
    tags: [],
    difficulty: 3,
    enriched: false,
    metadata: {
      date_added: new Date().toISOString().split('T')[0],
      source_file: sourceFile,
      reviewed: false,
    },
  };
}

function mergeTranslation(entry, lang, value) {
  if (!value) return;
  if (entry.translations[lang] === null) {
    entry.translations[lang] = value;
  }
}

function addExample(entry, lang, sentence) {
  if (!sentence || sentence.length < 5) return;
  if (!entry.examples[lang].includes(sentence)) {
    entry.examples[lang].push(sentence);
  }
}

// ---------------------------------------------------------------------------
// Main parser (unchanged logic)
// ---------------------------------------------------------------------------
function parseFile(filePath, sourceLang, existingEntries) {
  const sourceFile = basename(filePath);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const entries = new Map(existingEntries.map((e) => [canonicalize(e.term), e]));
  let nextId = existingEntries.length;

  const stats = { linesRead: 0, created: 0, merged: 0, skipped: 0 };

  for (const rawLine of lines) {
    stats.linesRead++;
    const line = rawLine.trim();

    if (isSkipLine(rawLine)) {
      stats.skipped++;
      continue;
    }

    const split = splitSeparator(line);

    if (split) {
      const { clean: leftClean, pronunciation: leftPron } = extractPronunciation(split.left);
      const leftLang = detectTranslationLanguage(leftClean);
      const rightLang = detectTranslationLanguage(split.right);

      let term, termLang, transText, transLang;

      if (sourceLang === 'en' && leftLang === 'en') {
        term = leftClean;
        termLang = 'en';
        transText = split.right;
        transLang = rightLang;
      } else if (sourceLang === 'en' && leftLang === 'ru') {
        term = split.right;
        termLang = 'en';
        transText = leftClean;
        transLang = 'ru';
      } else if (sourceLang === 'sr') {
        if (hasSerbianDiacritics(leftClean) || (!hasCyrillic(leftClean) && leftLang !== 'ru')) {
          term = leftClean;
          termLang = 'sr';
          transText = split.right;
          transLang = rightLang;
        } else {
          term = leftClean;
          termLang = 'sr';
          transText = split.right;
          transLang = rightLang;
        }
      } else {
        term = leftClean;
        termLang = sourceLang;
        transText = split.right;
        transLang = rightLang;
      }

      const key = canonicalize(term);
      if (entries.has(key)) {
        const existing = entries.get(key);
        mergeTranslation(existing, transLang, transText);
        if (leftPron) existing.pronunciation = { ...existing.pronunciation, [termLang]: leftPron };
        if (term.length > 40) {
          addExample(existing, termLang, term);
        }
        stats.merged++;
      } else {
        nextId++;
        const id = `${sourceLang}-${String(nextId).padStart(4, '0')}`;
        const entry = createEntry(id, term, sourceLang, sourceFile);
        mergeTranslation(entry, transLang, transText);
        if (leftPron) entry.pronunciation = { [termLang]: leftPron };
        entries.set(key, entry);
        stats.created++;
      }
    } else {
      const { clean, pronunciation: pron } = extractPronunciation(line);
      const cleanTerm = clean.replace(/\s+/g, ' ').trim();

      if (cleanTerm.length < 2) {
        stats.skipped++;
        continue;
      }

      const key = canonicalize(cleanTerm);
      if (entries.has(key)) {
        const existing = entries.get(key);
        if (pron) existing.pronunciation = { ...existing.pronunciation, [sourceLang]: pron };
        if (cleanTerm.length > 50) {
          addExample(existing, sourceLang, cleanTerm);
        }
        stats.merged++;
      } else {
        nextId++;
        const id = `${sourceLang}-${String(nextId).padStart(4, '0')}`;
        const entry = createEntry(id, cleanTerm, sourceLang, sourceFile);
        if (pron) entry.pronunciation = { [sourceLang]: pron };
        entries.set(key, entry);
        stats.created++;
      }
    }
  }

  return { entries: [...entries.values()], stats };
}

// ---------------------------------------------------------------------------
// Load existing entries from SQLite
// ---------------------------------------------------------------------------
function loadExisting(db, sourceLang) {
  const rows = db.prepare(
    'SELECT * FROM vocabulary WHERE source_language = ? ORDER BY id'
  ).all(sourceLang);

  // Convert to JSON entry format for the parser's merge logic
  return rows.map((row) => ({
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
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('=== Language Study Word Parser ===\n');

  const db = openDb();
  const insertStmt = db.prepare(UPSERT_SQL);

  const filesToParse = [
    { path: englishPath, lang: 'en' },
    { path: serbianPath, lang: 'sr' },
  ];

  let totalEntries = 0;

  for (const { path: filePath, lang } of filesToParse) {
    if (!existsSync(filePath)) {
      console.log(`File not found: ${filePath} — skipping.\n`);
      continue;
    }

    const existing = loadExisting(db, lang);
    console.log(`Parsing: ${filePath}`);
    const result = parseFile(filePath, lang, existing);

    // Insert all entries into SQLite
    const upsertAll = db.transaction((entries) => {
      let count = 0;
      for (const entry of entries) {
        insertStmt.run(jsonEntryToRow(entry));
        count++;
      }
      return count;
    });

    const inserted = upsertAll(result.entries);

    console.log(`  Lines read:     ${result.stats.linesRead}`);
    console.log(`  Entries created: ${result.stats.created}`);
    console.log(`  Entries merged:  ${result.stats.merged}`);
    console.log(`  Lines skipped:   ${result.stats.skipped}`);
    console.log(`  Total entries:   ${result.entries.length}`);
    console.log(`  Written to DB:   ${inserted}\n`);
    totalEntries += result.entries.length;
  }

  db.close();

  // Optionally copy DB assets to public/
  if (writeJson) {
    console.log('Copying DB assets to public/data/...');
    execFileSync('node', ['scripts/copy-db-assets.js'], { cwd: ROOT, stdio: 'inherit' });
  }

  console.log(`=== Done! Total vocabulary: ${totalEntries} entries ===`);
}

main();
