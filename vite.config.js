import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Vite plugin: minify JSON in public/data/ during build.
 * Strips null values, empty arrays, and removes indentation.
 * Source files stay pretty-printed for readability.
 */
function minifyVocabularyPlugin() {
  return {
    name: 'minify-vocabulary',
    closeBundle() {
      const dataDir = join('dist', 'data');
      let totalSaved = 0;

      try {
        const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));

        for (const file of files) {
          const filePath = join(dataDir, file);
          const raw = readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);

          const minified = JSON.stringify(data, (key, val) => {
            if (val === null) return undefined;
            if (Array.isArray(val) && val.length === 0) return undefined;
            return val;
          });

          writeFileSync(filePath, minified, 'utf-8');
          const saved = raw.length - minified.length;
          totalSaved += saved;
          console.log(`  ${file}: ${(raw.length / 1024).toFixed(0)}KB → ${(minified.length / 1024).toFixed(0)}KB (-${(saved / 1024).toFixed(0)}KB)`);
        }

        console.log(`  Total saved: ${(totalSaved / 1024).toFixed(0)}KB`);
      } catch {
        // data dir may not exist in test builds
      }
    },
  };
}

export default defineConfig({
  base: '/language_study/',
  root: '.',
  build: {
    outDir: 'dist',
  },
  plugins: [minifyVocabularyPlugin()],
  test: {
    include: ['tests/**/*.test.js'],
  },
});
