/**
 * MatchMode — match pairs game mode.
 *
 * Players tap a word on the left, then tap its translation on the right.
 * Correct pairs glow green and fade out; wrong pairs flash red.
 * Difficulty starts at 4 pairs and increases by 1 each round, capped at 8.
 */

import { t } from '../i18n.js';

const MIN_PAIRS = 4;
const MAX_PAIRS = 8;
const FADE_DELAY_MS = 500;
const ERROR_FLASH_MS = 600;

// --- Helpers -----------------------------------------------------------------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr, count) {
  return shuffle([...arr]).slice(0, count);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getHintText(entry, engine) {
  return (
    entry.translations[engine.hintLang] ||
    entry.translations[engine.fallbackLang] ||
    entry.translations[engine.targetLang] ||
    entry.term
  );
}

function getTargetText(entry, engine) {
  return entry.translations[engine.targetLang] || entry.term;
}

// --- MatchMode ---------------------------------------------------------------

export class MatchMode {
  constructor() {
    this._container = null;
    this._engine = null;

    this._round = 0;
    this._pairs = [];
    this._remaining = new Set();
    this._selected = null;

    this._wrongAttempts = 0;
    this._startTime = 0;
    this._timerInterval = null;
    this._elapsedSeconds = 0;

    this._timerEl = null;
    this._leftColEl = null;
    this._rightColEl = null;

    this._onItemClick = this._onItemClick.bind(this);
  }

  init(container, engine) {
    this._container = container;
    this._engine = engine;
  }

  start() {
    this._round = 0;
    this._wrongAttempts = 0;
    this._startRound();
  }

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

  // --- Round lifecycle -------------------------------------------------------

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

  // --- Timer -----------------------------------------------------------------

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

  // --- Rendering -------------------------------------------------------------

  _render() {
    const container = this._container;
    container.innerHTML = '';

    const root = el('div', 'match');

    // Header: back button + round + timer
    const header = el('div', 'match__header');

    const backBtn = el('button', 'match__back-btn', t.back_to_menu);
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    header.appendChild(backBtn);

    const roundLabel = el('span', 'match__round', `${t.round} ${this._round + 1}`);
    this._timerEl = el('span', 'match__timer', '0:00');
    header.append(roundLabel, this._timerEl);
    root.append(header);

    // Two-column grid
    const grid = el('div', 'match__grid');

    this._leftColEl = el('div', 'match__column match__column--left');
    this._rightColEl = el('div', 'match__column match__column--right');

    for (const pair of this._pairs) {
      const item = this._makeItem(pair.id, pair.target, 'left');
      this._leftColEl.append(item);
    }

    const shuffledPairs = shuffle([...this._pairs]);
    for (const pair of shuffledPairs) {
      const item = this._makeItem(pair.id, pair.hint, 'right');
      this._rightColEl.append(item);
    }

    grid.append(this._leftColEl, this._rightColEl);
    root.append(grid);

    grid.addEventListener('click', this._onItemClick);
    container.append(root);
  }

  _makeItem(pairId, text, side) {
    const btn = document.createElement('button');
    btn.className = 'match__item';
    btn.dataset.id = pairId;
    btn.dataset.side = side;
    btn.textContent = text;
    btn.type = 'button';
    return btn;
  }

  // --- Interaction -----------------------------------------------------------

  _onItemClick(evt) {
    const item = evt.target.closest('.match__item');
    if (!item) return;

    const id = item.dataset.id;
    const side = item.dataset.side;

    if (item.classList.contains('match__item--matched')) return;

    if (side === 'left') {
      this._handleLeftTap(id, item);
    } else {
      this._handleRightTap(id, item);
    }
  }

  _handleLeftTap(id, item) {
    if (this._selected) {
      this._selected.itemEl.classList.remove('match__item--selected');
    }
    if (this._selected && this._selected.id === id) {
      this._selected = null;
      return;
    }
    item.classList.add('match__item--selected');
    this._selected = { id, itemEl: item };
  }

  _handleRightTap(id, item) {
    if (!this._selected) return;

    const leftItem = this._selected.itemEl;
    const selectedId = this._selected.id;

    if (selectedId === id) {
      this._confirmMatch(selectedId, leftItem, item);
    } else {
      this._wrongAttempts++;
      this._flashError(leftItem, item);
    }
  }

  _confirmMatch(id, leftItem, rightItem) {
    this._selected = null;
    leftItem.classList.remove('match__item--selected');
    leftItem.classList.add('match__item--correct');
    rightItem.classList.add('match__item--correct');
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

  // --- Round completion ------------------------------------------------------

  _onAllMatched() {
    this._stopTimer();
    const elapsed = this._elapsedSeconds;
    setTimeout(() => this._renderSummary(elapsed), 300);
  }

  _renderSummary(elapsed) {
    const container = this._container;
    container.innerHTML = '';

    const summary = el('div', 'match__summary');

    const title = el('h2', 'match__summary-title', t.round_complete);
    summary.append(title);

    const stats = el('dl', 'match__stats');
    const addStat = (label, value) => {
      const dt = el('dt', 'match__stat-label', label);
      const dd = el('dd', 'match__stat-value', value);
      stats.append(dt, dd);
    };

    addStat(t.time, formatTime(elapsed));
    addStat(t.wrong_attempts, String(this._wrongAttempts));
    addStat(t.pairs_matched, String(this._pairs.length));
    summary.append(stats);

    const nextBtn = el('button', 'match__next-btn', t.next_round);
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
      this._round++;
      this._startRound();
    });
    summary.append(nextBtn);

    const menuBtn = el('button', 'match__menu-btn', t.back_to_menu);
    menuBtn.type = 'button';
    menuBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    summary.append(menuBtn);

    container.append(summary);
  }
}
