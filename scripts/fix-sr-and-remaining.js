/**
 * Comprehensive data cleanup for all remaining vocabulary integrity issues:
 *
 * SR vocabulary:
 *   1. Delete 21 entries with English terms that already exist in EN vocab
 *   2. Delete 5 sentence-length entries (>80 chars)
 *   3. Fix 2 entries with Russian text in term field (use translations.sr)
 *
 * EN vocabulary:
 *   4. Delete 2 entries with Serbian diacritics (misplaced Serbian words)
 *   5. Delete 4 duplicate terms (keep first occurrence)
 *
 * Run: node scripts/fix-sr-and-remaining.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const enPath = join(__dirname, '..', 'public', 'data', 'vocabulary-en.json');
const srPath = join(__dirname, '..', 'public', 'data', 'vocabulary-sr.json');

const dryRun = process.argv.includes('--dry-run');

const enData = JSON.parse(readFileSync(enPath, 'utf-8'));
const srData = JSON.parse(readFileSync(srPath, 'utf-8'));

const enOrigCount = enData.entries.length;
const srOrigCount = srData.entries.length;

const RUSSIAN_ONLY_RE = /[\u044B\u044D\u0451\u042B\u042D\u0401]/; // ы э ё Ы Э Ё
const SERBIAN_DIACRITICS_RE = /[\u010D\u0107\u017E\u0161\u0111\u010C\u0106\u017D\u0160\u0110]/;
const MAX_TERM_LENGTH = 80;

const log = { srDeleted: [], srFixed: [], enDeleted: [], enDupsDeleted: [] };

// -----------------------------------------------------------------------
// 1. SR: identify English overlap entries to delete
// -----------------------------------------------------------------------
const enTerms = new Set(enData.entries.map(e => e.term.toLowerCase().trim()));

// sr-0112 "stršljen" is a valid Serbian word — exclude it from deletion
const SR_KEEP_IDS = new Set(['sr-0112']);

const srOverlapIds = new Set();
for (const e of srData.entries) {
  if (SR_KEEP_IDS.has(e.id)) continue;
  if (enTerms.has(e.term.toLowerCase().trim())) {
    srOverlapIds.add(e.id);
    log.srDeleted.push({ id: e.id, reason: 'English overlap', term: e.term });
  }
}

// -----------------------------------------------------------------------
// 2. SR: identify sentence-length entries to delete
// -----------------------------------------------------------------------
const srLongIds = new Set();
for (const e of srData.entries) {
  if (srOverlapIds.has(e.id)) continue; // already flagged
  if (e.term.length > MAX_TERM_LENGTH) {
    srLongIds.add(e.id);
    log.srDeleted.push({ id: e.id, reason: 'sentence (>80 chars)', term: e.term.slice(0, 60) + '...' });
  }
}

// -----------------------------------------------------------------------
// 3. SR: fix entries with Russian-only chars in term
// -----------------------------------------------------------------------
for (const e of srData.entries) {
  if (srOverlapIds.has(e.id) || srLongIds.has(e.id)) continue;
  if (!RUSSIAN_ONLY_RE.test(e.term)) continue;

  const cleanSr = e.translations && e.translations.sr;
  if (cleanSr && !RUSSIAN_ONLY_RE.test(cleanSr)) {
    log.srFixed.push({ id: e.id, oldTerm: e.term, newTerm: cleanSr });
    e.term = cleanSr;
  } else {
    // No clean SR translation — try extracting Serbian part before Russian
    const parts = e.term.split(/[-–—]/).map(s => s.trim());
    const srPart = parts.find(p => !RUSSIAN_ONLY_RE.test(p) && p.length > 0);
    if (srPart) {
      log.srFixed.push({ id: e.id, oldTerm: e.term, newTerm: srPart });
      e.term = srPart;
    } else {
      log.srDeleted.push({ id: e.id, reason: 'Russian-only, unfixable', term: e.term });
      srLongIds.add(e.id); // reuse set for deletion
    }
  }
}

// Apply SR deletions
const srDeleteIds = new Set([...srOverlapIds, ...srLongIds]);
srData.entries = srData.entries.filter(e => !srDeleteIds.has(e.id));

// -----------------------------------------------------------------------
// 4. EN: delete entries with Serbian diacritics
// -----------------------------------------------------------------------
enData.entries = enData.entries.filter(e => {
  if (!SERBIAN_DIACRITICS_RE.test(e.term)) return true;
  log.enDeleted.push({ id: e.id, reason: 'Serbian diacritics', term: e.term });
  return false;
});

// -----------------------------------------------------------------------
// 5. EN: delete duplicate terms (keep first occurrence)
// -----------------------------------------------------------------------
const seenTerms = new Map();
enData.entries = enData.entries.filter(e => {
  const key = e.term.toLowerCase().trim();
  if (!seenTerms.has(key)) {
    seenTerms.set(key, e.id);
    return true;
  }
  log.enDupsDeleted.push({ id: e.id, term: e.term, keptId: seenTerms.get(key) });
  return false;
});

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------
console.log('=== SR Vocabulary ===');
console.log(`Original: ${srOrigCount} → Remaining: ${srData.entries.length}`);
console.log(`Deleted: ${log.srDeleted.length}`);
for (const d of log.srDeleted) {
  console.log(`  DEL ${d.id}: [${d.reason}] "${d.term}"`);
}
console.log(`Fixed: ${log.srFixed.length}`);
for (const f of log.srFixed) {
  console.log(`  FIX ${f.id}: "${f.oldTerm}" → "${f.newTerm}"`);
}

console.log('\n=== EN Vocabulary ===');
console.log(`Original: ${enOrigCount} → Remaining: ${enData.entries.length}`);
console.log(`Deleted (Serbian diacritics): ${log.enDeleted.length}`);
for (const d of log.enDeleted) {
  console.log(`  DEL ${d.id}: "${d.term}"`);
}
console.log(`Deleted (duplicates): ${log.enDupsDeleted.length}`);
for (const d of log.enDupsDeleted) {
  console.log(`  DEL ${d.id}: "${d.term}" (kept ${d.keptId})`);
}

if (dryRun) {
  console.log('\n[DRY RUN] No changes written.');
} else {
  writeFileSync(enPath, JSON.stringify(enData, null, 2) + '\n', 'utf-8');
  writeFileSync(srPath, JSON.stringify(srData, null, 2) + '\n', 'utf-8');
  console.log(`\nWrote ${enPath}`);
  console.log(`Wrote ${srPath}`);
}
