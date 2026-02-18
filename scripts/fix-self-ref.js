/**
 * Fix EN entries where translations.en === term (self-referencing).
 * Per data format, translations for the source language should be null.
 *
 * Also nullifies translations.en that differ from term but are still
 * redundant English-to-English "translations" (enrichment artifacts).
 *
 * Run: node scripts/fix-self-ref.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vocabPath = join(__dirname, '..', 'public', 'data', 'vocabulary-en.json');
const dryRun = process.argv.includes('--dry-run');

const data = JSON.parse(readFileSync(vocabPath, 'utf-8'));

// Exact self-reference: translations.en === term
const selfRef = [];
// Non-null translations.en that differ from term (enrichment artifacts)
const otherEnNonNull = [];

for (const entry of data.entries) {
  if (entry.translations.en === null) continue;

  if (entry.translations.en === entry.term) {
    selfRef.push({ id: entry.id, term: entry.term });
    entry.translations.en = null;
  } else {
    otherEnNonNull.push({
      id: entry.id,
      term: entry.term,
      enTrans: entry.translations.en,
    });
  }
}

console.log('--- Self-referencing (translations.en === term) ---');
console.log(`Fixed: ${selfRef.length}`);
for (const e of selfRef) {
  console.log(`  ${e.id}: "${e.term}"`);
}

console.log(`\n--- translations.en non-null but differs from term ---`);
console.log(`Count: ${otherEnNonNull.length}`);
for (const e of otherEnNonNull.slice(0, 15)) {
  console.log(`  ${e.id}: term="${e.term}" → en="${e.enTrans}"`);
}
if (otherEnNonNull.length > 15) {
  console.log(`  ... and ${otherEnNonNull.length - 15} more`);
}

if (dryRun) {
  console.log('\n[DRY RUN] No changes written.');
} else {
  writeFileSync(vocabPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\nWrote ${vocabPath}`);
}
