#!/usr/bin/env node

/**
 * verify-translations.js — AI-powered translation quality review.
 *
 * Sends all vocabulary entries to Claude API in batches for review.
 * Flags: wrong translations, wrong language/script, mixed languages,
 * typos, entries that aren't real vocabulary (garbage, full sentences).
 *
 * Output: data/translation-issues.json
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/verify-translations.js
 *   node scripts/verify-translations.js --dry-run
 *   node scripts/verify-translations.js --lang en     # only English entries
 *   node scripts/verify-translations.js --lang sr     # only Serbian entries
 *   node scripts/verify-translations.js --resume      # skip already-checked batches
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { openDb, ROOT } from './lib/db.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BATCH_SIZE = 25;
const DELAY_MS = 800;
const MAX_RETRIES = 3;
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8192;
const REPORT_PATH = join(ROOT, 'data', 'translation-issues.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');
const langIdx = args.indexOf('--lang');
const LANG_FILTER = langIdx !== -1 ? args[langIdx + 1] : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(entries) {
  const items = entries.map((e) => ({
    id: e.id,
    term: e.term,
    source_language: e.source_language,
    translation_en: e.translation_en,
    translation_sr: e.translation_sr,
    translation_ru: e.translation_ru,
  }));

  return `You are an expert trilingual reviewer (English, Serbian Latin script, Russian).

Review each vocabulary entry below. Flag ONLY entries with real problems. Return a JSON array of issues found.

For each issue, return:
{
  "id": "entry id",
  "field": "which field has the problem (translation_en, translation_sr, translation_ru, term)",
  "issue": "wrong|inaccurate|wrong_script|mixed_language|typo|not_vocabulary",
  "current": "current value",
  "suggested": "corrected value or null if should be deleted",
  "reason": "brief explanation"
}

Issue types:
- "wrong": translation is completely wrong (different meaning)
- "inaccurate": translation is misleading or too loose
- "wrong_script": Serbian should be Latin script (čćšžđ), not Cyrillic; or language is wrong
- "mixed_language": field contains text from another language (e.g., English in Russian translation)
- "typo": spelling error in translation
- "not_vocabulary": term is garbage, too long sentence, emoji-heavy, or not a learnable vocabulary item

Rules:
- Do NOT flag entries just because translations are very literal — only flag if meaning is wrong.
- Do NOT flag phrases/idioms — they are valid vocabulary items.
- Serbian MUST use Latin script with proper diacritics (č, ć, š, ž, đ). Flag Cyrillic.
- Russian translations should be purely Russian. Flag any English/Latin mixed in.
- If no issues found, return an empty array: []
- Return ONLY valid JSON — no markdown, no explanation outside the array.

Entries to review:
${JSON.stringify(items, null, 2)}`;
}

function parseResponse(text) {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.warn('  Failed to parse response JSON, skipping batch');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Translation Verification ===');
  if (DRY_RUN) console.log('[DRY RUN — no API calls]\n');

  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error('Error: ANTHROPIC_API_KEY required. Set with: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const client = DRY_RUN ? null : new Anthropic();
  const db = openDb({ readonly: true });

  // Load entries
  let sql = 'SELECT * FROM vocabulary';
  const params = [];
  if (LANG_FILTER) {
    sql += ' WHERE source_language = ?';
    params.push(LANG_FILTER);
  }
  sql += ' ORDER BY id';

  const allEntries = db.prepare(sql).all(...params);
  db.close();

  console.log(`Entries to verify: ${allEntries.length}`);
  if (LANG_FILTER) console.log(`Language filter: ${LANG_FILTER}`);

  // Build batches
  const batches = [];
  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    batches.push(allEntries.slice(i, i + BATCH_SIZE));
  }
  console.log(`Batches: ${batches.length} × ${BATCH_SIZE}\n`);

  // Load existing results for resume
  let allIssues = [];
  let checkedIds = new Set();
  if (RESUME && existsSync(REPORT_PATH)) {
    const existing = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
    allIssues = existing.issues || [];
    checkedIds = new Set(existing.checked_ids || []);
    console.log(`Resuming: ${checkedIds.size} entries already checked, ${allIssues.length} issues found\n`);
  }

  if (DRY_RUN) {
    const unchecked = allEntries.filter((e) => !checkedIds.has(e.id));
    console.log(`[DRY RUN] Would verify ${unchecked.length} entries in ${Math.ceil(unchecked.length / BATCH_SIZE)} batches.`);
    return;
  }

  let batchesProcessed = 0;
  let totalNewIssues = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Skip if all entries in batch already checked
    if (RESUME && batch.every((e) => checkedIds.has(e.id))) {
      continue;
    }

    // Filter to unchecked entries only
    const toCheck = RESUME ? batch.filter((e) => !checkedIds.has(e.id)) : batch;
    if (toCheck.length === 0) continue;

    console.log(`Batch ${i + 1}/${batches.length} (${toCheck.length} entries)...`);

    let response = [];
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const message = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: buildPrompt(toCheck) }],
        });

        response = parseResponse(message.content[0].text);
        break;
      } catch (err) {
        retries++;
        const waitMs = DELAY_MS * Math.pow(2, retries);
        console.log(`  Retry ${retries}/${MAX_RETRIES} after ${waitMs}ms: ${err.message}`);
        if (retries >= MAX_RETRIES) {
          console.log(`  FAILED batch — skipping`);
          break;
        }
        await sleep(waitMs);
      }
    }

    if (response.length > 0) {
      console.log(`  Found ${response.length} issue(s)`);
      allIssues.push(...response);
      totalNewIssues += response.length;
    }

    // Mark entries as checked
    for (const e of toCheck) {
      checkedIds.add(e.id);
    }

    batchesProcessed++;

    // Save progress after each batch
    const report = {
      generated_at: new Date().toISOString(),
      total_checked: checkedIds.size,
      total_entries: allEntries.length,
      total_issues: allIssues.length,
      checked_ids: [...checkedIds],
      issues: allIssues,
    };
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    // Rate limit
    if (i < batches.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Final summary
  console.log('\n=== Summary ===');
  console.log(`  Batches processed: ${batchesProcessed}`);
  console.log(`  Entries checked: ${checkedIds.size}/${allEntries.length}`);
  console.log(`  New issues found: ${totalNewIssues}`);
  console.log(`  Total issues: ${allIssues.length}`);
  console.log(`  Report: ${REPORT_PATH}`);

  // Issue breakdown
  if (allIssues.length > 0) {
    const byType = {};
    for (const issue of allIssues) {
      byType[issue.issue] = (byType[issue.issue] || 0) + 1;
    }
    console.log('\n  By issue type:');
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
