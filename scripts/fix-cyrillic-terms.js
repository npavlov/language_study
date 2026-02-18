/**
 * Fix EN vocabulary entries that have Cyrillic text in the term field.
 * Strategy: replace term with translations.en (already clean).
 *
 * Run: node scripts/fix-cyrillic-terms.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vocabPath = join(__dirname, '..', 'public', 'data', 'vocabulary-en.json');

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const dryRun = process.argv.includes('--dry-run');

const raw = readFileSync(vocabPath, 'utf-8');
const data = JSON.parse(raw);

let fixed = 0;
const changes = [];

for (const entry of data.entries) {
  if (!CYRILLIC_RE.test(entry.term)) continue;

  const cleanEn = entry.translations && entry.translations.en;
  if (!cleanEn) {
    console.log(`SKIP ${entry.id}: no translations.en available`);
    console.log(`  term: "${entry.term}"`);
    continue;
  }

  if (CYRILLIC_RE.test(cleanEn)) {
    console.log(`SKIP ${entry.id}: translations.en also has Cyrillic`);
    console.log(`  term: "${entry.term}"`);
    console.log(`  en:   "${cleanEn}"`);
    continue;
  }

  changes.push({
    id: entry.id,
    oldTerm: entry.term,
    newTerm: cleanEn,
  });

  entry.term = cleanEn;
  fixed++;
}

console.log(`\n--- Summary ---`);
console.log(`Total contaminated: ${changes.length}`);
console.log(`Fixed: ${fixed}`);

if (dryRun) {
  console.log('\n[DRY RUN] Changes not written. Remove --dry-run to apply.');
  for (const c of changes) {
    console.log(`  ${c.id}: "${c.oldTerm}" → "${c.newTerm}"`);
  }
} else {
  writeFileSync(vocabPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\nWrote ${vocabPath}`);
  for (const c of changes) {
    console.log(`  ${c.id}: "${c.oldTerm}" → "${c.newTerm}"`);
  }
}
