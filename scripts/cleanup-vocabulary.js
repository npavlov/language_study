#!/usr/bin/env node

/**
 * cleanup-vocabulary.js
 *
 * Cleans up vocabulary JSON files by:
 * 1. Removing self-referencing translations (en->en or sr->sr matching the term)
 * 2. Removing duplicate entries (same term + source_language, case-insensitive)
 * 3. Removing noise entries (too short, just numbers, special chars, whitespace/punctuation)
 * 4. Removing full paragraphs (term > 200 chars)
 * 5. Printing detailed stats
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '..');
const FILES = [
  { path: path.join(BASE_DIR, 'data', 'vocabulary-en.json'), lang: 'en' },
  { path: path.join(BASE_DIR, 'data', 'vocabulary-sr.json'), lang: 'sr' },
];

function isNoise(term) {
  // term length < 2
  if (term.trim().length < 2) return 'term_too_short';

  // term is just numbers
  if (/^\d+$/.test(term.trim())) return 'numbers_only';

  // term contains 3+ consecutive special characters (non-letter, non-digit, non-space)
  // Uses Unicode \p{L} and \p{N} to correctly handle Cyrillic and other scripts.
  // This catches ???, !!!, ***, etc. but NOT normal multi-script text.
  if (/[^\p{L}\p{N}\s]{3,}/u.test(term)) return 'consecutive_special_chars';

  // term is just whitespace
  if (/^\s*$/.test(term)) return 'whitespace_only';

  // term is just punctuation (no letters or digits at all)
  if (!/[\p{L}\d]/u.test(term)) return 'punctuation_only';

  return null;
}

function isParagraph(term) {
  return term.length > 200;
}

function processFile(filePath, sourceLang) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing: ${path.basename(filePath)} (source_language=${sourceLang})`);
  console.log('='.repeat(70));

  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const originalCount = data.entries.length;

  console.log(`\nOriginal entry count: ${originalCount}`);

  // --- Stats tracking ---
  const stats = {
    selfRefNulled: 0,
    duplicatesRemoved: 0,
    noiseRemoved: {},
    paragraphsRemoved: 0,
  };
  const removedEntries = {
    duplicates: [],
    noise: [],
    paragraphs: [],
  };

  // ---------------------------------------------------------------
  // Step 1: Remove self-referencing translations
  // ---------------------------------------------------------------
  for (const entry of data.entries) {
    if (
      entry.source_language === 'en' &&
      entry.translations &&
      entry.translations.en &&
      entry.translations.en.toLowerCase() === entry.term.toLowerCase()
    ) {
      entry.translations.en = null;
      stats.selfRefNulled++;
    }
    if (
      entry.source_language === 'sr' &&
      entry.translations &&
      entry.translations.sr &&
      entry.translations.sr.toLowerCase() === entry.term.toLowerCase()
    ) {
      entry.translations.sr = null;
      stats.selfRefNulled++;
    }
  }

  console.log(`\n[Step 1] Self-referencing translations nulled: ${stats.selfRefNulled}`);

  // ---------------------------------------------------------------
  // Step 2: Remove duplicates (same term + source_language, case-insensitive)
  //         Prefer enriched entries (enriched=true) over non-enriched.
  //         Among equals, keep the first occurrence.
  // ---------------------------------------------------------------
  const seen = new Map(); // key -> index in entries
  const duplicateIndices = new Set();

  for (let i = 0; i < data.entries.length; i++) {
    const entry = data.entries[i];
    const key = `${entry.term.toLowerCase()}::${entry.source_language}`;

    if (seen.has(key)) {
      const existingIdx = seen.get(key);
      const existing = data.entries[existingIdx];

      // If the existing is enriched, keep it and discard current
      if (existing.enriched && !entry.enriched) {
        duplicateIndices.add(i);
        removedEntries.duplicates.push(entry.term);
      }
      // If current is enriched but existing is not, keep current
      else if (!existing.enriched && entry.enriched) {
        duplicateIndices.add(existingIdx);
        removedEntries.duplicates.push(existing.term);
        seen.set(key, i);
      }
      // Both same enrichment status, keep the first (existing)
      else {
        duplicateIndices.add(i);
        removedEntries.duplicates.push(entry.term);
      }
    } else {
      seen.set(key, i);
    }
  }

  stats.duplicatesRemoved = duplicateIndices.size;

  // Remove duplicates (filter by index)
  data.entries = data.entries.filter((_, i) => !duplicateIndices.has(i));

  console.log(`[Step 2] Duplicates removed: ${stats.duplicatesRemoved}`);
  if (removedEntries.duplicates.length > 0) {
    console.log(`         Duplicate terms: ${removedEntries.duplicates.map(t => `"${t}"`).join(', ')}`);
  }

  // ---------------------------------------------------------------
  // Step 3: Remove noise entries
  // ---------------------------------------------------------------
  const preNoiseCount = data.entries.length;
  const noiseFiltered = [];

  for (const entry of data.entries) {
    const noiseReason = isNoise(entry.term);
    if (noiseReason) {
      stats.noiseRemoved[noiseReason] = (stats.noiseRemoved[noiseReason] || 0) + 1;
      removedEntries.noise.push({ term: entry.term, reason: noiseReason });
    } else {
      noiseFiltered.push(entry);
    }
  }

  data.entries = noiseFiltered;
  const totalNoiseRemoved = preNoiseCount - data.entries.length;

  console.log(`[Step 3] Noise entries removed: ${totalNoiseRemoved}`);
  if (totalNoiseRemoved > 0) {
    for (const [reason, count] of Object.entries(stats.noiseRemoved)) {
      console.log(`         - ${reason}: ${count}`);
    }
    console.log(`         Noise terms removed:`);
    for (const { term, reason } of removedEntries.noise) {
      const display = term.length > 80 ? term.substring(0, 77) + '...' : term;
      console.log(`           [${reason}] "${display}"`);
    }
  }

  // ---------------------------------------------------------------
  // Step 4: Remove full paragraphs (term > 200 chars)
  // ---------------------------------------------------------------
  const preParagraphCount = data.entries.length;

  data.entries = data.entries.filter((entry) => {
    if (isParagraph(entry.term)) {
      stats.paragraphsRemoved++;
      removedEntries.paragraphs.push(entry.term);
      return false;
    }
    return true;
  });

  console.log(`[Step 4] Paragraph entries removed (>200 chars): ${stats.paragraphsRemoved}`);
  if (removedEntries.paragraphs.length > 0) {
    for (const term of removedEntries.paragraphs) {
      const display = term.length > 100 ? term.substring(0, 97) + '...' : term;
      console.log(`         "${display}"`);
    }
  }

  // ---------------------------------------------------------------
  // Step 5: Write back and summarize
  // ---------------------------------------------------------------
  const finalCount = data.entries.length;
  const totalRemoved = originalCount - finalCount;

  const output = {
    schema_version: data.schema_version || '1.0',
    entries: data.entries,
  };

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  console.log(`\n--- Summary for ${path.basename(filePath)} ---`);
  console.log(`  Before:                ${originalCount} entries`);
  console.log(`  Self-ref nulled:       ${stats.selfRefNulled} translations`);
  console.log(`  Duplicates removed:    ${stats.duplicatesRemoved}`);
  console.log(`  Noise removed:         ${totalNoiseRemoved}`);
  console.log(`  Paragraphs removed:    ${stats.paragraphsRemoved}`);
  console.log(`  After:                 ${finalCount} entries`);
  console.log(`  Total entries removed: ${totalRemoved}`);

  return {
    file: path.basename(filePath),
    originalCount,
    finalCount,
    selfRefNulled: stats.selfRefNulled,
    duplicatesRemoved: stats.duplicatesRemoved,
    noiseRemoved: totalNoiseRemoved,
    paragraphsRemoved: stats.paragraphsRemoved,
    totalRemoved,
  };
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
console.log('Vocabulary Cleanup Script');
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Base directory: ${BASE_DIR}`);

const results = [];

for (const file of FILES) {
  if (!fs.existsSync(file.path)) {
    console.error(`\nFile not found: ${file.path} -- skipping.`);
    continue;
  }
  results.push(processFile(file.path, file.lang));
}

// Grand summary
console.log(`\n${'='.repeat(70)}`);
console.log('GRAND SUMMARY');
console.log('='.repeat(70));

let grandOriginal = 0;
let grandFinal = 0;
let grandSelfRef = 0;
let grandDups = 0;
let grandNoise = 0;
let grandParagraphs = 0;

for (const r of results) {
  grandOriginal += r.originalCount;
  grandFinal += r.finalCount;
  grandSelfRef += r.selfRefNulled;
  grandDups += r.duplicatesRemoved;
  grandNoise += r.noiseRemoved;
  grandParagraphs += r.paragraphsRemoved;
}

console.log(`  Total entries before:        ${grandOriginal}`);
console.log(`  Total self-ref nulled:       ${grandSelfRef} translations`);
console.log(`  Total duplicates removed:    ${grandDups} entries`);
console.log(`  Total noise removed:         ${grandNoise} entries`);
console.log(`  Total paragraphs removed:    ${grandParagraphs} entries`);
console.log(`  Total entries after:          ${grandFinal}`);
console.log(`  Total entries removed:        ${grandOriginal - grandFinal}`);
console.log(`\nDone. Files updated in-place.`);
