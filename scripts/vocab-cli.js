#!/usr/bin/env node

/**
 * vocab-cli.js — CLI for vocabulary CRUD operations.
 *
 * Commands:
 *   add     --term "word" --lang en [--translation-sr "..."] [--translation-ru "..."]
 *   remove  --id en-0042            (or --term "word" --lang en)
 *   edit    --id en-0042 --field value  (e.g. --difficulty 4 --category "food")
 *   search  <query>                 (full-text search across term + translations)
 *   list    [--lang en|sr] [--enriched 0|1] [--limit 20]
 *   stats                           (counts, enrichment %, difficulty distribution)
 *   export                          (regenerate JSON from DB)
 *
 * Usage:
 *   node scripts/vocab-cli.js search "persevere"
 *   node scripts/vocab-cli.js add --term "hello" --lang en --translation-sr "zdravo" --translation-ru "привет"
 *   node scripts/vocab-cli.js remove --id en-0042
 *   node scripts/vocab-cli.js stats
 */

import { execFileSync } from 'child_process';
import { openDb, jsonEntryToRow, UPSERT_SQL, ROOT } from './lib/db.js';

const args = process.argv.slice(2);
const command = args[0];

function getFlag(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdAdd() {
  const term = getFlag('--term');
  const lang = getFlag('--lang');
  if (!term || !lang) {
    console.error('Usage: vocab add --term "word" --lang en|sr [options]');
    console.error('Options: --translation-en, --translation-sr, --translation-ru, --difficulty, --category');
    process.exit(1);
  }

  const db = openDb();

  // Generate next ID
  const maxRow = db.prepare(
    "SELECT id FROM vocabulary WHERE source_language = ? ORDER BY id DESC LIMIT 1"
  ).get(lang);

  let nextNum = 1;
  if (maxRow) {
    const match = maxRow.id.match(/\d+/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }
  const id = `${lang}-${String(nextNum).padStart(4, '0')}`;

  const entry = {
    id,
    term,
    source_language: lang,
    type: term.includes(' ') ? 'phrase' : 'word',
    translations: {
      en: lang === 'en' ? null : (getFlag('--translation-en') || null),
      sr: lang === 'sr' ? null : (getFlag('--translation-sr') || null),
      ru: getFlag('--translation-ru') || null,
    },
    examples: { en: [], sr: [], ru: [] },
    explanation: getFlag('--explanation') || null,
    pronunciation: null,
    category: getFlag('--category') || null,
    tags: [],
    difficulty: parseInt(getFlag('--difficulty') || '3', 10),
    enriched: false,
    metadata: {
      date_added: new Date().toISOString().split('T')[0],
      source_file: 'vocab-cli',
      reviewed: false,
    },
  };

  db.prepare(UPSERT_SQL).run(jsonEntryToRow(entry));
  db.close();

  console.log(`Added: ${id} "${term}" (${lang})`);
}

function cmdRemove() {
  const id = getFlag('--id');
  const term = getFlag('--term');
  const lang = getFlag('--lang');

  const db = openDb();

  if (id) {
    const existing = db.prepare('SELECT id, term FROM vocabulary WHERE id = ?').get(id);
    if (!existing) {
      console.error(`Entry not found: ${id}`);
      db.close();
      process.exit(1);
    }
    db.prepare('DELETE FROM vocabulary WHERE id = ?').run(id);
    console.log(`Removed: ${existing.id} "${existing.term}"`);
  } else if (term && lang) {
    const rows = db.prepare(
      'SELECT id, term FROM vocabulary WHERE LOWER(term) = LOWER(?) AND source_language = ?'
    ).all(term, lang);
    if (rows.length === 0) {
      console.error(`No entry found for "${term}" (${lang})`);
      db.close();
      process.exit(1);
    }
    const deleteStmt = db.prepare('DELETE FROM vocabulary WHERE id = ?');
    for (const row of rows) {
      deleteStmt.run(row.id);
      console.log(`Removed: ${row.id} "${row.term}"`);
    }
  } else {
    console.error('Usage: vocab remove --id <id>  OR  vocab remove --term "word" --lang en|sr');
    process.exit(1);
  }

  db.close();
}

function cmdEdit() {
  const id = getFlag('--id');
  if (!id) {
    console.error('Usage: vocab edit --id <id> --field value');
    console.error('Fields: --term, --difficulty, --category, --translation-en, --translation-sr, --translation-ru, --explanation');
    process.exit(1);
  }

  const db = openDb();
  const existing = db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(id);
  if (!existing) {
    console.error(`Entry not found: ${id}`);
    db.close();
    process.exit(1);
  }

  const updates = {};
  const fieldMap = {
    '--term': 'term',
    '--difficulty': 'difficulty',
    '--category': 'category',
    '--translation-en': 'translation_en',
    '--translation-sr': 'translation_sr',
    '--translation-ru': 'translation_ru',
    '--explanation': 'explanation',
    '--type': 'type',
  };

  for (const [flag, col] of Object.entries(fieldMap)) {
    const val = getFlag(flag);
    if (val !== null) {
      updates[col] = col === 'difficulty' ? parseInt(val, 10) : val;
    }
  }

  if (Object.keys(updates).length === 0) {
    console.error('No fields to update. Use --term, --difficulty, --category, etc.');
    db.close();
    process.exit(1);
  }

  const setClauses = Object.keys(updates).map((col) => `${col} = @${col}`).join(', ');
  db.prepare(`UPDATE vocabulary SET ${setClauses} WHERE id = @id`).run({ ...updates, id });
  db.close();

  console.log(`Updated ${id}:`);
  for (const [col, val] of Object.entries(updates)) {
    console.log(`  ${col}: ${existing[col]} → ${val}`);
  }
}

function cmdSearch() {
  const query = args.slice(1).join(' ');
  if (!query) {
    console.error('Usage: vocab search <query>');
    process.exit(1);
  }

  const db = openDb({ readonly: true });

  // Try FTS first
  let results;
  try {
    results = db.prepare(`
      SELECT v.id, v.term, v.source_language, v.translation_en, v.translation_sr, v.translation_ru, v.difficulty
      FROM vocabulary_fts fts
      JOIN vocabulary v ON v.rowid = fts.rowid
      WHERE vocabulary_fts MATCH ?
      LIMIT 20
    `).all(query);
  } catch {
    // FTS query syntax error — fall back to LIKE
    const like = `%${query}%`;
    results = db.prepare(`
      SELECT id, term, source_language, translation_en, translation_sr, translation_ru, difficulty
      FROM vocabulary
      WHERE term LIKE ? OR translation_en LIKE ? OR translation_sr LIKE ? OR translation_ru LIKE ?
      LIMIT 20
    `).all(like, like, like, like);
  }

  db.close();

  if (results.length === 0) {
    console.log(`No results for "${query}".`);
    return;
  }

  console.log(`Found ${results.length} result(s) for "${query}":\n`);
  for (const r of results) {
    const translations = [
      r.translation_en ? `en: ${r.translation_en}` : null,
      r.translation_sr ? `sr: ${r.translation_sr}` : null,
      r.translation_ru ? `ru: ${r.translation_ru}` : null,
    ].filter(Boolean).join(', ');
    console.log(`  ${r.id} [${r.source_language}] "${r.term}" (d${r.difficulty})`);
    console.log(`    ${translations}`);
  }
}

function cmdList() {
  const lang = getFlag('--lang');
  const enriched = getFlag('--enriched');
  const limit = parseInt(getFlag('--limit') || '20', 10);

  const db = openDb({ readonly: true });

  let sql = 'SELECT id, term, source_language, translation_en, translation_sr, translation_ru, difficulty, enriched FROM vocabulary WHERE 1=1';
  const params = [];

  if (lang) {
    sql += ' AND source_language = ?';
    params.push(lang);
  }
  if (enriched !== null) {
    sql += ' AND enriched = ?';
    params.push(parseInt(enriched, 10));
  }

  sql += ' ORDER BY id LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  db.close();

  console.log(`Showing ${rows.length} entries:\n`);
  for (const r of rows) {
    const en = r.translation_en ? `en:${r.translation_en}` : '';
    const sr = r.translation_sr ? `sr:${r.translation_sr}` : '';
    const ru = r.translation_ru ? `ru:${r.translation_ru}` : '';
    const trans = [en, sr, ru].filter(Boolean).join(' | ');
    console.log(`  ${r.id} [${r.source_language}] "${r.term}" d${r.difficulty} ${r.enriched ? '✓' : '○'}`);
    if (trans) console.log(`    ${trans}`);
  }
}

function cmdStats() {
  const db = openDb({ readonly: true });

  const total = db.prepare('SELECT COUNT(*) as n FROM vocabulary').get().n;
  const byLang = db.prepare('SELECT source_language, COUNT(*) as n FROM vocabulary GROUP BY source_language').all();
  const enrichedCount = db.prepare('SELECT COUNT(*) as n FROM vocabulary WHERE enriched = 1').get().n;
  const byDifficulty = db.prepare('SELECT difficulty, COUNT(*) as n FROM vocabulary GROUP BY difficulty ORDER BY difficulty').all();
  const byType = db.prepare('SELECT type, COUNT(*) as n FROM vocabulary GROUP BY type').all();

  db.close();

  console.log('=== Vocabulary Stats ===\n');
  console.log(`Total entries: ${total}`);
  console.log(`Enriched: ${enrichedCount} (${total > 0 ? Math.round(enrichedCount / total * 100) : 0}%)`);
  console.log('\nBy language:');
  for (const r of byLang) console.log(`  ${r.source_language}: ${r.n}`);
  console.log('\nBy difficulty:');
  for (const r of byDifficulty) console.log(`  d${r.difficulty}: ${r.n}`);
  console.log('\nBy type:');
  for (const r of byType) console.log(`  ${r.type}: ${r.n}`);
}

function cmdExport() {
  console.log('Copying DB assets to public/data/...');
  execFileSync('node', ['scripts/copy-db-assets.js'], { cwd: ROOT, stdio: 'inherit' });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
const commands = {
  add: cmdAdd,
  remove: cmdRemove,
  edit: cmdEdit,
  search: cmdSearch,
  list: cmdList,
  stats: cmdStats,
  export: cmdExport,
};

if (!command || !commands[command]) {
  console.log('vocab-cli — Vocabulary management tool\n');
  console.log('Commands:');
  console.log('  add      Add a new entry');
  console.log('  remove   Remove an entry by ID or term');
  console.log('  edit     Edit fields of an existing entry');
  console.log('  search   Full-text search across terms and translations');
  console.log('  list     List entries with optional filters');
  console.log('  stats    Show vocabulary statistics');
  console.log('  export   Regenerate JSON files from database');
  console.log('\nRun "node scripts/vocab-cli.js <command>" for command-specific help.');
  process.exit(command ? 1 : 0);
}

commands[command]();
