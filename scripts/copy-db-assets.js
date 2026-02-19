#!/usr/bin/env node

/**
 * copy-db-assets.js — Copy vocabulary.db and sql-wasm.wasm to public/data/.
 *
 * Run automatically before dev/build via predev/prebuild scripts.
 * Ensures the browser can fetch the SQLite database and WASM runtime.
 *
 * Usage:
 *   node scripts/copy-db-assets.js
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'public', 'data');

const assets = [
  {
    src: join(ROOT, 'data', 'vocabulary.db'),
    dest: join(OUTPUT_DIR, 'vocabulary.db'),
    label: 'vocabulary.db',
  },
  {
    src: join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    dest: join(OUTPUT_DIR, 'sql-wasm.wasm'),
    label: 'sql-wasm.wasm',
  },
];

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (const { src, dest, label } of assets) {
  if (!existsSync(src)) {
    console.error(`Missing: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Copied ${label} → ${dest}`);
}

console.log('Assets ready.');
