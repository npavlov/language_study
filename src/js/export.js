/**
 * Excel export — lazy-loads SheetJS (xlsx) and exports vocabulary to .xlsx.
 *
 * Usage:
 *   import { exportToExcel } from './export.js';
 *   exportToExcel(entries, { categories: null }); // export all
 *   exportToExcel(entries, { categories: ['food', 'work'] }); // filtered
 */

/**
 * @param {Array} entries - merged vocabulary entries (built-in + user)
 * @param {Object} [options]
 * @param {string[]|null} [options.categories] - filter by categories; null = all
 */
export async function exportToExcel(entries, { categories = null } = {}) {
  const XLSX = await import('xlsx');

  let filtered = entries;
  if (categories && categories.length > 0) {
    const catSet = new Set(categories.map((c) => c.toLowerCase()));
    filtered = entries.filter(
      (e) => e.category && catSet.has(e.category.toLowerCase())
    );
  }

  const enEntries = filtered.filter((e) => e.source_language === 'en');
  const srEntries = filtered.filter((e) => e.source_language === 'sr');

  const enAoa = buildAoa(enEntries, 'en');
  const srAoa = buildAoa(srEntries, 'sr');

  const enWs = XLSX.utils.aoa_to_sheet(enAoa);
  const srWs = XLSX.utils.aoa_to_sheet(srAoa);

  // Auto-filter on header row
  enWs['!autofilter'] = { ref: `A1:I${enEntries.length + 1}` };
  srWs['!autofilter'] = { ref: `A1:I${srEntries.length + 1}` };

  // Column widths
  const colWidths = [20, 20, 20, 40, 40, 40, 40, 12, 10];
  enWs['!cols'] = colWidths.map((w) => ({ wch: Math.min(w, 60) }));
  srWs['!cols'] = colWidths.map((w) => ({ wch: Math.min(w, 60) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, enWs, 'English Words');
  XLSX.utils.book_append_sheet(wb, srWs, 'Serbian Words');

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const date = new Date().toISOString().split('T')[0];
  const filename = `language_study_vocabulary_${date}.xlsx`;
  triggerDownload(blob, filename);

  return { filename, enCount: enEntries.length, srCount: srEntries.length };
}

function buildAoa(entries, sourceLang) {
  const isEn = sourceLang === 'en';

  const headers = isEn
    ? ['Word (EN)', 'Serbian Translation', 'Russian Translation', 'Example (EN)', 'Example (SR)', 'Example (RU)', 'Explanation', 'Category', 'Difficulty']
    : ['Word (SR)', 'English Translation', 'Russian Translation', 'Example (SR)', 'Example (EN)', 'Example (RU)', 'Explanation', 'Category', 'Difficulty'];

  const rows = entries.map((entry) => {
    const t = entry.translations || {};
    const ex = entry.examples || { en: [], sr: [], ru: [] };

    if (isEn) {
      return [
        entry.term || '',
        t.sr || '',
        t.ru || '',
        joinExamples(ex.en),
        joinExamples(ex.sr),
        joinExamples(ex.ru),
        entry.explanation || '',
        entry.category || '',
        difficultyLabel(entry.difficulty),
      ];
    }
    return [
      entry.term || '',
      t.en || '',
      t.ru || '',
      joinExamples(ex.sr),
      joinExamples(ex.en),
      joinExamples(ex.ru),
      entry.explanation || '',
      entry.category || '',
      difficultyLabel(entry.difficulty),
    ];
  });

  return [headers, ...rows];
}

function joinExamples(arr) {
  if (!arr || arr.length === 0) return '';
  return arr.join('\n');
}

function difficultyLabel(level) {
  const labels = { 1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };
  return labels[level] || `Level ${level}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
