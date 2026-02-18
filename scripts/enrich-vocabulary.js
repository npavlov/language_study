#!/usr/bin/env node

/**
 * enrich-vocabulary.js — Use Claude API to fill missing translations,
 * examples, and explanations in vocabulary JSON files.
 *
 * Usage:
 *   node scripts/enrich-vocabulary.js
 *   node scripts/enrich-vocabulary.js --dry-run
 *   ANTHROPIC_API_KEY=sk-... node scripts/enrich-vocabulary.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

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

function needsEnrichment(entry) {
  if (entry.enriched) return false;
  const t = entry.translations;
  const hasAllTranslations = t.en && t.sr && t.ru;
  const hasExamples = entry.examples.en.length > 0 && entry.examples.sr.length > 0 && entry.examples.ru.length > 0;
  const hasExplanation = entry.explanation;
  return !(hasAllTranslations && hasExamples && hasExplanation);
}

function buildPrompt(entries) {
  const items = entries.map((e) => ({
    id: e.id,
    term: e.term,
    source_language: e.source_language,
    existing_translations: e.translations,
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
  // Extract JSON array from response (handle possible markdown wrapping)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in response');
  return JSON.parse(jsonMatch[0]);
}

function applyEnrichment(entry, enriched) {
  // Merge translations — keep existing, fill nulls
  for (const lang of ['en', 'sr', 'ru']) {
    if (entry.translations[lang] === null && enriched.translations?.[lang]) {
      entry.translations[lang] = enriched.translations[lang];
    }
  }

  // Merge examples — append new, avoid duplicates
  for (const lang of ['en', 'sr', 'ru']) {
    if (enriched.examples?.[lang]) {
      for (const ex of enriched.examples[lang]) {
        if (!entry.examples[lang].includes(ex)) {
          entry.examples[lang].push(ex);
        }
      }
    }
  }

  // Set explanation if missing
  if (!entry.explanation && enriched.explanation) {
    entry.explanation = enriched.explanation;
  }

  entry.enriched = true;
  entry.metadata.enriched_at = new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function enrichFile(filePath, client) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const toEnrich = data.entries.filter(needsEnrichment);

  console.log(`\nFile: ${filePath}`);
  console.log(`  Total entries: ${data.entries.length}`);
  console.log(`  Need enrichment: ${toEnrich.length}`);
  console.log(`  Already enriched: ${data.entries.length - toEnrich.length}`);

  if (toEnrich.length === 0) {
    console.log('  Nothing to do.');
    return { processed: 0, failed: 0 };
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would process ${toEnrich.length} entries in ${Math.ceil(toEnrich.length / BATCH_SIZE)} batches.`);
    return { processed: 0, failed: 0 };
  }

  const errors = [];
  let processed = 0;
  const batches = [];

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    batches.push(toEnrich.slice(i, i + BATCH_SIZE));
  }

  console.log(`  Processing ${batches.length} batches of up to ${BATCH_SIZE} entries...`);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`  Batch ${batchIdx + 1}/${batches.length} (${batch.length} entries)...`);

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
        console.log(`    Retry ${retries}/${MAX_RETRIES} after ${waitMs}ms: ${err.message}`);
        if (retries >= MAX_RETRIES) {
          console.log(`    FAILED batch ${batchIdx + 1} — saving to errors.json`);
          errors.push({ batch: batchIdx, entries: batch.map((e) => e.id), error: err.message });
          break;
        }
        await sleep(waitMs);
      }
    }

    if (response) {
      // Apply enrichments
      const enrichMap = new Map(response.map((r) => [r.id, r]));
      for (const entry of batch) {
        const enriched = enrichMap.get(entry.id);
        if (enriched) {
          applyEnrichment(entry, enriched);
          processed++;
        }
      }

      // Save progress after each batch
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    // Rate limit delay
    if (batchIdx < batches.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Final save
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  if (errors.length > 0) {
    const errPath = join(dirname(filePath), 'errors.json');
    writeFileSync(errPath, JSON.stringify(errors, null, 2), 'utf-8');
    console.log(`  Errors saved to ${errPath}`);
  }

  return { processed, failed: errors.length };
}

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

  const enPath = join(projectRoot, 'data', 'vocabulary-en.json');
  const srPath = join(projectRoot, 'data', 'vocabulary-sr.json');

  const enResult = await enrichFile(enPath, client);
  const srResult = await enrichFile(srPath, client);

  const totalProcessed = enResult.processed + srResult.processed;
  const totalFailed = enResult.failed + srResult.failed;

  console.log('\n=== Summary ===');
  console.log(`  Processed: ${totalProcessed}`);
  console.log(`  Failed batches: ${totalFailed}`);
  console.log('  Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
