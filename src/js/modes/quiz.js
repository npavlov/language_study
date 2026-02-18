/**
 * QuizMode — multiple-choice quiz game mode.
 *
 * Responsibilities:
 * - Render quiz UI into a provided container
 * - Build 4-option questions (1 correct + 3 distractors from engine.allEntries)
 * - Handle answer selection with green/red feedback
 * - Track wrong attempts per question (max 2 before auto-advancing)
 * - Display score, progress bar, and end-of-session summary
 * - Emit no external events; fully self-contained DOM module
 *
 * BEM class naming: quiz, quiz__*, quiz--modifier
 */

import { t } from '../i18n.js';

// --- Constants ---------------------------------------------------------------

const OPTION_COUNT        = 4;
const AUTO_ADVANCE_MS     = 800;
const WRONG_LIMIT         = 2;

// --- Helpers -----------------------------------------------------------------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function el(tag, classes, text) {
  const node = document.createElement(tag);
  if (classes) {
    const list = Array.isArray(classes) ? classes : [classes];
    node.className = list.join(' ');
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function answerLang(engine) {
  return engine.hintLang;
}

function pickTranslation(entry, engine) {
  return (
    entry.translations?.[engine.hintLang] ||
    entry.translations?.[engine.fallbackLang] ||
    entry.term
  );
}

function buildDistractors(correctEntry, engine) {
  const correctTranslation = pickTranslation(correctEntry, engine);

  const sameGroup = engine.allEntries.filter(
    (e) =>
      e.id !== correctEntry.id &&
      pickTranslation(e, engine) !== correctTranslation &&
      (e.source_language === undefined ||
        e.source_language === correctEntry.source_language)
  );

  const otherGroup = engine.allEntries.filter(
    (e) =>
      e.id !== correctEntry.id &&
      pickTranslation(e, engine) !== correctTranslation &&
      !sameGroup.includes(e)
  );

  const combined = shuffle([...sameGroup, ...otherGroup]);
  const picked   = combined.slice(0, OPTION_COUNT - 1);

  while (picked.length < OPTION_COUNT - 1) {
    picked.push({ term: `—`, translations: {} });
  }

  return picked.map((e) => pickTranslation(e, engine));
}

// --- QuizMode Class ----------------------------------------------------------

export class QuizMode {
  constructor() {
    this._container = null;
    this._engine = null;

    this._scoreEl      = null;
    this._progressEl   = null;
    this._progressFill = null;
    this._termEl       = null;
    this._hintEl       = null;
    this._optionsEl    = null;
    this._rootEl       = null;

    this._wrongCount   = 0;
    this._currentEntry = null;
    this._options      = [];
    this._locked       = false;

    this._sessionWords = 0;
    this._mistakes     = [];

    this._boundOptionClick = null;
    this._advanceTimer     = null;
  }

  // --- Public API ------------------------------------------------------------

  init(container, engine) {
    this._container = container;
    this._engine    = engine;
  }

  start() {
    if (!this._container || !this._engine) {
      throw new Error('QuizMode: call init(container, engine) before start()');
    }

    this._container.innerHTML = '';
    this._mistakes    = [];
    this._wrongCount  = 0;
    this._locked      = false;

    this._rootEl = this._buildSkeleton();
    this._container.appendChild(this._rootEl);

    try {
      this._currentEntry = this._engine.startSession();
    } catch (err) {
      this._showError(err.message);
      return;
    }

    this._sessionWords = this._engine.session?.words?.length ?? 0;
    this._renderQuestion();
  }

  destroy() {
    if (this._advanceTimer !== null) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
    if (this._container) {
      this._container.innerHTML = '';
    }
    this._rootEl       = null;
    this._scoreEl      = null;
    this._progressEl   = null;
    this._progressFill = null;
    this._termEl       = null;
    this._hintEl       = null;
    this._optionsEl    = null;
    this._currentEntry = null;
  }

  // --- DOM Construction ------------------------------------------------------

  _buildSkeleton() {
    const root = el('div', 'quiz');

    // Header
    const header = el('div', 'quiz__header');

    // Back button
    const backBtn = el('button', 'quiz__back-btn', t.back_to_menu);
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    header.appendChild(backBtn);

    // Progress
    const progressWrap = el('div', 'quiz__progress-wrap');
    this._progressEl   = el('div', 'quiz__progress-label', `${t.question} 1 / ?`);
    const progressBar  = el('div', 'quiz__progress-bar');
    this._progressFill = el('div', 'quiz__progress-fill');
    progressBar.appendChild(this._progressFill);
    progressWrap.appendChild(this._progressEl);
    progressWrap.appendChild(progressBar);

    // Score
    this._scoreEl = el('div', 'quiz__score', `${t.score}: 0`);

    header.appendChild(progressWrap);
    header.appendChild(this._scoreEl);
    root.appendChild(header);

    // Question area
    const body = el('div', 'quiz__body');
    this._termEl = el('div', 'quiz__term', '…');
    this._hintEl = el('div', 'quiz__hint');
    this._hintEl.setAttribute('aria-live', 'polite');
    this._optionsEl = el('div', 'quiz__options');
    this._optionsEl.setAttribute('role', 'group');
    this._optionsEl.setAttribute('aria-label', 'Answer options');
    body.appendChild(this._termEl);
    body.appendChild(this._hintEl);
    body.appendChild(this._optionsEl);
    root.appendChild(body);

    return root;
  }

  // --- Question Rendering ----------------------------------------------------

  _renderQuestion() {
    const entry  = this._currentEntry;
    const engine = this._engine;

    this._wrongCount = 0;
    this._locked     = false;
    this._hintEl.textContent = '';
    this._hintEl.className   = 'quiz__hint';

    const idx   = engine.session?.currentIndex ?? 0;
    const total = this._sessionWords;
    const qNum  = idx + 1;
    this._progressEl.textContent = `${t.question} ${qNum} / ${total}`;
    const pct = total > 0 ? ((idx / total) * 100).toFixed(1) : 0;
    this._progressFill.style.width = `${pct}%`;
    this._progressFill.setAttribute('aria-valuenow', pct);

    this._termEl.textContent = entry.term;

    const correctLabel    = pickTranslation(entry, engine);
    const distractors     = buildDistractors(entry, engine);
    const optionLabels    = shuffle([correctLabel, ...distractors]);

    this._options = optionLabels.map((label) => ({
      label,
      correct: label === correctLabel,
    }));

    this._optionsEl.innerHTML = '';
    this._boundOptionClick    = this._handleOptionClick.bind(this);

    this._options.forEach((opt, i) => {
      const btn = el('button', 'quiz__option', opt.label);
      btn.type = 'button';
      btn.dataset.index = i;
      btn.addEventListener('click', this._boundOptionClick);
      this._optionsEl.appendChild(btn);
    });
  }

  // --- Interaction -----------------------------------------------------------

  _handleOptionClick(evt) {
    if (this._locked) return;
    const btn   = evt.currentTarget;
    const index = parseInt(btn.dataset.index, 10);
    const opt   = this._options[index];

    if (opt.correct) {
      this._onCorrect(btn);
    } else {
      this._onWrong(btn, index);
    }
  }

  _onCorrect(btn) {
    this._locked = true;
    const correctLabel = this._options.find((o) => o.correct)?.label ?? '';
    this._engine.checkAnswer(correctLabel, answerLang(this._engine));
    btn.classList.add('quiz__option--correct');
    const score = this._engine.session?.score ?? 0;
    this._scoreEl.textContent = `${t.score}: ${score}`;
    this._advanceTimer = setTimeout(() => {
      this._advanceTimer = null;
      this._advance();
    }, AUTO_ADVANCE_MS);
  }

  _onWrong(btn, _index) {
    this._wrongCount++;
    btn.classList.add('quiz__option--wrong');
    btn.disabled = true;
    this._engine.checkAnswer('__wrong__', answerLang(this._engine));
    const score = this._engine.session?.score ?? 0;
    this._scoreEl.textContent = `${t.score}: ${score}`;

    const hint = this._engine.getHint();
    if (hint) {
      this._hintEl.textContent = `${hint.lang.toUpperCase()}: ${hint.text}`;
      this._hintEl.className   = 'quiz__hint quiz__hint--visible';
    }

    if (this._wrongCount >= WRONG_LIMIT) {
      this._locked = true;
      this._revealCorrect();
      const correctLabel = this._options.find((o) => o.correct)?.label ?? '';
      const entry = this._currentEntry;
      const alreadyLogged = this._mistakes.some((m) => m.term === entry.term);
      if (!alreadyLogged) {
        this._mistakes.push({ term: entry.term, correctLabel });
      }
      this._advanceTimer = setTimeout(() => {
        this._advanceTimer = null;
        this._advance();
      }, AUTO_ADVANCE_MS * 2);
    }
  }

  _revealCorrect() {
    const buttons = this._optionsEl.querySelectorAll('.quiz__option');
    this._options.forEach((opt, i) => {
      if (opt.correct) {
        buttons[i].classList.add('quiz__option--correct');
      }
    });
  }

  _advance() {
    const next = this._engine.nextWord();
    if (!next || typeof next !== 'object' || !next.term) {
      const summary = typeof next === 'object' && next !== null && 'score' in next
        ? next
        : this._engine.endSession();
      this._showSummary(summary);
      return;
    }
    this._currentEntry = next;
    this._renderQuestion();
  }

  // --- Summary Screen --------------------------------------------------------

  _showSummary(summary) {
    if (!this._rootEl) return;
    this._rootEl.innerHTML = '';

    const wrap = el('div', 'quiz__summary');
    wrap.appendChild(el('h2', 'quiz__summary-title', t.session_complete));

    const stats = el('dl', 'quiz__summary-stats');
    const addStat = (label, value) => {
      stats.appendChild(el('dt', 'quiz__summary-stat-label', label));
      stats.appendChild(el('dd', 'quiz__summary-stat-value', String(value)));
    };
    addStat(t.final_score,  summary.score ?? 0);
    addStat(t.accuracy,     `${summary.accuracy ?? 0}%`);
    addStat(t.best_streak,  summary.bestStreak ?? 0);
    addStat(t.words_seen,   summary.totalWords ?? 0);
    addStat(t.correct,      summary.totalCorrect ?? 0);

    if (summary.elapsedTime) {
      const secs = Math.round(summary.elapsedTime / 1000);
      addStat(t.time, `${secs}s`);
    }

    wrap.appendChild(stats);

    if (this._mistakes.length > 0) {
      wrap.appendChild(el('h3', 'quiz__summary-mistakes-title', t.words_to_review));
      const list = el('ul', 'quiz__summary-mistakes');
      this._mistakes.forEach(({ term, correctLabel }) => {
        const item = el('li', 'quiz__summary-mistake');
        item.appendChild(el('span', 'quiz__summary-mistake-term', term));
        item.appendChild(el('span', 'quiz__summary-mistake-arrow', ' → '));
        item.appendChild(el('span', 'quiz__summary-mistake-answer', correctLabel));
        list.appendChild(item);
      });
      wrap.appendChild(list);
    } else {
      wrap.appendChild(el('p', 'quiz__summary-perfect', t.perfect_round));
    }

    const replayBtn = el('button', 'quiz__replay', t.play_again);
    replayBtn.type  = 'button';
    replayBtn.addEventListener('click', () => this.start());
    wrap.appendChild(replayBtn);

    const menuBtn = el('button', 'quiz__menu-btn', t.back_to_menu);
    menuBtn.type = 'button';
    menuBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    wrap.appendChild(menuBtn);

    this._rootEl.appendChild(wrap);
  }

  // --- Error State -----------------------------------------------------------

  _showError(message) {
    if (!this._rootEl) return;
    this._rootEl.innerHTML = '';
    const errEl = el('div', 'quiz__error', `Error: ${message}`);
    this._rootEl.appendChild(errEl);
  }
}
