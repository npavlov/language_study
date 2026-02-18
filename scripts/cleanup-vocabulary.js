#!/usr/bin/env node

/**
 * cleanup-vocabulary.js — Clean up vocabulary database.
 *
 * Operations (all run in a single transaction):
 * 1. Null out self-referencing translations (en→en or sr→sr matching term)
 * 2. Remove duplicate entries (same term + source_language, keep enriched)
 * 3. Remove noise entries (too short, numbers only, special chars)
 * 4. Remove paragraphs (term > 200 chars)
 *
 * Usage:
 *   node scripts/cleanup-vocabulary.js
 *   node scripts/cleanup-vocabulary.js --dry-run
 */

import { openDb } from './lib/db.js';

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Noise detection
// ---------------------------------------------------------------------------
function isNoise(term) {
  if (term.trim().length < 2) return 'term_too_short';
  if (/^\d+$/.test(term.trim())) return 'numbers_only';
  if (/[^\p{L}\p{N}\s]{3,}/u.test(term)) return 'consecutive_special_chars';
  if (/^\s*$/.test(term)) return 'whitespace_only';
  if (!/[\p{L}\d]/u.test(term)) return 'punctuation_only';
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('=== Vocabulary Cleanup ===');
  console.log(`Date: ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('[DRY RUN — no changes will be written]\n');

  const db = openDb();

  const originalCount = db.prepare('SELECT COUNT(*) as n FROM vocabulary').get().n;
  console.log(`\nTotal entries before: ${originalCount}`);

  const stats = {
    selfRefNulled: 0,
    duplicatesRemoved: 0,
    noiseRemoved: 0,
    noiseReasons: {},
    paragraphsRemoved: 0,
  };

  // ---------------------------------------------------------------
  // Step 1: Null out self-referencing translations
  // ---------------------------------------------------------------
  const selfRefEn = db.prepare(`
    SELECT COUNT(*) as n FROM vocabulary
    WHERE source_language = 'en'
      AND translation_en IS NOT NULL
      AND LOWER(translation_en) = LOWER(term)
  `).get().n;

  const selfRefSr = db.prepare(`
    SELECT COUNT(*) as n FROM vocabulary
    WHERE source_language = 'sr'
      AND translation_sr IS NOT NULL
      AND LOWER(translation_sr) = LOWER(term)
  `).get().n;

  stats.selfRefNulled = selfRefEn + selfRefSr;
  console.log(`\n[Step 1] Self-referencing translations: ${stats.selfRefNulled}`);

  // ---------------------------------------------------------------
  // Step 2: Find duplicates (same term + source_language)
  // ---------------------------------------------------------------
  const duplicates = db.prepare(`
    SELECT id, term, source_language, enriched,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(term), source_language
             ORDER BY enriched DESC, id ASC
           ) as rn
    FROM vocabulary
  `).all().filter((r) => r.rn > 1);

  stats.duplicatesRemoved = duplicates.length;
  console.log(`[Step 2] Duplicates to remove: ${stats.duplicatesRemoved}`);
  for (const d of duplicates.slice(0, 10)) {
    console.log(`         "${d.term}" (${d.id})`);
  }
  if (duplicates.length > 10) console.log(`         ... and ${duplicates.length - 10} more`);

  // ---------------------------------------------------------------
  // Step 3: Find noise entries
  // ---------------------------------------------------------------
  const allEntries = db.prepare('SELECT id, term FROM vocabulary').all();
  const noiseIds = [];

  for (const entry of allEntries) {
    const reason = isNoise(entry.term);
    if (reason) {
      noiseIds.push(entry.id);
      stats.noiseReasons[reason] = (stats.noiseReasons[reason] || 0) + 1;
    }
  }

  stats.noiseRemoved = noiseIds.length;
  console.log(`[Step 3] Noise entries: ${stats.noiseRemoved}`);
  for (const [reason, count] of Object.entries(stats.noiseReasons)) {
    console.log(`         - ${reason}: ${count}`);
  }

  // ---------------------------------------------------------------
  // Step 4: Find paragraphs (term > 200 chars)
  // ---------------------------------------------------------------
  const paragraphs = db.prepare(`
    SELECT id, SUBSTR(term, 1, 100) as preview FROM vocabulary
    WHERE LENGTH(term) > 200
  `).all();

  stats.paragraphsRemoved = paragraphs.length;
  console.log(`[Step 4] Paragraph entries (>200 chars): ${stats.paragraphsRemoved}`);
  for (const p of paragraphs) {
    console.log(`         "${p.preview}..."`);
  }

  // ---------------------------------------------------------------
  // Apply changes
  // ---------------------------------------------------------------
  const totalToRemove = stats.duplicatesRemoved + stats.noiseRemoved + stats.paragraphsRemoved;

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would null ${stats.selfRefNulled} self-refs, remove ${totalToRemove} entries.`);
    db.close();
    return;
  }

  const apply = db.transaction(() => {
    // Step 1: Null self-refs
    db.prepare(`
      UPDATE vocabulary SET translation_en = NULL
      WHERE source_language = 'en'
        AND translation_en IS NOT NULL
        AND LOWER(translation_en) = LOWER(term)
    `).run();

    db.prepare(`
      UPDATE vocabulary SET translation_sr = NULL
      WHERE source_language = 'sr'
        AND translation_sr IS NOT NULL
        AND LOWER(translation_sr) = LOWER(term)
    `).run();

    // Step 2: Remove duplicates
    if (duplicates.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM vocabulary WHERE id = ?');
      for (const d of duplicates) {
        deleteStmt.run(d.id);
      }
    }

    // Step 3: Remove noise
    if (noiseIds.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM vocabulary WHERE id = ?');
      for (const id of noiseIds) {
        deleteStmt.run(id);
      }
    }

    // Step 4: Remove paragraphs
    db.prepare('DELETE FROM vocabulary WHERE LENGTH(term) > 200').run();
  });

  apply();

  const finalCount = db.prepare('SELECT COUNT(*) as n FROM vocabulary').get().n;
  db.close();

  console.log(`\n--- Summary ---`);
  console.log(`  Before:             ${originalCount} entries`);
  console.log(`  Self-ref nulled:    ${stats.selfRefNulled} translations`);
  console.log(`  Duplicates removed: ${stats.duplicatesRemoved}`);
  console.log(`  Noise removed:      ${stats.noiseRemoved}`);
  console.log(`  Paragraphs removed: ${stats.paragraphsRemoved}`);
  console.log(`  After:              ${finalCount} entries`);
  console.log(`  Total removed:      ${originalCount - finalCount}`);
}

main();
