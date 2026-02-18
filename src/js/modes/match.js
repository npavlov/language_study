/**
 * MatchMode — match pairs game mode.
 *
 * Players tap a word on the left, then tap its translation on the right.
 * Correct pairs glow green and fade out; wrong pairs flash red.
 * Difficulty starts at 4 pairs and increases by 1 each round, capped at 8.
 */

const MIN_PAIRS = 4;
const MAX_PAIRS = 8;
const FADE_DELAY_MS = 500;
const ERROR_FLASH_MS = 600;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Shuffle an array in place using Fisher-Yates.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick `count` random items from `arr` without repetition.
 * @template T
 * @param {T[]} arr
 * @param {number} count
 * @returns {T[]}
 */
function pickRandom(arr, count) {
  return shuffle([...arr]).slice(0, count);
}

/**
 * Create a DOM element with optional class and text.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Format elapsed seconds as "M:SS".
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Extract the hint text for an entry given engine language settings.
 * @param {Object} entry
 * @param {import('../engine.js').GameEngine} engine
 * @returns {string}
 */
function getHintText(entry, engine) {
  return (
    entry.translations[engine.hintLang] ||
    entry.translations[engine.fallbackLang] ||
    entry.translations[engine.targetLang] ||
    entry.term
  );
}

/**
 * Extract the target-language display text for an entry.
 * @param {Object} entry
 * @param {import('../engine.js').GameEngine} engine
 * @returns {string}
 */
function getTargetText(entry, engine) {
  return entry.translations[engine.targetLang] || entry.term;
}

// ─── MatchMode ───────────────────────────────────────────────────────────────

export class MatchMode {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;
    /** @type {import('../engine.js').GameEngine|null} */
    this._engine = null;

    // Round state
    this._round = 0;          // 0-indexed round counter (determines pair count)
    this._pairs = [];         // [{id, target, hint}]
    this._remaining = new Set(); // ids still unmatched
    this._selected = null;    // { id, itemEl } of the currently selected left item

    // Stats
    this._wrongAttempts = 0;
    this._startTime = 0;
    this._timerInterval = null;
    this._elapsedSeconds = 0;

    // DOM refs
    this._timerEl = null;
    this._leftColEl = null;
    this._rightColEl = null;

    // Bound handler for event delegation
    this._onItemClick = this._onItemClick.bind(this);
  }

  /**
   * Attach the mode to a container and engine. Call before start().
   * @param {HTMLElement} container
   * @param {import('../engine.js').GameEngine} engine
   */
  init(container, engine) {
    this._container = container;
    this._engine = engine;
  }

  /**
   * Start (or restart) the mode from round 0.
   */
  start() {
    this._round = 0;
    this._wrongAttempts = 0;
    this._startRound();
  }

  /**
   * Clean up all DOM and timers. Safe to call multiple times.
   */
  destroy() {
    this._stopTimer();
    if (this._container) {
      this._container.innerHTML = '';
    }
    this._leftColEl = null;
    this._rightColEl = null;
    this._timerEl = null;
    this._selected = null;
    this._pairs = [];
    this._remaining = new Set();
  }

  // ─── Round lifecycle ───────────────────────────────────────────────────────

  /**
   * Begin a new round: pick pairs, render grid, start timer.
   */
  _startRound() {
    this._stopTimer();
    this._selected = null;
    this._elapsedSeconds = 0;

    const pairCount = Math.min(MIN_PAIRS + this._round, MAX_PAIRS);
    this._pairs = this._selectPairs(pairCount);
    this._remaining = new Set(this._pairs.map((p) => p.id));

    this._render();
    this._startTimer();
  }

  /**
   * Select `count` vocabulary entries and build pair descriptors.
   * @param {number} count
   * @returns {Array<{id: string, target: string, hint: string}>}
   */
  _selectPairs(count) {
    const engine = this._engine;
    const playable = engine.getPlayableEntries
      ? engine.getPlayableEntries()
      : engine.allEntries;

    const chosen = pickRandom(playable, count);

    return chosen.map((entry) => ({
      id: entry.id,
      target: getTargetText(entry, engine),
      hint: getHintText(entry, engine),
    }));
  }

  // ─── Timer ─────────────────────────────────────────────────────────────────

  _startTimer() {
    this._startTime = Date.now();
    this._timerInterval = setInterval(() => {
      this._elapsedSeconds = Math.floor((Date.now() - this._startTime) / 1000);
      if (this._timerEl) {
        this._timerEl.textContent = formatTime(this._elapsedSeconds);
      }
    }, 500);
  }

  _stopTimer() {
    if (this._timerInterval !== null) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  /**
   * Rebuild the entire game UI from scratch.
   */
  _render() {
    const container = this._container;
    container.innerHTML = '';

    const root = el('div', 'match');

    // Header: timer + round info
    const header = el('div', 'match__header');
    const roundLabel = el('span', 'match__round', `Round ${this._round + 1}`);
    this._timerEl = el('span', 'match__timer', '0:00');
    header.append(roundLabel, this._timerEl);
    root.append(header);

    // Two-column grid
    const grid = el('div', 'match__grid');

    this._leftColEl = el('div', 'match__column match__column--left');
    this._rightColEl = el('div', 'match__column match__column--right');

    // Left column: target-language words in original order
    for (const pair of this._pairs) {
      const item = this._makeItem(pair.id, pair.target, 'left');
      this._leftColEl.append(item);
    }

    // Right column: shuffled hint translations
    const shuffledPairs = shuffle([...this._pairs]);
    for (const pair of shuffledPairs) {
      const item = this._makeItem(pair.id, pair.hint, 'right');
      this._rightColEl.append(item);
    }

    grid.append(this._leftColEl, this._rightColEl);
    root.append(grid);

    // Single delegated click listener on the grid
    grid.addEventListener('click', this._onItemClick);

    container.append(root);
  }

  /**
   * Create a single tappable card item.
   * @param {string} pairId
   * @param {string} text
   * @param {'left'|'right'} side
   * @returns {HTMLButtonElement}
   */
  _makeItem(pairId, text, side) {
    const btn = document.createElement('button');
    btn.className = 'match__item';
    btn.dataset.id = pairId;
    btn.dataset.side = side;
    btn.textContent = text;
    btn.type = 'button';
    return btn;
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  /**
   * Delegated click handler for both columns.
   * @param {MouseEvent} evt
   */
  _onItemClick(evt) {
    const item = evt.target.closest('.match__item');
    if (!item) return;

    const id = item.dataset.id;
    const side = item.dataset.side;

    // Ignore already-matched items
    if (item.classList.contains('match__item--matched')) return;

    if (side === 'left') {
      this._handleLeftTap(id, item);
    } else {
      this._handleRightTap(id, item);
    }
  }

  /**
   * User tapped a left (target-language) card.
   * @param {string} id
   * @param {HTMLElement} item
   */
  _handleLeftTap(id, item) {
    // Deselect previous selection (if any)
    if (this._selected) {
      this._selected.itemEl.classList.remove('match__item--selected');
    }

    // Toggle off if tapping the same item again
    if (this._selected && this._selected.id === id) {
      this._selected = null;
      return;
    }

    item.classList.add('match__item--selected');
    this._selected = { id, itemEl: item };
  }

  /**
   * User tapped a right (hint-language) card.
   * @param {string} id
   * @param {HTMLElement} item
   */
  _handleRightTap(id, item) {
    if (!this._selected) return; // nothing selected on left yet

    const leftItem = this._selected.itemEl;
    const selectedId = this._selected.id;

    if (selectedId === id) {
      // Correct match
      this._confirmMatch(selectedId, leftItem, item);
    } else {
      // Wrong match
      this._wrongAttempts++;
      this._flashError(leftItem, item);
    }
  }

  /**
   * Mark a pair as correctly matched: green, then fade out.
   * @param {string} id
   * @param {HTMLElement} leftItem
   * @param {HTMLElement} rightItem
   */
  _confirmMatch(id, leftItem, rightItem) {
    this._selected = null;

    leftItem.classList.remove('match__item--selected');
    leftItem.classList.add('match__item--correct');
    rightItem.classList.add('match__item--correct');

    // Disable interaction immediately
    leftItem.disabled = true;
    rightItem.disabled = true;

    setTimeout(() => {
      leftItem.classList.add('match__item--matched');
      rightItem.classList.add('match__item--matched');

      this._remaining.delete(id);

      if (this._remaining.size === 0) {
        this._onAllMatched();
      }
    }, FADE_DELAY_MS);
  }

  /**
   * Flash both items red briefly then deselect.
   * @param {HTMLElement} leftItem
   * @param {HTMLElement} rightItem
   */
  _flashError(leftItem, rightItem) {
    leftItem.classList.remove('match__item--selected');
    leftItem.classList.add('match__item--wrong');
    rightItem.classList.add('match__item--wrong');

    this._selected = null;

    setTimeout(() => {
      leftItem.classList.remove('match__item--wrong');
      rightItem.classList.remove('match__item--wrong');
    }, ERROR_FLASH_MS);
  }

  // ─── Round completion ──────────────────────────────────────────────────────

  /**
   * Called when every pair in the current round has been matched.
   */
  _onAllMatched() {
    this._stopTimer();
    const elapsed = this._elapsedSeconds;

    // Short delay so final fade-out is visible before summary replaces grid
    setTimeout(() => this._renderSummary(elapsed), 300);
  }

  /**
   * Replace game grid with a round summary and "Next round" button.
   * @param {number} elapsed - seconds taken for this round
   */
  _renderSummary(elapsed) {
    const container = this._container;
    container.innerHTML = '';

    const summary = el('div', 'match__summary');

    const title = el('h2', 'match__summary-title', 'Round complete!');
    summary.append(title);

    const stats = el('dl', 'match__stats');

    const addStat = (label, value) => {
      const dt = el('dt', 'match__stat-label', label);
      const dd = el('dd', 'match__stat-value', value);
      stats.append(dt, dd);
    };

    addStat('Time', formatTime(elapsed));
    addStat('Wrong attempts', String(this._wrongAttempts));
    addStat('Pairs matched', String(this._pairs.length));

    summary.append(stats);

    const nextBtn = el('button', 'match__next-btn', 'Next round');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
      this._round++;
      this._startRound();
    });

    summary.append(nextBtn);
    container.append(summary);
  }
}
