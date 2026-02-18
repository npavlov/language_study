#!/usr/bin/env node

/**
 * parse-words.js — Parse english_words.txt and serbian_words.txt
 * into structured vocabulary JSON conforming to schema v1.0.
 *
 * Usage:
 *   node scripts/parse-words.js
 *   node scripts/parse-words.js --english path/to/en.txt --serbian path/to/sr.txt --output public/data/
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const englishPath = getArg('--english', join(projectRoot, 'english_words.txt'));
const serbianPath = getArg('--serbian', join(projectRoot, 'serbian_words.txt'));
const outputDir = getArg('--output', join(projectRoot, 'public', 'data'));

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
  // IPA or phonetic: contains IPA characters, or is short and looks phonetic
  if (PRONUNCIATION_HINT_RE.test(bracketContent)) return true;
  // Short romanized phonetics like "асайлэм", "баааринг" (Cyrillic phonetic hints)
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
  // Only punctuation, question marks, emojis, or whitespace
  if (/^[\s\p{P}\p{S}?!…]+$/u.test(trimmed) && trimmed.length < 10) return true;
  // Lines dominated by question marks or noise characters (e.g. "????", "—???")
  if (/\?{3,}/.test(trimmed) && trimmed.length < 40) return true;
  // Tab-only or bullet-only lines
  if (/^[\t•\s]+$/.test(trimmed)) return true;
  return false;
}

function splitSeparator(line) {
  // Try " - " separator first (most common)
  const dashIdx = line.indexOf(' - ');
  if (dashIdx > 0) {
    return {
      left: line.substring(0, dashIdx).trim(),
      right: line.substring(dashIdx + 3).trim(),
      separator: ' - ',
    };
  }
  // Try " = " separator
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
  // Annotation bracket — leave in text but don't extract as pronunciation
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
  // Don't add duplicate examples
  if (!entry.examples[lang].includes(sentence)) {
    entry.examples[lang].push(sentence);
  }
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------
function parseFile(filePath, sourceLang, existingEntries) {
  const sourceFile = basename(filePath);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Map: canonical term → entry
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

    // Try to split on separator
    const split = splitSeparator(line);

    if (split) {
      // Pattern: left - right or left = right
      const { clean: leftClean, pronunciation: leftPron } = extractPronunciation(split.left);
      const leftLang = detectTranslationLanguage(leftClean);
      const rightLang = detectTranslationLanguage(split.right);

      let term, termLang, transText, transLang;

      if (sourceLang === 'en' && leftLang === 'en') {
        // Normal: English term - translation
        term = leftClean;
        termLang = 'en';
        transText = split.right;
        transLang = rightLang;
      } else if (sourceLang === 'en' && leftLang === 'ru') {
        // Reversed: Cyrillic term - English translation
        term = split.right;
        termLang = 'en';
        transText = leftClean;
        transLang = 'ru';
      } else if (sourceLang === 'sr') {
        // Serbian file: left is SR, right is translation
        if (hasSerbianDiacritics(leftClean) || (!hasCyrillic(leftClean) && leftLang !== 'ru')) {
          term = leftClean;
          termLang = 'sr';
          transText = split.right;
          transLang = rightLang;
        } else {
          // Reversed or Cyrillic Serbian
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
        // If the line looks like a full sentence, add as example too
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
      // No separator — bare word/phrase or full sentence
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
        // Long lines might be example sentences
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
// Load existing data (for idempotent merging)
// ---------------------------------------------------------------------------
function loadExisting(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return data.entries || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('=== Language Study Word Parser ===\n');

  // Parse English words
  const enOutputPath = join(outputDir, 'vocabulary-en.json');
  const existingEn = loadExisting(enOutputPath);
  console.log(`Parsing: ${englishPath}`);
  const enResult = parseFile(englishPath, 'en', existingEn);

  writeFileSync(
    enOutputPath,
    JSON.stringify({ schema_version: '1.0', entries: enResult.entries }, null, 2),
    'utf-8'
  );
  console.log(`  Lines read:     ${enResult.stats.linesRead}`);
  console.log(`  Entries created: ${enResult.stats.created}`);
  console.log(`  Entries merged:  ${enResult.stats.merged}`);
  console.log(`  Lines skipped:   ${enResult.stats.skipped}`);
  console.log(`  Total entries:   ${enResult.entries.length}`);
  console.log(`  Output: ${enOutputPath}\n`);

  // Parse Serbian words
  const srOutputPath = join(outputDir, 'vocabulary-sr.json');
  const existingSr = loadExisting(srOutputPath);
  console.log(`Parsing: ${serbianPath}`);
  const srResult = parseFile(serbianPath, 'sr', existingSr);

  writeFileSync(
    srOutputPath,
    JSON.stringify({ schema_version: '1.0', entries: srResult.entries }, null, 2),
    'utf-8'
  );
  console.log(`  Lines read:     ${srResult.stats.linesRead}`);
  console.log(`  Entries created: ${srResult.stats.created}`);
  console.log(`  Entries merged:  ${srResult.stats.merged}`);
  console.log(`  Lines skipped:   ${srResult.stats.skipped}`);
  console.log(`  Total entries:   ${srResult.entries.length}`);
  console.log(`  Output: ${srOutputPath}\n`);

  const totalEntries = enResult.entries.length + srResult.entries.length;
  console.log(`=== Done! Total vocabulary: ${totalEntries} entries ===`);
}

main();
