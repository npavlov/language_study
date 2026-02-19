#!/usr/bin/env node

/**
 * apply-translation-fixes.js — Apply fixes from translation verification report.
 *
 * Reads data/translation-issues.json and applies suggested corrections:
 * - wrong/inaccurate/typo/mixed_language/wrong_script → UPDATE the field
 * - not_vocabulary → DELETE the entry
 *
 * Usage:
 *   node scripts/apply-translation-fixes.js              # apply all fixes
 *   node scripts/apply-translation-fixes.js --dry-run    # preview without changing DB
 *   node scripts/apply-translation-fixes.js --skip-delete # don't delete, only update
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { openDb, ROOT } from './lib/db.js';

const REPORT_PATH = join(ROOT, 'data', 'translation-issues.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_DELETE = args.includes('--skip-delete');

// Fields that can be updated via the report
const UPDATABLE_FIELDS = new Set([
  'translation_en', 'translation_sr', 'translation_ru',
  'term', 'explanation',
]);

function main() {
  console.log('=== Apply Translation Fixes ===');
  if (DRY_RUN) console.log('[DRY RUN — no changes will be written]\n');

  if (!existsSync(REPORT_PATH)) {
    console.error(`Report not found: ${REPORT_PATH}`);
    console.error('Run "npm run verify" first.');
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  const issues = report.issues || [];

  console.log(`Total issues in report: ${issues.length}`);
  console.log(`Report generated: ${report.generated_at}\n`);

  if (issues.length === 0) {
    console.log('No issues to fix.');
    return;
  }

  // Classify issues
  const updates = [];
  const deletes = [];
  const skipped = [];

  for (const issue of issues) {
    if (!issue.id) {
      skipped.push({ ...issue, skip_reason: 'missing id' });
      continue;
    }

    if (issue.issue === 'not_vocabulary') {
      if (SKIP_DELETE) {
        skipped.push({ ...issue, skip_reason: '--skip-delete' });
      } else {
        deletes.push(issue);
      }
      continue;
    }

    // For updates, need a valid field and suggested value
    if (!UPDATABLE_FIELDS.has(issue.field)) {
      skipped.push({ ...issue, skip_reason: `unknown field: ${issue.field}` });
      continue;
    }

    if (issue.suggested === undefined || issue.suggested === null) {
      skipped.push({ ...issue, skip_reason: 'no suggested fix' });
      continue;
    }

    updates.push(issue);
  }

  console.log(`Updates to apply: ${updates.length}`);
  console.log(`Entries to delete: ${deletes.length}`);
  console.log(`Skipped: ${skipped.length}\n`);

  // Preview
  if (updates.length > 0) {
    console.log('--- Updates ---');
    for (const u of updates) {
      const cur = u.current ? `"${u.current}"` : 'NULL';
      const sug = `"${u.suggested}"`;
      console.log(`  ${u.id} .${u.field}: ${cur} → ${sug}`);
      console.log(`    [${u.issue}] ${u.reason}`);
    }
    console.log();
  }

  if (deletes.length > 0) {
    console.log('--- Deletes ---');
    for (const d of deletes) {
      console.log(`  ${d.id}: "${d.current || '?'}" — ${d.reason}`);
    }
    console.log();
  }

  if (skipped.length > 0) {
    console.log('--- Skipped ---');
    for (const s of skipped) {
      console.log(`  ${s.id || '?'}: ${s.skip_reason}`);
    }
    console.log();
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] No changes applied.');
    return;
  }

  // Apply changes
  const db = openDb();

  const stats = { updated: 0, deleted: 0, notFound: 0 };

  const applyAll = db.transaction(() => {
    // Updates
    for (const u of updates) {
      const exists = db.prepare('SELECT id FROM vocabulary WHERE id = ?').get(u.id);
      if (!exists) {
        stats.notFound++;
        continue;
      }

      db.prepare(`UPDATE vocabulary SET ${u.field} = ? WHERE id = ?`).run(u.suggested, u.id);
      stats.updated++;
    }

    // Deletes
    for (const d of deletes) {
      const exists = db.prepare('SELECT id FROM vocabulary WHERE id = ?').get(d.id);
      if (!exists) {
        stats.notFound++;
        continue;
      }

      db.prepare('DELETE FROM vocabulary WHERE id = ?').run(d.id);
      stats.deleted++;
    }
  });

  applyAll();
  db.close();

  console.log('=== Results ===');
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Deleted: ${stats.deleted}`);
  console.log(`  Not found: ${stats.notFound}`);
  console.log('\nRun "npm run vocab -- export" to copy DB assets, then "npm test" to verify.');
}

main();
