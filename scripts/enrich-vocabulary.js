#!/usr/bin/env node

/**
 * enrich-vocabulary.js — Use Claude API to fill missing translations,
 * examples, and explanations in the vocabulary database.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/enrich-vocabulary.js
 *   node scripts/enrich-vocabulary.js --dry-run
 */

import Anthropic from '@anthropic-ai/sdk';
import { openDb } from './lib/db.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BATCH_SIZE = 5;
const DELAY_MS = 600;
const MAX_RETRIES = 3;
const DRY_RUN = process.argv.includes('--dry-run');
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8192;

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
    existing_translations: {
      en: e.translation_en,
      sr: e.translation_sr,
      ru: e.translation_ru,
    },
    existing_explanation: e.explanation,
  }));

  return `You are a trilingual dictionary assistant for English, Serbian (Latin script), and Russian.

For each vocabulary entry below, provide the missing data. Return ONLY a JSON array with objects matching this structure:

{
  "id": "the entry id",
  "translations": { "en": "...", "sr": "...", "ru": "..." },
  "examples": {
    "en": ["One example sentence in English"],
    "sr": ["One example sentence in Serbian (Latin script)"],
    "ru": ["One example sentence in Russian"]
  },
  "explanation": "Brief definition/explanation in Russian (2-3 sentences max)"
}

Rules:
- Keep existing translations that are already provided (non-null). Only fill in null ones.
- Serbian must use Latin script (with diacritics: č, ć, š, ž, đ), NOT Cyrillic.
- Examples should be natural, everyday sentences showing the word in context.
- Explanation should be in Russian, concise, and helpful for a learner.
- If the term is a full sentence or phrase, translate the whole phrase.
- Return valid JSON only — no markdown, no extra text.

Entries to enrich:
${JSON.stringify(items, null, 2)}`;
}

function parseResponse(text) {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in response');
  return JSON.parse(jsonMatch[0]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Language Study AI Enrichment ===');

  if (DRY_RUN) {
    console.log('[DRY RUN MODE — no API calls will be made]\n');
  }

  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
    console.error('Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const client = DRY_RUN ? null : new Anthropic();
  const db = openDb();

  // Find entries needing enrichment
  const toEnrich = db.prepare(`
    SELECT * FROM vocabulary WHERE enriched = 0
    ORDER BY source_language, id
  `).all();

  console.log(`Total entries: ${db.prepare('SELECT COUNT(*) as n FROM vocabulary').get().n}`);
  console.log(`Need enrichment: ${toEnrich.length}`);
  console.log(`Already enriched: ${db.prepare('SELECT COUNT(*) as n FROM vocabulary WHERE enriched = 1').get().n}`);

  if (toEnrich.length === 0) {
    console.log('Nothing to do.');
    db.close();
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would process ${toEnrich.length} entries in ${Math.ceil(toEnrich.length / BATCH_SIZE)} batches.`);
    db.close();
    return;
  }

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE vocabulary SET
      translation_en = @translation_en,
      translation_sr = @translation_sr,
      translation_ru = @translation_ru,
      examples_en = @examples_en,
      examples_sr = @examples_sr,
      examples_ru = @examples_ru,
      explanation = @explanation,
      enriched = 1,
      enriched_at = @enriched_at
    WHERE id = @id
  `);

  // Process in batches
  const batches = [];
  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    batches.push(toEnrich.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} entries...`);

  let processed = 0;
  let failed = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`Batch ${batchIdx + 1}/${batches.length} (${batch.length} entries)...`);

    let response;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const message = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: buildPrompt(batch) }],
        });

        const text = message.content[0].text;
        response = parseResponse(text);
        break;
      } catch (err) {
        retries++;
        const waitMs = DELAY_MS * Math.pow(2, retries);
        console.log(`  Retry ${retries}/${MAX_RETRIES} after ${waitMs}ms: ${err.message}`);
        if (retries >= MAX_RETRIES) {
          console.log(`  FAILED batch ${batchIdx + 1}`);
          failed++;
          break;
        }
        await sleep(waitMs);
      }
    }

    if (response) {
      const enrichMap = new Map(response.map((r) => [r.id, r]));
      const now = new Date().toISOString();

      const applyBatch = db.transaction(() => {
        for (const row of batch) {
          const enriched = enrichMap.get(row.id);
          if (!enriched) continue;

          // Merge translations: keep existing, fill nulls
          const translation_en = row.translation_en ?? enriched.translations?.en ?? null;
          const translation_sr = row.translation_sr ?? enriched.translations?.sr ?? null;
          const translation_ru = row.translation_ru ?? enriched.translations?.ru ?? null;

          // Merge examples: append new, avoid duplicates
          const existEn = JSON.parse(row.examples_en);
          const existSr = JSON.parse(row.examples_sr);
          const existRu = JSON.parse(row.examples_ru);

          for (const ex of enriched.examples?.en ?? []) {
            if (!existEn.includes(ex)) existEn.push(ex);
          }
          for (const ex of enriched.examples?.sr ?? []) {
            if (!existSr.includes(ex)) existSr.push(ex);
          }
          for (const ex of enriched.examples?.ru ?? []) {
            if (!existRu.includes(ex)) existRu.push(ex);
          }

          const explanation = row.explanation ?? enriched.explanation ?? null;

          updateStmt.run({
            id: row.id,
            translation_en,
            translation_sr,
            translation_ru,
            examples_en: JSON.stringify(existEn),
            examples_sr: JSON.stringify(existSr),
            examples_ru: JSON.stringify(existRu),
            explanation,
            enriched_at: now,
          });
          processed++;
        }
      });

      applyBatch();
    }

    // Rate limit delay
    if (batchIdx < batches.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  db.close();

  console.log('\n=== Summary ===');
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed batches: ${failed}`);
  console.log('  Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
