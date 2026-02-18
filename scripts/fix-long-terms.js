/**
 * Fix EN vocabulary entries with excessively long terms (>80 chars).
 * - If translations.en exists and is ≤80 chars → replace term
 * - Otherwise → delete entry (it's a sentence, not a vocab word)
 *
 * Run: node scripts/fix-long-terms.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vocabPath = join(__dirname, '..', 'public', 'data', 'vocabulary-en.json');

const MAX_TERM_LENGTH = 80;
const dryRun = process.argv.includes('--dry-run');

const raw = readFileSync(vocabPath, 'utf-8');
const data = JSON.parse(raw);
const originalCount = data.entries.length;

const fixed = [];
const deleted = [];

data.entries = data.entries.filter((entry) => {
  if (entry.term.length <= MAX_TERM_LENGTH) return true;

  const cleanEn = entry.translations && entry.translations.en;

  if (cleanEn && cleanEn.length <= MAX_TERM_LENGTH) {
    // Fixable: replace term with clean translations.en
    fixed.push({ id: entry.id, oldTerm: entry.term, newTerm: cleanEn });
    entry.term = cleanEn;
    return true;
  }

  // Not fixable: delete
  deleted.push({ id: entry.id, term: entry.term.slice(0, 80) + '...' });
  return false;
});

console.log('--- Summary ---');
console.log(`Original entries: ${originalCount}`);
console.log(`Fixed (term replaced): ${fixed.length}`);
console.log(`Deleted (sentences): ${deleted.length}`);
console.log(`Remaining entries: ${data.entries.length}`);

if (fixed.length > 0) {
  console.log('\nFixed:');
  for (const f of fixed) {
    console.log(`  ${f.id}: "${f.oldTerm.slice(0, 60)}..." → "${f.newTerm}"`);
  }
}

if (deleted.length > 0) {
  console.log('\nDeleted:');
  for (const d of deleted) {
    console.log(`  ${d.id}: "${d.term}"`);
  }
}

if (dryRun) {
  console.log('\n[DRY RUN] No changes written. Remove --dry-run to apply.');
} else {
  writeFileSync(vocabPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`\nWrote ${vocabPath}`);
}
