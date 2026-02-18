#!/usr/bin/env node

/**
 * db-export.js — Export SQLite vocabulary to JSON files for browser runtime.
 *
 * Reads data/vocabulary.db and generates:
 *   public/data/vocabulary-en.json
 *   public/data/vocabulary-sr.json
 *
 * Output format is identical to the original JSON schema so browser code
 * needs zero changes.
 *
 * Usage:
 *   node scripts/db-export.js
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { openDb, rowToJsonEntry, ROOT } from './lib/db.js';

const OUTPUT_DIR = join(ROOT, 'public', 'data');

function exportToJson() {
  const db = openDb({ readonly: true });

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const languages = ['en', 'sr'];

  for (const lang of languages) {
    const rows = db.prepare(
      'SELECT * FROM vocabulary WHERE source_language = ? ORDER BY id'
    ).all(lang);

    const entries = rows.map(rowToJsonEntry);

    const output = {
      schema_version: '1.0',
      entries,
    };

    const filePath = join(OUTPUT_DIR, `vocabulary-${lang}.json`);
    writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
    console.log(`Exported ${entries.length} entries → ${filePath}`);
  }

  db.close();
  console.log('Export complete.');
}

exportToJson();
