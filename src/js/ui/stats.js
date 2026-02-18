// stats.js — StatsScreen UI component
// Vanilla ES module. All DOM created programmatically. BEM class names from components.css.

import { loadProgress, resetProgress, exportProgress } from '../progress.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}

function pct(num, den) {
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  // YYYY-MM-DD → readable short date
  const [y, m, d] = isoStr.split('-');
  return `${Number(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${y}`;
}

function fmtDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ---------------------------------------------------------------------------
// Section renderers (each returns a DOM element)
// ---------------------------------------------------------------------------

function renderOverall(words) {
  const entries = Object.values(words);
  const total = entries.length;
  const counts = { new: 0, learning: 0, known: 0, mastered: 0 };
  for (const w of entries) counts[w.masteryLevel ?? 'new']++;

  const section = el('section', 'stats__section');

  const heading = el('h2', 'stats__heading', 'Overall progress');
  section.appendChild(heading);

  const summary = el('p', 'stats__summary',
    `${counts.mastered} / ${total} word${total !== 1 ? 's' : ''} mastered`);
  section.appendChild(summary);

  // Stacked mastery bar
  const bar = el('div', 'mastery-bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `new: ${counts.new}, learning: ${counts.learning}, known: ${counts.known}, mastered: ${counts.mastered}`);

  const levels = ['new', 'learning', 'known', 'mastered'];
  for (const level of levels) {
    const seg = el('div', `mastery-bar__segment mastery-bar__segment--${level}`);
    seg.style.width = total > 0 ? `${pct(counts[level], total)}%` : (level === 'new' ? '100%' : '0%');
    bar.appendChild(seg);
  }
  section.appendChild(bar);

  // Legend
  const legend = el('div', 'stats__legend');
  const labels = { new: 'New', learning: 'Learning', known: 'Known', mastered: 'Mastered' };
  for (const level of levels) {
    const item = el('span', `stats__legend-item stats__legend-item--${level}`,
      `${labels[level]}: ${counts[level]}`);
    legend.appendChild(item);
  }
  section.appendChild(legend);

  return section;
}

function renderAccuracy(words, sessions) {
  const section = el('section', 'stats__section');
  section.appendChild(el('h2', 'stats__heading', 'Accuracy'));

  // Overall accuracy across all words
  let totalAttempts = 0;
  let totalCorrect  = 0;
  for (const w of Object.values(words)) {
    totalAttempts += w.total ?? 0;
    totalCorrect  += w.correct ?? 0;
  }
  const overallPct = pct(totalCorrect, totalAttempts);
  section.appendChild(el('p', 'stats__summary', `${overallPct}% overall accuracy`));

  // Bar chart of last 10 sessions
  const recent = sessions.slice(-10);
  if (recent.length > 0) {
    section.appendChild(el('p', 'stats__label', 'Last sessions'));
    const chart = el('div', 'bar-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', 'Bar chart of recent session accuracy');
    for (const s of recent) {
      const sessionPct = pct(s.score, s.total || 1);
      const bar = el('div', 'bar-chart__bar');
      // Height proportional to accuracy (0–100 %)
      bar.style.height = `${sessionPct}%`;
      bar.title = `${s.date}: ${s.score}/${s.total} (${sessionPct}%)`;
      // Colour hint via inline opacity so the primary-light base colour shines through
      bar.style.opacity = String(0.4 + (sessionPct / 100) * 0.6);
      chart.appendChild(bar);
    }
    section.appendChild(chart);
  } else {
    section.appendChild(el('p', 'stats__empty', 'No sessions recorded yet.'));
  }

  return section;
}

function renderStreak(streakDays, lastSessionDate) {
  const section = el('section', 'stats__section');
  section.appendChild(el('h2', 'stats__heading', 'Streak'));

  const streakEl = el('p', 'stats__streak');
  const flame = el('span', 'stats__streak-icon', '🔥');
  streakEl.appendChild(flame);
  streakEl.appendChild(document.createTextNode(` ${streakDays} day${streakDays !== 1 ? 's' : ''}`));
  section.appendChild(streakEl);

  if (lastSessionDate) {
    section.appendChild(el('p', 'stats__label', `Last session: ${fmtDate(lastSessionDate)}`));
  }

  return section;
}

function renderWeakWords(words, onPractice) {
  const section = el('section', 'stats__section');
  section.appendChild(el('h2', 'stats__heading', 'Words to review'));

  const weak = Object.entries(words)
    .filter(([, w]) => (w.total ?? 0) >= 2 && pct(w.correct ?? 0, w.total) < 60)
    .sort(([, a], [, b]) => {
      const accA = pct(a.correct, a.total);
      const accB = pct(b.correct, b.total);
      return accA - accB; // lowest accuracy first
    })
    .slice(0, 20);

  if (weak.length === 0) {
    section.appendChild(el('p', 'stats__empty', 'No words need review — great work!'));
    return section;
  }

  const list = el('ul', 'word-list');
  for (const [id, w] of weak) {
    const item = el('li', 'word-list__item');
    const term = el('span', 'word-list__term', id);
    const acc  = el('span', 'badge', `${pct(w.correct, w.total)}%`);
    item.appendChild(term);
    item.appendChild(acc);
    list.appendChild(item);
  }
  section.appendChild(list);

  const btn = el('button', 'btn btn--primary btn--sm');
  btn.textContent = 'Practice these';
  btn.addEventListener('click', () => onPractice(weak.map(([id]) => id)));
  section.appendChild(btn);

  return section;
}

function renderRecentSessions(sessions) {
  const section = el('section', 'stats__section');
  section.appendChild(el('h2', 'stats__heading', 'Recent sessions'));

  const recent = sessions.slice(-5).reverse();

  if (recent.length === 0) {
    section.appendChild(el('p', 'stats__empty', 'No sessions recorded yet.'));
    return section;
  }

  const table = el('table', 'stats__table');
  table.setAttribute('role', 'table');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const col of ['Date', 'Score', 'Duration']) {
    const th = el('th', 'stats__th', col);
    th.setAttribute('scope', 'col');
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const s of recent) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'stats__td', fmtDate(s.date)));
    tr.appendChild(el('td', 'stats__td', `${s.score} / ${s.total}`));
    tr.appendChild(el('td', 'stats__td', fmtDuration(s.durationSeconds)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  section.appendChild(table);
  return section;
}

function renderActions(container, onReset) {
  const section = el('section', 'stats__section');
  section.appendChild(el('h2', 'stats__heading', 'Actions'));

  const row = el('div', 'stats__actions');

  // Export button
  const exportBtn = el('button', 'btn btn--outline', 'Export JSON');
  exportBtn.addEventListener('click', () => {
    const json = exportProgress();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `language-study-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Reset button
  const resetBtn = el('button', 'btn btn--danger', 'Reset progress');
  resetBtn.addEventListener('click', () => {
    if (window.confirm('Reset all progress? This cannot be undone.')) {
      resetProgress();
      onReset();
    }
  });

  row.appendChild(exportBtn);
  row.appendChild(resetBtn);
  section.appendChild(row);

  return section;
}

// ---------------------------------------------------------------------------
// StatsScreen class
// ---------------------------------------------------------------------------

export class StatsScreen {
  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {HTMLElement|null} */
  #root = null;

  /**
   * Attach the screen to a container element. Must be called before show().
   *
   * @param {HTMLElement} container
   */
  init(container) {
    this.#container = container;
  }

  /**
   * Render (or re-render) and display the stats screen.
   */
  show() {
    if (!this.#container) throw new Error('StatsScreen: call init(container) before show()');

    // Tear down any previous render.
    this.#root?.remove();

    const progress = loadProgress();

    const root = el('div', 'screen screen--active stats');
    this.#root = root;

    // Header
    const header = el('header', 'header');
    header.appendChild(el('h1', 'header__title', 'Statistics'));
    root.appendChild(header);

    // Sections
    root.appendChild(renderOverall(progress.words));
    root.appendChild(renderAccuracy(progress.words, progress.sessions));
    root.appendChild(renderStreak(progress.streakDays, progress.lastSessionDate));

    root.appendChild(renderWeakWords(progress.words, (wordIds) => {
      // Emit a custom event so the host app can switch to practice mode.
      this.#container.dispatchEvent(new CustomEvent('stats:practice-weak', {
        bubbles: true,
        detail: { wordIds },
      }));
    }));

    root.appendChild(renderRecentSessions(progress.sessions));

    root.appendChild(renderActions(root, () => {
      // After reset, re-render with fresh (empty) data.
      this.show();
    }));

    this.#container.appendChild(root);
  }

  /**
   * Hide the stats screen without destroying it.
   */
  hide() {
    if (this.#root) {
      this.#root.classList.remove('screen--active');
    }
  }

  /**
   * Remove the stats DOM and release references.
   */
  destroy() {
    this.#root?.remove();
    this.#root = null;
    this.#container = null;
  }
}
